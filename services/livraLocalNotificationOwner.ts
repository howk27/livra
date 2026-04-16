/**
 * Single owner for Livra local notification reschedule requests.
 *
 * Coalescing: rapid calls (foreground + home + increment) merge into one flush after COALESCE_MS idle,
 * using the latest userId — legitimate state changes are not dropped (unlike a fixed "ignore N ms" debounce).
 *
 * Diagnostics: logger only on coalesce flush batch (count), not per-request.
 */
import * as Notifications from 'expo-notifications';
import { logger } from '../lib/utils/logger';
import { cancelAllLivraScheduledNotifications } from '../lib/notifications/livraScheduledOwnership';
import { getLivraRemindersEnabled } from '../lib/notifications/livraReminderPrefs';
import {
  getLastBehaviorForegroundMs,
  recordBehaviorAppForeground,
  scheduleBehaviorNotifications,
} from './behaviorNotifications';

const COALESCE_MS = 400;

let coalesceTimer: ReturnType<typeof setTimeout> | null = null;
/** Latest userId to pass to scheduler when flush runs; `undefined` means "skip schedule" (used only if needed). */
let pendingUserId: string | undefined;
let pendingArmed = false;

function clearCoalesceTimer(): void {
  if (coalesceTimer) {
    clearTimeout(coalesceTimer);
    coalesceTimer = null;
  }
}

async function flushCoalescedReschedule(): Promise<void> {
  coalesceTimer = null;
  if (!pendingArmed) return;
  pendingArmed = false;
  const userId = pendingUserId;
  pendingUserId = undefined;

  const enabled = await getLivraRemindersEnabled();
  if (!enabled) {
    await cancelAllLivraScheduledNotifications();
    return;
  }

  const { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') {
    return;
  }

  if (!userId) {
    return;
  }

  const previousFg = await getLastBehaviorForegroundMs();
  try {
    await scheduleBehaviorNotifications(userId, previousFg);
  } catch (e) {
    logger.error('[LivraNotifOwner] schedule failed', e);
  } finally {
    await recordBehaviorAppForeground();
  }
}

/**
 * Request a reschedule from current SQLite + prefs. Coalesced: multiple calls within COALESCE_MS
 * result in one `scheduleBehaviorNotifications` with the latest `userId`.
 */
export function requestLivraLocalNotificationReschedule(userId: string | undefined): void {
  pendingUserId = userId;
  pendingArmed = true;
  clearCoalesceTimer();
  coalesceTimer = setTimeout(() => {
    void flushCoalescedReschedule();
  }, COALESCE_MS);
}

/** Immediate cancel of all Livra-owned schedules (no coalesce). Use when user turns reminders off. */
export async function disableLivraLocalNotificationsNow(): Promise<void> {
  clearCoalesceTimer();
  pendingArmed = false;
  await cancelAllLivraScheduledNotifications();
}

/**
 * Apply prefs after toggle: if off, cancel immediately; if on, coalesced reschedule.
 */
export async function applyLivraRemindersPreference(userId: string | undefined, enabled: boolean): Promise<void> {
  if (!enabled) {
    await disableLivraLocalNotificationsNow();
    return;
  }
  requestLivraLocalNotificationReschedule(userId);
}
