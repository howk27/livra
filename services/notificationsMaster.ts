// services/notificationsMaster.ts
// Single entry point for a Settings master-switch change: persist the pref, then
// reconcile every notification category so the OS schedule matches the new state.
import { setLivraRemindersEnabled } from '../lib/notifications/livraReminderPrefs';
import { reconcileMarkReminders, type ReconcileMark } from '../lib/notifications/markReminder';
import { updateNotifications } from './notificationService';
import { reconcileMomentumWarnings } from './momentumWarningNotifications';

export async function applyNotificationsMaster(
  enabled: boolean,
  userId: string | undefined,
  marks: ReconcileMark[],
): Promise<void> {
  await setLivraRemindersEnabled(enabled);
  // updateNotifications cancels all Livra schedules when off, reschedules the daily when on.
  await updateNotifications(userId);
  await reconcileMomentumWarnings(userId);
  await reconcileMarkReminders(marks);
}
