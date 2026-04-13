// Skip tokens only. Daily log notes live in dailyTrackingSlice.

import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { v4 as uuidv4 } from 'uuid';
import type { SkipToken } from '../types';
import { currentMonthISO, getEffectiveSkipTokens } from '../lib/features';
import { logger } from '../lib/utils/logger';

const TOKENS_KEY = '@livra_skip_tokens';

interface FeaturesState {
  skipTokens: SkipToken[];
  loading: boolean;
  loadSkipFeatures: () => Promise<void>;
  useSkipToken: (markId: string, userId: string, date: string) => Promise<{ success: boolean; message: string }>;
  isDateProtected: (markId: string, date: string) => boolean;
  getTokensForMark: (markId: string) => SkipToken[];
  deleteSkipDataForMark: (markId: string) => Promise<void>;
}

async function persist(key: string, data: unknown) {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(data));
  } catch (err) {
    logger.error('[FeaturesStore] persist error:', err);
  }
}

async function load<T>(key: string): Promise<T[]> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export const useFeaturesStore = create<FeaturesState>((set, get) => ({
  skipTokens: [],
  loading: false,

  loadSkipFeatures: async () => {
    set({ loading: true });
    const skipTokens = await load<SkipToken>(TOKENS_KEY);
    set({ skipTokens, loading: false });
    logger.log(`[FeaturesStore] Loaded ${skipTokens.length} skip token(s)`);
  },

  useSkipToken: async (markId, userId, date) => {
    const { skipTokens } = get();
    if (skipTokens.some((t) => t.mark_id === markId && t.protected_date === date)) {
      return { success: false, message: 'This date is already protected.' };
    }
    const { useMarksStore } = await import('./countersSlice');
    const mark = useMarksStore.getState().marks.find((m) => m.id === markId);
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
    get().skipTokens.some((t) => t.mark_id === markId && t.protected_date === date),

  getTokensForMark: (markId) => get().skipTokens.filter((t) => t.mark_id === markId),

  deleteSkipDataForMark: async (markId) => {
    const skipTokens = get().skipTokens.filter((t) => t.mark_id !== markId);
    set({ skipTokens });
    await persist(TOKENS_KEY, skipTokens);
  },
}));
