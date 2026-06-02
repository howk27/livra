// Canonical import path for the goal store.
// All new code should import from here; goalsSlice.ts is the implementation.
export { useGoalsStore, GoalLimitError } from './goalsSlice';
export type { GoalsState } from './goalsSlice';
