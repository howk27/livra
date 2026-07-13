import {
  weeklyTargetForPreset,
  scheduleForPreset,
  DEFAULT_FREQUENCY_PRESET,
} from '../../lib/markFrequencyPreset';
import type { DayOfWeek } from '../../types';

describe('weeklyTargetForPreset', () => {
  describe('variable marks', () => {
    test('everyDay preset → 7', () => {
      expect(weeklyTargetForPreset('everyDay', 'variable')).toBe(7);
    });

    test('threePerWeek preset → 3', () => {
      expect(weeklyTargetForPreset('threePerWeek', 'variable')).toBe(3);
    });

    test('custom preset → number of selected days', () => {
      expect(weeklyTargetForPreset('custom', 'variable', 4)).toBe(4);
      expect(weeklyTargetForPreset('custom', 'variable', 2)).toBe(2);
    });

    test('custom preset clamps to 1..7', () => {
      expect(weeklyTargetForPreset('custom', 'variable', 0)).toBe(1);
      expect(weeklyTargetForPreset('custom', 'variable', 99)).toBe(7);
    });
  });

  describe('fixed marks are inherently every-day', () => {
    test('everyDay → 7', () => {
      expect(weeklyTargetForPreset('everyDay', 'fixed')).toBe(7);
    });
    test('threePerWeek still resolves to 7 (preset does not apply)', () => {
      expect(weeklyTargetForPreset('threePerWeek', 'fixed')).toBe(7);
    });
    test('custom still resolves to 7 regardless of day count', () => {
      expect(weeklyTargetForPreset('custom', 'fixed', 3)).toBe(7);
    });
  });

  describe('abstinence marks are inherently every-day', () => {
    test('everyDay → 7', () => {
      expect(weeklyTargetForPreset('everyDay', 'abstinence')).toBe(7);
    });
    test('threePerWeek still resolves to 7', () => {
      expect(weeklyTargetForPreset('threePerWeek', 'abstinence')).toBe(7);
    });
    test('custom still resolves to 7 regardless of day count', () => {
      expect(weeklyTargetForPreset('custom', 'abstinence', 2)).toBe(7);
    });
  });

  test('default preset is everyDay (1/day)', () => {
    expect(DEFAULT_FREQUENCY_PRESET).toBe('everyDay');
    expect(weeklyTargetForPreset(DEFAULT_FREQUENCY_PRESET, 'variable')).toBe(7);
  });
});

describe('scheduleForPreset', () => {
  test('everyDay → daily schedule, no fixed days', () => {
    expect(scheduleForPreset('everyDay', [])).toEqual({ schedule_type: 'daily' });
  });

  test('threePerWeek → daily schedule (flexible, weekly_target carries the cadence)', () => {
    expect(scheduleForPreset('threePerWeek', [])).toEqual({ schedule_type: 'daily' });
  });

  test('custom → custom schedule with selected weekday JSON', () => {
    const days: DayOfWeek[] = [1, 3, 5];
    expect(scheduleForPreset('custom', days)).toEqual({
      schedule_type: 'custom',
      schedule_days: '[1,3,5]',
    });
  });

  test('custom with no selected days falls back to weekdays', () => {
    expect(scheduleForPreset('custom', [])).toEqual({
      schedule_type: 'custom',
      schedule_days: '[1,2,3,4,5]',
    });
  });
});
