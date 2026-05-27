// lib/notifications/sleepNotification.ts
// Thin wrapper — delegates to the generic markReminder module.
// Existing callers (counter/[id].tsx HealthKit section) remain unchanged.
import {
  getMarkReminderTime,
  setMarkReminderTime,
  scheduleMarkReminder,
  cancelMarkReminder,
} from './markReminder';

export function sleepNotifTimeKey(markId: string): string {
  return `@livra_sleep_notif_time:${markId}`;
}

export async function getSleepNotifTime(markId: string): Promise<string | null> {
  return getMarkReminderTime(markId);
}

export async function setSleepNotifTime(markId: string, hhmm: string): Promise<void> {
  await setMarkReminderTime(markId, hhmm);
}

export async function scheduleSleepNotification(markId: string, hhmm: string): Promise<void> {
  await scheduleMarkReminder(markId, 'Sleep', hhmm);
}

export async function cancelSleepNotification(markId: string): Promise<void> {
  await cancelMarkReminder(markId);
}
