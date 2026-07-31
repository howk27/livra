// hooks/useCompleteGoal.ts
//
// M9 Phase 3 Task 6 — the app-layer replacement for `goalsSlice.completeGoal`.
//
// `lib/data/mutations/goals.ts` `completeGoal` writes the goal row and NOTHING
// else, deliberately. Everything the store did after that write is app
// orchestration, and it lives here — the same split `hooks/useCheckin.ts` made for
// badges, and for the same reason: a failed XP award must not read to the user as
// a failed completion.
//
// WHAT MOVED, UNCHANGED IN BEHAVIOUR:
//   • XP, still gated on the 14-day anti-cheat rule and still fire-and-forget
//   • the GOAL_COMPLETED analytics event, with the same three properties
//   • clearing the momentum snapshot
//   • converting the goal's marks to maintenance habits (Phase 3.2)
//
// ORDER MATTERS IN ONE PLACE: `bankedMomentumDays` is read BEFORE the write and
// the snapshot is cleared AFTER it. The store read it from
// `useMomentumStore.snapshots[id]` and so does this — the data layer does not read
// Zustand, which is why the mutation takes the number as an input.

import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useCompleteGoalMutation } from '../lib/data/mutations/goals';
import { convertGoalMarksToMaintenance } from '../lib/data/mutations/marks';
import { queryKeys } from '../lib/data/queryKeys';
import { useMomentumStore } from '../state/momentumSlice';
import { capture } from '../lib/analytics/posthog';
import { ANALYTICS_EVENTS } from '../lib/analytics/events';
import { logger } from '../lib/utils/logger';

export interface CompleteGoalTarget {
  id: string;
  user_id: string;
  created_at: string;
}

export function useCompleteGoal(userId: string) {
  const client = useQueryClient();
  const mutation = useCompleteGoalMutation(userId);

  const completeGoal = useCallback(
    async (goal: CompleteGoalTarget) => {
      const bankedDays = Math.max(0, useMomentumStore.getState().snapshots[goal.id]?.days ?? 0);

      // The only step allowed to fail loudly. Everything below is consequence.
      await mutation.mutateAsync({ goalId: goal.id, bankedMomentumDays: bankedDays });

      // XP deleted in M9 Phase 5A (spec §4.4).
      const goalAgeDays = (Date.now() - new Date(goal.created_at).getTime()) / 86_400_000;

      capture(ANALYTICS_EVENTS.GOAL_COMPLETED, {
        goal_id: goal.id,
        banked_momentum_days: bankedDays,
        goal_age_days: Math.round(goalAgeDays),
      });

      useMomentumStore.getState().clearSnapshot(goal.id);

      // The goal is done, but its habits carry on as maintenance marks — a
      // SERVER write now (M9 Phase 5A Task 6): `maintenance_of` is stamped on
      // every mark still linked to the goal. Marks are re-invalidated AFTER the
      // stamp lands: the completion mutation's own invalidation fires first and
      // could refetch the pre-conversion rows.
      convertGoalMarksToMaintenance(goal.id)
        .then(() => client.invalidateQueries({ queryKey: queryKeys.marks(goal.user_id) }))
        .catch((error: unknown) =>
          logger.error('[completeGoal] convertGoalMarksToMaintenance failed', error),
        );
    },
    [mutation, client],
  );

  return { completeGoal, isCompleting: mutation.isPending };
}
