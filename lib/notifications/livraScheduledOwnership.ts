/**
 * Livra-owned local scheduled notifications (expo-notifications).
 *
 * Active model: DATE triggers scheduled from `behaviorNotifications.ts` with `data.livraOwner === true`
 * and identifiers prefixed `livra-bn-`.
 *
 * Legacy (removed from code paths but may still exist on user devices): `daily_reminder`, `streak_warning`,
 * `inactive_reminder`, `behavior_*`, and evening `scheduleReminder` rows (title "Livra" + counterId in data).
 *
 * All times are device-local; `occurred_local_date` / planning use the same assumption (see `getAppDate()`).
 */
import * as Notifications from 'expo-notifications';
import { logger } from '../utils/logger';

export const LIVRA_BEHAVIOR_ID_PREFIX = 'livra-bn-';

const LEGACY_CALENDAR_TYPES = new Set(['daily_reminder', 'streak_warning', 'inactive_reminder']);

function dataRecord(
  request: Notifications.NotificationRequest,
): Record<string, unknown> | undefined {
  const d = request.content.data;
  return d && typeof d === 'object' ? (d as Record<string, unknown>) : undefined;
}

/** Whether this scheduled notification was created by Livra (safe to cancel on disable / reschedule). */
export function isLivraOwnedScheduledRequest(request: Notifications.NotificationRequest): boolean {
  const data = dataRecord(request);
  if (!data) return false;
  if (data.livraOwner === true) return true;
  if (data.behavior === true) return true;
  const t = data.type;
  if (typeof t === 'string') {
    if (t.startsWith('behavior_')) return true;
    if (LEGACY_CALENDAR_TYPES.has(t)) return true;
  }
  const title = request.content.title;
  if (title === 'Livra' && typeof data.counterId === 'string') return true;
  return false;
}

export function isLivraOwnedScheduledIdentifier(identifier: string): boolean {
  return identifier.startsWith('livra');
}

/**
 * Cancels every scheduled notification Livra owns. Does not call cancelAllScheduledNotificationsAsync
 * (non-Livra schedules from other code would be unaffected — we only cancel known Livra patterns).
 */
export async function cancelAllLivraScheduledNotifications(): Promise<number> {
  let cancelled = 0;
  try {
    const pending = await Notifications.getAllScheduledNotificationsAsync();
    for (const p of pending) {
      const id = p.identifier;
      if (isLivraOwnedScheduledIdentifier(id) || isLivraOwnedScheduledRequest(p.request)) {
        await Notifications.cancelScheduledNotificationAsync(id);
        cancelled += 1;
      }
    }
  } catch (e) {
    logger.warn('[LivraNotif] cancel owned failed', e);
  }
  return cancelled;
}
