// Once-ever memory for earned-identity moments (spec §2, Task 4). Manual
// AsyncStorage persistence — this repo does not use zustand/persist (see
// state/uiSlice's pattern). Memory-first: hasFired reads the in-memory map
// synchronously so postLogVoice filtering (state/voiceSlice) never blocks on
// I/O; recordFired updates memory first, then writes AsyncStorage
// best-effort. A lost write just repeats a nice moment once — never blocks
// or throws, the way logging itself is never blocked by voice (postLogVoice).
import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '../lib/utils/logger';

export const IDENTITY_MILESTONES_STORAGE_KEY = 'identity_milestones_v1';

/** markId -> fired milestone ids (identity.ts's IdentityMilestone.id). */
export type IdentityFiredMap = Record<string, string[]>;

interface IdentityState {
  fired: IdentityFiredMap;
  loaded: boolean;
  /** Synchronous — the postLog path filters a just-derived milestone with this
   *  before ever building a Moment, so it must never await I/O. */
  hasFired: (markId: string, milestoneId: string) => boolean;
  /** Memory-first, best-effort persist. Never throws: a failed write is a
   *  possible once-more repeat, never a blocked log or a crashed increment. */
  recordFired: (markId: string, milestoneId: string) => Promise<void>;
  /** Wired into the same bootstrap effect as uiSlice's loadUIState. */
  loadIdentityState: () => Promise<void>;
}

export const useIdentityStore = create<IdentityState>((set, get) => ({
  fired: {},
  loaded: false,

  hasFired: (markId, milestoneId) => {
    return (get().fired[markId] ?? []).includes(milestoneId);
  },

  recordFired: async (markId, milestoneId) => {
    const current = get().fired;
    if ((current[markId] ?? []).includes(milestoneId)) return;

    const next: IdentityFiredMap = {
      ...current,
      [markId]: [...(current[markId] ?? []), milestoneId],
    };
    set({ fired: next });

    try {
      await AsyncStorage.setItem(IDENTITY_MILESTONES_STORAGE_KEY, JSON.stringify(next));
    } catch (error) {
      logger.warn('[identity] failed to persist fired milestone (memory still updated):', error);
    }
  },

  loadIdentityState: async () => {
    try {
      const raw = await AsyncStorage.getItem(IDENTITY_MILESTONES_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          set({ fired: parsed as IdentityFiredMap });
        }
      }
    } catch (error) {
      logger.warn('[identity] failed to load fired milestones, starting empty:', error);
    } finally {
      set({ loaded: true });
    }
  },
}));
