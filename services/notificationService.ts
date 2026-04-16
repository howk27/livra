import * as Notifications from 'expo-notifications';
import { query } from '../lib/db';
import { formatDate, daysBetween } from '../lib/date';
import { getAppDate } from '../lib/appDate';
import { Counter, CounterEvent } from '../types';
import { computeStreak } from '../hooks/useStreaks';
import { logger } from '../lib/utils/logger';
import { getLivraRemindersEnabled } from '../lib/notifications/livraReminderPrefs';
import { cancelAllLivraScheduledNotifications } from '../lib/notifications/livraScheduledOwnership';
import { requestLivraLocalNotificationReschedule } from './livraLocalNotificationOwner';

export interface NotificationAnalysis {
  countersNeedingLog: Counter[];
  countersWithStreakWarning: Array<{ counter: Counter; currentStreak: number; daysUntilBreak: number }>;
  inactiveCounters: Array<{ counter: Counter; daysSinceLastActivity: number }>;
}

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
 * Analyze counters for QA / diagnostics. Not used to schedule notifications (active model is behavior DATE only).
 */
export const analyzeCountersForNotifications = async (
  userId?: string,
): Promise<NotificationAnalysis> => {
  const appAnchor = getAppDate();
  const today = formatDate(appAnchor);

  if (!userId) {
    logger.warn('[NotificationService] Cannot analyze notifications - user not authenticated');
    return {
      countersNeedingLog: [],
      countersWithStreakWarning: [],
      inactiveCounters: [],
    };
  }

  const counters = await query<Counter>(
    'SELECT * FROM lc_counters WHERE deleted_at IS NULL AND user_id = ? ORDER BY sort_index',
    [userId],
  );

  const counterIds = counters.map((c) => c.id);
  const placeholders = counterIds.map(() => '?').join(',');
  const eventsQuery =
    counterIds.length > 0
      ? `SELECT id, user_id, counter_id as mark_id, event_type, amount, occurred_at, occurred_local_date, meta, deleted_at, created_at, updated_at FROM lc_events WHERE deleted_at IS NULL AND counter_id IN (${placeholders}) ORDER BY occurred_local_date DESC`
      : 'SELECT id, user_id, counter_id as mark_id, event_type, amount, occurred_at, occurred_local_date, meta, deleted_at, created_at, updated_at FROM lc_events WHERE deleted_at IS NULL ORDER BY occurred_local_date DESC';
  const allEvents =
    counterIds.length > 0 ? await query<CounterEvent>(eventsQuery, counterIds) : [];

  const countersNeedingLog: Counter[] = [];
  const countersWithStreakWarning: Array<{
    counter: Counter;
    currentStreak: number;
    daysUntilBreak: number;
  }> = [];
  const inactiveCounters: Array<{
    counter: Counter;
    daysSinceLastActivity: number;
  }> = [];

  for (const counter of counters) {
    const counterEvents = allEvents.filter((e) => e.mark_id === counter.id);

    const hasActivityToday = counterEvents.some(
      (e) =>
        e.occurred_local_date === today &&
        e.event_type === 'increment' &&
        !e.deleted_at,
    );

    const lastActivityDate = counter.last_activity_date;
    let daysSinceLastActivity = 0;
    if (lastActivityDate) {
      daysSinceLastActivity = Math.abs(daysBetween(appAnchor, new Date(lastActivityDate)));
    } else if (counterEvents.length === 0) {
      const createdDate = new Date(counter.created_at);
      daysSinceLastActivity = Math.abs(daysBetween(appAnchor, createdDate));
    }

    if (!hasActivityToday && lastActivityDate) {
      countersNeedingLog.push(counter);
    }

    if (counter.enable_streak) {
      const inc = counterEvents.filter((e) => e.event_type === 'increment' && !e.deleted_at);
      const streakData = computeStreak(inc, appAnchor);
      if (streakData.current > 0 && streakData.lastDate) {
        const daysSinceLastStreakActivity = Math.abs(
          daysBetween(appAnchor, new Date(streakData.lastDate)),
        );
        if (daysSinceLastStreakActivity === 1 && !hasActivityToday) {
          countersWithStreakWarning.push({
            counter,
            currentStreak: streakData.current,
            daysUntilBreak: 0,
          });
        }
      }
    }

    if (daysSinceLastActivity >= 7 && counterEvents.length > 0) {
      inactiveCounters.push({
        counter,
        daysSinceLastActivity,
      });
    }
  }

  return {
    countersNeedingLog,
    countersWithStreakWarning,
    inactiveCounters,
  };
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
