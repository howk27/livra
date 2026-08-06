/**
 * createFromAIPackage — persist a confirmed AI goal package (FU-6).
 *
 * Factored out of onboarding's handlePersistAndComplete steps 2-4 so onboarding
 * and /goal/suggest share one confirm path:
 *   1. createGoal through `lib/data/mutations/goals` (the 2-goal cap is checked
 *      here as UX and throws GoalLimitError — the caller's soft-cap popup — while
 *      RLS stays the enforcement)
 *   2. createMark per selected mark (weekly_target = AI frequency for variable
 *      marks; library recommended for fixed/abstinence), which writes
 *      the goal link in the same call — never `marks.goal_id`
 *   3. writeGoalPackageCache (confirmed=true; future generations hit cache free)
 *
 * M9 Phase 3 Task 6: this was the last non-screen caller of the store write path.
 * It now writes Supabase directly and invalidates the query keys itself (it is a
 * plain function, not a hook, so it uses the singleton client the provider mounts).
 * Onboarding-only concerns (completeOnboarding, store reset) stay in the caller.
 */
import { createGoal } from '../data/mutations/goals';
import { createMark } from '../data/mutations/marks';
import { fetchGoals } from '../data/goals';
import { fetchMarksForUser } from '../data/marks';
import { queryClient } from '../data/queryClient';
import { queryKeys } from '../data/queryKeys';
import { GoalLimitError } from '../errors';
import { getSupabaseClient } from '../supabase';
import { MARK_LIBRARY } from '../suggestedCounters';
import { colorForSuggestedCounter } from '../markCategory';
import { defaultDailyTargetForMarkId } from '../markQuantitative';
import {
  allowedPackageMarkCount,
  resolveMarkForAIIcon,
  writeGoalPackageCache,
  type AIGoalPackage,
  type AIGoalMark,
} from '../ai/goalGeneration';
import { canAddGoal, countActiveMarks } from '../gating';
import { capture } from '../analytics/posthog';
import { ANALYTICS_EVENTS } from '../analytics/events';
import { logger } from '../utils/logger';
import type { GoalRow } from '../data/types';

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

export async function createFromAIPackage(args: CreateFromAIPackageArgs): Promise<GoalRow> {
  const { userId, isPro, goalText, pkg, title, description, marks } = args;

  // 1. Create the goal. The 2-goal cap used to be checked inside the store's
  //    createGoal; the mutation deliberately leaves it to RLS, so the UX
  //    pre-check lives here and keeps the caller contract: GoalLimitError
  //    propagates to the soft-cap popup.
  //    QC3-C (founder call): the AI's projected finish is a SOFT projection —
  //    surfaced as the "you'll be ready by" line at review only (GoalPackageReview
  //    derives it from pkg.timeframeWeeks). We deliberately do NOT write it to
  //    the deadline: an AI estimate must never silently end someone's goal.
  const goalRows = await queryClient.ensureQueryData({
    queryKey: queryKeys.goals(userId),
    queryFn: fetchGoals,
  });
  const nonCompleted = goalRows.filter(
    (g) => g.status !== 'completed' && g.status !== 'expired',
  );
  if (!canAddGoal(isPro, nonCompleted.length)) throw new GoalLimitError();
  const maxSortIndex = goalRows
    .filter((g) => g.status === 'active')
    .reduce((m, g) => Math.max(m, g.sort_index), -1);

  const goal = await createGoal({
    userId,
    title: title.trim() || pkg.goalTitle,
    description: description?.trim() || null,
    // The store defaulted every AI goal to building/steady; written explicitly
    // now so the hero's unlock maths sees the same shape it always has.
    tier: 'building',
    frequency: 'steady',
    sortIndex: maxSortIndex + 1,
  });

  // The store used to fire this inside createGoal; analytics stays with the
  // orchestration, same properties as before.
  capture(ANALYTICS_EVENTS.GOAL_CREATED, {
    goal_id: goal.id,
    mark_count: 0,
    tier: 'building',
    frequency: 'steady',
    method: 'ai',
  });

  // 2. Create each selected mark, trimmed to what the account can actually
  //    hold. The trim mirrors the RESTRICTIVE account-ceiling policy on
  //    public.marks so a free user near the ceiling meets a worded note at
  //    review instead of a refused request here. Counted from the query layer:
  //    the SQLite store no longer sees mutation-created marks until sync pulls.
  const markRows = await queryClient.ensureQueryData({
    queryKey: queryKeys.marks(userId),
    queryFn: fetchMarksForUser,
  });
  const allowed = allowedPackageMarkCount(isPro, countActiveMarks(markRows));
  const marksToCreate = marks.slice(0, allowed);
  if (marksToCreate.length < marks.length) {
    logger.warn(
      `[createFromAIPackage] trimmed ${marks.length - marksToCreate.length} mark(s) to stay inside the free-tier ceiling`,
    );
  }

  for (const m of marksToCreate) {
    const resolved = resolveMarkForAIIcon(m.icon);
    const libraryMark = MARK_LIBRARY.find((l) => l.id === resolved.markId);
    if (!libraryMark) continue;

    try {
      // Created AND linked in one call (goalId → a goal_mark_links row).
      await createMark({
        userId,
        name: libraryMark.name,
        emoji: libraryMark.emoji,
        // QC4-M: category-derived, matching every other creation path.
        color: colorForSuggestedCounter(libraryMark),
        unit: libraryMark.unit,
        enableStreak: false,
        sortIndex: 0,
        goalId: goal.id,
        // The AI's one-line rationale for this mark serving THIS goal — the
        // sentence the review screen shows. It rides the same call onto the
        // goal_mark_links row (never the mark); createMark trims/caps it at the
        // boundary because AI output is input, validator or not.
        why: m.why,
        cadence: {
          frequency_kind: libraryMark.frequencyKind,
          frequency_min: libraryMark.frequency_min,
          frequency_recommended: libraryMark.frequency_recommended,
          frequency_max: libraryMark.frequency_max,
          // The AI's per-week count only steers marks that are genuinely
          // variable. fixed/abstinence marks are whole-day states — every-day
          // by rule (see `water` in lib/suggestedCounters.ts) — and the AI
          // suggesting "Nutrition 5x/week" must not override that: this exact
          // override shipped weekly_target 5 on a fixed 7/7/7 Nutrition mark
          // (backfilled live 2026-08-04).
          weekly_target:
            libraryMark.frequencyKind === 'variable'
              ? m.frequency
              : libraryMark.frequency_recommended,
          // Binary by default (1 = one tap completes the day); water and other
          // quantitative marks start at their count-up target.
          dailyTarget: defaultDailyTargetForMarkId(libraryMark.id),
          maintenance_of: null,
        },
      });
    } catch (err) {
      // A single mark failing must not abandon the goal or the other marks.
      logger.error('[createFromAIPackage] mark create/link failed:', err);
    }
  }

  // 3. Confirm-time cache write (marks the package confirmed for the free cache).
  await writeGoalPackageCache(userId, goalText, pkg);

  // 4. Spend the free AI use — ONLY now that a goal actually exists (2026-07-19).
  //    Generation no longer consumes it (the edge fn gates read-only), so a
  //    dismissed or low-confidence plan costs nothing; the one free use is spent
  //    here, on create. Best-effort: the goal is already the user's, so a failed
  //    increment must never surface as an error or undo the goal. Pro is unlimited.
  if (!isPro) {
    try {
      await getSupabaseClient().rpc('increment_ai_uses_count', { p_user_id: userId });
    } catch (err) {
      logger.error('[createFromAIPackage] free-use increment failed:', err);
    }
  }

  // 5. The writes went to Supabase; tell the reads. A plain function cannot ride
  //    a mutation hook's onSuccess, so it invalidates the same scope by hand.
  void queryClient.invalidateQueries({ queryKey: queryKeys.goals(userId) });
  void queryClient.invalidateQueries({ queryKey: queryKeys.marks(userId) });
  void queryClient.invalidateQueries({ queryKey: queryKeys.marksByGoal(userId) });

  return goal;
}
