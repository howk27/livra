// M9 Phase 3 Task 2 — contracts for the check-in write.
//
// The mutation is built from plain pieces — `buildCheckinRow` (pure), the two
// request functions, the cache primitives, and an options factory taking a
// QueryClient — so every contract below is exercised with no React and no network,
// the same way `dataLayerReads.test.ts` exercises the fetchers.

import fs from 'fs';
import path from 'path';
import { QueryClient } from '@tanstack/react-query';
import { setSupabaseClientOverride } from '@/lib/supabase';
import { queryKeys } from '@/lib/data/queryKeys';
import { isDataError } from '@/lib/data/errors';
import {
  buildCheckinRow,
  insertCheckin,
  softDeleteCheckin,
  upsertCheckinRow,
  removeCheckinRow,
  applyCheckinToCaches,
  removeCheckinFromCaches,
  logCheckinMutationOptions,
  undoCheckinMutationOptions,
  missingOptionalColumnFromError,
} from '@/lib/data/mutations/checkins';
import type { MarkEventRow } from '@/lib/data/types';

jest.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: null }) }));

const USER = '3fe1a23e-2ec2-4830-a68b-42b65fc3bcb0';
const MARK = 'a1b2c3d4-1111-4222-8333-444455556666';
const OTHER = 'b2c3d4e5-2222-4333-8444-555566667777';

type QueryResult = { data: unknown; error: unknown };

/** Records every builder method called, so a test can assert what was NOT called. */
function makeBuilder(result: QueryResult, calls: { method: string; args: unknown[] }[]) {
  const builder: Record<string, unknown> = {};
  const chain =
    (method: string) =>
    (...args: unknown[]) => {
      calls.push({ method, args });
      return builder;
    };
  for (const method of ['select', 'insert', 'update', 'delete', 'upsert', 'eq', 'is', 'order']) {
    builder[method] = jest.fn(chain(method));
  }
  builder.single = jest.fn(() => Promise.resolve(result));
  builder.maybeSingle = jest.fn(() => Promise.resolve(result));
  builder.then = (resolve: (v: QueryResult) => unknown, reject: (e: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return builder;
}

function install(result: QueryResult) {
  const calls: { method: string; args: unknown[] }[] = [];
  const tables: string[] = [];
  const client = {
    from: jest.fn((table: string) => {
      tables.push(table);
      return makeBuilder(result, calls);
    }),
  };
  setSupabaseClientOverride(client as unknown as Parameters<typeof setSupabaseClientOverride>[0]);
  return { calls, tables };
}

function row(overrides: Partial<MarkEventRow> = {}): MarkEventRow {
  return {
    id: 'e0000000-0000-4000-8000-000000000001',
    user_id: USER,
    mark_id: MARK,
    event_type: 'increment',
    amount: 1,
    occurred_at: '2026-07-30T10:00:00.000Z',
    occurred_local_date: '2026-07-30',
    meta: null,
    created_at: '2026-07-30T10:00:00.000Z',
    updated_at: '2026-07-30T10:00:00.000Z',
    deleted_at: null,
    ...overrides,
  };
}

afterEach(() => {
  setSupabaseClientOverride(null);
  jest.clearAllMocks();
});

describe('buildCheckinRow', () => {
  it('generates a client-side uuid primary key — idempotency is structural', () => {
    const a = buildCheckinRow({ markId: MARK, userId: USER });
    const b = buildCheckinRow({ markId: MARK, userId: USER });
    expect(a.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    expect(a.id).not.toBe(b.id);
  });

  it('writes one increment row with the local date reads filter on', () => {
    const built = buildCheckinRow({ markId: MARK, userId: USER, amount: 2 }, new Date(2026, 6, 30, 9, 30));
    expect(built.event_type).toBe('increment');
    expect(built.amount).toBe(2);
    expect(built.mark_id).toBe(MARK);
    expect(built.user_id).toBe(USER);
    expect(built.occurred_local_date).toBe('2026-07-30');
    expect(built.deleted_at).toBeNull();
  });

  it.each([
    ['a non-uuid userId', { markId: MARK, userId: 'not-a-uuid' }],
    ['a non-uuid markId', { markId: 'nope', userId: USER }],
    ['a zero amount', { markId: MARK, userId: USER, amount: 0 }],
    ['a fractional amount', { markId: MARK, userId: USER, amount: 1.5 }],
    ['an absurd amount', { markId: MARK, userId: USER, amount: 5000 }],
  ])('rejects %s as a DataError, never a raw Error', (_label, input) => {
    let thrown: unknown;
    try {
      buildCheckinRow(input);
    } catch (error) {
      thrown = error;
    }
    expect(isDataError(thrown)).toBe(true);
    expect((thrown as { message: string }).message).not.toMatch(/uuid|amount/i);
  });

  it('rejects a timestamp beyond the clock-drift tolerance', () => {
    const future = new Date(Date.now() + 60 * 60 * 1000);
    expect(() => buildCheckinRow({ markId: MARK, userId: USER }, future)).toThrow();
  });

  it('rejects a timestamp more than a year old', () => {
    const ancient = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000);
    expect(() => buildCheckinRow({ markId: MARK, userId: USER }, ancient)).toThrow();
  });

  it('accepts a timestamp inside the drift tolerance', () => {
    const nearFuture = new Date(Date.now() + 60 * 1000);
    expect(() => buildCheckinRow({ markId: MARK, userId: USER }, nearFuture)).not.toThrow();
  });
});

describe('insertCheckin', () => {
  it('inserts into mark_events and returns the server row', async () => {
    const server = row({ created_at: '2026-07-30T10:00:01.000Z' });
    const { tables, calls } = install({ data: server, error: null });

    await expect(insertCheckin(row())).resolves.toEqual(server);
    expect(tables).toEqual(['mark_events']);
    expect(calls.find((c) => c.method === 'insert')?.args[0]).toMatchObject({ mark_id: MARK });
  });

  it('touches ONE table — no second write to marks', async () => {
    const { tables } = install({ data: row(), error: null });
    await insertCheckin(row());
    expect(tables).not.toContain('marks');
    expect(tables).toHaveLength(1);
  });

  it('classifies a refusal instead of leaking Postgres text', async () => {
    install({ data: null, error: { code: '42501', message: 'new row violates row-level security policy for table "mark_events"' } });
    await expect(insertCheckin(row())).rejects.toMatchObject({ kind: 'permission' });
    await expect(insertCheckin(row())).rejects.not.toMatchObject({
      message: expect.stringContaining('row-level security'),
    });
  });

  it('classifies a replayed id as a conflict, not a failure to investigate', async () => {
    install({ data: null, error: { code: '23505', message: 'duplicate key value' } });
    await expect(insertCheckin(row())).rejects.toMatchObject({ kind: 'conflict' });
  });
});

describe('softDeleteCheckin', () => {
  it('stamps deleted_at and never issues a DELETE (D-8: archive, never destroy)', async () => {
    const { calls, tables } = install({ data: null, error: null });
    await softDeleteCheckin(row().id);

    expect(tables).toEqual(['mark_events']);
    expect(calls.map((c) => c.method)).toContain('update');
    expect(calls.map((c) => c.method)).not.toContain('delete');
    expect(calls.find((c) => c.method === 'update')?.args[0]).toMatchObject({
      deleted_at: expect.any(String),
    });
  });
});

describe('cache primitives', () => {
  it('upsert is idempotent by id — a refetch carrying the same row cannot double it', () => {
    const first = upsertCheckinRow([], row())!;
    const again = upsertCheckinRow(first, row({ amount: 3 }))!;
    expect(again).toHaveLength(1);
    expect(again[0].amount).toBe(3);
  });

  it('never seeds a cache entry a screen has not fetched', () => {
    expect(upsertCheckinRow(undefined, row())).toBeUndefined();
    expect(removeCheckinRow(undefined, 'anything')).toBeUndefined();
  });

  it('patches all three check-in keys, and removal undoes all three', () => {
    const client = new QueryClient();
    const keys = [
      queryKeys.checkins(USER, MARK),
      queryKeys.userCheckins(USER),
      queryKeys.todayCheckins(USER, '2026-07-30'),
    ];
    for (const key of keys) client.setQueryData<MarkEventRow[]>(key, []);

    applyCheckinToCaches(client, row());
    for (const key of keys) expect(client.getQueryData<MarkEventRow[]>(key)).toHaveLength(1);

    removeCheckinFromCaches(client, {
      userId: USER,
      markId: MARK,
      eventId: row().id,
      localDate: '2026-07-30',
    });
    for (const key of keys) expect(client.getQueryData<MarkEventRow[]>(key)).toHaveLength(0);
  });
});

describe('optimistic update and rollback', () => {
  it('onMutate shows the check-in and onError takes it back', () => {
    const client = new QueryClient();
    const key = queryKeys.checkins(USER, MARK);
    client.setQueryData<MarkEventRow[]>(key, []);
    const options = logCheckinMutationOptions(client);
    const pending = row();

    options.onMutate(pending);
    expect(client.getQueryData<MarkEventRow[]>(key)).toHaveLength(1);

    options.onError({ kind: 'network', message: 'x' }, pending);
    expect(client.getQueryData<MarkEventRow[]>(key)).toHaveLength(0);
  });

  it('onSuccess replaces the optimistic row rather than adding a second', () => {
    const client = new QueryClient();
    const key = queryKeys.checkins(USER, MARK);
    client.setQueryData<MarkEventRow[]>(key, []);
    const options = logCheckinMutationOptions(client);
    const pending = row();

    options.onMutate(pending);
    options.onSuccess(row({ created_at: '2026-07-30T10:00:02.000Z' }));

    const rows = client.getQueryData<MarkEventRow[]>(key)!;
    expect(rows).toHaveLength(1);
    expect(rows[0].created_at).toBe('2026-07-30T10:00:02.000Z');
  });

  it('a rollback removes only the failed check-in, never its neighbours', () => {
    const client = new QueryClient();
    const key = queryKeys.userCheckins(USER);
    const neighbour = row({ id: OTHER, occurred_local_date: '2026-07-29' });
    client.setQueryData<MarkEventRow[]>(key, [neighbour]);
    const options = logCheckinMutationOptions(client);
    const pending = row();

    options.onMutate(pending);
    options.onError({ kind: 'network', message: 'x' }, pending);

    const rows = client.getQueryData<MarkEventRow[]>(key)!;
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(OTHER);
  });

  it('a failed undo puts the check-in back', () => {
    const client = new QueryClient();
    const key = queryKeys.checkins(USER, MARK);
    const existing = row();
    client.setQueryData<MarkEventRow[]>(key, [existing]);
    const options = undoCheckinMutationOptions(client);
    const input = {
      eventId: existing.id,
      userId: USER,
      markId: MARK,
      localDate: existing.occurred_local_date,
      row: existing,
    };

    options.onMutate(input);
    expect(client.getQueryData<MarkEventRow[]>(key)).toHaveLength(0);

    options.onError({ kind: 'server', message: 'x' }, input);
    expect(client.getQueryData<MarkEventRow[]>(key)).toEqual([existing]);
  });
});

// ─── Attribution: mark_events.source (health-auto-sync T3, spec §2.5) ────────
//
// The server column is LIVE (migration 20260805_mark_events_source.sql, applied
// 2026-08-05 and read back). Every row carries the key — null for manual — and
// the per-column degrade survives only as a safety net for a stale PostgREST
// schema cache: a refusal naming `source` loses attribution, NEVER the event.

describe('check-in attribution (source: health)', () => {
  /** Like install(), but each from() call consumes the NEXT queued result, so a
   * failed insert followed by a degrade retry can be scripted. */
  function installQueue(results: QueryResult[]) {
    const calls: { method: string; args: unknown[] }[] = [];
    let i = 0;
    const client = {
      from: jest.fn(() => makeBuilder(results[Math.min(i++, results.length - 1)], calls)),
    };
    setSupabaseClientOverride(client as unknown as Parameters<typeof setSupabaseClientOverride>[0]);
    return { calls, client };
  }

  it('buildCheckinRow threads source through; a manual row carries source: null', () => {
    const health = buildCheckinRow({ markId: MARK, userId: USER, source: 'health' });
    expect(health.source).toBe('health');
    const manual = buildCheckinRow({ markId: MARK, userId: USER });
    expect(manual.source).toBeNull();
  });

  it('missingOptionalColumnFromError recognises PGRST204 for the named column only', () => {
    const pgrst204 = {
      code: 'PGRST204',
      message: "Could not find the 'source' column of 'mark_events' in the schema cache",
    };
    expect(missingOptionalColumnFromError(pgrst204, 'source')).toBe(true);
    expect(missingOptionalColumnFromError(pgrst204, 'meta')).toBe(false);
    expect(
      missingOptionalColumnFromError(
        { code: '42703', message: 'column mark_events.source does not exist' },
        'source',
      ),
    ).toBe(true);
    expect(missingOptionalColumnFromError({ code: '42501', message: 'denied' }, 'source')).toBe(
      false,
    );
    expect(missingOptionalColumnFromError(null, 'source')).toBe(false);
  });

  it('insertCheckin retries WITHOUT source when the server lacks the column — the event lands', async () => {
    const healthRow = row();
    (healthRow as MarkEventRow & { source?: string | null }).source = 'health';
    const { calls } = installQueue([
      {
        data: null,
        error: {
          code: 'PGRST204',
          message: "Could not find the 'source' column of 'mark_events' in the schema cache",
        },
      },
      { data: row(), error: null },
    ]);

    await expect(insertCheckin(healthRow)).resolves.toMatchObject({ id: healthRow.id });
    const inserts = calls.filter((c) => c.method === 'insert');
    expect(inserts).toHaveLength(2);
    expect(inserts[0].args[0]).toMatchObject({ source: 'health' });
    expect('source' in (inserts[1].args[0] as Record<string, unknown>)).toBe(false);
  });

  it('does NOT retry a non-column failure (no blind second insert)', async () => {
    const { calls } = installQueue([
      { data: null, error: { code: '42501', message: 'denied' } },
    ]);
    await expect(insertCheckin(row())).rejects.toMatchObject({ kind: 'permission' });
    expect(calls.filter((c) => c.method === 'insert')).toHaveLength(1);
  });

  it('the offline enqueue keeps source — the live column makes queued attribution durable', async () => {
    const { onlineManager } = require('@tanstack/react-query');
    const outbox = require('@/lib/data/outbox');
    const spy = jest.spyOn(outbox, 'enqueueOutboxEntry').mockResolvedValue(undefined);
    const wasOnline = onlineManager.isOnline();
    onlineManager.setOnline(false);
    try {
      const client = new QueryClient();
      const options = logCheckinMutationOptions(client);
      const healthRow = row();
      (healthRow as MarkEventRow & { source?: string | null }).source = 'health';
      const returned = await options.mutationFn(healthRow);
      expect(returned).toBe(healthRow);
      const queued = spy.mock.calls[0][0] as { row: Record<string, unknown> };
      expect(queued.row.source).toBe('health');
    } finally {
      onlineManager.setOnline(wasOnline);
      spy.mockRestore();
    }
  });
});

// ─── The structural guard ────────────────────────────────────────────────────
//
// "One row per check-in" is the whole point of this task, and it is not a value a
// unit test can watch: it is the ABSENCE of a second write. This scans the shipped
// mutation source for any reference to the stored total or to the reconciliation
// machinery that existed only to keep the two in step.

describe('GUARD: the write path never touches marks.total', () => {
  const dir = path.join(__dirname, '..', '..', 'lib', 'data', 'mutations');

  /** Strip comments, keep string literals — this repo has shipped three scanners
   * that matched a comment instead of code. */
  function stripComments(source: string): string {
    let out = '';
    let i = 0;
    let quote: string | null = null;
    while (i < source.length) {
      const ch = source[i];
      const next = source[i + 1];
      if (quote) {
        if (ch === '\\') {
          out += ch + (next ?? '');
          i += 2;
          continue;
        }
        if (ch === quote) quote = null;
        out += ch;
        i += 1;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === '`') {
        quote = ch;
        out += ch;
        i += 1;
        continue;
      }
      if (ch === '/' && next === '/') {
        while (i < source.length && source[i] !== '\n') i += 1;
        continue;
      }
      if (ch === '/' && next === '*') {
        i += 2;
        while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) i += 1;
        i += 2;
        continue;
      }
      out += ch;
      i += 1;
    }
    return out;
  }

  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.ts'));

  it('has mutation modules to scan (the guard is not vacuous)', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each([['total'], ['reconcileMarkTotal'], ['recentUpdates']])(
    'no mutation module references `%s` in code',
    (needle) => {
      for (const file of files) {
        const code = stripComments(fs.readFileSync(path.join(dir, file), 'utf8'));
        expect(code.includes(needle)).toBe(false);
      }
    },
  );
});
