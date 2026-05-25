import { computeStepGoal, computeMedianWakeTime, roundToNearest } from '../../../lib/health/healthLearner';

describe('roundToNearest', () => {
  test('rounds 7400 to 7500 (nearest 500)', () => expect(roundToNearest(7400, 500)).toBe(7500));
  test('rounds 7200 to 7000 (nearest 500)', () => expect(roundToNearest(7200, 500)).toBe(7000));
  test('rounds 0 to 0', () => expect(roundToNearest(0, 500)).toBe(0));
  test('exact multiple unchanged', () => expect(roundToNearest(8000, 500)).toBe(8000));
});

describe('computeStepGoal', () => {
  test('returns null for empty array', () => expect(computeStepGoal([])).toBeNull());

  test('single value — 80% rounded to 500', () => {
    // avg=10000, 80%=8000, nearest 500=8000
    expect(computeStepGoal([10000])).toBe(8000);
  });

  test('multiple values — avg then 80%', () => {
    // avg=9000, 80%=7200, nearest 500=7000
    expect(computeStepGoal([8000, 10000])).toBe(7000);
  });

  test('rounds low values to nearest 500', () => {
    // avg=5000, 80%=4000, nearest 500=4000
    expect(computeStepGoal([5000])).toBe(4000);
  });

  test('result is always a multiple of 500', () => {
    const counts = [7823, 9102, 8456, 6711, 10230];
    const result = computeStepGoal(counts)!;
    expect(result % 500).toBe(0);
  });
});

describe('computeMedianWakeTime', () => {
  test('returns null for empty array', () => expect(computeMedianWakeTime([])).toBeNull());

  test('single value — returns it unchanged', () => {
    expect(computeMedianWakeTime(['07:30'])).toBe('07:30');
  });

  test('odd number — middle value', () => {
    expect(computeMedianWakeTime(['06:30', '07:00', '07:30'])).toBe('07:00');
  });

  test('even number — average of two middle values', () => {
    // 06:00=360, 07:00=420 → avg=390 → 06:30
    expect(computeMedianWakeTime(['06:00', '07:00'])).toBe('06:30');
  });

  test('sorts before computing median', () => {
    // Unsorted input — 07:30 is median
    expect(computeMedianWakeTime(['08:00', '06:00', '07:30'])).toBe('07:30');
  });

  test('handles midnight edge case', () => {
    expect(computeMedianWakeTime(['00:00'])).toBe('00:00');
  });
});
