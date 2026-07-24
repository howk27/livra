import {
  isMarkDoneToday,
  isGoalDoneToday,
  pickSpotlightGoalId,
  type QueueMark,
} from '../../lib/focusQueue';

/**
 * Spotlight Queue selectors (founder 2026-07-23): one goal expanded at a time
 * on Focus — the first goal in the user's drag order with work left today.
 * These are the pure selectors the screen leans on; the ordering rule (drag
 * order, never mutated by completion) is asserted here so a "helpful" re-sort
 * can't sneak in later.
 */

const mark = (id: string, over: Partial<QueueMark> = {}): QueueMark => ({
  id,
  dailyTarget: 1,
  weekly_target: 7,
  frequency_kind: 'variable',
  ...over,
});

const counts = (entries: Record<string, number>): Map<string, number> =>
  new Map(Object.entries(entries));

describe('isMarkDoneToday', () => {
  it('is done when today count meets the daily bar', () => {
    expect(isMarkDoneToday(mark('a'), 1)).toBe(true);
    expect(isMarkDoneToday(mark('a'), 0)).toBe(false);
  });

  it('respects a multi-log daily target', () => {
    const m = mark('a', { dailyTarget: 3 });
    expect(isMarkDoneToday(m, 2)).toBe(false);
    expect(isMarkDoneToday(m, 3)).toBe(true);
  });

  it('defaults a missing daily target to 1', () => {
    const m = mark('a', { dailyTarget: undefined as unknown as number });
    expect(isMarkDoneToday(m, 1)).toBe(true);
  });
});

describe('isGoalDoneToday', () => {
  it('open while any week-due mark has not met its daily bar today', () => {
    const marks = [mark('a'), mark('b')];
    expect(isGoalDoneToday(marks, counts({}), counts({ a: 1 }))).toBe(false);
  });

  it('done today when every week-due mark met its daily bar today', () => {
    const marks = [mark('a'), mark('b')];
    expect(isGoalDoneToday(marks, counts({}), counts({ a: 1, b: 1 }))).toBe(true);
  });

  it('done when every mark is done for the WEEK (nothing due at all)', () => {
    const marks = [mark('a', { weekly_target: 3 })];
    expect(isGoalDoneToday(marks, counts({ a: 3 }), counts({}))).toBe(true);
  });

  it('marks already done for the week ask nothing more today', () => {
    // "a" is week-done, "b" is due and logged today → goal is done today.
    const marks = [mark('a', { weekly_target: 3 }), mark('b')];
    expect(isGoalDoneToday(marks, counts({ a: 3 }), counts({ b: 1 }))).toBe(true);
  });

  it('an empty mark list counts as done (nothing to spotlight)', () => {
    expect(isGoalDoneToday([], counts({}), counts({}))).toBe(true);
  });
});

describe('pickSpotlightGoalId', () => {
  const marksBy = (m: Record<string, QueueMark[]>): Map<string, QueueMark[]> =>
    new Map(Object.entries(m));

  it('picks the FIRST goal in the given (drag) order with work left today', () => {
    const byGoal = marksBy({ g1: [mark('a')], g2: [mark('b')] });
    expect(pickSpotlightGoalId(['g1', 'g2'], byGoal, counts({}), counts({}))).toBe('g1');
    // The user's order is the authority — reversing it changes the spotlight.
    expect(pickSpotlightGoalId(['g2', 'g1'], byGoal, counts({}), counts({}))).toBe('g2');
  });

  it('advances past a goal whose work is done today (auto-advance)', () => {
    const byGoal = marksBy({ g1: [mark('a')], g2: [mark('b')] });
    expect(pickSpotlightGoalId(['g1', 'g2'], byGoal, counts({}), counts({ a: 1 }))).toBe('g2');
  });

  it('skips goals with no marks instead of spotlighting an empty card', () => {
    const byGoal = marksBy({ g1: [], g2: [mark('b')] });
    expect(pickSpotlightGoalId(['g1', 'g2'], byGoal, counts({}), counts({}))).toBe('g2');
  });

  it('returns null when every goal is done — the day is over, nothing is forced open', () => {
    const byGoal = marksBy({ g1: [mark('a')], g2: [mark('b', { weekly_target: 3 })] });
    expect(
      pickSpotlightGoalId(['g1', 'g2'], byGoal, counts({ b: 3 }), counts({ a: 1 })),
    ).toBe(null);
  });

  it('returns null for an empty goal list', () => {
    expect(pickSpotlightGoalId([], marksBy({}), counts({}), counts({}))).toBe(null);
  });
});
