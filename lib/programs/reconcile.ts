// lib/programs/reconcile.ts
// Stage-mark reconcile (PG-4, spec §5): ADDITIVE ONLY, IDEMPOTENT. On app
// open, for each active program goal: any mark the CURRENT stage lists that
// the goal lacks is created and linked; a live variable mark whose target
// drifted from the scaled stage target is rewritten. Marks are NEVER deleted
// or archived here, and a tombstoned mark or link for a stage's library id
// means SKIP — the user deleted it, and it stays deleted (never resurrect).
//
// Runs where the widget/momentum reconciles already run (app/_layout.tsx
// foreground block). Best-effort: every failure is logged, never thrown.

import { dataClient } from '../data/client';
import { createMark, editMark } from '../data/mutations/marks';
import { queryClient } from '../data/queryClient';
import { queryKeys } from '../data/queryKeys';
import { fetchGoals } from '../data/goals';
import { readGoalDataSnapshot } from '../goals/momentumEvaluation';
import { MARK_LIBRARY_BY_ID } from '../suggestedCounters';
import { colorForSuggestedCounter } from '../markCategory';
import { defaultDailyTargetForMarkId } from '../markQuantitative';
import { getPace } from '../paceSetting';
import { todayISO } from '../features';
import { logger } from '../utils/logger';
import { PROGRAM_BY_ID } from './catalog';
import { DEFAULT_EASED_SCALE } from './types';
import { deriveProgramState, programMarkWeeklyTarget } from './derive';

type LinkedMark = {
  id: string;
  name: string;
  weekly_target: number | null;
  frequency_kind: string | null;
  markDeleted: boolean;
  linkDeleted: boolean;
};

/** The goal's marks through its links, INCLUDING tombstoned rows (spec §5). */
async function fetchLinkedMarksWithTombstones(goalId: string): Promise<LinkedMark[]> {
  const client = dataClient();
  const { data: links, error: linkError } = await client
    .from('goal_mark_links')
    .select('mark_id, deleted_at')
    .eq('goal_id', goalId);
  if (linkError) throw linkError;
  const rows = links ?? [];
  if (rows.length === 0) return [];
  const { data: marks, error: markError } = await client
    .from('marks')
    .select('id, name, weekly_target, frequency_kind, deleted_at')
    .in(
      'id',
      rows.map((l) => l.mark_id),
    );
  if (markError) throw markError;
  const linkDeletedById = new Map(rows.map((l) => [l.mark_id, l.deleted_at != null]));
  return (marks ?? []).map((m) => ({
    id: m.id,
    name: m.name,
    weekly_target: m.weekly_target,
    frequency_kind: m.frequency_kind,
    markDeleted: m.deleted_at != null,
    linkDeleted: linkDeletedById.get(m.id) ?? false,
  }));
}

export async function reconcileProgramStageMarks(
  userId: string,
  todayStr: string = todayISO(),
): Promise<void> {
  try {
    const goals = await queryClient.ensureQueryData({
      queryKey: queryKeys.goals(userId),
      queryFn: fetchGoals,
    });
    const programGoals = goals.filter(
      (g) => g.status === 'active' && g.program_id != null && PROGRAM_BY_ID[g.program_id],
    );
    if (programGoals.length === 0) return;

    const pace = await getPace();
    const snapshot = readGoalDataSnapshot(queryClient, userId);
    let changed = false;

    for (const goal of programGoals) {
      try {
        const def = PROGRAM_BY_ID[goal.program_id as string];
        const linked = await fetchLinkedMarksWithTombstones(goal.id);
        const liveMarks = linked.filter((m) => !m.markDeleted && !m.linkDeleted);
        const state = deriveProgramState(def, goal, liveMarks, snapshot.events, pace, todayStr);
        const easedScale =
          state.mode === 'eased' ? (state.stage.easedScale ?? DEFAULT_EASED_SCALE) : undefined;

        for (const stageMark of state.stage.marks) {
          const lib = MARK_LIBRARY_BY_ID[stageMark.libraryId];
          if (!lib) continue;
          const desired = programMarkWeeklyTarget(lib, stageMark.weeklyTarget, pace, easedScale);
          // Library id -> mark row by NAME: creation copies the library name
          // verbatim (startProgram / createFromAIPackage). A renamed mark no
          // longer matches and is treated as absent from the stage; the
          // tombstone check below still sees the original-named row.
          const match = linked.find((m) => m.name === lib.name);

          if (match && (match.markDeleted || match.linkDeleted)) continue; // never resurrect
          if (!match) {
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
                weekly_target: desired,
                dailyTarget: stageMark.dailyTarget ?? defaultDailyTargetForMarkId(lib.id),
                maintenance_of: null,
              },
            });
            changed = true;
            continue;
          }
          if (match.frequency_kind === 'variable' && match.weekly_target !== desired) {
            await editMark(match.id, { cadence: { weekly_target: desired } });
            changed = true;
          }
        }
      } catch (err) {
        logger.error('[programs] reconcile failed for goal', goal.id, err);
      }
    }

    if (changed) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.marks(userId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.marksByGoal(userId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.goals(userId) });
    }
  } catch (err) {
    logger.error('[programs] reconcile failed:', err);
  }
}
