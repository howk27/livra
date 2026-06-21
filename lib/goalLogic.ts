import type { Goal } from '../types/goal';
import type { MarkEvent } from '../types';

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

/** Count of increment events (not deleted) whose mark_id is in goal.linked_mark_ids. */
export function calculateGoalProgress(goal: Goal, events: MarkEvent[]): number {
  const linked = goal.linked_mark_ids;
  if (!linked || linked.length === 0) return 0;
  const linkedSet = new Set(linked);
  return events.filter(
    e => !e.deleted_at && e.event_type === 'increment' && linkedSet.has(e.mark_id)
  ).length;
}

/** Minimum progress needed to unlock the Complete button. */
export function calculateUnlockThreshold(goal: Goal): number {
  const daysSinceCreated = Math.max(
    0,
    Math.floor((Date.now() - new Date(goal.created_at).getTime()) / 86_400_000)
  );
  const raw = Math.floor(daysSinceCreated * 0.8);
  return Math.min(365, Math.max(7, raw));
}
