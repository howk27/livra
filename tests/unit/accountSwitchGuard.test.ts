import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  guardAgainstAccountSwitch,
  LAST_SIGNED_IN_USER_ID_KEY,
} from '../../lib/db/accountSwitchGuard';
import { ACCOUNT_SCOPED_STORAGE_KEYS } from '../../lib/db/purgeLocalUserData';

/**
 * The sign-IN half of the purge. signOut already wipes the device — this covers
 * the two paths where signOut never runs: the app killed mid-sign-out, and a
 * session arriving for a different account without passing through signOut.
 *
 * The test that matters most is the "no stored id" one. Every install upgrading
 * to this build has no stored id and local data belonging to whoever is signed
 * in, so a guard that treats unknown as "someone else's" would delete every
 * user's data on first launch.
 */
const mockPurge = jest.fn(async () => ({ failures: [] as string[], removedKeyCount: 3 }));
jest.mock('../../lib/db/purgeLocalUserData', () => ({
  ...jest.requireActual('../../lib/db/purgeLocalUserData'),
  purgeLocalUserData: () => mockPurge(),
}));

describe('guardAgainstAccountSwitch', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    mockPurge.mockClear();
    mockPurge.mockResolvedValue({ failures: [], removedKeyCount: 3 });
  });

  it('THE UPGRADE PATH: an unknown device is recorded, never wiped', async () => {
    const result = await guardAgainstAccountSwitch('user-a');

    expect(result).toEqual({ action: 'recorded' });
    expect(mockPurge).not.toHaveBeenCalled();
    expect(await AsyncStorage.getItem(LAST_SIGNED_IN_USER_ID_KEY)).toBe('user-a');
  });

  it('the same account signing in again touches nothing', async () => {
    await AsyncStorage.setItem(LAST_SIGNED_IN_USER_ID_KEY, 'user-a');

    const result = await guardAgainstAccountSwitch('user-a');

    expect(result).toEqual({ action: 'unchanged' });
    expect(mockPurge).not.toHaveBeenCalled();
  });

  it('THE HOLE IT CLOSES: a different account arriving wipes the device first', async () => {
    await AsyncStorage.setItem(LAST_SIGNED_IN_USER_ID_KEY, 'user-a');

    const result = await guardAgainstAccountSwitch('user-b');

    expect(mockPurge).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ action: 'purged', previousUserId: 'user-a', failures: [] });
  });

  it('records the new owner AFTER the purge, so the purge cannot sweep it away', async () => {
    await AsyncStorage.setItem(LAST_SIGNED_IN_USER_ID_KEY, 'user-a');
    // A purge that actually removes the key, as the real one does.
    mockPurge.mockImplementation(async () => {
      await AsyncStorage.removeItem(LAST_SIGNED_IN_USER_ID_KEY);
      return { failures: [], removedKeyCount: 1 };
    });

    await guardAgainstAccountSwitch('user-b');

    expect(await AsyncStorage.getItem(LAST_SIGNED_IN_USER_ID_KEY)).toBe('user-b');
  });

  it('still records the new owner when the purge reports failures — a retry next launch would eat the NEW account', async () => {
    await AsyncStorage.setItem(LAST_SIGNED_IN_USER_ID_KEY, 'user-a');
    mockPurge.mockResolvedValue({ failures: ['mockDb'], removedKeyCount: 0 });

    const result = await guardAgainstAccountSwitch('user-b');

    expect(result).toEqual({ action: 'purged', previousUserId: 'user-a', failures: ['mockDb'] });
    expect(await AsyncStorage.getItem(LAST_SIGNED_IN_USER_ID_KEY)).toBe('user-b');
  });

  it('fails OPEN when the id cannot be read — wiping on a guess is worse than not wiping', async () => {
    // A one-shot rejection on the existing mock, NOT jest.spyOn: spying on a
    // jest.fn and then calling mockRestore resets its implementation, which
    // leaves AsyncStorage returning undefined for every later test in the file.
    (AsyncStorage.getItem as jest.Mock).mockRejectedValueOnce(new Error('storage unavailable'));

    const result = await guardAgainstAccountSwitch('user-b');

    expect(result).toEqual({ action: 'unchanged' });
    expect(mockPurge).not.toHaveBeenCalled();
  });

  it('does not throw when the purge itself throws — sign-in must not be blockable', async () => {
    await AsyncStorage.setItem(LAST_SIGNED_IN_USER_ID_KEY, 'user-a');
    mockPurge.mockRejectedValue(new Error('boom'));

    const result = await guardAgainstAccountSwitch('user-b');

    expect(result).toEqual({ action: 'purged', previousUserId: 'user-a', failures: ['purge'] });
    expect(await AsyncStorage.getItem(LAST_SIGNED_IN_USER_ID_KEY)).toBe('user-b');
  });

  it('ignores an empty user id rather than recording one', async () => {
    expect(await guardAgainstAccountSwitch('')).toEqual({ action: 'unchanged' });
    expect(await AsyncStorage.getItem(LAST_SIGNED_IN_USER_ID_KEY)).toBeNull();
  });

  it('the key is account-scoped, so a clean sign-out clears it too', () => {
    expect(ACCOUNT_SCOPED_STORAGE_KEYS as readonly string[]).toContain(LAST_SIGNED_IN_USER_ID_KEY);
  });
});
