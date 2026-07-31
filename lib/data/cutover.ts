// M9 Phase 5A — the one-time cutover wipe.
//
// The old architecture stored account data on the device: an AsyncStorage-backed
// mock database (lc_* tables serialized under @livra_db_*), three real SQLite
// files, legacy AsyncStorage homes that predate the SQLite mirrors, and the sync
// engine's cursors/queues. The new architecture reads from Supabase through
// React Query and writes through lib/data/mutations — none of that storage is
// read by anything anymore.
//
// Per D-2 (no real users yet): nothing is uploaded first. Anything on this
// device and not on the server is gone. This runs once, before the rest of
// boot, and a second launch is a strict no-op.
//
// EVERY key here is the property of a module DELETED in Phase 5A. Keys owned by
// surviving modules (theme, momentum, identity, consistency, IAP replay guards,
// the reminders family) are deliberately absent — wiping those would erase live
// preferences, not old architecture. The sign-out purge (lib/db/
// purgeLocalUserData.ts) remains the owner of the live-key registries and the
// drift guard.

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SQLite from 'expo-sqlite';
import { logger } from '../utils/logger';

/** Set once the wipe has run. Device-scoped: survives sign-out forever. */
export const CUTOVER_FLAG_KEY = 'livra_cutover_v1_done';

/**
 * AsyncStorage keys owned by deleted machinery. Ported from the sign-out purge
 * inventory (lib/db/purgeLocalUserData.ts) and lib/db/index.ts's STORAGE_KEYS —
 * not re-derived — then narrowed to keys whose owning module dies in 5A.
 */
export const LEGACY_STORAGE_KEYS = [
  // The AsyncStorage-backed mock database (lib/db/index.ts).
  '@livra_db_marks',
  '@livra_db_events',
  '@livra_db_streaks',
  '@livra_db_badges',
  '@livra_db_meta',
  '@livra_db_user_xp',
  '@livra_db_xp_events',
  '@livra_db_counters', // pre-v2 home, migrated but possibly still present
  // Legacy AsyncStorage data homes that predate the SQLite mirrors.
  '@livra_goals',
  '@livra_goal_mark_links',
  '@livra_goal_notes',
  '@livra_notes',
  // Check-in history (lib/db/checkinsDb.ts) — derived from mark_events now.
  '@livra_checkins',
  // The sync engine's cursors, queues and diagnostics (hooks/useSync.ts).
  'last_synced_at',
  'last_pushed_at',
  'last_pulled_at',
  'livra_sync_diag_v1',
  'sync_retry_queue',
  'sync_goal_cap_blocked_ids',
  'sync_mark_cap_blocked_ids',
  'sync_goals_backfill_done',
  // One-time data-shape migration flags. Their migrations die with the mock DB
  // and the SQLite mirrors, so the flags gate nothing.
  '@livra_migration_v2_complete',
  '@livra_migration_freq_v1',
  '@livra_backfill_goal_id_push_v1',
  '@livra_goals_sqlite_migrated_v1',
  '@livra_goal_mark_links_sqlite_migrated_v1',
  '@livra_goal_notes_sqlite_migrated_v1',
  '@livra_notes_sqlite_migrated_v1',
  // The account-switch guard (lib/db/accountSwitchGuard.ts, deleted in 5A):
  // with no local database left, there is nothing to attribute.
  'livra_last_signed_in_user_id_v1',
] as const;

/** The three real SQLite database files. Deleted outright, not emptied. */
export const LEGACY_SQLITE_DATABASES = [
  'livra_goals.db',
  'livra_goal_notes.db',
  'livra_mark_notes.db',
] as const;

export type CutoverResult = {
  /** False when the flag was already set and nothing was touched. */
  ran: boolean;
  /** Step labels that failed. Logged; the flag is set regardless (see below). */
  failures: string[];
};

/**
 * Deletes every trace of the old architecture's local storage, exactly once.
 *
 * Never throws — boot must proceed whatever happens here. The flag is set even
 * when a step fails: a launch-time retry loop over storage that nothing reads
 * is worse than a stray file, and the guard test pins "second launch is a
 * no-op" as the contract.
 */
export async function runCutoverOnce(): Promise<CutoverResult> {
  try {
    if ((await AsyncStorage.getItem(CUTOVER_FLAG_KEY)) !== null) {
      return { ran: false, failures: [] };
    }
  } catch (error) {
    // If the flag is unreadable the wipe is skipped, not forced: running it on
    // every launch of a device with broken storage would help nothing.
    logger.warn('[Cutover] flag read failed; skipping wipe this launch:', error);
    return { ran: false, failures: ['flagRead'] };
  }

  const failures: string[] = [];

  for (const name of LEGACY_SQLITE_DATABASES) {
    try {
      await SQLite.deleteDatabaseAsync(name);
    } catch {
      // Expected on a fresh install (file does not exist). A genuine failure
      // leaves a dead file nothing will ever open — not worth failing boot for.
    }
  }

  try {
    await AsyncStorage.multiRemove([...LEGACY_STORAGE_KEYS]);
  } catch (error) {
    logger.error('[Cutover] legacy key sweep failed:', error);
    failures.push('storageKeys');
  }

  try {
    await AsyncStorage.setItem(CUTOVER_FLAG_KEY, new Date().toISOString());
  } catch (error) {
    logger.error('[Cutover] flag write failed:', error);
    failures.push('flagWrite');
  }

  if (failures.length > 0) {
    logger.warn('[Cutover] finished with failures:', failures);
  } else {
    logger.log('[Cutover] old-architecture storage wiped');
  }
  return { ran: true, failures };
}
