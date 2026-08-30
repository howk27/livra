// lib/programs/programMarks.ts
// The ONE place a program writes a mark (PG-4 sweep). Start and reconcile both
// create library marks with the full cadence set; cadence is the data family
// this project has broken most often, so the shape lives once, here.

import { createMark } from '../data/mutations/marks';
import { colorForSuggestedCounter } from '../markCategory';
import { defaultDailyTargetForMarkId } from '../markQuantitative';
import type { MarkDefinition } from '../suggestedCounters';

export type CreateProgramMarkArgs = {
  userId: string;
  goalId: string;
  lib: MarkDefinition;
  /** Already pace-scaled (and eased) by the caller via programMarkWeeklyTarget. */
  weeklyTarget: number;
  /** Card override; absent = the library default. */
  dailyTarget?: number;
};

/** Create AND link one program mark (goalId -> a goal_mark_links row). */
export async function createProgramMark(args: CreateProgramMarkArgs): Promise<void> {
  const { userId, goalId, lib, weeklyTarget, dailyTarget } = args;
  await createMark({
    userId,
    name: lib.name,
    emoji: lib.emoji,
    color: colorForSuggestedCounter(lib),
    unit: lib.unit,
    enableStreak: false,
    sortIndex: 0,
    goalId,
    cadence: {
      frequency_kind: lib.frequencyKind,
      frequency_min: lib.frequency_min,
      frequency_recommended: lib.frequency_recommended,
      frequency_max: lib.frequency_max,
      weekly_target: weeklyTarget,
      dailyTarget: dailyTarget ?? defaultDailyTargetForMarkId(lib.id),
      maintenance_of: null,
    },
  });
}
