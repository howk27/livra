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
import {
  addGoalMarkLink,
  getLinksForMark,
  loadGoalsForUser,
  loadLinkForPairIncludingDeleted,
} from '../db/goalsDb';
import { execute } from '../db';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The slice of a mark this reconcile needs — id, its goal_id, and its tombstone. */
export interface ReconcilableMark {
  id: string;
  goal_id?: string | null;
  deleted_at?: string | null;
  /** Set when the mark graduated from a completed goal (lib/maintenanceMarks). */
  maintenance_of?: string | null;
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

export interface MarkGoalIdReconcileResult {
  /** Marks whose goal_id was restored from a surviving link this run. */
  repairedMarks: number;
}

/**
 * The OTHER direction: restore a live mark's missing goal_id from its surviving
 * goal_mark_links row.
 *
 * WHY BOTH DIRECTIONS EXIST. reconcileGoalMarkLinks above heals the case where
 * the mark survived and the link did not. Live data (2026-07-25, checked against
 * the production DB) shows the mirror image is also real: an account whose five
 * marks all carry `goal_id = NULL` while five live links still point at the live
 * goal. Nothing could heal that — the client-side backfill re-stamps goal_id
 * from local data that a reinstall has already lost, and the link→mark direction
 * did not exist. Those marks come back as standalone daily habits and the goal
 * loses its cadence, which is exactly what the founder reported on device.
 *
 * THE GUARDS, each protecting a real case:
 *  • Never overwrite an existing goal_id — only a genuinely absent one is
 *    derivable; the mark's own value is the source of truth when it has one.
 *  • Skip marks carrying `maintenance_of`: graduation deliberately NULLs goal_id
 *    and leaves the links in place, so without this the reconcile would drag
 *    every graduated habit back onto its finished goal.
 *  • Only ACTIVE goals are restorable. `maintenance_of` has no column on the
 *    server (verified live), so after a reinstall a graduated mark has no
 *    provenance left — the completed-goal check is the only guard still standing.
 *  • Exactly one live link, or skip. A mark linked to two goals has no single
 *    correct goal_id, and guessing would silently move it.
 *
 * Writes goal_id with a fresh updated_at so the repair travels on the next push
 * and fixes the server too, mirroring how the link direction repairs itself.
 */
export async function reconcileMarkGoalIds(
  userId: string,
  marks: ReconcilableMark[],
  now: string = new Date().toISOString(),
): Promise<MarkGoalIdReconcileResult> {
  const result: MarkGoalIdReconcileResult = { repairedMarks: 0 };
  if (!userId || !UUID_RE.test(userId)) return result;

  const candidates = marks.filter(
    (m) => m && m.id && !m.goal_id && !m.deleted_at && !m.maintenance_of,
  );
  if (candidates.length === 0) return result;

  const goals = await loadGoalsForUser(userId);
  const activeGoalIds = new Set(goals.filter((g) => g.status === 'active').map((g) => g.id));
  if (activeGoalIds.size === 0) return result;

  for (const mark of candidates) {
    const links = (await getLinksForMark(mark.id)).filter(
      (l) => !l.deleted_at && l.user_id === userId && activeGoalIds.has(l.goal_id),
    );
    if (links.length !== 1) continue;

    await execute('UPDATE lc_counters SET goal_id = ?, updated_at = ? WHERE id = ?', [
      links[0].goal_id,
      now,
      mark.id,
    ]);
    result.repairedMarks += 1;
  }

  return result;
}
