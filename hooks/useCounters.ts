import { useEffect, useCallback } from 'react';
import { InteractionManager } from 'react-native';
import { useMarksStore } from '../state/countersSlice';
import { useEventsStore } from '../state/eventsSlice';
import { Mark } from '../types';
import { formatDate } from '../lib/date';
import { computeStreak, updateStreakInDB } from './useStreaks';
import { useAuth } from './useAuth';
import { useSync } from './useSync';
import { useBadges } from './useBadges';
import { useIAP } from './useIAP';
import { logger } from '../lib/utils/logger';

const FREE_COUNTER_LIMIT = 3;

export const useMarks = () => {
  const {
    marks,
    loading,
    error,
    loadMarks,
    addMark: addMarkAction,
    updateMark: updateMarkAction,
    deleteMark: deleteMarkAction,
    getMark,
  } = useMarksStore();

  const { addEvent, loadEvents, events, getEventsByMark } = useEventsStore();
  const { user } = useAuth();
  const { sync } = useSync();
  const { isProUnlocked } = useIAP();
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
      // NO SYNCHRONOUS OPERATIONS - Everything happens asynchronously
      // The component's optimistic state handles the immediate UI update
      
      // Defer ALL work to avoid blocking the main thread
      InteractionManager.runAfterInteractions(() => {
        // Get mark asynchronously (non-blocking)
        const mark = getMark(markId);
        if (!mark) return;

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
          // Reject the event - don't allow future dates
          return;
        }
        
        // Validate date is not too far in the past (more than 1 year)
        const minAllowedDate = new Date();
        minAllowedDate.setFullYear(minAllowedDate.getFullYear() - 1);
        if (now.getTime() < minAllowedDate.getTime()) {
          logger.error('[Counters] Event timestamp is too far in the past. Rejecting event.', {
            eventTime: now.toISOString(),
            minAllowed: minAllowedDate.toISOString(),
          });
          // Reject the event - don't allow dates more than 1 year old
          return;
        }
        
        const newTotal = mark.total + amount;

        // Update store (async, non-blocking)
        const updatedMark = { ...mark, total: newTotal, last_activity_date: today, updated_at: now.toISOString() };
        useMarksStore.setState((state) => ({
          marks: state.marks.map((m) => (m.id === markId ? updatedMark : m)),
        }));

        // Persist to database (don't await - non-blocking)
        updateMarkAction(markId, {
          total: newTotal,
          last_activity_date: today,
        }).catch((error) => {
          logger.error('Error persisting mark update:', error);
          loadMarks(userId).catch((err) => {
            logger.error('Error reloading marks after failed update:', err);
          });
        });

        // Add event (don't await - let it happen in background)
        // CRITICAL: occurred_local_date must match device local timezone
        // occurred_at is UTC timestamp for server, occurred_local_date is local date string
        addEvent({
          mark_id: markId,
          user_id: userId,
          event_type: 'increment',
          amount,
          occurred_at: now.toISOString(), // UTC timestamp for server
          occurred_local_date: today, // Local date string (yyyy-MM-dd) - consistent with streak calculation
        }).catch((error) => {
          logger.error('Error adding event after increment:', error);
        });

        // Update streak if enabled (don't await - let it happen in background)
        // CRITICAL: Streak is calculated optimistically from local events
        // After sync completes, streak will be recalculated from synced events
        if (mark.enable_streak) {
          setTimeout(() => {
            const markEvents = getEventsByMark(markId);
            const streakData = computeStreak(markEvents);
            // Store streak locally - it will be authoritative until sync completes
            updateStreakInDB(markId, userId, streakData).catch((error) => {
              logger.error('Error updating streak after increment:', error);
            });
          }, 50);
        }

        // Evaluate badges (don't await - let it happen in background)
        evaluateMarkBadges(markId, userId).catch((error) => {
          logger.error('Error evaluating badges after increment:', error);
        });

        // DON'T sync on every increment - sync is throttled and will happen automatically
        // Only sync if explicitly needed (e.g., after batch operations)
      });
    },
    [getMark, addEvent, updateMarkAction, getEventsByMark, loadMarks, evaluateMarkBadges]
  );

  const decrementMark = useCallback(
    async (markId: string, userId: string, amount: number = 1) => {
      // NO SYNCHRONOUS OPERATIONS - Everything happens asynchronously
      // The component's optimistic state handles the immediate UI update
      
      // Defer ALL work to avoid blocking the main thread
      InteractionManager.runAfterInteractions(() => {
        const mark = getMark(markId);
        if (!mark || mark.total < amount) return;

        const now = new Date();
        const today = formatDate(now);
        const newTotal = Math.max(0, mark.total - amount);

        // Update store (async, non-blocking)
        const updatedMark = { ...mark, total: newTotal, last_activity_date: today, updated_at: now.toISOString() };
        useMarksStore.setState((state) => ({
          marks: state.marks.map((m) => (m.id === markId ? updatedMark : m)),
        }));

        // Persist to database (don't await - non-blocking)
        updateMarkAction(markId, {
          total: newTotal,
          last_activity_date: today,
        }).catch((error) => {
          logger.error('Error persisting mark update:', error);
          loadMarks(userId).catch((err) => {
            logger.error('Error reloading marks after failed update:', err);
          });
        });

        // Add event (don't await - let it happen in background)
        addEvent({
          mark_id: markId,
          user_id: userId,
          event_type: 'decrement',
          amount,
          occurred_at: now.toISOString(),
          occurred_local_date: today,
        }).catch((error) => {
          logger.error('Error adding event after decrement:', error);
        });

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

