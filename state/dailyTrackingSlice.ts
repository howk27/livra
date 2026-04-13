// Per-day tracking attachments for each mark: one saved row per (user_id, mark_id, date).
// Livra 2.0: **Local SQLite (or AsyncStorage) is authoritative.** Supabase is best-effort backup;
// failures surface in `notesCloudError` — never assume another device has the same note until sync succeeds.

import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { v4 as uuidv4 } from 'uuid';
import type { MarkNote } from '../types';
import { logger } from '../lib/utils/logger';
import {
  markNotesSqliteSupported,
  migrateMarkNotesFromAsyncStorage,
  loadAllMarkNotes,
  sqliteUpsertMarkNote,
  sqliteDeleteMarkNote,
  sqliteDeleteNotesForMark,
} from '../lib/db/markNotesSqlite';
import {
  supabaseUpsertNote,
  supabaseDeleteNote,
  supabaseFetchNotesForUser,
} from '../lib/db/markNotesSupabase';
import { getSupabaseClient } from '../lib/supabase';
import { getAppDateTime } from '../lib/appDate';

/** Matches only real Supabase UUIDs — 'local' or similar strings return false. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const NOTES_KEY = '@livra_notes';

function mergeKey(n: Pick<MarkNote, 'mark_id' | 'date'>): string {
  return `${n.mark_id}:${n.date}`;
}

function mergeByRecency(a: MarkNote[], b: MarkNote[]): MarkNote[] {
  const map = new Map<string, MarkNote>();
  for (const n of a) map.set(mergeKey(n), n);
  for (const n of b) {
    const k = mergeKey(n);
    const existing = map.get(k);
    if (!existing || new Date(n.updated_at) >= new Date(existing.updated_at)) {
      map.set(k, n);
    }
  }
  return Array.from(map.values()).sort((a, b) => b.date.localeCompare(a.date));
}

async function persistNotes(data: MarkNote[]) {
  try {
    await AsyncStorage.setItem(NOTES_KEY, JSON.stringify(data));
  } catch (err) {
    logger.error('[DailyTracking] persist error:', err);
  }
}

async function loadNotesFromAsyncStorage(): Promise<MarkNote[]> {
  try {
    const raw = await AsyncStorage.getItem(NOTES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export interface DailyTrackingState {
  /** One row per (mark_id, date): saved note text for that calendar day. */
  dailyLogs: MarkNote[];
  loading: boolean;
  /** User-visible hint when cloud backup failed; local save still succeeded. */
  notesCloudError: string | null;
  clearNotesCloudError: () => void;
  loadDailyTracking: () => Promise<void>;
  upsertDailyLogNote: (markId: string, userId: string, date: string, text: string) => Promise<MarkNote>;
  deleteDailyLogNote: (noteId: string) => Promise<void>;
  getDailyLogForDate: (markId: string, date: string) => MarkNote | null;
  getDailyLogsForMark: (markId: string, limit?: number) => MarkNote[];
  /** All logs in a date range (inclusive), any mark — for Tracking overview. */
  getDailyLogsInDateRange: (startDate: string, endDate: string, limit?: number) => MarkNote[];
  deleteDailyLogsForMark: (markId: string) => Promise<void>;
}

export const useDailyTrackingStore = create<DailyTrackingState>((set, get) => ({
  dailyLogs: [],
  loading: false,
  notesCloudError: null,

  clearNotesCloudError: () => set({ notesCloudError: null }),

  loadDailyTracking: async () => {
    set({ loading: true });
    let dailyLogs: MarkNote[] = [];
    if (markNotesSqliteSupported()) {
      try {
        await migrateMarkNotesFromAsyncStorage(NOTES_KEY);
        dailyLogs = await loadAllMarkNotes();
      } catch (err) {
        logger.error('[DailyTracking] SQLite load failed, AsyncStorage fallback:', err);
        dailyLogs = await loadNotesFromAsyncStorage();
      }
    } else {
      dailyLogs = await loadNotesFromAsyncStorage();
    }

    try {
      const supabase = getSupabaseClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.id && UUID_RE.test(user.id)) {
        const remoteNotes = await supabaseFetchNotesForUser(user.id);
        if (remoteNotes.length > 0) {
          const noteMap = new Map<string, MarkNote>(
            dailyLogs.map((n) => [`${n.mark_id}:${n.date}`, n]),
          );
          for (const rn of remoteNotes) {
            const k = `${rn.mark_id}:${rn.date}`;
            const local = noteMap.get(k);
            if (!local || new Date(rn.updated_at) > new Date(local.updated_at)) {
              noteMap.set(k, rn);
            }
          }
          dailyLogs = Array.from(noteMap.values()).sort((a, b) => b.date.localeCompare(a.date));
          if (markNotesSqliteSupported()) {
            for (const n of dailyLogs) {
              try {
                await sqliteUpsertMarkNote(n);
              } catch {
                /* best-effort */
              }
            }
          }
          logger.log(`[DailyTracking] Merged ${remoteNotes.length} remote row(s)`);
        }
      }
    } catch (err) {
      logger.warn('[DailyTracking] Supabase merge skipped:', err);
      set({
        notesCloudError:
          'Notes are on this device only right now. Cloud merge failed — check connection and pull to refresh later.',
      });
    }

    if (markNotesSqliteSupported()) {
      try {
        const latestLocal = await loadAllMarkNotes();
        dailyLogs = mergeByRecency(dailyLogs, latestLocal);
      } catch {
        /* ignore */
      }
    }
    dailyLogs = mergeByRecency(dailyLogs, get().dailyLogs);

    set({ dailyLogs, loading: false });
    logger.log(`[DailyTracking] Loaded ${dailyLogs.length} daily log row(s)`);
  },

  upsertDailyLogNote: async (markId, userId, date, text) => {
    const now = getAppDateTime().toISOString();
    const { dailyLogs } = get();
    const idx = dailyLogs.findIndex((n) => n.mark_id === markId && n.date === date);
    let updated: MarkNote[];
    let note: MarkNote;
    if (idx !== -1) {
      note = { ...dailyLogs[idx], text, updated_at: now };
      updated = dailyLogs.map((n, i) => (i === idx ? note : n));
    } else {
      note = {
        id: uuidv4(),
        mark_id: markId,
        user_id: userId,
        date,
        text,
        created_at: now,
        updated_at: now,
      };
      updated = [note, ...dailyLogs];
    }
    set({ dailyLogs: updated });

    if (markNotesSqliteSupported()) {
      try {
        await sqliteUpsertMarkNote(note);
      } catch (err) {
        logger.error('[DailyTracking] sqlite upsert failed:', err);
        await persistNotes(updated);
      }
    } else {
      await persistNotes(updated);
    }

    if (UUID_RE.test(userId)) {
      supabaseUpsertNote(note)
        .then(() => set({ notesCloudError: null }))
        .catch((err) => {
          logger.warn('[DailyTracking] Supabase upsert skipped:', err);
          set({
            notesCloudError:
              'Saved on this device. Cloud backup failed — notes may not appear on your other devices until sync works.',
          });
        });
    }

    return note;
  },

  deleteDailyLogNote: async (noteId) => {
    const toDelete = get().dailyLogs.find((n) => n.id === noteId);
    const updated = get().dailyLogs.filter((n) => n.id !== noteId);
    set({ dailyLogs: updated });

    if (markNotesSqliteSupported()) {
      try {
        await sqliteDeleteMarkNote(noteId);
      } catch (err) {
        logger.error('[DailyTracking] sqlite delete failed:', err);
        await persistNotes(updated);
      }
    } else {
      await persistNotes(updated);
    }

    if (toDelete && UUID_RE.test(toDelete.user_id)) {
      supabaseDeleteNote(noteId)
        .then(() => set({ notesCloudError: null }))
        .catch((err) => {
          logger.warn('[DailyTracking] Supabase delete skipped:', err);
          set({
            notesCloudError:
              'Removed on this device. Cloud delete may not have applied yet — other devices could still show the old note.',
          });
        });
    }
  },

  getDailyLogForDate: (markId, date) =>
    get().dailyLogs.find((n) => n.mark_id === markId && n.date === date) ?? null,

  getDailyLogsForMark: (markId, limit = 30) =>
    get()
      .dailyLogs.filter((n) => n.mark_id === markId)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, limit),

  getDailyLogsInDateRange: (startDate, endDate, limit = 200) =>
    get()
      .dailyLogs.filter((n) => n.date >= startDate && n.date <= endDate)
      .sort((a, b) => b.date.localeCompare(a.date) || b.updated_at.localeCompare(a.updated_at))
      .slice(0, limit),

  deleteDailyLogsForMark: async (markId) => {
    const dailyLogs = get().dailyLogs.filter((n) => n.mark_id !== markId);
    set({ dailyLogs });
    if (markNotesSqliteSupported()) {
      try {
        await sqliteDeleteNotesForMark(markId);
      } catch (err) {
        logger.error('[DailyTracking] sqlite delete logs for mark failed:', err);
      }
    } else {
      await persistNotes(dailyLogs);
    }
  },
}));
