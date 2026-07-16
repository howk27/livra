import { Platform } from 'react-native';
import type { PendingWidgetLog } from './widgetTypes';
import { APP_GROUP_ID, PENDING_LOGS_KEY } from './widgetTypes';

/**
 * Widget → app reconciliation queue.
 *
 * On iOS 17+ the widget logs a mark via an AppIntent WITHOUT opening the app.
 * The intent appends a {markId, at} record to the App Group so the log is not
 * lost. When the app next foregrounds we drain that queue and replay each entry
 * through the app's real increment path (streaks, badges, goal credit, sync),
 * so a widget tap ends up identical to an in-app log.
 *
 * The queue is a JSON array stored under PENDING_LOGS_KEY in the shared App
 * Group. Reads tolerate either a raw JSON string (what the native side writes)
 * or an already-parsed value (some bridge versions auto-parse).
 */

function getSharedPrefs(): {
  getItem: (key: string, group: string) => Promise<unknown>;
  setItem: (key: string, value: string, group: string) => Promise<void>;
} | null {
  try {
    // Lazy require — the native module is absent on web and in some test runs.
    return require('react-native-shared-group-preferences').default;
  } catch {
    return null;
  }
}

function coerceLogs(raw: unknown): PendingWidgetLog[] {
  let value: unknown = raw;
  if (typeof value === 'string') {
    if (value.trim() === '') return [];
    try {
      value = JSON.parse(value);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(value)) return [];
  return value.filter(
    (entry): entry is PendingWidgetLog =>
      !!entry &&
      typeof entry === 'object' &&
      typeof (entry as PendingWidgetLog).markId === 'string' &&
      (entry as PendingWidgetLog).markId.length > 0,
  );
}

export async function readPendingWidgetLogs(): Promise<PendingWidgetLog[]> {
  if (Platform.OS !== 'ios') return [];
  const prefs = getSharedPrefs();
  if (!prefs) return [];
  try {
    const raw = await prefs.getItem(PENDING_LOGS_KEY, APP_GROUP_ID);
    return coerceLogs(raw);
  } catch {
    return [];
  }
}

export async function clearPendingWidgetLogs(): Promise<void> {
  if (Platform.OS !== 'ios') return;
  const prefs = getSharedPrefs();
  if (!prefs) return;
  try {
    await prefs.setItem(PENDING_LOGS_KEY, '[]', APP_GROUP_ID);
  } catch {
    // Non-critical — a failed clear only risks a duplicate replay next drain.
  }
}

/**
 * Drain the pending-log queue, applying each entry via `apply` (the app's real
 * increment). The queue is cleared FIRST so a mid-drain crash cannot double-log;
 * losing an unsynced tap is safer than logging it twice. Returns the number of
 * logs successfully applied. Never throws — widget logging is best-effort.
 */
export async function drainPendingWidgetLogs(
  apply: (markId: string) => Promise<void>,
): Promise<number> {
  const pending = await readPendingWidgetLogs();
  if (pending.length === 0) return 0;

  // Clear before applying: at-most-once beats at-least-once for a habit counter.
  await clearPendingWidgetLogs();

  let applied = 0;
  for (const log of pending) {
    try {
      await apply(log.markId);
      applied += 1;
    } catch {
      // Skip marks that no longer exist / fail validation — never block the rest.
    }
  }
  return applied;
}
