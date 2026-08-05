import AsyncStorage from '@react-native-async-storage/async-storage';
import { autoBindHealthMarks } from '../../../lib/health/autoBind';
import {
  HEALTH_KIT_BINDINGS_KEY,
  getHealthKitBinding,
  setHealthKitBinding,
} from '../../../lib/health/healthKitBinding';

beforeEach(async () => {
  await AsyncStorage.removeItem(HEALTH_KIT_BINDINGS_KEY);
});

describe('autoBindHealthMarks', () => {
  it('binds every unbound mark whose name matches a health type', async () => {
    const bound = await autoBindHealthMarks([
      { id: 'm-run', name: 'Morning Run' },
      { id: 'm-water', name: 'Drink Water' },
      { id: 'm-read', name: 'Read 20 pages' },
    ]);
    expect(bound.sort()).toEqual(['m-run', 'm-water']);
    expect(await getHealthKitBinding('m-run')).toEqual({ type: 'running', config: null });
    expect(await getHealthKitBinding('m-water')).toEqual({ type: 'hydration', config: null });
    expect(await getHealthKitBinding('m-read')).toBeNull();
  });

  it('never overwrites an existing binding (manual config wins)', async () => {
    await setHealthKitBinding('m-steps', { type: 'steps', config: { stepGoal: 12000 } });
    const bound = await autoBindHealthMarks([{ id: 'm-steps', name: 'Walk 10k steps' }]);
    expect(bound).toEqual([]);
    expect(await getHealthKitBinding('m-steps')).toEqual({
      type: 'steps',
      config: { stepGoal: 12000 },
    });
  });

  it('skips a steps-type mark: stepGoal is the mark-detail flow\'s business', async () => {
    const bound = await autoBindHealthMarks([{ id: 'm-steps2', name: 'Walk 10k steps' }]);
    expect(bound).toEqual([]);
    expect(await getHealthKitBinding('m-steps2')).toBeNull();
  });

  it('skips a sleep-type mark: wake-time notification is the mark-detail flow\'s business', async () => {
    const bound = await autoBindHealthMarks([{ id: 'm-sleep', name: 'Sleep by 11' }]);
    expect(bound).toEqual([]);
    expect(await getHealthKitBinding('m-sleep')).toBeNull();
  });

  it('is idempotent: a second pass binds nothing new', async () => {
    await autoBindHealthMarks([{ id: 'm-run', name: 'Run' }]);
    expect(await autoBindHealthMarks([{ id: 'm-run', name: 'Run' }])).toEqual([]);
  });
});
