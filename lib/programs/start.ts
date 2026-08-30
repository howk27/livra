// lib/programs/start.ts
// Guided Programs start flow (PG-4, spec §5). The AI-package activation path
// (lib/goals/createFromAIPackage.ts) is the model: plain function, existing
// creation mutations, per-mark failure tolerance, hand invalidation.
//
// Livra+ only (spec §2): the catalog and previews are free to browse; STARTING
// is the gate. The screen shows the paywall; this throw is the engine-level
// backstop so no other caller can slip a free start through. Losing Pro
// mid-program gates nothing here retroactively — the goal and marks are normal
// data and stay fully usable (grandfathered, spec §5).

import { createGoal } from '../data/mutations/goals';
import { createMark } from '../data/mutations/marks';
import { fetchGoals } from '../data/goals';
import { queryClient } from '../data/queryClient';
import { queryKeys } from '../data/queryKeys';
import { MARK_LIBRARY_BY_ID } from '../suggestedCounters';
import { colorForSuggestedCounter } from '../markCategory';
import { defaultDailyTargetForMarkId } from '../markQuantitative';
import { capture } from '../analytics/posthog';
import { ANALYTICS_EVENTS } from '../analytics/events';
import { logger } from '../utils/logger';
import type { PaceLevel } from '../paceSetting';
import type { GoalRow } from '../data/types';
import { PROGRAM_BY_ID } from './catalog';
import { programMarkWeeklyTarget } from './derive';

export class ProgramProGateError extends Error {
  constructor() {
    super('Guided Programs are part of Livra+.');
    this.name = 'ProgramProGateError';
  }
}

export type StartProgramArgs = {
  userId: string;
  isPro: boolean;
  programId: string;
  pace: PaceLevel;
};

/**
 * Start a program: create the goal (title = card title, description = the
 * card's whyItWorks so deriveWhy feeds the review quote) + stage-1 marks with
 * pace-scaled targets. One program instance per id at a time — a second Start
 * while its goal is active returns the existing goal (the screen opens it).
 */
export async function startProgram(args: StartProgramArgs): Promise<GoalRow> {
  const { userId, isPro, programId, pace } = args;
  if (!isPro) throw new ProgramProGateError();
  const def = PROGRAM_BY_ID[programId];
  if (!def) throw new Error(`Unknown program: ${programId}`);

  const goalRows = await queryClient.ensureQueryData({
    queryKey: queryKeys.goals(userId),
    queryFn: fetchGoals,
  });
  const existing = goalRows.find((g) => g.program_id === def.id && g.status === 'active');
  if (existing) return existing;

  const maxSortIndex = goalRows
    .filter((g) => g.status === 'active')
    .reduce((m, g) => Math.max(m, g.sort_index), -1);

  const goal = await createGoal({
    userId,
    title: def.title,
    description: def.whyItWorks,
    // The explicit store-era defaults every creation path writes (see
    // createFromAIPackage) so the hero's unlock maths sees the same shape.
    tier: 'building',
    frequency: 'steady',
    sortIndex: maxSortIndex + 1,
    programId: def.id,
  });

  capture(ANALYTICS_EVENTS.GOAL_CREATED, {
    goal_id: goal.id,
    mark_count: 0,
    tier: 'building',
    frequency: 'steady',
    method: 'program',
  });

  for (const m of def.stages[0].marks) {
    const lib = MARK_LIBRARY_BY_ID[m.libraryId];
    if (!lib) continue; // guard test makes this unreachable; belt and braces
    try {
      // Created AND linked in one call (goalId -> a goal_mark_links row).
      await createMark({
        userId,
        name: lib.name,
        emoji: lib.emoji,
        color: colorForSuggestedCounter(lib),
        unit: lib.unit,
        enableStreak: false,
        sortIndex: 0,
        goalId: goal.id,
        cadence: {
          frequency_kind: lib.frequencyKind,
          frequency_min: lib.frequency_min,
          frequency_recommended: lib.frequency_recommended,
          frequency_max: lib.frequency_max,
          // Fixed/abstinence keep recommended; variable takes the card's
          // pace-scaled target (spec §3; the 2026-08-04 backfill precedent).
          weekly_target: programMarkWeeklyTarget(lib, m.weeklyTarget, pace),
          dailyTarget: m.dailyTarget ?? defaultDailyTargetForMarkId(lib.id),
          maintenance_of: null,
        },
      });
    } catch (err) {
      // A single mark failing must not abandon the goal or the other marks
      // (createFromAIPackage precedent). Reconcile heals the gap on next open.
      logger.error('[startProgram] mark create/link failed:', err);
    }
  }

  void queryClient.invalidateQueries({ queryKey: queryKeys.goals(userId) });
  void queryClient.invalidateQueries({ queryKey: queryKeys.marks(userId) });
  void queryClient.invalidateQueries({ queryKey: queryKeys.marksByGoal(userId) });

  return goal;
}
