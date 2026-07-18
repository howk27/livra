/**
 * QC1 — reconcile goal_mark_links from the surviving mark.goal_id.
 *
 * The founder's reinstall bug: marks came back (mark.goal_id survives), the goal
 * came back, but goal_mark_links did NOT — so Focus/Goals showed the goal with no
 * marks feeding it, yet the mark still said "Working toward: {goal}". These tests
 * prove the reconcile derives the missing link from the surviving mark.goal_id,
 * respects intentional unlinks, and is idempotent.
 *
 * Backend: the AsyncStorage (web) path is forced so the whole round-trip is real —
 * seed goal + marks, run reconcile, read loadGoalsForUser / loadDirtyLinks back.
 * (The native SQLite path shares the exact same facade + goalsSqliteSupported gate.)
 */

// Force goalsDb onto its AsyncStorage backend: a real, round-tripping store.
jest.mock('../../lib/db/goalsSqlite', () => {
  const actual = jest.requireActual('../../lib/db/goalsSqlite');
  return { ...actual, goalsSqliteSupported: () => false };
});

/* eslint-disable import/first -- jest.mock factory must precede these imports */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { reconcileGoalMarkLinks } from '../../lib/sync/goalsReconcile';
import {
  loadGoalsForUser,
  loadDirtyLinks,
  loadLinksForUser,
  resetGoalsMigrationForTests,
} from '../../lib/db/goalsDb';
import type { Goal, GoalMarkLink } from '../../types/goal';
/* eslint-enable import/first */

const USER = '11111111-2222-3333-4444-555555555555';
const OTHER_USER = '99999999-8888-7777-6666-555555555555';
const GOAL_ID = 'goal-aaaa';
const MARK_ID = 'mark-bbbb';
const OLD = '2026-07-01T00:00:00.000Z';
const NOW = '2026-07-18T12:00:00.000Z';
const BEFORE_NOW = '2026-07-18T00:00:00.000Z';

function makeGoal(over: Partial<Goal> = {}): Goal {
  return {
    id: GOAL_ID,
    user_id: USER,
    title: 'Run a half marathon',
    sort_index: 0,
    status: 'active',
    current_mark_count: 0,
    created_at: OLD,
    updated_at: OLD,
    deleted_at: null,
    ...over,
  } as Goal;
}

async function seedGoals(goals: Goal[]): Promise<void> {
  await AsyncStorage.setItem('@livra_goals', JSON.stringify(goals));
}
async function seedLinks(links: GoalMarkLink[]): Promise<void> {
  await AsyncStorage.setItem('@livra_goal_mark_links', JSON.stringify(links));
}

beforeEach(async () => {
  await AsyncStorage.clear();
  resetGoalsMigrationForTests();
});

describe('reconcile — the reinstall repair', () => {
  test('REPRO: goal + mark(goal_id) present, links empty → derives the link and populates linked_mark_ids', async () => {
    await seedGoals([makeGoal()]);
    await seedLinks([]);

    // Sanity: before reconcile the goal shows NO marks — the founder's symptom.
    const before = await loadGoalsForUser(USER);
    expect(before[0].linked_mark_ids).toEqual([]);

    const result = await reconcileGoalMarkLinks(
      USER,
      [{ id: MARK_ID, goal_id: GOAL_ID, deleted_at: null }],
      NOW,
    );

    expect(result.derivedLinks).toBe(1);

    // The goal→mark surface is repaired.
    const after = await loadGoalsForUser(USER);
    expect(after[0].linked_mark_ids).toEqual([MARK_ID]);

    // The derived link is FRESH (updated_at = now) so the next push carries it up.
    const dirty = await loadDirtyLinks(USER, BEFORE_NOW);
    expect(dirty).toHaveLength(1);
    expect(dirty[0]).toMatchObject({ goal_id: GOAL_ID, mark_id: MARK_ID, user_id: USER, updated_at: NOW });
  });

  test('does NOT resurrect an intentionally unlinked (tombstoned) pair', async () => {
    await seedGoals([makeGoal()]);
    await seedLinks([
      {
        id: 'link-1',
        goal_id: GOAL_ID,
        mark_id: MARK_ID,
        user_id: USER,
        created_at: OLD,
        updated_at: OLD,
        deleted_at: OLD, // user unlinked it
      },
    ]);

    const result = await reconcileGoalMarkLinks(
      USER,
      [{ id: MARK_ID, goal_id: GOAL_ID, deleted_at: null }],
      NOW,
    );

    expect(result.derivedLinks).toBe(0);
    // Still unlinked — the goal shows no marks, and the tombstone is untouched.
    const goals = await loadGoalsForUser(USER);
    expect(goals[0].linked_mark_ids).toEqual([]);
    const live = await loadLinksForUser(USER);
    expect(live).toHaveLength(0);
  });

  test('is idempotent — a second run derives nothing and creates no duplicate', async () => {
    await seedGoals([makeGoal()]);
    await seedLinks([]);

    const first = await reconcileGoalMarkLinks(USER, [{ id: MARK_ID, goal_id: GOAL_ID }], NOW);
    expect(first.derivedLinks).toBe(1);

    const second = await reconcileGoalMarkLinks(USER, [{ id: MARK_ID, goal_id: GOAL_ID }], '2026-07-19T00:00:00.000Z');
    expect(second.derivedLinks).toBe(0);

    const live = await loadLinksForUser(USER);
    expect(live).toHaveLength(1); // exactly one link, not two
  });

  test('a mark whose goal_id points at no live owned goal is skipped (no orphan link)', async () => {
    await seedGoals([makeGoal({ deleted_at: OLD })]); // goal is tombstoned locally
    await seedLinks([]);

    const result = await reconcileGoalMarkLinks(USER, [{ id: MARK_ID, goal_id: GOAL_ID }], NOW);

    expect(result.derivedLinks).toBe(0);
    expect(await loadLinksForUser(USER)).toHaveLength(0);
  });

  test('marks without a goal_id are a no-op — nothing to reconcile', async () => {
    await seedGoals([makeGoal()]);
    await seedLinks([]);

    const result = await reconcileGoalMarkLinks(USER, [{ id: MARK_ID, goal_id: null }], NOW);
    expect(result.derivedLinks).toBe(0);
  });

  test('a signed-out (non-uuid) user reconciles nothing', async () => {
    await seedGoals([makeGoal()]);
    const result = await reconcileGoalMarkLinks('local', [{ id: MARK_ID, goal_id: GOAL_ID }], NOW);
    expect(result.derivedLinks).toBe(0);
  });

  test('does not derive a link for another user’s goal', async () => {
    await seedGoals([makeGoal({ user_id: OTHER_USER })]);
    await seedLinks([]);
    const result = await reconcileGoalMarkLinks(USER, [{ id: MARK_ID, goal_id: GOAL_ID }], NOW);
    expect(result.derivedLinks).toBe(0);
  });
});
