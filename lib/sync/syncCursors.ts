import AsyncStorage from '@react-native-async-storage/async-storage';
import { clearSyncDiagSnapshot } from './syncDiagSnapshot';

/** Legacy single cursor — no longer read for push/pull after migration. */
export const LEGACY_LAST_SYNCED_AT_KEY = 'last_synced_at';

/** Rows locally changed since this instant are candidates for push. Pull must never advance this. */
export const LAST_PUSHED_AT_KEY = 'last_pushed_at';

/** Remote changes since this instant are fetched on pull. Push must never depend on this. */
export const LAST_PULLED_AT_KEY = 'last_pulled_at';

/**
 * Split-cursor invariant:
 * - Push uses LAST_PUSHED_AT_KEY only.
 * - Pull uses LAST_PULLED_AT_KEY only.
 * - Pull-only work must not write LAST_PUSHED_AT_KEY.
 */
export async function migrateLegacySyncCursor(): Promise<void> {
  const [legacy, pushed, pulled] = await Promise.all([
    AsyncStorage.getItem(LEGACY_LAST_SYNCED_AT_KEY),
    AsyncStorage.getItem(LAST_PUSHED_AT_KEY),
    AsyncStorage.getItem(LAST_PULLED_AT_KEY),
  ]);
  if (legacy && (!pushed || !pulled)) {
    if (!pushed) await AsyncStorage.setItem(LAST_PUSHED_AT_KEY, legacy);
    if (!pulled) await AsyncStorage.setItem(LAST_PULLED_AT_KEY, legacy);
  }
}

export async function readPushCursor(): Promise<string | null> {
  return AsyncStorage.getItem(LAST_PUSHED_AT_KEY);
}

export async function readPullCursor(): Promise<string | null> {
  return AsyncStorage.getItem(LAST_PULLED_AT_KEY);
}

export async function writePushCursor(iso: string): Promise<void> {
  await AsyncStorage.setItem(LAST_PUSHED_AT_KEY, iso);
}

export async function writePullCursor(iso: string): Promise<void> {
  await AsyncStorage.setItem(LAST_PULLED_AT_KEY, iso);
}

/** Clears all sync cursors (e.g. sign-out / reset). */
export async function clearSyncCursors(): Promise<void> {
  await clearSyncDiagSnapshot();
  await AsyncStorage.multiRemove([
    LEGACY_LAST_SYNCED_AT_KEY,
    LAST_PUSHED_AT_KEY,
    LAST_PULLED_AT_KEY,
  ]);
}

/**
 * UI-only: last time a full executeSync (push + pull) completed successfully.
 * Not used as a data cursor.
 */
export async function readLastFullSyncDisplayAt(): Promise<string | null> {
  return AsyncStorage.getItem(LEGACY_LAST_SYNCED_AT_KEY);
}

export async function writeLastFullSyncDisplayAt(iso: string): Promise<void> {
  await AsyncStorage.setItem(LEGACY_LAST_SYNCED_AT_KEY, iso);
}
