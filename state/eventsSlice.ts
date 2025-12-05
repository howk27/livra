import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { MarkEvent } from '../types';
import { execute, query } from '../lib/db';
import { formatDate } from '../lib/date';
import { logger } from '../lib/utils/logger';

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
      const cutoffDate = !markId && !limit ? new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString() : undefined;
      
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
    const now = new Date();
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

    // Persist to database in background (don't await to avoid blocking UI)
    execute(
      `INSERT INTO lc_events (
        id, user_id, counter_id, event_type, amount, occurred_at,
        occurred_local_date, meta, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        event.id,
        event.user_id,
        event.mark_id, // Map mark_id to counter_id column
        event.event_type,
        event.amount,
        event.occurred_at,
        event.occurred_local_date,
        JSON.stringify(event.meta || {}),
        event.created_at,
        event.updated_at,
      ]
    ).catch((error) => {
      logger.error('Error persisting event to database:', error);
      // On error, remove the optimistic update from store
      set((state) => ({
        events: state.events.filter((e) => e.id !== event.id),
        lastActionId: state.lastActionId === event.id ? null : state.lastActionId,
      }));
    });

    return event;
  },

  deleteEvent: async (id) => {
    const now = new Date().toISOString();
    await execute('UPDATE lc_events SET deleted_at = ?, updated_at = ? WHERE id = ?', [
      now,
      now,
      id,
    ]);

    set((state) => ({
      events: state.events.filter((e) => e.id !== id),
    }));
  },

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
}));

