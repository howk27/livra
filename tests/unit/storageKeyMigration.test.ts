import AsyncStorage from '@react-native-async-storage/async-storage';
import { migrateCountersStorageKey } from '../../lib/db';

const MIGRATION_FLAG = '@livra_migration_v2_complete';
const OLD_KEY = '@livra_db_counters';
const NEW_KEY = '@livra_db_marks';

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('migrateCountersStorageKey', () => {
  it('copies data from old key to new key and sets flag', async () => {
    const data = JSON.stringify([{ id: '1', name: 'Gym' }]);
    await AsyncStorage.setItem(OLD_KEY, data);

    await migrateCountersStorageKey();

    expect(await AsyncStorage.getItem(NEW_KEY)).toBe(data);
    expect(await AsyncStorage.getItem(OLD_KEY)).toBeNull();
    expect(await AsyncStorage.getItem(MIGRATION_FLAG)).toBe('1');
  });

  it('skips migration if flag already set', async () => {
    await AsyncStorage.setItem(MIGRATION_FLAG, '1');
    await AsyncStorage.setItem(OLD_KEY, JSON.stringify([{ id: '2' }]));

    await migrateCountersStorageKey();

    // Old key should still exist because migration was skipped
    expect(await AsyncStorage.getItem(OLD_KEY)).not.toBeNull();
    expect(await AsyncStorage.getItem(NEW_KEY)).toBeNull();
  });

  it('sets flag even when no old data exists', async () => {
    await migrateCountersStorageKey();

    expect(await AsyncStorage.getItem(MIGRATION_FLAG)).toBe('1');
    expect(await AsyncStorage.getItem(NEW_KEY)).toBeNull();
  });

  it('does not overwrite existing new key data', async () => {
    const oldData = JSON.stringify([{ id: 'old' }]);
    const newData = JSON.stringify([{ id: 'new' }]);
    await AsyncStorage.setItem(OLD_KEY, oldData);
    await AsyncStorage.setItem(NEW_KEY, newData);

    await migrateCountersStorageKey();

    expect(await AsyncStorage.getItem(NEW_KEY)).toBe(newData);
    expect(await AsyncStorage.getItem(OLD_KEY)).toBeNull();
  });

  it('does not throw if AsyncStorage fails', async () => {
    const spy = jest.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('storage error'));

    await expect(migrateCountersStorageKey()).resolves.toBeUndefined();

    spy.mockRestore();
  });
});
