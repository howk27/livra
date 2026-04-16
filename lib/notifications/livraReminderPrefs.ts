import AsyncStorage from '@react-native-async-storage/async-storage';

/** AsyncStorage key — also cleared on full account delete in settings. */
export const LIVRA_REMINDERS_ENABLED_KEY = 'livra_reminders_enabled_v1';

/** Master toggle for Livra-scheduled local reminders (behavior DATE model). Default on. */
export async function getLivraRemindersEnabled(): Promise<boolean> {
  try {
    const v = await AsyncStorage.getItem(LIVRA_REMINDERS_ENABLED_KEY);
    if (v === null || v === undefined) return true;
    return v === '1' || v === 'true';
  } catch {
    return true;
  }
}

export async function setLivraRemindersEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(LIVRA_REMINDERS_ENABLED_KEY, enabled ? '1' : '0');
}
