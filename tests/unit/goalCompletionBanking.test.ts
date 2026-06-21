// tests/unit/goalCompletionBanking.test.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useGoalsStore } from '../../state/goalsSlice';
import { useMomentumStore } from '../../state/momentumSlice';
import type { MomentumSnapshot } from '../../lib/goalMomentum';

const USER = 'u-bank';

const snap = (days: number): MomentumSnapshot => ({
  state: 'on_track',
  days,
  cushionRemaining: null,
  slippingMarkId: null,
});

async function reset() {
  await AsyncStorage.clear();
  useGoalsStore.setState({ goals: [], isLoading: false, error: null } as any);
  useMomentumStore.setState({ snapshots: {} } as any);
}
beforeEach(reset);

describe('completeGoal banks Momentum days', () => {
  test('banks the cached snapshot day-count onto the completed goal', async () => {
    const goal = await useGoalsStore.getState().createGoal({ title: 'Run daily', userId: USER, isPro: false });
    useMomentumStore.getState().setSnapshot(goal.id, snap(12));

    await useGoalsStore.getState().completeGoal(goal.id);

    const done = useGoalsStore.getState().goals.find((g) => g.id === goal.id);
    expect(done?.status).toBe('completed');
    expect(done?.banked_momentum_days).toBe(12);
  });

  test('banks 0 when the goal has no cached snapshot', async () => {
    const goal = await useGoalsStore.getState().createGoal({ title: 'No momentum', userId: USER, isPro: false });

    await useGoalsStore.getState().completeGoal(goal.id);

    const done = useGoalsStore.getState().goals.find((g) => g.id === goal.id);
    expect(done?.banked_momentum_days).toBe(0);
  });

  test('clears the completed goal snapshot', async () => {
    const goal = await useGoalsStore.getState().createGoal({ title: 'Clear me', userId: USER, isPro: false });
    useMomentumStore.getState().setSnapshot(goal.id, snap(5));

    await useGoalsStore.getState().completeGoal(goal.id);

    expect(useMomentumStore.getState().snapshots[goal.id]).toBeUndefined();
  });

  test('sibling active goal is untouched (no banked days) when another completes', async () => {
    const first = await useGoalsStore.getState().createGoal({ title: 'First', userId: USER, isPro: false });
    const second = await useGoalsStore.getState().createGoal({ title: 'Second', userId: USER, isPro: false });
    useMomentumStore.getState().setSnapshot(first.id, snap(8));

    await useGoalsStore.getState().completeGoal(first.id);

    const sibling = useGoalsStore.getState().goals.find((g) => g.id === second.id);
    expect(sibling?.status).toBe('active');
    expect(sibling?.banked_momentum_days ?? undefined).toBeUndefined();
  });
});
