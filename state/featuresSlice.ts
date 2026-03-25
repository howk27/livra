// state/featuresSlice.ts
// Zustand store for Feature 3 (skip tokens) + Feature 4 (notes)

import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { v4 as uuidv4 } from 'uuid';
import type { MarkNote, SkipToken } from '../types';
import { currentMonthISO, getEffectiveSkipTokens } from '../lib/features';
import { logger } from '../lib/utils/logger';

const NOTES_KEY = '@livra_notes';
const TOKENS_KEY = '@livra_skip_tokens';

interface FeaturesState {
  notes: MarkNote[];
  skipTokens: SkipToken[];
  loading: boolean;
  loadFeatures: () => Promise<void>;
  upsertNote: (markId: string, userId: string, date: string, text: string) => Promise<MarkNote>;
  deleteNote: (noteId: string) => Promise<void>;
  getNoteForDate: (markId: string, date: string) => MarkNote | null;
  getNotesForMark: (markId: string, limit?: number) => MarkNote[];
  useSkipToken: (markId: string, userId: string, date: string) => Promise<{ success: boolean; message: string }>;
  isDateProtected: (markId: string, date: string) => boolean;
  getTokensForMark: (markId: string) => SkipToken[];
  deleteDataForMark: (markId: string) => Promise<void>;
}

async function persist(key: string, data: unknown) {
  try { await AsyncStorage.setItem(key, JSON.stringify(data)); }
  catch (err) { logger.error('[FeaturesStore] persist error:', err); }
}

async function load<T>(key: string): Promise<T[]> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export const useFeaturesStore = create<FeaturesState>((set, get) => ({
  notes: [],
  skipTokens: [],
  loading: false,

  loadFeatures: async () => {
    set({ loading: true });
    const [notes, skipTokens] = await Promise.all([
      load<MarkNote>(NOTES_KEY),
      load<SkipToken>(TOKENS_KEY),
    ]);
    set({ notes, skipTokens, loading: false });
    logger.log(`[FeaturesStore] Loaded ${notes.length} notes, ${skipTokens.length} skip tokens`);
  },

  upsertNote: async (markId, userId, date, text) => {
    const now = new Date().toISOString();
    const { notes } = get();
    const idx = notes.findIndex(n => n.mark_id === markId && n.date === date);
    let updated: MarkNote[];
    let note: MarkNote;
    if (idx !== -1) {
      note = { ...notes[idx], text, updated_at: now };
      updated = notes.map((n, i) => (i === idx ? note : n));
    } else {
      note = { id: uuidv4(), mark_id: markId, user_id: userId, date, text, created_at: now, updated_at: now };
      updated = [note, ...notes];
    }
    set({ notes: updated });
    await persist(NOTES_KEY, updated);
    return note;
  },

  deleteNote: async (noteId) => {
    const updated = get().notes.filter(n => n.id !== noteId);
    set({ notes: updated });
    await persist(NOTES_KEY, updated);
  },

  getNoteForDate: (markId, date) =>
    get().notes.find(n => n.mark_id === markId && n.date === date) ?? null,

  getNotesForMark: (markId, limit = 30) =>
    get().notes
      .filter(n => n.mark_id === markId)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, limit),

  useSkipToken: async (markId, userId, date) => {
    const { skipTokens } = get();
    if (skipTokens.some(t => t.mark_id === markId && t.protected_date === date)) {
      return { success: false, message: 'This date is already protected.' };
    }
    const { useMarksStore } = await import('./countersSlice');
    const mark = useMarksStore.getState().marks.find(m => m.id === markId);
    if (!mark) return { success: false, message: 'Mark not found.' };
    const available = getEffectiveSkipTokens(mark);
    if (available <= 0) return { success: false, message: 'No skip tokens remaining this month.' };
    const token: SkipToken = {
      id: uuidv4(),
      mark_id: markId,
      user_id: userId,
      protected_date: date,
      created_at: new Date().toISOString(),
    };
    const updatedTokens = [token, ...skipTokens];
    set({ skipTokens: updatedTokens });
    await persist(TOKENS_KEY, updatedTokens);
    await useMarksStore.getState().updateMark(markId, {
      skip_tokens_remaining: available - 1,
      skip_tokens_month: currentMonthISO(),
    } as any);
    logger.log(`[FeaturesStore] Skip token used: ${markId} on ${date}. Remaining: ${available - 1}`);
    return { success: true, message: `Streak protected for ${date}. ${available - 1} token(s) left this month.` };
  },

  isDateProtected: (markId, date) =>
    get().skipTokens.some(t => t.mark_id === markId && t.protected_date === date),

  getTokensForMark: (markId) =>
    get().skipTokens.filter(t => t.mark_id === markId),

  deleteDataForMark: async (markId) => {
    const notes = get().notes.filter(n => n.mark_id !== markId);
    const skipTokens = get().skipTokens.filter(t => t.mark_id !== markId);
    set({ notes, skipTokens });
    await Promise.all([persist(NOTES_KEY, notes), persist(TOKENS_KEY, skipTokens)]);
  },
}));
