import AsyncStorage from '@react-native-async-storage/async-storage';
import { useGoalsStore, GoalLimitError } from '../../state/goalsSlice';

const USER = 'u-cap';

async function reset() {
  await AsyncStorage.clear();
  useGoalsStore.setState({ goals: [], isLoading: false, error: null });
}

beforeEach(reset);

describe('Active-goal cap (2 free)', () => {
  test('free user can create 2 goals (both active)', async () => {
    await useGoalsStore.getState().createGoal({ title: 'Goal one', userId: USER, isPro: false });
    await useGoalsStore.getState().createGoal({ title: 'Goal two', userId: USER, isPro: false });
    const goals = useGoalsStore.getState().goals.filter((g) => g.user_id === USER);
    expect(goals).toHaveLength(2);
    expect(goals.filter((g) => g.status === 'active')).toHaveLength(2);
  });

  test('free user blocked on the 3rd active goal', async () => {
    await useGoalsStore.getState().createGoal({ title: 'Goal one', userId: USER, isPro: false });
    await useGoalsStore.getState().createGoal({ title: 'Goal two', userId: USER, isPro: false });
    await expect(
      useGoalsStore.getState().createGoal({ title: 'Goal three', userId: USER, isPro: false })
    ).rejects.toBeInstanceOf(GoalLimitError);
    expect(useGoalsStore.getState().goals.filter((g) => g.user_id === USER)).toHaveLength(2);
  });

  test('pro user can create a 3rd goal', async () => {
    await useGoalsStore.getState().createGoal({ title: 'Goal one', userId: USER, isPro: true });
    await useGoalsStore.getState().createGoal({ title: 'Goal two', userId: USER, isPro: true });
    await useGoalsStore.getState().createGoal({ title: 'Goal three', userId: USER, isPro: true });
    expect(useGoalsStore.getState().goals.filter((g) => g.user_id === USER)).toHaveLength(3);
  });

  test('completed goals do not count against the active cap', async () => {
    const a = await useGoalsStore.getState().createGoal({ title: 'Done one', userId: USER, isPro: false });
    const b = await useGoalsStore.getState().createGoal({ title: 'Done two', userId: USER, isPro: false });
    // Mark both as completed — they should free up the active cap.
    await useGoalsStore.getState().completeGoal(a.id);
    await useGoalsStore.getState().completeGoal(b.id);
    // With 2 completed, a free user may still create 2 fresh non-completed goals.
    await expect(
      useGoalsStore.getState().createGoal({ title: 'Fresh one', userId: USER, isPro: false })
    ).resolves.toBeDefined();
    await expect(
      useGoalsStore.getState().createGoal({ title: 'Fresh two', userId: USER, isPro: false })
    ).resolves.toBeDefined();
    // The 3rd non-completed goal is blocked again.
    await expect(
      useGoalsStore.getState().createGoal({ title: 'Fresh three', userId: USER, isPro: false })
    ).rejects.toBeInstanceOf(GoalLimitError);
  });
});
