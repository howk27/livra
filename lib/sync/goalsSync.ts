/**
 * Push + pull for goals and goal_mark_links (M6-B).
 *
 * Lives beside the mark sync rather than inside it: useSync.ts is already 2.3k
 * lines, and goals need one behaviour marks do not — a server-side PAYWALL on
 * push (see goalCapBlocked.ts).
 *
 * SPLIT-CURSOR INVARIANT (lib/sync/syncCursors.ts, useSync.ts:230): push reads
 * the push cursor only, pull reads the pull cursor only, and pull never advances
 * the push cursor. Neither function here writes a cursor — useSync owns that, so
 * a goal failure cannot advance a cursor past unsent marks.
 *
 * LAST-WRITE-WINS on the client's updated_at, matching marks. The migration adds
 * no moddatetime trigger precisely so our timestamps survive the round trip.
 */
import type { Goal } from '../../types/goal';
import {
  loadDirtyGoals,
  loadDirtyLinks,
  loadGoalsByIds,
  mergeRemoteGoal,
  mergeRemoteGoalMarkLink,
} from '../db/goalsDb';
import {
  pushGoals,
  pushGoalMarkLinks,
  fetchGoalsForUser,
  fetchGoalMarkLinksForUser,
  isGoalCapRejection,
} from '../db/goalsSupabase';
import { readGoalCapBlockedIds, addGoalCapBlockedIds, clearGoalCapBlockedIds } from './goalCapBlocked';
import { logger } from '../utils/logger';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type GoalsPushResult = {
  pushedGoals: number;
  pushedLinks: number;
  /** Goals the server refused under the free-tier cap. Surfaces as GoalLimitError copy. */
  capBlockedGoalIds: string[];
};

export type GoalsPullResult = {
  mergedGoals: number;
  mergedLinks: number;
  /** Tombstones applied from the server — a deletion made on another device. */
  appliedGoalTombstones: number;
};

/**
 * Push goals then links.
 *
 * Order matters: a link's RLS policy checks ownership of the referenced goal, so
 * a link whose goal is not on the server yet is rejected. Links to goals refused
 * by the cap are therefore held back too — the same parent-confirmation rule the
 * event/streak/badge push already applies to marks.
 */
export async function pushGoalsAndLinks(userId: string, sinceIso: string): Promise<GoalsPushResult> {
  const result: GoalsPushResult = { pushedGoals: 0, pushedLinks: 0, capBlockedGoalIds: [] };
  if (!userId || !UUID_RE.test(userId)) return result;

  // Cap-blocked goals are re-attempted every run, INDEPENDENT of the cursor:
  // their updated_at is old, so a cursor query would never find them again.
  const blockedIds = await readGoalCapBlockedIds();
  const [dirty, retries] = await Promise.all([
    loadDirtyGoals(userId, sinceIso),
    loadGoalsByIds(userId, blockedIds),
  ]);

  const goalsById = new Map<string, Goal>();
  for (const g of [...dirty, ...retries]) {
    if (g.user_id && UUID_RE.test(g.user_id)) goalsById.set(g.id, g);
  }
  const goals = Array.from(goalsById.values());

  const refused = new Set<string>();
  if (goals.length > 0) {
    try {
      await pushGoals(goals);
      result.pushedGoals = goals.length;
    } catch (error) {
      if (!isGoalCapRejection(error)) throw error;
      // A batch upsert cannot say WHICH goal the cap refused, so isolate. Goal
      // counts are small (2 free, a handful on Pro) — one request each is cheap
      // and only happens on the rejection path.
      logger.warn('[SYNC] Goal push refused by server policy — isolating per goal');
      for (const goal of goals) {
        try {
          await pushGoals([goal]);
          result.pushedGoals += 1;
        } catch (goalError) {
          if (!isGoalCapRejection(goalError)) throw goalError;
          refused.add(goal.id);
        }
      }
    }
  }

  result.capBlockedGoalIds = [...refused];
  await addGoalCapBlockedIds(result.capBlockedGoalIds);
  // Anything that pushed this run is no longer blocked (upgraded, or a goal was
  // deleted and freed a slot).
  await clearGoalCapBlockedIds(goals.filter((g) => !refused.has(g.id)).map((g) => g.id));

  if (refused.size > 0) {
    logger.warn('[SYNC] Free-tier goal cap refused goal(s) at push', {
      refusedCount: refused.size,
      // ids only — no titles, no PII in sync logs
      sampleIds: [...refused].slice(0, 3),
    });
  }

  const dirtyLinks = await loadDirtyLinks(userId, sinceIso);
  const pushableLinks = dirtyLinks.filter((l) => {
    if (!l.user_id || !UUID_RE.test(l.user_id)) {
      // RLS REQUIRES auth.uid() = user_id; an unstamped link is silently rejected.
      logger.warn('[SYNC] Skipping goal link without a valid user_id', { linkId: l.id });
      return false;
    }
    return !refused.has(l.goal_id);
  });

  if (pushableLinks.length > 0) {
    await pushGoalMarkLinks(pushableLinks);
    result.pushedLinks = pushableLinks.length;
  }

  return result;
}

/**
 * Pull goals + links since the pull cursor.
 *
 * Tombstones are RETURNED by the fetch, never filtered: a row with deleted_at set
 * IS the deletion travelling from the other device. Filtering happens at read
 * time (goalsDb readers), not here.
 */
export async function pullGoalsAndLinks(userId: string, sinceIso: string | null): Promise<GoalsPullResult> {
  const result: GoalsPullResult = { mergedGoals: 0, mergedLinks: 0, appliedGoalTombstones: 0 };
  if (!userId || !UUID_RE.test(userId)) return result;

  const [remoteGoals, remoteLinks] = await Promise.all([
    fetchGoalsForUser(userId, sinceIso),
    fetchGoalMarkLinksForUser(userId, sinceIso),
  ]);

  for (const goal of dedupeByIdNewestWins(remoteGoals)) {
    const changed = await mergeRemoteGoal(goal);
    if (changed) {
      result.mergedGoals += 1;
      if (goal.deleted_at) result.appliedGoalTombstones += 1;
    }
  }

  for (const link of dedupeByIdNewestWins(remoteLinks)) {
    const changed = await mergeRemoteGoalMarkLink(link);
    if (changed) result.mergedLinks += 1;
  }

  if (result.mergedGoals > 0 || result.mergedLinks > 0) {
    logger.log('[SYNC] Merged goals from Supabase', {
      goals: result.mergedGoals,
      links: result.mergedLinks,
      tombstones: result.appliedGoalTombstones,
    });
  }

  return result;
}

/** Same dedupe rule the mark pull uses: one row per id, latest updated_at wins. */
function dedupeByIdNewestWins<T extends { id: string; updated_at: string }>(rows: T[]): T[] {
  const byId = new Map<string, T>();
  for (const row of rows) {
    const prev = byId.get(row.id);
    if (!prev || new Date(row.updated_at).getTime() >= new Date(prev.updated_at).getTime()) {
      byId.set(row.id, row);
    }
  }
  return Array.from(byId.values());
}
