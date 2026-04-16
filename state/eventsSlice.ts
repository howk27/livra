import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { MarkEvent } from '../types';
import { execute, query, queryFirst } from '../lib/db';
import { formatDate } from '../lib/date';
import { getAppDateTime } from '../lib/appDate';
import { subDays } from 'date-fns';
import { logger } from '../lib/utils/logger';
import { reconcileMarkTotalWithPersistedEvents } from '../lib/db/markTotalReconciliation';
import { useMarksStore } from './countersSlice';

interface EventsState {
  events: MarkEvent[];
  loading: boolean;
  error: string | null;
  lastActionId: string | null;
  
  // Actions
  loadEvents: (markId?: string, userId?: string, limit?: number) => Promise<void>;
  addEvent: (event: Omit<MarkEvent, 'id' | 'created_at' | 'updated_at'>) => Promise<MarkEvent>;
  deleteEvent: (id: string) => Promise<void>;
  undoLastAction: () => Promise<void>;
  getEventsByMark: (markId: string) => MarkEvent[];
  getEventsByDate: (date: string) => MarkEvent[];
  /** Most recent increment for a mark in the current in-memory list (detail UI / hooks). */
  getLastIncrementEvent: (markId: string) => MarkEvent | undefined;
  /** Count of non-deleted increment events for mark on `occurred_local_date === todayStr` in current list. */
  getIncrementsToday: (markId: string, todayStr: string) => number;
}

export const useEventsStore = create<EventsState>((set, get) => ({
  events: [],
  loading: false,
  error: null,
  lastActionId: null,

  loadEvents: async (markId?: string, userId?: string, limit?: number) => {
    set({ loading: true, error: null });
    try {
      let sql: string;
      let params: any[] = [];
      
      // Default limit for stats screen to reduce I/O (last 90 days of events)
      const defaultLimit = limit || (markId ? undefined : 5000);
      const cutoffDate =
        !markId && !limit ? subDays(getAppDateTime(), 90).toISOString() : undefined;
      
      if (markId && userId) {
        sql = 'SELECT id, user_id, counter_id as mark_id, event_type, amount, occurred_at, occurred_local_date, meta, deleted_at, created_at, updated_at FROM lc_events WHERE counter_id = ? AND user_id = ? AND deleted_at IS NULL ORDER BY occurred_at DESC';
        params = [markId, userId];
        if (defaultLimit) {
          // Use parameterized query for LIMIT to prevent SQL injection
          sql += ' LIMIT ?';
          params.push(defaultLimit);
        }
      } else if (markId) {
        sql = 'SELECT id, user_id, counter_id as mark_id, event_type, amount, occurred_at, occurred_local_date, meta, deleted_at, created_at, updated_at FROM lc_events WHERE counter_id = ? AND deleted_at IS NULL ORDER BY occurred_at DESC';
        params = [markId];
        if (defaultLimit) {
          // Use parameterized query for LIMIT to prevent SQL injection
          sql += ' LIMIT ?';
          params.push(defaultLimit);
        }
      } else if (userId) {
        sql = 'SELECT id, user_id, counter_id as mark_id, event_type, amount, occurred_at, occurred_local_date, meta, deleted_at, created_at, updated_at FROM lc_events WHERE user_id = ? AND deleted_at IS NULL';
        params = [userId];
        if (cutoffDate) {
          sql += ' AND occurred_at >= ?';
          params.push(cutoffDate);
        }
        sql += ' ORDER BY occurred_at DESC';
        if (defaultLimit) {
          // Use parameterized query for LIMIT to prevent SQL injection
          sql += ' LIMIT ?';
          params.push(defaultLimit);
        }
      } else {
        sql = 'SELECT id, user_id, counter_id as mark_id, event_type, amount, occurred_at, occurred_local_date, meta, deleted_at, created_at, updated_at FROM lc_events WHERE deleted_at IS NULL';
        if (cutoffDate) {
          sql += ' AND occurred_at >= ?';
          params.push(cutoffDate);
        }
        sql += ' ORDER BY occurred_at DESC';
        if (defaultLimit) {
          // Use parameterized query for LIMIT to prevent SQL injection
          sql += ' LIMIT ?';
          params.push(defaultLimit);
        }
      }
      
      const events = await query<MarkEvent>(sql, params);
      
      set({ events, loading: false });
    } catch (error) {
      set({ error: (error as Error).message, loading: false });
    }
  },

  addEvent: async (eventData) => {
    const now = getAppDateTime();
    const event: MarkEvent = {
      ...eventData,
      id: uuidv4(),
      occurred_at: eventData.occurred_at || now.toISOString(),
      occurred_local_date: eventData.occurred_local_date || formatDate(now),
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    };

    // OPTIMISTIC UPDATE: Update store immediately for instant UI feedback
    set((state) => ({
      events: [event, ...state.events],
      lastActionId: event.id,
    }));

    try {
      await execute(
        `INSERT INTO lc_events (
        id, user_id, counter_id, event_type, amount, occurred_at,
        occurred_local_date, meta, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          event.id,
          event.user_id,
          event.mark_id,
          event.event_type,
          event.amount,
          event.occurred_at,
          event.occurred_local_date,
          JSON.stringify(event.meta || {}),
          event.created_at,
          event.updated_at,
        ],
      );
    } catch (error) {
      logger.error('Error persisting event to database:', error);
      set((state) => ({
        events: state.events.filter((e) => e.id !== event.id),
        lastActionId: state.lastActionId === event.id ? null : state.lastActionId,
      }));
      throw error;
    }

    return event;
  },

  deleteEvent: async (id) => {
    const row = await queryFirst<{ counter_id: string; user_id: string }>(
      'SELECT counter_id, user_id FROM lc_events WHERE id = ?',
      [id],
    );
    const now = getAppDateTime().toISOString();
    await execute('UPDATE lc_events SET deleted_at = ?, updated_at = ? WHERE id = ?', [
      now,
      now,
      id,
    ]);

    set((state) => ({
      events: state.events.filter((e) => e.id !== id),
    }));

    if (row?.counter_id && row.user_id) {
      try {
        await reconcileMarkTotalWithPersistedEvents(row.user_id, row.counter_id);
        await useMarksStore.getState().loadMarks(row.user_id);
      } catch (reconcileErr) {
        logger.error('[Events] Total reconcile after deleteEvent failed:', reconcileErr);
      }
    }
  },

  // Soft-deletes the last event row; lc_counters.total is realigned via reconcileMarkTotalWithPersistedEvents in deleteEvent.
  undoLastAction: async () => {
    const { lastActionId } = get();
    if (lastActionId) {
      await get().deleteEvent(lastActionId);
      set({ lastActionId: null });
    }
  },

  getEventsByMark: (markId) => {
    return get().events.filter((e) => e.mark_id === markId && !e.deleted_at);
  },

  getEventsByDate: (date) => {
    return get().events.filter((e) => e.occurred_local_date === date && !e.deleted_at);
  },

  getLastIncrementEvent: (markId) => {
    const list = get().events.filter(
      (e) => e.mark_id === markId && !e.deleted_at && e.event_type === 'increment',
    );
    if (list.length === 0) return undefined;
    return [...list].sort(
      (a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime(),
    )[0];
  },

  getIncrementsToday: (markId, todayStr) => {
    return get().events.filter(
      (e) =>
        e.mark_id === markId &&
        !e.deleted_at &&
        e.event_type === 'increment' &&
        e.occurred_local_date === todayStr,
    ).length;
  },
}));

