import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { InteractionManager } from 'react-native';
import type { Goal } from '../types/goal';
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
import { capture } from '../lib/analytics/posthog';
import { ANALYTICS_EVENTS } from '../lib/analytics/events';
import { evaluateGoalMomentum } from '../lib/goalMomentumStore';
import type { MomentumSnapshot } from '../lib/goalMomentum';
import { useMomentumStore } from './momentumSlice';
import { yyyyMmDd } from '../lib/date';
import { useMarksStore } from './countersSlice';
import {
  getActiveGoal,
  getActiveGoals,
  getCompletedGoals,
  isDeadlineExpired,
  calculateGoalProgress,
  calculateUnlockThreshold,
  goalCommitmentTarget,
} from '../lib/goalLogic';

export class GoalLimitError extends Error {
  constructor() {
    super('Free keeps you to 2 goals at once. Finish one or upgrade to Livra+ for unlimited goals.');
    this.name = 'GoalLimitError';
  }
}

export interface GoalsState {
  goals: Goal[];
  isLoading: boolean;
  error: string | null;

  fetchGoals: (userId: string) => Promise<void>;
  createGoal: (data: Partial<Goal> & { userId: string; isPro: boolean; tier?: TierId; frequency?: FrequencyId; method?: 'manual' | 'ai' }) => Promise<Goal>;
  updateGoal: (id: string, data: Partial<Goal>) => Promise<void>;
  deleteGoal: (id: string) => Promise<void>;
  completeGoal: (id: string) => Promise<void>;
  reorderGoals: (orderedIds: string[]) => Promise<void>;
  linkMarkToGoal: (goalId: string, markId: string) => Promise<void>;
  unlinkMarkFromGoal: (goalId: string, markId: string) => Promise<void>;
  /** Called after a mark is logged. Credits linked goals at most once per mark
   *  per local day (extra reps stay on the mark), evaluates Momentum, and checks
   *  deadline expiry. Never auto-completes on count. Non-blocking by convention. */
  creditMarkToGoals: (markId: string) => Promise<void>;
  checkGoalCompletion: (goalId: string) => Promise<void>;
  updateGoalTargetDate: (id: string, date: string | null) => Promise<void>;
  updateGoalTitle: (id: string, newTitle: string) => Promise<void>;
  markMilestonesFired: (goalId: string, keys: string[]) => Promise<void>;
  getActiveGoal: () => Goal | undefined;
  getActiveGoals: () => Goal[];
  getCompletedGoals: () => Goal[];
  getGoalProgress: (goalId: string) => {
    /** Check-in DAYS earned (one per linked mark per day, daily target met). */
    progress: number;
    /** What the ring/bar fills against: the commitment target, or the early-unlock floor for pre-commitment goals. */
    threshold: number;
    /** The full creation-time commitment, when the goal has one. */
    target: number | null;
    /** Early manual completion is unlocked (footer path). */
    canComplete: boolean;
    /** The whole commitment is in — prompt the user to claim the goal. */
    readyToClaim: boolean;
  };

  /** Checks all active goals for deadline expiry. Non-blocking; call on app foreground. */
  checkAllGoalExpiry: () => void;

  /** Re-evaluates Momentum for every active goal (trigger 2 — decay). Returns each goal's snapshot. Call on app foreground. */
  evaluateActiveGoalsMomentum: () => Promise<Map<string, MomentumSnapshot>>;

  /** @deprecated Use fetchGoals */
  loadGoals: (userId: string) => Promise<void>;
  /** @deprecated Use createGoal */
  addGoal: (params: { title: string; description?: string; userId: string; isPro: boolean; markIds?: string[] }) => Promise<Goal>;
}

export const useGoalsStore = create<GoalsState>((set, get) => ({
  goals: [],
  isLoading: false,
  error: null,

  fetchGoals: async (userId) => {
    set({ isLoading: true, error: null });
    try {
      const loaded = await loadGoalsForUser(userId);
      const goals = loaded.map(g =>
        (g.status as string) === 'queued' ? { ...g, status: 'active' as const } : g
      );
      set({ goals, isLoading: false });
    } catch (e) {
      set({ isLoading: false, error: e instanceof Error ? e.message : 'Failed to load goals' });
    }
  },

  createGoal: async ({ userId, isPro, tier, frequency, method, ...data }) => {
    const current = get().goals.filter(g => g.user_id === userId);
    const nonCompleted = current.filter(g => g.status !== 'completed' && g.status !== 'expired');
    if (!canAddGoal(isPro, nonCompleted.length)) throw new GoalLimitError();

    const activeGoals = current.filter(g => g.status === 'active');
    const maxSortIndex = activeGoals.reduce((m, g) => Math.max(m, g.sort_index), -1);

    const now = new Date().toISOString();
    const goal: Goal = {
      id: uuidv4(),
      user_id: userId,
      title: (data.title ?? '').trim(),
      description: data.description?.trim() || undefined,
      icon: data.icon,
      color: data.color,
      status: 'active',
      sort_index: maxSortIndex + 1,
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

    // Persist mark links. user_id is REQUIRED — RLS rejects a link whose user_id
    // is not auth.uid(), silently, at push time (M6-B).
    if (goal.linked_mark_ids?.length) {
      await Promise.all(
        goal.linked_mark_ids.map(markId =>
          addGoalMarkLink({ goal_id: goal.id, mark_id: markId, user_id: userId })
        )
      );
    }

    set(s => ({ goals: [...s.goals, goal] }));
    capture(ANALYTICS_EVENTS.GOAL_CREATED, {
      goal_id: goal.id,
      mark_count: goal.linked_mark_ids?.length ?? 0,
      tier: goal.tier ?? null,
      frequency: goal.frequency ?? null,
      method: method ?? 'manual',
    });
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
        ...toAdd.map(markId =>
          addGoalMarkLink({ goal_id: id, mark_id: markId, user_id: goal.user_id })
        ),
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

    const bankedDays = Math.max(0, useMomentumStore.getState().snapshots[id]?.days ?? 0);
    const completed: Goal = {
      ...completing,
      status: 'completed',
      completed_at: now,
      updated_at: now,
      banked_momentum_days: bankedDays,
    };
    await upsertGoals([completed]);

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
      goals: s.goals.map(g => (g.id === completed.id ? completed : g)),
    }));
    capture(ANALYTICS_EVENTS.GOAL_COMPLETED, {
      goal_id: completed.id,
      banked_momentum_days: bankedDays,
      goal_age_days: Math.round(goalAgeDays),
    });
    useMomentumStore.getState().clearSnapshot(id);

    // Phase 3.2: the goal is done, but its habits keep going as maintenance marks.
    useMarksStore.getState().convertMarksToMaintenance(id).catch((err: unknown) =>
      console.warn('[Maintenance] convertMarksToMaintenance failed:', err)
    );
  },

  reorderGoals: async (orderedIds) => {
    const now = new Date().toISOString();
    const goals = get().goals;
    const updates: Goal[] = [];

    orderedIds.forEach((id, idx) => {
      const goal = goals.find(g => g.id === id && g.status === 'active');
      if (goal) updates.push({ ...goal, sort_index: idx, updated_at: now });
    });

    await upsertGoals(updates);
    const map = new Map(updates.map(g => [g.id, g]));
    set(s => ({ goals: s.goals.map(g => map.get(g.id) ?? g) }));
  },

  linkMarkToGoal: async (goalId, markId) => {
    // The link's owner is the goal's owner — the same rule the RLS policy uses.
    // Without a known owner the row would be rejected server-side, so refuse here
    // rather than write a link that can never sync.
    const owner = get().goals.find(g => g.id === goalId)?.user_id;
    if (!owner) return;
    await addGoalMarkLink({ goal_id: goalId, mark_id: markId, user_id: owner });
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

    // One credit per mark per local day: the just-logged event is already in the
    // events store, so a second increment today means this log earns no credit.
    // Extra reps still land on the mark itself (counters, streaks, bests).
    const { useEventsStore } = require('../state/eventsSlice');
    const events: { mark_id: string; event_type: string; occurred_local_date: string; deleted_at?: string | null }[] =
      useEventsStore.getState().events ?? [];
    const todayIncrements = events.filter(
      e => e.mark_id === markId && e.event_type === 'increment' && !e.deleted_at
    );
    const latestDay = todayIncrements.reduce(
      (max, e) => (e.occurred_local_date > max ? e.occurred_local_date : max),
      ''
    );
    const alreadyCreditedToday =
      todayIncrements.filter(e => e.occurred_local_date === latestDay).length > 1;

    for (const link of links) {
      const goal = goals.find(g => g.id === link.goal_id && g.status === 'active');
      if (!goal) continue;
      toUpdate.push(
        alreadyCreditedToday
          ? { ...goal }
          : { ...goal, current_mark_count: goal.current_mark_count + 1, updated_at: now }
      );
    }

    if (!toUpdate.length) return;

    if (alreadyCreditedToday) {
      // No count credit and nothing to persist, but the day still counts for
      // Momentum — evaluate and return without touching the goals.
      const todayEval = yyyyMmDd(new Date());
      const marksNow = useMarksStore.getState().marks;
      await Promise.all(
        toUpdate.map(async (g) => {
          const ids = new Set(g.linked_mark_ids ?? []);
          const goalMarks = marksNow
            .filter((m) => !m.deleted_at && ids.has(m.id))
            .map((m) => ({ id: m.id, weekly_target: m.weekly_target, last_activity_date: m.last_activity_date }));
          const snap = await evaluateGoalMomentum(g.id, goalMarks, todayEval);
          useMomentumStore.getState().setSnapshot(g.id, snap, todayEval);
        }),
      );
      return;
    }

    await upsertGoals(toUpdate);
    const map = new Map(toUpdate.map(g => [g.id, g]));
    set(s => ({ goals: s.goals.map(g => map.get(g.id) ?? g) }));

    // Momentum (trigger 1): evaluate each credited active goal on this log.
    // Same-day eval is what *starts* the run (on_track) and continues it.
    const today = yyyyMmDd(new Date());
    const allMarks = useMarksStore.getState().marks;
    await Promise.all(
      toUpdate.map(async (g) => {
        const ids = new Set(g.linked_mark_ids ?? []);
        const goalMarks = allMarks
          .filter((m) => !m.deleted_at && ids.has(m.id))
          .map((m) => ({ id: m.id, weekly_target: m.weekly_target, last_activity_date: m.last_activity_date }));
        const snap = await evaluateGoalMomentum(g.id, goalMarks, today);
        useMomentumStore.getState().setSnapshot(g.id, snap, today);
      }),
    );

    // Check completion for each updated goal
    await Promise.all(toUpdate.map(g => get().checkGoalCompletion(g.id)));
  },

  checkGoalCompletion: async (goalId) => {
    const now = new Date().toISOString();
    const goal = get().goals.find(g => g.id === goalId);
    if (!goal || goal.status !== 'active') return;

    // Founder 2026-07-18: hitting the check-in target never auto-completes a
    // goal — marks are a guide, the user declares the outcome. Readiness is
    // surfaced via getGoalProgress().readyToClaim; only deadlines act here.
    if (isDeadlineExpired(goal)) {
      const expired: Goal = { ...goal, status: 'expired', updated_at: now };
      await upsertGoal(expired);
      set(s => ({
        goals: s.goals.map(g => (g.id === goalId ? expired : g)),
      }));
      useMomentumStore.getState().clearSnapshot(goalId);

      // Phase 3.3: a passed deadline ends the goal, but its habits keep going as
      // maintenance marks (same as completion, without the celebration/XP/banking).
      useMarksStore.getState().convertMarksToMaintenance(goalId).catch((err: unknown) =>
        console.warn('[Maintenance] convertMarksToMaintenance failed on expiry:', err)
      );
    }
  },

  updateGoalTargetDate: async (id, date) => {
    await get().updateGoal(id, { deadline_date: date, target_date: date });
  },

  updateGoalTitle: async (id, newTitle) => {
    const trimmed = newTitle.trim();
    if (trimmed.length < 3) return;
    await get().updateGoal(id, { title: trimmed });
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
  getActiveGoals: () => getActiveGoals(get().goals),
  getCompletedGoals: () => getCompletedGoals(get().goals),

  getGoalProgress: (goalId) => {
    const goal = get().goals.find(g => g.id === goalId);
    if (!goal) return { progress: 0, threshold: 7, target: null, canComplete: false, readyToClaim: false };
    const { useEventsStore } = require('../state/eventsSlice');
    const events = useEventsStore.getState().events ?? [];
    const progress = calculateGoalProgress(goal, events, useMarksStore.getState().marks);
    const unlock = calculateUnlockThreshold(goal);
    const target = goalCommitmentTarget(goal);
    return {
      progress,
      threshold: target ?? unlock,
      target,
      canComplete: progress >= unlock,
      readyToClaim: target !== null && progress >= target,
    };
  },

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

  evaluateActiveGoalsMomentum: async () => {
    const today = yyyyMmDd(new Date());
    const active = get().goals.filter((g) => g.status === 'active');
    const allMarks = useMarksStore.getState().marks;
    const result = new Map<string, MomentumSnapshot>();
    for (const g of active) {
      try {
        const ids = new Set(g.linked_mark_ids ?? []);
        const goalMarks = allMarks
          .filter((m) => !m.deleted_at && ids.has(m.id))
          .map((m) => ({ id: m.id, weekly_target: m.weekly_target, last_activity_date: m.last_activity_date }));
        const snap = await evaluateGoalMomentum(g.id, goalMarks, today);
        result.set(g.id, snap);
        useMomentumStore.getState().setSnapshot(g.id, snap, today);
      } catch (err) {
        console.warn(`[Momentum] evaluation failed for goal ${g.id}:`, err);
      }
    }
    return result;
  },

  // Backward compat
  loadGoals: async (userId) => get().fetchGoals(userId),
  addGoal: async ({ title, description, userId, isPro, markIds }) =>
    get().createGoal({ title, description, userId, isPro, linked_mark_ids: markIds ?? [] }),
}));

