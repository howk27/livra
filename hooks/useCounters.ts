import { useEffect, useCallback } from 'react';
import { InteractionManager, AppState } from 'react-native';
import { useMarksStore } from '../state/countersSlice';
import { useEventsStore } from '../state/eventsSlice';
import { Mark } from '../types';
import { formatDate } from '../lib/date';
import { computeStreak, updateStreakInDB } from './useStreaks';
import { useAuth } from './useAuth';
import { useSync } from './useSync';
import { useBadges } from './useBadges';
import { useIapSubscriptions } from './useIapSubscriptions';
import { logger } from '../lib/utils/logger';
import { checkGatingRules } from '../lib/gating';

const FREE_COUNTER_LIMIT = 3;

// Helper function to validate UUID
const isValidUUID = (str: string): boolean => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
};

export const useMarks = () => {
  // CRITICAL: Use selectors to ensure reactivity - destructuring breaks Zustand's change detection
  // Each selector creates a separate subscription, ensuring components re-render when that specific value changes
  const marks = useMarksStore((state) => state.marks);
  const loading = useMarksStore((state) => state.loading);
  const error = useMarksStore((state) => state.error);
  const loadMarks = useMarksStore((state) => state.loadMarks);
  const addMarkAction = useMarksStore((state) => state.addMark);
  const updateMarkAction = useMarksStore((state) => state.updateMark);
  const deleteMarkAction = useMarksStore((state) => state.deleteMark);
  const getMark = useMarksStore((state) => state.getMark);

  // CRITICAL: Use selectors for events store too to ensure reactivity
  const addEvent = useEventsStore((state) => state.addEvent);
  const loadEvents = useEventsStore((state) => state.loadEvents);
  const events = useEventsStore((state) => state.events);
  const getEventsByMark = useEventsStore((state) => state.getEventsByMark);
  const getLastIncrementEvent = useEventsStore((state) => state.getLastIncrementEvent);
  const getIncrementsToday = useEventsStore((state) => state.getIncrementsToday);
  const { user } = useAuth();
  const { sync } = useSync();
  const { isProUnlocked } = useIapSubscriptions();
  const {
    recordDailyLogin,
    lastLoginDate,
    evaluateMarkBadges,
  } = useBadges(user?.id);

  useEffect(() => {
    if (user?.id) {
      loadMarks(user.id);
      loadEvents(undefined, user.id);
    } else {
      loadMarks();
      loadEvents();
    }
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    const today = formatDate(new Date());
    if (lastLoginDate === today) return;

    recordDailyLogin(user.id).catch((error) => {
      logger.error('Error recording daily login:', error);
    });
  }, [user?.id, lastLoginDate, recordDailyLogin]);

  const createMark = useCallback(
    async (data: {
      name: string;
      emoji?: string;
      color?: string;
      unit?: 'sessions' | 'days' | 'items';
      enable_streak?: boolean;
      user_id: string;
      skipSync?: boolean; // Optional flag to skip sync (useful for batch operations)
    }) => {
      // Check counter limit for free users (skip check if skipSync is true - used for onboarding)
      if (!data.skipSync && !isProUnlocked) {
        // Count only active (non-deleted) counters
        const activeCounters = marks.filter((m) => !m.deleted_at);
        if (activeCounters.length >= FREE_COUNTER_LIMIT) {
          throw new Error(`FREE_COUNTER_LIMIT_REACHED: Upgrade to Livra+ to create more than ${FREE_COUNTER_LIMIT} counters`);
        }
      }

      const mark = await addMarkAction({
        name: data.name,
        emoji: data.emoji,
        color: data.color || '#3B82F6',
        unit: data.unit || 'sessions',
        enable_streak: data.enable_streak ?? true,
        sort_index: marks.length,
        user_id: data.user_id,
        total: 0,
      });

      // Sync to Supabase after creating mark
      // Skip sync if flag is set (useful for batch operations like onboarding)
      // Don't await - let it happen in background to avoid blocking UI
      if (user && !data.skipSync) {
        sync().catch((error) => {
          logger.error('Error syncing after mark creation:', error);
        });
      }

      evaluateMarkBadges(mark.id, data.user_id).catch((error) => {
        logger.error('Error initializing badges for new mark:', error);
      });

      return mark;
    },
    [addMarkAction, marks, marks.length, user, sync, evaluateMarkBadges, isProUnlocked]
  );

  const incrementMark = useCallback(
    async (markId: string, userId: string, amount: number = 1) => {
      logger.log('[INCREMENT] ===== START INCREMENT =====', {
        markId,
        userId,
        amount,
        timestamp: new Date().toISOString(),
      });

      // CRITICAL: Require valid authenticated user (user_id must be a valid UUID)
      if (!userId || !isValidUUID(userId)) {
        logger.error('[INCREMENT] Invalid user ID', { userId });
        throw new Error('Cannot increment mark: user must be authenticated with a valid user_id');
      }

      // Get mark first
      const mark = getMark(markId);
      if (!mark) {
        logger.error('[INCREMENT] Mark not found', { markId });
        throw new Error('Mark not found');
      }

      logger.log('[INCREMENT] Mark found:', {
        markId: mark.id,
        markName: mark.name,
        currentTotal: mark.total,
        gated: mark.gated,
        gateType: mark.gate_type,
        lastActivityDate: mark.last_activity_date,
      });

      // CRITICAL: Use device local time for event date (prevents date manipulation)
      // Server will validate timestamp on sync, but local date should match device timezone
      const now = new Date();
      const today = formatDate(now); // Local timezone date string (yyyy-MM-dd)
      
      // Validate date is not in future (prevent manipulation)
      // Allow small buffer (5 minutes) for clock drift
      const maxAllowedDate = new Date();
      maxAllowedDate.setMinutes(maxAllowedDate.getMinutes() + 5);
      if (now.getTime() > maxAllowedDate.getTime()) {
        logger.error('[Counters] Event timestamp is in future - possible date manipulation. Rejecting event.', {
          eventTime: now.toISOString(),
          maxAllowed: maxAllowedDate.toISOString(),
        });
        throw new Error('Event timestamp is in the future');
      }
      
      // Validate date is not too far in the past (more than 1 year)
      const minAllowedDate = new Date();
      minAllowedDate.setFullYear(minAllowedDate.getFullYear() - 1);
      if (now.getTime() < minAllowedDate.getTime()) {
        logger.error('[Counters] Event timestamp is too far in the past. Rejecting event.', {
          eventTime: now.toISOString(),
          minAllowed: minAllowedDate.toISOString(),
        });
        throw new Error('Event timestamp is too far in the past');
      }

      // Check gating rules BEFORE proceeding with increment
      // This must happen synchronously to prevent invalid increments
      try {
        // Get events needed for gating check
        const markEvents = getEventsByMark(markId);
        logger.log('[INCREMENT] Gating check:', {
          markId,
          eventCount: markEvents.length,
          hasIncrementEvents: markEvents.filter(e => e.event_type === 'increment').length,
        });
        
        // Check gating rules
        const gatingResult = checkGatingRules(mark, userId, markEvents, now);
        logger.log('[INCREMENT] Gating result:', {
          markId,
          allowed: gatingResult.allowed,
          reason: gatingResult.reason,
          remainingMinutes: gatingResult.remainingMinutes,
        });
        
        if (!gatingResult.allowed) {
          logger.warn('[INCREMENT] BLOCKED by gating:', {
            markId,
            reason: gatingResult.reason,
          });
          // Create a custom error with the gating reason
          const error = new Error(gatingResult.reason || 'Increment not allowed');
          (error as any).gatingBlocked = true;
          (error as any).remainingMinutes = gatingResult.remainingMinutes;
          throw error;
        }
        logger.log('[INCREMENT] Gating check passed');
      } catch (error) {
        // Re-throw gating errors
        if ((error as any).gatingBlocked) {
          logger.warn('[INCREMENT] Gating error re-thrown:', {
            markId,
            error: error instanceof Error ? error.message : String(error),
          });
          throw error;
        }
        // Log other errors but allow increment to proceed (fail open)
        logger.error('[INCREMENT] Error checking gating rules, allowing increment:', error);
      }
      
      // CRITICAL: Update store SYNCHRONOUSLY so navigation sees the updated value
      // The component's optimistic state handles the immediate UI update, but the store
      // must also be updated immediately so that when user navigates, the detail screen
      // sees the correct value
      // Ensure total is a valid number (handle undefined/null cases)
      const currentTotal = typeof mark.total === 'number' ? mark.total : 0;
      const newTotal = currentTotal + amount;
      logger.log('[INCREMENT] Updating store:', {
        markId,
        currentTotal,
        amount,
        newTotal,
      });
      
      const updatedMark = { ...mark, total: newTotal, last_activity_date: today, updated_at: now.toISOString() };
      
      // Update store immediately (synchronous)
      // CRITICAL: Also track this update in recentUpdates to prevent loadMarks from overwriting it
      useMarksStore.setState((state) => {
        const newRecentUpdates = new Map(state.recentUpdates || new Map());
        newRecentUpdates.set(markId, { total: newTotal, timestamp: Date.now() });
        logger.log('[INCREMENT] Store state updated:', {
          markId,
          newTotal,
          recentUpdatesSize: newRecentUpdates.size,
        });
        return {
          marks: state.marks.map((m) => (m.id === markId ? updatedMark : m)),
          recentUpdates: newRecentUpdates,
        };
      });

      // CRITICAL: Persist to database IMMEDIATELY and AWAIT completion
      // This ensures the write completes before any navigation or sync can overwrite it
      // Use updateMarkAction which tracks pending writes and preserves optimistic updates
      logger.log('[INCREMENT] Starting DB write:', {
        markId,
        newTotal,
        lastActivityDate: today,
      });
      
      try {
        await updateMarkAction(markId, {
          total: newTotal,
          last_activity_date: today,
        });
        // Write completed successfully - the optimistic update is now persisted
        logger.log('[INCREMENT] ✅ DB write completed successfully:', { markId, newTotal });
        
        // Verify the write by reading back from DB
        const { queryFirst } = await import('../lib/db');
        const verifyMark = await queryFirst<{ total: number }>(
          'SELECT total FROM lc_counters WHERE id = ?',
          [markId]
        );
        logger.log('[INCREMENT] DB verification read:', {
          markId,
          dbTotal: verifyMark?.total,
          expectedTotal: newTotal,
          match: verifyMark?.total === newTotal,
        });
      } catch (error) {
        logger.error('[INCREMENT] ❌ DB write FAILED:', {
          markId,
          newTotal,
          error: error instanceof Error ? error.message : String(error),
          errorStack: error instanceof Error ? error.stack : undefined,
        });
        // On error, reload from database but preserve the optimistic update if it's newer
        // Don't immediately reload as that would overwrite the optimistic update
        // Instead, let the next sync handle it, or reload after a delay
        setTimeout(() => {
          loadMarks(userId).catch((err) => {
            logger.error('[INCREMENT] Error reloading marks after failed update:', err);
          });
        }, 1000); // Delay to allow database write to complete if it's just slow
      }

      // CRITICAL: Add event IMMEDIATELY (not deferred) so stats screen can update in real-time
      // The event store update triggers reactivity in components that depend on events (ring, pie chart)
      logger.log('[INCREMENT] Adding event immediately:', {
        markId,
        eventType: 'increment',
        amount,
        occurred_at: now.toISOString(),
        occurred_local_date: today,
      });

      // Add event immediately (not in InteractionManager) so UI updates instantly
      // CRITICAL: occurred_local_date must match device local timezone
      addEvent({
        mark_id: markId,
        user_id: userId,
        event_type: 'increment',
        amount,
        occurred_at: now.toISOString(),
        occurred_local_date: today,
      })
      .then(() => {
        logger.log('[INCREMENT] ✅ Event added successfully:', { markId });
      })
      .catch((error) => {
        logger.error('[INCREMENT] ❌ Error adding event after increment:', {
          markId,
          error: error instanceof Error ? error.message : String(error),
        });
      });

      // Defer non-critical operations to avoid blocking the main thread
      InteractionManager.runAfterInteractions(() => {
        // Update streak if enabled (don't await - let it happen in background)
        if (mark.enable_streak) {
          setTimeout(() => {
            const markEvents = getEventsByMark(markId);
            const streakData = computeStreak(markEvents);
            updateStreakInDB(markId, userId, streakData).catch((error) => {
              logger.error('[INCREMENT] Error updating streak after increment:', error);
            });
          }, 50);
        }

        // Evaluate badges (don't await - let it happen in background)
        evaluateMarkBadges(markId, userId).catch((error) => {
          logger.error('[INCREMENT] Error evaluating badges after increment:', error);
        });
        
        logger.log('[INCREMENT] ===== END INCREMENT (background tasks started) =====', {
          markId,
          finalTotal: newTotal,
        });
      });
    },
    [getMark, addEvent, updateMarkAction, getEventsByMark, loadMarks, evaluateMarkBadges, checkGatingRules]
  );

  const decrementMark = useCallback(
    async (markId: string, userId: string, amount: number = 1) => {
      logger.log('[DECREMENT] ===== START DECREMENT =====', {
        markId,
        userId,
        amount,
        timestamp: new Date().toISOString(),
      });

      // CRITICAL: Require valid authenticated user (user_id must be a valid UUID)
      if (!userId || !isValidUUID(userId)) {
        logger.error('[DECREMENT] Invalid user ID', { userId });
        throw new Error('Cannot decrement mark: user must be authenticated with a valid user_id');
      }

      const mark = getMark(markId);
      if (!mark || mark.total < amount) {
        logger.warn('[DECREMENT] Cannot decrement - mark not found or insufficient total', {
          markId,
          markTotal: mark?.total,
          amount,
        });
        return;
      }

      logger.log('[DECREMENT] Mark found:', {
        markId: mark.id,
        markName: mark.name,
        currentTotal: mark.total,
      });

      const now = new Date();
      const today = formatDate(now);
      const newTotal = Math.max(0, mark.total - amount);
      
      logger.log('[DECREMENT] Calculating new total:', {
        markId,
        currentTotal: mark.total,
        amount,
        newTotal,
      });

      // CRITICAL: Update store SYNCHRONOUSLY so navigation sees the updated value
      // The component's optimistic state handles the immediate UI update, but the store
      // must also be updated immediately so that when user navigates, the detail screen
      // sees the correct value
      // CRITICAL: Also track this update in recentUpdates to prevent loadMarks from overwriting it
      const updatedMark = { ...mark, total: newTotal, last_activity_date: today, updated_at: now.toISOString() };
      logger.log('[DECREMENT] Updating store:', {
        markId,
        currentTotal: mark.total,
        amount,
        newTotal,
      });
      
      useMarksStore.setState((state) => {
        const newRecentUpdates = new Map(state.recentUpdates || new Map());
        newRecentUpdates.set(markId, { total: newTotal, timestamp: Date.now() });
        logger.log('[DECREMENT] Store state updated:', {
          markId,
          newTotal,
          recentUpdatesSize: newRecentUpdates.size,
          storeMarksCount: state.marks.length,
        });
        return {
          marks: state.marks.map((m) => (m.id === markId ? updatedMark : m)),
          recentUpdates: newRecentUpdates,
        };
      });

      // CRITICAL: Persist to database IMMEDIATELY and AWAIT completion
      // This ensures the write completes before any navigation or sync can overwrite it
      logger.log('[DECREMENT] Starting DB write:', {
        markId,
        newTotal,
        lastActivityDate: today,
      });
      
      try {
        await updateMarkAction(markId, {
          total: newTotal,
          last_activity_date: today,
        });
        // Write completed successfully - the optimistic update is now persisted
        logger.log('[DECREMENT] ✅ DB write completed successfully:', { markId, newTotal });
        
        // Verify the write by reading back from DB
        const { queryFirst } = await import('../lib/db');
        const verifyMark = await queryFirst<{ total: number }>(
          'SELECT total FROM lc_counters WHERE id = ?',
          [markId]
        );
        logger.log('[DECREMENT] DB verification read:', {
          markId,
          dbTotal: verifyMark?.total,
          expectedTotal: newTotal,
          match: verifyMark?.total === newTotal,
        });
      } catch (error) {
        logger.error('[DECREMENT] ❌ DB write FAILED:', {
          markId,
          newTotal,
          error: error instanceof Error ? error.message : String(error),
        });
        // On error, reload from database but preserve the optimistic update if it's newer
        setTimeout(() => {
          loadMarks(userId).catch((err) => {
            logger.error('[DECREMENT] Error reloading marks after failed update:', err);
          });
        }, 1000); // Delay to allow database write to complete if it's just slow
      }

      // CRITICAL: Add event IMMEDIATELY (not deferred) so chart/ring update instantly
      // The event store update triggers reactivity in components
      logger.log('[DECREMENT] Adding event immediately:', {
        markId,
        eventType: 'decrement',
        amount,
        occurred_at: now.toISOString(),
        occurred_local_date: today,
      });

      // Add event immediately (don't defer) so UI updates instantly
      // CRITICAL: Decrement events must be added so charts can recalculate
      addEvent({
        mark_id: markId,
        user_id: userId,
        event_type: 'decrement',
        amount,
        occurred_at: now.toISOString(),
        occurred_local_date: today,
      })
      .then(() => {
        logger.log('[DECREMENT] ✅ Event added successfully:', { markId });
      })
      .catch((error) => {
        logger.error('[DECREMENT] ❌ Error adding event after decrement:', {
          markId,
          error: error instanceof Error ? error.message : String(error),
        });
      });

      // Defer other non-critical operations to avoid blocking the main thread
      InteractionManager.runAfterInteractions(() => {

        evaluateMarkBadges(markId, userId).catch((error) => {
          logger.error('Error evaluating badges after decrement:', error);
        });

        // DON'T sync on every decrement - sync is throttled and will happen automatically
      });
    },
    [getMark, addEvent, updateMarkAction, loadMarks, evaluateMarkBadges]
  );

  const resetMark = useCallback(
    async (markId: string, userId: string) => {
      const mark = getMark(markId);
      if (!mark) return;

      const now = new Date();
      const today = formatDate(now);

      // Add reset event
      await addEvent({
        mark_id: markId,
        user_id: userId,
        event_type: 'reset',
        amount: mark.total,
        occurred_at: now.toISOString(),
        occurred_local_date: today,
      });

      // Reset mark total
      await updateMarkAction(markId, {
        total: 0,
        last_activity_date: today,
      });

      // Reset streak if enabled
      if (mark.enable_streak) {
        await updateStreakInDB(markId, userId, {
          current: 0,
          longest: 0,
        });
      }

      evaluateMarkBadges(markId, userId).catch((error) => {
        logger.error('Error evaluating badges after reset:', error);
      });

      // Sync to Supabase after resetting
      if (user) {
        sync().catch((error) => {
          logger.error('Error syncing after mark reset:', error);
        });
      }
    },
    [getMark, addEvent, updateMarkAction, user, sync]
  );

  const updateMark = useCallback(
    async (
      markId: string,
      updates: {
        name?: string;
        emoji?: string;
        color?: string;
        unit?: 'sessions' | 'days' | 'items';
        enable_streak?: boolean;
      }
    ) => {
      await updateMarkAction(markId, updates);

      // Sync to Supabase after updating
      if (user) {
        sync().catch((error) => {
          logger.error('Error syncing after mark update:', error);
        });
      }
    },
    [updateMarkAction, user, sync]
  );

  const deleteMark = useCallback(
    async (markId: string) => {
      await deleteMarkAction(markId);

      // CRITICAL: Immediately and synchronously sync to Supabase after deleting
      // This ensures the deletion is pushed before any other sync operations
      // Don't reload marks - the store is already updated by deleteMarkAction
      if (user) {
        try {
          await sync(); // AWAIT the sync to ensure it completes before continuing
        } catch (error) {
          logger.error('Error syncing after mark delete:', error);
          // Don't throw - deletion is already done locally
        }
      }
    },
    [deleteMarkAction, user, sync]
  );

  return {
    marks,
    loading,
    error,
    createMark,
    incrementMark,
    decrementMark,
    resetMark,
    updateMark,
    deleteMark,
    getMark,
  };
};

// Export as useCounters for backwards compatibility
// Maps the "Marks" API to the "Counters" API expected by the rest of the codebase
export const useCounters = () => {
  const {
    marks: counters,
    loading,
    error,
    createMark: createCounter,
    incrementMark: incrementCounter,
    decrementMark: decrementCounter,
    resetMark: resetCounter,
    updateMark: updateCounter,
    deleteMark: deleteCounter,
    getMark: getCounter,
  } = useMarks();

  return {
    counters,
    loading,
    error,
    createCounter,
    incrementCounter,
    decrementCounter,
    resetCounter,
    updateCounter,
    deleteCounter,
    getCounter,
  };
};

