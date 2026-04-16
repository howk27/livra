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
import { getAppDate, getAppDateTime, isDebugAppDateActive } from '../lib/appDate';
import { useAppDateStore } from '../state/appDateSlice';
import { updateNotifications } from '../services/notificationService';

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
  const { user } = useAuth();
  const { sync } = useSync();
  const { isProUnlocked, proStatus } = useIapSubscriptions();
  const {
    recordDailyLogin,
    lastLoginDate,
    evaluateMarkBadges,
  } = useBadges(user?.id);
  const appDateKey = useAppDateStore((s) => s.debugDateOverride ?? '');

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
    const today = formatDate(getAppDate());
    if (lastLoginDate === today) return;

    recordDailyLogin(user.id).catch((error) => {
      logger.error('Error recording daily login:', error);
    });
  }, [user?.id, lastLoginDate, recordDailyLogin, appDateKey]);

  const createMark = useCallback(
    async (data: {
      name: string;
      emoji?: string;
      color?: string;
      unit?: 'sessions' | 'days' | 'items';
      enable_streak?: boolean;
      user_id: string;
      dailyTarget?: number | null;
      schedule_type?: string;
      schedule_days?: string;
      goal_value?: number | null;
      goal_period?: string | null;
      skipSync?: boolean; // Optional flag to skip sync (useful for batch operations)
    }) => {
      // Check counter limit for free users (skip check if skipSync is true - used for onboarding)
      if (!data.skipSync && !isProUnlocked) {
        if (proStatus.verification === 'unverified' && proStatus.status === 'unknown') {
          throw new Error('PRO_STATUS_UNKNOWN: Unable to verify subscription. Please try again.');
        }
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
        dailyTarget: data.dailyTarget ?? 1,
        schedule_type: (data.schedule_type as any) ?? 'daily',
        schedule_days: data.schedule_days,
        goal_value: data.goal_value,
        goal_period: data.goal_period as any,
      });

      // Sync to Supabase after creating mark
      // Skip sync if flag is set (useful for batch operations like onboarding)
      // Don't await - let it happen in background to avoid blocking UI
      if (user && !data.skipSync) {
        sync().catch((error) => {
          logger.error('Error syncing after mark creation:', error);
        });
      }

      void updateNotifications(data.user_id);

      evaluateMarkBadges(mark.id, data.user_id).catch((error) => {
        logger.error('Error initializing badges for new mark:', error);
      });

      return mark;
    },
    [
      addMarkAction,
      marks,
      marks.length,
      user,
      sync,
      evaluateMarkBadges,
      isProUnlocked,
      proStatus.status,
      proStatus.verification,
    ]
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
        lastActivityDate: mark.last_activity_date,
      });

      // CRITICAL: Use device local time for event date (prevents date manipulation)
      // Server will validate timestamp on sync, but local date should match device timezone
      const now = getAppDateTime();
      const today = formatDate(now); // Local timezone date string (yyyy-MM-dd)
      
      if (!isDebugAppDateActive()) {
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
      }

      // Livra 2.0: no increment gating — schedule/daily target are planning metadata only.

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
        await addEvent({
          mark_id: markId,
          user_id: userId,
          event_type: 'increment',
          amount,
          occurred_at: now.toISOString(),
          occurred_local_date: today,
        });
        logger.log('[INCREMENT] ✅ Counter and event persisted:', { markId, newTotal });
      } catch (error) {
        logger.error('[INCREMENT] ❌ Persist failed — reverting counter row to pre-increment state', {
          markId,
          newTotal,
          error: error instanceof Error ? error.message : String(error),
        });
        try {
          await updateMarkAction(markId, {
            total: currentTotal,
            last_activity_date: mark.last_activity_date,
          });
        } catch (revertErr) {
          logger.error('[INCREMENT] Revert counter total failed:', revertErr);
          const { reconcileMarkTotalWithPersistedEvents } = await import(
            '../lib/db/markTotalReconciliation'
          );
          await reconcileMarkTotalWithPersistedEvents(userId, markId).catch((reconcileErr) => {
            logger.error('[INCREMENT] reconcile after failed revert failed', {
              markId,
              message: reconcileErr instanceof Error ? reconcileErr.message : String(reconcileErr),
            });
          });
        }
        useMarksStore.setState((state) => {
          const ru = new Map(state.recentUpdates || new Map());
          ru.delete(markId);
          return {
            marks: state.marks.map((m) => (m.id === markId ? mark : m)),
            recentUpdates: ru,
          };
        });
        loadMarks(userId).catch((err) => {
          logger.error('[INCREMENT] loadMarks after revert failed:', err);
        });
        throw error;
      }

      // Defer non-critical operations to avoid blocking the main thread
      InteractionManager.runAfterInteractions(() => {
        // Update streak if enabled (don't await - let it happen in background)
        if (mark.enable_streak) {
          setTimeout(() => {
            const markEvents = getEventsByMark(markId);
            const streakData = computeStreak(markEvents, getAppDate());
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
    [getMark, addEvent, updateMarkAction, getEventsByMark, loadMarks, evaluateMarkBadges]
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

      const now = getAppDateTime();
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
      
      const previousTotal = mark.total;
      try {
        await updateMarkAction(markId, {
          total: newTotal,
          last_activity_date: today,
        });
        await addEvent({
          mark_id: markId,
          user_id: userId,
          event_type: 'decrement',
          amount,
          occurred_at: now.toISOString(),
          occurred_local_date: today,
        });
        logger.log('[DECREMENT] ✅ Counter and event persisted:', { markId, newTotal });
      } catch (error) {
        logger.error('[DECREMENT] ❌ Persist failed — reverting counter', {
          markId,
          error: error instanceof Error ? error.message : String(error),
        });
        try {
          await updateMarkAction(markId, {
            total: previousTotal,
            last_activity_date: mark.last_activity_date,
          });
        } catch (revertErr) {
          logger.error('[DECREMENT] Revert counter total failed:', revertErr);
          const { reconcileMarkTotalWithPersistedEvents } = await import(
            '../lib/db/markTotalReconciliation'
          );
          await reconcileMarkTotalWithPersistedEvents(userId, markId).catch((reconcileErr) => {
            logger.error('[DECREMENT] reconcile after failed revert failed', {
              markId,
              message: reconcileErr instanceof Error ? reconcileErr.message : String(reconcileErr),
            });
          });
        }
        useMarksStore.setState((state) => {
          const ru = new Map(state.recentUpdates || new Map());
          ru.delete(markId);
          return {
            marks: state.marks.map((m) => (m.id === markId ? mark : m)),
            recentUpdates: ru,
          };
        });
        loadMarks(userId).catch((err) => {
          logger.error('[DECREMENT] loadMarks after revert failed:', err);
        });
        throw error;
      }

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

      const now = getAppDateTime();
      const today = formatDate(now);

      try {
        await addEvent({
          mark_id: markId,
          user_id: userId,
          event_type: 'reset',
          amount: mark.total,
          occurred_at: now.toISOString(),
          occurred_local_date: today,
        });

        await updateMarkAction(markId, {
          total: 0,
          last_activity_date: today,
        });
      } catch (error) {
        const { reconcileMarkTotalWithPersistedEvents } = await import('../lib/db/markTotalReconciliation');
        await reconcileMarkTotalWithPersistedEvents(userId, markId).catch((reconcileErr) => {
          logger.error('[RESET_MARK] reconcile after persist error failed', {
            markId,
            message: reconcileErr instanceof Error ? reconcileErr.message : String(reconcileErr),
          });
        });
        loadMarks(userId).catch((loadErr) => {
          logger.error('[RESET_MARK] loadMarks after persist error failed', {
            markId,
            message: loadErr instanceof Error ? loadErr.message : String(loadErr),
          });
        });
        throw error;
      }

      if (mark.enable_streak) {
        await updateStreakInDB(markId, userId, {
          current: 0,
          longest: 0,
        });
      }

      evaluateMarkBadges(markId, userId).catch((error) => {
        logger.error('Error evaluating badges after reset:', error);
      });

      if (user) {
        sync().catch((error) => {
          logger.error('Error syncing after mark reset:', error);
        });
      }
    },
    [getMark, addEvent, updateMarkAction, user, sync, loadMarks]
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
        dailyTarget?: number | null;
        schedule_type?: string;
        schedule_days?: string;
        goal_value?: number | null;
        goal_period?: string | null;
      }
    ) => {
      await updateMarkAction(markId, updates);

      // Sync to Supabase after updating
      if (user) {
        sync().catch((error) => {
          logger.error('Error syncing after mark update:', error);
        });
      }
      const m = getMark(markId);
      if (m?.user_id) void updateNotifications(m.user_id);
    },
    [updateMarkAction, user, sync, getMark]
  );

  const deleteMark = useCallback(
    async (markId: string) => {
      await deleteMarkAction(markId);

      // CRITICAL: Immediately and synchronously sync to Supabase after deleting
      // This ensures the deletion is pushed before any other sync operations
      // Don't reload marks - the store is already updated by deleteMarkAction
      if (user) {
        try {
          await sync({ bypassThrottle: true });
        } catch (error) {
          logger.error('Error syncing after mark delete:', error);
        }
      }
      void updateNotifications(user?.id);
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

