import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { addDays } from 'date-fns';
import { logger } from '../lib/utils/logger';

const STORAGE_KEY = '@livra_debug_app_date_override';

function toYyyyMmDd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export type AppDateState = {
  debugDateOverride: string | null;
  /**
   * The real local calendar day, as YYYY-MM-DD. Everything that means "today"
   * keys off this (via `selectAppDateKey`), which is the only reason a screen
   * open across midnight ever notices.
   */
  dayKey: string;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setDebugDateOverride: (value: string | null) => Promise<void>;
  shiftDebugDateByDays: (delta: number) => Promise<void>;
  useRealDate: () => Promise<void>;
  /** Re-reads the clock. Returns true only when the day actually turned over. */
  refreshDayKey: () => boolean;
};

/**
 * The invalidation key for anything derived from "today".
 *
 * THE BUG THIS REPLACES: every consumer used `debugDateOverride ?? ''`, which in
 * production is the constant empty string — so a `useMemo` keyed on it computed
 * `today` ONCE per mount and never again. Leave Livra open (or backgrounded,
 * where the JS context survives for hours) across midnight and Focus still
 * showed yesterday: yesterday's counts, yesterday's Next Move, yesterday's
 * comeback verdict, and a momentum banner for a day that had ended.
 *
 * The dev override still wins when set, so simulated-date debugging is
 * unchanged.
 */
export const selectAppDateKey = (s: AppDateState): string => s.debugDateOverride ?? s.dayKey;

export const useAppDateStore = create<AppDateState>((set, get) => ({
  debugDateOverride: null,
  dayKey: toYyyyMmDd(new Date()),
  hydrated: false,

  refreshDayKey: () => {
    const next = toYyyyMmDd(new Date());
    if (next === get().dayKey) return false;
    set({ dayKey: next });
    return true;
  },

  hydrate: async () => {
    if (typeof __DEV__ === 'undefined' || !__DEV__) {
      set({ hydrated: true });
      return;
    }
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw)) {
        set({ debugDateOverride: raw, hydrated: true });
      } else {
        set({ hydrated: true });
      }
    } catch (err) {
      logger.warn('[AppDate] hydrate AsyncStorage read failed', {
        message: err instanceof Error ? err.message : String(err),
      });
      set({ hydrated: true });
    }
  },

  setDebugDateOverride: async (value) => {
    if (typeof __DEV__ === 'undefined' || !__DEV__) return;
    set({ debugDateOverride: value });
    try {
      if (value) await AsyncStorage.setItem(STORAGE_KEY, value);
      else await AsyncStorage.removeItem(STORAGE_KEY);
    } catch (err) {
      logger.warn('[AppDate] persist debug date override failed', {
        message: err instanceof Error ? err.message : String(err),
      });
    }
  },

  shiftDebugDateByDays: async (delta) => {
    if (typeof __DEV__ === 'undefined' || !__DEV__) return;
    const cur = get().debugDateOverride;
    const base = cur
      ? (() => {
          const [y, m, d] = cur.split('-').map(Number);
          return new Date(y, m - 1, d, 12, 0, 0, 0);
        })()
      : new Date();
    const next = addDays(base, delta);
    await get().setDebugDateOverride(toYyyyMmDd(next));
  },

  useRealDate: async () => {
    await get().setDebugDateOverride(null);
  },
}));
