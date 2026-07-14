import { resolveMarkCategory, majorityCategory } from '../../lib/markCategoryResolve';

describe('resolveMarkCategory', () => {
  it('matches MARK_LIBRARY by emoji first', () => {
    // '🌙' is the library Sleep mark → category 'Recovery' (library outranks
    // the icon resolver, which would say 'sleep').
    expect(resolveMarkCategory({ name: 'Anything', emoji: '🌙' })).toBe('Recovery');
  });

  it('falls back to resolveCounterIconType by name when no library emoji matches', () => {
    expect(resolveMarkCategory({ name: 'Plan the day', emoji: undefined })).toBe('planning');
  });

  it("falls back to 'custom' when nothing matches", () => {
    expect(resolveMarkCategory({ name: 'Xyzzy', emoji: '🦄' })).toBe('custom');
  });
});

describe('majorityCategory', () => {
  it("returns 'custom' when there are no marks", () => {
    expect(majorityCategory([])).toBe('custom');
  });

  it('returns the majority category across marks', () => {
    expect(
      majorityCategory([
        { name: 'Sleep', emoji: '🌙' },
        { name: 'Rest Day', emoji: '😴' },
        { name: 'Workout', emoji: '🏋️' },
      ]),
    ).toBe('Recovery');
  });

  it('resolves a tie to the first category to reach the winning count', () => {
    expect(
      majorityCategory([
        { name: 'Workout', emoji: '🏋️' },
        { name: 'Sleep', emoji: '🌙' },
      ]),
    ).toBe('Fitness');
  });
});
