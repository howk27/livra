// lib/notifications/markReminder.ts
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const REMINDER_NOTIF_ID_PREFIX = 'livra-reminder-';
const REMINDER_TIME_PREFIX = '@livra_reminder_time:';

export function markReminderTimeKey(markId: string): string {
  return `${REMINDER_TIME_PREFIX}${markId}`;
}

export async function getMarkReminderTime(markId: string): Promise<string | null> {
  return AsyncStorage.getItem(markReminderTimeKey(markId));
}

export async function setMarkReminderTime(markId: string, hhmm: string): Promise<void> {
  await AsyncStorage.setItem(markReminderTimeKey(markId), hhmm);
}

export async function clearMarkReminderTime(markId: string): Promise<void> {
  await AsyncStorage.removeItem(markReminderTimeKey(markId));
}

export async function scheduleMarkReminder(markId: string, markName: string, hhmm: string): Promise<void> {
  await cancelMarkReminder(markId);

  const [hourStr = '8', minStr = '0'] = hhmm.split(':');
  const hour = parseInt(hourStr, 10);
  const minute = parseInt(minStr, 10);

  await Notifications.scheduleNotificationAsync({
    identifier: `${REMINDER_NOTIF_ID_PREFIX}${markId}`,
    content: {
      title: markName,
      body: `Time to check in on ${markName}.`,
      data: { screen: 'checkin', markId },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute,
    },
  });
}

export async function cancelMarkReminder(markId: string): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(
    `${REMINDER_NOTIF_ID_PREFIX}${markId}`
  ).catch(() => {});
}
