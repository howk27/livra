// M9 Phase 3 Task 4 — mark writes and linking (D-6).
//
// Two contracts here are the point of the whole task:
//   • a new mark writes a LINK and never `marks.goal_id` (Step 3), and
//   • linking is idempotent, because `goal_mark_links` carries
//     UNIQUE (goal_id, mark_id) — verified live 2026-07-30.
//
// The second is tested through its failure mode rather than its happy path: the
// tempting one-line `upsert(..., { ignoreDuplicates: true })` passes a naive
// "re-linking does not duplicate" test while silently refusing to re-link a pair
// the user had previously unlinked.

import {
  createMark,
  editMark,
  archiveMark,
  linkMarkToGoal,
  unlinkMarkFromGoal,
  type MarkCadence,
} from '@/lib/data/mutations/marks';
import { setSupabaseClientOverride } from '@/lib/supabase';

jest.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: null }) }));

const USER = '3fe1a23e-2ec2-4830-a68b-42b65fc3bcb0';
const GOAL = 'aaaaaaaa-1111-4111-8111-111111111111';
const MARK = 'c1c1c1c1-3333-4333-8333-333333333333';

const CADENCE: MarkCadence = {
  frequency_kind: 'variable',
  frequency_min: 3,
  frequency_recommended: 5,
  frequency_max: 7,
  weekly_target: 5,
  dailyTarget: 1,
  maintenance_of: null,
};

type Call = { table: string; method: string; args: unknown[] };
type Result = { data: unknown; error: unknown };

function makeClient(results: Result[]) {
  const queue = [...results];
  const calls: Call[] = [];

  const from = jest.fn((table: string) => {
    const result = queue.shift() ?? { data: [], error: null };
    const builder: Record<string, unknown> = {};
    const chain =
      (method: string) =>
      (...args: unknown[]) => {
        calls.push({ table, method, args });
        return builder;
      };
    for (const m of ['select', 'insert', 'update', 'delete', 'upsert', 'eq', 'is', 'in', 'order']) {
      builder[m] = jest.fn(chain(m));
    }
    builder.single = jest.fn(() => Promise.resolve(result));
    builder.maybeSingle = jest.fn(() => Promise.resolve(result));
    builder.then = (resolve: (v: Result) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject);
    return builder;
  });

  setSupabaseClientOverride({ from } as unknown as Parameters<typeof setSupabaseClientOverride>[0]);
  return { calls, from };
}

function writes(calls: Call[]): string[] {
  return calls
    .filter((c) => ['update', 'insert', 'delete'].includes(c.method))
    .map((c) => `${c.table}.${c.method}`);
}

function bodyOf(calls: Call[], table: string, method: string): Record<string, unknown> {
  return calls.find((c) => c.table === table && c.method === method)?.args[0] as Record<
    string,
    unknown
  >;
}

afterEach(() => {
  setSupabaseClientOverride(null);
  jest.clearAllMocks();
});

describe('createMark', () => {
  const input = { userId: USER, name: 'Drink water', sortIndex: 0, cadence: CADENCE };

  it('NEVER writes goal_id — links are the single truth (T6)', async () => {
    const { calls } = makeClient([{ data: { id: MARK }, error: null }, { data: [], error: null }, { data: null, error: null }]);
    await createMark({ ...input, goalId: GOAL });
    expect(bodyOf(calls, 'marks', 'insert')).not.toHaveProperty('goal_id');
  });

  it('does not write the stored running count — Phase 4 derives it', async () => {
    const { calls } = makeClient([{ data: { id: MARK }, error: null }]);
    await createMark(input);
    const body = bodyOf(calls, 'marks', 'insert');
    expect(Object.keys(body)).not.toContain('total');
  });

  it('carries the FULL cadence set, the family this project has broken most', async () => {
    const { calls } = makeClient([{ data: { id: MARK }, error: null }]);
    await createMark(input);
    expect(bodyOf(calls, 'marks', 'insert')).toMatchObject({
      frequency_kind: 'variable',
      frequency_min: 3,
      frequency_recommended: 5,
      frequency_max: 7,
      weekly_target: 5,
      dailyTarget: 1,
      maintenance_of: null,
    });
  });

  it('writes a link when a goal is given, carrying the owner (M6-B)', async () => {
    const { calls } = makeClient([
      { data: { id: MARK }, error: null }, // mark insert
      { data: [], error: null }, // revive attempt finds nothing
      { data: null, error: null }, // link insert
    ]);
    await createMark({ ...input, goalId: GOAL });
    expect(writes(calls)).toEqual(['marks.insert', 'goal_mark_links.update', 'goal_mark_links.insert']);
    // The link must point at the id we INSERTED, not at whatever the response
    // echoes back — so assert the two request bodies agree rather than pinning a
    // fixture id the client never generated.
    expect(bodyOf(calls, 'goal_mark_links', 'insert')).toMatchObject({
      goal_id: GOAL,
      mark_id: bodyOf(calls, 'marks', 'insert').id,
      user_id: USER,
    });
  });

  it('writes no link at all when no goal is given', async () => {
    const { calls } = makeClient([{ data: { id: MARK }, error: null }]);
    await createMark(input);
    expect(writes(calls)).toEqual(['marks.insert']);
  });

  it('surfaces the free-tier refusal as limit copy, not raw text', async () => {
    makeClient([
      { data: null, error: { code: '42501', message: 'new row violates row-level security policy' } },
    ]);
    await expect(createMark(input)).rejects.toMatchObject({ kind: 'permission' });
  });

  it('rejects an empty name before any request is made', async () => {
    const { from } = makeClient([]);
    await expect(createMark({ ...input, name: '  ' })).rejects.toMatchObject({ kind: 'unknown' });
    expect(from).not.toHaveBeenCalled();
  });
});

// AI-MARK-WHY (2026-08-06): the generator's per-mark rationale lands on the
// LINK row — a property of the (goal, mark) PAIR — normalized at this boundary
// because AI output is input.
describe('createMark — per-link why (AI rationale)', () => {
  const input = { userId: USER, name: 'Drink water', sortIndex: 0, cadence: CADENCE };
  const linked = [
    { data: { id: MARK }, error: null }, // mark insert
    { data: [], error: null }, // revive attempt finds nothing
    { data: null, error: null }, // link insert
  ];

  it('writes the why onto the LINK row — never the mark', async () => {
    const { calls } = makeClient([...linked]);
    await createMark({ ...input, goalId: GOAL, why: 'Builds endurance over time' });
    expect(bodyOf(calls, 'goal_mark_links', 'insert')).toMatchObject({
      why: 'Builds endurance over time',
    });
    expect(bodyOf(calls, 'marks', 'insert')).not.toHaveProperty('why');
  });

  it('trims the why before it is stored', async () => {
    const { calls } = makeClient([...linked]);
    await createMark({ ...input, goalId: GOAL, why: '  Builds endurance  ' });
    expect(bodyOf(calls, 'goal_mark_links', 'insert').why).toBe('Builds endurance');
  });

  it('caps the why at 200 characters', async () => {
    const { calls } = makeClient([...linked]);
    await createMark({ ...input, goalId: GOAL, why: 'x'.repeat(300) });
    expect((bodyOf(calls, 'goal_mark_links', 'insert').why as string).length).toBe(200);
  });

  it('stores null for an empty or whitespace-only why', async () => {
    const { calls } = makeClient([...linked]);
    await createMark({ ...input, goalId: GOAL, why: '   ' });
    expect(bodyOf(calls, 'goal_mark_links', 'insert').why).toBeNull();
  });

  it('a why with no goal writes no link at all — it has nowhere to live', async () => {
    const { calls } = makeClient([{ data: { id: MARK }, error: null }]);
    await createMark({ ...input, why: 'orphaned rationale' });
    expect(writes(calls)).toEqual(['marks.insert']);
  });
});

describe('linkMarkToGoal — the why rides new inserts only', () => {
  it('a REVIVE keeps the stored why — no new write on the column', async () => {
    const { calls } = makeClient([{ data: [{ id: 'link-1' }], error: null }]);
    await linkMarkToGoal({ goalId: GOAL, markId: MARK, userId: USER, why: 'new words' });
    // Same pair, same reason: the old rationale returns with the link.
    expect(writes(calls)).toEqual(['goal_mark_links.update']);
    expect(bodyOf(calls, 'goal_mark_links', 'update')).not.toHaveProperty('why');
  });

  it('a genuinely new link inserts the normalized why', async () => {
    const { calls } = makeClient([
      { data: [], error: null },
      { data: null, error: null },
    ]);
    await linkMarkToGoal({ goalId: GOAL, markId: MARK, userId: USER, why: '  keep this  ' });
    expect(bodyOf(calls, 'goal_mark_links', 'insert').why).toBe('keep this');
  });

  it('a manual link (no why) stores null', async () => {
    const { calls } = makeClient([
      { data: [], error: null },
      { data: null, error: null },
    ]);
    await linkMarkToGoal({ goalId: GOAL, markId: MARK, userId: USER });
    expect(bodyOf(calls, 'goal_mark_links', 'insert').why).toBeNull();
  });
});

describe('linkMarkToGoal — idempotency (UNIQUE goal_id, mark_id)', () => {
  it('REVIVES a previously unlinked pair instead of inserting a duplicate', async () => {
    // The failure mode of the shorter `upsert(..., ignoreDuplicates)` version:
    // the row exists but is tombstoned, so an ignored conflict would leave the
    // mark unlinked and report success.
    const { calls } = makeClient([{ data: [{ id: 'link-1' }], error: null }]);
    await linkMarkToGoal({ goalId: GOAL, markId: MARK, userId: USER });

    expect(writes(calls)).toEqual(['goal_mark_links.update']);
    expect(bodyOf(calls, 'goal_mark_links', 'update')).toMatchObject({ deleted_at: null });
  });

  it('inserts only when no row exists for the pair', async () => {
    const { calls } = makeClient([
      { data: [], error: null },
      { data: null, error: null },
    ]);
    await linkMarkToGoal({ goalId: GOAL, markId: MARK, userId: USER });
    expect(writes(calls)).toEqual(['goal_mark_links.update', 'goal_mark_links.insert']);
  });

  it('re-linking an already-live pair is a no-op, not a second row', async () => {
    const { calls } = makeClient([{ data: [{ id: 'link-1' }], error: null }]);
    await linkMarkToGoal({ goalId: GOAL, markId: MARK, userId: USER });
    expect(writes(calls).filter((w) => w.endsWith('insert'))).toHaveLength(0);
  });

  it('never rewrites the link primary key', async () => {
    const { calls } = makeClient([{ data: [{ id: 'link-1' }], error: null }]);
    await linkMarkToGoal({ goalId: GOAL, markId: MARK, userId: USER });
    expect(bodyOf(calls, 'goal_mark_links', 'update')).not.toHaveProperty('id');
  });
});

describe('unlinkMarkFromGoal', () => {
  it('tombstones the link and leaves the mark alone', async () => {
    const { calls } = makeClient([{ data: null, error: null }]);
    await unlinkMarkFromGoal(GOAL, MARK);

    expect(writes(calls)).toEqual(['goal_mark_links.update']);
    // Unlinking is "this mark no longer serves this goal", not "delete it".
    expect(calls.some((c) => c.table === 'marks')).toBe(false);
    expect(calls.map((c) => c.method)).not.toContain('delete');
  });
});

describe('archiveMark', () => {
  it('tombstones links first and the mark LAST, so a failure is retryable', async () => {
    const { calls } = makeClient([
      { data: null, error: null },
      { data: null, error: null },
    ]);
    await archiveMark(MARK);
    expect(writes(calls)).toEqual(['goal_mark_links.update', 'marks.update']);
  });

  it('never issues a DELETE', async () => {
    const { calls } = makeClient([
      { data: null, error: null },
      { data: null, error: null },
    ]);
    await archiveMark(MARK);
    expect(calls.map((c) => c.method)).not.toContain('delete');
  });

  it('leaves the mark live when the link step fails', async () => {
    const { calls } = makeClient([{ data: null, error: { code: '42501', message: 'no' } }]);
    await expect(archiveMark(MARK)).rejects.toMatchObject({ kind: 'permission' });
    expect(writes(calls)).not.toContain('marks.update');
  });
});

describe('editMark', () => {
  it('sends only what changed — an absent field is not nulled', async () => {
    const { calls } = makeClient([{ data: null, error: null }]);
    await editMark(MARK, { name: ' Walk ' });
    const patch = bodyOf(calls, 'marks', 'update');
    expect(patch).toMatchObject({ name: 'Walk' });
    expect(Object.keys(patch).sort()).toEqual(['name', 'updated_at']);
  });

  it('updates cadence field by field, leaving untouched ranges alone', async () => {
    const { calls } = makeClient([{ data: null, error: null }]);
    await editMark(MARK, { cadence: { weekly_target: 7 } });
    const patch = bodyOf(calls, 'marks', 'update');
    expect(patch).toMatchObject({ weekly_target: 7 });
    expect(patch).not.toHaveProperty('frequency_min');
  });

  it('refuses an empty name', async () => {
    const { from } = makeClient([]);
    await expect(editMark(MARK, { name: '   ' })).rejects.toMatchObject({ kind: 'unknown' });
    expect(from).not.toHaveBeenCalled();
  });
});
