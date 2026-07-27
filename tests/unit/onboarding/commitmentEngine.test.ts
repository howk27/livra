import { getMarksForCommitment } from '../../../lib/onboarding/commitmentEngine';
import { MARK_LIBRARY } from '../../../lib/suggestedCounters';

describe('getMarksForCommitment', () => {
  const fitnessGoal = 'Run a marathon';

  /**
   * A variable mark sits at its commitment position; an every-day mark sits at
   * 7 whatever the commitment. The four tests these replaced all asserted
   * `frequencyKind === 'variable'` on every returned mark — an invariant that
   * only ever held because "Run a marathon" happens to rank three variable
   * marks at the top. They passed vacuously before the exclusion was removed
   * and passed vacuously after it, which is to say they measured nothing.
   */
  const expectedTarget = (
    mark: { frequencyKind: string; frequency_min: number; frequency_recommended: number; frequency_max: number },
    commitment: 'easing' | 'steady' | 'push',
  ) => {
    if (mark.frequencyKind !== 'variable') return 7;
    if (commitment === 'easing') return mark.frequency_min;
    if (commitment === 'steady') return mark.frequency_recommended;
    return mark.frequency_max;
  };

  test('easing returns 2 marks, each at its easing position', () => {
    const result = getMarksForCommitment(fitnessGoal, 'easing');
    expect(result.length).toBe(2);
    for (const { mark, weeklyTarget } of result) {
      expect(weeklyTarget).toBe(expectedTarget(mark, 'easing'));
    }
  });

  test('steady returns 2 marks, each at its steady position', () => {
    const result = getMarksForCommitment(fitnessGoal, 'steady');
    expect(result.length).toBe(2);
    for (const { mark, weeklyTarget } of result) {
      expect(weeklyTarget).toBe(expectedTarget(mark, 'steady'));
    }
  });

  test('push returns 3 marks, each at its push position', () => {
    const result = getMarksForCommitment(fitnessGoal, 'push');
    expect(result.length).toBe(3);
    for (const { mark, weeklyTarget } of result) {
      expect(weeklyTarget).toBe(expectedTarget(mark, 'push'));
    }
  });

  /**
   * THE REGRESSION THIS EXISTS FOR. Onboarding used to filter every-day marks
   * out of the selection entirely, so a weight-loss goal — the most common
   * thing anyone types — could never be offered anything about food. Sleep and
   * Water had been silently unofferable the same way.
   *
   * Asserted on the returned SET, not on a hardcoded mark id, so a change to
   * the tag scorer's ranking does not make this fail for the wrong reason.
   */
  test('an every-day mark can be suggested, and arrives at 7 at every commitment', () => {
    const weightLossGoal = 'Lose 15 pounds and keep it off';
    for (const commitment of ['easing', 'steady', 'push'] as const) {
      const result = getMarksForCommitment(weightLossGoal, commitment);
      for (const { mark, weeklyTarget } of result) {
        if (mark.frequencyKind !== 'variable') {
          expect(weeklyTarget).toBe(7);
        }
      }
    }
    // and the exclusion is genuinely gone: somewhere in the library there is a
    // goal whose top marks include an every-day one.
    const everydayReachable = MARK_LIBRARY.filter((m) => m.frequencyKind !== 'variable')
      .map((m) => getMarksForCommitment(m.name, 'push'))
      .some((picks) => picks.some((p) => p.mark.frequencyKind !== 'variable'));
    expect(everydayReachable).toBe(true);
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

  test('generic goal still returns a usable set from the fallback marks', () => {
    const result = getMarksForCommitment('something completely random xyzxyz', 'steady');
    expect(result.length).toBeGreaterThan(0);
    for (const { mark, weeklyTarget } of result) {
      expect(MARK_LIBRARY.some((m) => m.id === mark.id)).toBe(true);
      expect(weeklyTarget).toBe(expectedTarget(mark, 'steady'));
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
