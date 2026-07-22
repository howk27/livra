// ── Free-tier caps ──────────────────────────────────────────────────────────
// Two caps, both live, whichever binds first:
//   • per goal   → FREE_MARKS_PER_GOAL
//   • per account → FREE_MARK_CEILING, counting goal-linked AND unlinked marks
// The separate daily-habit bucket (FREE_HABIT_LIMIT) is retired: a standalone
// habit is a mark, and it counts against the same ceiling as everything else.
// Keep these in sync with supabase/migrations/20260722_free_tier_mark_ceiling.sql.

/** Active (non-completed/non-expired) goals allowed on the free tier. */
export const FREE_GOAL_LIMIT = 2;
/** Marks allowed per goal on the free tier. Lowered 5 → 4 (founder decision 2026-07-22). */
export const FREE_MARKS_PER_GOAL = 4;
/** Account-wide mark ceiling on the free tier: goal-linked + unlinked marks together. */
export const FREE_MARK_CEILING = 6;

export function canAddGoal(isPro: boolean, totalGoalCount: number): boolean {
  return isPro || totalGoalCount < FREE_GOAL_LIMIT;
}

/**
 * True if a free user may create one more mark ANYWHERE on the account.
 * `totalActiveMarkCount` is every active mark, goal-linked and unlinked alike
 * (use countActiveMarks). Pro bypasses. This is the ceiling; the per-goal cap
 * (canAddMarkToGoal) still applies on top of it.
 */
export function canAddMark(isPro: boolean, totalActiveMarkCount: number): boolean {
  return isPro || totalActiveMarkCount < FREE_MARK_CEILING;
}

/** How many more marks the account may hold. Pro is unbounded → Infinity. */
export function remainingMarkAllowance(isPro: boolean, totalActiveMarkCount: number): number {
  if (isPro) return Number.POSITIVE_INFINITY;
  return Math.max(0, FREE_MARK_CEILING - totalActiveMarkCount);
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

/**
 * Count every active (non-deleted) mark on the account — the ceiling's bucket.
 * Goal-linked and unlinked marks count the same; there is no habit exemption.
 */
export function countActiveMarks(
  marks: ReadonlyArray<{ goal_id?: string | null; deleted_at?: string | null }>
): number {
  return marks.filter((m) => !m.deleted_at).length;
}

// ── Livra+ feature gates ────────────────────────────────────────────────────
// History, stats, presets and charts are intentionally NOT gated — they belong to the user.

/** Data export (CSV) is a Livra+ feature. */
export function canExportData(isPro: boolean): boolean {
  return isPro;
}

/** Customizing the share card (themes, accent, element toggles) is a Livra+ feature. Sharing itself is free. */
export function canCustomizeShareCard(isPro: boolean): boolean {
  return isPro;
}
