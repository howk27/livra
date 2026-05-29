import { create } from 'zustand';
import { loadUserXP } from '../lib/db/xpDb';
import { getLevelForXP } from '../lib/xpEngine';
import type { XPResult } from '../lib/db/xpDb';

interface XPState {
  totalXP: number;
  currentLevel: number;
  pendingLevelUp: number | null;
  loading: boolean;
  loadXP: (userId: string) => Promise<void>;
  applyXPResult: (result: XPResult) => void;
  clearPendingLevelUp: () => void;
}

export const useXPStore = create<XPState>((set) => ({
  totalXP: 0,
  currentLevel: 1,
  pendingLevelUp: null,
  loading: false,

  loadXP: async (userId) => {
    set({ loading: true });
    try {
      const record = await loadUserXP(userId);
      if (record) {
        set({
          totalXP: record.total_xp,
          currentLevel: record.current_level,
          loading: false,
        });
      } else {
        set({ loading: false });
      }
    } catch {
      set({ loading: false });
    }
  },

  applyXPResult: (result) => {
    set((s) => ({
      totalXP: result.newTotal,
      currentLevel: getLevelForXP(result.newTotal),
      pendingLevelUp: result.levelUp !== null ? result.levelUp : s.pendingLevelUp,
    }));
  },

  clearPendingLevelUp: () => {
    set({ pendingLevelUp: null });
  },
}));
