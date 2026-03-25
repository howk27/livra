import AsyncStorage from '@react-native-async-storage/async-storage';

type DiagnosticsUnlockListener = (unlocked: boolean) => void;

let diagnosticsUnlocked = false;
let diagnosticsHydrated = false;
const listeners = new Set<DiagnosticsUnlockListener>();
const STORAGE_KEY = 'livra_diagnostics_unlocked';

export const isDiagnosticsUnlocked = (): boolean => diagnosticsUnlocked;

export const setDiagnosticsUnlocked = (unlocked: boolean): void => {
  diagnosticsUnlocked = unlocked;
  listeners.forEach(listener => listener(diagnosticsUnlocked));
};

export const hydrateDiagnosticsUnlock = async (): Promise<boolean> => {
  if (diagnosticsHydrated) return diagnosticsUnlocked;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    diagnosticsUnlocked = raw === 'true';
  } catch {
    diagnosticsUnlocked = false;
  } finally {
    diagnosticsHydrated = true;
    listeners.forEach(listener => listener(diagnosticsUnlocked));
  }
  return diagnosticsUnlocked;
};

export const setDiagnosticsUnlockedPersisted = async (unlocked: boolean): Promise<void> => {
  setDiagnosticsUnlocked(unlocked);
  try {
    if (unlocked) {
      await AsyncStorage.setItem(STORAGE_KEY, 'true');
    } else {
      await AsyncStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // Best effort only
  }
};

export const subscribeDiagnosticsUnlock = (listener: DiagnosticsUnlockListener): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
