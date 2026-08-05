// lib/health/autoSyncSettings.ts
//
// Health auto-sync master toggle (health-auto-sync T4, spec §2.8) + the
// Settings-connect side effects.
//
// DEFAULT ON, AND THE DEFAULT IS THE UNHYDRATED VALUE TOO: the spec turns
// auto-sync on at connect, so a store that answered "off" before its disk read
// landed would gate a legitimate launch run. Only an explicit stored 'false'
// disables. Zustand + AsyncStorage, the same shape as the app's other
// device-local settings (rn-patterns: persistent state never lives in useState).

import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '../utils/logger';
import { recordHealthConnectDay } from './autoSync';

/** Account-scoped: registered in ACCOUNT_SCOPED_STORAGE_KEYS
 * (lib/purgeLocalUserData.ts) — the toggle rides the Health connection, which
 * is purged with the account ('health_connected'). */
export const HEALTH_AUTO_SYNC_ENABLED_KEY = 'livra_health_auto_sync_enabled_v1';

interface AutoSyncSettingsState {
  /** Master auto-sync toggle (spec §2.8). Default ON. */
  autoSyncEnabled: boolean;
  /** True once the stored value has been read (Settings disables the switch
   * until then, so a fast tap cannot race the disk read). */
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setAutoSyncEnabled: (enabled: boolean) => Promise<void>;
}

/** One disk read per launch; hydrate() after the first call awaits the same
 * promise, so the trigger and the Settings screen can both call it freely. */
let hydratePromise: Promise<void> | null = null;

export const useAutoSyncSettings = create<AutoSyncSettingsState>((set) => ({
  autoSyncEnabled: true,
  hydrated: false,

  hydrate: () => {
    if (!hydratePromise) {
      hydratePromise = (async () => {
        try {
          const raw = await AsyncStorage.getItem(HEALTH_AUTO_SYNC_ENABLED_KEY);
          // Only an explicit 'false' disables; anything else (missing key,
          // corrupt value) is the default ON.
          set({ autoSyncEnabled: raw !== 'false', hydrated: true });
        } catch (error) {
          logger.warn('[autoSyncSettings] hydrate failed — staying at default ON:', error);
          set({ hydrated: true });
        }
      })();
    }
    return hydratePromise;
  },

  setAutoSyncEnabled: async (enabled) => {
    // Optimistic: the state IS the truth; the persist retries on the next set.
    set({ autoSyncEnabled: enabled, hydrated: true });
    try {
      await AsyncStorage.setItem(HEALTH_AUTO_SYNC_ENABLED_KEY, enabled ? 'true' : 'false');
    } catch (error) {
      logger.warn('[autoSyncSettings] toggle persist failed:', error);
    }
  },
}));

/** The trigger's read: hydrated value, one awaited disk read per launch. */
export async function readAutoSyncEnabled(): Promise<boolean> {
  await useAutoSyncSettings.getState().hydrate();
  return useAutoSyncSettings.getState().autoSyncEnabled;
}

/**
 * Everything the Settings connect flow owes auto-sync, in one call:
 *  - stamp the connect-day floor explicitly (T3 finding 4 — without this the
 *    engine lazily stamps the day of its FIRST RUN, not the day of connect);
 *  - master toggle ON at connect (spec §2.8 default).
 */
export async function onHealthConnected(today: string): Promise<void> {
  await recordHealthConnectDay(today);
  await useAutoSyncSettings.getState().setAutoSyncEnabled(true);
}

export function __resetAutoSyncSettingsForTests(): void {
  hydratePromise = null;
  useAutoSyncSettings.setState({ autoSyncEnabled: true, hydrated: false });
}
