// tests/unit/goalLogic.test.ts
import { getActiveGoal, getActiveGoals } from '../../lib/goalLogic';
import type { Goal } from '../../types/goal';

const g = (over: Partial<Goal>): Goal => ({
  id: 'x', user_id: 'u', title: 't', sort_index: 0, status: 'active',
  current_mark_count: 0, created_at: '2026-01-01', updated_at: '2026-01-01', ...over,
});

test('getActiveGoals returns all active sorted by sort_index', () => {
  const goals = [
    g({ id: 'b', sort_index: 1 }),
    g({ id: 'a', sort_index: 0 }),
    g({ id: 'c', status: 'completed' }),
  ];
  expect(getActiveGoals(goals).map((x) => x.id)).toEqual(['a', 'b']);
});

test('getActiveGoal returns the first active by sort_index', () => {
  const goals = [g({ id: 'b', sort_index: 1 }), g({ id: 'a', sort_index: 0 })];
  expect(getActiveGoal(goals)?.id).toBe('a');
});
