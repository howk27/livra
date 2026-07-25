// Once-ever identity milestone memory (spec §2, Task 4). Manual-AsyncStorage
// pattern, mirrors tests/unit/uiSliceOnboardingSync.test.ts's mock/reset style.
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  useIdentityStore,
  IDENTITY_MILESTONES_STORAGE_KEY,
} from '../../state/identitySlice';

describe('identitySlice — once-ever milestone memory', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    useIdentityStore.setState({ fired: {}, loaded: false });
  });

  it('hasFired is false before anything is recorded', () => {
    expect(useIdentityStore.getState().hasFired('m1', 'fact-3')).toBe(false);
  });

  it('recordFired then hasFired round-trips in memory', async () => {
    await useIdentityStore.getState().recordFired('m1', 'fact-3');
    expect(useIdentityStore.getState().hasFired('m1', 'fact-3')).toBe(true);
    // A different mark or a different milestone id is unaffected.
    expect(useIdentityStore.getState().hasFired('m2', 'fact-3')).toBe(false);
    expect(useIdentityStore.getState().hasFired('m1', 'fact-7')).toBe(false);
  });

  it('recordFired persists to AsyncStorage under the versioned key', async () => {
    await useIdentityStore.getState().recordFired('m1', 'fact-3');
    const raw = await AsyncStorage.getItem(IDENTITY_MILESTONES_STORAGE_KEY);
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw!)).toEqual({ m1: ['fact-3'] });
  });

  it('recording the same milestone twice does not duplicate it', async () => {
    await useIdentityStore.getState().recordFired('m1', 'fact-3');
    await useIdentityStore.getState().recordFired('m1', 'fact-3');
    expect(useIdentityStore.getState().fired.m1).toEqual(['fact-3']);
  });

  it('loadIdentityState hydrates memory from a prior AsyncStorage write', async () => {
    await AsyncStorage.setItem(
      IDENTITY_MILESTONES_STORAGE_KEY,
      JSON.stringify({ m1: ['fact-3', 'identity-12w3'] }),
    );
    await useIdentityStore.getState().loadIdentityState();
    expect(useIdentityStore.getState().hasFired('m1', 'fact-3')).toBe(true);
    expect(useIdentityStore.getState().hasFired('m1', 'identity-12w3')).toBe(true);
    expect(useIdentityStore.getState().loaded).toBe(true);
  });

  it('loadIdentityState starts empty (not throwing) with nothing stored', async () => {
    await useIdentityStore.getState().loadIdentityState();
    expect(useIdentityStore.getState().fired).toEqual({});
    expect(useIdentityStore.getState().loaded).toBe(true);
  });

  it('recordFired never throws even when AsyncStorage.setItem rejects', async () => {
    const spy = jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('disk full'));
    await expect(useIdentityStore.getState().recordFired('m1', 'fact-3')).resolves.toBeUndefined();
    // Memory still updated despite the failed persist.
    expect(useIdentityStore.getState().hasFired('m1', 'fact-3')).toBe(true);
    spy.mockRestore();
  });
});
