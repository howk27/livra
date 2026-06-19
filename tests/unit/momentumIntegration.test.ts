// tests/unit/momentumIntegration.test.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useGoalsStore } from '../../state/goalsSlice';
import { useMarksStore } from '../../state/countersSlice';
import { loadMomentumRecord } from '../../lib/goalMomentumStore';
import { yyyyMmDd } from '../../lib/date';

const USER = 'u-mom';
const TODAY = yyyyMmDd(new Date());

async function reset() {
  await AsyncStorage.clear();
  useGoalsStore.setState({ goals: [], isLoading: false, error: null });
  useMarksStore.setState({ marks: [] } as any);
}
beforeEach(reset);

// Minimal Mark shape the engine reads (id, weekly_target, last_activity_date).
const seedMark = (id: string, last: string | undefined) =>
  ({ id, user_id: USER, name: id, weekly_target: 7, last_activity_date: last, enable_streak: false }) as any;

describe('creditMarkToGoals starts a Momentum run on log (trigger 1)', () => {
  test('logging a mark on the active goal persists a started record', async () => {
    const goal = await useGoalsStore.getState().createGoal({ title: 'Run daily', userId: USER, isPro: false });
    const markId = 'm1';
    useMarksStore.setState({ marks: [seedMark(markId, TODAY)] } as any);
    await useGoalsStore.getState().linkMarkToGoal(goal.id, markId);

    await useGoalsStore.getState().creditMarkToGoals(markId);

    const rec = await loadMomentumRecord(goal.id);
    expect(rec).toEqual({ goalId: goal.id, startDate: TODAY });
  });
});

describe('evaluateActiveGoalsMomentum (trigger 2)', () => {
  test('evaluates active goals, leaves queued goals untouched', async () => {
    const active = await useGoalsStore.getState().createGoal({ title: 'Active', userId: USER, isPro: false });
    const queued = await useGoalsStore.getState().createGoal({ title: 'Queued', userId: USER, isPro: false });
    // createGoal makes the 1st active and the 2nd queued (free cap).
    useMarksStore.setState({ marks: [seedMark('ma', TODAY), seedMark('mq', TODAY)] } as any);
    await useGoalsStore.getState().linkMarkToGoal(active.id, 'ma');
    await useGoalsStore.getState().linkMarkToGoal(queued.id, 'mq');

    const snaps = await useGoalsStore.getState().evaluateActiveGoalsMomentum();

    expect(snaps.get(active.id)?.state).toBe('on_track');
    expect(snaps.has(queued.id)).toBe(false);
    expect(await loadMomentumRecord(active.id)).toEqual({ goalId: active.id, startDate: TODAY });
    expect(await loadMomentumRecord(queued.id)).toBeNull();
  });
});
