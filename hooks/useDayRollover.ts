import { useEffect } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { useAppDateStore } from '../state/appDateSlice';
// M9 Phase 5A Task 6: expiry + momentum read the query cache through the
// singleton client (the same instance the provider mounts).
import { queryClient } from '../lib/data/queryClient';
import { expireDeadlinedGoals } from '../lib/goals/goalLifecycle';
import {
  evaluateGoalsMomentum,
  readGoalDataSnapshot,
} from '../lib/goals/momentumEvaluation';
import { syncWidgetData } from '../lib/widgets/widgetSync';
import { useAuth } from './useAuth';
import { logger } from '../lib/utils/logger';

/**
 * How often the clock is re-read. A TICK, deliberately, rather than a timeout
 * armed for the exact moment of midnight:
 *
 *  - a long timeout is the thing most likely to be throttled or dropped while
 *    the app is backgrounded, which is exactly when midnight passes;
 *  - a tick is correct through DST, a flight across timezones, and the user
 *    changing the device clock, none of which a precomputed midnight survives;
 *  - being up to a minute late to a day boundary costs nothing.
 */
export const DAY_ROLLOVER_TICK_MS = 60_000;

/**
 * Makes the app notice that the day ended while it was open.
 *
 * Everything day-shaped was recomputed only when the app came back from the
 * background — so a phone left on the Focus tab across midnight kept yesterday's
 * counts, kept offering a mark that was already logged "today", and kept a
 * momentum banner for a day that had finished. There was no bug in any of those
 * screens: they all key off the app-date store, which simply never advanced.
 *
 * Two triggers, because neither alone is enough: the tick catches the rollover
 * while the app is in the foreground, and the AppState check catches it on
 * return, when timers have been suspended and the tick never fired.
 */
export function useDayRollover(): void {
  const { user } = useAuth();
  const userId = user?.id;

  useEffect(() => {
    const onMaybeRollover = () => {
      if (!useAppDateStore.getState().refreshDayKey()) return;

      logger.log('[DayRollover] local day changed — re-evaluating the day-shaped state');
      // The same day-sensitive work the foreground path runs. Without it the
      // screens would flip to the new day while goal expiry and momentum stayed
      // on the old one. Signed out there is no account data to re-evaluate —
      // the widget sync alone still runs (it clears to the signed-out state).
      if (userId) {
        void expireDeadlinedGoals(queryClient, userId).catch((error) =>
          logger.error('[DayRollover] goal expiry check failed:', error),
        );
        const snapshot = readGoalDataSnapshot(queryClient, userId);
        void evaluateGoalsMomentum(snapshot.goals, snapshot.marksByGoal, snapshot.events).catch(
          (error) => logger.error('[DayRollover] momentum re-evaluation failed:', error),
        );
      }
      // The widget shows today's ring and today's marks; it is as stale as the app was.
      void syncWidgetData().catch(() => {});
    };

    const interval = setInterval(onMaybeRollover, DAY_ROLLOVER_TICK_MS);
    const subscription = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active') onMaybeRollover();
    });

    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, [userId]);
}
