import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { InteractionManager } from 'react-native';
import type { Goal, GoalMarkLink } from '../types/goal';
import type { TierId, FrequencyId } from '../lib/goalMarkSuggestions';
import {
  loadGoalsForUser,
  upsertGoal,
  upsertGoals,
  removeGoal,
  addGoalMarkLink,
  removeGoalMarkLink,
  getLinksForMark,
} from '../lib/db/goalsDb';
import { canAddGoal } from '../lib/gating';
import {
  getActiveGoal,
  getQueuedGoals,
  getCompletedGoals,
  nextGoalToActivate,
  isMarkCountComplete,
  isDeadlineExpired,
} from '../lib/goalLogic';

export class GoalLimitError extends Error {
  constructor() {
    super('Free plan allows up to 3 goals. Upgrade to Livra+ for unlimited.');
    this.name = 'GoalLimitError';
  }
}

export interface GoalsState {
  goals: Goal[];
  isLoading: boolean;
  error: string | null;

  fetchGoals: (userId: string) => Promise<void>;
  createGoal: (data: Partial<Goal> & { userId: string; isPro: boolean; tier?: TierId; frequency?: FrequencyId }) => Promise<Goal>;
  updateGoal: (id: string, data: Partial<Goal>) => Promise<void>;
  deleteGoal: (id: string) => Promise<void>;
  completeGoal: (id: string) => Promise<void>;
  reorderQueue: (orderedIds: string[]) => Promise<void>;
  linkMarkToGoal: (goalId: string, markId: string) => Promise<void>;
  unlinkMarkFromGoal: (goalId: string, markId: string) => Promise<void>;
  /** Called after a mark is logged. Increments currentMarkCount for all linked goals, then checks completion. Non-blocking by convention. */
  creditMarkToGoals: (markId: string) => Promise<void>;
  checkGoalCompletion: (goalId: string) => Promise<void>;
  updateGoalTargetDate: (id: string, date: string | null) => Promise<void>;
  markMilestonesFired: (goalId: string, keys: string[]) => Promise<void>;
  getActiveGoal: () => Goal | undefined;
  getQueuedGoals: () => Goal[];
  getCompletedGoals: () => Goal[];

  /** Checks all active goals for deadline expiry. Non-blocking; call on app foreground. */
  checkAllGoalExpiry: () => void;

  /** @deprecated Use fetchGoals */
  loadGoals: (userId: string) => Promise<void>;
  /** @deprecated Use createGoal */
  addGoal: (params: { title: string; description?: string; userId: string; isPro: boolean }) => Promise<Goal>;
}

export const useGoalsStore = create<GoalsState>((set, get) => ({
  goals: [],
  isLoading: false,
  error: null,

  fetchGoals: async (userId) => {
    set({ isLoading: true, error: null });
    try {
      const goals = await loadGoalsForUser(userId);
      set({ goals, isLoading: false });
    } catch (e) {
      set({ isLoading: false, error: e instanceof Error ? e.message : 'Failed to load goals' });
    }
  },

  createGoal: async ({ userId, isPro, tier, frequency, ...data }) => {
    const current = get().goals.filter(g => g.user_id === userId);
    const nonCompleted = current.filter(g => g.status !== 'completed' && g.status !== 'expired');
    if (!canAddGoal(isPro, nonCompleted.length)) throw new GoalLimitError();

    const hasActive = current.some(g => g.status === 'active');
    const maxSortIndex = current
      .filter(g => g.status === 'queued')
      .reduce((m, g) => Math.max(m, g.sort_index), -1);

    const now = new Date().toISOString();
    const goal: Goal = {
      id: uuidv4(),
      user_id: userId,
      title: (data.title ?? '').trim(),
      description: data.description?.trim() || undefined,
      icon: data.icon,
      color: data.color,
      status: hasActive ? 'queued' : 'active',
      sort_index: hasActive ? maxSortIndex + 1 : 0,
      current_mark_count: 0,
      target_mark_count: data.target_mark_count ?? null,
      deadline_date: data.deadline_date ?? null,
      target_date: data.deadline_date ?? data.target_date ?? null,
      linked_mark_ids: data.linked_mark_ids ?? [],
      tier: tier ?? 'building',
      frequency: frequency ?? 'steady',
      created_at: now,
      updated_at: now,
    };

    await upsertGoal(goal);

    // Persist mark links
    if (goal.linked_mark_ids?.length) {
      await Promise.all(
        goal.linked_mark_ids.map(markId =>
          addGoalMarkLink({ id: uuidv4(), goal_id: goal.id, mark_id: markId })
        )
      );
    }

    set(s => ({ goals: [...s.goals, goal] }));
    return goal;
  },

  updateGoal: async (id, data) => {
    const now = new Date().toISOString();
    const goal = get().goals.find(g => g.id === id);
    if (!goal) return;

    const updated: Goal = {
      ...goal,
      ...data,
      updated_at: now,
      // Keep deadline_date and target_date in sync
      deadline_date: data.deadline_date ?? goal.deadline_date,
      target_date: data.deadline_date ?? data.target_date ?? goal.target_date,
    };

    await upsertGoal(updated);

    // Update mark links if provided
    if (data.linked_mark_ids !== undefined) {
      const prev = new Set(goal.linked_mark_ids ?? []);
      const next = new Set(data.linked_mark_ids);
      const toAdd = [...next].filter(id => !prev.has(id));
      const toRemove = [...prev].filter(id => !next.has(id));
      await Promise.all([
        ...toAdd.map(markId => addGoalMarkLink({ id: uuidv4(), goal_id: id, mark_id: markId })),
        ...toRemove.map(markId => removeGoalMarkLink(id, markId)),
      ]);
    }

    set(s => ({ goals: s.goals.map(g => (g.id === id ? updated : g)) }));
  },

  deleteGoal: async (id) => {
    await removeGoal(id);
    set(s => ({ goals: s.goals.filter(g => g.id !== id) }));
  },

  completeGoal: async (id) => {
    const now = new Date().toISOString();
    const goals = get().goals;
    const completing = goals.find(g => g.id === id);
    if (!completing) return;

    const completed: Goal = { ...completing, status: 'completed', completed_at: now, updated_at: now };
    const remaining = goals.filter(g => g.id !== id);
    const next = nextGoalToActivate(remaining);
    const activated: Goal | undefined = next
      ? { ...next, status: 'active', updated_at: now }
      : undefined;

    const writes = [completed, ...(activated ? [activated] : [])];
    await upsertGoals(writes);

    // Fire-and-forget XP (anti-cheat: must be ≥ 14 days old)
    const goalAgeDays = (Date.now() - new Date(completing.created_at).getTime()) / 86_400_000;
    if (goalAgeDays >= 14 && completing.user_id) {
      import('../lib/xpEngine').then(({ awardGoalXP }) => {
        awardGoalXP(completing.user_id, completing.id)
          .then(result => {
            const { useXPStore } = require('./xpSlice');
            useXPStore.getState().applyXPResult(result);
          })
          .catch((err: unknown) => console.warn('[XP] awardGoalXP failed:', err));
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

  reorderQueue: async (orderedIds) => {
    const now = new Date().toISOString();
    const goals = get().goals;
    const updates: Goal[] = [];

    orderedIds.forEach((id, idx) => {
      const goal = goals.find(g => g.id === id && g.status === 'queued');
      if (goal) updates.push({ ...goal, sort_index: idx, updated_at: now });
    });

    await upsertGoals(updates);
    const map = new Map(updates.map(g => [g.id, g]));
    set(s => ({ goals: s.goals.map(g => map.get(g.id) ?? g) }));
  },

  linkMarkToGoal: async (goalId, markId) => {
    await addGoalMarkLink({ id: uuidv4(), goal_id: goalId, mark_id: markId });
    set(s => ({
      goals: s.goals.map(g =>
        g.id === goalId
          ? { ...g, linked_mark_ids: [...new Set([...(g.linked_mark_ids ?? []), markId])] }
          : g
      ),
    }));
  },

  unlinkMarkFromGoal: async (goalId, markId) => {
    await removeGoalMarkLink(goalId, markId);
    set(s => ({
      goals: s.goals.map(g =>
        g.id === goalId
          ? { ...g, linked_mark_ids: (g.linked_mark_ids ?? []).filter(id => id !== markId) }
          : g
      ),
    }));
  },

  creditMarkToGoals: async (markId) => {
    const links = await getLinksForMark(markId);
    if (!links.length) return;

    const now = new Date().toISOString();
    const goals = get().goals;
    const toUpdate: Goal[] = [];

    for (const link of links) {
      const goal = goals.find(g => g.id === link.goal_id && g.status === 'active');
      if (!goal) continue;
      toUpdate.push({
        ...goal,
        current_mark_count: goal.current_mark_count + 1,
        updated_at: now,
      });
    }

    if (!toUpdate.length) return;

    await upsertGoals(toUpdate);
    const map = new Map(toUpdate.map(g => [g.id, g]));
    set(s => ({ goals: s.goals.map(g => map.get(g.id) ?? g) }));

    // Check completion for each updated goal
    await Promise.all(toUpdate.map(g => get().checkGoalCompletion(g.id)));
  },

  checkGoalCompletion: async (goalId) => {
    const now = new Date().toISOString();
    const goal = get().goals.find(g => g.id === goalId);
    if (!goal || goal.status !== 'active') return;

    if (isMarkCountComplete(goal)) {
      await get().completeGoal(goalId);
      return;
    }

    if (isDeadlineExpired(goal)) {
      const expired: Goal = { ...goal, status: 'expired', updated_at: now };
      await upsertGoal(expired);

      // Activate next in queue
      const remaining = get().goals.filter(g => g.id !== goalId);
      const next = nextGoalToActivate(remaining);
      const activated: Goal | undefined = next
        ? { ...next, status: 'active', updated_at: now }
        : undefined;
      if (activated) await upsertGoal(activated);

      set(s => ({
        goals: s.goals.map(g => {
          if (g.id === goalId) return expired;
          if (activated && g.id === activated.id) return activated;
          return g;
        }),
      }));
    }
  },

  updateGoalTargetDate: async (id, date) => {
    await get().updateGoal(id, { deadline_date: date, target_date: date });
  },

  markMilestonesFired: async (goalId, keys) => {
    if (!keys.length) return;
    const goal = get().goals.find(g => g.id === goalId);
    if (!goal) return;
    const now = new Date().toISOString();
    const existing = goal.milestones_fired ?? [];
    await get().updateGoal(goalId, {
      milestones_fired: [...new Set([...existing, ...keys])],
      updated_at: now,
    });
  },

  getActiveGoal: () => getActiveGoal(get().goals),
  getQueuedGoals: () => getQueuedGoals(get().goals),
  getCompletedGoals: () => getCompletedGoals(get().goals),

  checkAllGoalExpiry: () => {
    InteractionManager.runAfterInteractions(async () => {
      const activeGoals = get().goals.filter(g => g.status === 'active');
      for (const goal of activeGoals) {
        if (isDeadlineExpired(goal)) {
          await get().checkGoalCompletion(goal.id);
        }
      }
    });
  },

  // Backward compat
  loadGoals: async (userId) => get().fetchGoals(userId),
  addGoal: async ({ title, description, userId, isPro }) =>
    get().createGoal({ title, description, userId, isPro }),
}));

