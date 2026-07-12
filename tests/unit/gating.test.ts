import {
  canAddGoal,
  canAddMark,
  canAddMarkToGoal,
  canAddHabitMark,
  countMarksInGoal,
  countUnlinkedMarks,
  canExportData,
  canCustomizeShareCard,
  FREE_GOAL_LIMIT,
  FREE_HABIT_LIMIT,
  FREE_MARK_LIMIT,
  FREE_MARKS_PER_GOAL,
} from '../../lib/gating';

describe('FREE limits', () => {
  test('FREE_GOAL_LIMIT is 2 (active goals on free)', () => {
    expect(FREE_GOAL_LIMIT).toBe(2);
  });
  test('FREE_MARKS_PER_GOAL is 3', () => {
    expect(FREE_MARKS_PER_GOAL).toBe(3);
  });
  test('FREE_MARK_LIMIT (deprecated global) is 3', () => {
    expect(FREE_MARK_LIMIT).toBe(3);
  });
  test('FREE_HABIT_LIMIT is 3 (unlinked daily habits on free)', () => {
    expect(FREE_HABIT_LIMIT).toBe(3);
  });
});

describe('canAddGoal', () => {
  test('free user with 1 active goal can add', () => expect(canAddGoal(false, 1)).toBe(true));
  test('free user at 2 active goals is blocked', () => expect(canAddGoal(false, 2)).toBe(false));
  test('pro user unlimited', () => expect(canAddGoal(true, 100)).toBe(true));
});

describe('canAddMark (deprecated global)', () => {
  test('free user under limit', () => expect(canAddMark(false, 2)).toBe(true));
  test('free user at limit', () => expect(canAddMark(false, 3)).toBe(false));
  test('pro user unlimited', () => expect(canAddMark(true, 100)).toBe(true));
});

describe('canAddMarkToGoal (per-goal cap)', () => {
  test('free user with 2 marks on the goal can add', () =>
    expect(canAddMarkToGoal(false, 2)).toBe(true));
  test('free user with 3 marks on the goal is blocked', () =>
    expect(canAddMarkToGoal(false, 3)).toBe(false));
  test('free user with 0 marks on the goal can add', () =>
    expect(canAddMarkToGoal(false, 0)).toBe(true));
  test('pro user is never blocked', () => expect(canAddMarkToGoal(true, 99)).toBe(true));
});

describe('countMarksInGoal', () => {
  const marks = [
    { id: 'm1', goal_id: 'A', deleted_at: null },
    { id: 'm2', goal_id: 'A', deleted_at: null },
    { id: 'm3', goal_id: 'B', deleted_at: null },
    { id: 'm4', goal_id: 'A', deleted_at: '2026-01-01' }, // deleted — excluded
    { id: 'm5', goal_id: null, deleted_at: null }, // unlinked — excluded
  ];

  test('counts only active marks feeding the given goal', () => {
    expect(countMarksInGoal(marks, 'A')).toBe(2);
  });
  test('per-goal isolation: goal B unaffected by goal A marks', () => {
    expect(countMarksInGoal(marks, 'B')).toBe(1);
  });
  test('goal with no marks counts zero', () => {
    expect(countMarksInGoal(marks, 'C')).toBe(0);
  });
  test('ignores soft-deleted marks', () => {
    expect(countMarksInGoal([{ id: 'x', goal_id: 'A', deleted_at: 'now' }], 'A')).toBe(0);
  });
});

describe('canAddHabitMark (unlinked daily-habit cap)', () => {
  test('free user with 2 daily habits can add a 3rd', () =>
    expect(canAddHabitMark(false, 2)).toBe(true));
  test('free user with 3 daily habits is blocked', () =>
    expect(canAddHabitMark(false, 3)).toBe(false));
  test('free user with 0 daily habits can add', () =>
    expect(canAddHabitMark(false, 0)).toBe(true));
  test('pro user is never blocked', () => expect(canAddHabitMark(true, 99)).toBe(true));
});

describe('countUnlinkedMarks (daily-habit bucket)', () => {
  const marks = [
    { id: 'm1', goal_id: null, deleted_at: null },
    { id: 'm2', goal_id: undefined, deleted_at: null },
    { id: 'm3', goal_id: 'A', deleted_at: null }, // goal-linked — excluded
    { id: 'm4', goal_id: null, deleted_at: '2026-01-01' }, // deleted — excluded
  ];

  test('counts only active marks with no goal_id', () => {
    expect(countUnlinkedMarks(marks)).toBe(2);
  });
  test('goal-linked marks are a separate bucket (excluded)', () => {
    expect(countUnlinkedMarks([{ id: 'x', goal_id: 'A', deleted_at: null }])).toBe(0);
  });
  test('ignores soft-deleted unlinked marks', () => {
    expect(countUnlinkedMarks([{ id: 'x', goal_id: null, deleted_at: 'now' }])).toBe(0);
  });
  test('empty list counts zero', () => {
    expect(countUnlinkedMarks([])).toBe(0);
  });
});

describe('Livra+ feature gates', () => {
  test('data export (CSV): free blocked, pro allowed', () => {
    expect(canExportData(false)).toBe(false);
    expect(canExportData(true)).toBe(true);
  });
  test('customize share card: free blocked, pro allowed', () => {
    expect(canCustomizeShareCard(false)).toBe(false);
    expect(canCustomizeShareCard(true)).toBe(true);
  });
});

describe('canCustomizeShareCard', () => {
  it('allows customization only for Pro users', () => {
    expect(canCustomizeShareCard(true)).toBe(true);
    expect(canCustomizeShareCard(false)).toBe(false);
  });

  it('no longer exports the old canUseShareCard gate', () => {
    const gating = require('../../lib/gating');
    expect(gating.canUseShareCard).toBeUndefined();
  });
});
