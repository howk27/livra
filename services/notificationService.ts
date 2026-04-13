import * as Notifications from 'expo-notifications';
import { query } from '../lib/db';
import { formatDate, daysBetween } from '../lib/date';
import { getAppDate } from '../lib/appDate';
import { Counter, CounterEvent } from '../types';
import { computeStreak } from '../hooks/useStreaks';
import { logger } from '../lib/utils/logger';
import {
  runBehaviorNotificationScheduler,
  cancelBehaviorNotifications,
} from './behaviorNotifications';

export interface NotificationAnalysis {
  countersNeedingLog: Counter[];
  /** currentStreak is derived from increment events (same definition as the app UI). */
  countersWithStreakWarning: Array<{ counter: Counter; currentStreak: number; daysUntilBreak: number }>;
  inactiveCounters: Array<{ counter: Counter; daysSinceLastActivity: number }>;
}

export interface NotificationConfig {
  enableDailyReminders: boolean;
  enableStreakWarnings: boolean;
  enableInactiveReminders: boolean;
  dailyReminderHour: number; // 0-23
  dailyReminderMinute: number; // 0-59
  streakWarningHour: number; // 0-23
  streakWarningMinute: number; // 0-59
}

const DEFAULT_CONFIG: NotificationConfig = {
  enableDailyReminders: true,
  enableStreakWarnings: true,
  enableInactiveReminders: true,
  dailyReminderHour: 18, // 6 PM
  dailyReminderMinute: 0,
  streakWarningHour: 20, // 8 PM
  streakWarningMinute: 0,
};

/**
 * Helper function to get funny notification phrases
 */
const getFunnyPhrases = () => {
  const dailyReminderTitles = [
    "Your progress is calling",
    "Don't let today slip away",
    "Time to make it count",
    "Your marks are waiting",
    "Progress check, anyone?",
    "The clock is ticking",
    "Make today matter",
    "Don't forget your wins"
  ];

  const dailyReminderBodies = [
    "Quick, log your activities before they become yesterday's news",
    "Your future self will thank you for logging this",
    "Even superheroes need to track their progress",
    "Don't let your momentum fade away",
    "This notification won't log itself",
    "Your marks are getting lonely",
    "Time to update your life stats",
    "Missed logging is just delayed progress"
  ];

  const streakWarningTitles = [
    "Your streak needs you",
    "Don't let it die now",
    "One tap saves everything",
    "Streak emergency",
    "The streak demands attention",
    "Rescue mission needed",
    "Your streak is sweating",
    "Don't break the chain"
  ];

  const streakWarningBodies = [
    "Your {counterName} streak is at {streak} days. One quick tap and you're golden",
    "{streak} days strong and you're about to let it slip? Not today",
    "Your {counterName} streak is begging for attention. Don't let it down",
    "One tap, that's all it takes to save your {streak}-day streak",
    "Your streak is crying out for help. Will you answer?",
    "{streak} days of work shouldn't disappear because you forgot to tap",
    "Your {counterName} streak needs you right now. No pressure",
    "Don't be that person who breaks a {streak}-day streak"
  ];

  const inactiveReminderTitles = [
    "Remember me?",
    "We need to talk",
    "Long time no see",
    "Where did you go?",
    "I'm still here",
    "Come back to me",
    "Missing in action",
    "Are you okay?"
  ];

  const inactiveReminderBodies = [
    "{counterName} hasn't seen you in {days} days. Time for a reunion?",
    "Your {counterName} has been waiting {days} days. That's patience",
    "{days} days? Really? Your {counterName} deserves better",
    "It's been {days} days since you checked in with {counterName}. What happened?",
    "Your {counterName} is starting to think you forgot about it",
    "{days} days without logging {counterName}. Time to break the silence",
    "Your {counterName} hasn't moved in {days} days. Is everything okay?",
    "{counterName} has been collecting digital dust for {days} days. Fix it"
  ];

  const getRandomItem = <T>(array: T[]): T => {
    return array[Math.floor(Math.random() * array.length)];
  };

  return {
    getDailyReminderTitle: () => getRandomItem(dailyReminderTitles),
    getDailyReminderBody: (counterNames: string, remainingCount: number) => {
      const base = getRandomItem(dailyReminderBodies);
      if (remainingCount > 0) {
        return `${base} - Update ${counterNames} and ${remainingCount} more`;
      }
      return `${base} - Update ${counterNames}`;
    },
    getStreakWarningTitle: () => getRandomItem(streakWarningTitles),
    getStreakWarningBody: (counterName: string, streak: number) => {
      const template = getRandomItem(streakWarningBodies);
      return template
        .replace('{counterName}', counterName)
        .replace('{streak}', streak.toString());
    },
    getInactiveReminderTitle: () => getRandomItem(inactiveReminderTitles),
    getInactiveReminderBody: (counterName: string, days: number) => {
      const template = getRandomItem(inactiveReminderBodies);
      return template
        .replace('{counterName}', counterName)
        .replace('{days}', days.toString());
    }
  };
};

/**
 * Analyzes the database to determine which counters need notifications
 */
export const analyzeCountersForNotifications = async (
  userId?: string
): Promise<NotificationAnalysis> => {
  const appAnchor = getAppDate();
  const today = formatDate(appAnchor);

  // Get all active counters for the authenticated user
  // Require valid userId (must be authenticated)
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
    [userId]
  );

  // Get all events for these counters
  const counterIds = counters.map((c) => c.id);
  const placeholders = counterIds.map(() => '?').join(',');
  const eventsQuery =
    counterIds.length > 0
      ? `SELECT id, user_id, counter_id as mark_id, event_type, amount, occurred_at, occurred_local_date, meta, deleted_at, created_at, updated_at FROM lc_events WHERE deleted_at IS NULL AND counter_id IN (${placeholders}) ORDER BY occurred_local_date DESC`
      : 'SELECT id, user_id, counter_id as mark_id, event_type, amount, occurred_at, occurred_local_date, meta, deleted_at, created_at, updated_at FROM lc_events WHERE deleted_at IS NULL ORDER BY occurred_local_date DESC';
  const allEvents = counterIds.length > 0
    ? await query<CounterEvent>(eventsQuery, counterIds)
    : [];

  // Find counters needing log today
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
    
    // Check if counter has activity today
    const hasActivityToday = counterEvents.some(
      (e) =>
        e.occurred_local_date === today &&
        e.event_type === 'increment' &&
        !e.deleted_at
    );

    // Check last activity date
    const lastActivityDate = counter.last_activity_date;
    let daysSinceLastActivity = 0;
    if (lastActivityDate) {
      daysSinceLastActivity = Math.abs(daysBetween(appAnchor, new Date(lastActivityDate)));
    } else if (counterEvents.length === 0) {
      // Counter has never been used
      const createdDate = new Date(counter.created_at);
      daysSinceLastActivity = Math.abs(daysBetween(appAnchor, createdDate));
    }

    // Check if counter needs logging today
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

    // Check for inactive counters (no activity in 7+ days)
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
 * Schedules smart notifications based on analysis
 */
export const scheduleSmartNotifications = async (
  analysis: NotificationAnalysis,
  config: NotificationConfig = DEFAULT_CONFIG
): Promise<string[]> => {
  const notificationIds: string[] = [];

  // Cancel existing notifications first
  await Notifications.cancelAllScheduledNotificationsAsync();

  // Schedule daily reminders for counters needing log
  if (config.enableDailyReminders && analysis.countersNeedingLog.length > 0) {
    const counterNames = analysis.countersNeedingLog
      .slice(0, 3)
      .map((c) => c.name)
      .join(', ');
    const remainingCount = Math.max(0, analysis.countersNeedingLog.length - 3);
    
    const phrases = getFunnyPhrases();
    const title = phrases.getDailyReminderTitle();
    const body = phrases.getDailyReminderBody(counterNames, remainingCount);

    const dailyId = await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data: { type: 'daily_reminder' },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.CALENDAR,
        hour: config.dailyReminderHour,
        minute: config.dailyReminderMinute,
        repeats: true,
      },
    });
    if (dailyId) notificationIds.push(dailyId);
  }

  // Schedule streak warnings
  if (
    config.enableStreakWarnings &&
    analysis.countersWithStreakWarning.length > 0
  ) {
    const phrases = getFunnyPhrases();
    for (const { counter, currentStreak } of analysis.countersWithStreakWarning.slice(
      0,
      3
    )) {
      const title = phrases.getStreakWarningTitle();
      const body = phrases.getStreakWarningBody(counter.name, currentStreak);

      const streakId = await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          data: {
            type: 'streak_warning',
            counterId: counter.id,
            streak: currentStreak,
          },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.CALENDAR,
          hour: config.streakWarningHour,
          minute: config.streakWarningMinute,
          repeats: true,
        },
      });
      if (streakId) notificationIds.push(streakId);
    }
  }

  // Schedule inactive counter reminders (once per week)
  if (
    config.enableInactiveReminders &&
    analysis.inactiveCounters.length > 0
  ) {
    const inactiveCounter = analysis.inactiveCounters[0]; // Most inactive
    const phrases = getFunnyPhrases();
    const title = phrases.getInactiveReminderTitle();
    const body = phrases.getInactiveReminderBody(
      inactiveCounter.counter.name,
      inactiveCounter.daysSinceLastActivity
    );
    
    const inactiveId = await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data: {
          type: 'inactive_reminder',
          counterId: inactiveCounter.counter.id,
        },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.CALENDAR,
        hour: config.dailyReminderHour,
        minute: config.dailyReminderMinute,
        weekday: 1, // Monday
        repeats: true,
      },
    });
    if (inactiveId) notificationIds.push(inactiveId);
  }

  return notificationIds;
};

/**
 * Updates and reschedules notifications based on current database state
 */
export const updateNotifications = async (
  userId?: string,
  config?: Partial<NotificationConfig>
): Promise<void> => {
  try {
    const finalConfig = { ...DEFAULT_CONFIG, ...config };
    const anyEnabled =
      finalConfig.enableDailyReminders ||
      finalConfig.enableStreakWarnings ||
      finalConfig.enableInactiveReminders;

    if (!anyEnabled) {
      await cancelBehaviorNotifications();
      return;
    }

    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') {
      logger.warn('[NotificationService] Notification permissions not granted');
      return;
    }

    await runBehaviorNotificationScheduler(userId);
  } catch (error) {
    logger.error('[NotificationService] Error updating notifications:', error);
  }
};

