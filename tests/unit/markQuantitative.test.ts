import {
  isQuantitativeMarkId,
  defaultDailyTargetForMarkId,
  QUANTITATIVE_MARK_IDS,
} from '../../lib/markQuantitative';

describe('markQuantitative', () => {
  it('treats only water as quantitative', () => {
    expect(isQuantitativeMarkId('water')).toBe(true);
    expect([...QUANTITATIVE_MARK_IDS]).toEqual(['water']);
  });

  it('treats daily-hit marks as binary (not quantitative)', () => {
    for (const id of ['steps', 'calories', 'nutrition', 'meal-prep', 'workout', 'sleep']) {
      expect(isQuantitativeMarkId(id)).toBe(false);
    }
  });

  it('handles null / undefined / unknown ids', () => {
    expect(isQuantitativeMarkId(null)).toBe(false);
    expect(isQuantitativeMarkId(undefined)).toBe(false);
    expect(isQuantitativeMarkId('made-up')).toBe(false);
  });

  it('gives water its count-up target and everything else a binary 1', () => {
    expect(defaultDailyTargetForMarkId('water')).toBe(8);
    expect(defaultDailyTargetForMarkId('steps')).toBe(1);
    expect(defaultDailyTargetForMarkId('nutrition')).toBe(1);
    expect(defaultDailyTargetForMarkId('meal-prep')).toBe(1);
    expect(defaultDailyTargetForMarkId(null)).toBe(1);
    expect(defaultDailyTargetForMarkId(undefined)).toBe(1);
  });
});
