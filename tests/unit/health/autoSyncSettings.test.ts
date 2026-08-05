// Health auto-sync master toggle + Settings connect side-effects (T4, spec §2.8).
//
// The toggle is device state in a Zustand store backed by AsyncStorage:
// DEFAULT ON — a missing key must read as enabled, because the spec turns
// auto-sync on at connect and the store must agree before hydration lands.

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  HEALTH_AUTO_SYNC_ENABLED_KEY,
  useAutoSyncSettings,
  readAutoSyncEnabled,
  onHealthConnected,
  __resetAutoSyncSettingsForTests,
} from '../../../lib/health/autoSyncSettings';
import { HEALTH_AUTO_SYNC_STATE_KEY, getAutoSyncState } from '../../../lib/health/autoSync';

beforeEach(async () => {
  await AsyncStorage.removeItem(HEALTH_AUTO_SYNC_ENABLED_KEY);
  await AsyncStorage.removeItem(HEALTH_AUTO_SYNC_STATE_KEY);
  __resetAutoSyncSettingsForTests();
});

describe('auto-sync toggle store', () => {
  it('defaults ON when the key has never been written (spec §2.8: default ON)', async () => {
    expect(await readAutoSyncEnabled()).toBe(true);
    expect(useAutoSyncSettings.getState().autoSyncEnabled).toBe(true);
    expect(useAutoSyncSettings.getState().hydrated).toBe(true);
  });

  it('persists OFF and reads it back after an in-memory reset (fresh launch)', async () => {
    await useAutoSyncSettings.getState().setAutoSyncEnabled(false);
    expect(await AsyncStorage.getItem(HEALTH_AUTO_SYNC_ENABLED_KEY)).toBe('false');
    __resetAutoSyncSettingsForTests();
    expect(await readAutoSyncEnabled()).toBe(false);
  });

  it('re-enabling persists ON', async () => {
    await useAutoSyncSettings.getState().setAutoSyncEnabled(false);
    await useAutoSyncSettings.getState().setAutoSyncEnabled(true);
    __resetAutoSyncSettingsForTests();
    expect(await readAutoSyncEnabled()).toBe(true);
  });

  it('treats a corrupt stored value as the default (ON)', async () => {
    await AsyncStorage.setItem(HEALTH_AUTO_SYNC_ENABLED_KEY, 'garbage');
    expect(await readAutoSyncEnabled()).toBe(true);
  });
});

describe('onHealthConnected (Settings connect flow)', () => {
  it('stamps the connect day explicitly — first write wins (T3 finding 4)', async () => {
    await onHealthConnected('2026-08-01');
    await onHealthConnected('2026-08-04'); // reconnect must not move the floor
    expect((await getAutoSyncState()).connectDay).toBe('2026-08-01');
  });

  it('turns the master toggle ON at connect, even if it was previously OFF', async () => {
    await useAutoSyncSettings.getState().setAutoSyncEnabled(false);
    await onHealthConnected('2026-08-05');
    expect(useAutoSyncSettings.getState().autoSyncEnabled).toBe(true);
    expect(await AsyncStorage.getItem(HEALTH_AUTO_SYNC_ENABLED_KEY)).toBe('true');
  });
});
