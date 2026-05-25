import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { differenceInDays, parseISO } from 'date-fns';

export type PaceWindow = 'morning' | 'midday' | 'evening';

export type PaceNotifState = {
  firedAt: string | null;
  followUpFiredAt: string | null;
};

const PACE_WINDOW_KEY = '@livra_pace_notification_window';
const PACE_NOTIF_STATE_PREFIX = '@livra_pace_notif_state:';

const WINDOW_RANGES: Record<PaceWindow, { startHour: number; endHour: number }> = {
  morning: { startHour: 7, endHour: 9 },
  midday: { startHour: 11, endHour: 13 },
  evening: { startHour: 18, endHour: 20 },
};

function randomTimeInWindow(win: PaceWindow): { hour: number; minute: number } {
  const { startHour, endHour } = WINDOW_RANGES[win];
  const totalMinutes = (endHour - startHour) * 60;
  const rand = Math.floor(Math.random() * totalMinutes);
  return { hour: startHour + Math.floor(rand / 60), minute: rand % 60 };
}

export async function getPaceNotifWindow(): Promise<PaceWindow> {
  const stored = await AsyncStorage.getItem(PACE_WINDOW_KEY);
  if (stored === 'morning' || stored === 'midday' || stored === 'evening') return stored;
  return 'morning';
}

export async function setPaceNotifWindow(win: PaceWindow): Promise<void> {
  await AsyncStorage.setItem(PACE_WINDOW_KEY, win);
}

export async function getPaceNotifState(goalId: string): Promise<PaceNotifState> {
  const raw = await AsyncStorage.getItem(`${PACE_NOTIF_STATE_PREFIX}${goalId}`);
  if (!raw) return { firedAt: null, followUpFiredAt: null };
  try {
    return JSON.parse(raw) as PaceNotifState;
  } catch {
    return { firedAt: null, followUpFiredAt: null };
  }
}

export async function setPaceNotifState(
  goalId: string,
  state: PaceNotifState,
): Promise<void> {
  await AsyncStorage.setItem(
    `${PACE_NOTIF_STATE_PREFIX}${goalId}`,
    JSON.stringify(state),
  );
}

export async function clearPaceNotifState(goalId: string): Promise<void> {
  await AsyncStorage.removeItem(`${PACE_NOTIF_STATE_PREFIX}${goalId}`);
}

export async function schedulePaceNotification(
  goalId: string,
  goalTitle: string,
  projectedMiss: number,
  win: PaceWindow,
  identifier: string,
): Promise<void> {
  const { hour, minute } = randomTimeInWindow(win);
  await Notifications.scheduleNotificationAsync({
    identifier,
    content: {
      title: 'Still fixable.',
      body: `At your current pace, ${goalTitle} finishes about ${projectedMiss} days late.`,
      data: { screen: 'home' },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute,
    },
  });
}

export async function cancelPaceNotifications(goalId: string): Promise<void> {
  await Promise.all([
    Notifications.cancelScheduledNotificationAsync(`livra-pace-${goalId}-1`).catch(() => {}),
    Notifications.cancelScheduledNotificationAsync(`livra-pace-${goalId}-2`).catch(() => {}),
  ]);
  await clearPaceNotifState(goalId);
}

export function daysSince(isoDate: string): number {
  return differenceInDays(new Date(), parseISO(isoDate));
}
