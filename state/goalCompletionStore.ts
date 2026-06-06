import { create } from 'zustand';
import type { Goal } from '../types/goal';

interface GoalCompletionState {
  completedGoal: Goal | null;
  show: boolean;
  showCompletion: (goal: Goal) => void;
  hideCompletion: () => void;
}

export const useGoalCompletionStore = create<GoalCompletionState>((set) => ({
  completedGoal: null,
  show: false,
  showCompletion: (goal) => set({ completedGoal: goal, show: true }),
  hideCompletion: () => set({ show: false, completedGoal: null }),
}));
