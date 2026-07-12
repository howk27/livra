import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getPace,
  setPace,
  paceWeeklyTarget,
  PACE_STORAGE_KEY,
  PACE_LABELS,
} from '../../lib/paceSetting';
import type { Mark } from '../../types';

const variableMark = (over: Partial<Mark> = {}): Mark =>
  ({
    id: 'm1',
    name: 'Run',
    frequency_kind: 'variable',
    frequency_min: 2,
    frequency_recommended: 3,
    frequency_max: 5,
    weekly_target: 3,
    ...over,
  }) as Mark;

describe('paceSetting', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  describe('getPace / setPace', () => {
    it('defaults to steady when nothing stored', async () => {
      expect(await getPace()).toBe('steady');
    });

    it('round-trips a stored pace', async () => {
      await setPace('push');
      expect(await getPace()).toBe('push');
      expect(await AsyncStorage.getItem(PACE_STORAGE_KEY)).toBe('push');
    });

    it('falls back to steady on a corrupt stored value', async () => {
      await AsyncStorage.setItem(PACE_STORAGE_KEY, 'warp-speed');
      expect(await getPace()).toBe('steady');
    });
  });

  describe('paceWeeklyTarget', () => {
    it('maps easing/steady/push to min/recommended/max for variable marks', () => {
      const m = variableMark();
      expect(paceWeeklyTarget(m, 'easing')).toBe(2);
      expect(paceWeeklyTarget(m, 'steady')).toBe(3);
      expect(paceWeeklyTarget(m, 'push')).toBe(5);
    });

    it('returns null for fixed and abstinence marks', () => {
      expect(paceWeeklyTarget(variableMark({ frequency_kind: 'fixed' }), 'push')).toBeNull();
      expect(paceWeeklyTarget(variableMark({ frequency_kind: 'abstinence' }), 'easing')).toBeNull();
    });

    it('returns null when the mark has no frequency range', () => {
      expect(
        paceWeeklyTarget(
          variableMark({ frequency_min: null, frequency_recommended: null, frequency_max: null }),
          'steady',
        ),
      ).toBeNull();
    });

    it('falls back across missing range endpoints', () => {
      const m = variableMark({ frequency_min: null, frequency_recommended: 4, frequency_max: null });
      expect(paceWeeklyTarget(m, 'easing')).toBe(4);
      expect(paceWeeklyTarget(m, 'push')).toBe(4);
    });
  });

  it('exposes user-facing labels without dashes', () => {
    for (const label of Object.values(PACE_LABELS)) {
      expect(label).not.toMatch(/[—–-]/);
    }
  });
});
