/**
 * M6-B — goals persistence: tombstones, re-link upsert, and the one-time
 * AsyncStorage → SQLite migration.
 *
 * Contract under test:
 *  1. removeGoal / removeGoalMarkLink SET deleted_at. They previously spliced the
 *     array — a hard delete, which can never propagate, so the next pull simply
 *     resurrected the goal. Every reader filters `!deleted_at`; loadDirty* does
 *     NOT, because the tombstone IS the deletion travelling.
 *  2. Re-linking a tombstoned pair UPSERTS on (goal_id, mark_id) and clears the
 *     tombstone. unique(goal_id, mark_id) survives the tombstone, so an INSERT is
 *     rejected. Unlink-then-re-link is exactly what the goal-detail UI does.
 *  3. Every link write stamps user_id + updated_at — RLS rejects a link without
 *     user_id, silently, at push time.
 *  4. The AsyncStorage migration is idempotent and never double-inserts. Existing
 *     users' goals live ONLY in those keys: losing them here deletes real data.
 */

// ── A capturing fake for expo-sqlite ────────────────────────────────────────
// The repo-wide mock (jest.setup.js) returns [] from every read, which cannot
// express a tombstone. This one records the SQL so the pieces that MUST be true
// of the native path — conflict targets, tombstone filters — are asserted
// directly, in the same spirit as the other contract guards in this suite.
const mockRunCalls: { sql: string; params: unknown[] }[] = [];
let mockRows: unknown[] = [];

jest.mock('expo-sqlite', () => {
  const db = {
    execAsync: jest.fn(async () => {}),
    runAsync: jest.fn(async (sql: string, params: unknown[] = []) => {
      mockRunCalls.push({ sql, params });
      return { changes: 1 };
    }),
    getAllAsync: jest.fn(async () => mockRows),
    withTransactionAsync: jest.fn(async (cb: (d: unknown) => Promise<void>) => cb(db)),
  };
  return { openDatabaseAsync: jest.fn(async () => db) };
});

/* eslint-disable import/first -- jest.mock factory must precede these imports */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  migrateGoalsFromAsyncStorage,
  sqliteUpsertGoalMarkLink,
  sqliteSoftDeleteGoal,
  sqliteSoftDeleteGoalMarkLink,
  resetGoalsDbHandleForTests,
} from '../../lib/db/goalsSqlite';
import { mapGoalToSupabase, mapGoalMarkLinkToSupabase } from '../../lib/sync/mappers';
import type { Goal, GoalMarkLink } from '../../types/goal';
/* eslint-enable import/first */

const USER = '11111111-2222-3333-4444-555555555555';
const GOAL_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const MARK_ID = 'mark1111-2222-3333-4444-555555555555';
const NOW = '2026-07-16T12:00:00.000Z';

function sqlFor(fragment: string): string[] {
  return mockRunCalls.filter((c) => c.sql.includes(fragment)).map((c) => c.sql);
}

const legacyGoal = {
  id: GOAL_ID,
  user_id: USER,
  title: 'Run a half marathon',
  sort_index: 0,
  status: 'active',
  current_mark_count: 3,
  created_at: '2026-07-01T00:00:00.000Z',
  updated_at: '2026-07-10T00:00:00.000Z',
};

const legacyLink = { id: 'link-1', goal_id: GOAL_ID, mark_id: MARK_ID };

beforeEach(async () => {
  await AsyncStorage.clear();
  mockRunCalls.length = 0;
  mockRows = [];
  resetGoalsDbHandleForTests();
});

// ── Tombstones ───────────────────────────────────────────────────────────────

describe('soft delete — a deletion must be able to propagate', () => {
  test('removing a goal UPDATEs deleted_at, never DELETEs the row', async () => {
    await sqliteSoftDeleteGoal(GOAL_ID, NOW);

    const goalWrites = mockRunCalls.filter((c) => c.sql.includes('goals'));
    expect(goalWrites.length).toBeGreaterThan(0);
    for (const call of mockRunCalls) {
      expect(call.sql).not.toMatch(/DELETE\s+FROM/i);
    }
    expect(sqlFor('UPDATE goals')[0]).toContain('deleted_at = ?');
    expect(goalWrites[0].params).toEqual([NOW, NOW, GOAL_ID]);
  });

  test('deleting a goal tombstones its links too, with the same timestamp', async () => {
    await sqliteSoftDeleteGoal(GOAL_ID, NOW);
    const linkUpdate = mockRunCalls.find((c) => c.sql.includes('UPDATE goal_mark_links'));
    expect(linkUpdate).toBeDefined();
    // Same instant → both land in the same push window.
    expect(linkUpdate!.params).toEqual([NOW, NOW, GOAL_ID]);
  });

  test('unlinking a mark tombstones the pair rather than removing it', async () => {
    await sqliteSoftDeleteGoalMarkLink(GOAL_ID, MARK_ID, NOW);
    const [sql] = sqlFor('UPDATE goal_mark_links');
    expect(sql).toContain('deleted_at = ?');
    expect(sql).toContain('goal_id = ?');
    expect(sql).toContain('mark_id = ?');
    // Only tombstone a live row — never re-stamp an already-deleted one.
    expect(sql).toContain('deleted_at IS NULL');
  });
});

// ── Re-link ──────────────────────────────────────────────────────────────────

describe('re-linking a tombstoned pair — upsert, never insert', () => {
  test('link writes upsert on the (goal_id, mark_id) pair and clear the tombstone', async () => {
    const link: GoalMarkLink = {
      id: 'link-1',
      goal_id: GOAL_ID,
      mark_id: MARK_ID,
      user_id: USER,
      created_at: NOW,
      updated_at: NOW,
      deleted_at: null,
    };
    await sqliteUpsertGoalMarkLink(link);

    const [sql] = sqlFor('INSERT INTO goal_mark_links');
    // unique(goal_id, mark_id) survives the tombstone: a plain INSERT is rejected.
    expect(sql).toContain('ON CONFLICT(goal_id, mark_id) DO UPDATE');
    // This line is what revives an unlinked pair.
    expect(sql).toContain('deleted_at = excluded.deleted_at');
    expect(sql).toContain('updated_at = excluded.updated_at');
    expect(sql).toContain('user_id = excluded.user_id');
  });

  test('the conflict update does NOT overwrite the row’s original identity', async () => {
    await sqliteUpsertGoalMarkLink({
      id: 'link-1',
      goal_id: GOAL_ID,
      mark_id: MARK_ID,
      user_id: USER,
      created_at: NOW,
      updated_at: NOW,
      deleted_at: null,
    });
    const [sql] = sqlFor('INSERT INTO goal_mark_links');
    const updateClause = sql.slice(sql.indexOf('DO UPDATE'));
    expect(updateClause).not.toContain('id = excluded.id');
    expect(updateClause).not.toContain('created_at = excluded.created_at');
  });
});

// ── Mapper guards (the RLS + schema contract) ────────────────────────────────

describe('mappers — the 20260716 column contract', () => {
  const goal: Goal = {
    ...(legacyGoal as unknown as Goal),
    target_date: '2026-12-01T00:00:00.000Z',
    linked_mark_ids: [MARK_ID],
    tier: 'building',
    frequency: 'steady',
  };

  test('never sends target_date or linked_mark_ids — neither is a column', () => {
    const row = mapGoalToSupabase(goal) as Record<string, unknown>;
    expect(row).not.toHaveProperty('target_date');
    expect(row).not.toHaveProperty('linked_mark_ids');
  });

  test('sends the sync columns this milestone added', () => {
    const row = mapGoalToSupabase({ ...goal, deleted_at: NOW, banked_momentum_days: 12 });
    expect(row).toMatchObject({
      tier: 'building',
      frequency: 'steady',
      banked_momentum_days: 12,
      deleted_at: NOW,
    });
  });

  test('falls back to target_date for deadline_date so legacy goals keep their date', () => {
    const row = mapGoalToSupabase({ ...goal, deadline_date: null });
    expect(row.deadline_date).toBe('2026-12-01T00:00:00.000Z');
  });

  test('a link without user_id fails loudly — RLS would reject it silently', () => {
    const link = {
      id: 'l1',
      goal_id: GOAL_ID,
      mark_id: MARK_ID,
      created_at: NOW,
      updated_at: NOW,
    } as unknown as GoalMarkLink;
    expect(() => mapGoalMarkLinkToSupabase(link)).toThrow(/user_id is required/);
  });

  test('a link without updated_at fails loudly — it is the push cursor', () => {
    const link = {
      id: 'l1',
      goal_id: GOAL_ID,
      mark_id: MARK_ID,
      user_id: USER,
      created_at: NOW,
    } as unknown as GoalMarkLink;
    expect(() => mapGoalMarkLinkToSupabase(link)).toThrow(/updated_at is required/);
  });
});

// ── Migration ────────────────────────────────────────────────────────────────

describe('AsyncStorage → SQLite migration — existing users’ real goals', () => {
  test('copies legacy goals and links into SQLite', async () => {
    await AsyncStorage.setItem('@livra_goals', JSON.stringify([legacyGoal]));
    await AsyncStorage.setItem('@livra_goal_mark_links', JSON.stringify([legacyLink]));

    await migrateGoalsFromAsyncStorage('@livra_goals', '@livra_goal_mark_links');

    expect(sqlFor('INSERT INTO goals').length).toBe(1);
    expect(sqlFor('INSERT INTO goal_mark_links').length).toBe(1);
  });

  test('keeps the goal’s original updated_at so the first push carries it up', async () => {
    await AsyncStorage.setItem('@livra_goals', JSON.stringify([legacyGoal]));
    await migrateGoalsFromAsyncStorage('@livra_goals', '@livra_goal_mark_links');

    const insert = mockRunCalls.find((c) => c.sql.includes('INSERT INTO goals'))!;
    expect(insert.params).toContain('2026-07-10T00:00:00.000Z');
  });

  test('backfills the link’s user_id from the owning goal — RLS requires it', async () => {
    await AsyncStorage.setItem('@livra_goals', JSON.stringify([legacyGoal]));
    await AsyncStorage.setItem('@livra_goal_mark_links', JSON.stringify([legacyLink]));

    await migrateGoalsFromAsyncStorage('@livra_goals', '@livra_goal_mark_links');

    const insert = mockRunCalls.find((c) => c.sql.includes('INSERT INTO goal_mark_links'))!;
    expect(insert.params).toContain(USER);
  });

  test('is idempotent — a second run does not double-insert', async () => {
    await AsyncStorage.setItem('@livra_goals', JSON.stringify([legacyGoal]));
    await AsyncStorage.setItem('@livra_goal_mark_links', JSON.stringify([legacyLink]));

    await migrateGoalsFromAsyncStorage('@livra_goals', '@livra_goal_mark_links');
    const afterFirst = mockRunCalls.length;
    expect(afterFirst).toBeGreaterThan(0);

    await migrateGoalsFromAsyncStorage('@livra_goals', '@livra_goal_mark_links');

    // Flag-guarded: the second run writes nothing at all.
    expect(mockRunCalls.length).toBe(afterFirst);
  });

  test('clears the legacy keys and sets the flags', async () => {
    await AsyncStorage.setItem('@livra_goals', JSON.stringify([legacyGoal]));
    await AsyncStorage.setItem('@livra_goal_mark_links', JSON.stringify([legacyLink]));

    await migrateGoalsFromAsyncStorage('@livra_goals', '@livra_goal_mark_links');

    expect(await AsyncStorage.getItem('@livra_goals')).toBeNull();
    expect(await AsyncStorage.getItem('@livra_goal_mark_links')).toBeNull();
    expect(await AsyncStorage.getItem('@livra_goals_sqlite_migrated_v1')).toBe('1');
    expect(await AsyncStorage.getItem('@livra_goal_mark_links_sqlite_migrated_v1')).toBe('1');
  });

  test('an empty store is a no-op that still flags, so it never re-runs', async () => {
    await migrateGoalsFromAsyncStorage('@livra_goals', '@livra_goal_mark_links');
    expect(sqlFor('INSERT INTO goals')).toHaveLength(0);
    expect(await AsyncStorage.getItem('@livra_goals_sqlite_migrated_v1')).toBe('1');
  });

  test('a link whose owner cannot be determined is dropped, never guessed', async () => {
    // No goals key at all → the link's user_id is unknowable. RLS would reject a
    // guessed one forever, so it must not be written.
    await AsyncStorage.setItem(
      '@livra_goal_mark_links',
      JSON.stringify([{ id: 'orphan', goal_id: 'unknown-goal', mark_id: MARK_ID }]),
    );

    await migrateGoalsFromAsyncStorage('@livra_goals', '@livra_goal_mark_links');

    expect(sqlFor('INSERT INTO goal_mark_links')).toHaveLength(0);
  });
});
