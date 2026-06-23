import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMarksStore } from '../../state/countersSlice';
import type { Mark } from '../../types';

function mark(over: Partial<Mark>): Mark {
  return {
    id: 'm', user_id: 'u', name: 'n', unit: 'sessions', enable_streak: true,
    sort_index: 0, total: 0, created_at: '2026-01-01', updated_at: '2026-01-01',
    ...over,
  } as Mark;
}

beforeEach(async () => {
  await AsyncStorage.clear();
  useMarksStore.setState({ marks: [], loading: false, error: null } as any);
});

test('converts a completed goal\'s marks to maintenance (nulls goal_id, sets maintenance_of)', async () => {
  useMarksStore.setState({
    marks: [
      mark({ id: 'a', goal_id: 'G', total: 5, enable_streak: true }),
      mark({ id: 'b', goal_id: 'G' }),
    ],
  } as any);

  await useMarksStore.getState().convertMarksToMaintenance('G');

  const after = useMarksStore.getState().marks;
  expect(after.find((m) => m.id === 'a')).toMatchObject({ goal_id: null, maintenance_of: 'G', total: 5 });
  expect(after.find((m) => m.id === 'b')).toMatchObject({ goal_id: null, maintenance_of: 'G' });
});

test('leaves marks of other goals and loose marks untouched', async () => {
  useMarksStore.setState({
    marks: [
      mark({ id: 'a', goal_id: 'G' }),
      mark({ id: 'other', goal_id: 'H' }),
      mark({ id: 'loose', goal_id: null }),
    ],
  } as any);

  await useMarksStore.getState().convertMarksToMaintenance('G');

  const after = useMarksStore.getState().marks;
  expect(after.find((m) => m.id === 'other')).toMatchObject({ goal_id: 'H' });
  expect(after.find((m) => m.id === 'other')?.maintenance_of ?? null).toBeNull();
  expect(after.find((m) => m.id === 'loose')).toMatchObject({ goal_id: null });
  expect(after.find((m) => m.id === 'loose')?.maintenance_of ?? null).toBeNull();
});

test('skips already-deleted marks', async () => {
  useMarksStore.setState({
    marks: [mark({ id: 'gone', goal_id: 'G', deleted_at: '2026-01-01' })],
  } as any);

  await useMarksStore.getState().convertMarksToMaintenance('G');

  const after = useMarksStore.getState().marks.find((m) => m.id === 'gone');
  expect(after?.maintenance_of ?? null).toBeNull();
  expect(after?.goal_id).toBe('G');
});
