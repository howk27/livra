import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { addDays } from 'date-fns';

const STORAGE_KEY = '@livra_debug_app_date_override';

function toYyyyMmDd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export type AppDateState = {
  debugDateOverride: string | null;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setDebugDateOverride: (value: string | null) => Promise<void>;
  shiftDebugDateByDays: (delta: number) => Promise<void>;
  useRealDate: () => Promise<void>;
};

export const useAppDateStore = create<AppDateState>((set, get) => ({
  debugDateOverride: null,
  hydrated: false,

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
    } catch {
      set({ hydrated: true });
    }
  },

  setDebugDateOverride: async (value) => {
    if (typeof __DEV__ === 'undefined' || !__DEV__) return;
    set({ debugDateOverride: value });
    try {
      if (value) await AsyncStorage.setItem(STORAGE_KEY, value);
      else await AsyncStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
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
