/**
 * createFromAIPackage — persist a confirmed AI goal package (FU-6).
 *
 * Factored out of onboarding's handlePersistAndComplete steps 2-4 so onboarding
 * and /goal/suggest share one confirm path:
 *   1. createGoal (throws GoalLimitError at the 2-goal soft cap — caller handles)
 *   2. addMark per selected mark (weekly_target = AI frequency)
 *   3. linkMarkToGoal per created mark
 *   4. writeGoalPackageCache (confirmed=true; future generations hit cache free)
 *
 * Onboarding-only concerns (completeOnboarding, store reset) stay in the caller.
 * Pure orchestration over existing slices; no new state.
 */
import { useGoalsStore } from '../../state/goalsSlice';
import { useMarksStore } from '../../state/countersSlice';
import { MARK_LIBRARY } from '../suggestedCounters';
import { colorForSuggestedCounter } from '../markCategory';
import { defaultDailyTargetForMarkId } from '../markQuantitative';
import {
  resolveMarkForAIIcon,
  writeGoalPackageCache,
  type AIGoalPackage,
  type AIGoalMark,
} from '../ai/goalGeneration';
import { logger } from '../utils/logger';
import type { Goal } from '../../types/goal';

export type CreateFromAIPackageArgs = {
  userId: string;
  isPro: boolean;
  /** The goal text the user typed (semantic cache key), NOT the edited title. */
  goalText: string;
  /** The full validated package, written to the cache on confirm. */
  pkg: AIGoalPackage;
  /** Confirmed (possibly edited) goal title. */
  title: string;
  /** Optional user note. */
  description?: string;
  /** The marks the user kept selected in review. */
  marks: AIGoalMark[];
};

export async function createFromAIPackage(args: CreateFromAIPackageArgs): Promise<Goal> {
  const { userId, isPro, goalText, pkg, title, description, marks } = args;
  const { createGoal, linkMarkToGoal } = useGoalsStore.getState();
  const { addMark } = useMarksStore.getState();

  // 1. Create the goal. GoalLimitError propagates to the caller (soft-cap Alert).
  //    QC3-C (founder call): the AI's projected finish is a SOFT projection —
  //    surfaced as the "you'll be ready by" line at review only (GoalPackageReview
  //    derives it from pkg.timeframeWeeks). We deliberately do NOT write it to
  //    target_date: target_date is the expiring deadline (goal ends, marks →
  //    maintenance, when it passes), and an AI estimate must never silently end
  //    someone's goal. The projection is not persisted on the goal.
  const goal = await createGoal({
    title: title.trim() || pkg.goalTitle,
    description: description?.trim() || undefined,
    userId,
    isPro,
    method: 'ai',
  });

  // 2 + 3. Create and link each selected mark.
  for (const m of marks) {
    const resolved = resolveMarkForAIIcon(m.icon);
    const libraryMark = MARK_LIBRARY.find((l) => l.id === resolved.markId);
    if (!libraryMark) continue;

    try {
      const newMark = await addMark({
        name: libraryMark.name,
        emoji: libraryMark.emoji,
        // QC4-M: category-derived, matching every other creation path.
        color: colorForSuggestedCounter(libraryMark),
        unit: libraryMark.unit,
        user_id: userId,
        goal_period: 'day',
        schedule_type: 'daily',
        // Binary by default (1 = one tap completes the day); water and other
        // quantitative marks start at their count-up target.
        dailyTarget: defaultDailyTargetForMarkId(libraryMark.id),
        total: 0,
        enable_streak: false,
        sort_index: 0,
        goal_id: goal.id,
        frequency_kind: libraryMark.frequencyKind,
        frequency_min: libraryMark.frequency_min,
        frequency_recommended: libraryMark.frequency_recommended,
        frequency_max: libraryMark.frequency_max,
        weekly_target: m.frequency,
      });
      await linkMarkToGoal(goal.id, newMark.id);
    } catch (err) {
      // A single mark failing must not abandon the goal or the other marks.
      logger.error('[createFromAIPackage] mark create/link failed:', err);
    }
  }

  // 4. Confirm-time cache write. The free-use counter was already incremented
  // server-side at generation time; this only marks the package confirmed.
  await writeGoalPackageCache(userId, goalText, pkg);

  return goal;
}
