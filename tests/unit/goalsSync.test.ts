/**
 * M6-B — goals + goal_mark_links reach Supabase.
 *
 * Contract under test (the bug: a reinstall lost every goal while marks came back):
 *  1. A deletion is a TOMBSTONE, and the pull RETURNS tombstones — that is how a
 *     deletion travels. Filtering them would strand the delete on one device.
 *  2. Last-write-wins on the CLIENT's updated_at (no moddatetime trigger exists).
 *  3. Every link write carries user_id — RLS rejects a link without it.
 *  4. The free-tier goal cap (armed by this milestone) surfaces as the existing
 *     GoalLimitError copy, does NOT wedge the push cursor, and does NOT retry
 *     forever: refused ids are held and re-attempted on later pushes.
 */

const mockPushGoals = jest.fn(async (_goals: unknown[]) => {});
const mockPushLinks = jest.fn(async (_links: unknown[]) => {});
let mockRemoteGoals: unknown[] = [];
let mockRemoteLinks: unknown[] = [];
const mockFetchGoalsArgs: (string | null)[] = [];
const mockFetchLinksArgs: (string | null)[] = [];

jest.mock('../../lib/db/goalsSupabase', () => {
  const actual = jest.requireActual('../../lib/db/goalsSupabase');
  return {
    // isGoalCapRejection is the real classifier — the point is that a real
    // Postgres RLS refusal is recognised, not that a stub says so.
    isGoalCapRejection: actual.isGoalCapRejection,
    pushGoals: (goals: unknown[]) => mockPushGoals(goals),
    pushGoalMarkLinks: (links: unknown[]) => mockPushLinks(links),
    fetchGoalsForUser: async (_u: string, since: string | null) => {
      mockFetchGoalsArgs.push(since);
      return mockRemoteGoals;
    },
    fetchGoalMarkLinksForUser: async (_u: string, since: string | null) => {
      mockFetchLinksArgs.push(since);
      return mockRemoteLinks;
    },
  };
});

let mockLocalGoals: any[] = [];
let mockLocalLinks: any[] = [];
const mockMergedGoals: any[] = [];
const mockMergedLinks: any[] = [];

jest.mock('../../lib/db/goalsDb', () => ({
  loadDirtyGoals: async (userId: string, since: string) =>
    mockLocalGoals.filter((g) => g.user_id === userId && g.updated_at > since),
  loadDirtyLinks: async (userId: string, since: string) =>
    mockLocalLinks.filter((l) => l.user_id === userId && l.updated_at > since),
  loadGoalsByIds: async (userId: string, ids: string[]) =>
    mockLocalGoals.filter((g) => g.user_id === userId && ids.includes(g.id)),
  mergeRemoteGoal: async (g: any) => {
    mockMergedGoals.push(g);
    return true;
  },
  mergeRemoteGoalMarkLink: async (l: any) => {
    mockMergedLinks.push(l);
    return true;
  },
}));

/* eslint-disable import/first -- jest.mock factories must precede these imports */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { pushGoalsAndLinks, pullGoalsAndLinks } from '../../lib/sync/goalsSync';
import { readGoalCapBlockedIds } from '../../lib/sync/goalCapBlocked';
import { isGoalCapRejection } from '../../lib/db/goalsSupabase';
import { GOAL_LIMIT_MESSAGE } from '../../lib/copy';
/* eslint-enable import/first */

const USER = '11111111-2222-3333-4444-555555555555';
const OTHER_USER = '99999999-8888-7777-6666-555555555555';
const EPOCH = '1970-01-01T00:00:00.000Z';

function makeGoal(over: Partial<any> = {}): any {
  return {
    id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    user_id: USER,
    title: 'Run a half marathon',
    sort_index: 0,
    status: 'active',
    current_mark_count: 0,
    created_at: '2026-07-01T00:00:00.000Z',
    updated_at: '2026-07-10T00:00:00.000Z',
    deleted_at: null,
    ...over,
  };
}

function makeLink(over: Partial<any> = {}): any {
  return {
    id: 'link-1111-2222-3333-444444444444',
    goal_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    mark_id: 'mark-1111-2222-3333-444444444444',
    user_id: USER,
    created_at: '2026-07-01T00:00:00.000Z',
    updated_at: '2026-07-10T00:00:00.000Z',
    deleted_at: null,
    ...over,
  };
}

/** What Postgres actually returns when a RESTRICTIVE policy refuses the row. */
function rlsRefusal() {
  return Object.assign(new Error('new row violates row-level security policy for table "goals"'), {
    code: '42501',
  });
}

beforeEach(async () => {
  await AsyncStorage.clear();
  mockPushGoals.mockReset();
  mockPushGoals.mockImplementation(async () => {});
  mockPushLinks.mockReset();
  mockPushLinks.mockImplementation(async () => {});
  mockRemoteGoals = [];
  mockRemoteLinks = [];
  mockFetchGoalsArgs.length = 0;
  mockFetchLinksArgs.length = 0;
  mockLocalGoals = [];
  mockLocalLinks = [];
  mockMergedGoals.length = 0;
  mockMergedLinks.length = 0;
});

describe('isGoalCapRejection — a paywall, not a fault', () => {
  test('recognises a Postgres RLS refusal by code', () => {
    expect(isGoalCapRejection(rlsRefusal())).toBe(true);
  });

  test('recognises it by message when the code is absent', () => {
    expect(isGoalCapRejection({ message: 'new row violates row-level security policy' })).toBe(true);
  });

  test('does NOT swallow ordinary failures', () => {
    expect(isGoalCapRejection({ code: 'PGRST204', message: 'column not found' })).toBe(false);
    expect(isGoalCapRejection(new Error('Network request failed'))).toBe(false);
    expect(isGoalCapRejection(null)).toBe(false);
  });
});

describe('push — goals and links reach the server', () => {
  test('pushes goals dirty since the push cursor', async () => {
    mockLocalGoals = [makeGoal()];
    const result = await pushGoalsAndLinks(USER, EPOCH);
    expect(result.pushedGoals).toBe(1);
    expect(mockPushGoals).toHaveBeenCalledTimes(1);
  });

  test('a tombstoned goal is PUSHED, not filtered — the tombstone is the deletion', async () => {
    mockLocalGoals = [makeGoal({ deleted_at: '2026-07-12T00:00:00.000Z', updated_at: '2026-07-12T00:00:00.000Z' })];
    await pushGoalsAndLinks(USER, EPOCH);
    const [pushed] = mockPushGoals.mock.calls[0] as [any[]];
    expect(pushed).toHaveLength(1);
    expect(pushed[0].deleted_at).toBe('2026-07-12T00:00:00.000Z');
  });

  test('skips a link with no user_id — RLS would reject it silently', async () => {
    mockLocalGoals = [makeGoal()];
    mockLocalLinks = [makeLink({ user_id: undefined })];
    const result = await pushGoalsAndLinks(USER, EPOCH);
    expect(result.pushedLinks).toBe(0);
    expect(mockPushLinks).not.toHaveBeenCalled();
  });

  test('never pushes another user’s rows', async () => {
    mockLocalGoals = [makeGoal({ user_id: OTHER_USER })];
    const result = await pushGoalsAndLinks(USER, EPOCH);
    expect(result.pushedGoals).toBe(0);
  });

  test('a non-cap error propagates so the cursor cannot advance past unsent rows', async () => {
    mockLocalGoals = [makeGoal()];
    mockPushGoals.mockRejectedValue(new Error('Network request failed'));
    await expect(pushGoalsAndLinks(USER, EPOCH)).rejects.toThrow('Network request failed');
  });
});

describe('free-tier goal cap — armed the moment goals sync', () => {
  test('a refused goal is reported, not thrown — the push completes', async () => {
    mockLocalGoals = [makeGoal({ id: 'goal-refused' })];
    mockPushGoals.mockRejectedValue(rlsRefusal());

    const result = await pushGoalsAndLinks(USER, EPOCH);

    expect(result.capBlockedGoalIds).toEqual(['goal-refused']);
    expect(result.pushedGoals).toBe(0);
  });

  test('the refusal maps to the SAME copy the in-app limit uses', async () => {
    mockLocalGoals = [makeGoal({ id: 'goal-refused' })];
    mockPushGoals.mockRejectedValue(rlsRefusal());
    const result = await pushGoalsAndLinks(USER, EPOCH);
    // The sync layer surfaces GOAL_LIMIT_MESSAGE (useSync.ts) rather than a raw
    // Postgres string — assert the copy exists and is the paywall line.
    expect(result.capBlockedGoalIds.length).toBeGreaterThan(0);
    expect(GOAL_LIMIT_MESSAGE).toMatch(/2 goals/);
  });

  test('one refused goal does NOT block the others — they are isolated per goal', async () => {
    mockLocalGoals = [
      makeGoal({ id: 'goal-ok-1' }),
      makeGoal({ id: 'goal-refused' }),
      makeGoal({ id: 'goal-ok-2' }),
    ];
    // Batch fails, then per-goal isolation refuses only the capped one.
    mockPushGoals.mockImplementation(async (goals: any[]) => {
      if (goals.length > 1 || goals[0].id === 'goal-refused') throw rlsRefusal();
    });

    const result = await pushGoalsAndLinks(USER, EPOCH);

    expect(result.capBlockedGoalIds).toEqual(['goal-refused']);
    expect(result.pushedGoals).toBe(2);
  });

  test('links to a refused goal are held back — their RLS checks the goal exists', async () => {
    mockLocalGoals = [makeGoal({ id: 'goal-refused' })];
    mockLocalLinks = [makeLink({ goal_id: 'goal-refused' })];
    mockPushGoals.mockRejectedValue(rlsRefusal());

    const result = await pushGoalsAndLinks(USER, EPOCH);

    expect(result.pushedLinks).toBe(0);
    expect(mockPushLinks).not.toHaveBeenCalled();
  });

  test('a refused goal is remembered and re-attempted ignoring the cursor', async () => {
    mockLocalGoals = [makeGoal({ id: 'goal-refused', updated_at: '2026-07-10T00:00:00.000Z' })];
    mockPushGoals.mockRejectedValue(rlsRefusal());
    await pushGoalsAndLinks(USER, EPOCH);
    expect(await readGoalCapBlockedIds()).toEqual(['goal-refused']);

    // Later push: the cursor is now NEWER than the goal, so a cursor-only query
    // would never find it again. It must still be retried.
    mockPushGoals.mockReset();
    mockPushGoals.mockImplementation(async () => {});
    const result = await pushGoalsAndLinks(USER, '2026-07-20T00:00:00.000Z');

    expect(result.pushedGoals).toBe(1);
    expect(result.capBlockedGoalIds).toEqual([]);
    // Cleared once it lands — no infinite retry.
    expect(await readGoalCapBlockedIds()).toEqual([]);
  });
});

describe('pull — tombstones travel', () => {
  test('applies a remote tombstone (a goal deleted on another device)', async () => {
    mockRemoteGoals = [makeGoal({ deleted_at: '2026-07-12T00:00:00.000Z' })];
    const result = await pullGoalsAndLinks(USER, '2026-07-01T00:00:00.000Z');
    expect(result.appliedGoalTombstones).toBe(1);
    expect(mockMergedGoals[0].deleted_at).toBe('2026-07-12T00:00:00.000Z');
  });

  test('passes the pull cursor to both fetches, and null for a first sync', async () => {
    await pullGoalsAndLinks(USER, '2026-07-01T00:00:00.000Z');
    expect(mockFetchGoalsArgs).toEqual(['2026-07-01T00:00:00.000Z']);
    expect(mockFetchLinksArgs).toEqual(['2026-07-01T00:00:00.000Z']);

    mockFetchGoalsArgs.length = 0;
    await pullGoalsAndLinks(USER, null);
    expect(mockFetchGoalsArgs).toEqual([null]);
  });

  test('deduplicates by id, newest updated_at wins', async () => {
    mockRemoteGoals = [
      makeGoal({ id: 'g1', title: 'stale', updated_at: '2026-07-01T00:00:00.000Z' }),
      makeGoal({ id: 'g1', title: 'fresh', updated_at: '2026-07-09T00:00:00.000Z' }),
    ];
    await pullGoalsAndLinks(USER, null);
    expect(mockMergedGoals).toHaveLength(1);
    expect(mockMergedGoals[0].title).toBe('fresh');
  });

  test('merges links as well as goals', async () => {
    mockRemoteLinks = [makeLink()];
    const result = await pullGoalsAndLinks(USER, null);
    expect(result.mergedLinks).toBe(1);
  });

  test('a signed-out (non-uuid) user pulls nothing', async () => {
    mockRemoteGoals = [makeGoal()];
    const result = await pullGoalsAndLinks('local', null);
    expect(result.mergedGoals).toBe(0);
  });
});

/**
 * M6 review blocker — migrated goals must survive the SHARED push cursor.
 *
 * The bug: a migrated goal keeps its real (old) updated_at, but the push is a
 * cursor query against the cursor MARKS already advance. Any user who has ever
 * synced has a cursor newer than their goals, so every migrated goal was silently
 * excluded from every push, forever — reproducing the founder's original "goals
 * lost on reinstall" bug inside the milestone built to fix it.
 *
 * Every test above passes EPOCH, the one cursor value where `updated_at > cursor`
 * is trivially true, which is exactly why they all missed it. These use a REAL,
 * non-epoch cursor.
 */
describe('backfill — a migrated goal is older than the push cursor', () => {
  // A goal last touched a week ago; the shared cursor advanced yesterday.
  const OLD_GOAL_UPDATED = '2026-07-09T00:00:00.000Z';
  const LATER_CURSOR = '2026-07-15T00:00:00.000Z';

  it('pushes a goal whose updated_at predates the cursor', async () => {
    mockLocalGoals = [makeGoal({ id: 'g-migrated', updated_at: OLD_GOAL_UPDATED })];

    const result = await pushGoalsAndLinks(USER, LATER_CURSOR);

    expect(result.pushedGoals).toBe(1);
    expect(mockPushGoals).toHaveBeenCalledTimes(1);
    expect(mockPushGoals.mock.calls[0][0]).toHaveLength(1);
  });

  it('pushes migrated LINKS too — they carry migrated timestamps as well', async () => {
    mockLocalGoals = [makeGoal({ id: 'g-migrated', updated_at: OLD_GOAL_UPDATED })];
    mockLocalLinks = [
      { id: 'l1', goal_id: 'g-migrated', mark_id: 'm1', user_id: USER, updated_at: OLD_GOAL_UPDATED, deleted_at: null },
    ];

    const result = await pushGoalsAndLinks(USER, LATER_CURSOR);

    expect(result.pushedLinks).toBe(1);
  });

  it('reverts to incremental once the backfill has succeeded', async () => {
    mockLocalGoals = [makeGoal({ id: 'g-migrated', updated_at: OLD_GOAL_UPDATED })];

    await pushGoalsAndLinks(USER, LATER_CURSOR);      // backfill run
    mockPushGoals.mockClear();
    const second = await pushGoalsAndLinks(USER, LATER_CURSOR);

    // Nothing changed locally, so the cursor legitimately excludes it now.
    expect(second.pushedGoals).toBe(0);
    expect(mockPushGoals).not.toHaveBeenCalled();
  });

  it('does NOT mark the backfill done when the push throws — it retries', async () => {
    mockLocalGoals = [makeGoal({ id: 'g-migrated', updated_at: OLD_GOAL_UPDATED })];
    mockPushGoals.mockImplementationOnce(async () => {
      throw new Error('network down');
    });

    await expect(pushGoalsAndLinks(USER, LATER_CURSOR)).rejects.toThrow('network down');

    // Next sync must still backfill, or the goals are stranded forever.
    mockPushGoals.mockImplementation(async () => {});
    const retry = await pushGoalsAndLinks(USER, LATER_CURSOR);
    expect(retry.pushedGoals).toBe(1);
  });

  it('self-heals a user who already installed M6 before this fix', async () => {
    // No migration re-runs; their goals are simply sitting local and un-pushed.
    mockLocalGoals = [
      makeGoal({ id: 'g-stranded-1', updated_at: OLD_GOAL_UPDATED }),
      makeGoal({ id: 'g-stranded-2', updated_at: OLD_GOAL_UPDATED }),
    ];

    const result = await pushGoalsAndLinks(USER, LATER_CURSOR);
    expect(result.pushedGoals).toBe(2);
  });

  it('a user with no goals still settles — no epoch query every sync', async () => {
    mockLocalGoals = [];
    await pushGoalsAndLinks(USER, LATER_CURSOR);
    mockLocalGoals = [makeGoal({ id: 'g-new', updated_at: OLD_GOAL_UPDATED })];

    // Backfill already settled, so an OLD goal appearing later is not swept up.
    const second = await pushGoalsAndLinks(USER, LATER_CURSOR);
    expect(second.pushedGoals).toBe(0);
  });

  /**
   * QC1 §2 — the strand-hole the settled backfill flag leaves open.
   *
   * Once the goals-backfill flag is set, the push reverts to a plain cursor query.
   * A link the QC1 reconcile DERIVES later (from a surviving mark.goal_id after a
   * reinstall) must still reach the server. It does — precisely because reconcile
   * stamps updated_at = now(), so it is NEWER than the push cursor and the normal
   * incremental push catches it with no dependency on the backfill flag. This is
   * why the fix does NOT touch migrated updated_at wholesale (that would break LWW).
   */
  it('a derivable link appearing AFTER the backfill settled is not stranded — fresh updated_at is pushed incrementally', async () => {
    // Settle the backfill with nothing to send.
    mockLocalGoals = [];
    mockLocalLinks = [];
    await pushGoalsAndLinks(USER, LATER_CURSOR);
    mockPushLinks.mockClear();

    // The reconcile has since derived a link with a FRESH (post-cursor) updated_at.
    const FRESH = '2026-07-18T12:00:00.000Z'; // > LATER_CURSOR
    mockLocalGoals = [makeGoal({ id: 'g-healed', updated_at: OLD_GOAL_UPDATED })];
    mockLocalLinks = [
      { id: 'l-derived', goal_id: 'g-healed', mark_id: 'm1', user_id: USER, updated_at: FRESH, deleted_at: null },
    ];

    const result = await pushGoalsAndLinks(USER, LATER_CURSOR);

    // The old goal is legitimately NOT swept (LWW intact), but the fresh derived
    // link IS pushed — it is not stranded by the settled backfill flag.
    expect(result.pushedGoals).toBe(0);
    expect(result.pushedLinks).toBe(1);
    expect(mockPushLinks).toHaveBeenCalledTimes(1);
  });
});
