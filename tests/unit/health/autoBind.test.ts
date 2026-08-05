import AsyncStorage from '@react-native-async-storage/async-storage';
import { autoBindHealthMarks } from '../../../lib/health/autoBind';
import {
  HEALTH_KIT_BINDINGS_KEY,
  getHealthKitBinding,
  setHealthKitBinding,
} from '../../../lib/health/healthKitBinding';
import { readAverageDailySteps } from '../../../lib/health/healthReader';

jest.mock('../../../lib/health/healthReader');

beforeEach(async () => {
  await AsyncStorage.removeItem(HEALTH_KIT_BINDINGS_KEY);
  (readAverageDailySteps as jest.Mock).mockReset().mockResolvedValue(null);
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

  it('binds a steps mark with the 30-day average rounded to the NEAREST 500', async () => {
    (readAverageDailySteps as jest.Mock).mockResolvedValue(9720);
    const bound = await autoBindHealthMarks([{ id: 'm-steps2', name: 'Walk 10k steps' }]);
    expect(bound).toEqual(['m-steps2']);
    expect(await getHealthKitBinding('m-steps2')).toEqual({
      type: 'steps',
      config: { stepGoal: 9500 },
    });
  });

  it('rounds the steps average UP past a 250 boundary (nearest, not floor)', async () => {
    (readAverageDailySteps as jest.Mock).mockResolvedValue(9750);
    await autoBindHealthMarks([{ id: 'm-steps3', name: 'Walk more steps' }]);
    expect(await getHealthKitBinding('m-steps3')).toEqual({
      type: 'steps',
      config: { stepGoal: 10000 },
    });
  });

  it('falls back to 8000 when Health has no step history', async () => {
    (readAverageDailySteps as jest.Mock).mockResolvedValue(null);
    const bound = await autoBindHealthMarks([{ id: 'm-steps4', name: 'Walk 10k steps' }]);
    expect(bound).toEqual(['m-steps4']);
    expect(await getHealthKitBinding('m-steps4')).toEqual({
      type: 'steps',
      config: { stepGoal: 8000 },
    });
  });

  it('falls back to 8000 when the average rounds to a degenerate 0 goal', async () => {
    (readAverageDailySteps as jest.Mock).mockResolvedValue(120);
    await autoBindHealthMarks([{ id: 'm-steps5', name: 'Walk it off' }]);
    expect(await getHealthKitBinding('m-steps5')).toEqual({
      type: 'steps',
      config: { stepGoal: 8000 },
    });
  });

  it('computes the steps average at most once per pass', async () => {
    (readAverageDailySteps as jest.Mock).mockResolvedValue(8000);
    await autoBindHealthMarks([
      { id: 'm-a', name: 'Walk 10k steps' },
      { id: 'm-b', name: 'Evening walk' },
    ]);
    expect(readAverageDailySteps).toHaveBeenCalledTimes(1);
  });

  it('does not read step history when no steps mark is being bound', async () => {
    await autoBindHealthMarks([{ id: 'm-run2', name: 'Morning Run' }]);
    expect(readAverageDailySteps).not.toHaveBeenCalled();
  });

  it('binds a sleep mark with the 7-hour default', async () => {
    const bound = await autoBindHealthMarks([{ id: 'm-sleep', name: 'Sleep by 11' }]);
    expect(bound).toEqual(['m-sleep']);
    expect(await getHealthKitBinding('m-sleep')).toEqual({
      type: 'sleep',
      config: { sleepHours: 7 },
    });
  });

  it('never overwrites an existing steps/sleep binding with defaults', async () => {
    await setHealthKitBinding('m-sleep2', { type: 'sleep', config: { sleepHours: 9 } });
    (readAverageDailySteps as jest.Mock).mockResolvedValue(12000);
    const bound = await autoBindHealthMarks([{ id: 'm-sleep2', name: 'Sleep well' }]);
    expect(bound).toEqual([]);
    expect(await getHealthKitBinding('m-sleep2')).toEqual({
      type: 'sleep',
      config: { sleepHours: 9 },
    });
  });

  it('never throws even when the average reader rejects (defensive: contract says it cannot)', async () => {
    (readAverageDailySteps as jest.Mock).mockRejectedValue(new Error('boom'));
    await expect(
      autoBindHealthMarks([{ id: 'm-steps6', name: 'Walk 10k steps' }]),
    ).resolves.toEqual([]);
  });

  it('is idempotent: a second pass binds nothing new', async () => {
    await autoBindHealthMarks([{ id: 'm-run', name: 'Run' }]);
    expect(await autoBindHealthMarks([{ id: 'm-run', name: 'Run' }])).toEqual([]);
  });
});
