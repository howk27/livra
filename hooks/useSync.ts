import { useEffect, useState, useCallback, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { getSupabaseClient } from '../lib/supabase';
import { env } from '../lib/env';
import { Counter, MarkBadge, CounterEvent, CounterStreak } from '../types';
import { query, execute, queryFirst } from '../lib/db';
import {
  migrateLegacySyncCursor,
  readPushCursor,
  readPullCursor,
  writePushCursor,
  writePullCursor,
  readLastFullSyncDisplayAt,
  writeLastFullSyncDisplayAt,
} from '../lib/sync/syncCursors';
import { recomputeStreaksAfterSyncFromSqlite } from '../lib/sync/recomputeStreaksFromSqlite';
import { detectDuplicateMarkNameGroups } from '../lib/sync/duplicateMarkNames';
import { readSyncDiagSnapshot, writeSyncDiagSnapshot } from '../lib/sync/syncDiagSnapshot';
import {
  prePushChildIntegrityAuditAndCleanup,
  postUpsertOrphanChildCleanup,
  isParentMissingSyncError,
} from '../lib/sync/prePushChildIntegrityAudit';

// Retry queue constants
const RETRY_QUEUE_KEY = 'sync_retry_queue';
const MAX_RETRY_ATTEMPTS = 3;
const INITIAL_RETRY_DELAY = 1000; // 1 second
const MAX_RETRY_DELAY = 60000; // 60 seconds

interface RetryQueueItem {
  type: 'counter' | 'event' | 'streak' | 'badge';
  data: any;
  retryCount: number;
  lastAttempt: string;
  userId: string;
}
import { cleanupDuplicateCounters, cleanupOrphanedStreaksAndBadges, cleanupOrphanedEvents } from '../lib/db/cleanup';
import { mapStreaksToSupabase, mapBadgesToSupabase, mapEventsToSupabase } from '../lib/sync/mappers';
import { logger } from '../lib/utils/logger';
import { formatDate } from '../lib/date';
import { normalizeDailyTargetInput, resolveDailyTarget } from '../lib/markDailyTarget';

/** Stable codes for post-sync maintenance — no PII; surfaced in Diagnostics. */
export type SyncMaintenanceWarningCode =
  | 'MAINT_STREAK_RECOMPUTE_FAILED'
  | 'MAINT_CLEANUP_FAILED'
  | 'MAINT_ORPHAN_BADGE_CLEANUP_PARTIAL'
  | 'MAINT_DUPLICATE_NAME_SCAN_FAILED';

export type StreakRecomputeSourceLabel = 'sqlite_full_increment_events' | 'none' | 'error';

export interface SyncState {
  isSyncing: boolean;
  /** Core cloud sync: push + pull completed successfully (split cursors advanced). */
  lastSyncedAt: string | null;
  error: string | null;
  realtimeConnected: boolean;
  /** Best-effort maintenance after core sync; empty = all post-steps OK or not run. */
  maintenanceWarnings: SyncMaintenanceWarningCode[];
  /** Number of same-name / different-id mark groups (diagnostics; 0 = none). */
  duplicateMarkNameGroupCount: number;
  /** How the last post-sync streak pass ran (SQLite full history vs none/error). */
  lastStreakRecomputeSource: StreakRecomputeSourceLabel;
}

const isProLimitError = (error: any): boolean => {
  const message = error?.message || String(error || '');
  return (
    error?.code === 'P0001' ||
    (typeof message === 'string' && message.includes('FREE_COUNTER_LIMIT_REACHED'))
  );
};

/** Wall-clock guard so a hung push/pull cannot leave isSyncing true forever. Does not abort in-flight work; cursors only advance inside completed push/pull. */
const SYNC_EXECUTION_TIMEOUT_MS = 180_000;

function createSyncExecutionTimeoutError(): Error {
  const e = new Error('Sync exceeded maximum execution time');
  (e as any).code = 'SYNC_EXECUTION_TIMEOUT';
  return e;
}

const UUID_RE_SYNC = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isValidUUIDForSyncLog(str: string): boolean {
  return UUID_RE_SYNC.test(str);
}

/**
 * Diagnostics only — no secrets. Buckets match sync RCA checklist.
 * `finalPushActiveParentIds` = active lc_counters ids in the counter upsert payload for this run.
 * `upsertedActiveParentIds` = ids included in successful upsert batches as non-deleted rows.
 */
async function classifyMissingParentsForSyncLog(
  userId: string,
  missParentIds: string[],
  augmentedParentIds: string[],
  finalPushActiveParentIds: ReadonlySet<string>,
  upsertedActiveParentIds: ReadonlySet<string>,
): Promise<{ counts: Record<string, number> }> {
  const aug = new Set(augmentedParentIds);
  const counts: Record<string, number> = {
    invalid_malformed_id: 0,
    local_missing_parent: 0,
    local_deleted_parent: 0,
    local_active_pushable_parent_in_final_counter_set: 0,
    local_active_not_selected_for_push: 0,
    // Upsert success as active but still missing from merged child confirmation (RLS/verify gap or merge bug).
    local_active_pushed_upserted_remote_not_visible: 0,
    was_augmented_into_push_set: 0,
  };
  if (missParentIds.length === 0) return { counts };
  const chunk = 80;
  for (let i = 0; i < missParentIds.length; i += chunk) {
    const slice = missParentIds.slice(i, i + chunk);
    for (const id of slice) {
      if (!isValidUUIDForSyncLog(id)) {
        counts.invalid_malformed_id += 1;
        continue;
      }
      if (aug.has(id)) counts.was_augmented_into_push_set += 1;
    }
    const ph = slice.filter((id) => isValidUUIDForSyncLog(id));
    if (ph.length === 0) continue;
    const placeholders = ph.map(() => '?').join(',');
    const rows = await query<{ id: string; deleted_at: string | null }>(
      `SELECT id, deleted_at FROM lc_counters WHERE user_id = ? AND id IN (${placeholders})`,
      [userId, ...ph],
    );
    const found = new Map(rows.map((r) => [r.id, r]));
    for (const id of slice) {
      if (!isValidUUIDForSyncLog(id)) continue;
      const r = found.get(id);
      if (!r) {
        counts.local_missing_parent += 1;
        continue;
      }
      if (r.deleted_at && String(r.deleted_at).trim() !== '') {
        counts.local_deleted_parent += 1;
        continue;
      }
      // Active local
      if (upsertedActiveParentIds.has(id)) {
        counts.local_active_pushed_upserted_remote_not_visible += 1;
        continue;
      }
      if (finalPushActiveParentIds.has(id)) {
        counts.local_active_pushable_parent_in_final_counter_set += 1;
        continue;
      }
      counts.local_active_not_selected_for_push += 1;
    }
  }
  return { counts };
}

export const useSync = () => {
  const supabase = getSupabaseClient();
  const [syncState, setSyncState] = useState<SyncState>({
    isSyncing: false,
    lastSyncedAt: null,
    error: null,
    realtimeConnected: false,
    maintenanceWarnings: [],
    duplicateMarkNameGroupCount: 0,
    lastStreakRecomputeSource: 'none',
  });

  // Sync lock to prevent concurrent syncs
  const syncLockRef = useRef<Promise<void> | null>(null);
  // Real-time subscription refs
  const realtimeChannelRef = useRef<any>(null);
  /** Latest `sync()` including throttle bypass — realtime uses this so subscriptions stay current. */
  const syncFnRef = useRef<((opts?: { bypassThrottle?: boolean }) => Promise<void>) | null>(null);

  useEffect(() => {
    let mounted = true;
    migrateLegacySyncCursor().then(() =>
      readLastFullSyncDisplayAt().then(async (value) => {
        if (!mounted || !value) return;
        setSyncState((prev) => ({ ...prev, lastSyncedAt: value }));
        const existingDiag = await readSyncDiagSnapshot();
        if (!existingDiag) {
          await writeSyncDiagSnapshot({
            coreSyncedAtIso: value,
            maintenanceWarnings: [],
            duplicateMarkNameGroupCount: 0,
            lastStreakRecomputeSource: 'none',
          });
        }
      }),
    );

    // Set up real-time sync subscriptions
    const setupRealtimeSync = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user || !user.id || !isValidUUID(user.id)) {
          return;
        }

        // Create real-time channel for counters
        const channel = supabase
          .channel(`counters:${user.id}`)
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'counters',
              filter: `user_id=eq.${user.id}`,
            },
            async (payload: any) => {
              logger.log('[REALTIME] Counter change detected:', payload.eventType, payload.new?.id);
              
              // Only handle if user is authenticated
              const { data: { user: currentUser } } = await supabase.auth.getUser();
              if (!currentUser || currentUser.id !== user.id) {
                return;
              }

              // Debounce real-time updates to avoid rapid syncs
              if (syncDebounceTimeoutRef.current) {
                clearTimeout(syncDebounceTimeoutRef.current);
              }
              
              syncDebounceTimeoutRef.current = setTimeout(async () => {
                try {
                  await new Promise((resolve) => setTimeout(resolve, 500));
                  // Full sync so pull never advances push cursor without pushing first (split-cursor invariant).
                  await syncFnRef.current?.({ bypassThrottle: true });
                  const { useCountersStore } = await import('../state/countersSlice');
                  const { useEventsStore } = await import('../state/eventsSlice');
                  await useCountersStore.getState().loadMarks(user.id);
                  useEventsStore.getState().loadEvents(undefined, user.id);
                } catch (error) {
                  logger.error('[REALTIME] Error handling counter change:', error);
                }
              }, 3000);
            }
          )
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'counter_events',
              filter: `user_id=eq.${user.id}`,
            },
            async (payload: any) => {
              logger.log('[REALTIME] Event change detected:', payload.eventType);
              
              // Only handle if user is authenticated
              const { data: { user: currentUser } } = await supabase.auth.getUser();
              if (!currentUser || currentUser.id !== user.id) {
                return;
              }

              // Debounce and pull changes
              if (syncDebounceTimeoutRef.current) {
                clearTimeout(syncDebounceTimeoutRef.current);
              }
              
              syncDebounceTimeoutRef.current = setTimeout(async () => {
                try {
                  await syncFnRef.current?.({ bypassThrottle: true });
                  const { useCountersStore } = await import('../state/countersSlice');
                  const { useEventsStore } = await import('../state/eventsSlice');
                  await useCountersStore.getState().loadMarks(user.id);
                  useEventsStore.getState().loadEvents(undefined, user.id);
                } catch (error) {
                  logger.error('[REALTIME] Error handling event change:', error);
                }
              }, 1000);
            }
          )
          .subscribe((status: string) => {
            if (status === 'SUBSCRIBED') {
              if (env.isDev) {
                logger.log('[REALTIME] Successfully subscribed to real-time updates');
              }
              setSyncState((prev) => ({ ...prev, realtimeConnected: true }));
            } else if (status === 'CHANNEL_ERROR') {
              logger.warn('[REALTIME] Channel error - attempting to reconnect');
              setSyncState((prev) => ({ ...prev, realtimeConnected: false }));
              // Attempt to reconnect after a delay
              setTimeout(() => {
                if (mounted && realtimeChannelRef.current) {
                  setupRealtimeSync().catch((err) => {
                    logger.error('[REALTIME] Reconnection attempt failed:', err);
                  });
                }
              }, 5000); // Retry after 5 seconds
            } else if (status === 'TIMED_OUT' || status === 'CLOSED') {
              logger.warn('[REALTIME] Connection lost - will attempt to reconnect');
              setSyncState((prev) => ({ ...prev, realtimeConnected: false }));
              // Attempt to reconnect
              setTimeout(() => {
                if (mounted) {
                  setupRealtimeSync().catch((err) => {
                    logger.error('[REALTIME] Reconnection attempt failed:', err);
                  });
                }
              }, 3000); // Retry after 3 seconds
            }
          });

        realtimeChannelRef.current = channel;
      } catch (error) {
        logger.error('[REALTIME] Error setting up real-time sync:', error);
        setSyncState((prev) => ({ ...prev, realtimeConnected: false }));
        // Fall back to manual sync only, but attempt to reconnect later
        setTimeout(() => {
          if (mounted) {
            setupRealtimeSync().catch((err) => {
              logger.error('[REALTIME] Reconnection attempt failed:', err);
            });
          }
        }, 10000); // Retry after 10 seconds on initial failure
      }
    };

    setupRealtimeSync();

    // Cleanup: prevent state updates after unmount and unsubscribe from real-time
    return () => {
      mounted = false;
      if (realtimeChannelRef.current) {
        supabase.removeChannel(realtimeChannelRef.current);
        realtimeChannelRef.current = null;
      }
      if (syncDebounceTimeoutRef.current) {
        clearTimeout(syncDebounceTimeoutRef.current);
      }
    };
  }, []);

  const pullChanges = useCallback(async (userId: string) => {
    // Require valid authenticated user (user_id must be a valid UUID)
    if (!userId || !isValidUUID(userId)) {
      logger.log('[SYNC] Skipping pull - user not authenticated or invalid user_id:', userId);
      return;
    }

    // CRITICAL: Wait for any pending writes to complete before pulling changes
    // This prevents pullChanges from overwriting local increments that are still being written
    // Check store's recentUpdates to see if there are any pending writes
    const { useCountersStore } = await import('../state/countersSlice');
    const storeState = useCountersStore.getState();
    const recentUpdates = storeState.recentUpdates || new Map();
    const now = Date.now();
    const hasRecentUpdates = Array.from(recentUpdates.values()).some(
      (update) => now - update.timestamp < 300000 // 5 minutes
    );
    
    if (hasRecentUpdates) {
      logger.log('[SYNC] Recent updates detected, checking if pending writes need to complete...');
      // Small delay to allow pending writes to complete
      // The mergeCounter function will preserve higher totals anyway, so this is just extra safety
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    const lastPulledAt = await readPullCursor();

    try {
      const counterSelect =
        'id, user_id, name, emoji, color, unit, enable_streak, sort_index, total, last_activity_date, deleted_at, created_at, updated_at';

      let remoteCounterRows: any[] = [];

      if (lastPulledAt) {
        const { data: activeRows, error: activeErr } = await supabase
          .from('counters')
          .select(counterSelect)
          .eq('user_id', userId)
          .is('deleted_at', null)
          .gt('updated_at', lastPulledAt);

        if (activeErr) {
          const parsed = parseError(activeErr);
          if (parsed.isNetworkError || parsed.shouldRetry) {
            logger.warn('[SYNC] Pull counters (active) failed:', parsed.message);
          }
          throw activeErr;
        }

        const { data: tombRows, error: tombErr } = await supabase
          .from('counters')
          .select(counterSelect)
          .eq('user_id', userId)
          .not('deleted_at', 'is', null)
          .gt('updated_at', lastPulledAt);

        if (tombErr) {
          const parsed = parseError(tombErr);
          if (parsed.isNetworkError || parsed.shouldRetry) {
            logger.warn('[SYNC] Pull counters (tombstones) failed:', parsed.message);
          }
          throw tombErr;
        }

        remoteCounterRows = [...(activeRows || []), ...(tombRows || [])];
      } else {
        const PAGE = 500;
        let offset = 0;
        for (;;) {
          const { data: batch, error } = await supabase
            .from('counters')
            .select(counterSelect)
            .eq('user_id', userId)
            .order('updated_at', { ascending: false })
            .range(offset, offset + PAGE - 1);

          if (error) {
            const parsed = parseError(error);
            if (parsed.isNetworkError || parsed.shouldRetry) {
              logger.warn('[SYNC] Pull counters (initial page) failed:', parsed.message);
            }
            throw error;
          }
          const rows = batch || [];
          remoteCounterRows.push(...rows);
          if (rows.length < PAGE) break;
          offset += PAGE;
        }
      }

      const byCounterId = new Map<string, any>();
      for (const row of remoteCounterRows) {
        const prev = byCounterId.get(row.id);
        if (!prev || new Date(row.updated_at).getTime() >= new Date(prev.updated_at).getTime()) {
          byCounterId.set(row.id, row);
        }
      }
      const dedupedRemoteCounters = Array.from(byCounterId.values()) as Counter[];

      // Pull events - for first sync, paginate to get all events
      // For incremental sync, get all changes since last sync
      let allEvents: any[] = [];
      
      if (lastPulledAt) {
        // Incremental sync - get all changes since last sync
        const { data: events, error: eventsError } = await supabase
          .from('counter_events')
          .select('id, user_id, counter_id, event_type, amount, occurred_at, occurred_local_date, meta, deleted_at, created_at, updated_at')
          .eq('user_id', userId)
          .gt('updated_at', lastPulledAt)
          .order('updated_at', { ascending: false });
        
        if (eventsError) {
          const parsed = parseError(eventsError);
          if (parsed.isNetworkError || parsed.shouldRetry) {
            logger.warn('[SYNC] Pull events failed:', parsed.message);
          }
          throw eventsError;
        }
        allEvents = events || [];
      } else {
        // First sync - paginate to get all events (not just last 90 days)
        // This ensures complete data recovery after reinstall
        const BATCH_SIZE = 1000;
        let hasMore = true;
        let offset = 0;
        let lastUpdatedAt: string | null = null;
        
        logger.log('[SYNC] Starting paginated initial sync for events...');
        
        while (hasMore) {
          let eventsQuery = supabase
            .from('counter_events')
            .select('id, user_id, counter_id, event_type, amount, occurred_at, occurred_local_date, meta, deleted_at, created_at, updated_at')
            .eq('user_id', userId)
            .order('updated_at', { ascending: false })
            .range(offset, offset + BATCH_SIZE - 1);
          
          const { data: events, error: eventsError } = await eventsQuery;
          
          if (eventsError) {
            const parsed = parseError(eventsError);
            if (parsed.isNetworkError || parsed.shouldRetry) {
              logger.warn('[SYNC] Paginated event pull failed:', parsed.message);
            }
            throw eventsError;
          } else {
            const batch = events || [];
            if (batch.length > 0) {
              allEvents = [...allEvents, ...batch];
              offset += BATCH_SIZE;
              lastUpdatedAt = batch[batch.length - 1]?.updated_at || null;
              hasMore = batch.length === BATCH_SIZE;
              
              if (env.isDev) {
                logger.log(`[SYNC] Loaded ${allEvents.length} events so far...`);
              }
            } else {
              hasMore = false;
            }
          }
        }
        
        logger.log(`[SYNC] Initial sync complete: loaded ${allEvents.length} total events`);
      }
      
      const events = allEvents;
      
      // Map counter_id from Supabase to mark_id for local types
      // CRITICAL: Filter out events without valid counter_id and ensure mark_id is set
      const safeEvents = (events || [])
        .filter((event: any) => {
          // Ensure counter_id exists and is valid
          const counterId = event.counter_id || event.mark_id;
          return counterId && 
                 typeof counterId === 'string' && 
                 counterId.trim() !== '' &&
                 isValidUUID(counterId);
        })
        .map((event: any) => ({
          ...event,
          mark_id: event.counter_id || event.mark_id, // Ensure mark_id is always set
        })) as CounterEvent[];
      
      if (safeEvents.length !== (events || []).length) {
        const filteredCount = (events || []).length - safeEvents.length;
        logger.warn(`[SYNC] Filtered out ${filteredCount} event(s) with invalid or missing counter_id when pulling from Supabase`);
      }

      // Pull streaks - select only needed fields
      let streaksQuery = supabase
        .from('counter_streaks')
        .select('id, user_id, counter_id, current_streak, longest_streak, last_increment_date, deleted_at, created_at, updated_at')
        .eq('user_id', userId);
      
      if (lastPulledAt) {
        streaksQuery = streaksQuery.gt('updated_at', lastPulledAt);
      }
      
      const { data: streaks, error: streaksError } = await streaksQuery;
      if (streaksError) {
        const parsed = parseError(streaksError);
        if (parsed.isNetworkError || parsed.shouldRetry) {
          logger.warn('[SYNC] Pull streaks failed:', parsed.message);
        }
        throw streaksError;
      }
      
      // Map counter_id from Supabase to mark_id for local types
      const safeStreaks = (streaks || []).map((streak: any) => ({
        ...streak,
        mark_id: streak.counter_id || streak.mark_id,
      })) as CounterStreak[];

      // Pull badges - select only needed fields
      let badges: MarkBadge[] | null = null;
      let badgesQuery = supabase
        .from('counter_badges')
        .select('id, user_id, counter_id, badge_code, progress_value, target_value, earned_at, last_progressed_at, deleted_at, created_at, updated_at')
        .eq('user_id', userId);

      if (lastPulledAt) {
        badgesQuery = badgesQuery.gt('updated_at', lastPulledAt);
      }

      const { data: badgesData, error: badgesError } = await badgesQuery;
      if (badgesError) {
        if (!isMissingSupabaseTable(badgesError, 'counter_badges')) {
          throw badgesError;
        }
      } else {
        // Map counter_id from Supabase to mark_id for local types
        badges = (badgesData ?? []).map((badge: any) => ({
          ...badge,
          mark_id: badge.counter_id || badge.mark_id,
        })) as MarkBadge[];
      }

      // Merge into local database
      // CRITICAL: Get all locally deleted counter IDs to prevent them from reappearing
      // This is the key protection against deleted counter resurgence
      const [locallyDeletedIds, existingCounters] = await Promise.all([
        query<{ id: string; deleted_at: string }>(
          'SELECT id, deleted_at FROM lc_counters WHERE user_id = ? AND deleted_at IS NOT NULL AND deleted_at != ""',
          [userId]
        ),
        query<{ id: string; deleted_at: string | null; updated_at: string }>(
          'SELECT id, deleted_at, updated_at FROM lc_counters WHERE user_id = ?',
          [userId]
        )
      ]);
      
      // Create set of deleted IDs for fast lookup
      // Store deletion timestamps to compare with server versions
      const deletedIdsMap = new Map<string, string>();
      locallyDeletedIds.forEach((c) => {
        deletedIdsMap.set(c.id, c.deleted_at);
      });
      const deletedIdsSet = new Set(deletedIdsMap.keys());
      const existingCountersMap = new Map(existingCounters.map((c) => [c.id, c]));
      
      // Log how many deleted counters we're protecting
      if (deletedIdsSet.size > 0) {
        logger.log(`[SYNC] Protecting ${deletedIdsSet.size} locally deleted counter(s) from reappearing`);
      }

      if (dedupedRemoteCounters.length > 0) {
        logger.log(`[SYNC] Merging ${dedupedRemoteCounters.length} counter row(s) from Supabase (active + tombstones)`);
      }

      /** Marks whose lc_counters.total may disagree with lc_events until post-pull replay (see markTotalReconciliation). */
      const markIdsNeedingTotalReconcile = new Set<string>();

      for (const counter of dedupedRemoteCounters) {
        const isServerTomb =
          !!counter.deleted_at && String(counter.deleted_at).trim() !== '';

        // Local-delete wins over a live remote row: never resurrect a mark the user deleted here.
        if (deletedIdsSet.has(counter.id) && !isServerTomb) {
          logger.warn(
            `[SYNC] Skipping live remote row for locally deleted counter ${counter.id} — local tombstone wins until server receives delete push`,
          );
          continue;
        }

        if (isServerTomb) {
          await mergeCounterTombstoneFromRemote(counter as Counter);
          continue;
        }

        const existing = existingCountersMap.get(counter.id);
        if (existing && existing.deleted_at && existing.deleted_at.trim() !== '') {
          logger.log(
            `[SYNC] Skipping active remote row for ${counter.id} — already soft-deleted locally`,
          );
          continue;
        }

        logger.log(`[SYNC] Merging active counter ${counter.id} (${counter.name}) from Supabase`);
        markIdsNeedingTotalReconcile.add(counter.id);
        await mergeCounter(counter as Counter, existingCountersMap);
      }

      if (safeEvents && safeEvents.length > 0) {
        // Additional validation: ensure all events have mark_id before merging
        const validEvents = safeEvents.filter((event) => {
          if (!event.mark_id || typeof event.mark_id !== 'string' || event.mark_id.trim() === '') {
            logger.warn(`[SYNC] Skipping event ${event.id} - missing or invalid mark_id`);
            return false;
          }
          return true;
        });
        
        if (validEvents.length !== safeEvents.length) {
          logger.warn(`[SYNC] Filtered out ${safeEvents.length - validEvents.length} event(s) with invalid mark_id before merging`);
        }
        
        for (const event of validEvents) {
          markIdsNeedingTotalReconcile.add(event.mark_id);
          await mergeEvent(event);
        }
      }

      if (safeStreaks && safeStreaks.length > 0) {
        for (const streak of safeStreaks) {
          await mergeStreak(streak);
        }
      }

      if (badges && badges.length > 0) {
        for (const badge of badges) {
          await mergeBadge(badge);
        }
      }

      const { reconcileMarkTotalsAfterPull } = await import('../lib/db/markTotalReconciliation');
      const totalsRepaired = await reconcileMarkTotalsAfterPull(userId, markIdsNeedingTotalReconcile);
      if (totalsRepaired > 0) {
        logger.log(`[SYNC] Totals reconciled from lc_events for ${totalsRepaired} mark(s) after pull`);
      }

      const { useMarksStore } = await import('../state/countersSlice');
      useMarksStore.setState((s) => {
        const ru = new Map(s.recentUpdates || new Map());
        for (const id of markIdsNeedingTotalReconcile) {
          ru.delete(id);
        }
        return { recentUpdates: ru };
      });

      await useCountersStore.getState().loadMarks(userId);

      // Pull cursor only — never advances push cursor (split-cursor model).
      await writePullCursor(new Date().toISOString());
    } catch (error) {
      logger.error('Pull error:', error);
      throw error;
    }
  }, []);

  const pushChanges = useCallback(async (userId: string) => {
    // Require valid authenticated user (user_id must be a valid UUID)
    if (!userId || !isValidUUID(userId)) {
      logger.log('[SYNC] Skipping push - user not authenticated or invalid user_id:', userId);
      return;
    }

    for (let attempt = 0; attempt < 2; attempt++) {
      const lastPushedAt = await readPushCursor();
      const timestamp = lastPushedAt || new Date(0).toISOString();

      await prePushChildIntegrityAuditAndCleanup({
        userId,
        supabase,
        pushCursorIso: timestamp,
        attemptIndex: attempt,
      });

      try {
      // Get local changes since last push, filtered by user_id
      // This includes deleted counters (they have updated_at set when deleted)
      let counters: Counter[] = [];
      try {
        counters = await query<Counter>(
          'SELECT * FROM lc_counters WHERE user_id = ? AND updated_at > ?',
          [userId, timestamp]
        );
      } catch (queryError) {
        const parsed = parseError(queryError);
        logger.error('[SYNC] Error querying counters:', parsed.message);
        throw new Error(`Failed to query counters: ${parsed.message}`);
      }

      // Simplified deletion sync: Get ALL deleted counters and always push them
      // This ensures deletions are always synced, regardless of timestamp
      let allDeletedCounters: Counter[] = [];
      try {
        const deletedCountersRaw = await query<Counter>(
          'SELECT * FROM lc_counters WHERE user_id = ? AND deleted_at IS NOT NULL AND deleted_at != ""',
          [userId]
        );
        // Filter to ensure deleted_at is valid
        allDeletedCounters = deletedCountersRaw.filter((c) => c.deleted_at && c.deleted_at.trim() !== '');
        
        if (allDeletedCounters.length > 0) {
          logger.log(`[SYNC] Found ${allDeletedCounters.length} deleted counter(s) to sync:`, 
            allDeletedCounters.map((c) => `${c.name} (id: ${c.id})`).join(', '));
        }
      } catch (queryError) {
        const parsed = parseError(queryError);
        logger.error('[SYNC] Error querying deleted counters:', parsed.message);
        throw queryError;
      }

      // Separate deleted and non-deleted counters from regular query
      const deletedInRegularQuery = counters.filter((c) => c.deleted_at && c.deleted_at.trim() !== '');
      const activeCounters = counters.filter((c) => !c.deleted_at);

      // Combine all deleted counters (from both queries) and remove duplicates
      const deletedCountersMap = new Map<string, Counter>();
      [...allDeletedCounters, ...deletedInRegularQuery].forEach((c) => {
        deletedCountersMap.set(c.id, c);
      });
      const uniqueDeletedCounters = Array.from(deletedCountersMap.values());

      // Merge active and deleted counters for pushing
      // Deleted counters take precedence if a counter appears in both lists
      const countersMap = new Map<string, Counter>();
      activeCounters.forEach((c) => countersMap.set(c.id, c));
      uniqueDeletedCounters.forEach((c) => {
        countersMap.set(c.id, c); // Overwrite with deleted version if it exists
      });

      // `allCounters` is built after we load dirty events/streaks/badges so we can include active
      // local parents referenced by those rows even when parent.updated_at <= push cursor (root fix
      // for SYNC_*_PARENT_MISSING divergence).

      let events: CounterEvent[] = [];
      try {
        const eventsRaw = await query<CounterEvent>(
          'SELECT * FROM lc_events WHERE user_id = ? AND updated_at > ?',
          [userId, timestamp]
        );
        
        // CRITICAL: Ensure mark_id is set from counter_id for compatibility
        // The mock DB stores events with counter_id, but sync code expects mark_id
        const eventsWithMarkId = eventsRaw.map((e: any) => ({
          ...e,
          mark_id: e.mark_id || e.counter_id, // Ensure mark_id is set
        }));
        
        // CRITICAL: Filter out events with invalid data and validate dates
        // This prevents trying to push invalid data to Supabase
        events = eventsWithMarkId.filter((e) => {
          // Soft-deleted rows (undo, orphan self-heal, etc.) must not enter the push parent check or upsert path.
          if ((e as any).deleted_at && String((e as any).deleted_at).trim() !== '') {
            return false;
          }
          // Validate user_id
          if (!e.user_id || !isValidUUID(e.user_id)) {
            logger.warn(`[SYNC] Filtering out event ${e.id} with invalid user_id: ${e.user_id}`);
            return false;
          }
          
          // CRITICAL: Validate event date is not in future (prevent date manipulation)
          // Allow 5 minute buffer for clock drift
          try {
            const eventDate = new Date(e.occurred_at);
            const now = new Date();
            const maxAllowedDate = new Date(now.getTime() + 5 * 60 * 1000); // 5 minutes buffer
            
            if (eventDate.getTime() > maxAllowedDate.getTime()) {
              logger.warn('[SECURITY] Event with future date detected - possible date manipulation', {
                eventId: e.id,
                eventDate: e.occurred_at,
                currentTime: now.toISOString(),
                difference: eventDate.getTime() - now.getTime(),
              });
              // Still push the event but log the warning - server will handle validation
            }
            
            // Validate occurred_local_date matches local date of occurred_at
            // This ensures timezone consistency
            const eventLocalDate = formatDate(eventDate);
            if (e.occurred_local_date && e.occurred_local_date !== eventLocalDate) {
              logger.warn(`[SYNC] Event ${e.id} has mismatched local_date - fixing: ${e.occurred_local_date} -> ${eventLocalDate}`);
              // Fix the local date to match the timestamp's local date
              e.occurred_local_date = eventLocalDate;
            }
          } catch (dateError) {
            logger.error(`[SYNC] Error validating event ${e.id} date:`, dateError);
            // Skip events with invalid dates
            return false;
          }
          
          return true;
        });
      } catch (queryError) {
        const parsed = parseError(queryError);
        logger.error(
          '[SYNC] Error querying local events for push — aborting push so last_synced_at is not advanced while events may be unsent',
          parsed.message,
        );
        throw queryError;
      }

      let streaks: CounterStreak[] = [];
      try {
        // Query streaks and map counter_id to mark_id for type compatibility
        const streaksRaw = await query<{ id: string; user_id: string; counter_id: string; mark_id?: string; current_streak: number; longest_streak: number; last_increment_date?: string; deleted_at?: string; created_at: string; updated_at: string }>(
          'SELECT * FROM lc_streaks WHERE user_id = ? AND updated_at > ?',
          [userId, timestamp]
        );
        // Map counter_id to mark_id for type compatibility
        // CRITICAL: Filter out any streaks with invalid user_id
        streaks = streaksRaw
          .filter((s) => {
            if ((s as any).deleted_at && String((s as any).deleted_at).trim() !== '') {
              return false;
            }
            if (!s.user_id || !isValidUUID(s.user_id)) {
              logger.warn(`[SYNC] Filtering out streak ${s.id} with invalid user_id: ${s.user_id}`);
              return false;
            }
            return true;
          })
          .map(s => ({
            ...s,
            mark_id: s.mark_id || s.counter_id, // Use mark_id if present, otherwise use counter_id
          } as CounterStreak));
      } catch (queryError) {
        const parsed = parseError(queryError);
        logger.error('[SYNC] Error querying streaks:', parsed.message);
        throw queryError;
      }

      let badges: MarkBadge[] = [];
      try {
        // Query badges and map counter_id to mark_id for type compatibility
        const badgesRaw = await query<{ id: string; user_id: string; counter_id: string; mark_id?: string; badge_code: string; progress_value: number; target_value: number; earned_at?: string; last_progressed_at?: string; deleted_at?: string; created_at: string; updated_at: string }>(
          'SELECT * FROM lc_badges WHERE user_id = ? AND updated_at > ?',
          [userId, timestamp]
        );
        // Map counter_id to mark_id for type compatibility
        // CRITICAL: Filter out any badges with invalid user_id (silently - no logging)
        badges = badgesRaw
          .filter((b) => {
            if ((b as any).deleted_at && String((b as any).deleted_at).trim() !== '') {
              return false;
            }
            // Silently filter out badges with invalid user_id (like "local-user")
            return b.user_id && isValidUUID(b.user_id);
          })
          .map(b => ({
            ...b,
            mark_id: b.mark_id || b.counter_id, // Use mark_id if present, otherwise use counter_id
          } as MarkBadge));
      } catch (queryError) {
        const parsed = parseError(queryError);
        logger.error('[SYNC] Error querying badges:', parsed.message);
        throw queryError;
      }

      const dirtyChildParentMarkIds = new Set<string>();
      for (const e of events) {
        const pid = (e as any).mark_id || (e as any).counter_id;
        if (pid && typeof pid === 'string' && isValidUUID(pid)) dirtyChildParentMarkIds.add(pid);
      }
      for (const s of streaks) {
        const pid = (s as any).mark_id || (s as any).counter_id;
        if (pid && typeof pid === 'string' && isValidUUID(pid)) dirtyChildParentMarkIds.add(pid);
      }
      for (const b of badges) {
        const pid = (b as any).mark_id || (b as any).counter_id;
        if (pid && typeof pid === 'string' && isValidUUID(pid)) dirtyChildParentMarkIds.add(pid);
      }

      const parentsMissingFromPushSet = [...dirtyChildParentMarkIds].filter((id) => !countersMap.has(id));
      if (parentsMissingFromPushSet.length > 0) {
        const chunk = 80;
        for (let i = 0; i < parentsMissingFromPushSet.length; i += chunk) {
          const slice = parentsMissingFromPushSet.slice(i, i + chunk);
          const ph = slice.map(() => '?').join(',');
          const rows = await query<Counter>(
            `SELECT * FROM lc_counters WHERE user_id = ? AND id IN (${ph}) AND (deleted_at IS NULL OR deleted_at = '')`,
            [userId, ...slice],
          );
          for (const r of rows) {
            countersMap.set(r.id, r);
          }
        }
        logger.log('[SYNC] Augmented counter push set with active parents required by dirty children', {
          dirtyChildParentCount: dirtyChildParentMarkIds.size,
          addedActiveParentsNotInDirtyCounterQuery: parentsMissingFromPushSet.filter((id) =>
            countersMap.has(id),
          ).length,
          sampleAddedParentIds: parentsMissingFromPushSet.filter((id) => countersMap.has(id)).slice(0, 5),
        });
      }

      const allCounters = Array.from(countersMap.values()).filter((c) => {
        if (!c.user_id || !isValidUUID(c.user_id)) {
          logger.warn('[SECURITY] Attempted sync with invalid user_id', {
            counterId: c.id,
            invalidUserId: c.user_id,
            timestamp: new Date().toISOString(),
          });
          return false;
        }
        return true;
      });

      const finalPushActiveParentIds = new Set(
        allCounters
          .filter((c) => !c.deleted_at || String(c.deleted_at).trim() === '')
          .map((c) => c.id),
      );

      if (allCounters.length > 0) {
        const deletedCount = allCounters.filter((c) => c.deleted_at).length;
        logger.log(`[SYNC] Pushing ${allCounters.length} counter(s) (${deletedCount} deleted) since ${timestamp}`);
        if (deletedCount > 0) {
          logger.log(
            `[SYNC] Deleted counters to push:`,
            allCounters.filter((c) => c.deleted_at).map((c) => `${c.name} (deleted_at: ${c.deleted_at})`).join(', '),
          );
        }
      }

      // Push counters FIRST (most critical - includes deletions)
      // This ensures deletions are synced before other operations
      let limitBlocked = false;
      /** Active counter ids included in successful upsert batches (deleted_at null in payload). */
      const activeParentIdsUpsertedThisRun = new Set<string>();
      if (allCounters.length > 0) {
        // Log deleted counters being pushed (use the uniqueDeletedCounters we already computed)
        const deletedInAllCounters = allCounters.filter((c) => c.deleted_at);
        if (deletedInAllCounters.length > 0) {
          logger.log(`[SYNC] Pushing ${deletedInAllCounters.length} deleted counter(s) to Supabase:`, 
            deletedInAllCounters.map((c) => `${c.name} (${c.id}, deleted_at: ${c.deleted_at})`).join(', '));
        }

        // Ensure deleted_at is explicitly included in the upsert
        // CRITICAL: Deleted counters must have deleted_at set and take absolute precedence
        // CRITICAL: Only include fields that exist in Supabase schema - exclude gating fields
        // The gating fields (gated, gate_type, min_interval_minutes, max_per_day) are local-only
        // until the SUPABASE_GATING_MIGRATION.sql is run on the database
        const countersToPush = allCounters.map((c) => {
          // If this counter was locally deleted, ensure deleted_at is set with current timestamp
          // This prevents server from having a non-deleted version
          const isDeleted = c.deleted_at && c.deleted_at.trim() !== '';
          
          // Explicitly pick only the fields that exist in Supabase
          // Excludes: gated, gate_type, min_interval_minutes, max_per_day (local-only until migration)
          return {
            id: c.id,
            user_id: c.user_id,
            name: c.name,
            emoji: c.emoji,
            color: c.color,
            unit: c.unit,
            enable_streak: c.enable_streak ? true : false,
            sort_index: c.sort_index,
            total: c.total,
            last_activity_date: c.last_activity_date,
            created_at: c.created_at,
            updated_at: c.updated_at,
            deleted_at: isDeleted ? (c.deleted_at || new Date().toISOString()) : null,
            dailyTarget: normalizeDailyTargetInput((c as Counter & { dailyTarget?: number | null }).dailyTarget),
          };
        });
        
        // Sort so deleted counters are pushed first to ensure server updates correctly
        countersToPush.sort((a, b) => {
          const aDeleted = a.deleted_at && a.deleted_at.trim() !== '';
          const bDeleted = b.deleted_at && b.deleted_at.trim() !== '';
          if (aDeleted && !bDeleted) return -1; // Deleted first
          if (!aDeleted && bDeleted) return 1;
          return 0;
        });

        logger.log(`[SYNC] Upserting ${countersToPush.length} counter(s) to Supabase...`);
        
        // Batch large upserts to prevent timeout errors
        const BATCH_SIZE = 100;
        const counterBatches = batchArray(countersToPush, BATCH_SIZE);

        let supportsRemoteDailyTarget = true;
        for (let i = 0; i < counterBatches.length; i++) {
          const batch = counterBatches[i];
          logger.log(`[SYNC] Upserting batch ${i + 1}/${counterBatches.length} (${batch.length} counter(s))...`);

          const batchPayload = supportsRemoteDailyTarget
            ? batch
            : batch.map(({ dailyTarget: _dailyTarget, ...rest }) => rest);

          let { error: countersError } = await supabase
            .from('counters')
            .upsert(batchPayload, { onConflict: 'id' });

          if (
            countersError?.code === 'PGRST204' &&
            typeof countersError.message === 'string' &&
            countersError.message.includes('dailyTarget')
          ) {
            logger.warn('[SYNC] Remote counters table missing dailyTarget column; retrying without it');
            supportsRemoteDailyTarget = false;
            const legacyBatch = batch.map(({ dailyTarget: _dailyTarget, ...rest }) => rest);
            const retryResult = await supabase.from('counters').upsert(legacyBatch, { onConflict: 'id' });
            countersError = retryResult.error;
          }

          if (countersError) {
            if (isProLimitError(countersError)) {
              logger.warn('[SYNC] Free counter limit enforced by server', countersError);
              setSyncState((prev) => ({
                ...prev,
                error:
                  'Sync blocked: upgrade to Livra+ to keep more than 3 active marks in cloud. Your extra marks remain on this device.',
              }));
              limitBlocked = true;
              break;
            }
            const parsed = parseError(countersError);
            if (parsed.isNetworkError || parsed.shouldRetry) {
              logger.error(
                `[SYNC] Counters batch ${i + 1}/${counterBatches.length} failed (network/timeout) — aborting push so last_synced_at is not advanced past unsent rows`,
                parsed.message,
              );
              throw countersError;
            }
            logger.error(`[SYNC] Error pushing counters batch ${i + 1} to Supabase:`, countersError);
            logger.error(`[SYNC] Failed counters in batch:`, batch.map((c) => ({ id: c.id, name: c.name, deleted_at: c.deleted_at })));
            throw countersError;
          } else {
            for (const row of batch) {
              if (row.deleted_at == null || String(row.deleted_at).trim() === '') {
                activeParentIdsUpsertedThisRun.add(row.id);
              }
            }
            logger.log(`[SYNC] ✅ Successfully pushed batch ${i + 1}/${counterBatches.length}`);
          }
        }

        if (!limitBlocked) {
          if (deletedInAllCounters.length > 0) {
            logger.log(`[SYNC] ✅ Successfully pushed ${deletedInAllCounters.length} deleted counter(s) to Supabase`);
          } else {
            logger.log(`[SYNC] ✅ Successfully pushed ${countersToPush.length} counter(s) to Supabase`);
          }
        }
      }

      if (limitBlocked) {
        throw new Error('SYNC_PRO_COUNTER_LIMIT');
      }

      /** Parents allowed for child upsert this run: successful active upserts ∪ remote active read (chunked). */
      const confirmedRemoteActiveParentsForChildren = new Set<string>(activeParentIdsUpsertedThisRun);
      const remoteVerifyReturnedIds = new Set<string>();
      let postCounterVerifyCompletedAllChunks = true;
      const unionParentIds = [...dirtyChildParentMarkIds];
      if (unionParentIds.length > 0) {
        const CHUNK = 100;
        for (let i = 0; i < unionParentIds.length; i += CHUNK) {
          const slice = unionParentIds.slice(i, i + CHUNK);
          const { data: verifyRows, error: verifyErr } = await supabase
            .from('counters')
            .select('id')
            .eq('user_id', userId)
            .in('id', slice)
            .is('deleted_at', null);
          if (verifyErr) {
            postCounterVerifyCompletedAllChunks = false;
            logger.warn('[SYNC] Post-counter parent verify query failed; child checks use upsert-union only', {
              message: verifyErr.message,
            });
            break;
          }
          (verifyRows || []).forEach((r: { id: string }) => {
            remoteVerifyReturnedIds.add(r.id);
            confirmedRemoteActiveParentsForChildren.add(r.id);
          });
        }
      }
      let upsertedActiveMissingFromVerifySelect = 0;
      if (postCounterVerifyCompletedAllChunks) {
        for (const id of activeParentIdsUpsertedThisRun) {
          if (dirtyChildParentMarkIds.has(id) && !remoteVerifyReturnedIds.has(id)) {
            upsertedActiveMissingFromVerifySelect += 1;
          }
        }
      }
      logger.log('[SYNC] parent confirmation for dirty children (post-counter-upsert)', {
        distinctParentsFromDirtyChildren: unionParentIds.length,
        finalPushActiveParentCount: finalPushActiveParentIds.size,
        upsertedActiveParentIdsCount: activeParentIdsUpsertedThisRun.size,
        mergedConfirmedParentCount: confirmedRemoteActiveParentsForChildren.size,
        postVerifySelectReturnedCount: remoteVerifyReturnedIds.size,
        upsertedActiveMissingFromVerifySelect,
        sampleConfirmedParentIds: [...confirmedRemoteActiveParentsForChildren].slice(0, 5),
      });

      const postOrphan = await postUpsertOrphanChildCleanup({
        userId,
        confirmedRemoteActiveParentIds: confirmedRemoteActiveParentsForChildren,
        events,
        streaks,
        badges,
      });
      if (postOrphan.tombstonedEvents + postOrphan.tombstonedStreaks + postOrphan.tombstonedBadges > 0) {
        logger.warn('[SYNC] post-upsert orphan cleanup summary', {
          tombstonedEvents: postOrphan.tombstonedEvents,
          tombstonedStreaks: postOrphan.tombstonedStreaks,
          tombstonedBadges: postOrphan.tombstonedBadges,
          remainingDirtyEvents: events.length,
          remainingDirtyStreaks: streaks.length,
          remainingDirtyBadges: badges.length,
        });
      }

      // Push events, streaks, and badges in parallel for better performance
      const pushPromises: Promise<void>[] = [];

      if (events.length > 0) {
        pushPromises.push(
          (async () => {
            try {
              // Batch large upserts to prevent timeout errors
              const BATCH_SIZE = 100;
              
              // Log all events before filtering for debugging
              logger.log('[SYNC] Events before mark_id filtering:', {
                total: events.length,
                sample: events.slice(0, 3).map(e => ({
                  id: e.id,
                  mark_id: e.mark_id,
                  counter_id: (e as any).counter_id,
                  user_id: e.user_id,
                  event_type: e.event_type,
                })),
              });
              
              // Filter out events without mark_id before mapping (mark_id is required for Supabase mapping)
              const validEvents = events.filter((e) => 
                e.mark_id && 
                typeof e.mark_id === 'string' && 
                e.mark_id.trim() !== '' &&
                isValidUUID(e.mark_id)
              );
              
              if (validEvents.length !== events.length) {
                logger.error('[SYNC] Dirty local events include invalid mark_id — refusing to advance push cursor');
                throw new Error('SYNC_DIRTY_EVENTS_INVALID_MARK_ID');
              }

              const eventMarkIds = [...new Set(validEvents.map((e) => e.mark_id).filter(Boolean) as string[])];
              let eventsToPush = validEvents;
              if (eventMarkIds.length > 0) {
                const missingParent = validEvents.filter(
                  (e) => !e.mark_id || !confirmedRemoteActiveParentsForChildren.has(e.mark_id),
                );
                if (missingParent.length > 0) {
                  const missParentIds = [...new Set(missingParent.map((e) => e.mark_id as string))];
                  const diag = await classifyMissingParentsForSyncLog(
                    userId,
                    missParentIds,
                    parentsMissingFromPushSet,
                    finalPushActiveParentIds,
                    activeParentIdsUpsertedThisRun,
                  );
                  const missingWithParentInFinalPush = missingParent.filter(
                    (e) => e.mark_id && finalPushActiveParentIds.has(e.mark_id),
                  ).length;
                  logger.error('[SYNC] Dirty events reference parent not confirmed active remotely after counter upsert', {
                    missingEventRows: missingParent.length,
                    distinctMissingParentIds: missParentIds.length,
                    missingChildrenWithParentInFinalCounterPush: missingWithParentInFinalPush,
                    classification: diag.counts,
                    sampleParentIds: missParentIds.slice(0, 5),
                    sampleEventIds: missingParent.slice(0, 5).map((e) => e.id),
                  });
                  throw new Error('SYNC_EVENT_PARENT_MISSING');
                }
                eventsToPush = validEvents;
              }

              if (eventsToPush.length === 0) {
                return;
              }
              
              // Log events being pushed
              logger.log('[SYNC] Pushing events to Supabase:', {
                count: eventsToPush.length,
                sample: eventsToPush.slice(0, 3).map(e => ({
                  id: e.id,
                  mark_id: e.mark_id,
                  event_type: e.event_type,
                  occurred_at: e.occurred_at,
                })),
              });
              
              // Map mark_id to counter_id for Supabase using type-safe mapper
              const eventsForSupabase = mapEventsToSupabase(eventsToPush.map((e) => ({ ...e, meta: e.meta || {} })));
              const eventBatches = batchArray(eventsForSupabase, BATCH_SIZE);
              
              for (let i = 0; i < eventBatches.length; i++) {
                const batch = eventBatches[i];
                const { data, error } = await supabase
                  .from('counter_events')
                  .upsert(batch)
                  .select('id');
                
                if (error) {
                  const parsed = parseError(error);
                  logger.error(`[SYNC] ❌ Error pushing events batch ${i + 1}/${eventBatches.length}:`, {
                    error: error.message,
                    code: error.code,
                    details: error.details,
                  });
                  if (parsed.isNetworkError || parsed.shouldRetry) {
                    logger.error(
                      `[SYNC] Events batch ${i + 1}/${eventBatches.length} failed (network/timeout) — aborting push; last_synced_at will not advance until all batches succeed`,
                      parsed.message,
                    );
                  }
                  throw error;
                }
                
                // Log success
                logger.log(`[SYNC] ✅ Events batch ${i + 1}/${eventBatches.length} pushed successfully:`, {
                  batchSize: batch.length,
                  insertedCount: data?.length || 0,
                });
              }
              
              logger.log(`[SYNC] ✅ All ${eventsToPush.length} events pushed to Supabase successfully`);
            } catch (error) {
              const parsed = parseError(error);
              if (parsed.isNetworkError || parsed.shouldRetry) {
                logger.error(
                  '[SYNC] Event push failed (network/timeout) — failing sync so cursor is not advanced past unsent events',
                  parsed.message,
                );
              }
              throw error;
            }
          })()
        );
      }

      if (streaks.length > 0) {
        const streaksMap = new Map<string, CounterStreak>();
        for (const streak of streaks) {
          const existing = streaksMap.get(streak.mark_id);
          if (!existing || new Date(streak.updated_at) > new Date(existing.updated_at)) {
            streaksMap.set(streak.mark_id, streak);
          }
        }
        const uniqueStreaks = Array.from(streaksMap.values());

        const streaksWithValidIds = uniqueStreaks.filter(
          (s) =>
            s.mark_id &&
            typeof s.mark_id === 'string' &&
            s.mark_id.trim() !== '' &&
            isValidUUID(s.mark_id),
        );

        if (streaksWithValidIds.length !== uniqueStreaks.length) {
          throw new Error('SYNC_DIRTY_STREAKS_INVALID_MARK_ID');
        }

        const streakMissing = streaksWithValidIds.filter(
          (s) => s.mark_id && !confirmedRemoteActiveParentsForChildren.has(s.mark_id),
        );
        if (streakMissing.length > 0) {
          const missParentIds = [...new Set(streakMissing.map((s) => s.mark_id as string))];
          const diag = await classifyMissingParentsForSyncLog(
            userId,
            missParentIds,
            parentsMissingFromPushSet,
            finalPushActiveParentIds,
            activeParentIdsUpsertedThisRun,
          );
          const missingWithParentInFinalPush = streakMissing.filter(
            (s) => s.mark_id && finalPushActiveParentIds.has(s.mark_id),
          ).length;
          logger.error('[SYNC] Dirty streak rows reference parent not confirmed active remotely after counter upsert', {
            missingStreakRows: streakMissing.length,
            distinctMissingParentIds: missParentIds.length,
            missingChildrenWithParentInFinalCounterPush: missingWithParentInFinalPush,
            classification: diag.counts,
            sampleParentIds: missParentIds.slice(0, 5),
            sampleStreakIds: streakMissing.slice(0, 5).map((s) => s.id),
          });
          throw new Error('SYNC_STREAK_PARENT_MISSING');
        }

        pushPromises.push(
          (async () => {
            const BATCH_SIZE = 100;
            const streaksForSupabase = mapStreaksToSupabase(streaksWithValidIds);
            const streakBatches = batchArray(streaksForSupabase, BATCH_SIZE);
            for (let i = 0; i < streakBatches.length; i++) {
              const batch = streakBatches[i];
              let { error } = await supabase.from('counter_streaks').upsert(batch, {
                onConflict: batch[0]?.id ? 'id' : 'counter_id',
                ignoreDuplicates: false,
              });
              if (error?.code === '42P10' && batch.every((s) => s.id)) {
                const retry = await supabase.from('counter_streaks').upsert(batch, {
                  onConflict: 'id',
                  ignoreDuplicates: false,
                });
                error = retry.error;
              }
              if (error) throw error;
            }
          })(),
        );
      }

      if (badges.length > 0) {
        const badgesMap = new Map<string, MarkBadge>();
        for (const badge of badges) {
          const key = `${badge.mark_id}:${badge.badge_code}`;
          const existing = badgesMap.get(key);
          if (!existing || new Date(badge.updated_at) > new Date(existing.updated_at)) {
            badgesMap.set(key, badge);
          }
        }
        const uniqueBadges = Array.from(badgesMap.values());

        const badgesWithValidIds = uniqueBadges.filter(
          (b) =>
            b.mark_id &&
            typeof b.mark_id === 'string' &&
            b.mark_id.trim() !== '' &&
            isValidUUID(b.mark_id) &&
            b.badge_code,
        );

        if (badgesWithValidIds.length !== uniqueBadges.length) {
          throw new Error('SYNC_DIRTY_BADGES_INVALID_IDS');
        }

        const badgeMissing = badgesWithValidIds.filter(
          (b) => b.mark_id && !confirmedRemoteActiveParentsForChildren.has(b.mark_id),
        );
        if (badgeMissing.length > 0) {
          const missParentIds = [...new Set(badgeMissing.map((b) => b.mark_id as string))];
          const diag = await classifyMissingParentsForSyncLog(
            userId,
            missParentIds,
            parentsMissingFromPushSet,
            finalPushActiveParentIds,
            activeParentIdsUpsertedThisRun,
          );
          const missingWithParentInFinalPush = badgeMissing.filter(
            (b) => b.mark_id && finalPushActiveParentIds.has(b.mark_id),
          ).length;
          logger.error('[SYNC] Dirty badge rows reference parent not confirmed active remotely after counter upsert', {
            missingBadgeRows: badgeMissing.length,
            distinctMissingParentIds: missParentIds.length,
            missingChildrenWithParentInFinalCounterPush: missingWithParentInFinalPush,
            classification: diag.counts,
            sampleParentIds: missParentIds.slice(0, 5),
            sampleBadgeIds: badgeMissing.slice(0, 5).map((b) => b.id),
            sampleBadgeKeys: badgeMissing.slice(0, 5).map((b) => `${b.mark_id}:${b.badge_code}`),
          });
          throw new Error('SYNC_BADGE_PARENT_MISSING');
        }

        pushPromises.push(
          (async () => {
            const BATCH_SIZE = 100;
            const badgesForSupabase = mapBadgesToSupabase(badgesWithValidIds).map((badge) => ({
              ...badge,
              user_id: userId,
            }));
            const badgeBatches = batchArray(badgesForSupabase, BATCH_SIZE);
            for (let i = 0; i < badgeBatches.length; i++) {
              const batch = badgeBatches[i];
              const { error } = await supabase.from('counter_badges').upsert(batch, {
                onConflict: 'counter_id,badge_code',
                ignoreDuplicates: false,
              });
              if (error) {
                if (isMissingSupabaseTable(error, 'counter_badges')) {
                  throw new Error('SYNC_COUNTER_BADGES_TABLE_MISSING');
                }
                throw error;
              }
            }
          })(),
        );
      }

      if (pushPromises.length > 0) {
        await Promise.all(pushPromises);
      }

      await writePushCursor(new Date().toISOString());
      logger.log('[SYNC] integrity: push attempt completed successfully', { attemptIndex: attempt });
      return;
    } catch (error) {
      if (attempt === 0 && isParentMissingSyncError(error)) {
        logger.warn('[SYNC] pushChanges: parent-missing — retrying full push once after audit/cleanup', {
          code: error instanceof Error ? error.message : String(error),
        });
        continue;
      }
      if (attempt === 1 && isParentMissingSyncError(error)) {
        logger.error('[SYNC] integrity: push still failing after retry (parent-missing)', {
          code: error instanceof Error ? error.message : String(error),
        });
      }
      const parsed = parseError(error || 'Unknown error occurred during push');
      if (parsed.isNetworkError || parsed.shouldRetry) {
        logger.error(
          '[SYNC] Push failed (network/timeout) — sync will not advance last_synced_at; retry on next connection',
          parsed.message,
        );
      } else {
        let errorMsg = 'Unknown error';
        let errorDetails = '';

        if (error instanceof Error) {
          errorMsg = error.message || 'Unknown error';
          errorDetails = error.stack || '';
        } else if (typeof error === 'string') {
          errorMsg = error;
        } else if (error && typeof error === 'object') {
          errorMsg = (error as any).message || (error as any).error?.message || JSON.stringify(error);
          if ((error as any).error) {
            errorDetails = JSON.stringify((error as any).error);
          }
        }

        if (errorDetails) {
          logger.error(`[SYNC] Push error: ${errorMsg}`, errorDetails);
        } else {
          logger.error(`[SYNC] Push error: ${errorMsg}`);
        }
      }

      let errorMsg = 'Unknown push error';
      if (error instanceof Error) {
        errorMsg = error.message || errorMsg;
      } else if (typeof error === 'string') {
        errorMsg = error;
      } else if (error && typeof error === 'object') {
        errorMsg =
          (error as any).message || (error as any).error?.message || JSON.stringify(error) || errorMsg;
      }
      throw error instanceof Error ? error : new Error(errorMsg);
    }
    }
  }, []);

  // Throttle sync to prevent excessive I/O - minimum 30 seconds between syncs
  const lastSyncTimeRef = useRef<number>(0);
  const SYNC_THROTTLE_MS = 30000; // 30 seconds
  const SYNC_DEBOUNCE_MS = 500; // 500ms debounce for rapid button taps
  
  // Debounce ref for rapid sync requests
  const syncDebounceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  type PendingSyncSettle = { resolve: () => void; reject: (reason: unknown) => void };
  const pendingSyncRef = useRef<PendingSyncSettle | null>(null);

  const executeSync = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      logger.log('No user logged in, skipping sync');
      return;
    }

    setSyncState((prev) => ({ ...prev, isSyncing: true, error: null }));

      try {
        await Promise.race([
          (async () => {
        await migrateLegacySyncCursor();

        // Push first, then pull - this ensures deletions are synced to Supabase
        // before pulling, preventing deleted counters from being restored
        await pushChanges(user.id);
        
        // Small delay to ensure Supabase has processed the push
        // This is especially important for deletions
        await new Promise(resolve => setTimeout(resolve, 100));
        
        await pullChanges(user.id);

        const maintenanceWarnings: SyncMaintenanceWarningCode[] = [];
        let duplicateMarkNameGroupCount = 0;
        let lastStreakRecomputeSource: StreakRecomputeSourceLabel = 'none';

        const { getAppDate } = await import('../lib/appDate');
        const streakResult = await recomputeStreaksAfterSyncFromSqlite(user.id, getAppDate());
        lastStreakRecomputeSource = streakResult.source;
        if (!streakResult.ok) {
          maintenanceWarnings.push('MAINT_STREAK_RECOMPUTE_FAILED');
          logger.warn('[SYNC] Post-sync streak recompute from SQLite failed');
        } else {
          logger.log(
            `[SYNC] Streak recompute source=sqlite marks=${streakResult.marksProcessed} source=${streakResult.source}`,
          );
        }

        try {
          const [counterCleanup, orphanCleanup, eventCleanup] = await Promise.all([
            cleanupDuplicateCounters(user.id),
            cleanupOrphanedStreaksAndBadges(user.id),
            cleanupOrphanedEvents(user.id),
          ]);

          if (counterCleanup.duplicatesByID + counterCleanup.duplicatesByName > 0) {
            logger.log(
              `[SYNC] Cleaned up ${counterCleanup.duplicatesByID + counterCleanup.duplicatesByName} duplicate counter(s) after sync`,
            );
          }

          if (orphanCleanup.deletedStreaks > 0 || orphanCleanup.deletedBadges > 0) {
            logger.log(
              `[SYNC] Cleaned up ${orphanCleanup.deletedStreaks} orphaned streak(s) and ${orphanCleanup.deletedBadges} orphaned badge(s) after sync`,
            );
          }

          if (eventCleanup.deletedEvents > 0) {
            logger.log(`[SYNC] Cleaned up ${eventCleanup.deletedEvents} orphaned event(s) after sync`);
          }

          let orphanBadgeCleanupPartial = false;
          try {
            const { data: supabaseCounters, error: supabaseError } = await supabase
              .from('counters')
              .select('id')
              .eq('user_id', user.id)
              .is('deleted_at', null);

            if (!supabaseError && supabaseCounters) {
              const supabaseCounterIds = new Set(supabaseCounters.map((c) => c.id));

              const allLocalBadges = await query<{ id: string; counter_id: string }>(
                'SELECT id, counter_id FROM lc_badges WHERE user_id = ? AND deleted_at IS NULL',
                [user.id],
              );

              const orphanedBadges = allLocalBadges.filter((b) => !supabaseCounterIds.has(b.counter_id));

              if (orphanedBadges.length > 0) {
                const t = new Date().toISOString();
                let deletedCount = 0;

                for (const badge of orphanedBadges) {
                  try {
                    await execute(
                      'UPDATE lc_badges SET deleted_at = ?, updated_at = ? WHERE id = ?',
                      [t, t, badge.id],
                    );
                    deletedCount++;
                  } catch (error) {
                    logger.warn('[SYNC] Orphan badge cleanup row failed');
                    orphanBadgeCleanupPartial = true;
                  }
                }

                if (deletedCount > 0) {
                  logger.log(`[SYNC] Cleaned up ${deletedCount} orphaned badge(s) (remote missing counter)`);
                }
              }
            }
          } catch (badgeCleanupError) {
            logger.warn('[SYNC] Orphan badge cleanup batch failed');
            orphanBadgeCleanupPartial = true;
          }

          if (orphanBadgeCleanupPartial) {
            maintenanceWarnings.push('MAINT_ORPHAN_BADGE_CLEANUP_PARTIAL');
          }
        } catch (cleanupError) {
          logger.error('[SYNC] Error during post-sync cleanup:', cleanupError);
          maintenanceWarnings.push('MAINT_CLEANUP_FAILED');
        }

        try {
          const dupGroups = await detectDuplicateMarkNameGroups(user.id);
          duplicateMarkNameGroupCount = dupGroups.length;
          if (dupGroups.length > 0) {
            logger.log('[SYNC] Duplicate mark names (different ids)', {
              groupCount: dupGroups.length,
              totalExtraMarks: dupGroups.reduce((s, g) => s + g.markCount, 0),
            });
          }
        } catch {
          maintenanceWarnings.push('MAINT_DUPLICATE_NAME_SCAN_FAILED');
          duplicateMarkNameGroupCount = 0;
        }

        logger.log('[SYNC_HEALTH]', {
          streakSource: lastStreakRecomputeSource,
          duplicateNameGroups: duplicateMarkNameGroupCount,
          maintenanceWarningCount: maintenanceWarnings.length,
        });

        const now = new Date().toISOString();
        await writeLastFullSyncDisplayAt(now);
        await writeSyncDiagSnapshot({
          coreSyncedAtIso: now,
          maintenanceWarnings,
          duplicateMarkNameGroupCount,
          lastStreakRecomputeSource,
        });
        lastSyncTimeRef.current = Date.now();

        setSyncState((prev) => ({
          ...prev,
          isSyncing: false,
          lastSyncedAt: now,
          error: null,
          maintenanceWarnings,
          duplicateMarkNameGroupCount,
          lastStreakRecomputeSource,
        }));
        
        // Don't reload counters here - the store is already managed correctly
        // Reloading could bring back deleted counters if there's a timing issue
        // Instead, only reload counters that were actually merged during pullChanges
          })(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(createSyncExecutionTimeoutError()), SYNC_EXECUTION_TIMEOUT_MS),
          ),
        ]);
      } catch (error) {
        const parsedError = parseError(error || 'Unknown error occurred during sync');
        const errorMessage = (parsedError.isNetworkError || parsedError.shouldRetry)
          ? `${parsedError.message}. Sync will retry automatically.`
          : parsedError.message;
        
        setSyncState((prev) => ({
          ...prev,
          isSyncing: false,
          error: errorMessage,
          maintenanceWarnings: [],
        }));
        
        // Log the error with context (but don't log full HTML responses)
        if (parsedError.isNetworkError || parsedError.shouldRetry) {
          logger.warn('[SYNC] Network/timeout error during sync:', parsedError.message);
        } else {
          // Extract error message properly
          let errorMsg = 'Unknown error';
          let errorDetails = '';
          
          if (error instanceof Error) {
            errorMsg = error.message || 'Unknown error';
            errorDetails = error.stack || '';
          } else if (typeof error === 'string') {
            errorMsg = error;
          } else if (error && typeof error === 'object') {
            // Try to extract message from error object
            errorMsg = (error as any).message || (error as any).error?.message || JSON.stringify(error);
            if ((error as any).error) {
              errorDetails = JSON.stringify((error as any).error);
            }
          }
          
          // Log with proper serialization
          if (errorDetails) {
            logger.error(`[SYNC] Error during sync: ${errorMsg}`, errorDetails);
          } else {
            logger.error(`[SYNC] Error during sync: ${errorMsg}`);
          }
        }
        
        // Store persistent errors for retry (only for non-network errors that failed after max attempts)
        // Network errors will automatically retry on next sync without needing a queue
        if (!parsedError.isNetworkError && !parsedError.shouldRetry) {
          // For critical errors, log them for potential manual review
          logger.error('[SYNC] Persistent sync error (non-network):', errorMessage);
          
          // Create a proper Error object if it's not already one
          const errorToThrow = error instanceof Error 
            ? error 
            : new Error(errorMessage || 'Unknown sync error');
          throw errorToThrow;
        }
        
        // For network/timeout errors, don't throw - allow the app to continue
        // These will automatically retry on the next sync attempt
        // The error is logged in syncState and can be checked by UI
      }
  }, [pullChanges, pushChanges]);

  const sync = useCallback(
    async (opts?: { bypassThrottle?: boolean }) => {
      return new Promise<void>((resolve, reject) => {
        if (syncDebounceTimeoutRef.current) {
          clearTimeout(syncDebounceTimeoutRef.current);
        }

        pendingSyncRef.current = { resolve, reject };

        syncDebounceTimeoutRef.current = setTimeout(async () => {
          syncDebounceTimeoutRef.current = null;
          const settle = pendingSyncRef.current;
          pendingSyncRef.current = null;
          if (!settle) return;

          const nowMs = Date.now();
          const timeSinceLastSync = nowMs - lastSyncTimeRef.current;
          if (
            !opts?.bypassThrottle &&
            timeSinceLastSync < SYNC_THROTTLE_MS &&
            lastSyncTimeRef.current > 0
          ) {
            logger.log(
              `[SYNC] Throttling sync request (${Math.round((SYNC_THROTTLE_MS - timeSinceLastSync) / 1000)}s remaining)`,
            );
            settle.resolve();
            return;
          }

          if (syncLockRef.current) {
            try {
              await syncLockRef.current;
              settle.resolve();
            } catch (error) {
              settle.reject(error instanceof Error ? error : new Error(String(error)));
            }
            return;
          }

          try {
            syncLockRef.current = executeSync();
            await syncLockRef.current;
            settle.resolve();
          } catch (error) {
            settle.reject(error instanceof Error ? error : new Error(String(error)));
          } finally {
            syncLockRef.current = null;
          }
        }, SYNC_DEBOUNCE_MS);
      });
    },
    [executeSync],
  );

  syncFnRef.current = sync;

  // Listen for app state changes to trigger sync when coming back online
  useEffect(() => {
    let mounted = true;
    const subscription = AppState.addEventListener('change', async (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active' && mounted) {
        // App came to foreground - check if user is authenticated and trigger sync
        // This ensures offline operations are synced when connection is restored
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (user && user.id && isValidUUID(user.id)) {
            // Small delay to ensure network is ready
            setTimeout(() => {
              if (mounted) {
                sync().catch((error) => {
                  // Don't log network errors as errors - they're expected when offline
                  const parsed = parseError(error);
                  if (!parsed.isNetworkError && !parsed.shouldRetry) {
                    logger.error('[SYNC] Error syncing on app state change:', error);
                  }
                });
              }
            }, 1000);
          }
        } catch (error) {
          // Silently handle auth errors - user might not be logged in
        }
      }
    });

    return () => {
      mounted = false;
      subscription.remove();
    };
  }, [sync]);

  return {
    sync,
    syncState,
  };
};

// Helper functions for merging data with conflict resolution

/** Remote delete wins over an active local row when server updated_at is newer (same counter id only). */
const mergeCounterTombstoneFromRemote = async (counter: Counter): Promise<void> => {
  const serverDeleted = counter.deleted_at && String(counter.deleted_at).trim() !== '';
  if (!serverDeleted) return;

  const existing = await queryFirst<Counter>('SELECT * FROM lc_counters WHERE id = ?', [counter.id]);
  if (!existing) return;

  const remoteTime = new Date(counter.updated_at).getTime();
  const localTime = new Date(existing.updated_at).getTime();

  if (existing.deleted_at && existing.deleted_at.trim() !== '') {
    if (remoteTime > localTime) {
      await execute('UPDATE lc_counters SET updated_at = ? WHERE id = ?', [counter.updated_at, counter.id]);
    }
    return;
  }

  if (remoteTime > localTime) {
    await execute(
      'UPDATE lc_counters SET deleted_at = ?, updated_at = ? WHERE id = ?',
      [counter.deleted_at, counter.updated_at, counter.id],
    );
    logger.log(`[SYNC] Applied remote tombstone for counter ${counter.id}`);
  }
};

const mergeCounter = async (counter: Counter, existingCountersMap?: Map<string, { id: string; deleted_at: string | null; updated_at: string }>): Promise<boolean> => {
  // Skip deleted counters from remote - don't merge them into local database
  if (counter.deleted_at) {
    return false;
  }

  // Use provided map if available, otherwise query
  let existing: Counter | null = null;
  if (existingCountersMap) {
    const existingData = existingCountersMap.get(counter.id);
    if (existingData) {
      // Need to fetch full counter if it exists
      existing = await queryFirst<Counter>('SELECT * FROM lc_counters WHERE id = ?', [counter.id]);
    }
  } else {
    existing = await queryFirst<Counter>('SELECT * FROM lc_counters WHERE id = ?', [counter.id]);
  }

  // If counter exists locally and is marked as deleted, skip it
  // This prevents deleted counters from being restored when syncing
  if (existing && existing.deleted_at) {
    return false;
  }

  // Merge uses updated_at: remote row is applied to local only when remoteTime > localTime
  // (see branch below); pending writes and totals have additional guards.
  if (existing && existing.updated_at && counter.updated_at) {
    try {
      const localUpdated = new Date(existing.updated_at).getTime();
      const serverUpdated = new Date(counter.updated_at).getTime();

      if (localUpdated > serverUpdated + 1000) {
        logger.warn('[SYNC] Potential conflict detected - local version is newer', {
          counterId: counter.id,
          counterName: counter.name,
          localUpdated: existing.updated_at,
          serverUpdated: counter.updated_at,
          difference: localUpdated - serverUpdated,
        });
      }
    } catch (dateError) {
      logger.error('[SYNC] Error comparing timestamps for conflict detection:', dateError);
    }
  }

  if (!existing) {
    // Check if counter was deleted (use map if available to avoid extra query)
    if (existingCountersMap) {
      const anyRecord = existingCountersMap.get(counter.id);
      if (anyRecord && anyRecord.deleted_at) {
        logger.log(`[SYNC] mergeCounter: Skipping insert of deleted counter ${counter.id} (${counter.name})`);
        return false;
      }
    } else {
      // Fallback: query if map not provided
      const anyRecord = await queryFirst<{ deleted_at: string | null; id: string }>(
        'SELECT deleted_at, id FROM lc_counters WHERE id = ?',
        [counter.id]
      );
      if (anyRecord && anyRecord.id === counter.id && anyRecord.deleted_at) {
        logger.log(`[SYNC] mergeCounter: Skipping insert of deleted counter ${counter.id} (${counter.name})`);
        return false;
      }
    }
    
    // CRITICAL: Check for duplicate by name + user_id BEFORE inserting
    // This prevents creating duplicate counters with different IDs but same name
    const duplicateByName = await queryFirst<Counter>(
      'SELECT * FROM lc_counters WHERE user_id = ? AND LOWER(name) = LOWER(?) AND deleted_at IS NULL',
      [counter.user_id, counter.name]
    );
    
    if (duplicateByName) {
      // Never merge two different UUIDs by display name — would orphan events/streaks keyed by id.
      logger.warn(
        `[SYNC] mergeCounter: skipping insert — same-name mark exists with different id (local ${duplicateByName.id}, remote ${counter.id}). Resolve manually if needed.`,
      );
      return false;
    }
    
    // Insert new counter only if it's not deleted and not a duplicate
    await execute(
      `INSERT INTO lc_counters (
        id, user_id, name, emoji, color, unit, enable_streak,
        sort_index, total, last_activity_date, deleted_at, created_at, updated_at, dailyTarget
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        counter.id,
        counter.user_id,
        counter.name,
        counter.emoji,
        counter.color,
        counter.unit,
        counter.enable_streak ? 1 : 0,
        counter.sort_index,
        counter.total,
        counter.last_activity_date,
        counter.deleted_at,
        counter.created_at,
        counter.updated_at,
        normalizeDailyTargetInput((counter as any).dailyTarget),
      ]
    );
    return true; // Counter was inserted
  } else {
    // Update if remote is newer, but NEVER restore a deleted counter
    // If local counter is deleted, keep it deleted regardless of remote state
    if (existing.deleted_at) {
      // Counter is deleted locally - don't restore it, even if remote is "newer"
      logger.log(`[SYNC] mergeCounter: Skipping update of deleted counter ${counter.id} (${counter.name}) - local counter is deleted`);
      return false;
    }
    
    // Additional safety: if the incoming counter has deleted_at set, don't update
    if (counter.deleted_at) {
      logger.log(`[SYNC] mergeCounter: Skipping update - incoming counter ${counter.id} (${counter.name}) is marked as deleted`);
      return false;
    }
    
    // CRITICAL: Check if updating would create a duplicate by name
    // If the incoming counter has a different name but matches another existing counter's name, prevent the update
    if (counter.name.toLowerCase() !== existing.name.toLowerCase()) {
      const duplicateByName = await queryFirst<Counter>(
        'SELECT * FROM lc_counters WHERE user_id = ? AND LOWER(name) = LOWER(?) AND id != ? AND deleted_at IS NULL',
        [counter.user_id, counter.name, existing.id]
      );
      
      if (duplicateByName) {
        logger.log(`[SYNC] mergeCounter: ⚠️ Skipping update of ${existing.id} (${existing.name}) - would create duplicate with ${duplicateByName.id} (${duplicateByName.name})`);
        return false;
      }
    }

    const remoteTime = new Date(counter.updated_at).getTime();
    const localTime = new Date(existing.updated_at).getTime();

    // INVARIANT: lc_counters.total is a denormalized cache. Canonical local history is lc_events (see markTotalReconciliation).
    // During merge we still use max/pending rules to avoid wiping in-flight taps; after each pull, pullChanges replays
    // events for touched marks and overwrites total when it differs from replay(events).

    // CRITICAL: Preserve higher total to prevent overwriting local increments
    // Check for pending writes that might not be reflected in current DB state
    const { useCountersStore } = await import('../state/countersSlice');
    const storeState = useCountersStore.getState();
    const recentUpdate = storeState.recentUpdates?.get(counter.id);
    const hasPendingWrite = recentUpdate && (Date.now() - recentUpdate.timestamp) < 300000; // 5 minutes
    
    // Get the authoritative total - prefer pending write, then local, then remote
    const localTotal = typeof existing.total === 'number' ? existing.total : 0;
    const remoteTotal = typeof counter.total === 'number' ? counter.total : 0;
    const pendingTotal = hasPendingWrite ? recentUpdate.total : null;
    
    // CRITICAL: If local DB has a value > 0 and remote is 0, ALWAYS preserve local
    // This prevents connection loss from resetting counters to 0
    // This is the key fix for the connection loss bug
    if (localTotal > 0 && remoteTotal === 0) {
      logger.warn('[SYNC] 🚨 CRITICAL: Preventing reset to 0 from Supabase (connection loss scenario):', {
        counterId: counter.id,
        counterName: counter.name,
        localTotal,
        remoteTotal,
        localTime: existing.updated_at,
        remoteTime: counter.updated_at,
      });
      // Don't update - preserve local value
      return false;
    }
    
    // FIXED: If there's a pending write (user just made a change), ALWAYS use that value
    // This ensures both increments AND decrements are preserved
    // Only use Math.max when there's no pending write (to handle sync from other devices)
    let preservedTotal: number;
    if (hasPendingWrite && pendingTotal !== null) {
      // User just made a change - trust their value (could be increment OR decrement)
      preservedTotal = pendingTotal;
      logger.log('[SYNC] Using pending write value (user action):', {
        counterId: counter.id,
        pendingTotal,
        localTotal,
        remoteTotal,
      });
    } else {
      // No pending write - use highest to prevent losing increments from other devices
      preservedTotal = Math.max(localTotal, remoteTotal);
    }
    
    // Only update if remote is newer, but always preserve higher totals
    if (remoteTime > localTime) {
      // Log if we're preserving a higher total
      if (preservedTotal > remoteTotal) {
        logger.log('[SYNC] Preserving higher local total during merge:', {
          counterId: counter.id,
          counterName: counter.name,
          localTotal,
          remoteTotal,
          pendingTotal,
          preservedTotal,
          hasPendingWrite: !!hasPendingWrite,
        });
      }
      
      const preservedDaily =
        typeof (counter as any).dailyTarget === 'number' && (counter as any).dailyTarget > 0
          ? normalizeDailyTargetInput((counter as any).dailyTarget)
          : resolveDailyTarget(existing as Counter);

      await execute(
        `UPDATE lc_counters SET 
          name = ?, emoji = ?, color = ?, unit = ?, enable_streak = ?,
          sort_index = ?, total = ?, last_activity_date = ?, deleted_at = ?, dailyTarget = ?, updated_at = ?
        WHERE id = ?`,
        [
          counter.name,
          counter.emoji,
          counter.color,
          counter.unit,
          counter.enable_streak ? 1 : 0,
          counter.sort_index,
          preservedTotal, // Use preserved total instead of remote total
          counter.last_activity_date,
          counter.deleted_at,
          preservedDaily,
          counter.updated_at,
          counter.id,
        ]
      );
      return true; // Counter was updated
    } else if (localTotal < remoteTotal && preservedTotal === remoteTotal) {
      // Local is newer but remote has higher total - update total only
      // This handles case where local timestamp is newer but total didn't get updated
      logger.log('[SYNC] Updating total from remote (remote has higher value):', {
        counterId: counter.id,
        localTotal,
        remoteTotal,
      });
      await execute(
        `UPDATE lc_counters SET total = ? WHERE id = ?`,
        [preservedTotal, counter.id]
      );
      return true;
    }
    return false; // No changes made
  }
};

const mergeEvent = async (event: CounterEvent) => {
  // CRITICAL: Validate that mark_id is present before merging
  if (!event.mark_id || typeof event.mark_id !== 'string' || event.mark_id.trim() === '') {
    logger.error(`[SYNC] Cannot merge event ${event.id} - mark_id is required but missing or invalid`);
    throw new Error(`Cannot merge event: mark_id is required for event ${event.id}`);
  }

  const existing = await queryFirst<CounterEvent>('SELECT * FROM lc_events WHERE id = ?', [
    event.id,
  ]);

  if (!existing) {
    await execute(
      `INSERT INTO lc_events (
        id, user_id, counter_id, event_type, amount, occurred_at,
        occurred_local_date, meta, deleted_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        event.id,
        event.user_id,
        event.mark_id, // This is now guaranteed to be valid
        event.event_type,
        event.amount,
        event.occurred_at,
        event.occurred_local_date,
        JSON.stringify(event.meta || {}),
        event.deleted_at,
        event.created_at,
        event.updated_at,
      ]
    );
  } else {
    // Update existing event if remote is newer
    const remoteTime = new Date(event.updated_at).getTime();
    const localTime = new Date(existing.updated_at).getTime();

    if (remoteTime > localTime) {
      await execute(
        `UPDATE lc_events SET 
          user_id = ?, counter_id = ?, event_type = ?, amount = ?, occurred_at = ?,
          occurred_local_date = ?, meta = ?, deleted_at = ?, updated_at = ?
        WHERE id = ?`,
        [
          event.user_id,
          event.mark_id, // This is now guaranteed to be valid
          event.event_type,
          event.amount,
          event.occurred_at,
          event.occurred_local_date,
          JSON.stringify(event.meta || {}),
          event.deleted_at,
          event.updated_at,
          event.id,
        ]
      );
    }
  }
};

const mergeStreak = async (streak: CounterStreak) => {
  const existing = await queryFirst<CounterStreak>('SELECT * FROM lc_streaks WHERE id = ?', [
    streak.id,
  ]);

  if (!existing) {
    await execute(
      `INSERT INTO lc_streaks (
        id, user_id, counter_id, current_streak, longest_streak,
        last_increment_date, deleted_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        streak.id,
        streak.user_id,
        streak.mark_id,
        streak.current_streak,
        streak.longest_streak,
        streak.last_increment_date,
        streak.deleted_at,
        streak.created_at,
        streak.updated_at,
      ]
    );
  } else {
    const remoteTime = new Date(streak.updated_at).getTime();
    const localTime = new Date(existing.updated_at).getTime();

    if (remoteTime > localTime) {
      await execute(
        `UPDATE lc_streaks SET 
          current_streak = ?, longest_streak = ?, last_increment_date = ?,
          deleted_at = ?, updated_at = ?
        WHERE id = ?`,
        [
          streak.current_streak,
          streak.longest_streak,
          streak.last_increment_date,
          streak.deleted_at,
          streak.updated_at,
          streak.id,
        ]
      );
    }
  }
};

const mergeBadge = async (badge: MarkBadge) => {
  const existing = await queryFirst<MarkBadge>('SELECT * FROM lc_badges WHERE id = ?', [
    badge.id,
  ]);

  if (!existing) {
    await execute(
      `INSERT INTO lc_badges (
        id, user_id, counter_id, badge_code, progress_value, target_value,
        earned_at, last_progressed_at, deleted_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        badge.id,
        badge.user_id,
        badge.mark_id,
        badge.badge_code,
        badge.progress_value,
        badge.target_value,
        badge.earned_at,
        badge.last_progressed_at,
        badge.deleted_at,
        badge.created_at,
        badge.updated_at,
      ]
    );
  } else {
    const remoteTime = new Date(badge.updated_at).getTime();
    const localTime = new Date(existing.updated_at).getTime();

    if (remoteTime > localTime) {
      await execute(
        `UPDATE lc_badges SET
          progress_value = ?, target_value = ?, earned_at = ?, last_progressed_at = ?,
          deleted_at = ?, updated_at = ?
        WHERE id = ?`,
        [
          badge.progress_value,
          badge.target_value,
          badge.earned_at,
          badge.last_progressed_at,
          badge.deleted_at,
          badge.updated_at,
          badge.id,
        ]
      );
    }
  }
};

const isMissingSupabaseTable = (error: any, table: string) => {
  if (!error) return false;
  if (error.code === 'PGRST205') return true;
  return typeof error.message === 'string' && error.message.includes(`'${table}'`);
};

/**
 * Batches large arrays into smaller chunks to prevent timeout errors
 * @param items - Array to batch
 * @param batchSize - Size of each batch (default: 100)
 * @returns Array of batches
 */
const batchArray = <T>(items: T[], batchSize: number = 100): T[][] => {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    batches.push(items.slice(i, i + batchSize));
  }
  return batches;
};

/**
 * Validates if a string is a valid UUID
 */
const isValidUUID = (str: string): boolean => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
};

/**
 * Parses error messages to extract clean error information
 * Handles HTML responses (like Cloudflare errors) and network errors gracefully
 */
export const parseError = (error: any): { message: string; isNetworkError: boolean; shouldRetry: boolean } => {
  const errorMessage = error?.message || String(error);
  const errorString = typeof errorMessage === 'string' ? errorMessage.toLowerCase() : '';
  
  // Check if error is an HTML response (like Cloudflare 520 errors)
  if (typeof errorMessage === 'string' && errorMessage.trim().startsWith('<!DOCTYPE html>')) {
    // Try to extract title or error code from HTML
    const titleMatch = errorMessage.match(/<title>([^<]+)<\/title>/i);
    const errorCodeMatch = errorMessage.match(/Error code (\d{3})/i);
    
    let cleanMessage = 'Server error';
    if (errorCodeMatch) {
      cleanMessage = `Server error ${errorCodeMatch[1]}`;
    } else if (titleMatch) {
      cleanMessage = titleMatch[1].split('|')[0]?.trim() || 'Server error';
    }
    
    return {
      message: cleanMessage,
      isNetworkError: true,
      shouldRetry: true, // Network/server errors should be retried
    };
  }
  
  // CRITICAL: Check for "Network request failed" - common on mobile when offline or switching apps
  // This is a TypeError thrown by fetch when the network is unavailable
  if (errorString.includes('network request failed') || 
      errorString.includes('network error') ||
      errorString.includes('failed to fetch') ||
      errorString.includes('networkerror') ||
      errorString.includes('no internet') ||
      error?.name === 'TypeError' && errorString.includes('network')) {
    return {
      message: 'Network unavailable. Changes saved locally and will sync when connection is restored.',
      isNetworkError: true,
      shouldRetry: true,
    };
  }
  
  // Check for network errors by error code
  if (error?.code === 'ECONNREFUSED' || error?.code === 'ENOTFOUND' || error?.code === 'ETIMEDOUT' ||
      error?.code === 'ECONNRESET' || error?.code === 'ECONNABORTED' || error?.code === 'ENETUNREACH') {
    return {
      message: 'Network connection error. Please check your internet connection.',
      isNetworkError: true,
      shouldRetry: true,
    };
  }
  
  // Check for timeout errors (PostgreSQL statement timeout)
  if (error?.code === '57014' || errorString.includes('timeout') || errorString.includes('timed out')) {
    return {
      message: 'Operation timed out. The server took too long to respond. Sync will retry automatically.',
      isNetworkError: true, // Treat timeout as network-like error (temporary, should retry)
      shouldRetry: true,
    };
  }
  
  // Check for abort errors (can happen when app goes to background)
  if (error?.name === 'AbortError' || errorString.includes('aborted')) {
    return {
      message: 'Request was cancelled. Will retry on next sync.',
      isNetworkError: true,
      shouldRetry: true,
    };
  }

  if (error?.code === 'SYNC_EXECUTION_TIMEOUT') {
    return {
      message:
        'Sync timed out before completion. Local data is unchanged; sync will retry when the connection responds.',
      isNetworkError: true,
      shouldRetry: true,
    };
  }
  
  // Check for Supabase specific errors
  if (error?.code) {
    return {
      message: errorMessage,
      isNetworkError: false,
      shouldRetry: false,
    };
  }
  
  // Default: return the error message as-is
  return {
    message: errorMessage,
    isNetworkError: false,
    shouldRetry: false,
  };
};

