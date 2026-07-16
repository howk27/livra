// Goal-level MULTI-ENTRY journal (QC3-D). Many timestamped entries per goal;
// each entry is its own row keyed by a client-generated uuid (`id`) — the
// identity. Local SQLite (or AsyncStorage on web) is authoritative; Supabase is
// best-effort backup, mirroring the mark-notes layer. Failures surface in
// `goalNotesCloudError` — never assume another device has an entry until sync
// succeeds.

import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { v4 as uuidv4 } from 'uuid';
import type { GoalNote } from '../types';
import { logger } from '../lib/utils/logger';
import {
  goalNotesSqliteSupported,
  migrateGoalNotesFromAsyncStorage,
  loadAllGoalNotes,
  sqliteUpsertGoalNote,
  sqliteDeleteGoalNote,
} from '../lib/db/goalNotesSqlite';
import {
  insertGoalNote as cloudInsertGoalNote,
  updateGoalNote as cloudUpdateGoalNote,
  deleteGoalNote as cloudDeleteGoalNote,
  fetchGoalNotesForUser,
} from '../lib/db/goalNotesSupabase';
import { getSupabaseClient } from '../lib/supabase';
import { getAppDateTime } from '../lib/appDate';

/** Matches only real Supabase UUIDs — 'local' or similar strings return false. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const GOAL_NOTES_KEY = '@livra_goal_notes';

/** Newest-first: created_at desc, id as a stable tiebreaker. */
function byNewest(a: GoalNote, b: GoalNote): number {
  if (a.created_at !== b.created_at) return b.created_at.localeCompare(a.created_at);
  return b.id.localeCompare(a.id);
}

/** Merge two lists keyed by entry id; the more-recently-updated row wins. */
function mergeById(a: GoalNote[], b: GoalNote[]): GoalNote[] {
  const map = new Map<string, GoalNote>();
  for (const n of a) map.set(n.id, n);
  for (const n of b) {
    const existing = map.get(n.id);
    if (!existing || new Date(n.updated_at) >= new Date(existing.updated_at)) {
      map.set(n.id, n);
    }
  }
  return Array.from(map.values()).sort(byNewest);
}

async function persistGoalNotes(data: GoalNote[]) {
  try {
    await AsyncStorage.setItem(GOAL_NOTES_KEY, JSON.stringify(data));
  } catch (err) {
    logger.error('[GoalNotes] persist error:', err);
  }
}

async function loadGoalNotesFromAsyncStorage(): Promise<GoalNote[]> {
  try {
    const raw = await AsyncStorage.getItem(GOAL_NOTES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export interface GoalNotesState {
  /** All journal entries across every goal, newest-first. */
  entries: GoalNote[];
  loading: boolean;
  /** User-visible hint when cloud backup failed; the local save still succeeded. */
  goalNotesCloudError: string | null;
  clearGoalNotesCloudError: () => void;
  loadGoalNotes: () => Promise<void>;
  /** Newest-first entries for one goal (created_at desc). */
  getEntriesForGoal: (goalId: string, limit?: number) => GoalNote[];
  addGoalNote: (goalId: string, userId: string, localDate: string, text: string) => Promise<GoalNote>;
  editGoalNote: (id: string, userId: string, text: string) => Promise<void>;
  deleteGoalNote: (id: string) => Promise<void>;
}

export const useGoalNotesStore = create<GoalNotesState>((set, get) => ({
  entries: [],
  loading: false,
  goalNotesCloudError: null,

  clearGoalNotesCloudError: () => set({ goalNotesCloudError: null }),

  loadGoalNotes: async () => {
    set({ loading: true });
    let entries: GoalNote[] = [];
    if (goalNotesSqliteSupported()) {
      try {
        await migrateGoalNotesFromAsyncStorage(GOAL_NOTES_KEY);
        entries = await loadAllGoalNotes();
      } catch (err) {
        logger.error('[GoalNotes] SQLite load failed, AsyncStorage fallback:', err);
        entries = await loadGoalNotesFromAsyncStorage();
      }
    } else {
      entries = await loadGoalNotesFromAsyncStorage();
    }

    try {
      const supabase = getSupabaseClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user?.id && UUID_RE.test(user.id)) {
        const remote = await fetchGoalNotesForUser(user.id);
        if (remote.length > 0) {
          entries = mergeById(entries, remote);
          if (goalNotesSqliteSupported()) {
            for (const n of entries) {
              try {
                await sqliteUpsertGoalNote(n);
              } catch {
                /* best-effort */
              }
            }
          }
          logger.log(`[GoalNotes] Merged ${remote.length} remote entr(ies)`);
        }
      }
    } catch (err) {
      logger.warn('[GoalNotes] Supabase merge skipped:', err);
      set({
        goalNotesCloudError:
          'Journal is on this device only right now. Cloud merge failed — check connection and reopen later.',
      });
    }

    // Fold in anything that was written locally while the async merge ran.
    entries = mergeById(entries, get().entries);

    set({ entries, loading: false });
    logger.log(`[GoalNotes] Loaded ${entries.length} journal entr(ies)`);
  },

  getEntriesForGoal: (goalId, limit) => {
    const rows = get()
      .entries.filter((n) => n.goal_id === goalId)
      .sort(byNewest);
    return typeof limit === 'number' ? rows.slice(0, limit) : rows;
  },

  addGoalNote: async (goalId, userId, localDate, text) => {
    const now = getAppDateTime().toISOString();
    const note: GoalNote = {
      id: uuidv4(), // client-generated identity — the row's id on the server too
      goal_id: goalId,
      user_id: userId,
      local_date: localDate,
      text,
      created_at: now,
      updated_at: now,
    };
    const entries = [note, ...get().entries].sort(byNewest);
    set({ entries });

    if (goalNotesSqliteSupported()) {
      try {
        await sqliteUpsertGoalNote(note);
      } catch (err) {
        logger.error('[GoalNotes] sqlite insert failed:', err);
        await persistGoalNotes(entries);
      }
    } else {
      await persistGoalNotes(entries);
    }

    if (UUID_RE.test(userId)) {
      cloudInsertGoalNote(note)
        .then(() => set({ goalNotesCloudError: null }))
        .catch((err) => {
          logger.warn('[GoalNotes] Supabase insert skipped:', err);
          set({
            goalNotesCloudError:
              'Saved on this device. Cloud backup failed — this entry may not appear on your other devices until sync works.',
          });
        });
    }

    return note;
  },

  editGoalNote: async (id, userId, text) => {
    const { entries } = get();
    const idx = entries.findIndex((n) => n.id === id);
    if (idx === -1) return;
    const now = getAppDateTime().toISOString();
    // Refresh user_id on edit: a row created signed-out carries 'local'; the
    // current editor owns it.
    const note: GoalNote = { ...entries[idx], text, user_id: userId, updated_at: now };
    const updated = entries.map((n, i) => (i === idx ? note : n)).sort(byNewest);
    set({ entries: updated });

    if (goalNotesSqliteSupported()) {
      try {
        await sqliteUpsertGoalNote(note);
      } catch (err) {
        logger.error('[GoalNotes] sqlite update failed:', err);
        await persistGoalNotes(updated);
      }
    } else {
      await persistGoalNotes(updated);
    }

    if (UUID_RE.test(userId)) {
      cloudUpdateGoalNote(note)
        .then(() => set({ goalNotesCloudError: null }))
        .catch((err) => {
          logger.warn('[GoalNotes] Supabase update skipped:', err);
          set({
            goalNotesCloudError:
              'Saved on this device. Cloud backup failed — this edit may not appear on your other devices until sync works.',
          });
        });
    }
  },

  deleteGoalNote: async (id) => {
    const toDelete = get().entries.find((n) => n.id === id);
    if (!toDelete) return;
    const updated = get().entries.filter((n) => n.id !== id);
    set({ entries: updated });

    if (goalNotesSqliteSupported()) {
      try {
        await sqliteDeleteGoalNote(id);
      } catch (err) {
        logger.error('[GoalNotes] sqlite delete failed:', err);
        await persistGoalNotes(updated);
      }
    } else {
      await persistGoalNotes(updated);
    }

    if (UUID_RE.test(toDelete.user_id)) {
      cloudDeleteGoalNote(id, toDelete.user_id)
        .then(() => set({ goalNotesCloudError: null }))
        .catch((err) => {
          logger.warn('[GoalNotes] Supabase delete skipped:', err);
          set({
            goalNotesCloudError:
              'Removed on this device. Cloud delete may not have applied yet — other devices could still show it.',
          });
        });
    }
  },
}));
