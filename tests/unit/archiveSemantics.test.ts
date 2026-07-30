// M9 Phase 3 Task 3 — the archive rule (T2), refined for many-to-many.
//
// The rule has two halves and only the first has ever been applied in production.
// Measured live 2026-07-30 on the account under test: across 2 already-deleted
// goals, all 6 of their links are correctly tombstoned — and all 6 marks left
// behind are still LIVE rows with no live link anywhere. Those orphans are T2 as
// the founder experiences it.
//
// So the guard below is written in BOTH directions on purpose. A test that only
// checks "archiving hides the goal's marks" passes against a naive cascade, and a
// naive cascade is the bug D-6 creates: it would delete a mark that another,
// surviving goal still depends on.

import {
  marksLosingTheirLastLink,
  archiveGoal,
  createGoal,
  renameGoal,
  reorderGoals,
  type LiveLink,
} from '@/lib/data/mutations/goals';
import { setSupabaseClientOverride } from '@/lib/supabase';

jest.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: null }) }));

const USER = '3fe1a23e-2ec2-4830-a68b-42b65fc3bcb0';
const GOAL_A = 'aaaaaaaa-1111-4111-8111-111111111111';
const GOAL_B = 'bbbbbbbb-2222-4222-8222-222222222222';
const MARK_SOLO = 'c1c1c1c1-3333-4333-8333-333333333333';
const MARK_SHARED = 'd2d2d2d2-4444-4444-8444-444444444444';
const MARK_UNRELATED = 'e3e3e3e3-5555-4555-8555-555555555555';

// ─── A recording fake client ────────────────────────────────────────────────

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
    for (const method of ['select', 'insert', 'update', 'delete', 'upsert', 'eq', 'is', 'in', 'order']) {
      builder[method] = jest.fn(chain(method));
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

/** The tables written to, in order, ignoring the reads. */
function writeOrder(calls: Call[]): string[] {
  return calls
    .filter((c) => c.method === 'update' || c.method === 'insert' || c.method === 'delete')
    .map((c) => `${c.table}.${c.method}`);
}

afterEach(() => {
  setSupabaseClientOverride(null);
  jest.clearAllMocks();
});

// ─── THE RULE, as a pure decision ───────────────────────────────────────────

describe('marksLosingTheirLastLink', () => {
  const links: LiveLink[] = [
    { goal_id: GOAL_A, mark_id: MARK_SOLO },
    { goal_id: GOAL_A, mark_id: MARK_SHARED },
    { goal_id: GOAL_B, mark_id: MARK_SHARED },
    { goal_id: GOAL_B, mark_id: MARK_UNRELATED },
  ];

  it('DIRECTION 1: a mark linked only to the archived goal loses its last link', () => {
    expect(marksLosingTheirLastLink(links, GOAL_A)).toContain(MARK_SOLO);
  });

  it('DIRECTION 2: a mark still linked to a surviving goal SURVIVES', () => {
    // This is the direction a naive cascade fails, and the reason both are pinned.
    expect(marksLosingTheirLastLink(links, GOAL_A)).not.toContain(MARK_SHARED);
  });

  it('never touches a mark that was not linked to the archived goal at all', () => {
    // An unlinked "daily habit" mark is first class in this app — the free-tier
    // ceiling counts it — so a sweep that caught it would delete something the
    // user never connected to the goal they removed.
    expect(marksLosingTheirLastLink(links, GOAL_A)).not.toContain(MARK_UNRELATED);
  });

  it('returns exactly one orphan for this fixture, not two', () => {
    expect(marksLosingTheirLastLink(links, GOAL_A)).toEqual([MARK_SOLO]);
  });

  it('archiving the other goal orphans only what IT alone held', () => {
    expect(marksLosingTheirLastLink(links, GOAL_B).sort()).toEqual([MARK_UNRELATED]);
  });

  it('a goal with no links orphans nothing', () => {
    expect(marksLosingTheirLastLink(links, 'ffffffff-6666-4666-8666-666666666666')).toEqual([]);
  });

  it('already-tombstoned links cannot keep a mark alive (they are not live links)', () => {
    // The caller passes LIVE links only. If a dead link to GOAL_B were included,
    // MARK_SHARED would wrongly survive; excluding it is what makes the rule read
    // "live link to a live goal".
    const liveOnly: LiveLink[] = [{ goal_id: GOAL_A, mark_id: MARK_SHARED }];
    expect(marksLosingTheirLastLink(liveOnly, GOAL_A)).toEqual([MARK_SHARED]);
  });
});

// ─── THE SEQUENCE ───────────────────────────────────────────────────────────

describe('archiveGoal', () => {
  const linkRows = [
    { goal_id: GOAL_A, mark_id: MARK_SOLO },
    { goal_id: GOAL_A, mark_id: MARK_SHARED },
    { goal_id: GOAL_B, mark_id: MARK_SHARED },
  ];

  it('tombstones marks, then links, then the goal LAST', async () => {
    const { calls } = makeClient([
      { data: linkRows, error: null }, // read live links
      { data: null, error: null }, // marks update
      { data: null, error: null }, // links update
      { data: null, error: null }, // goal update
    ]);

    await archiveGoal(GOAL_A, USER);

    // The goal is the row the user taps. It goes last so every partial failure
    // leaves the goal on screen and a second tap finishes the job.
    expect(writeOrder(calls)).toEqual(['marks.update', 'goal_mark_links.update', 'goals.update']);
  });

  it('never issues a DELETE (D-8/D-9: every row is retained)', async () => {
    const { calls } = makeClient([
      { data: linkRows, error: null },
      { data: null, error: null },
      { data: null, error: null },
      { data: null, error: null },
    ]);

    await archiveGoal(GOAL_A, USER);
    expect(calls.map((c) => c.method)).not.toContain('delete');
  });

  it('tombstones ONLY the mark that lost its last link', async () => {
    const { calls } = makeClient([
      { data: linkRows, error: null },
      { data: null, error: null },
      { data: null, error: null },
      { data: null, error: null },
    ]);

    await archiveGoal(GOAL_A, USER);

    const markIds = calls.find((c) => c.table === 'marks' && c.method === 'in')?.args[1];
    expect(markIds).toEqual([MARK_SOLO]);
  });

  it('writes no marks update at all when nothing is orphaned', async () => {
    const sharedOnly = [
      { goal_id: GOAL_A, mark_id: MARK_SHARED },
      { goal_id: GOAL_B, mark_id: MARK_SHARED },
    ];
    const { calls } = makeClient([
      { data: sharedOnly, error: null },
      { data: null, error: null },
      { data: null, error: null },
    ]);

    await archiveGoal(GOAL_A, USER);
    expect(writeOrder(calls)).toEqual(['goal_mark_links.update', 'goals.update']);
  });

  it('every step is idempotent — each filters on deleted_at is null', async () => {
    const { calls } = makeClient([
      { data: linkRows, error: null },
      { data: null, error: null },
      { data: null, error: null },
      { data: null, error: null },
    ]);

    await archiveGoal(GOAL_A, USER);

    for (const table of ['marks', 'goal_mark_links', 'goals']) {
      const isCalls = calls.filter((c) => c.table === table && c.method === 'is');
      expect(isCalls.some((c) => c.args[0] === 'deleted_at' && c.args[1] === null)).toBe(true);
    }
  });

  it('stops at the failing step and leaves the goal live for a retry', async () => {
    const { calls } = makeClient([
      { data: linkRows, error: null },
      { data: null, error: { code: '42501', message: 'permission denied' } },
    ]);

    await expect(archiveGoal(GOAL_A, USER)).rejects.toMatchObject({ kind: 'permission' });
    expect(writeOrder(calls)).not.toContain('goals.update');
  });

  it('classifies a refusal instead of leaking Postgres text', async () => {
    makeClient([{ data: null, error: { code: '42501', message: 'permission denied for table goals' } }]);
    await expect(archiveGoal(GOAL_A, USER)).rejects.not.toMatchObject({
      message: expect.stringContaining('permission denied for table'),
    });
  });

  it('rejects a non-uuid before any request is made', async () => {
    const { from } = makeClient([]);
    await expect(archiveGoal('not-a-uuid', USER)).rejects.toMatchObject({ kind: 'unknown' });
    expect(from).not.toHaveBeenCalled();
  });
});

// ─── Create / rename / reorder ──────────────────────────────────────────────

describe('createGoal', () => {
  it('writes the goal, then its links, and never a marks row', async () => {
    const { calls } = makeClient([
      { data: { id: GOAL_A, title: 'Run a 5k' }, error: null },
      { data: null, error: null },
    ]);

    await createGoal({
      userId: USER,
      title: '  Run a 5k  ',
      sortIndex: 0,
      markIds: [MARK_SOLO, MARK_SHARED],
    });

    expect(writeOrder(calls)).toEqual(['goals.insert', 'goal_mark_links.insert']);
    // Links are the truth (T6). Creating a goal must not touch `marks`.
    expect(calls.some((c) => c.table === 'marks')).toBe(false);
  });

  it('trims the title', async () => {
    const { calls } = makeClient([{ data: { id: GOAL_A }, error: null }]);
    await createGoal({ userId: USER, title: '  Run a 5k  ', sortIndex: 0 });
    const inserted = calls.find((c) => c.table === 'goals' && c.method === 'insert')?.args[0];
    expect(inserted).toMatchObject({ title: 'Run a 5k' });
  });

  it('carries the link owner, without which RLS drops the row silently (M6-B)', async () => {
    const { calls } = makeClient([{ data: { id: GOAL_A }, error: null }, { data: null, error: null }]);
    await createGoal({ userId: USER, title: 'Run a 5k', sortIndex: 0, markIds: [MARK_SOLO] });
    const links = calls.find((c) => c.table === 'goal_mark_links' && c.method === 'insert')
      ?.args[0] as { user_id: string }[];
    expect(links[0].user_id).toBe(USER);
  });

  it('rejects an empty title before any request is made', async () => {
    const { from } = makeClient([]);
    await expect(createGoal({ userId: USER, title: '   ', sortIndex: 0 })).rejects.toMatchObject({
      kind: 'unknown',
    });
    expect(from).not.toHaveBeenCalled();
  });

  it('skips the link insert entirely when there are no marks', async () => {
    const { calls } = makeClient([{ data: { id: GOAL_A }, error: null }]);
    await createGoal({ userId: USER, title: 'Run a 5k', sortIndex: 0 });
    expect(writeOrder(calls)).toEqual(['goals.insert']);
  });
});

describe('renameGoal', () => {
  it('updates only the title, on a live goal', async () => {
    const { calls } = makeClient([{ data: null, error: null }]);
    await renameGoal(GOAL_A, ' Walk daily ');
    const update = calls.find((c) => c.method === 'update')?.args[0] as Record<string, unknown>;
    expect(update.title).toBe('Walk daily');
    expect(Object.keys(update).sort()).toEqual(['title', 'updated_at']);
  });

  it('refuses an empty title', async () => {
    const { from } = makeClient([]);
    await expect(renameGoal(GOAL_A, '  ')).rejects.toMatchObject({ kind: 'unknown' });
    expect(from).not.toHaveBeenCalled();
  });
});

describe('reorderGoals', () => {
  it('writes sort_index by position, in the order given', async () => {
    const { calls } = makeClient([
      { data: null, error: null },
      { data: null, error: null },
      { data: null, error: null },
    ]);

    await reorderGoals([GOAL_B, GOAL_A, MARK_SOLO]);

    const updates = calls.filter((c) => c.method === 'update').map((c) => c.args[0]);
    expect(updates.map((u) => (u as { sort_index: number }).sort_index)).toEqual([0, 1, 2]);
    const ids = calls.filter((c) => c.method === 'eq').map((c) => c.args[1]);
    expect(ids).toEqual([GOAL_B, GOAL_A, MARK_SOLO]);
  });

  it('stops on the first refusal rather than half-ordering the list', async () => {
    const { calls } = makeClient([
      { data: null, error: null },
      { data: null, error: { code: '42501', message: 'nope' } },
      { data: null, error: null },
    ]);

    await expect(reorderGoals([GOAL_A, GOAL_B, MARK_SOLO])).rejects.toMatchObject({
      kind: 'permission',
    });
    expect(calls.filter((c) => c.method === 'update')).toHaveLength(2);
  });
});
