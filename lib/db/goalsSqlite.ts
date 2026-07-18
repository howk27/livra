// Local SQLite mirror for goals + goal_mark_links (M6-B).
//
// WHY THIS FILE EXISTS: goals and their mark links were AsyncStorage-only and had
// never reached Supabase, so a reinstall lost every goal while marks, events,
// streaks, badges and goal_notes all came back. Moving them to SQLite alongside
// the goal_notes mirror (QC3-D) gives the app ONE persistence story and gives the
// sync layer the columns it needs: a client-supplied updated_at cursor and a
// nullable deleted_at tombstone.
//
// Identity model (same as goal_notes): each row is keyed by a client-generated
// uuid, so an offline write reconciles to the same row on sync. Links carry a
// SECOND identity — unique(goal_id, mark_id) — which survives a tombstone, so
// re-linking an unlinked pair UPDATEs the tombstoned row rather than inserting.
//
// TOMBSTONES: removeGoal / removeGoalMarkLink SET deleted_at. Every reader here
// filters `deleted_at IS NULL`; only the sync push (loadDirty*) returns them, so
// a deletion can actually travel to the other device.

import { Platform } from 'react-native';
import * as SQLite from 'expo-sqlite';
import type { Goal, GoalMarkLink, GoalStatus } from '../../types/goal';
import type { TierId, FrequencyId } from '../goalMarkSuggestions';
import { migrateNotesFromAsyncStorage } from './notesMigration';

const DB_NAME = 'livra_goals.db';
const GOALS_MIGRATION_FLAG_KEY = '@livra_goals_sqlite_migrated_v1';
const LINKS_MIGRATION_FLAG_KEY = '@livra_goal_mark_links_sqlite_migrated_v1';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export function goalsSqliteSupported(): boolean {
  return Platform.OS !== 'web';
}

async function openDb(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync(DB_NAME);
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS goals (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      icon TEXT,
      color TEXT,
      sort_index INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      target_mark_count INTEGER,
      current_mark_count INTEGER NOT NULL DEFAULT 0,
      deadline_date TEXT,
      completed_at TEXT,
      milestones_fired TEXT,
      banked_momentum_days INTEGER,
      tier TEXT,
      frequency TEXT,
      deleted_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_goals_user_updated ON goals(user_id, updated_at DESC);
    CREATE TABLE IF NOT EXISTS goal_mark_links (
      id TEXT PRIMARY KEY NOT NULL,
      goal_id TEXT NOT NULL,
      mark_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_goal_mark_links_pair
      ON goal_mark_links(goal_id, mark_id);
    CREATE INDEX IF NOT EXISTS idx_goal_mark_links_user_updated
      ON goal_mark_links(user_id, updated_at DESC);
  `);
  return db;
}

export async function getGoalsDb(): Promise<SQLite.SQLiteDatabase> {
  if (!goalsSqliteSupported()) {
    throw new Error('Goals SQLite is not used on web');
  }
  if (!dbPromise) {
    dbPromise = openDb();
  }
  return dbPromise;
}

/** Test seam only — drops the cached handle so a fresh mock db is opened. */
export function resetGoalsDbHandleForTests(): void {
  dbPromise = null;
}

// ── Row ↔ domain ─────────────────────────────────────────────────────────────

type GoalRow = {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  sort_index: number;
  status: string;
  target_mark_count: number | null;
  current_mark_count: number;
  deadline_date: string | null;
  completed_at: string | null;
  milestones_fired: string | null;
  banked_momentum_days: number | null;
  tier: string | null;
  frequency: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * Defaults mirror the pre-SQLite normalizeGoal so behaviour does not drift:
 * a missing tier reads as 'building', a missing frequency as 'steady'.
 * `target_date` is deliberately NOT persisted — deprecated in favour of
 * deadline_date (types/goal.ts) and absent from the server schema.
 */
export function rowToGoal(row: GoalRow): Goal {
  let milestones: string[] | undefined;
  if (row.milestones_fired) {
    try {
      const parsed = JSON.parse(row.milestones_fired);
      milestones = Array.isArray(parsed) ? parsed : undefined;
    } catch {
      milestones = undefined;
    }
  }
  return {
    id: row.id,
    user_id: row.user_id,
    title: row.title,
    description: row.description ?? undefined,
    icon: row.icon ?? undefined,
    color: row.color ?? undefined,
    sort_index: row.sort_index ?? 0,
    status: (row.status as GoalStatus) ?? 'active',
    target_mark_count: row.target_mark_count ?? null,
    current_mark_count: row.current_mark_count ?? 0,
    deadline_date: row.deadline_date ?? null,
    target_date: row.deadline_date ?? null,
    completed_at: row.completed_at ?? null,
    milestones_fired: milestones,
    banked_momentum_days: row.banked_momentum_days ?? null,
    tier: (row.tier as TierId) ?? 'building',
    frequency: (row.frequency as FrequencyId) ?? 'steady',
    deleted_at: row.deleted_at ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

const GOAL_COLUMNS =
  'id, user_id, title, description, icon, color, sort_index, status, target_mark_count, ' +
  'current_mark_count, deadline_date, completed_at, milestones_fired, banked_momentum_days, ' +
  'tier, frequency, deleted_at, created_at, updated_at';

const LINK_COLUMNS = 'id, goal_id, mark_id, user_id, created_at, updated_at, deleted_at';

function goalParams(goal: Goal): unknown[] {
  return [
    goal.id,
    goal.user_id,
    goal.title,
    goal.description ?? null,
    goal.icon ?? null,
    goal.color ?? null,
    goal.sort_index ?? 0,
    goal.status ?? 'active',
    goal.target_mark_count ?? null,
    goal.current_mark_count ?? 0,
    goal.deadline_date ?? goal.target_date ?? null,
    goal.completed_at ?? null,
    goal.milestones_fired ? JSON.stringify(goal.milestones_fired) : null,
    goal.banked_momentum_days ?? null,
    goal.tier ?? null,
    goal.frequency ?? null,
    goal.deleted_at ?? null,
    goal.created_at,
    goal.updated_at,
  ];
}

// ── Goals ────────────────────────────────────────────────────────────────────

/**
 * Insert-or-update one goal by its id (the identity). Idempotent: replaying the
 * same row — as the AsyncStorage migration and the sync pull both do — converges
 * rather than duplicating.
 */
export async function sqliteUpsertGoal(goal: Goal, existingDb?: SQLite.SQLiteDatabase): Promise<void> {
  const db = existingDb ?? (await getGoalsDb());
  await db.runAsync(
    `INSERT INTO goals (${GOAL_COLUMNS})
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       user_id = excluded.user_id,
       title = excluded.title,
       description = excluded.description,
       icon = excluded.icon,
       color = excluded.color,
       sort_index = excluded.sort_index,
       status = excluded.status,
       target_mark_count = excluded.target_mark_count,
       current_mark_count = excluded.current_mark_count,
       deadline_date = excluded.deadline_date,
       completed_at = excluded.completed_at,
       milestones_fired = excluded.milestones_fired,
       banked_momentum_days = excluded.banked_momentum_days,
       tier = excluded.tier,
       frequency = excluded.frequency,
       deleted_at = excluded.deleted_at,
       updated_at = excluded.updated_at`,
    goalParams(goal) as SQLite.SQLiteBindValue[],
  );
}

/** Live goals for one user, oldest sort first. Tombstones are never returned. */
export async function sqliteLoadGoalsForUser(userId: string): Promise<Goal[]> {
  const db = await getGoalsDb();
  const rows = await db.getAllAsync<GoalRow>(
    `SELECT ${GOAL_COLUMNS} FROM goals
     WHERE user_id = ? AND deleted_at IS NULL
     ORDER BY sort_index ASC, created_at ASC`,
    [userId],
  );
  return (rows ?? []).map(rowToGoal);
}

/**
 * Tombstone a goal and every one of its links, stamping the SAME updated_at so
 * both rows land in the next push window. A hard delete here would be invisible
 * to the server and the goal would come back on the next pull.
 */
export async function sqliteSoftDeleteGoal(id: string, nowIso: string): Promise<void> {
  const db = await getGoalsDb();
  await db.runAsync(
    'UPDATE goals SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL',
    [nowIso, nowIso, id],
  );
  await db.runAsync(
    'UPDATE goal_mark_links SET deleted_at = ?, updated_at = ? WHERE goal_id = ? AND deleted_at IS NULL',
    [nowIso, nowIso, id],
  );
}

/** Push candidates: rows changed since the push cursor, tombstones INCLUDED. */
export async function sqliteLoadDirtyGoals(userId: string, sinceIso: string): Promise<Goal[]> {
  const db = await getGoalsDb();
  const rows = await db.getAllAsync<GoalRow>(
    `SELECT ${GOAL_COLUMNS} FROM goals WHERE user_id = ? AND updated_at > ?`,
    [userId, sinceIso],
  );
  return (rows ?? []).map(rowToGoal);
}

/** Re-push candidates by id, regardless of the cursor (server-rejected rows). */
export async function sqliteLoadGoalsByIds(userId: string, ids: string[]): Promise<Goal[]> {
  if (ids.length === 0) return [];
  const db = await getGoalsDb();
  const placeholders = ids.map(() => '?').join(',');
  const rows = await db.getAllAsync<GoalRow>(
    `SELECT ${GOAL_COLUMNS} FROM goals WHERE user_id = ? AND id IN (${placeholders})`,
    [userId, ...ids],
  );
  return (rows ?? []).map(rowToGoal);
}

// ── Links ────────────────────────────────────────────────────────────────────

/**
 * Insert-or-update a link on its NATURAL key (goal_id, mark_id) and clear any
 * tombstone. Re-linking a previously unlinked pair is a real path — the
 * goal-detail UI unlinks then re-links — and the unique pair index survives the
 * tombstone, so a plain INSERT would be rejected. `id` and `created_at` are
 * preserved on conflict: the row keeps its original identity.
 */
export async function sqliteUpsertGoalMarkLink(
  link: GoalMarkLink,
  existingDb?: SQLite.SQLiteDatabase,
): Promise<void> {
  const db = existingDb ?? (await getGoalsDb());
  await db.runAsync(
    `INSERT INTO goal_mark_links (${LINK_COLUMNS})
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(goal_id, mark_id) DO UPDATE SET
       user_id = excluded.user_id,
       updated_at = excluded.updated_at,
       deleted_at = excluded.deleted_at`,
    [
      link.id,
      link.goal_id,
      link.mark_id,
      link.user_id,
      link.created_at,
      link.updated_at,
      link.deleted_at ?? null,
    ],
  );
}

/** Apply a pulled link row by its id — the server's identity for the pair. */
export async function sqliteUpsertGoalMarkLinkById(link: GoalMarkLink): Promise<void> {
  const db = await getGoalsDb();
  await db.runAsync(
    `INSERT INTO goal_mark_links (${LINK_COLUMNS})
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       user_id = excluded.user_id,
       updated_at = excluded.updated_at,
       deleted_at = excluded.deleted_at`,
    [
      link.id,
      link.goal_id,
      link.mark_id,
      link.user_id,
      link.created_at,
      link.updated_at,
      link.deleted_at ?? null,
    ],
  );
}

/** Live links for one user. Tombstones are never returned. */
export async function sqliteLoadLinksForUser(userId: string): Promise<GoalMarkLink[]> {
  const db = await getGoalsDb();
  const rows = await db.getAllAsync<GoalMarkLink>(
    `SELECT ${LINK_COLUMNS} FROM goal_mark_links
     WHERE user_id = ? AND deleted_at IS NULL`,
    [userId],
  );
  return rows ?? [];
}

/** Live links for one mark, across every goal. Tombstones are never returned. */
export async function sqliteLoadLinksForMark(markId: string): Promise<GoalMarkLink[]> {
  const db = await getGoalsDb();
  const rows = await db.getAllAsync<GoalMarkLink>(
    `SELECT ${LINK_COLUMNS} FROM goal_mark_links
     WHERE mark_id = ? AND deleted_at IS NULL`,
    [markId],
  );
  return rows ?? [];
}

/**
 * One link for a (goal_id, mark_id) pair INCLUDING tombstones, or null.
 *
 * The reconcile (QC1) uses this to decide whether it may DERIVE a link from a
 * surviving mark.goal_id: a live row means already-consistent, a TOMBSTONED row
 * means the user intentionally unlinked the pair. Either way there is a row, so
 * reconcile must NOT resurrect it. Only a genuine absence is derivable. Mirrors
 * the merge-time `sqliteLoadLinksForMarkIncludingDeleted` shape — the unique
 * pair index guarantees at most one row.
 */
export async function sqliteLoadLinkForPairIncludingDeleted(
  goalId: string,
  markId: string,
): Promise<GoalMarkLink | null> {
  const db = await getGoalsDb();
  const rows = await db.getAllAsync<GoalMarkLink>(
    `SELECT ${LINK_COLUMNS} FROM goal_mark_links WHERE goal_id = ? AND mark_id = ?`,
    [goalId, markId],
  );
  return rows && rows.length > 0 ? rows[0] : null;
}

/** Tombstone one link. An unlink must survive as a row, not vanish from it. */
export async function sqliteSoftDeleteGoalMarkLink(
  goalId: string,
  markId: string,
  nowIso: string,
): Promise<void> {
  const db = await getGoalsDb();
  await db.runAsync(
    `UPDATE goal_mark_links SET deleted_at = ?, updated_at = ?
     WHERE goal_id = ? AND mark_id = ? AND deleted_at IS NULL`,
    [nowIso, nowIso, goalId, markId],
  );
}

/** Push candidates: rows changed since the push cursor, tombstones INCLUDED. */
export async function sqliteLoadDirtyLinks(userId: string, sinceIso: string): Promise<GoalMarkLink[]> {
  const db = await getGoalsDb();
  const rows = await db.getAllAsync<GoalMarkLink>(
    `SELECT ${LINK_COLUMNS} FROM goal_mark_links WHERE user_id = ? AND updated_at > ?`,
    [userId, sinceIso],
  );
  return rows ?? [];
}

// ── One-time AsyncStorage → SQLite migration ─────────────────────────────────

/**
 * Copies the legacy AsyncStorage goal + link lists into SQLite once, then clears
 * the keys. Flag-guarded and upsert-based, so a second run cannot double-insert.
 *
 * THIS RUNS ON EXISTING USERS' REAL DATA: every goal they own lives only in these
 * two keys today. It must never drop a row. Rows are migrated with their original
 * updated_at intact so the very first push after this ships carries them to the
 * server (the push cursor is older than the goals themselves).
 *
 * Legacy links predate user_id/created_at/updated_at, so those are backfilled:
 * user_id from the owning goal (the same ownership rule RLS uses — a link whose
 * goal is unknown is skipped rather than guessed, since RLS would reject it), and
 * the timestamps from the goal's created_at.
 */
export async function migrateGoalsFromAsyncStorage(
  goalsStorageKey: string,
  linksStorageKey: string,
): Promise<void> {
  const ownerByGoalId = new Map<string, { userId: string; createdAt: string }>();

  await migrateNotesFromAsyncStorage<Goal>({
    supported: goalsSqliteSupported(),
    flagKey: GOALS_MIGRATION_FLAG_KEY,
    storageKey: goalsStorageKey,
    getDb: getGoalsDb,
    logLabel: 'GoalsSQLite',
    unit: 'goal(s)',
    migrateRow: async (g, db) => {
      if (!g?.id || !g?.user_id) return;
      const now = new Date().toISOString();
      const normalized: Goal = {
        ...g,
        current_mark_count: g.current_mark_count ?? 0,
        deadline_date: g.deadline_date ?? g.target_date ?? null,
        tier: g.tier ?? 'building',
        frequency: g.frequency ?? 'steady',
        created_at: g.created_at ?? now,
        updated_at: g.updated_at ?? g.created_at ?? now,
        deleted_at: g.deleted_at ?? null,
      };
      ownerByGoalId.set(normalized.id, {
        userId: normalized.user_id,
        createdAt: normalized.created_at,
      });
      await sqliteUpsertGoal(normalized, db);
    },
  });

  // Links may be migrated on a later run than goals (a crash between the two
  // flags), so rebuild the owner map from SQLite when it is empty.
  if (goalsSqliteSupported() && ownerByGoalId.size === 0) {
    try {
      const db = await getGoalsDb();
      const rows = await db.getAllAsync<{ id: string; user_id: string; created_at: string }>(
        'SELECT id, user_id, created_at FROM goals',
      );
      for (const r of rows ?? []) {
        ownerByGoalId.set(r.id, { userId: r.user_id, createdAt: r.created_at });
      }
    } catch {
      /* best-effort: an unknown owner is skipped below, never guessed */
    }
  }

  await migrateNotesFromAsyncStorage<Partial<GoalMarkLink> & { id?: string; goal_id?: string; mark_id?: string }>({
    supported: goalsSqliteSupported(),
    flagKey: LINKS_MIGRATION_FLAG_KEY,
    storageKey: linksStorageKey,
    getDb: getGoalsDb,
    logLabel: 'GoalLinksSQLite',
    unit: 'link(s)',
    migrateRow: async (l, db) => {
      if (!l?.id || !l?.goal_id || !l?.mark_id) return;
      const owner = ownerByGoalId.get(l.goal_id);
      const userId = l.user_id ?? owner?.userId;
      // RLS requires auth.uid() = user_id; a link we cannot attribute would be
      // rejected server-side forever, so it is dropped rather than invented.
      if (!userId) return;
      const stamp = l.created_at ?? owner?.createdAt ?? new Date().toISOString();
      await sqliteUpsertGoalMarkLink(
        {
          id: l.id,
          goal_id: l.goal_id,
          mark_id: l.mark_id,
          user_id: userId,
          created_at: stamp,
          updated_at: l.updated_at ?? stamp,
          deleted_at: l.deleted_at ?? null,
        },
        db,
      );
    },
  });
}
