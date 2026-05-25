import { canAddGoal, canAddMark, FREE_GOAL_LIMIT, FREE_MARK_LIMIT } from '../../lib/gating';

describe('FREE limits', () => {
  test('FREE_GOAL_LIMIT is 3', () => {
    expect(FREE_GOAL_LIMIT).toBe(3);
  });
  test('FREE_MARK_LIMIT is 3', () => {
    expect(FREE_MARK_LIMIT).toBe(3);
  });
});

describe('canAddGoal', () => {
  test('free user under limit', () => expect(canAddGoal(false, 2)).toBe(true));
  test('free user at limit', () => expect(canAddGoal(false, 3)).toBe(false));
  test('pro user unlimited', () => expect(canAddGoal(true, 100)).toBe(true));
});

describe('canAddMark', () => {
  test('free user under limit', () => expect(canAddMark(false, 2)).toBe(true));
  test('free user at limit', () => expect(canAddMark(false, 3)).toBe(false));
  test('pro user unlimited', () => expect(canAddMark(true, 100)).toBe(true));
});
