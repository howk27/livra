// M9 Phase 4 Task 4 — the read merge and the offline write branches.
//
// Spec guard 3 lives here: a "today" read is IDENTICAL online and offline with
// entries pending — the direct test of D-3, and the reason the merge functions
// are pure and exported. Guards 1, 2 and 4 live in outbox.test.ts.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient, onlineManager } from '@tanstack/react-query';
import { setSupabaseClientOverride } from '@/lib/supabase';
import { mergePendingCheckins } from '@/lib/data/checkins';
import { mergePendingGoalNotes } from '@/lib/data/notes';
import {
  buildCheckinRow,
  logCheckinMutationOptions,
  undoCheckinMutationOptions,
} from '@/lib/data/mutations/checkins';
import { buildGoalNoteRow } from '@/lib/data/mutations/notes';
import {
  enqueueOutboxEntry,
  pendingOutboxEntries,
  __resetOutboxForTests,
} from '@/lib/data/outbox';
import type { MarkEventRow, GoalNoteRow } from '@/lib/data/types';

jest.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: null }) }));

const USER = '3fe1a23e-2ec2-4830-a68b-42b65fc3bcb0';
const MARK = 'a1b2c3d4-1111-4222-8333-444455556666';
const GOAL = 'c3d4e5f6-3333-4444-8555-666677778888';

function checkin(id: string, occurredAt: string, overrides: Partial<MarkEventRow> = {}): MarkEventRow {
  return {
    id,
    user_id: USER,
    mark_id: MARK,
    event_type: 'increment',
    amount: 1,
    occurred_at: occurredAt,
    occurred_local_date: occurredAt.slice(0, 10),
    meta: null,
    created_at: occurredAt,
    updated_at: occurredAt,
    deleted_at: null,
    ...overrides,
  };
}

function note(id: string, createdAt: string, overrides: Partial<GoalNoteRow> = {}): GoalNoteRow {
  return {
    id,
    user_id: USER,
    goal_id: GOAL,
    local_date: createdAt.slice(0, 10),
    text: 'entry',
    created_at: createdAt,
    updated_at: createdAt,
    deleted_at: null,
    ...overrides,
  };
}

const A = 'e0000000-0000-4000-8000-00000000000a';
const B = 'e0000000-0000-4000-8000-00000000000b';
const C = 'e0000000-0000-4000-8000-00000000000c';

beforeEach(async () => {
  __resetOutboxForTests();
  await AsyncStorage.clear();
  onlineManager.setOnline(true);
});

afterEach(() => {
  setSupabaseClientOverride(null);
  onlineManager.setOnline(true);
  jest.clearAllMocks();
});

describe('spec guard 3 — a "today" read is identical online and offline with entries pending', () => {
  it('the merged offline view equals the view an online fetch of the same rows would return', () => {
    // Online world: all three rows on the server, fetched newest-first.
    const early = checkin(A, '2026-07-31T08:00:00.000Z');
    const mid = checkin(B, '2026-07-31T12:00:00.000Z');
    const late = checkin(C, '2026-07-31T18:00:00.000Z');
    const onlineView = [late, mid, early]; // occurred_at desc, the fetcher's order

    // Offline world: the server knew only A and C when the cache was filled;
    // B was logged offline and sits in the outbox.
    const offlineView = mergePendingCheckins([late, early], [mid]);

    expect(offlineView).toEqual(onlineView);
  });

  it('a row both flushed and still pending appears exactly once (dedupe by the shared id)', () => {
    // The transient moment mid-flush: the refetch already returned the row while
    // the outbox entry has not been removed yet.
    const rowOnBoth = checkin(A, '2026-07-31T08:00:00.000Z');
    const merged = mergePendingCheckins([rowOnBoth], [rowOnBoth]);
    expect(merged).toHaveLength(1);
  });

  it('with nothing pending the server value is returned UNTOUCHED — online behaviour is byte-identical', () => {
    const server = [checkin(A, '2026-07-31T08:00:00.000Z')];
    expect(mergePendingCheckins(server, [])).toBe(server);
    expect(mergePendingCheckins(undefined, [])).toBeUndefined();
  });

  it('pending rows are visible even before any server data exists (fresh offline start)', () => {
    const queued = checkin(A, '2026-07-31T08:00:00.000Z');
    expect(mergePendingCheckins(undefined, [queued])).toEqual([queued]);
  });

  it('goal notes merge to the fetcher exact total order (created_at desc, id desc)', () => {
    const sameStamp = '2026-07-31T09:00:00.000Z';
    const serverNote = note(A, sameStamp);
    const queuedNote = note(C, sameStamp); // same millisecond — id breaks the tie
    const older = note(B, '2026-07-30T09:00:00.000Z');
    expect(mergePendingGoalNotes([serverNote, older], [queuedNote])).toEqual([
      queuedNote, // id C > A at the shared created_at
      serverNote,
      older,
    ]);
  });
});

describe('the offline write branches (networkMode: always)', () => {
  function installRecorder() {
    const writes: { table: string; method: string }[] = [];
    const builder = (table: string) => {
      const record = (method: string) => () => {
        writes.push({ table, method });
        const chain: Record<string, unknown> = {
          then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(resolve),
        };
        chain.select = () => chain;
        chain.single = () => Promise.resolve({ data: null, error: null });
        chain.eq = () => chain;
        chain.is = () => chain;
        return chain;
      };
      return { insert: record('insert'), update: record('update'), upsert: record('upsert') };
    };
    const client = { from: (table: string) => builder(table) };
    setSupabaseClientOverride(client as unknown as Parameters<typeof setSupabaseClientOverride>[0]);
    return writes;
  }

  it('an offline check-in enqueues, resolves the SAME row, and sends nothing', async () => {
    const writes = installRecorder();
    onlineManager.setOnline(false);
    const client = new QueryClient();
    const row = buildCheckinRow({ markId: MARK, userId: USER });

    const result = await logCheckinMutationOptions(client).mutationFn(row);

    expect(result).toBe(row); // D-3: the built row IS the result — no pending shape
    expect(writes).toHaveLength(0);
    expect(pendingOutboxEntries().map((e) => e.row.id)).toEqual([row.id]);
  });

  it('undoing a still-queued check-in unsends it — no network, queue empty', async () => {
    const writes = installRecorder();
    onlineManager.setOnline(false);
    const client = new QueryClient();
    const row = buildCheckinRow({ markId: MARK, userId: USER });
    await logCheckinMutationOptions(client).mutationFn(row);

    await undoCheckinMutationOptions(client).mutationFn({
      eventId: row.id,
      userId: USER,
      markId: MARK,
      localDate: row.occurred_local_date,
      row,
    });

    expect(writes).toHaveLength(0);
    expect(pendingOutboxEntries()).toHaveLength(0);
  });

  it('an online check-in still inserts — the offline branch does not leak into the online path', async () => {
    const writes = installRecorder();
    const client = new QueryClient();
    const row = buildCheckinRow({ markId: MARK, userId: USER });
    await logCheckinMutationOptions(client).mutationFn(row);
    expect(writes).toEqual([{ table: 'mark_events', method: 'insert' }]);
    expect(pendingOutboxEntries()).toHaveLength(0);
  });

  it('an offline goal note builds the full row and enqueues it', async () => {
    const writes = installRecorder();
    onlineManager.setOnline(false);
    const row = buildGoalNoteRow({
      goalId: GOAL,
      userId: USER,
      localDate: '2026-07-31',
      text: 'offline thought',
    });
    await enqueueOutboxEntry({ table: 'goal_notes', row });
    expect(writes).toHaveLength(0);
    expect(pendingOutboxEntries()).toHaveLength(1);
    // The row is complete — the flush needs nothing the screen had.
    expect(row.id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(row.deleted_at).toBeNull();
  });
});
