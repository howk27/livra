import {
  canAddGoal,
  canAddMark,
  canAddMarkToGoal,
  countMarksInGoal,
  FREE_GOAL_LIMIT,
  FREE_MARK_LIMIT,
  FREE_MARKS_PER_GOAL,
} from '../../lib/gating';

describe('FREE limits', () => {
  test('FREE_GOAL_LIMIT is 3', () => {
    expect(FREE_GOAL_LIMIT).toBe(3);
  });
  test('FREE_MARKS_PER_GOAL is 3', () => {
    expect(FREE_MARKS_PER_GOAL).toBe(3);
  });
  test('FREE_MARK_LIMIT (deprecated global) is 3', () => {
    expect(FREE_MARK_LIMIT).toBe(3);
  });
});

describe('canAddGoal', () => {
  test('free user under limit', () => expect(canAddGoal(false, 2)).toBe(true));
  test('free user at limit', () => expect(canAddGoal(false, 3)).toBe(false));
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
