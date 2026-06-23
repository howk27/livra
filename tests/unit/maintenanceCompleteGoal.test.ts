import AsyncStorage from '@react-native-async-storage/async-storage';
import { useGoalsStore } from '../../state/goalsSlice';
import { useMarksStore } from '../../state/countersSlice';
import type { Goal } from '../../types/goal';
import type { Mark } from '../../types';

function goal(over: Partial<Goal>): Goal {
  return {
    id: 'g', user_id: 'u', title: 'G', sort_index: 0, status: 'active',
    current_mark_count: 0, created_at: new Date().toISOString(), updated_at: '2026-06-01',
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
  useGoalsStore.setState({ goals: [], isLoading: false, error: null } as any);
  useMarksStore.setState({ marks: [], loading: false, error: null } as any);
});

test('completeGoal graduates the goal\'s marks to maintenance', async () => {
  useGoalsStore.setState({ goals: [goal({ id: 'G' })] } as any);
  useMarksStore.setState({
    marks: [mark({ id: 'a', goal_id: 'G' }), mark({ id: 'b', goal_id: 'G' })],
  } as any);

  await useGoalsStore.getState().completeGoal('G');

  const marks = useMarksStore.getState().marks;
  expect(marks.find((m) => m.id === 'a')).toMatchObject({ goal_id: null, maintenance_of: 'G' });
  expect(marks.find((m) => m.id === 'b')).toMatchObject({ goal_id: null, maintenance_of: 'G' });
});

test('completeGoal leaves marks of other goals untouched', async () => {
  useGoalsStore.setState({ goals: [goal({ id: 'G' })] } as any);
  useMarksStore.setState({ marks: [mark({ id: 'other', goal_id: 'H' })] } as any);

  await useGoalsStore.getState().completeGoal('G');

  expect(useMarksStore.getState().marks.find((m) => m.id === 'other')).toMatchObject({ goal_id: 'H' });
});
