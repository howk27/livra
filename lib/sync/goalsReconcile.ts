/**
 * Reconcile goal_mark_links from the surviving mark.goal_id (QC1 — the durable fix).
 *
 * THE BUG THIS HEALS — founder device QC after delete+reinstall+sign-in:
 * the mark↔goal relationship has TWO independently-synced representations —
 *   • `mark.goal_id`   (on lc_counters) — synced by the mature mark path, SURVIVES a reinstall.
 *   • `goal_mark_links` row — the M6-B path — did NOT come back.
 * Every goal→mark surface (loadGoalsForUser's linked_mark_ids projection, Focus,
 * Goals, the mark screen's "FEEDING INTO" list) reads ONLY goal_mark_links, so the
 * goal showed no marks and Focus dropped it — YET the mark still said "Working
 * toward: {goal}", because that one line reads mark.goal_id. There was no
 * reconciliation between the two, so the surviving mark.goal_id could not repair
 * the missing link.
 *
 * THE FIX: after every pull, for each LIVE mark whose goal_id points at a LIVE
 * owned goal, ensure a live goal_mark_links row exists for that (goal_id, mark_id)
 * pair — created via addGoalMarkLink, which stamps user_id (RLS) and
 * updated_at = now() so the derived link is FRESH and the very next incremental
 * push repairs the server too. Idempotent and a no-op once consistent.
 *
 * RESPECTS INTENTIONAL UNLINKS: if any row exists for the pair INCLUDING a
 * tombstone (deleted_at set), the pair is left untouched. A tombstone means the
 * user deliberately unlinked; resurrecting it would undo their action. Only a
 * genuine absence of any row is derivable.
 *
 * This also closes the origin-device backfill strand-hole (§2): the reconcile
 * runs inside the sync cycle on every device, and the links it derives carry a
 * fresh updated_at, so they are caught by the normal cursor push — no dependency
 * on the one-shot goals-backfill flag, and no wholesale rewrite of migrated
 * updated_at (which would break LWW intent).
 */
import { addGoalMarkLink, loadGoalsForUser, loadLinkForPairIncludingDeleted } from '../db/goalsDb';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The slice of a mark this reconcile needs — id, its goal_id, and its tombstone. */
export interface ReconcilableMark {
  id: string;
  goal_id?: string | null;
  deleted_at?: string | null;
}

export interface ReconcileResult {
  /** Links newly derived from a surviving mark.goal_id this run. */
  derivedLinks: number;
}

/**
 * Derive any goal_mark_links missing for a live mark→live-goal pair.
 *
 * @param userId authenticated user (RLS owner). Non-uuid → no-op.
 * @param marks  live marks from the marks store (each may carry goal_id).
 * @param now    injectable clock for deterministic tests.
 */
export async function reconcileGoalMarkLinks(
  userId: string,
  marks: ReconcilableMark[],
  now: string = new Date().toISOString(),
): Promise<ReconcileResult> {
  const result: ReconcileResult = { derivedLinks: 0 };
  if (!userId || !UUID_RE.test(userId)) return result;

  // Only live marks that actually feed a goal are candidates — the guard keeps
  // this a cheap no-op for the common case (no goal_id, or nothing to repair).
  const candidates = marks.filter((m) => m && m.id && m.goal_id && !m.deleted_at);
  if (candidates.length === 0) return result;

  const goals = await loadGoalsForUser(userId); // live, owned, non-deleted only
  const liveGoalIds = new Set(goals.map((g) => g.id));

  for (const mark of candidates) {
    const goalId = mark.goal_id as string;
    // The mark points at a goal that is not live/owned here (deleted, or another
    // user's) — deriving a link would violate RLS or resurrect a dead goal.
    if (!liveGoalIds.has(goalId)) continue;

    const existing = await loadLinkForPairIncludingDeleted(goalId, mark.id);
    // A live row → already consistent. A tombstoned row → intentional unlink.
    // Either way there IS a row, so leave it: only a genuine absence is derivable.
    if (existing) continue;

    await addGoalMarkLink({ goal_id: goalId, mark_id: mark.id, user_id: userId, now });
    result.derivedLinks += 1;
  }

  return result;
}
