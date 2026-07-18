import type { Goal } from '../types/goal';
import type { Mark, MarkEvent } from '../types';
import { resolveDailyTarget } from './markDailyTarget';
import { TIERS } from './goalMarkSuggestions';

export { FREE_GOAL_LIMIT, canAddGoal } from './gating';

export function getActiveGoals(goals: Goal[]): Goal[] {
  return goals
    .filter(g => g.status === 'active')
    .sort((a, b) => a.sort_index - b.sort_index);
}

export function getActiveGoal(goals: Goal[]): Goal | undefined {
  return getActiveGoals(goals)[0];
}

export function getCompletedGoals(goals: Goal[]): Goal[] {
  return goals
    .filter(g => g.status === 'completed')
    .sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? ''));
}

export function getExpiredGoals(goals: Goal[]): Goal[] {
  return goals
    .filter(g => g.status === 'expired')
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}

/** True if goal has met its mark count target */
export function isMarkCountComplete(goal: Goal): boolean {
  if (!goal.target_mark_count) return false;
  return goal.current_mark_count >= goal.target_mark_count;
}

/** True if deadline has passed and goal is still active */
export function isDeadlineExpired(goal: Goal): boolean {
  const deadline = goal.deadline_date ?? goal.target_date;
  if (!deadline || goal.status !== 'active') return false;
  return new Date(deadline) < new Date();
}

export function progressPercent(goal: Goal): number {
  if (!goal.target_mark_count || goal.target_mark_count <= 0) return 0;
  return Math.min(100, Math.round((goal.current_mark_count / goal.target_mark_count) * 100));
}

/**
 * Goal progress in check-in DAYS, never raw taps (founder 2026-07-18: spamming +
 * must not move the ring; extra reps live on the mark, not the goal).
 * A linked mark contributes at most one check-in per local day, and only once
 * the day's summed amount meets the mark's daily target — the same day rule
 * computeCompletionsThisWeek uses, so weekly and lifetime progress agree.
 * `marks` is optional: an unknown mark falls back to a daily target of 1.
 */
export function calculateGoalProgress(
  goal: Goal,
  events: MarkEvent[],
  marks?: Pick<Mark, 'id' | 'dailyTarget'>[]
): number {
  const linked = goal.linked_mark_ids;
  if (!linked || linked.length === 0) return 0;
  const linkedSet = new Set(linked);
  const barByMark = new Map<string, number>();
  for (const m of marks ?? []) barByMark.set(m.id, resolveDailyTarget(m));

  const dayTotals = new Map<string, number>();
  for (const e of events) {
    if (e.deleted_at || e.event_type !== 'increment' || !linkedSet.has(e.mark_id)) continue;
    const key = `${e.mark_id}|${e.occurred_local_date}`;
    dayTotals.set(key, (dayTotals.get(key) ?? 0) + (e.amount ?? 1));
  }

  let days = 0;
  for (const [key, total] of dayTotals) {
    const markId = key.slice(0, key.indexOf('|'));
    if (total >= (barByMark.get(markId) ?? 1)) days++;
  }
  return days;
}

/** The commitment chosen at creation (tier × frequency × marks): the goal's real
 *  check-in target. Null on goals created before the commitment flow. */
export function goalCommitmentTarget(goal: Goal): number | null {
  return goal.target_mark_count && goal.target_mark_count > 0 ? goal.target_mark_count : null;
}

/** Weekly framing for progress copy: which week of the tier's duration the goal
 *  is in. Null when the goal has no tier (pre-commitment goals). */
export function goalWeekFraming(
  goal: Goal,
  now: number = Date.now()
): { week: number; totalWeeks: number } | null {
  if (!goal.tier) return null;
  const totalWeeks = TIERS[goal.tier]?.durationWeeks;
  if (!totalWeeks) return null;
  const days = Math.max(0, Math.floor((now - new Date(goal.created_at).getTime()) / 86_400_000));
  return { week: Math.min(totalWeeks, Math.floor(days / 7) + 1), totalWeeks };
}

/** Minimum effort (in check-in days) to unlock EARLY manual completion — the
 *  quiet footer path. Distinct from goalCommitmentTarget, which is the full
 *  commitment that triggers the ready-to-claim prompt. */
export function calculateUnlockThreshold(goal: Goal): number {
  const daysSinceCreated = Math.max(
    0,
    Math.floor((Date.now() - new Date(goal.created_at).getTime()) / 86_400_000)
  );
  const raw = Math.floor(daysSinceCreated * 0.8);
  return Math.min(365, Math.max(7, raw));
}
