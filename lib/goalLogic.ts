import type { Goal } from '../types/goal';

export { FREE_GOAL_LIMIT, canAddGoal } from './gating';

export function getActiveGoal(goals: Goal[]): Goal | undefined {
  return goals.find(g => g.status === 'active');
}

export function getQueuedGoals(goals: Goal[]): Goal[] {
  return goals
    .filter(g => g.status === 'queued')
    .sort((a, b) => a.sort_index - b.sort_index);
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

export function nextGoalToActivate(goals: Goal[]): Goal | undefined {
  return getQueuedGoals(goals)[0];
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
