// Goals + goal_mark_links persistence facade (M6-B).
//
// WAS: AsyncStorage-only, with hard deletes. Goals had never reached Supabase, so
// a reinstall lost every goal and every link while marks, events, streaks, badges
// and goal_notes all synced back. THIS is the file that made goals device-local.
//
// NOW: SQLite is the local store (native), matching goal_notes (QC3-D) and giving
// the sync layer real cursor + tombstone columns. AsyncStorage remains ONLY as the
// web backend, where SQLite is unavailable — the same split goalNotesSlice uses.
// Existing users' AsyncStorage goals are migrated in on first load, once.
//
// TOMBSTONES, NOT SPLICES: removeGoal/removeGoalMarkLink SET deleted_at. A hard
// delete cannot propagate — the next pull simply re-materialises the row. Every
// reader below filters `!deleted_at`; only loadDirty* (push) returns tombstones.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { v4 as uuidv4 } from 'uuid';
import type { Goal, GoalMarkLink } from '../../types/goal';
import {
  goalsSqliteSupported,
  migrateGoalsFromAsyncStorage,
  sqliteUpsertGoal,
  sqliteLoadGoalsForUser,
  sqliteSoftDeleteGoal,
  sqliteLoadDirtyGoals,
  sqliteLoadGoalsByIds,
  sqliteUpsertGoalMarkLink,
  sqliteUpsertGoalMarkLinkById,
  sqliteLoadLinksForUser,
  sqliteLoadLinksForMark,
  sqliteSoftDeleteGoalMarkLink,
  sqliteLoadDirtyLinks,
} from './goalsSqlite';

const GOALS_KEY = '@livra_goals';
const LINKS_KEY = '@livra_goal_mark_links';

/** Guards the one-time AsyncStorage → SQLite copy so it runs at most once per process. */
let migrationPromise: Promise<void> | null = null;

async function ensureMigrated(): Promise<void> {
  if (!goalsSqliteSupported()) return;
  if (!migrationPromise) {
    migrationPromise = migrateGoalsFromAsyncStorage(GOALS_KEY, LINKS_KEY);
  }
  return migrationPromise;
}

/** Test seam — lets a suite re-run the migration against a fresh store. */
export function resetGoalsMigrationForTests(): void {
  migrationPromise = null;
}

// ── AsyncStorage backend (web only) ──────────────────────────────────────────

async function readAll(): Promise<Goal[]> {
  try {
    const raw = await AsyncStorage.getItem(GOALS_KEY);
    if (!raw) return [];
    const goals = JSON.parse(raw) as Goal[];
    return goals.map(normalizeGoal);
  } catch {
    return [];
  }
}

export function normalizeGoal(g: Goal): Goal {
  return {
    ...g,
    current_mark_count: g.current_mark_count ?? 0,
    deadline_date: g.deadline_date ?? g.target_date ?? null,
    tier: g.tier ?? 'building',
    frequency: g.frequency ?? 'steady',
    deleted_at: g.deleted_at ?? null,
  };
}

async function writeAll(goals: Goal[]): Promise<void> {
  await AsyncStorage.setItem(GOALS_KEY, JSON.stringify(goals));
}

async function readAllLinks(): Promise<GoalMarkLink[]> {
  try {
    const raw = await AsyncStorage.getItem(LINKS_KEY);
    return raw ? (JSON.parse(raw) as GoalMarkLink[]) : [];
  } catch {
    return [];
  }
}

async function writeAllLinks(links: GoalMarkLink[]): Promise<void> {
  await AsyncStorage.setItem(LINKS_KEY, JSON.stringify(links));
}

// ── Goals ────────────────────────────────────────────────────────────────────

/**
 * Live goals for one user, each with its linked_mark_ids projected from the
 * links table. Tombstoned goals and tombstoned links are both excluded.
 */
export async function loadGoalsForUser(userId: string): Promise<Goal[]> {
  await ensureMigrated();

  if (goalsSqliteSupported()) {
    const [goals, links] = await Promise.all([
      sqliteLoadGoalsForUser(userId),
      sqliteLoadLinksForUser(userId),
    ]);
    return goals.map((g) => ({
      ...g,
      linked_mark_ids: links.filter((l) => l.goal_id === g.id).map((l) => l.mark_id),
    }));
  }

  const all = await readAll();
  const userGoals = all.filter((g) => g.user_id === userId && !g.deleted_at);
  const links = await loadLinksForUser(userId);
  return userGoals.map((g) => ({
    ...g,
    linked_mark_ids: links.filter((l) => l.goal_id === g.id).map((l) => l.mark_id),
  }));
}

export async function upsertGoal(goal: Goal): Promise<void> {
  await ensureMigrated();

  if (goalsSqliteSupported()) {
    await sqliteUpsertGoal(normalizeGoal(goal));
    return;
  }

  const all = await readAll();
  const idx = all.findIndex((g) => g.id === goal.id);
  if (idx >= 0) {
    all[idx] = goal;
  } else {
    all.push(goal);
  }
  await writeAll(all);
}

export async function upsertGoals(updatedGoals: Goal[]): Promise<void> {
  await ensureMigrated();

  if (goalsSqliteSupported()) {
    for (const goal of updatedGoals) {
      await sqliteUpsertGoal(normalizeGoal(goal));
    }
    return;
  }

  const all = await readAll();
  const map = new Map(all.map((g) => [g.id, g]));
  for (const goal of updatedGoals) {
    map.set(goal.id, goal);
  }
  await writeAll(Array.from(map.values()));
}

/**
 * SOFT delete: stamps deleted_at on the goal and on all of its links, so the
 * deletion can reach the server and the other device. Previously this spliced the
 * array — a hard delete the next pull silently undid.
 */
export async function removeGoal(id: string, nowIso: string = new Date().toISOString()): Promise<void> {
  await ensureMigrated();

  if (goalsSqliteSupported()) {
    await sqliteSoftDeleteGoal(id, nowIso);
    return;
  }

  const all = await readAll();
  await writeAll(
    all.map((g) => (g.id === id && !g.deleted_at ? { ...g, deleted_at: nowIso, updated_at: nowIso } : g)),
  );
  const links = await readAllLinks();
  await writeAllLinks(
    links.map((l) =>
      l.goal_id === id && !l.deleted_at ? { ...l, deleted_at: nowIso, updated_at: nowIso } : l,
    ),
  );
}

// ── Goal-Mark Links ──────────────────────────────────────────────────────────

/** Live links for one user. Tombstones excluded. */
export async function loadLinksForUser(userId: string): Promise<GoalMarkLink[]> {
  await ensureMigrated();

  if (goalsSqliteSupported()) {
    return sqliteLoadLinksForUser(userId);
  }

  const allLinks = await readAllLinks();
  const allGoals = await readAll();
  const userGoalIds = new Set(
    allGoals.filter((g) => g.user_id === userId && !g.deleted_at).map((g) => g.id),
  );
  return allLinks.filter((l) => !l.deleted_at && (l.user_id === userId || userGoalIds.has(l.goal_id)));
}

/**
 * Link a mark to a goal, stamping user_id + updated_at (both REQUIRED: RLS
 * rejects a link whose user_id ≠ auth.uid(), and updated_at is the push cursor).
 * Stamped here rather than at the call site so no write path can forget.
 *
 * UPSERTS on (goal_id, mark_id) and clears any tombstone: unlink-then-re-link is
 * exactly what the goal-detail UI does, and the unique pair constraint outlives
 * the tombstone, so an insert would be rejected.
 */
export async function addGoalMarkLink(params: {
  goal_id: string;
  mark_id: string;
  user_id: string;
  /** Optional: only used when the pair is genuinely new. */
  id?: string;
  now?: string;
}): Promise<GoalMarkLink> {
  await ensureMigrated();
  const now = params.now ?? new Date().toISOString();
  const link: GoalMarkLink = {
    id: params.id ?? uuidv4(),
    goal_id: params.goal_id,
    mark_id: params.mark_id,
    user_id: params.user_id,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  };

  if (goalsSqliteSupported()) {
    await sqliteUpsertGoalMarkLink(link);
    return link;
  }

  const links = await readAllLinks();
  const idx = links.findIndex((l) => l.goal_id === link.goal_id && l.mark_id === link.mark_id);
  if (idx >= 0) {
    // Revive the tombstoned pair; keep its original id and created_at.
    const revived: GoalMarkLink = {
      ...links[idx],
      user_id: link.user_id,
      updated_at: now,
      deleted_at: null,
    };
    links[idx] = revived;
    await writeAllLinks(links);
    return revived;
  }
  links.push(link);
  await writeAllLinks(links);
  return link;
}

/** SOFT delete: an unlink must survive as a tombstoned row, not vanish. */
export async function removeGoalMarkLink(
  goalId: string,
  markId: string,
  nowIso: string = new Date().toISOString(),
): Promise<void> {
  await ensureMigrated();

  if (goalsSqliteSupported()) {
    await sqliteSoftDeleteGoalMarkLink(goalId, markId, nowIso);
    return;
  }

  const links = await readAllLinks();
  await writeAllLinks(
    links.map((l) =>
      l.goal_id === goalId && l.mark_id === markId && !l.deleted_at
        ? { ...l, deleted_at: nowIso, updated_at: nowIso }
        : l,
    ),
  );
}

/** Live links for one mark, across every goal. Tombstones excluded. */
export async function getLinksForMark(markId: string): Promise<GoalMarkLink[]> {
  await ensureMigrated();

  if (goalsSqliteSupported()) {
    return sqliteLoadLinksForMark(markId);
  }

  const links = await readAllLinks();
  return links.filter((l) => l.mark_id === markId && !l.deleted_at);
}

// ── Sync surface (used by hooks/useSync.ts) ──────────────────────────────────

/** Push candidates since the push cursor. Tombstones INCLUDED — they are the deletion. */
export async function loadDirtyGoals(userId: string, sinceIso: string): Promise<Goal[]> {
  await ensureMigrated();
  if (goalsSqliteSupported()) return sqliteLoadDirtyGoals(userId, sinceIso);
  const all = await readAll();
  return all.filter((g) => g.user_id === userId && g.updated_at > sinceIso);
}

/** Push candidates since the push cursor. Tombstones INCLUDED. */
export async function loadDirtyLinks(userId: string, sinceIso: string): Promise<GoalMarkLink[]> {
  await ensureMigrated();
  if (goalsSqliteSupported()) return sqliteLoadDirtyLinks(userId, sinceIso);
  const links = await readAllLinks();
  return links.filter((l) => l.user_id === userId && l.updated_at > sinceIso);
}

/** Re-push candidates by id, ignoring the cursor (rows the server refused). */
export async function loadGoalsByIds(userId: string, ids: string[]): Promise<Goal[]> {
  await ensureMigrated();
  if (ids.length === 0) return [];
  if (goalsSqliteSupported()) return sqliteLoadGoalsByIds(userId, ids);
  const all = await readAll();
  const wanted = new Set(ids);
  return all.filter((g) => g.user_id === userId && wanted.has(g.id));
}

/**
 * Apply one pulled goal, last-write-wins on updated_at. A pulled tombstone is
 * applied like any other row — that is how a remote deletion lands here.
 * Returns true when the local row changed.
 */
export async function mergeRemoteGoal(remote: Goal): Promise<boolean> {
  await ensureMigrated();
  const local = await loadGoalIncludingDeleted(remote.id);
  if (local && new Date(local.updated_at).getTime() >= new Date(remote.updated_at).getTime()) {
    return false;
  }
  await upsertGoalRaw(normalizeGoal(remote));
  return true;
}

/** Apply one pulled link, last-write-wins on updated_at, keyed by the server's id. */
export async function mergeRemoteGoalMarkLink(remote: GoalMarkLink): Promise<boolean> {
  await ensureMigrated();
  const links = goalsSqliteSupported()
    ? await sqliteLoadLinksForMarkIncludingDeleted(remote)
    : await readAllLinks();
  const local = links.find((l) => l.id === remote.id);
  if (local && new Date(local.updated_at).getTime() >= new Date(remote.updated_at).getTime()) {
    return false;
  }

  if (goalsSqliteSupported()) {
    await sqliteUpsertGoalMarkLinkById(remote);
    return true;
  }

  const all = await readAllLinks();
  const idx = all.findIndex((l) => l.id === remote.id);
  if (idx >= 0) all[idx] = remote;
  else all.push(remote);
  await writeAllLinks(all);
  return true;
}

/**
 * Reads one goal by id INCLUDING tombstones. Merge MUST see a deleted row: a
 * locally-deleted goal whose tombstone is newer than the remote row has to win,
 * or the pull resurrects it.
 */
async function loadGoalIncludingDeleted(id: string): Promise<Goal | null> {
  if (goalsSqliteSupported()) {
    const { getGoalsDb } = await import('./goalsSqlite');
    const db = await getGoalsDb();
    const row = await db.getAllAsync<{ updated_at: string }>(
      'SELECT updated_at FROM goals WHERE id = ?',
      [id],
    );
    if (!row || row.length === 0) return null;
    return { updated_at: row[0].updated_at } as Goal;
  }
  const all = await readAll();
  return all.find((g) => g.id === id) ?? null;
}

async function upsertGoalRaw(goal: Goal): Promise<void> {
  if (goalsSqliteSupported()) {
    await sqliteUpsertGoal(goal);
    return;
  }
  const all = await readAll();
  const idx = all.findIndex((g) => g.id === goal.id);
  if (idx >= 0) all[idx] = goal;
  else all.push(goal);
  await writeAll(all);
}

/** Reads links INCLUDING tombstones for merge comparison. */
async function sqliteLoadLinksForMarkIncludingDeleted(remote: GoalMarkLink): Promise<GoalMarkLink[]> {
  const { getGoalsDb } = await import('./goalsSqlite');
  const db = await getGoalsDb();
  const rows = await db.getAllAsync<GoalMarkLink>(
    'SELECT id, goal_id, mark_id, user_id, created_at, updated_at, deleted_at FROM goal_mark_links WHERE id = ? OR (goal_id = ? AND mark_id = ?)',
    [remote.id, remote.goal_id, remote.mark_id],
  );
  return rows ?? [];
}
