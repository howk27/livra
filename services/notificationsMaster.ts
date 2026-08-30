// services/notificationsMaster.ts
// Single entry point for a Settings master-switch change: persist the pref, then
// reconcile every notification category so the OS schedule matches the new state.
import { setLivraRemindersEnabled } from '../lib/notifications/livraReminderPrefs';
import { reconcileMarkReminders, type ReconcileMark } from '../lib/notifications/markReminder';
import { reconcileDailyReminder } from '../lib/notifications/dailyReminder';
import { reconcileWeeklyReview } from '../lib/notifications/weeklyReview';
import { updateNotifications } from './notificationService';
import { reconcileMomentumWarnings } from './momentumWarningNotifications';
// WR-4: zero active goals → no weekly review notification; the count comes from
// the query cache, the same read useNotificationsMaster does for marks.
import { queryClient } from '../lib/data/queryClient';
import { queryKeys } from '../lib/data/queryKeys';
import type { GoalRow } from '../lib/data/types';

export async function applyNotificationsMaster(
  enabled: boolean,
  userId: string | undefined,
  marks: ReconcileMark[],
): Promise<void> {
  await setLivraRemindersEnabled(enabled);
  // updateNotifications cancels all Livra schedules when off; when on, it pumps the owner (re-engage nudge).
  await updateNotifications(userId);
  await reconcileMomentumWarnings(userId);
  await reconcileMarkReminders(marks);
  await reconcileDailyReminder();
  const goals = userId
    ? (queryClient.getQueryData<GoalRow[]>(queryKeys.goals(userId)) ?? [])
    : [];
  await reconcileWeeklyReview(goals.some((g) => g.status === 'active' && !g.deleted_at));
}
