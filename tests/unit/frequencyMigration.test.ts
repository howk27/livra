import AsyncStorage from '@react-native-async-storage/async-storage';
import { migrateFrequencyFields } from '../../lib/db';

const MIGRATION_FLAG = '@livra_migration_freq_v1';
const MARKS_KEY = '@livra_db_marks';

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('migrateFrequencyFields', () => {
  it('skips migration if flag already set', async () => {
    await AsyncStorage.setItem(MIGRATION_FLAG, '1');
    const original = JSON.stringify([
      { id: 'a', schedule_type: 'daily' },
    ]);
    await AsyncStorage.setItem(MARKS_KEY, original);

    await migrateFrequencyFields();

    // Data should be unchanged because migration was skipped
    expect(await AsyncStorage.getItem(MARKS_KEY)).toBe(original);
  });

  it('backfills weekly_target = 7 for schedule_type = daily', async () => {
    const marks = [{ id: 'a', schedule_type: 'daily' }];
    await AsyncStorage.setItem(MARKS_KEY, JSON.stringify(marks));

    await migrateFrequencyFields();

    const result = JSON.parse((await AsyncStorage.getItem(MARKS_KEY))!);
    expect(result[0].weekly_target).toBe(7);
    expect(await AsyncStorage.getItem(MIGRATION_FLAG)).toBe('1');
  });

  it('backfills weekly_target = count(schedule_days) for custom schedule', async () => {
    const marks = [
      { id: 'b', schedule_type: 'custom', schedule_days: JSON.stringify([1, 3, 5]) },
    ];
    await AsyncStorage.setItem(MARKS_KEY, JSON.stringify(marks));

    await migrateFrequencyFields();

    const result = JSON.parse((await AsyncStorage.getItem(MARKS_KEY))!);
    expect(result[0].weekly_target).toBe(3);
  });

  it('backfills weekly_target = count(schedule_days) for weekly schedule', async () => {
    const marks = [
      { id: 'c', schedule_type: 'weekly', schedule_days: JSON.stringify([0, 2, 4, 6]) },
    ];
    await AsyncStorage.setItem(MARKS_KEY, JSON.stringify(marks));

    await migrateFrequencyFields();

    const result = JSON.parse((await AsyncStorage.getItem(MARKS_KEY))!);
    expect(result[0].weekly_target).toBe(4);
  });

  it('backfills weekly_target = 3 for null schedule_days', async () => {
    const marks = [{ id: 'd', schedule_type: null, schedule_days: null }];
    await AsyncStorage.setItem(MARKS_KEY, JSON.stringify(marks));

    await migrateFrequencyFields();

    const result = JSON.parse((await AsyncStorage.getItem(MARKS_KEY))!);
    expect(result[0].weekly_target).toBe(3);
  });

  it('sets frequency_recommended = weekly_target, frequency_min = 1, frequency_max = 7', async () => {
    const marks = [
      { id: 'e', schedule_type: 'daily' },
      { id: 'f', schedule_type: 'custom', schedule_days: JSON.stringify([1, 3, 5]) },
      { id: 'g', schedule_type: null },
    ];
    await AsyncStorage.setItem(MARKS_KEY, JSON.stringify(marks));

    await migrateFrequencyFields();

    const result = JSON.parse((await AsyncStorage.getItem(MARKS_KEY))!);

    // daily → weekly_target=7
    expect(result[0].frequency_recommended).toBe(7);
    expect(result[0].frequency_min).toBe(1);
    expect(result[0].frequency_max).toBe(7);
    expect(result[0].frequencyKind).toBe('variable');

    // custom [1,3,5] → weekly_target=3
    expect(result[1].frequency_recommended).toBe(3);
    expect(result[1].frequency_min).toBe(1);
    expect(result[1].frequency_max).toBe(7);

    // fallback → weekly_target=3
    expect(result[2].frequency_recommended).toBe(3);
    expect(result[2].frequency_min).toBe(1);
    expect(result[2].frequency_max).toBe(7);
  });

  it('clamps schedule_days count to 1–7', async () => {
    // Malformed: more than 7 days
    const marks = [
      { id: 'h', schedule_type: 'custom', schedule_days: JSON.stringify([0, 1, 2, 3, 4, 5, 6, 7, 8]) },
    ];
    await AsyncStorage.setItem(MARKS_KEY, JSON.stringify(marks));

    await migrateFrequencyFields();

    const result = JSON.parse((await AsyncStorage.getItem(MARKS_KEY))!);
    expect(result[0].weekly_target).toBe(7);
  });

  it('is non-fatal — does not throw on AsyncStorage error', async () => {
    const spy = jest
      .spyOn(AsyncStorage, 'getItem')
      .mockRejectedValueOnce(new Error('storage error'));

    await expect(migrateFrequencyFields()).resolves.toBeUndefined();

    spy.mockRestore();
  });
});
