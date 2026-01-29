import { useEffect, useState, useCallback, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { supabase } from '../lib/supabase';
import { Counter, MarkBadge, CounterEvent, CounterStreak } from '../types';
import { query, execute, queryFirst } from '../lib/db';
import AsyncStorage from '@react-native-async-storage/async-storage';

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

interface SyncState {
  isSyncing: boolean;
  lastSyncedAt: string | null;
  error: string | null;
  realtimeConnected: boolean;
}

const isProLimitError = (error: any): boolean => {
  const message = error?.message || String(error || '');
  return (
    error?.code === 'P0001' ||
    (typeof message === 'string' && message.includes('FREE_COUNTER_LIMIT_REACHED'))
  );
};

export const useSync = () => {
  const [syncState, setSyncState] = useState<SyncState>({
    isSyncing: false,
    lastSyncedAt: null,
    error: null,
    realtimeConnected: false,
  });

  // Sync lock to prevent concurrent syncs
  const syncLockRef = useRef<Promise<void> | null>(null);
  // Real-time subscription refs
  const realtimeChannelRef = useRef<any>(null);

  useEffect(() => {
    // Load last sync time
    let mounted = true;
    AsyncStorage.getItem('last_synced_at').then((value) => {
      // Only update state if component is still mounted
      if (mounted && value) {
        setSyncState((prev) => ({ ...prev, lastSyncedAt: value }));
      }
    });
    
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
                  // Allow a short delay so local writes flush, but avoid long race windows
                  await new Promise(resolve => setTimeout(resolve, 500)); // trimmed to 0.5s
                  
                  // Pull changes to get updated data
                  await pullChanges(user.id);
                  
                  // Reload stores to reflect changes
                  // CRITICAL: loadMarks will preserve optimistic updates via recentUpdates tracking
                  const { useCountersStore } = await import('../state/countersSlice');
                  const { useEventsStore } = await import('../state/eventsSlice');
                  await useCountersStore.getState().loadMarks(user.id);
                  useEventsStore.getState().loadEvents(undefined, user.id);
                } catch (error) {
                  logger.error('[REALTIME] Error handling counter change:', error);
                }
              }, 3000); // 3 second debounce for real-time updates (increased to allow writes to complete)
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
                  await pullChanges(user.id);
                  const { useEventsStore } = await import('../state/eventsSlice');
                  useEventsStore.getState().loadEvents(undefined, user.id);
                } catch (error) {
                  logger.error('[REALTIME] Error handling event change:', error);
                }
              }, 1000);
            }
          )
          .subscribe((status: string) => {
            if (status === 'SUBSCRIBED') {
              if (__DEV__) {
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

    const lastPulledAt = await AsyncStorage.getItem('last_synced_at');
    
    try {
      // If lastPulledAt is null, pull all data (first sync), otherwise pull only changes
      // IMPORTANT: Only pull non-deleted counters
      // Select only needed fields to reduce I/O
      let countersQuery = supabase
        .from('counters')
        .select('id, user_id, name, emoji, color, unit, enable_streak, sort_index, total, last_activity_date, deleted_at, created_at, updated_at')
        .eq('user_id', userId)
        .is('deleted_at', null); // Only pull counters that haven't been deleted
      
      if (lastPulledAt) {
        countersQuery = countersQuery.gt('updated_at', lastPulledAt);
      }
      
      const { data: counters, error: countersError } = await countersQuery;
      if (countersError) {
        const parsed = parseError(countersError);
        if (parsed.isNetworkError) {
          logger.warn('[SYNC] Network error pulling counters:', parsed.message);
          // For network errors, set counters to empty array and let sync continue
          // The app will work with local data until network is restored
        } else {
          throw countersError;
        }
      }
      
      // Ensure counters is defined (default to empty array for network errors)
      const safeCounters = counters || [];

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
          if (parsed.isNetworkError) {
            logger.warn('[SYNC] Network error pulling events:', parsed.message);
          } else {
            throw eventsError;
          }
        } else {
          allEvents = events || [];
        }
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
            if (parsed.isNetworkError) {
              logger.warn('[SYNC] Network error during paginated event sync:', parsed.message);
              // Continue with what we have so far
              hasMore = false;
            } else {
              throw eventsError;
            }
          } else {
            const batch = events || [];
            if (batch.length > 0) {
              allEvents = [...allEvents, ...batch];
              offset += BATCH_SIZE;
              lastUpdatedAt = batch[batch.length - 1]?.updated_at || null;
              hasMore = batch.length === BATCH_SIZE;
              
              if (__DEV__) {
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
        if (parsed.isNetworkError) {
          logger.warn('[SYNC] Network error pulling streaks:', parsed.message);
          // For network errors, continue with empty streaks
        } else {
          throw streaksError;
        }
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

      if (safeCounters && safeCounters.length > 0) {
        logger.log(`[SYNC] Processing ${safeCounters.length} counter(s) from Supabase`);
        // Batch merge counters to reduce I/O
        const mergePromises = safeCounters
          .filter((counter) => {
            // CRITICAL: Skip ANY counter that was deleted locally - never allow it to reappear
            // Even if server has a newer version with deleted_at=null, local deletion takes precedence
            if (deletedIdsSet.has(counter.id)) {
              const localDeletionTime = deletedIdsMap.get(counter.id);
              // Even if server counter has deleted_at=null (somehow), local deletion is authoritative
              // This prevents any edge case where deleted counters could reappear
              logger.warn(`[SYNC] 🚫 PERMANENTLY BLOCKED: Counter ${counter.id} (${counter.name}) - deleted locally at ${localDeletionTime}, never restoring`);
              
              // CRITICAL: Explicitly ensure this counter is deleted on server too
              // This prevents the edge case where another device might restore it
              if (!counter.deleted_at || counter.deleted_at.trim() === '') {
                // Server thinks it's not deleted, but we know it is - push deletion to server
                logger.warn(`[SYNC] Server has non-deleted version of locally deleted counter ${counter.id}, pushing deletion`);
                // This will be handled in pushChanges, but we still block it here
              }
              
              return false;
            }
            
            // Double-check: If counter exists in DB and is marked as deleted, skip it
            const existing = existingCountersMap.get(counter.id);
            if (existing && existing.deleted_at && existing.deleted_at.trim() !== '') {
              logger.log(`[SYNC] ⚠️ BLOCKED: Skipping counter ${counter.id} (${counter.name}) - marked as deleted in local database`);
              return false;
            }
            
            // TRIPLE-CHECK: If server counter has deleted_at set, skip it (even if not in local deleted set)
            // This handles the case where counter was deleted on another device
            if (counter.deleted_at && counter.deleted_at.trim() !== '') {
              logger.log(`[SYNC] ⚠️ BLOCKED: Skipping counter ${counter.id} (${counter.name}) - marked as deleted on server`);
              return false;
            }
            
            return true;
          })
          .map((counter) => {
            logger.log(`[SYNC] ✅ Merging counter ${counter.id} (${counter.name}) from Supabase`);
            return mergeCounter(counter, existingCountersMap);
          });
        
        await Promise.all(mergePromises);
      }
      
      // DO NOT reload the store after sync - this prevents deleted counters from being brought back
      // The store is already correctly managed by individual actions (deleteCounter, addCounter, etc.)
      // Reloading would potentially bring back counters that were deleted locally but not yet synced
      
      // Instead, manually add only genuinely new counters to the store
      // IMPORTANT: Only update store with counters that were actually merged (not skipped)
      if (counters && counters.length > 0) {
        const { useCountersStore } = await import('../state/countersSlice');
        const store = useCountersStore.getState();
        const currentCounterIds = new Set(store.marks.map((c) => c.id));
        
        // Track which counters were actually merged (not skipped)
        const mergedCounterIds: string[] = [];
        
        // Find counters that are new (not in current store) and weren't skipped due to deletion
        // Only include counters that passed all the skip checks above
        for (const counter of counters) {
          // Skip if it was in the deleted set (we already skipped these above)
          if (deletedIdsSet.has(counter.id)) {
            continue;
          }
          
          // Skip if it's already in the store
          if (currentCounterIds.has(counter.id)) {
            continue;
          }
          
          // This counter passed all checks and was merged - add it to the list
          mergedCounterIds.push(counter.id);
        }
        
        if (mergedCounterIds.length > 0) {
          // Verify these counters exist in the database and aren't deleted
          const verifiedNewCounters = await query<Counter>(
            `SELECT * FROM lc_counters WHERE id IN (${mergedCounterIds.map(() => '?').join(',')}) AND deleted_at IS NULL`,
            mergedCounterIds
          );
          
          // Manually add new counters to the store without reloading everything
          if (verifiedNewCounters.length > 0) {
            logger.log(`[SYNC] Adding ${verifiedNewCounters.length} new counter(s) to store:`, 
              verifiedNewCounters.map((c) => c.name).join(', '));
            
            // Update store by adding only the new counters
            // CRITICAL: Filter out any deleted counters from currentCounters first
            // Also filter out any counters that are in the deletedIdsSet
            // This ensures deleted counters never come back, even if they somehow got into the store
            const currentCounters = store.marks.filter(
              (c) => !c.deleted_at && !deletedIdsSet.has(c.id)
            );
            
            // Also filter verifiedNewCounters to ensure none are deleted
            // Double-check each counter in the database to ensure it's not deleted
            const safeNewCounters: Counter[] = [];
            for (const counter of verifiedNewCounters) {
              // Skip if in deleted set
              if (deletedIdsSet.has(counter.id)) {
                logger.log(`[SYNC] ⚠️ Skipping counter ${counter.id} (${counter.name}) from store update - it's in deleted set`);
                continue;
              }
              
              // Skip if counter itself has deleted_at set
              if (counter.deleted_at) {
                logger.log(`[SYNC] ⚠️ Skipping counter ${counter.id} (${counter.name}) from store update - counter has deleted_at set`);
                continue;
              }
              
              // Double-check database to ensure it's not deleted
              const dbCheck = await queryFirst<{ deleted_at: string | null }>(
                'SELECT deleted_at FROM lc_counters WHERE id = ?',
                [counter.id]
              );
              
              if (dbCheck && !dbCheck.deleted_at) {
                safeNewCounters.push(counter);
              } else if (dbCheck && dbCheck.deleted_at) {
                logger.log(`[SYNC] ⚠️ Skipping counter ${counter.id} (${counter.name}) from store update - it's marked as deleted in database`);
              }
            }
            
            const updatedCounters = [...currentCounters, ...safeNewCounters].sort(
              (a, b) => (a.sort_index || 0) - (b.sort_index || 0) || 
                       new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
            );
            
            // Final safety check: ensure no deleted counters made it through
            const finalFilteredCounters = updatedCounters.filter(
              (c) => !c.deleted_at && !deletedIdsSet.has(c.id)
            );
            
            // Use the store's internal set method to update
            useCountersStore.setState({ counters: finalFilteredCounters });
            logger.log(`[SYNC] ✅ Store updated with ${finalFilteredCounters.length} total counter(s) (filtered from ${updatedCounters.length})`);
          }
        }
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

      // Update last sync time
      const now = new Date().toISOString();
      await AsyncStorage.setItem('last_synced_at', now);
      setSyncState((prev) => ({ ...prev, lastSyncedAt: now }));
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

    const lastPushedAt = await AsyncStorage.getItem('last_synced_at');
    const timestamp = lastPushedAt || new Date(0).toISOString();

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
        // Continue with empty array - will try again on next sync
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
      
      // Filter out any counters with invalid user_id and log security events
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

      // Log what we're about to push
      if (allCounters.length > 0) {
        const deletedCount = allCounters.filter((c) => c.deleted_at).length;
        logger.log(`[SYNC] Pushing ${allCounters.length} counter(s) (${deletedCount} deleted) since ${timestamp}`);
        if (deletedCount > 0) {
          logger.log(`[SYNC] Deleted counters to push:`, 
            allCounters.filter((c) => c.deleted_at).map((c) => `${c.name} (deleted_at: ${c.deleted_at})`).join(', '));
        }
      }

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
        logger.error('[SYNC] Error querying events:', parsed.message);
        // Don't throw - continue with empty array, events will be synced on next attempt
        events = [];
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
        // Don't throw - continue with empty array, streaks will be synced on next attempt
        streaks = [];
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
        // Don't throw - continue with empty array, badges will be synced on next attempt
        badges = [];
      }

      // Push counters FIRST (most critical - includes deletions)
      // This ensures deletions are synced before other operations
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
        
        let limitBlocked = false;
        for (let i = 0; i < counterBatches.length; i++) {
          const batch = counterBatches[i];
          logger.log(`[SYNC] Upserting batch ${i + 1}/${counterBatches.length} (${batch.length} counter(s))...`);
          
          const { error: countersError } = await supabase
            .from('counters')
            .upsert(batch, { onConflict: 'id' });

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
              logger.warn(`[SYNC] Network/timeout error pushing counters batch ${i + 1}:`, parsed.message);
              // For network/timeout errors, log and continue with next batch
              // Failed batches will be pushed on next sync
            } else {
              logger.error(`[SYNC] Error pushing counters batch ${i + 1} to Supabase:`, countersError);
              logger.error(`[SYNC] Failed counters in batch:`, batch.map((c) => ({ id: c.id, name: c.name, deleted_at: c.deleted_at })));
              throw countersError;
            }
          } else {
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
                const invalidCount = events.length - validEvents.length;
                const invalidEvents = events.filter(e => !e.mark_id || !isValidUUID(e.mark_id));
                logger.warn(`[SYNC] Filtered out ${invalidCount} event(s) with invalid or missing mark_id:`, {
                  invalidSample: invalidEvents.slice(0, 3).map(e => ({
                    id: e.id,
                    mark_id: e.mark_id,
                    counter_id: (e as any).counter_id,
                  })),
                });
              }
              
              if (validEvents.length === 0) {
                logger.log('[SYNC] No valid events to push (all filtered out due to invalid mark_id)');
                return;
              }
              
              // Log events being pushed
              logger.log('[SYNC] Pushing events to Supabase:', {
                count: validEvents.length,
                sample: validEvents.slice(0, 3).map(e => ({
                  id: e.id,
                  mark_id: e.mark_id,
                  event_type: e.event_type,
                  occurred_at: e.occurred_at,
                })),
              });
              
              // Map mark_id to counter_id for Supabase using type-safe mapper
              const eventsForSupabase = mapEventsToSupabase(validEvents.map((e) => ({ ...e, meta: e.meta || {} })));
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
                    // For timeout/network errors, log warning but continue with next batch
                    logger.warn(`[SYNC] Error pushing events batch ${i + 1}/${eventBatches.length} (timeout/network):`, parsed.message);
                    continue;
                  }
                  throw error;
                }
                
                // Log success
                logger.log(`[SYNC] ✅ Events batch ${i + 1}/${eventBatches.length} pushed successfully:`, {
                  batchSize: batch.length,
                  insertedCount: data?.length || 0,
                });
              }
              
              logger.log(`[SYNC] ✅ All ${validEvents.length} events pushed to Supabase successfully`);
            } catch (error) {
              const parsed = parseError(error);
              if (parsed.isNetworkError || parsed.shouldRetry) {
                logger.warn('[SYNC] Error pushing events (timeout/network):', parsed.message);
                return; // Don't throw - let other operations continue
              }
              throw error;
            }
          })()
        );
      }

      if (streaks.length > 0) {
        // Deduplicate streaks by mark_id (unique constraint)
        // Keep the most recent version based on updated_at
        const streaksMap = new Map<string, CounterStreak>();
        for (const streak of streaks) {
          const existing = streaksMap.get(streak.mark_id);
          if (!existing || new Date(streak.updated_at) > new Date(existing.updated_at)) {
            streaksMap.set(streak.mark_id, streak);
          }
        }
        const uniqueStreaks = Array.from(streaksMap.values());
        
        if (uniqueStreaks.length !== streaks.length) {
          logger.log(`[SYNC] Deduplicated streaks: ${streaks.length} -> ${uniqueStreaks.length}`);
        }

        // CRITICAL: Filter out streaks for counters that don't exist in Supabase
        // This prevents foreign key constraint violations
        // First, filter out streaks with invalid mark_id (undefined, null, or empty)
        const streaksWithValidIds = uniqueStreaks.filter(s => 
          s.mark_id && 
          typeof s.mark_id === 'string' && 
          s.mark_id.trim() !== '' &&
          isValidUUID(s.mark_id)
        );
        
        if (streaksWithValidIds.length !== uniqueStreaks.length) {
          const invalidCount = uniqueStreaks.length - streaksWithValidIds.length;
          logger.warn(`[SYNC] Filtered out ${invalidCount} streak(s) with invalid mark_id`);
        }
        
        const validStreaks: CounterStreak[] = [];
        const counterIds = streaksWithValidIds.map(s => s.mark_id).filter((id): id is string => Boolean(id)); // mark_id maps to counter_id in Supabase
        
        if (counterIds.length > 0) {
          try {
            // Check which counters exist in Supabase (and are not deleted)
            const { data: existingCounters, error: counterCheckError } = await supabase
              .from('counters')
              .select('id')
              .in('id', counterIds)
              .is('deleted_at', null);
            
            if (counterCheckError) {
              logger.warn('[SYNC] Error checking counter existence for streaks:', counterCheckError);
              // If we can't check, skip all streaks to be safe
            } else {
              const existingCounterIds = new Set((existingCounters || []).map(c => c.id));
              
              // Only include streaks whose counter exists in Supabase
              for (const streak of streaksWithValidIds) {
                if (streak.mark_id && existingCounterIds.has(streak.mark_id)) {
                  validStreaks.push(streak);
                } else {
                  logger.warn(`[SYNC] Skipping streak for counter ${streak.mark_id} - counter doesn't exist in Supabase or is deleted`);
                }
              }
              
              if (validStreaks.length !== uniqueStreaks.length) {
                logger.log(`[SYNC] Filtered streaks: ${uniqueStreaks.length} -> ${validStreaks.length} (removed streaks for non-existent counters)`);
              }
            }
          } catch (checkError) {
            logger.warn('[SYNC] Error validating streaks against counters:', checkError);
            // If validation fails, skip all streaks to prevent foreign key errors
          }
        }

        if (validStreaks.length > 0) {
          pushPromises.push(
            (async () => {
              try {
                // Batch large upserts to prevent timeout errors
                const BATCH_SIZE = 100;
                // Map mark_id to counter_id for Supabase using type-safe mapper
                // This ensures we never accidentally send mark_id to Supabase
                const streaksForSupabase = mapStreaksToSupabase(validStreaks);
                const streakBatches = batchArray(streaksForSupabase, BATCH_SIZE);
                
                for (let i = 0; i < streakBatches.length; i++) {
                  const batch = streakBatches[i];
                  
                  try {
                    const { error } = await supabase
                      .from('counter_streaks')
                      .upsert(batch, {
                        // Use onConflict with column name for unique constraint on counter_id
                        // If records have id (primary key), Supabase will use that; otherwise use counter_id
                        onConflict: batch[0]?.id ? 'id' : 'counter_id',
                        ignoreDuplicates: false,
                      });
                    
                    if (error) {
                      // Handle foreign key constraint violation (23503)
                      if (error.code === '23503') {
                        logger.warn(`[SYNC] Foreign key violation pushing streaks batch ${i + 1} - some counters may not exist. Skipping batch.`);
                        // Filter out the problematic streaks and try individual inserts
                        for (const streak of batch) {
                          try {
                            const { error: singleError } = await supabase
                              .from('counter_streaks')
                              .upsert(streak, {
                                onConflict: streak.id ? 'id' : 'counter_id',
                                ignoreDuplicates: false,
                              });
                            
                            if (singleError && singleError.code !== '23503') {
                              const parsed = parseError(singleError);
                              if (!parsed.isNetworkError && !parsed.shouldRetry) {
                                logger.warn(`[SYNC] Error pushing individual streak ${streak.counter_id || streak.id}:`, singleError.message);
                              }
                            }
                          } catch (singleError) {
                            // Skip individual streak if it fails
                            logger.warn(`[SYNC] Error pushing individual streak ${streak.counter_id || streak.id}:`, singleError);
                          }
                        }
                        continue;
                      }
                      
                      // If error is about conflict specification (42P10), try alternative approach
                      if (error.code === '42P10') {
                        // If all streaks have IDs, try with id only
                        if (batch.every(s => s.id)) {
                          const { error: retryError } = await supabase
                            .from('counter_streaks')
                            .upsert(batch, {
                              onConflict: 'id',
                              ignoreDuplicates: false,
                            });
                          
                          if (retryError) {
                            const parsed = parseError(retryError);
                            if (parsed.isNetworkError || parsed.shouldRetry) {
                              logger.warn(`[SYNC] Error pushing streaks batch ${i + 1}/${streakBatches.length} (timeout/network):`, parsed.message);
                              continue;
                            }
                            throw retryError;
                          }
                          continue;
                        }
                        // Otherwise, log warning and continue (streaks might already exist)
                        logger.warn(`[SYNC] Streak upsert conflict (handled) batch ${i + 1}:`, error.message);
                        continue;
                      }
                      // Check for timeout errors
                      const parsed = parseError(error);
                      if (parsed.isNetworkError || parsed.shouldRetry) {
                        logger.warn(`[SYNC] Error pushing streaks batch ${i + 1}/${streakBatches.length} (timeout/network):`, parsed.message);
                        continue;
                      }
                      throw error;
                    }
                  } catch (batchError) {
                    const parsed = parseError(batchError);
                    if (parsed.isNetworkError || parsed.shouldRetry) {
                      logger.warn(`[SYNC] Error pushing streaks batch ${i + 1}/${streakBatches.length} (timeout/network):`, parsed.message);
                      continue;
                    }
                    // If it's a foreign key error, log and continue
                    if (batchError && typeof batchError === 'object' && 'code' in batchError && batchError.code === '23503') {
                      logger.warn(`[SYNC] Foreign key violation in batch ${i + 1} - skipping batch`);
                      continue;
                    }
                    throw batchError;
                  }
                }
              } catch (error) {
                const parsed = parseError(error);
                if (parsed.isNetworkError || parsed.shouldRetry) {
                  logger.warn('[SYNC] Error pushing streaks (timeout/network):', parsed.message);
                  return; // Don't throw - let other operations continue
                }
                // If it's a foreign key error, log and return (don't throw)
                if (error && typeof error === 'object' && 'code' in error && error.code === '23503') {
                  logger.warn('[SYNC] Foreign key violation pushing streaks - some counters may not exist');
                  return;
                }
                throw error;
              }
            })()
          );
        } else {
          logger.log('[SYNC] No valid streaks to push (all filtered out due to missing counters)');
        }
      }

      if (badges.length > 0) {
        // Deduplicate badges by counter_id + badge_code (unique constraint)
        // Keep the most recent version based on updated_at
        const badgesMap = new Map<string, MarkBadge>();
        for (const badge of badges) {
          const key = `${badge.mark_id}:${badge.badge_code}`;
          const existing = badgesMap.get(key);
          if (!existing || new Date(badge.updated_at) > new Date(existing.updated_at)) {
            badgesMap.set(key, badge);
          }
        }
        const uniqueBadges = Array.from(badgesMap.values());
        
        if (uniqueBadges.length !== badges.length) {
          logger.log(`[SYNC] Deduplicated badges: ${badges.length} -> ${uniqueBadges.length}`);
        }

        // CRITICAL: Filter out badges with invalid mark_id (undefined, null, or empty)
        // This prevents null constraint violations
        const badgesWithValidIds = uniqueBadges.filter(b => 
          b.mark_id && 
          typeof b.mark_id === 'string' && 
          b.mark_id.trim() !== '' &&
          isValidUUID(b.mark_id) &&
          b.badge_code // Also ensure badge_code is present
        );
        
        if (badgesWithValidIds.length !== uniqueBadges.length) {
          const invalidCount = uniqueBadges.length - badgesWithValidIds.length;
          logger.warn(`[SYNC] Filtered out ${invalidCount} badge(s) with invalid mark_id or badge_code`);
        }

        // CRITICAL: Filter out badges for counters that don't exist in Supabase
        // This prevents foreign key constraint violations
        const validBadges: MarkBadge[] = [];
        const counterIds = badgesWithValidIds.map(b => b.mark_id).filter((id): id is string => Boolean(id)); // mark_id maps to counter_id in Supabase
        
        if (counterIds.length > 0) {
          try {
            // Check which counters exist in Supabase (and are not deleted)
            const { data: existingCounters, error: counterCheckError } = await supabase
              .from('counters')
              .select('id')
              .in('id', counterIds)
              .is('deleted_at', null);
            
            if (counterCheckError) {
              logger.warn('[SYNC] Error checking counter existence for badges:', counterCheckError);
              // If we can't check, skip all badges to be safe
            } else {
              const existingCounterIds = new Set((existingCounters || []).map(c => c.id));
              const skippedCounterIds = new Set<string>();
              
              // Only include badges whose counter exists in Supabase
              for (const badge of badgesWithValidIds) {
                if (badge.mark_id && existingCounterIds.has(badge.mark_id)) {
                  validBadges.push(badge);
                } else {
                  // Track skipped counter IDs for summary logging
                  if (badge.mark_id) {
                    skippedCounterIds.add(badge.mark_id);
                  }
                }
              }
              
              if (validBadges.length !== badgesWithValidIds.length) {
                const skippedCount = badgesWithValidIds.length - validBadges.length;
                const uniqueSkippedCounters = skippedCounterIds.size;
                logger.log(`[SYNC] Filtered badges: ${badgesWithValidIds.length} -> ${validBadges.length} (removed ${skippedCount} badge(s) for ${uniqueSkippedCounters} non-existent counter(s))`);
              }
            }
          } catch (checkError) {
            logger.warn('[SYNC] Error validating badges against counters:', checkError);
            // If validation fails, skip all badges to prevent foreign key errors
          }
        }

        if (validBadges.length > 0) {
          pushPromises.push(
            (async () => {
              try {
                // Batch large upserts to prevent timeout errors
                const BATCH_SIZE = 100;
                // Map mark_id to counter_id for Supabase using type-safe mapper
                // This ensures we never accidentally send mark_id to Supabase
                // CRITICAL: Ensure all badges have user_id set to the current user
                const badgesForSupabase = mapBadgesToSupabase(validBadges).map(badge => ({
                  ...badge,
                  user_id: userId, // Ensure user_id is set to the authenticated user
                }));
              const badgeBatches = batchArray(badgesForSupabase, BATCH_SIZE);
              
              for (let i = 0; i < badgeBatches.length; i++) {
                const batch = badgeBatches[i];
                
                const { error } = await supabase
                  .from('counter_badges')
                  .upsert(batch, {
                    onConflict: 'counter_id,badge_code', // Handle conflicts on unique constraint (Supabase uses counter_id)
                    ignoreDuplicates: false, // Update existing records instead of ignoring
                  });
                
                if (error && !isMissingSupabaseTable(error, 'counter_badges')) {
                  // If it's a duplicate key error, log it but don't throw (badge already exists)
                  if (error.code === '23505' || error.code === '21000') {
                    logger.warn(`[SYNC] Badge conflict error (handled) batch ${i + 1}:`, error.message);
                    continue;
                  }
                  // If it's a foreign key constraint violation, log warning and skip
                  if (error.code === '23503' || error.message?.includes('foreign key constraint')) {
                    logger.warn(`[SYNC] Foreign key violation pushing badges batch ${i + 1} - some counters may not exist. Skipping batch.`);
                    // Try individual inserts to identify problematic badges
                    for (const badge of batch) {
                      try {
                        const { error: singleError } = await supabase
                          .from('counter_badges')
                          .upsert(badge, {
                            onConflict: 'counter_id,badge_code',
                            ignoreDuplicates: false,
                          });
                        
                        if (singleError && singleError.code !== '23503') {
                          const parsed = parseError(singleError);
                          if (!parsed.isNetworkError && !parsed.shouldRetry) {
                            logger.warn(`[SYNC] Error pushing individual badge ${badge.counter_id || badge.id}:`, singleError.message);
                          }
                        }
                      } catch (singleError) {
                        // Skip individual badge if it fails
                        logger.warn(`[SYNC] Error pushing individual badge ${badge.counter_id || badge.id}:`, singleError);
                      }
                    }
                    continue;
                  }
                  // If it's an RLS policy violation, log warning and skip (badges might not have proper permissions)
                  if (error.code === '42501' || error.message?.includes('row-level security')) {
                    logger.warn(`[SYNC] RLS policy violation pushing badges batch ${i + 1} - skipping batch. This may happen if badges don't have proper user_id or permissions.`);
                    continue;
                  }
                  // Check for timeout errors
                  const parsed = parseError(error);
                  if (parsed.isNetworkError || parsed.shouldRetry) {
                    logger.warn(`[SYNC] Error pushing badges batch ${i + 1}/${badgeBatches.length} (timeout/network):`, parsed.message);
                    continue;
                  }
                  throw error;
                }
              }
            } catch (error) {
              const parsed = parseError(error);
              // Handle foreign key constraint violations gracefully
              if (error && typeof error === 'object' && 'code' in error && error.code === '23503') {
                logger.warn('[SYNC] Foreign key violation pushing badges - some counters may not exist. Skipping badges.');
                return; // Don't throw - let other operations continue
              }
              // Handle RLS policy violations gracefully
              if (error && typeof error === 'object' && 'code' in error && error.code === '42501') {
                logger.warn('[SYNC] RLS policy violation pushing badges - skipping. Badges may not have proper permissions.');
                return; // Don't throw - let other operations continue
              }
              if (parsed.isNetworkError || parsed.shouldRetry) {
                logger.warn('[SYNC] Error pushing badges (timeout/network):', parsed.message);
                return; // Don't throw - let other operations continue
              }
              throw error;
            }
          })()
        );
        } else {
          logger.log('[SYNC] No valid badges to push (all filtered out due to invalid mark_id, badge_code, or missing counters)');
        }
      }

      // Wait for remaining pushes to complete
      if (pushPromises.length > 0) {
        try {
          await Promise.all(pushPromises);
        } catch (error) {
          const parsed = parseError(error);
          if (parsed.isNetworkError || parsed.shouldRetry) {
            // For timeout/network errors, log but don't throw
            // Individual operations may have succeeded partially
            logger.warn('[SYNC] Some push operations failed due to timeout/network error:', parsed.message);
            // Continue - partial sync is better than no sync
          } else {
            // For other errors, throw to be handled by outer catch
            throw error;
          }
        }
      }
    } catch (error) {
      const parsed = parseError(error || 'Unknown error occurred during push');
      if (parsed.isNetworkError || parsed.shouldRetry) {
        // For timeout/network errors, log warning but don't throw
        // The sync can continue or retry later
        logger.warn('[SYNC] Push operation failed due to timeout/network error:', parsed.message);
        // Don't throw - allow sync to continue or fail gracefully
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
          logger.error(`[SYNC] Push error: ${errorMsg}`, errorDetails);
        } else {
          logger.error(`[SYNC] Push error: ${errorMsg}`);
        }
        
        // Create a proper Error object to throw
        const errorToThrow = error instanceof Error 
          ? error 
          : new Error(errorMsg || 'Unknown push error');
        throw errorToThrow;
      }
    }
  }, []);

  // Throttle sync to prevent excessive I/O - minimum 30 seconds between syncs
  const lastSyncTimeRef = useRef<number>(0);
  const SYNC_THROTTLE_MS = 30000; // 30 seconds
  const SYNC_DEBOUNCE_MS = 500; // 500ms debounce for rapid button taps
  
  // Debounce ref for rapid sync requests
  const syncDebounceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSyncRef = useRef<((value: void | PromiseLike<void>) => void) | null>(null);

  const sync = useCallback(async () => {
    // Debounce rapid sync requests (e.g., multiple button taps)
    return new Promise<void>((resolve) => {
      // Clear any existing debounce timeout
      if (syncDebounceTimeoutRef.current) {
        clearTimeout(syncDebounceTimeoutRef.current);
      }
      
      // Store the resolve function to call after debounce
      pendingSyncRef.current = resolve;
      
      // Set new debounce timeout
      syncDebounceTimeoutRef.current = setTimeout(async () => {
        syncDebounceTimeoutRef.current = null;
        const resolveFn = pendingSyncRef.current;
        pendingSyncRef.current = null;
        
        // Throttle sync requests
        const now = Date.now();
        const timeSinceLastSync = now - lastSyncTimeRef.current;
        if (timeSinceLastSync < SYNC_THROTTLE_MS && lastSyncTimeRef.current > 0) {
          logger.log(`[SYNC] Throttling sync request (${Math.round((SYNC_THROTTLE_MS - timeSinceLastSync) / 1000)}s remaining)`);
          resolveFn?.();
          return syncLockRef.current || Promise.resolve();
        }
        
        // If a sync is already in progress, wait for it to complete
        if (syncLockRef.current) {
          await syncLockRef.current;
          resolveFn?.();
          return;
        }
        
        // Execute sync
        try {
          syncLockRef.current = executeSync();
          await syncLockRef.current;
          resolveFn?.();
        } catch (error) {
          resolveFn?.();
          throw error;
        } finally {
          syncLockRef.current = null;
        }
      }, SYNC_DEBOUNCE_MS);
    });
  }, []);

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
        // Push first, then pull - this ensures deletions are synced to Supabase
        // before pulling, preventing deleted counters from being restored
        await pushChanges(user.id);
        
        // Small delay to ensure Supabase has processed the push
        // This is especially important for deletions
        await new Promise(resolve => setTimeout(resolve, 100));
        
        await pullChanges(user.id);
        
        // CRITICAL: Recalculate streaks after sync completes
        // This ensures streaks are accurate after syncing events from server
        // Streaks calculated optimistically during local operations may differ from server
        try {
          const { useCountersStore } = await import('../state/countersSlice');
          const { useEventsStore } = await import('../state/eventsSlice');
          const { computeStreak, updateStreakInDB } = await import('./useStreaks');
          
          const counters = useCountersStore.getState().marks.filter(m => !m.deleted_at && m.enable_streak);
          const allEvents = useEventsStore.getState().events.filter(e => !e.deleted_at);
          
          // Recalculate streaks for all counters with streaks enabled
          const streakUpdates = counters.map(async (counter) => {
            const counterEvents = allEvents.filter(e => e.mark_id === counter.id);
            const streakData = computeStreak(counterEvents);
            await updateStreakInDB(counter.id, user.id, streakData);
          });
          
          await Promise.all(streakUpdates);
          logger.log(`[SYNC] Recalculated streaks for ${counters.length} counter(s) after sync`);
        } catch (streakError) {
          logger.error('[SYNC] Error recalculating streaks after sync:', streakError);
          // Don't fail sync if streak recalculation fails
        }
        
        // CRITICAL: Run cleanup after sync to remove any duplicates and orphaned records
        // This ensures duplicates and orphaned streaks/badges/events are removed immediately after sync completes
        try {
          const [counterCleanup, orphanCleanup, eventCleanup] = await Promise.all([
            cleanupDuplicateCounters(user.id),
            cleanupOrphanedStreaksAndBadges(user.id),
            cleanupOrphanedEvents(user.id),
          ]);
          
          if (counterCleanup.duplicatesByID + counterCleanup.duplicatesByName > 0) {
            logger.log(`[SYNC] Cleaned up ${counterCleanup.duplicatesByID + counterCleanup.duplicatesByName} duplicate counter(s) after sync`);
          }
          
          if (orphanCleanup.deletedStreaks > 0 || orphanCleanup.deletedBadges > 0) {
            logger.log(`[SYNC] Cleaned up ${orphanCleanup.deletedStreaks} orphaned streak(s) and ${orphanCleanup.deletedBadges} orphaned badge(s) after sync`);
          }
          
          if (eventCleanup.deletedEvents > 0) {
            logger.log(`[SYNC] Cleaned up ${eventCleanup.deletedEvents} orphaned event(s) after sync`);
          }
          
          // CRITICAL: After sync, clean up badges for counters that don't exist in Supabase
          // This handles the case where badges exist locally but their counters were never synced or were deleted
          // We do this after push to ensure we know which counters actually exist in Supabase
          try {
            // Get all counter IDs that exist in Supabase
            const { data: supabaseCounters, error: supabaseError } = await supabase
              .from('counters')
              .select('id')
              .eq('user_id', user.id)
              .is('deleted_at', null);
            
            if (!supabaseError && supabaseCounters) {
              const supabaseCounterIds = new Set(supabaseCounters.map(c => c.id));
              
              // Get all local badges
              const allLocalBadges = await query<{ id: string; counter_id: string }>(
                'SELECT id, counter_id FROM lc_badges WHERE user_id = ? AND deleted_at IS NULL',
                [user.id]
              );
              
              // Find badges whose counters don't exist in Supabase
              const orphanedBadges = allLocalBadges.filter(b => 
                !supabaseCounterIds.has(b.counter_id)
              );
              
              if (orphanedBadges.length > 0) {
                const now = new Date().toISOString();
                let deletedCount = 0;
                
                for (const badge of orphanedBadges) {
                  try {
                    await execute(
                      'UPDATE lc_badges SET deleted_at = ?, updated_at = ? WHERE id = ?',
                      [now, now, badge.id]
                    );
                    deletedCount++;
                  } catch (error) {
                    logger.warn(`[SYNC] Error cleaning up orphaned badge ${badge.id}:`, error);
                  }
                }
                
                if (deletedCount > 0) {
                  logger.log(`[SYNC] Cleaned up ${deletedCount} orphaned badge(s) for counters that don't exist in Supabase`);
                }
              }
            }
          } catch (badgeCleanupError) {
            logger.warn('[SYNC] Error cleaning up orphaned badges after sync:', badgeCleanupError);
            // Don't fail sync if badge cleanup fails
          }
        } catch (cleanupError) {
          logger.error('[SYNC] Error during post-sync cleanup:', cleanupError);
          // Don't fail the sync if cleanup fails, but log the error
        }

        const now = new Date().toISOString();
        await AsyncStorage.setItem('last_synced_at', now);
        lastSyncTimeRef.current = Date.now();
        
        setSyncState((prev) => ({
          ...prev,
          isSyncing: false,
          lastSyncedAt: now,
        }));
        
        // Don't reload counters here - the store is already managed correctly
        // Reloading could bring back deleted counters if there's a timing issue
        // Instead, only reload counters that were actually merged during pullChanges
      } catch (error) {
        const parsedError = parseError(error || 'Unknown error occurred during sync');
        const errorMessage = (parsedError.isNetworkError || parsedError.shouldRetry)
          ? `${parsedError.message}. Sync will retry automatically.`
          : parsedError.message;
        
        setSyncState((prev) => ({
          ...prev,
          isSyncing: false,
          error: errorMessage,
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

  // CRITICAL: Conflict resolution - compare updated_at timestamps
  // If local version is newer, keep local version and push it on next sync
  // If server version is newer, update local version
  if (existing && existing.updated_at && counter.updated_at) {
    try {
      const localUpdated = new Date(existing.updated_at).getTime();
      const serverUpdated = new Date(counter.updated_at).getTime();
      
      // If local is newer (within 1 second tolerance for clock drift), log potential conflict
      if (localUpdated > serverUpdated + 1000) {
        logger.warn('[SYNC] Potential conflict detected - local version is newer', {
          counterId: counter.id,
          counterName: counter.name,
          localUpdated: existing.updated_at,
          serverUpdated: counter.updated_at,
          difference: localUpdated - serverUpdated,
        });
        // For now, use last-write-wins (server version) but log the conflict
        // Future: Could implement field-level merging or user choice
      }
    } catch (dateError) {
      logger.error('[SYNC] Error comparing timestamps for conflict detection:', dateError);
      // Continue with merge if timestamp comparison fails
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
      // A counter with the same name already exists (and is not deleted)
      // Keep the existing one, don't insert the duplicate
      logger.log(`[SYNC] mergeCounter: ⚠️ Skipping duplicate counter ${counter.id} (${counter.name}) - counter with same name already exists (${duplicateByName.id})`);
      
      // If the incoming counter is newer, update the existing one instead
      const incomingTime = new Date(counter.updated_at).getTime();
      const existingTime = new Date(duplicateByName.updated_at).getTime();
      
      if (incomingTime > existingTime) {
        logger.log(`[SYNC] mergeCounter: Updating existing counter ${duplicateByName.id} with newer data from ${counter.id}`);
        await execute(
          `UPDATE lc_counters SET 
            emoji = ?, color = ?, unit = ?, enable_streak = ?,
            sort_index = ?, total = ?, last_activity_date = ?, updated_at = ?
          WHERE id = ?`,
          [
            counter.emoji,
            counter.color,
            counter.unit,
            counter.enable_streak ? 1 : 0,
            counter.sort_index,
            counter.total,
            counter.last_activity_date,
            counter.updated_at,
            duplicateByName.id,
          ]
        );
        return true;
      }
      
      return false; // Don't insert duplicate
    }
    
    // Insert new counter only if it's not deleted and not a duplicate
    await execute(
      `INSERT INTO lc_counters (
        id, user_id, name, emoji, color, unit, enable_streak,
        sort_index, total, last_activity_date, deleted_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      
      await execute(
        `UPDATE lc_counters SET 
          name = ?, emoji = ?, color = ?, unit = ?, enable_streak = ?,
          sort_index = ?, total = ?, last_activity_date = ?, deleted_at = ?, updated_at = ?
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

