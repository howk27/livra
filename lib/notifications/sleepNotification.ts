import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SLEEP_NOTIF_TIME_PREFIX = '@livra_sleep_notif_time:';
const SLEEP_NOTIF_ID_PREFIX = 'livra-sleep-';

export function sleepNotifTimeKey(markId: string): string {
  return `${SLEEP_NOTIF_TIME_PREFIX}${markId}`;
}

export async function getSleepNotifTime(markId: string): Promise<string | null> {
  return AsyncStorage.getItem(sleepNotifTimeKey(markId));
}

export async function setSleepNotifTime(markId: string, hhmm: string): Promise<void> {
  await AsyncStorage.setItem(sleepNotifTimeKey(markId), hhmm);
}

export async function scheduleSleepNotification(markId: string, hhmm: string): Promise<void> {
  await cancelSleepNotification(markId);

  const [hourStr = '7', minStr = '0'] = hhmm.split(':');
  const hour = parseInt(hourStr, 10);
  const minute = parseInt(minStr, 10);

  await Notifications.scheduleNotificationAsync({
    identifier: `${SLEEP_NOTIF_ID_PREFIX}${markId}`,
    content: {
      title: 'Your Sleep mark is waiting.',
      body: "How'd last night go?",
      data: { screen: 'checkin', markId },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute,
    },
  });
}

export async function cancelSleepNotification(markId: string): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(
    `${SLEEP_NOTIF_ID_PREFIX}${markId}`,
  ).catch(() => {});
}
