import AsyncStorage from '@react-native-async-storage/async-storage';
import { useGoalsStore } from '../../state/goalsSlice';
import { useMarksStore } from '../../state/countersSlice';
import { useMomentumStore } from '../../state/momentumSlice';
import type { Goal } from '../../types/goal';
import type { Mark } from '../../types';

// Divergence guard: expiry must NOT award XP the way completion does.
const mockAwardGoalXP = jest.fn(async () => ({}) as any);
jest.mock('../../lib/xpEngine', () => ({
  awardGoalXP: (...args: unknown[]) => mockAwardGoalXP(...args),
}));

// A deadline in the past so checkGoalCompletion takes the expiry branch.
const PAST = '2020-01-01';

function goal(over: Partial<Goal>): Goal {
  return {
    id: 'g', user_id: 'u', title: 'G', sort_index: 0, status: 'active',
    current_mark_count: 0, deadline_date: PAST,
    created_at: '2020-01-01', updated_at: '2026-06-01',
    ...over,
  } as Goal;
}
function mark(over: Partial<Mark>): Mark {
  return {
    id: 'm', user_id: 'u', name: 'n', unit: 'sessions', enable_streak: true,
    sort_index: 0, total: 0, created_at: new Date().toISOString(), updated_at: '2026-06-01',
    ...over,
  } as Mark;
}

beforeEach(async () => {
  await AsyncStorage.clear();
  mockAwardGoalXP.mockClear();
  useGoalsStore.setState({ goals: [], isLoading: false, error: null } as any);
  useMarksStore.setState({ marks: [], loading: false, error: null } as any);
  useMomentumStore.setState({ snapshots: {} } as any);
});

test('an expiring goal graduates its marks to maintenance', async () => {
  useGoalsStore.setState({ goals: [goal({ id: 'G' })] } as any);
  useMarksStore.setState({
    marks: [mark({ id: 'a', goal_id: 'G' }), mark({ id: 'b', goal_id: 'G' })],
  } as any);

  await useGoalsStore.getState().checkGoalCompletion('G');

  expect(useGoalsStore.getState().goals.find((g) => g.id === 'G')?.status).toBe('expired');
  const marks = useMarksStore.getState().marks;
  expect(marks.find((m) => m.id === 'a')).toMatchObject({ goal_id: null, maintenance_of: 'G' });
  expect(marks.find((m) => m.id === 'b')).toMatchObject({ goal_id: null, maintenance_of: 'G' });
});

test('an expiring goal clears its momentum snapshot', async () => {
  useGoalsStore.setState({ goals: [goal({ id: 'G' })] } as any);
  useMomentumStore.setState({ snapshots: { G: { goalId: 'G', state: 'on_track', days: 5 } } } as any);

  await useGoalsStore.getState().checkGoalCompletion('G');

  expect(useMomentumStore.getState().snapshots.G).toBeUndefined();
});

test('expiry does not award XP (diverges from completion)', async () => {
  // Old goal with a user_id would award XP if completed; expiry must not.
  useGoalsStore.setState({ goals: [goal({ id: 'G', user_id: 'u', created_at: '2020-01-01' })] } as any);
  useMarksStore.setState({ marks: [mark({ id: 'a', goal_id: 'G' })] } as any);

  await useGoalsStore.getState().checkGoalCompletion('G');

  expect(mockAwardGoalXP).not.toHaveBeenCalled();
});

test('expiring a goal with no marks is a no-op for marks and still expires', async () => {
  useGoalsStore.setState({ goals: [goal({ id: 'G' })] } as any);

  await expect(useGoalsStore.getState().checkGoalCompletion('G')).resolves.toBeUndefined();

  expect(useGoalsStore.getState().goals.find((g) => g.id === 'G')?.status).toBe('expired');
  expect(useMarksStore.getState().marks).toHaveLength(0);
});
