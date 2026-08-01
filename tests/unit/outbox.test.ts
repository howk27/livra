// M9 Phase 4 Tasks 2-3 + Task 5 — the outbox guards.
//
// Spec guards 1 (double-flush), 2 (app kill mid-flush) and 4 (two same-day goal
// notes both survive) live here with the queue/flusher contracts they pin; guard
// 3 (a "today" read identical online and offline) lives with the read merge in
// offlineReadMerge.test.ts. Every guard was confirmed failing before being kept
// (see the injection notes on each).

import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient, onlineManager } from '@tanstack/react-query';
import { setSupabaseClientOverride } from '@/lib/supabase';
import {
  OUTBOX_STORAGE_KEY,
  enqueueOutboxEntry,
  removePendingOutboxEntry,
  pendingOutboxEntries,
  flushOutbox,
  clearOutboxAll,
  subscribeOutbox,
  __resetOutboxForTests,
  type OutboxEntry,
} from '@/lib/data/outbox';
import type { MarkEventRow, GoalNoteRow } from '@/lib/data/types';

const USER = '3fe1a23e-2ec2-4830-a68b-42b65fc3bcb0';
const MARK = 'a1b2c3d4-1111-4222-8333-444455556666';
const GOAL = 'c3d4e5f6-3333-4444-8555-666677778888';

type QueryResult = { data: unknown; error: unknown };

interface RecordedWrite {
  table: string;
  method: string;
  row: unknown;
}

/** Install a Supabase override whose insert/upsert responses come from `respond`,
 * recording every write so a test can assert what was — and was NOT — sent. */
function install(respond: (write: RecordedWrite) => QueryResult) {
  const writes: RecordedWrite[] = [];
  const builderFor = (table: string) => {
    const record = (method: string) => (row: unknown) => {
      const write = { table, method, row };
      writes.push(write);
      const result = respond(write);
      return {
        then: (resolve: (v: QueryResult) => unknown, reject?: (e: unknown) => unknown) =>
          Promise.resolve(result).then(resolve, reject),
      };
    };
    return { insert: record('insert'), upsert: record('upsert') };
  };
  const client = { from: (table: string) => builderFor(table) };
  setSupabaseClientOverride(client as unknown as Parameters<typeof setSupabaseClientOverride>[0]);
  return writes;
}

const ok: QueryResult = { data: null, error: null };
const refusedRls: QueryResult = { data: null, error: { code: '42501', message: 'permission denied' } };
const alreadyThere: QueryResult = { data: null, error: { code: '23505', message: 'duplicate key' } };
const networkDown: QueryResult = {
  data: null,
  error: new TypeError('Network request failed'),
};
const sessionGone: QueryResult = { data: null, error: { code: 'PGRST301', message: 'JWT expired' } };

function checkinRow(id: string, overrides: Partial<MarkEventRow> = {}): MarkEventRow {
  return {
    id,
    user_id: USER,
    mark_id: MARK,
    event_type: 'increment',
    amount: 1,
    occurred_at: '2026-07-31T10:00:00.000Z',
    occurred_local_date: '2026-07-31',
    meta: null,
    created_at: '2026-07-31T10:00:00.000Z',
    updated_at: '2026-07-31T10:00:00.000Z',
    deleted_at: null,
    ...overrides,
  };
}

function noteRow(id: string, overrides: Partial<GoalNoteRow> = {}): GoalNoteRow {
  return {
    id,
    user_id: USER,
    goal_id: GOAL,
    local_date: '2026-07-31',
    text: 'wrote this offline',
    created_at: '2026-07-31T10:00:00.000Z',
    updated_at: '2026-07-31T10:00:00.000Z',
    deleted_at: null,
    ...overrides,
  };
}

function checkinEntry(id: string): OutboxEntry {
  return { table: 'mark_events', row: checkinRow(id) };
}

const ID_A = 'e0000000-0000-4000-8000-00000000000a';
const ID_B = 'e0000000-0000-4000-8000-00000000000b';
const ID_C = 'e0000000-0000-4000-8000-00000000000c';

let client: QueryClient;

beforeEach(async () => {
  __resetOutboxForTests();
  await AsyncStorage.clear();
  onlineManager.setOnline(true);
  client = new QueryClient();
});

afterEach(() => {
  setSupabaseClientOverride(null);
  onlineManager.setOnline(true);
  jest.clearAllMocks();
});

describe('the queue', () => {
  it('persists an entry BEFORE the enqueue resolves — a kill right after the tap loses nothing', async () => {
    await enqueueOutboxEntry(checkinEntry(ID_A));
    const stored = JSON.parse((await AsyncStorage.getItem(OUTBOX_STORAGE_KEY)) ?? '[]');
    expect(stored).toHaveLength(1);
    expect(stored[0].row.id).toBe(ID_A);
  });

  it('appends — a second entry never replaces or mutates the first', async () => {
    await enqueueOutboxEntry(checkinEntry(ID_A));
    const firstSnapshot = pendingOutboxEntries();
    await enqueueOutboxEntry(checkinEntry(ID_B));
    expect(pendingOutboxEntries().map((e) => e.row.id)).toEqual([ID_A, ID_B]);
    // The earlier snapshot is untouched: changes replace the array, never edit it.
    expect(firstSnapshot.map((e) => e.row.id)).toEqual([ID_A]);
  });

  it('removePendingOutboxEntry unsends a queued row and reports an unknown id honestly', async () => {
    await enqueueOutboxEntry(checkinEntry(ID_A));
    expect(await removePendingOutboxEntry(ID_A)).toBe(true);
    expect(pendingOutboxEntries()).toHaveLength(0);
    expect(await removePendingOutboxEntry(ID_A)).toBe(false);
  });

  it('notifies subscribers on every change', async () => {
    const seen: number[] = [];
    subscribeOutbox(() => seen.push(pendingOutboxEntries().length));
    await enqueueOutboxEntry(checkinEntry(ID_A));
    await removePendingOutboxEntry(ID_A);
    expect(seen).toEqual([1, 0]);
  });

  it('clearOutboxAll (sign-out purge) empties memory and storage', async () => {
    await enqueueOutboxEntry(checkinEntry(ID_A));
    await clearOutboxAll();
    expect(pendingOutboxEntries()).toHaveLength(0);
    expect(await AsyncStorage.getItem(OUTBOX_STORAGE_KEY)).toBeNull();
  });
});

describe('corrupt persisted rows are dropped on load, not retried forever', () => {
  // The Phase 4 security Medium: a right-table right-id entry whose row lost
  // its required fields would rehydrate, fail its INSERT as `server` (23502),
  // be KEPT by OUTBOX_KEEP_ON_FAILURE, and retry at the backoff cadence
  // forever. The shape check must validate the FULL per-table row.
  it('drops entries whose rows are missing required columns; valid ones still flush', async () => {
    const corruptCheckin = { table: 'mark_events', row: { id: ID_B } };
    const corruptNote = { table: 'goal_notes', row: { id: ID_C, user_id: USER } };
    await AsyncStorage.setItem(
      OUTBOX_STORAGE_KEY,
      JSON.stringify([checkinEntry(ID_A), corruptCheckin, corruptNote]),
    );
    __resetOutboxForTests();
    const writes = install(() => ok);
    await flushOutbox(client);
    // Only the intact entry reached the server; the corrupt two are gone from
    // memory AND storage rather than queued behind a permanent 23502.
    expect(writes.map((w) => (w.row as { id: string }).id)).toEqual([ID_A]);
    expect(pendingOutboxEntries()).toHaveLength(0);
    const stored = JSON.parse((await AsyncStorage.getItem(OUTBOX_STORAGE_KEY)) ?? '[]');
    expect(stored).toHaveLength(0);
  });
});

describe('spec guard 1 — flushing twice does not double-count', () => {
  it('a flushed entry leaves the queue, so a second flush sends nothing', async () => {
    const writes = install(() => ok);
    await enqueueOutboxEntry(checkinEntry(ID_A));
    await flushOutbox(client);
    await flushOutbox(client);
    expect(writes).toHaveLength(1);
    expect(pendingOutboxEntries()).toHaveLength(0);
  });

  it('a replay the server has already seen (23505 on the shared primary key) is success, not a duplicate', async () => {
    // The kill-between-insert-and-removal case: the row landed, the removal did
    // not. The row id IS the primary key, so the re-send conflicts — and the
    // conflict proves the row is there. No dedupe bookkeeping exists to get wrong.
    const writes = install(() => alreadyThere);
    await enqueueOutboxEntry(checkinEntry(ID_A));
    await flushOutbox(client);
    expect(writes).toHaveLength(1);
    expect(pendingOutboxEntries()).toHaveLength(0); // treated as landed
  });
});

describe('spec guard 2 — the outbox survives an app kill mid-flush', () => {
  it('what did not land is still on disk for the next launch; what landed is gone', async () => {
    // Drain: A lands, then connectivity dies mid-drain and B fails transiently.
    const writes = install((w) =>
      (w.row as MarkEventRow).id === ID_A ? ok : networkDown,
    );
    await enqueueOutboxEntry(checkinEntry(ID_A));
    await enqueueOutboxEntry(checkinEntry(ID_B));
    await flushOutbox(client);
    expect(writes).toHaveLength(2);

    // "Kill the app": wipe module state, keep AsyncStorage (the device's disk).
    __resetOutboxForTests();

    // Next launch: the queue rehydrates exactly the entry that never landed.
    onlineManager.setOnline(false); // load without draining
    await flushOutbox(client);
    expect(pendingOutboxEntries().map((e) => e.row.id)).toEqual([ID_B]);
  });
});

describe('spec guard 4 — two goal notes written offline on the same day BOTH survive the flush', () => {
  it('sends one INSERT per note, never an upsert that would collapse the day', async () => {
    // Confirmed failing by injection: pushEntry rewritten to `.upsert(...)` turns
    // the method assertion red; an upsert keyed on (goal, day) would also collapse
    // the two rows into one.
    const writes = install(() => ok);
    await enqueueOutboxEntry({ table: 'goal_notes', row: noteRow(ID_A, { text: 'morning' }) });
    await enqueueOutboxEntry({ table: 'goal_notes', row: noteRow(ID_B, { text: 'evening' }) });
    await flushOutbox(client);

    const noteWrites = writes.filter((w) => w.table === 'goal_notes');
    expect(noteWrites).toHaveLength(2);
    expect(noteWrites.every((w) => w.method === 'insert')).toBe(true);
    expect(new Set(noteWrites.map((w) => (w.row as GoalNoteRow).id)).size).toBe(2);
    expect(pendingOutboxEntries()).toHaveLength(0);
  });
});

describe('permanent vs transient, both directions', () => {
  it('keeps a transiently-failed entry (network, 5xx, expired session)', async () => {
    install(() => networkDown);
    await enqueueOutboxEntry(checkinEntry(ID_A));
    await flushOutbox(client);
    expect(pendingOutboxEntries()).toHaveLength(1);

    install(() => sessionGone); // auth_expired: answered by signing in — WAIT, never drop
    await flushOutbox(client, { resetBackoff: true });
    expect(pendingOutboxEntries()).toHaveLength(1);
  });

  it('drops a permanently-refused entry ALONE — the entry behind it still flushes', async () => {
    // The anti-poison-pill guard: the legacy sync wedged whole accounts behind
    // one refused row. Here A is refused by RLS and B lands in the same drain.
    const writes = install((w) =>
      (w.row as MarkEventRow).id === ID_A ? refusedRls : ok,
    );
    await enqueueOutboxEntry(checkinEntry(ID_A));
    await enqueueOutboxEntry(checkinEntry(ID_B));
    await flushOutbox(client);
    expect(writes).toHaveLength(2); // B was attempted despite A's refusal
    expect(pendingOutboxEntries()).toHaveLength(0); // A dropped, B landed
  });

  it('a transient failure does not block the entries behind it either', async () => {
    const writes = install((w) =>
      (w.row as MarkEventRow).id === ID_A ? networkDown : ok,
    );
    await enqueueOutboxEntry(checkinEntry(ID_A));
    await enqueueOutboxEntry(checkinEntry(ID_B));
    await flushOutbox(client);
    expect(writes).toHaveLength(2);
    expect(pendingOutboxEntries().map((e) => e.row.id)).toEqual([ID_A]);
  });
});

describe('bounded backoff', () => {
  it('after a transient failure the next drain waits — and the wait is bounded', async () => {
    const writes = install(() => networkDown);
    await enqueueOutboxEntry(checkinEntry(ID_A));
    const t0 = 1_700_000_000_000;
    await flushOutbox(client, { now: t0 });
    expect(writes).toHaveLength(1);

    // Inside the wait: nothing is sent.
    await flushOutbox(client, { now: t0 + 1_000 });
    expect(writes).toHaveLength(1);

    // Past the cap it must ALWAYS run again: the wait can never exceed 5 minutes.
    await flushOutbox(client, { now: t0 + 5 * 60_000 + 1 });
    expect(writes).toHaveLength(2);
  });

  it('a clock that runs BACKWARDS cannot strand the queue', async () => {
    // The resend-cooldown bug, pinned here on purpose: a wait computed against a
    // later clock once produced a wait longer than the cooldown, unbounded.
    const writes = install(() => networkDown);
    await enqueueOutboxEntry(checkinEntry(ID_A));
    const t0 = 1_700_000_000_000;
    await flushOutbox(client, { now: t0 });
    expect(writes).toHaveLength(1);

    // The clock jumps back a day; the stored next-attempt time is now absurdly
    // far in the future. The guard treats it as elapsed.
    await flushOutbox(client, { now: t0 - 24 * 60 * 60_000 });
    expect(writes).toHaveLength(2);
  });

  it('reconnect/foreground reset the wait (resetBackoff)', async () => {
    const writes = install(() => networkDown);
    await enqueueOutboxEntry(checkinEntry(ID_A));
    const t0 = 1_700_000_000_000;
    await flushOutbox(client, { now: t0 });
    await flushOutbox(client, { now: t0 + 1_000, resetBackoff: true });
    expect(writes).toHaveLength(2);
  });
});

describe('flush refreshes what it changed', () => {
  it('invalidates the flushed user check-in queries and the flushed goal notes', async () => {
    install(() => ok);
    const spy = jest.spyOn(client, 'invalidateQueries');
    await enqueueOutboxEntry(checkinEntry(ID_C));
    await enqueueOutboxEntry({ table: 'goal_notes', row: noteRow(ID_A) });
    await flushOutbox(client);
    const keys = spy.mock.calls.map((c) => (c[0] as { queryKey: unknown[] }).queryKey);
    expect(keys).toContainEqual(['livra', USER, 'checkins']);
    expect(keys).toContainEqual(['livra', USER, 'notes', GOAL]);
  });

  it('does nothing while offline — offline is a state, not an error', async () => {
    const writes = install(() => ok);
    await enqueueOutboxEntry(checkinEntry(ID_A));
    onlineManager.setOnline(false);
    await flushOutbox(client);
    expect(writes).toHaveLength(0);
    expect(pendingOutboxEntries()).toHaveLength(1);
  });
});
