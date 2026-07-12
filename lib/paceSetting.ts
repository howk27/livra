import AsyncStorage from '@react-native-async-storage/async-storage';
import type { CommitmentLevel } from '../state/onboardingSlice';
import type { Mark } from '../types';

/**
 * App-wide pace: the single control that replaces per-mark frequency editing.
 * Reuses the onboarding commitment vocabulary (easing / steady / push) so the
 * Settings control and the onboarding pace step describe the same thing.
 */
export type PaceLevel = CommitmentLevel;

export const PACE_STORAGE_KEY = 'livra.pace.v1';

export const PACE_LABELS: Record<PaceLevel, string> = {
  easing: 'Easing in',
  steady: 'Steady',
  push: 'All in',
};

const VALID_PACES: readonly PaceLevel[] = ['easing', 'steady', 'push'];

export async function getPace(): Promise<PaceLevel> {
  try {
    const v = await AsyncStorage.getItem(PACE_STORAGE_KEY);
    if (v && (VALID_PACES as readonly string[]).includes(v)) return v as PaceLevel;
    return 'steady';
  } catch {
    return 'steady';
  }
}

export async function setPace(pace: PaceLevel): Promise<void> {
  await AsyncStorage.setItem(PACE_STORAGE_KEY, pace);
}

/**
 * The weekly target a mark should have at the given pace, or null when the
 * pace does not apply (fixed/abstinence marks, or no stored frequency range).
 * Missing range endpoints fall back to the recommended value.
 */
export function paceWeeklyTarget(
  mark: Pick<Mark, 'frequency_kind' | 'frequency_min' | 'frequency_recommended' | 'frequency_max'>,
  pace: PaceLevel,
): number | null {
  if (mark.frequency_kind !== 'variable') return null;
  const rec = mark.frequency_recommended ?? null;
  const target =
    pace === 'easing'
      ? (mark.frequency_min ?? rec)
      : pace === 'push'
        ? (mark.frequency_max ?? rec)
        : rec;
  return target ?? null;
}
