// M9 Phase 3 Task 5 — goal notes append, they do not collapse.
//
// THE GUARD THAT MATTERS is "two notes on the same goal on the same day both
// survive". It is written against the naive upsert — the one-line version that
// keys on (goal_id, local_date) and quietly overwrites what the user wrote this
// morning with what they wrote tonight.
//
// It is also the contract the Phase 4 outbox rests on: `goal_notes` has no
// uniqueness rule (verified live 2026-07-30 — only `goal_notes_pkey` and two
// non-unique indexes), which is why the queue holds ONE entry class and handles no
// conflicts at all.

import { appendGoalNote, editGoalNote } from '@/lib/data/mutations/notes';
import { setSupabaseClientOverride } from '@/lib/supabase';

jest.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: null }) }));

const USER = '3fe1a23e-2ec2-4830-a68b-42b65fc3bcb0';
const GOAL = 'aaaaaaaa-1111-4111-8111-111111111111';
const NOTE = 'dddddddd-7777-4777-8777-777777777777';
const DAY = '2026-07-30';

type Call = { table: string; method: string; args: unknown[] };
type Result = { data: unknown; error: unknown };

function makeClient(results: Result[]) {
  const queue = [...results];
  const calls: Call[] = [];
  const from = jest.fn((table: string) => {
    const result = queue.shift() ?? { data: null, error: null };
    const builder: Record<string, unknown> = {};
    const chain =
      (method: string) =>
      (...args: unknown[]) => {
        calls.push({ table, method, args });
        return builder;
      };
    for (const m of ['select', 'insert', 'update', 'delete', 'upsert', 'eq', 'is', 'order']) {
      builder[m] = jest.fn(chain(m));
    }
    builder.single = jest.fn(() => Promise.resolve(result));
    builder.then = (res: (v: Result) => unknown, rej: (e: unknown) => unknown) =>
      Promise.resolve(result).then(res, rej);
    return builder;
  });
  setSupabaseClientOverride({ from } as unknown as Parameters<typeof setSupabaseClientOverride>[0]);
  return { calls, from };
}

afterEach(() => {
  setSupabaseClientOverride(null);
  jest.clearAllMocks();
});

describe('appendGoalNote', () => {
  const input = { goalId: GOAL, userId: USER, localDate: DAY, text: 'Felt strong today' };

  it('GUARD: two notes on the same goal on the same day BOTH survive', async () => {
    const { calls } = makeClient([
      { data: { id: 'n1' }, error: null },
      { data: { id: 'n2' }, error: null },
    ]);

    await appendGoalNote(input);
    await appendGoalNote({ ...input, text: 'And again tonight' });

    // Two INSERTs, no upsert, and two DISTINCT ids. A day-keyed upsert would show
    // one write here, or two writes carrying the same key.
    const inserts = calls.filter((c) => c.method === 'insert');
    expect(inserts).toHaveLength(2);
    expect(calls.some((c) => c.method === 'upsert')).toBe(false);

    const ids = inserts.map((c) => (c.args[0] as { id: string }).id);
    expect(new Set(ids).size).toBe(2);
  });

  it('never sends a conflict target — there is no uniqueness rule to target', async () => {
    const { calls } = makeClient([{ data: { id: 'n1' }, error: null }]);
    await appendGoalNote(input);
    const insert = calls.find((c) => c.method === 'insert');
    // A second argument to .insert() is where onConflict/upsert options would ride.
    expect(insert?.args[1]).toBeUndefined();
  });

  it('carries the day as data, not as a key', async () => {
    const { calls } = makeClient([{ data: { id: 'n1' }, error: null }]);
    await appendGoalNote(input);
    expect(calls.find((c) => c.method === 'insert')?.args[0]).toMatchObject({
      goal_id: GOAL,
      user_id: USER,
      local_date: DAY,
      text: 'Felt strong today',
    });
  });

  it('trims the text and refuses an empty entry before any request', async () => {
    const { from } = makeClient([]);
    await expect(appendGoalNote({ ...input, text: '   ' })).rejects.toMatchObject({
      kind: 'unknown',
    });
    expect(from).not.toHaveBeenCalled();
  });

  it('refuses a malformed local date', async () => {
    const { from } = makeClient([]);
    await expect(appendGoalNote({ ...input, localDate: '30-07-2026' })).rejects.toMatchObject({
      kind: 'unknown',
    });
    expect(from).not.toHaveBeenCalled();
  });

  it('classifies a refusal rather than leaking Postgres text', async () => {
    makeClient([{ data: null, error: { code: '42501', message: 'permission denied for goal_notes' } }]);
    await expect(appendGoalNote(input)).rejects.toMatchObject({ kind: 'permission' });
  });
});

describe('editGoalNote', () => {
  it('addresses ONE entry by its own id, never by goal and day', async () => {
    const { calls } = makeClient([{ data: null, error: null }]);
    await editGoalNote(NOTE, ' revised ');

    const eqs = calls.filter((c) => c.method === 'eq');
    expect(eqs).toHaveLength(1);
    expect(eqs[0].args).toEqual(['id', NOTE]);
    // Addressing by (goal, day) would collapse every entry written that day.
    expect(eqs.some((c) => c.args[0] === 'local_date')).toBe(false);
    expect(calls.find((c) => c.method === 'update')?.args[0]).toMatchObject({ text: 'revised' });
  });

  it('refuses an empty edit', async () => {
    const { from } = makeClient([]);
    await expect(editGoalNote(NOTE, '  ')).rejects.toMatchObject({ kind: 'unknown' });
    expect(from).not.toHaveBeenCalled();
  });
});

// NOTE: deletion is deliberately absent from this module — `goal_notes` has no
// `deleted_at` column, so honouring D-8 needs either that column or an explicit
// exception. The decision is recorded in the module header and in decisions.md;
// it is not pinned by a test, because a test asserting "we have not built this
// yet" would fail for the right reason the day the decision lands.
