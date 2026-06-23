/**
 * Phase 3.2 — Post-completion marks (maintenance mode).
 *
 * A mark "graduates" to a maintenance habit when its goal completes: `goal_id` is
 * nulled and `maintenance_of` is set to the completed goal's id. These helpers are
 * the single source of truth for classifying marks, so the Focus render and any
 * pressure computations agree.
 */

type MarkLike = {
  goal_id?: string | null;
  maintenance_of?: string | null;
  deleted_at?: string | null;
};

/** True when a mark continues past its goal's completion and is still alive. */
export function isMaintenanceMark(mark: MarkLike): boolean {
  return !!mark.maintenance_of && !mark.deleted_at;
}

/**
 * Partition active (non-deleted) marks into the three Focus buckets.
 * Maintenance is checked first so a graduated (null-goal) maintenance mark never
 * falls into the loose bucket.
 */
export function partitionMarks<T extends MarkLike>(
  marks: readonly T[]
): { activeByGoal: T[]; loose: T[]; maintenance: T[] } {
  const activeByGoal: T[] = [];
  const loose: T[] = [];
  const maintenance: T[] = [];

  for (const mark of marks) {
    if (mark.deleted_at) continue;
    if (mark.maintenance_of) {
      maintenance.push(mark);
    } else if (mark.goal_id) {
      activeByGoal.push(mark);
    } else {
      loose.push(mark);
    }
  }

  return { activeByGoal, loose, maintenance };
}
