import AsyncStorage from '@react-native-async-storage/async-storage';
import { env } from '../env';
import { logger } from '../utils/logger';

export type FeatureFlag =
  | 'weeklyReview'
  | 'personalRecords'
  | 'streakProtection'
  | 'smartInsights'
  | 'enhancedCelebrations';

export type FeatureFlagState = Record<FeatureFlag, boolean>;

const STORAGE_KEY = 'livra_feature_flags';

const DEFAULT_FLAGS: FeatureFlagState = {
  weeklyReview: env.isDev,
  personalRecords: env.isDev,
  streakProtection: env.isDev,
  smartInsights: env.isDev,
  enhancedCelebrations: env.isDev,
};

let overrides: Partial<FeatureFlagState> = {};
let hydrated = false;
const listeners = new Set<() => void>();

const notify = () => {
  listeners.forEach(listener => listener());
};

const sanitizeOverrides = (raw: any): Partial<FeatureFlagState> => {
  if (!raw || typeof raw !== 'object') return {};
  const sanitized: Partial<FeatureFlagState> = {};
  (Object.keys(DEFAULT_FLAGS) as FeatureFlag[]).forEach((flag) => {
    const value = raw[flag];
    if (typeof value === 'boolean') {
      sanitized[flag] = value;
    }
  });
  return sanitized;
};

const persistOverrides = async () => {
  try {
    if (!Object.keys(overrides).length) {
      await AsyncStorage.removeItem(STORAGE_KEY);
      return;
    }
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
  } catch (err) {
    logger.warn('[Flags] persistOverrides failed', { message: err instanceof Error ? err.message : String(err) });
  }
};

export const hydrateFlagOverrides = async (): Promise<void> => {
  if (hydrated) return;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    overrides = raw ? sanitizeOverrides(JSON.parse(raw)) : {};
  } catch (err) {
    logger.warn('[Flags] hydrateFlagOverrides read/parse failed; using defaults', {
      message: err instanceof Error ? err.message : String(err),
    });
    overrides = {};
  } finally {
    hydrated = true;
    notify();
  }
};

export const getDefaultFlags = (): FeatureFlagState => ({ ...DEFAULT_FLAGS });

export const getFlagOverride = (flag: FeatureFlag): boolean | undefined => overrides[flag];

export const getFlagValue = (flag: FeatureFlag): boolean =>
  typeof overrides[flag] === 'boolean' ? (overrides[flag] as boolean) : DEFAULT_FLAGS[flag];

export const getAllFlags = (): FeatureFlagState => ({
  ...DEFAULT_FLAGS,
  ...overrides,
});

export const setFlagOverride = async (flag: FeatureFlag, value: boolean): Promise<void> => {
  overrides = { ...overrides, [flag]: value };
  await persistOverrides();
  notify();
};

export const resetFlagOverrides = async (): Promise<void> => {
  overrides = {};
  await persistOverrides();
  notify();
};

export const subscribeToFlags = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
