// tests/unit/goalMomentumStore.test.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { evaluateGoalMomentum, loadMomentumRecord } from '../../lib/goalMomentumStore';

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('evaluateGoalMomentum', () => {
  it('starts a run on first log and persists the record', async () => {
    const marks = [{ id: 'm1', weekly_target: 7, last_activity_date: '2026-06-10' }];
    const snap = await evaluateGoalMomentum('g1', marks, '2026-06-10');
    expect(snap.state).toBe('on_track');
    expect(snap.days).toBe(1);

    const rec = await loadMomentumRecord('g1');
    expect(rec).toEqual({ goalId: 'g1', startDate: '2026-06-10' });
  });

  it('continues the run on a later day and resets when broken', async () => {
    const marks = [{ id: 'm1', weekly_target: 7, last_activity_date: '2026-06-10' }];
    await evaluateGoalMomentum('g1', marks, '2026-06-10'); // start
    const cont = await evaluateGoalMomentum('g1', marks, '2026-06-11'); // gap 1: resting, run continues
    expect(cont.state).toBe('resting');
    expect(cont.days).toBe(2);

    const broken = await evaluateGoalMomentum('g1', marks, '2026-06-14'); // gap 4 >= 3: broken
    expect(broken.state).toBe('broken');
    expect(broken.days).toBe(0);
    expect(await loadMomentumRecord('g1')).toEqual({ goalId: 'g1', startDate: null });
  });
});
