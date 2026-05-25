import { useEffect, useRef } from 'react';
import { differenceInDays, parseISO, format } from 'date-fns';
import { useGoalsStore } from '../state/goalsSlice';
import { useMarksStore } from '../state/countersSlice';
import { useEventsStore } from '../state/eventsSlice';
import {
  computePace,
  computeProjectedMiss,
  suggestNewTargetDate,
  isPaceBehind,
} from '../lib/paceEngine';
import {
  getPaceNotifWindow,
  getPaceNotifState,
  setPaceNotifState,
  cancelPaceNotifications,
  schedulePaceNotification,
  daysSince,
} from '../lib/notifications/paceNotification';

export type PaceAlertResult = {
  isBehind: boolean;
  projectedMiss: number;
  suggestedDate: string | null;
  goalTitle: string;
  goalId: string;
};

export function usePaceAlert(): PaceAlertResult {
  const goals = useGoalsStore(s => s.goals);
  const counters = useMarksStore(s => s.marks);
  const events = useEventsStore(s => s.events);

  const activeGoal = goals.find(g => g.status === 'active');
  const markCount = counters.length;

  const daysElapsed = activeGoal
    ? Math.max(0, differenceInDays(new Date(), parseISO(activeGoal.created_at)))
    : 0;

  // No pace computation or alert if goal is < 7 days old or has no target date
  const hasSufficientHistory = daysElapsed >= 7;
  const hasTargetDate = Boolean(activeGoal?.target_date);

  const pace =
    activeGoal && hasSufficientHistory
      ? computePace(events, markCount, daysElapsed)
      : 1; // neutral — behind guard prevents alert from firing

  const projectedMiss =
    activeGoal?.target_date && hasSufficientHistory
      ? computeProjectedMiss(activeGoal.target_date, pace)
      : 0;

  const behind =
    hasSufficientHistory && hasTargetDate ? isPaceBehind(projectedMiss) : false;

  const suggestedDate =
    behind && activeGoal?.target_date
      ? suggestNewTargetDate(activeGoal.target_date, pace)
      : null;

  const prevBehindRef = useRef<boolean | null>(null);

  useEffect(() => {
    if (!activeGoal) return;
    const goalId = activeGoal.id;
    const goalTitle = activeGoal.title;
    const today = format(new Date(), 'yyyy-MM-dd');
    let cancelled = false;

    async function syncNotifications() {
      if (!behind) {
        // Pace recovered — cancel all notifications and reset state
        if (prevBehindRef.current === true) {
          await cancelPaceNotifications(goalId);
        }
        if (!cancelled) prevBehindRef.current = false;
        return;
      }

      // behind === true: schedule up to 2 notifications per slump
      const win = await getPaceNotifWindow();
      if (cancelled) return;
      const state = await getPaceNotifState(goalId);
      if (cancelled) return;

      if (!state.firedAt) {
        // First notification — fires immediately (scheduled as DAILY at a random time)
        await schedulePaceNotification(
          goalId,
          goalTitle,
          projectedMiss,
          win,
          `livra-pace-${goalId}-1`,
        );
        if (!cancelled) {
          await setPaceNotifState(goalId, { firedAt: today, followUpFiredAt: null });
          prevBehindRef.current = true;
        }
      } else if (!state.followUpFiredAt && daysSince(state.firedAt) >= 7) {
        // Follow-up after 7 days of no recovery
        await schedulePaceNotification(
          goalId,
          goalTitle,
          projectedMiss,
          win,
          `livra-pace-${goalId}-2`,
        );
        if (!cancelled) {
          await setPaceNotifState(goalId, { ...state, followUpFiredAt: today });
          prevBehindRef.current = true;
        }
      } else if (!cancelled) {
        prevBehindRef.current = true;
      }
    }

    syncNotifications().catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [behind, activeGoal?.id, activeGoal?.title, projectedMiss]);

  return {
    isBehind: behind,
    projectedMiss,
    suggestedDate,
    goalTitle: activeGoal?.title ?? '',
    goalId: activeGoal?.id ?? '',
  };
}
