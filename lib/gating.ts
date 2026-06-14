// ── Free-tier caps ──────────────────────────────────────────────────────────
/** Active (non-completed/non-expired) goals allowed on the free tier. */
export const FREE_GOAL_LIMIT = 2;
/** Marks allowed per goal on the free tier (cap is per-goal, not global). */
export const FREE_MARKS_PER_GOAL = 3;
/** @deprecated Global mark cap. Superseded by FREE_MARKS_PER_GOAL (per-goal). Kept for back-compat. */
export const FREE_MARK_LIMIT = 3;

export function canAddGoal(isPro: boolean, totalGoalCount: number): boolean {
  return isPro || totalGoalCount < FREE_GOAL_LIMIT;
}

/** @deprecated Use canAddMarkToGoal — the cap is per-goal now, not global. */
export function canAddMark(isPro: boolean, totalMarkCount: number): boolean {
  return isPro || totalMarkCount < FREE_MARK_LIMIT;
}

/** True if a free user may add another mark to a goal that already has `marksInGoalCount` marks. Pro bypasses. */
export function canAddMarkToGoal(isPro: boolean, marksInGoalCount: number): boolean {
  return isPro || marksInGoalCount < FREE_MARKS_PER_GOAL;
}

/** Count active (non-deleted) marks feeding a given goal. Unlinked marks (no goal_id) are excluded. */
export function countMarksInGoal(
  marks: ReadonlyArray<{ goal_id?: string | null; deleted_at?: string | null }>,
  goalId: string
): number {
  return marks.filter((m) => !m.deleted_at && m.goal_id === goalId).length;
}
