import { getMarksForCommitment } from '../../../lib/onboarding/commitmentEngine';
import { MARK_LIBRARY } from '../../../lib/suggestedCounters';

describe('getMarksForCommitment', () => {
  const fitnessGoal = 'Run a marathon';

  test('easing returns 2 marks at frequency_min', () => {
    const result = getMarksForCommitment(fitnessGoal, 'easing');
    expect(result.length).toBe(2);
    for (const { mark, weeklyTarget } of result) {
      expect(mark.frequencyKind).toBe('variable');
      expect(weeklyTarget).toBe(mark.frequency_min);
    }
  });

  test('steady returns 2 marks at frequency_recommended', () => {
    const result = getMarksForCommitment(fitnessGoal, 'steady');
    expect(result.length).toBe(2);
    for (const { mark, weeklyTarget } of result) {
      expect(mark.frequencyKind).toBe('variable');
      expect(weeklyTarget).toBe(mark.frequency_recommended);
    }
  });

  test('push returns 3 marks at frequency_max', () => {
    const result = getMarksForCommitment(fitnessGoal, 'push');
    expect(result.length).toBe(3);
    for (const { mark, weeklyTarget } of result) {
      expect(mark.frequencyKind).toBe('variable');
      expect(weeklyTarget).toBe(mark.frequency_max);
    }
  });

  test('no fixed or abstinence marks included', () => {
    const result = getMarksForCommitment(fitnessGoal, 'push');
    for (const { mark } of result) {
      expect(mark.frequencyKind).toBe('variable');
    }
  });

  test('weeklyTarget is within valid range (1–7)', () => {
    for (const level of ['easing', 'steady', 'push'] as const) {
      const result = getMarksForCommitment(fitnessGoal, level);
      for (const { weeklyTarget } of result) {
        expect(weeklyTarget).toBeGreaterThanOrEqual(1);
        expect(weeklyTarget).toBeLessThanOrEqual(7);
      }
    }
  });

  test('steady marks — daily-friendly marks are NOT clamped', () => {
    // "Do NOT clamp daily marks" — water/steps/vitamins rec=7, that must pass through
    const waterGoal = 'drink more water';
    const result = getMarksForCommitment(waterGoal, 'steady');
    const waterMark = result.find((r) => r.mark.id === 'water');
    if (waterMark) {
      expect(waterMark.weeklyTarget).toBe(waterMark.mark.frequency_recommended);
    }
  });

  test('generic goal uses fallback marks and returns variable kind', () => {
    const result = getMarksForCommitment('something completely random xyzxyz', 'steady');
    // Falls back to FALLBACK_IDS in goalMarkSuggestions — all should be variable
    for (const { mark } of result) {
      expect(mark.frequencyKind).toBe('variable');
    }
  });

  test('easing never gives push count', () => {
    const result = getMarksForCommitment(fitnessGoal, 'easing');
    expect(result.length).toBeLessThanOrEqual(2);
  });

  test('each result has a valid mark from MARK_LIBRARY', () => {
    const result = getMarksForCommitment(fitnessGoal, 'push');
    const libraryIds = new Set(MARK_LIBRARY.map((m) => m.id));
    for (const { mark } of result) {
      expect(libraryIds.has(mark.id)).toBe(true);
    }
  });
});
