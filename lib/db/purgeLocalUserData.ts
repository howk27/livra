// Device wipe of one account's local data — run on sign-out.
//
// WHY THIS FILE EXISTS: signing out cleared the Supabase session and the
// onboarding flag and nothing else, so the previous account's marks, events,
// goals, links, notes, XP, momentum records and identity memory stayed on the
// device. Reads are user-scoped, so it was never a correctness bug — it is a
// privacy leak on a shared, lent or sold phone, and it is why two accounts'
// data coexisted locally during the 2026-07-22 debugging session.
//
// WHAT IT IS NOT: this never deletes anything server-side. No tombstones are
// written and nothing produced here may reach a sync push — the rows still
// belong to the account that signed out, and signing back in pulls them down
// again. The one thing genuinely lost is local work that had not yet been
// pushed when the user signed out.
//
// TWO REGISTRIES, AND WHY: every persisted key is either account-scoped
// (purged) or device-scoped (kept). Both lists are exported and
// tests/unit/purgeLocalUserData.test.ts fails when a key literal in the repo
// appears in neither, so a new key cannot silently join the leak.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '../utils/logger';
import { resetDatabaseState } from './index';
import { sqliteClearAllGoalsAndLinks } from './goalsSqlite';
import { sqliteClearAllGoalNotes } from './goalNotesSqlite';
import { sqliteClearAllMarkNotes } from './markNotesSqlite';
import { clearPendingWidgetLogs } from '../widgets/widgetLogQueue';
import { syncWidgetData } from '../widgets/widgetSync';
import { useMarksStore } from '../../state/countersSlice';
import { useEventsStore } from '../../state/eventsSlice';
import { useGoalsStore } from '../../state/goalsSlice';
import { useGoalNotesStore } from '../../state/goalNotesSlice';
import { useDailyTrackingStore } from '../../state/dailyTrackingSlice';
import { useCheckinsStore } from '../../state/checkinsSlice';
import { useXPStore } from '../../state/xpSlice';
import { useFeaturesStore } from '../../state/featuresSlice';
import { useMomentumStore } from '../../state/momentumSlice';
import { useIdentityStore } from '../../state/identitySlice';
import { useVoiceStore } from '../../state/voiceSlice';
import { useGoalCompletionStore } from '../../state/goalCompletionStore';

/**
 * Account-scoped keys — the previous user's data or their derived state.
 * `resetDatabaseState()` already clears the lc_* store keys; they are absent
 * here on purpose, so ownership of each key has exactly one home.
 */
export const ACCOUNT_SCOPED_STORAGE_KEYS = [
  // Legacy AsyncStorage homes that predate the SQLite mirrors. Migration
  // empties them, but a device that never ran the migration still has data.
  '@livra_goals',
  '@livra_goal_mark_links',
  '@livra_goal_notes',
  '@livra_notes',
  // Derived history and behavioural memory.
  '@livra_checkins',
  '@livra_consistency_history',
  '@livra_longest_runs_v1',
  '@livra_skip_tokens',
  'identity_milestones_v1',
  'livra_momentum_banner_dismissed_v1',
  'livra.pace.v1',
  'livra_weekly_review_history',
  'livra_weekly_review_seed_user_id',
  'livra_weekly_review_opened_at',
  'livra_weekly_review_prompt_dismissed_at',
  // Notification schedule and engagement state tied to the signed-out user's
  // cadence. The scheduled notifications themselves are cancelled separately
  // (disableLivraLocalNotificationsNow, called by signOut before the purge).
  '@livra_daily_reminder_time',
  '@livra_pace_notification_window',
  'livra_reminders_enabled_v1',
  'livra_bn_engagement_v1',
  'livra_bn_last_foreground_v1',
  'livra_mw_last_templates_v1',
  'livra_reengage_last_v1',
  // Sync state — a new account must not inherit another's watermark, its
  // blocked-goal ids, or its unsent retry queue.
  'last_synced_at',
  'last_pushed_at',
  'last_pulled_at',
  'livra_sync_diag_v1',
  'sync_retry_queue',
  'sync_goal_cap_blocked_ids',
  // Same class as the goal list above: ids the SERVER refused for THIS account.
  // Carrying them into the next sign-in would make the new account re-query mark
  // ids that were never its own.
  'sync_mark_cap_blocked_ids',
  'sync_goals_backfill_done',
  // Entitlement and profile of the account that left.
  '@livra_iap_receipt',
  '@livra_iap_last_verify',
  'pro_unlocked',
  'profile_image_uri',
  'private_relay_notice_dismissed',
  'health_connected',
  // Onboarding: completion is device-wide, so whatever account finished it last
  // would otherwise make the NEXT account skip onboarding (uiSlice's
  // resetOnboardingState covers the same ground; kept here so a purge is
  // complete on its own).
  'has_completed_onboarding',
  'is_onboarded',
  'onboarding_remote_pending',
  'livra.onboardingDraft.v1',
  // Auth-owned, cleared on SIGNED_OUT anyway; listed so the guard test sees it.
  'session_expired',
  // Who this device's data belongs to (lib/db/accountSwitchGuard.ts). Account-
  // scoped on purpose: once the purge has run there is nothing left to
  // attribute, and the sign-in guard treats "unknown" as record-don't-wipe.
  'livra_last_signed_in_user_id_v1',
] as const;

/** Key families written one-per-goal or one-per-mark; matched by prefix. */
export const ACCOUNT_SCOPED_KEY_PREFIXES = [
  '@livra_momentum_',
  '@livra_reminder_time:',
  '@livra_pace_notif_state:',
  '@livra_sleep_notif_time:',
] as const;

/**
 * Device-scoped keys, deliberately KEPT across sign-out. Each one is a property
 * of this phone rather than of the account, and each is listed with its reason
 * because "keep" is the decision that can leak if made carelessly.
 */
export const DEVICE_SCOPED_STORAGE_KEYS = [
  'theme_mode', // display preference
  'accent_color', // display preference
  'daily_habits_open', // list-section fold state
  'fab_hint_shown', // one-off UI hint, device-level
  'livra_share_card_style_v1', // share-card style preference
  'livra_feature_flags', // experiment assignment, device-level
  'biometric_lock_enabled', // device lock — dropping it would REMOVE protection
  '@livra_debug_app_date_override', // dev tool, gated to dev builds
  'iap_support_diagnostics_enabled', // support toggle, device-level
  // IAP replay protection. Deliberately KEPT: these are device-level guards
  // against re-crediting a transaction Apple has already delivered. Clearing
  // them on sign-out would let one purchase be replayed onto a second account.
  'iap_pending_tx',
  'iap_processed_index',
  'iap_stuck_purchase_marker',
  // Auth storage health — owned by lib/auth/authStorageHealth and cleared on
  // the SIGNED_OUT event; they describe the DEVICE's storage, not the user.
  'livra_auth_storage_write_failed_v1',
  'livra_auth_storage_remove_failed_v1',
  // One-time data-shape migration flags. Dropping these is actively harmful:
  // the migration would re-run against the NEXT account's freshly pulled rows
  // and rewrite fields it has no business touching (frequency backfill).
  '@livra_migration_v2_complete',
  '@livra_migration_freq_v1',
  '@livra_backfill_goal_id_push_v1',
  '@livra_goals_sqlite_migrated_v1',
  '@livra_goal_mark_links_sqlite_migrated_v1',
  '@livra_goal_notes_sqlite_migrated_v1',
  '@livra_notes_sqlite_migrated_v1',
] as const;

/**
 * Literals the drift guard will find in the same scan but which are NOT
 * AsyncStorage keys, so neither registry above can own them. Listed rather than
 * ignored, because "it isn't a storage key" is a claim worth pinning down.
 */
export const NON_ASYNC_STORAGE_LITERALS = [
  // App Group (react-native-shared-group-preferences) — the widget's own store,
  // handled by the widget step of the purge, not by the key sweep.
  'livra_widget_data',
  'livra_pending_logs',
  // Scheduled-notification identifier prefixes (expo-notifications), not storage.
  'livra-bn-',
  'livra-mw-',
  'livra-reminder-',
] as const;

export type PurgeLocalUserDataResult = {
  /** Step labels that failed. Empty means the device is clean. */
  failures: string[];
  /** Count of AsyncStorage keys removed — surfaced for logs and tests. */
  removedKeyCount: number;
};

function isAccountScoped(key: string): boolean {
  return (
    (ACCOUNT_SCOPED_STORAGE_KEYS as readonly string[]).includes(key) ||
    ACCOUNT_SCOPED_KEY_PREFIXES.some((prefix) => key.startsWith(prefix))
  );
}

/**
 * Clears the local stores that still hold the signed-out account in memory.
 *
 * Not cosmetic: `hydrateLongestRuns` and `loadIdentityState` are both one-shot
 * and neither overwrites memory from an EMPTY store, so without this the next
 * account inherits the previous one's personal bests and fired milestones — and
 * momentum writes them straight back to disk on its next evaluation.
 *
 * Each store is reset independently so one broken store cannot leave the rest
 * of the previous account on screen.
 */
function resetInMemoryStores(): string[] {
  const failures: string[] = [];
  const steps: [string, () => void][] = [
    ['marks', () =>
      useMarksStore.setState({ marks: [], loading: false, error: null, recentUpdates: new Map() })],
    ['events', () =>
      useEventsStore.setState({ events: [], loading: false, error: null, lastActionId: null })],
    ['goals', () => useGoalsStore.setState({ goals: [], isLoading: false, error: null })],
    ['goalNotes', () =>
      useGoalNotesStore.setState({ entries: [], loading: false, goalNotesCloudError: null })],
    ['markNotes', () =>
      useDailyTrackingStore.setState({ dailyLogs: [], loading: false, notesCloudError: null })],
    ['checkins', () => useCheckinsStore.setState({ checkins: [], loading: false, error: null })],
    ['xp', () =>
      useXPStore.setState({ totalXP: 0, currentLevel: 1, pendingLevelUp: null, loading: false })],
    ['skipTokens', () => useFeaturesStore.setState({ skipTokens: [], loading: false })],
    ['momentum', () =>
      useMomentumStore.setState({ snapshots: {}, longestRuns: {}, longestRunsHydrated: false })],
    ['identity', () => useIdentityStore.setState({ fired: {}, loaded: false })],
    ['voice', () => useVoiceStore.setState({ line: null, lastMomentIds: {} })],
    ['goalCompletion', () =>
      useGoalCompletionStore.setState({ completedGoal: null, show: false })],
  ];

  for (const [label, run] of steps) {
    try {
      run();
    } catch (error) {
      logger.warn(`[Purge] in-memory reset failed for ${label}:`, error);
      failures.push(`store:${label}`);
    }
  }
  return failures;
}

/**
 * Removes every trace of the signed-out account from this device.
 *
 * Never throws. Sign-out must complete even if a wipe step fails — a user
 * stranded in a signed-in session is worse than a partial wipe — so failures
 * are logged and returned instead. The caller decides what to do with them.
 */
export async function purgeLocalUserData(): Promise<PurgeLocalUserDataResult> {
  const failures: string[] = [];
  let removedKeyCount = 0;

  // 1. The AsyncStorage-backed mock DB: marks, events, streaks, badges, XP.
  try {
    await resetDatabaseState();
  } catch (error) {
    logger.error('[Purge] resetDatabaseState failed:', error);
    failures.push('mockDb');
  }

  // 2. The three real SQLite databases.
  const sqliteSteps: [string, () => Promise<void>][] = [
    ['goalsSqlite', sqliteClearAllGoalsAndLinks],
    ['goalNotesSqlite', sqliteClearAllGoalNotes],
    ['markNotesSqlite', sqliteClearAllMarkNotes],
  ];
  for (const [label, run] of sqliteSteps) {
    try {
      await run();
    } catch (error) {
      logger.error(`[Purge] ${label} clear failed:`, error);
      failures.push(label);
    }
  }

  // 3. Account-scoped AsyncStorage keys, including the per-goal/per-mark families.
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const doomed = allKeys.filter(isAccountScoped);
    if (doomed.length > 0) {
      await AsyncStorage.multiRemove(doomed);
    }
    removedKeyCount = doomed.length;
  } catch (error) {
    logger.error('[Purge] AsyncStorage key sweep failed:', error);
    failures.push('storageKeys');
  }

  // 4. Memory: the stores above read from what we just emptied.
  failures.push(...resetInMemoryStores());

  // 5. The widget, which lives in the App Group and not in AsyncStorage — the
  // home screen keeps showing the signed-out account's goals and marks until
  // the snapshot is rewritten. Runs AFTER the store reset on purpose:
  // buildWidgetData reads those stores, so it now writes an empty snapshot.
  try {
    await clearPendingWidgetLogs();
    await syncWidgetData();
  } catch (error) {
    logger.warn('[Purge] widget snapshot clear failed:', error);
    failures.push('widget');
  }

  if (failures.length > 0) {
    logger.warn('[Purge] local data purge finished with failures:', failures);
  } else {
    logger.log(`[Purge] local data purged (${removedKeyCount} key(s))`);
  }

  return { failures, removedKeyCount };
}
