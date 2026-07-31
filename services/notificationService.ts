import * as Notifications from 'expo-notifications';
import { logger } from '../lib/utils/logger';
import { getLivraRemindersEnabled } from '../lib/notifications/livraReminderPrefs';
import { cancelAllLivraScheduledNotifications } from '../lib/notifications/livraScheduledOwnership';
import { requestLivraLocalNotificationReschedule } from './livraLocalNotificationOwner';

// M9 Phase 5A: `analyzeCountersForNotifications` (a QA/diagnostics read of the
// deleted mock DB, whose hook wrapper had zero callers) was removed with the
// old data layer. The active notification model is behavior DATE scheduling via
// `livraLocalNotificationOwner`; this module is now just its refresh entry.

/**
 * @deprecated Legacy calendar toggles — not wired to the behavior DATE scheduler.
 * Kept only so older call sites can migrate; `updateNotifications` uses `getLivraRemindersEnabled()` instead.
 */
export type NotificationConfig = {
  enableDailyReminders: boolean;
  enableStreakWarnings: boolean;
  enableInactiveReminders: boolean;
  dailyReminderHour: number;
  dailyReminderMinute: number;
  streakWarningHour: number;
  streakWarningMinute: number;
};

/**
 * Single entry for “refresh Livra local schedules from prefs + permission + DB”.
 * Ignores deprecated `NotificationConfig` — use `livraReminderPrefs` + Settings toggle instead.
 */
export const updateNotifications = async (userId?: string, _legacyConfig?: Partial<NotificationConfig>): Promise<void> => {
  void _legacyConfig;
  try {
    const enabled = await getLivraRemindersEnabled();
    if (!enabled) {
      await cancelAllLivraScheduledNotifications();
      return;
    }

    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') {
      logger.warn('[NotificationService] Notification permissions not granted');
      return;
    }

    requestLivraLocalNotificationReschedule(userId);
  } catch (error) {
    logger.error('[NotificationService] Error updating notifications:', error);
  }
};
