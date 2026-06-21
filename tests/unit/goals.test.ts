import {
  canAddGoal,
  getActiveGoal,
  getCompletedGoals,
  FREE_GOAL_LIMIT,
} from '../../lib/goalLogic';
import type { Goal } from '../../types/goal';

function makeGoal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: 'g1',
    user_id: 'u1',
    title: 'Run a marathon',
    status: 'active',
    sort_index: 0,
    current_mark_count: 0,
    created_at: '2026-05-25T00:00:00Z',
    updated_at: '2026-05-25T00:00:00Z',
    ...overrides,
  };
}

describe('FREE_GOAL_LIMIT', () => {
  test('is 2', () => {
    expect(FREE_GOAL_LIMIT).toBe(2);
  });
});

describe('canAddGoal', () => {
  test('free user under limit can add', () => {
    expect(canAddGoal(false, 1)).toBe(true);
  });
  test('free user at limit cannot add', () => {
    expect(canAddGoal(false, 2)).toBe(false);
  });
  test('free user over limit cannot add', () => {
    expect(canAddGoal(false, 5)).toBe(false);
  });
  test('pro user can always add', () => {
    expect(canAddGoal(true, 100)).toBe(true);
  });
  test('pro user can add at 0', () => {
    expect(canAddGoal(true, 0)).toBe(true);
  });
});

describe('getActiveGoal', () => {
  test('returns the first active goal by sort_index', () => {
    const goals = [
      makeGoal({ id: '1', status: 'active', sort_index: 1 }),
      makeGoal({ id: '2', status: 'active', sort_index: 0 }),
      makeGoal({ id: '3', status: 'completed' }),
    ];
    expect(getActiveGoal(goals)?.id).toBe('2');
  });

  test('returns undefined when no active goal', () => {
    const goals = [makeGoal({ status: 'expired' })];
    expect(getActiveGoal(goals)).toBeUndefined();
  });

  test('returns undefined for empty list', () => {
    expect(getActiveGoal([])).toBeUndefined();
  });
});

describe('getCompletedGoals', () => {
  test('returns only completed goals', () => {
    const goals = [
      makeGoal({ id: '1', status: 'active' }),
      makeGoal({ id: '2', status: 'completed', completed_at: '2026-05-20T00:00:00Z' }),
    ];
    expect(getCompletedGoals(goals).length).toBe(1);
  });

  test('sorts by completed_at descending (most recent first)', () => {
    const goals = [
      makeGoal({ id: 'old', status: 'completed', completed_at: '2026-04-01T00:00:00Z' }),
      makeGoal({ id: 'new', status: 'completed', completed_at: '2026-05-01T00:00:00Z' }),
    ];
    expect(getCompletedGoals(goals)[0].id).toBe('new');
  });
});
