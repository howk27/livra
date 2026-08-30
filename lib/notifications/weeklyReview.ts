// lib/notifications/weeklyReview.ts
// The Sunday-evening Weekly Review notification (WR-4, spec 2026-08-29 §5).
// Clone of the dailyReminder.ts pattern: stable identifier, master-key gate,
// thin async wrappers around a pure decision. One notification per week,
// inside the calm rules — no counts in the copy, because the review computes
// at RENDER time and a Sunday-night log still counts when it is opened.
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLivraRemindersEnabled } from './livraReminderPrefs';

export const WEEKLY_REVIEW_NOTIF_ID = 'livra-weekly-review';
/** Per-feature pref, default ON; the master reminders key still gates it. */
export const WEEKLY_REVIEW_NOTIF_ENABLED_KEY = '@livra_weekly_review_notif_enabled';

// Sunday 19:00 local (spec §5, ASSUMED default approved 2026-08-29).
// expo-notifications WEEKLY weekday is 1-based with Sunday = 1.
export const WEEKLY_REVIEW_WEEKDAY = 1;
export const WEEKLY_REVIEW_HOUR = 19;
export const WEEKLY_REVIEW_MINUTE = 0;

export const WEEKLY_REVIEW_TITLE = 'Your week is ready.';
export const WEEKLY_REVIEW_BODY = 'A quiet look at what held. It takes a minute.';

export async function getWeeklyReviewNotifEnabled(): Promise<boolean> {
  try {
    const v = await AsyncStorage.getItem(WEEKLY_REVIEW_NOTIF_ENABLED_KEY);
    if (v === null || v === undefined) return true;
    return v === '1' || v === 'true';
  } catch {
    return true;
  }
}

export async function setWeeklyReviewNotifEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(WEEKLY_REVIEW_NOTIF_ENABLED_KEY, enabled ? '1' : '0');
}

export type WeeklyReviewScheduleInputs = {
  masterEnabled: boolean;
  prefEnabled: boolean;
  /** OS permission already granted. Denied → the Focus card is the only
   *  arrival; this module never re-prompts (spec §5). */
  permissionGranted: boolean;
  /** Zero active goals → nothing to review, no notification (spec §5). */
  hasActiveGoals: boolean;
};

/** Pure decision — the async reconcile below executes exactly this. */
export function shouldScheduleWeeklyReview(i: WeeklyReviewScheduleInputs): boolean {
  return i.masterEnabled && i.prefEnabled && i.permissionGranted && i.hasActiveGoals;
}

export async function cancelWeeklyReview(): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(WEEKLY_REVIEW_NOTIF_ID).catch(() => {});
}

async function scheduleWeeklyReview(): Promise<void> {
  await cancelWeeklyReview();
  await Notifications.scheduleNotificationAsync({
    identifier: WEEKLY_REVIEW_NOTIF_ID,
    content: {
      title: WEEKLY_REVIEW_TITLE,
      body: WEEKLY_REVIEW_BODY,
      data: { screen: 'review', livraOwner: true },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
      weekday: WEEKLY_REVIEW_WEEKDAY,
      hour: WEEKLY_REVIEW_HOUR,
      minute: WEEKLY_REVIEW_MINUTE,
    },
  });
}

/**
 * Make the OS schedule match the prefs and the account state. Called where
 * reconcileDailyReminder is called (the Settings master switch) and from the
 * foreground reschedule owner, so the default-ON schedule arms without the
 * user ever visiting Settings.
 */
export async function reconcileWeeklyReview(hasActiveGoals: boolean): Promise<void> {
  const masterEnabled = await getLivraRemindersEnabled();
  const prefEnabled = await getWeeklyReviewNotifEnabled();
  const { status } = await Notifications.getPermissionsAsync();
  const decision = shouldScheduleWeeklyReview({
    masterEnabled,
    prefEnabled,
    permissionGranted: status === 'granted',
    hasActiveGoals,
  });
  if (decision) {
    await scheduleWeeklyReview();
  } else {
    await cancelWeeklyReview();
  }
}
