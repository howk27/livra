// lib/notifications/dailyReminder.ts
// One app-wide daily reminder, controlled from Settings > Notifications.
// Replaces the retired per-mark custom reminders (sleep wake-up notifications
// still ride the markReminder machinery separately).
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLivraRemindersEnabled } from './livraReminderPrefs';

export const DAILY_REMINDER_NOTIF_ID = 'livra-daily-reminder';
export const DAILY_REMINDER_TIME_KEY = '@livra_daily_reminder_time';

export async function getDailyReminderTime(): Promise<string | null> {
  return AsyncStorage.getItem(DAILY_REMINDER_TIME_KEY);
}

export async function setDailyReminderTime(hhmm: string): Promise<void> {
  await AsyncStorage.setItem(DAILY_REMINDER_TIME_KEY, hhmm);
}

export async function clearDailyReminderTime(): Promise<void> {
  await AsyncStorage.removeItem(DAILY_REMINDER_TIME_KEY);
}

export async function scheduleDailyReminder(hhmm: string): Promise<void> {
  if (!(await getLivraRemindersEnabled())) return;
  await cancelDailyReminder();

  const [hourStr = '8', minStr = '0'] = hhmm.split(':');
  const hour = parseInt(hourStr, 10);
  const minute = parseInt(minStr, 10);

  await Notifications.scheduleNotificationAsync({
    identifier: DAILY_REMINDER_NOTIF_ID,
    content: {
      title: 'Livra',
      body: 'A small step today counts. Take a minute to check in.',
      data: { screen: 'focus' },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute,
    },
  });
}

export async function cancelDailyReminder(): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(DAILY_REMINDER_NOTIF_ID).catch(() => {});
}

/** Make the OS schedule match the stored pref and the master toggle. */
export async function reconcileDailyReminder(): Promise<void> {
  const enabled = await getLivraRemindersEnabled();
  const hhmm = await getDailyReminderTime();
  if (enabled && hhmm) {
    await scheduleDailyReminder(hhmm);
  } else {
    await cancelDailyReminder();
  }
}
