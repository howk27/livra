import {
  buildNextMoveChips,
  isMarkDoneToday,
  isGoalDoneToday,
  pickSpotlightGoalId,
  pickNextMove,
  remainingThisWeek,
  remainingToday,
  NEXT_MOVE_CHIP_CAP,
  type QueueMark,
} from '../../lib/focusQueue';
import { markWeeklyState } from '../../lib/features';

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

describe('remainingThisWeek (the on-pace fold number)', () => {
  it('sums each mark\'s unmet cadence', () => {
    const marks = [mark('a', { weekly_target: 3 }), mark('b', { weekly_target: 7 })];
    expect(remainingThisWeek(marks, counts({ a: 1, b: 2 }))).toBe(2 + 5);
  });

  it('bonus logs past a met cadence never lend to a sibling mark', () => {
    const marks = [mark('a', { weekly_target: 3 }), mark('b', { weekly_target: 3 })];
    // a is over-complete (5 of 3); b still owes all 3 — the fold must say 3, not 1.
    expect(remainingThisWeek(marks, counts({ a: 5 }))).toBe(3);
  });

  it('missing weekly_target falls back to 3, matching markWeeklyState', () => {
    const m = mark('a', { weekly_target: undefined });
    expect(remainingThisWeek([m], counts({}))).toBe(3);
    expect(remainingThisWeek([m], counts({ a: 3 }))).toBe(0);
  });

  it('no marks means nothing owed', () => {
    expect(remainingThisWeek([], counts({}))).toBe(0);
  });

  it('reads 0 exactly when every mark is doneForWeek — the fold and the due filter agree', () => {
    const marks = [mark('a', { weekly_target: 2 }), mark('b', { weekly_target: 3 })];
    const weekly = counts({ a: 2, b: 3 });
    expect(remainingThisWeek(marks, weekly)).toBe(0);
    for (const m of marks) {
      expect(markWeeklyState(m, weekly.get(m.id) ?? 0)).toBe('doneForWeek');
    }
  });
});

describe('remainingToday (the Focus header number — founder QC64 2026-08-04)', () => {
  it('counts week-due marks whose daily bar is unmet today', () => {
    const marks = [mark('a'), mark('b'), mark('c')];
    // a logged today, b not, c not — 2 left today.
    expect(remainingToday(marks, counts({}), counts({ a: 1 }))).toBe(2);
  });

  it('a mark done for the WEEK asks nothing more today', () => {
    const marks = [mark('a', { weekly_target: 2 }), mark('b')];
    expect(remainingToday(marks, counts({ a: 2 }), counts({}))).toBe(1);
  });

  it('a multi-log daily target counts as ONE check-in left, not N taps', () => {
    const m = mark('a', { dailyTarget: 3 });
    expect(remainingToday([m], counts({}), counts({ a: 2 }))).toBe(1);
    expect(remainingToday([m], counts({}), counts({ a: 3 }))).toBe(0);
  });

  it('reads 0 exactly when every mark is doneForWeek or done today — the header and the all-done banner cannot disagree', () => {
    // Mirrors focus.tsx allDoneForDay's predicate over the same mark set.
    const marks = [mark('a', { weekly_target: 2 }), mark('b'), mark('c')];
    const weekly = counts({ a: 2 });
    const today = counts({ b: 1, c: 1 });
    expect(remainingToday(marks, weekly, today)).toBe(0);
    const allDone = marks.every((m) => {
      if (markWeeklyState(m, weekly.get(m.id) ?? 0) === 'doneForWeek') return true;
      return isMarkDoneToday(m, today.get(m.id) ?? 0);
    });
    expect(allDone).toBe(true);
  });

  it('no marks means nothing owed', () => {
    expect(remainingToday([], counts({}), counts({}))).toBe(0);
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

describe('pickNextMove', () => {
  const m = (id: string) => mark(id, { weekly_target: 5 });
  const marks = [m('a'), m('b'), m('c')];
  const dueAll = counts({ a: 0, b: 0, c: 0 });

  it('picks the first due mark in the given order', () =>
    expect(pickNextMove(marks, dueAll, counts({ a: 0, b: 0, c: 0 }))?.id).toBe('a'));
  it('advances past a done-today mark', () =>
    expect(pickNextMove(marks, dueAll, counts({ a: 1, b: 0, c: 0 }))?.id).toBe('b'));
  it('honors a valid override', () =>
    expect(pickNextMove(marks, dueAll, counts({ a: 0, b: 0, c: 0 }), 'c')?.id).toBe('c'));
  it('ignores an override that is already done today (auto-advance)', () =>
    expect(pickNextMove(marks, dueAll, counts({ a: 0, b: 0, c: 1 }), 'c')?.id).toBe('a'));
  it('skips done-for-week marks', () =>
    expect(pickNextMove(marks, counts({ a: 5, b: 0, c: 0 }), counts({ a: 0, b: 0, c: 0 }))?.id).toBe('b'));
  it('returns null when everything is done today', () =>
    expect(pickNextMove(marks, dueAll, counts({ a: 1, b: 1, c: 1 }))).toBeNull());

  it('an empty mark list has no next move', () =>
    expect(pickNextMove([], dueAll, counts({}))).toBeNull());
  it('falls back to the computed order when the override names a mark that is gone', () =>
    expect(pickNextMove(marks, dueAll, counts({ a: 0, b: 0, c: 0 }), 'deleted')?.id).toBe('a'));
  it('ignores an override that is done for the WEEK, not just today', () =>
    expect(pickNextMove(marks, counts({ a: 0, b: 0, c: 5 }), counts({ a: 0, b: 0, c: 0 }), 'c')?.id)
      .toBe('a'));
});

describe('buildNextMoveChips — the up-next strip under the hero', () => {
  const named = (id: string) => ({ ...mark(id, { weekly_target: 5 }), name: `Mark ${id}` });

  it('excludes the hero — the card already offers that move', () => {
    const { chips } = buildNextMoveChips([named('a'), named('b')], { id: 'a' }, counts({}));
    expect(chips.map((c) => c.id)).toEqual(['b']);
  });

  it('keeps done-today marks in the strip, marked done', () => {
    const { chips } = buildNextMoveChips(
      [named('a'), named('b'), named('c')],
      { id: 'a' },
      counts({ b: 1 }),
    );
    expect(chips).toEqual([
      { id: 'b', name: 'Mark b', doneToday: true },
      { id: 'c', name: 'Mark c', doneToday: false },
    ]);
  });

  it('caps the strip and counts the remainder', () => {
    const marks = Array.from({ length: NEXT_MOVE_CHIP_CAP + 4 }, (_, i) => named(`m${i}`));
    const { chips, overflowCount } = buildNextMoveChips(marks, { id: 'm0' }, counts({}));
    expect(chips).toHaveLength(NEXT_MOVE_CHIP_CAP);
    // 9 marks left after the hero, 6 shown.
    expect(overflowCount).toBe(3);
    expect(chips.map((c) => c.id)).not.toContain('m0');
  });

  it('never counts a negative overflow', () => {
    const { chips, overflowCount } = buildNextMoveChips([named('a')], { id: 'a' }, counts({}));
    expect(chips).toEqual([]);
    expect(overflowCount).toBe(0);
  });

  it('lists every mark when there is no hero to exclude', () => {
    const { chips } = buildNextMoveChips([named('a'), named('b')], null, counts({}));
    expect(chips.map((c) => c.id)).toEqual(['a', 'b']);
  });
});

