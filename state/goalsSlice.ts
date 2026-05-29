import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import type { Goal } from '../types/goal';
import { loadGoalsForUser, upsertGoal, upsertGoals, removeGoal } from '../lib/db/goalsDb';
import { canAddGoal } from '../lib/gating';
import {
  getActiveGoal,
  getQueuedGoals,
  getCompletedGoals,
  nextGoalToActivate,
} from '../lib/goalLogic';

export class GoalLimitError extends Error {
  constructor() {
    super('Free plan allows up to 3 goals. Upgrade to Livra+ for unlimited.');
    this.name = 'GoalLimitError';
  }
}

interface GoalsState {
  goals: Goal[];
  loading: boolean;
  loadGoals: (userId: string) => Promise<void>;
  addGoal: (params: {
    title: string;
    description?: string;
    userId: string;
    isPro: boolean;
  }) => Promise<Goal>;
  completeGoal: (id: string) => Promise<void>;
  deleteGoal: (id: string) => Promise<void>;
  reorderQueue: (orderedIds: string[]) => Promise<void>;
  updateGoalTargetDate: (id: string, date: string | null) => Promise<void>;
  markMilestonesFired: (goalId: string, keys: string[]) => Promise<void>;
  getActiveGoal: () => Goal | undefined;
  getQueuedGoals: () => Goal[];
  getCompletedGoals: () => Goal[];
}

export const useGoalsStore = create<GoalsState>((set, get) => ({
  goals: [],
  loading: false,

  loadGoals: async (userId) => {
    set({ loading: true });
    try {
      const goals = await loadGoalsForUser(userId);
      set({ goals, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  addGoal: async ({ title, description, userId, isPro }) => {
    const current = get().goals.filter(g => g.user_id === userId);
    const nonCompleted = current.filter(g => g.status !== 'completed');
    if (!canAddGoal(isPro, nonCompleted.length)) {
      throw new GoalLimitError();
    }

    const hasActive = current.some(g => g.status === 'active');
    const maxSortIndex = current
      .filter(g => g.status === 'queued')
      .reduce((m, g) => Math.max(m, g.sort_index), -1);

    const now = new Date().toISOString();
    const goal: Goal = {
      id: uuidv4(),
      user_id: userId,
      title: title.trim(),
      description: description?.trim() || undefined,
      status: hasActive ? 'queued' : 'active',
      sort_index: hasActive ? maxSortIndex + 1 : 0,
      created_at: now,
      updated_at: now,
    };

    await upsertGoal(goal);
    set(s => ({ goals: [...s.goals, goal] }));
    return goal;
  },

  completeGoal: async (id) => {
    const now = new Date().toISOString();
    const goals = get().goals;
    const completing = goals.find(g => g.id === id);
    if (!completing) return;

    const completed: Goal = {
      ...completing,
      status: 'completed',
      completed_at: now,
      updated_at: now,
    };

    const remaining = goals.filter(g => g.id !== id);
    const next = nextGoalToActivate(remaining);
    const activated: Goal | undefined = next
      ? { ...next, status: 'active', updated_at: now }
      : undefined;

    const writes = [completed, ...(activated ? [activated] : [])];
    await upsertGoals(writes);

    // Fire-and-forget goal completion XP (anti-cheat: must be ≥ 14 days old)
    const goalAgeMs = Date.now() - new Date(completing.created_at).getTime();
    const goalAgeDays = goalAgeMs / (1000 * 60 * 60 * 24);
    if (goalAgeDays >= 14 && completing.user_id) {
      import('../lib/xpEngine').then(({ awardGoalXP }) => {
        awardGoalXP(completing.user_id, completing.id)
          .then((result) => {
            const { useXPStore } = require('./xpSlice');
            useXPStore.getState().applyXPResult(result);
          })
          .catch((err: unknown) => {
            console.warn('[XP] awardGoalXP failed:', err);
          });
      });
    }

    set(s => ({
      goals: s.goals.map(g => {
        if (g.id === completed.id) return completed;
        if (activated && g.id === activated.id) return activated;
        return g;
      }),
    }));
  },

  deleteGoal: async (id) => {
    await removeGoal(id);
    set(s => ({ goals: s.goals.filter(g => g.id !== id) }));
  },

  reorderQueue: async (orderedIds) => {
    const now = new Date().toISOString();
    const goals = get().goals;
    const updates: Goal[] = [];

    orderedIds.forEach((id, idx) => {
      const goal = goals.find(g => g.id === id && g.status === 'queued');
      if (goal) {
        updates.push({ ...goal, sort_index: idx, updated_at: now });
      }
    });

    await upsertGoals(updates);
    const map = new Map(updates.map(g => [g.id, g]));
    set(s => ({ goals: s.goals.map(g => map.get(g.id) ?? g) }));
  },

  updateGoalTargetDate: async (id, date) => {
    const now = new Date().toISOString();
    const goal = get().goals.find(g => g.id === id);
    if (!goal) return;
    const updated: Goal = { ...goal, target_date: date, updated_at: now };
    await upsertGoal(updated);
    set(s => ({ goals: s.goals.map(g => (g.id === id ? updated : g)) }));
  },

  markMilestonesFired: async (goalId, keys) => {
    if (keys.length === 0) return;
    const goal = get().goals.find(g => g.id === goalId);
    if (!goal) return;
    const now = new Date().toISOString();
    const existing = goal.milestones_fired ?? [];
    const updated: Goal = {
      ...goal,
      milestones_fired: [...new Set([...existing, ...keys])],
      updated_at: now,
    };
    await upsertGoal(updated);
    set(s => ({ goals: s.goals.map(g => (g.id === goalId ? updated : g)) }));
  },

  getActiveGoal: () => getActiveGoal(get().goals),
  getQueuedGoals: () => getQueuedGoals(get().goals),
  getCompletedGoals: () => getCompletedGoals(get().goals),
}));
