// hooks/useCheckin.ts
//
// M9 Phase 3 Task 2 — the app-layer replacement for `useCounters().incrementMark`.
//
// The write itself is one row through `lib/data/mutations/checkins.ts`. What lives
// HERE is the chain that used to hang off the bottom of that ~237-line function:
// the post-log voice line, the MARK_LOGGED event, XP, badge progress and goal
// credit. They stay out of `lib/data/` deliberately — the data layer owns rows,
// not product reactions.
//
// WHAT CHANGED, AND WHY IT STILL WORKS. Those effects used to read their event
// list from `eventsSlice` (SQLite). Check-ins no longer land there, so they read
// the QUERY CACHE instead, via `readCachedCheckins`. The mutation's `onMutate`
// patches that cache before `mutateAsync` resolves, so an effect running after the
// await sees exactly what the store used to hand it: the just-logged event included.
//
// TWO EFFECTS ARE DELIBERATELY NOT CARRIED OVER:
//   • `updateStreakInDB` — the streak ON SCREEN is already derived from the events
//     list (`deriveStreakForMark`, app/mark/[id]/index.tsx:251), so the optimistic
//     patch moves it with no help. `lc_streaks` is a SQLite cache read only by the
//     sync layer this phase orphans; writing it here would maintain a value nothing
//     reads. Phase 4 makes the streak derived outright.
//   • The defensive `linkMarkToGoal` block (useCounters.ts:392-406) — it read
//     `mark.goal_id`, the column this milestone retires. Links are the truth.

import { useCallback } from 'react';
import { InteractionManager } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import {
  buildCheckinRow,
  useLogCheckinMutation,
  useUndoCheckinMutation,
} from '../lib/data/mutations/checkins';
import { readCachedCheckins } from '../lib/data/checkins';
import { creditMarkToGoals } from '../lib/goals/goalLifecycle';
import { readGoalDataSnapshot } from '../lib/goals/momentumEvaluation';
import { toGoal, toMark } from '../lib/data/adapters';
import { totalsByMark } from '../lib/data/derived';
import { useAuth } from './useAuth';
import { useBadges } from './useBadges';
import { capture } from '../lib/analytics/posthog';
import { ANALYTICS_EVENTS } from '../lib/analytics/events';
import { formatDate, daysBetween } from '../lib/date';
import { getAppDate } from '../lib/appDate';
import { logger } from '../lib/utils/logger';
import { maybeShowPostLogVoice } from '../lib/moments/postLogVoice';
import { resolveFirstName } from '../lib/profile/displayName';
import { useVoiceStore } from '../state/voiceSlice';
import type { MarkEvent } from '../types';
import type { MarkEventRow } from '../lib/data/types';

/** Query row to the domain shape the effect helpers take. The screens each carry a
 * local copy of this adapter (the Phase 2 strangler seam); all of them go together
 * when Phase 5 retires the `types/` models. */
function toMarkEvent(row: MarkEventRow): MarkEvent {
  return {
    id: row.id,
    user_id: row.user_id,
    mark_id: row.mark_id,
    event_type: row.event_type as MarkEvent['event_type'],
    amount: row.amount ?? 1,
    occurred_at: row.occurred_at,
    occurred_local_date: row.occurred_local_date,
    meta: (row.meta ?? undefined) as Record<string, unknown> | undefined,
    deleted_at: row.deleted_at,
    created_at: row.created_at ?? '',
    updated_at: row.updated_at ?? '',
  };
}

/** The most recent day this mark was logged BEFORE the check-in being written.
 * Replaces `mark.last_activity_date`, a denormalised field this milestone retires
 * and which the analytics gap was reading. */
function lastActivityBefore(rows: readonly MarkEventRow[], today: string): string | null {
  let latest: string | null = null;
  for (const row of rows) {
    if (row.event_type !== 'increment' || row.deleted_at) continue;
    if (row.occurred_local_date >= today) continue;
    if (latest === null || row.occurred_local_date > latest) latest = row.occurred_local_date;
  }
  return latest;
}

export interface UseCheckinResult {
  /** Log one check-in. Signature matches the retired `incrementCounter` so the
   * widget drain (`useWidgetLogSync`) keeps its contract. Rejects with a
   * `DataError`; callers render `dataErrorCopy(...)`, never `.message`. */
  logCheckin: (markId: string, userId: string, amount?: number) => Promise<void>;
  /** Undo a specific check-in (tombstone it). */
  undoCheckin: (row: MarkEventRow) => Promise<void>;
  isLogging: boolean;
}

export function useCheckin(): UseCheckinResult {
  const client = useQueryClient();
  const { user } = useAuth();
  // Second `useBadges` instance on screens that also mount `useCounters()`. Its one
  // effect is a read, so the cost is a duplicated SQLite load on mount; it resolves
  // when Phase 5 deletes `useCounters`.
  const { evaluateMarkBadges } = useBadges(user?.id);
  const logMutation = useLogCheckinMutation();
  const undoMutation = useUndoCheckinMutation();

  const logCheckin = useCallback(
    async (markId: string, userId: string, amount: number = 1) => {
      const today = formatDate(getAppDate());
      // Read BEFORE the write: the gap is measured against the previous activity.
      const priorRows = readCachedCheckins(client, userId, markId);
      const previousActivity = lastActivityBefore(priorRows, today);

      const row = buildCheckinRow({ markId, userId, amount });
      await logMutation.mutateAsync(row);

      // Everything below is decoration on a check-in that already succeeded. None
      // of it may throw into the caller, and none of it blocks the tap.
      InteractionManager.runAfterInteractions(() => {
        const events = readCachedCheckins(client, userId, markId).map(toMarkEvent);

        // The account data the voice engine derives a line from, read from the
        // query cache (M9 Phase 5A Task 6 — the slice no longer reaches into
        // stores). `goal_id` on the adapted marks is the FIRST holder goal via
        // live links: the moment selector keys goal-scoped lines off it, and
        // one goal is what the retired column carried.
        const snapshot = readGoalDataSnapshot(client, userId);
        const totals = totalsByMark(snapshot.events);
        const holderByMark = new Map<string, string>();
        for (const [goalId, list] of Object.entries(snapshot.marksByGoal)) {
          for (const m of list) if (!holderByMark.has(m.id)) holderByMark.set(m.id, goalId);
        }
        const voiceData = {
          marks: snapshot.marks.map((row) => ({
            ...toMark(row, totals),
            goal_id: holderByMark.get(row.id) ?? null,
          })),
          events: snapshot.events.map(toMarkEvent),
          goals: snapshot.goals.map((g) =>
            toGoal(g, (snapshot.marksByGoal[g.id] ?? []).map((m) => m.id)),
          ),
        };

        let voiceLineShown = false;
        try {
          voiceLineShown = maybeShowPostLogVoice(
            markId,
            today,
            resolveFirstName(user?.user_metadata, user?.email),
            voiceData,
            useVoiceStore.getState().evaluatePostLog,
          );
        } catch (error) {
          logger.error('[checkin] post-log voice failed', error);
        }

        capture(ANALYTICS_EVENTS.MARK_LOGGED, {
          mark_id: markId,
          gap_days: previousActivity ? daysBetween(previousActivity, today) : null,
          voice_line_shown: voiceLineShown,
        });

        evaluateMarkBadges(markId, userId, events).catch((error) => {
          logger.error('[checkin] badge evaluation failed', error);
        });

        // XP deleted in M9 Phase 5A (spec §4.4).

        // Goal credit, momentum and the deadline check — the query-layer chain
        // (M9 Phase 5A Task 6, lib/goals/goalLifecycle.ts). `current_mark_count`
        // is now a SERVER write; the RING was never affected either way —
        // `calculateGoalProgress` counts events and links.
        creditMarkToGoals(client, userId, markId, events)
          .then(() =>
            import('../services/momentumWarningNotifications').then(
              ({ reconcileMomentumWarnings }) => reconcileMomentumWarnings(userId),
            ),
          )
          .catch((error: unknown) => {
            logger.error('[checkin] goal credit failed', error);
          });
      });
    },
    // `user`, not its two fields: the react-compiler lint rejects a dependency
    // list more specific than the one it infers, and it infers the whole object.
    [client, logMutation, evaluateMarkBadges, user],
  );

  const undoCheckin = useCallback(
    async (row: MarkEventRow) => {
      await undoMutation.mutateAsync({
        eventId: row.id,
        userId: row.user_id,
        markId: row.mark_id,
        localDate: row.occurred_local_date,
        row,
      });
      // Badge progress can only fall, and it must, or an undone day keeps counting.
      InteractionManager.runAfterInteractions(() => {
        const events = readCachedCheckins(client, row.user_id, row.mark_id).map(toMarkEvent);
        evaluateMarkBadges(row.mark_id, row.user_id, events).catch((error) => {
          logger.error('[checkin] badge re-evaluation after undo failed', error);
        });
      });
    },
    [client, undoMutation, evaluateMarkBadges],
  );

  return { logCheckin, undoCheckin, isLogging: logMutation.isPending };
}
