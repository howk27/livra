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

import { readFileSync } from 'fs';
import { join } from 'path';
import { appendGoalNote, editGoalNote, softDeleteGoalNote } from '@/lib/data/mutations/notes';
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

  // 2026-08-08: editGoalNote carried no `deleted_at` filter while its sibling
  // softDeleteGoalNote did — so an edit could rewrite the text of a note the
  // user had already archived. Unreachable from the journal UI (it cannot show
  // an archived entry), but the outbox may replay an edit that was queued
  // BEFORE the archive landed, which resurrects deleted text.
  it('GUARD: never edits an archived entry', async () => {
    const { calls } = makeClient([{ data: null, error: null }]);
    await editGoalNote(NOTE, 'revised');

    const isFilters = calls.filter((c) => c.method === 'is');
    expect(isFilters).toHaveLength(1);
    expect(isFilters[0].args).toEqual(['deleted_at', null]);
  });
});

describe('softDeleteGoalNote', () => {
  it('GUARD: archives — it issues an UPDATE and never a DELETE', async () => {
    const { calls } = makeClient([{ data: null, error: null }]);
    await softDeleteGoalNote(NOTE);

    // This is D-8 in one assertion. Before 2026-07-30 `goal_notes` had no
    // `deleted_at` column, so the only way to wire the journal's delete button was
    // a real DELETE — which is exactly what this forbids.
    expect(calls.some((c) => c.method === 'delete')).toBe(false);
    const update = calls.find((c) => c.method === 'update');
    expect(update?.args[0]).toMatchObject({ deleted_at: expect.any(String) });
  });

  it('stamps deleted_at and updated_at to the same instant', async () => {
    const { calls } = makeClient([{ data: null, error: null }]);
    await softDeleteGoalNote(NOTE);
    const patch = calls.find((c) => c.method === 'update')?.args[0] as {
      deleted_at: string;
      updated_at: string;
    };
    expect(patch.deleted_at).toBe(patch.updated_at);
  });

  it('addresses ONE entry by its own id, like the edit path', async () => {
    const { calls } = makeClient([{ data: null, error: null }]);
    await softDeleteGoalNote(NOTE);

    const eqs = calls.filter((c) => c.method === 'eq');
    expect(eqs).toHaveLength(1);
    expect(eqs[0].args).toEqual(['id', NOTE]);
    // Anything coarser — (goal, day) especially — would archive entries the user
    // never touched, since many notes can share a goal and a day.
    expect(eqs.some((c) => c.args[0] === 'local_date')).toBe(false);
  });

  it('GUARD: is idempotent — a second archive cannot move the tombstone', async () => {
    const { calls } = makeClient([{ data: null, error: null }]);
    await softDeleteGoalNote(NOTE);

    // `.is('deleted_at', null)` is what makes the UPDATE match zero rows the second
    // time. Without it a Phase-4 replay would rewrite deleted_at to a later instant.
    const guard = calls.find((c) => c.method === 'is');
    expect(guard?.args).toEqual(['deleted_at', null]);
  });

  it('refuses a malformed id before any request', async () => {
    const { from } = makeClient([]);
    await expect(softDeleteGoalNote('not-a-uuid')).rejects.toMatchObject({ kind: 'unknown' });
    expect(from).not.toHaveBeenCalled();
  });

  it('classifies a refusal rather than leaking Postgres text', async () => {
    makeClient([{ data: null, error: { code: '42501', message: 'permission denied for goal_notes' } }]);
    await expect(softDeleteGoalNote(NOTE)).rejects.toMatchObject({ kind: 'permission' });
  });
});

// ── D-8 across the whole mutation layer ──────────────────────────────────────
//
// The per-function guard above proves THIS module archives. This one proves the
// rule holds everywhere, so "does this entity hard-delete?" stops being a
// per-table question. It is a source scan rather than a behavioural test because
// the thing being asserted is an ABSENCE across four files — the only honest way
// to catch a `.delete()` added to a module nobody thought to write a test for.

describe('D-8 — no mutation module issues a hard delete', () => {
  const MUTATION_MODULES = [
    'lib/data/mutations/checkins.ts',
    'lib/data/mutations/goals.ts',
    'lib/data/mutations/marks.ts',
    'lib/data/mutations/notes.ts',
  ];

  it.each(MUTATION_MODULES)('%s never calls .delete()', (relPath) => {
    const source = readFileSync(join(process.cwd(), relPath), 'utf8');
    // Strip comments first: this file's own prose says the word ".delete()" more
    // than once, and a scan that counts prose measures nothing. (This repo has
    // shipped that exact mistake twice — 2026-07-25 and 2026-07-26.)
    const code = source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n')
      .filter((line) => !line.trim().startsWith('//'))
      .join('\n');
    expect(code).not.toMatch(/\.delete\s*\(/);
  });

  it('the scan is non-vacuous — it finds an injected .delete()', () => {
    const injected = `
      const x = client.from('goal_notes').delete().eq('id', noteId);
    `;
    expect(injected).toMatch(/\.delete\s*\(/);
  });
});
