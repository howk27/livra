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

export function nextGoalToActivate(goals: Goal[]): Goal | undefined {
  return getQueuedGoals(goals)[0];
}
