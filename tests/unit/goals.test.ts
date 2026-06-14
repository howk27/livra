import {
  canAddGoal,
  getActiveGoal,
  getQueuedGoals,
  getCompletedGoals,
  nextGoalToActivate,
  FREE_GOAL_LIMIT,
} from '../../lib/goalLogic';
import type { Goal } from '../../types/goal';

function makeGoal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: 'g1',
    user_id: 'u1',
    title: 'Run a marathon',
    status: 'queued',
    sort_index: 0,
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
  test('returns the active goal', () => {
    const goals = [
      makeGoal({ id: '1', status: 'queued' }),
      makeGoal({ id: '2', status: 'active' }),
      makeGoal({ id: '3', status: 'completed' }),
    ];
    expect(getActiveGoal(goals)?.id).toBe('2');
  });

  test('returns undefined when no active goal', () => {
    const goals = [makeGoal({ status: 'queued' })];
    expect(getActiveGoal(goals)).toBeUndefined();
  });

  test('returns undefined for empty list', () => {
    expect(getActiveGoal([])).toBeUndefined();
  });
});

describe('getQueuedGoals', () => {
  test('returns only queued goals', () => {
    const goals = [
      makeGoal({ id: '1', status: 'active' }),
      makeGoal({ id: '2', status: 'queued', sort_index: 1 }),
      makeGoal({ id: '3', status: 'completed' }),
    ];
    const queued = getQueuedGoals(goals);
    expect(queued.length).toBe(1);
    expect(queued[0].id).toBe('2');
  });

  test('sorts by sort_index ascending', () => {
    const goals = [
      makeGoal({ id: 'b', status: 'queued', sort_index: 2 }),
      makeGoal({ id: 'a', status: 'queued', sort_index: 0 }),
      makeGoal({ id: 'c', status: 'queued', sort_index: 1 }),
    ];
    expect(getQueuedGoals(goals).map(g => g.id)).toEqual(['a', 'c', 'b']);
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

describe('nextGoalToActivate', () => {
  test('returns queued goal with lowest sort_index', () => {
    const goals = [
      makeGoal({ id: '1', status: 'queued', sort_index: 2 }),
      makeGoal({ id: '2', status: 'queued', sort_index: 0 }),
    ];
    expect(nextGoalToActivate(goals)?.id).toBe('2');
  });

  test('returns undefined when no queued goals', () => {
    const goals = [makeGoal({ status: 'active' })];
    expect(nextGoalToActivate(goals)).toBeUndefined();
  });

  test('returns undefined for empty list', () => {
    expect(nextGoalToActivate([])).toBeUndefined();
  });
});
