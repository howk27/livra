import type { Goal } from '../types/goal';

export type CompletionState = 'has-active' | 'all-complete';

export function resolveCompletionState(goals: Goal[]): CompletionState {
  const hasActive = goals.some(g => g.status === 'active');
  const hasCompleted = goals.some(g => g.status === 'completed');
  return !hasActive && hasCompleted ? 'all-complete' : 'has-active';
}
