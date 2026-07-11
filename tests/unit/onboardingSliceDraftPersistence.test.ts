/**
 * Onboarding draft durability (launch walk 2026-07-08, bug item 3).
 *
 * Root cause: useOnboardingStore was a plain in-memory store. The signup
 * email-confirmation detour (user leaves for Mail, OS kills the process)
 * wiped goalTitle/commitment/mark selections, so a new account came back to
 * an empty onboarding. The answer fields must survive a cold start; the AI
 * package draft is regenerable and must NOT be persisted.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  useOnboardingStore,
  ONBOARDING_DRAFT_STORAGE_KEY,
} from '../../state/onboardingSlice';

const flushPersist = () => new Promise((resolve) => setImmediate(resolve));

describe('onboarding draft persistence', () => {
  beforeEach(async () => {
    useOnboardingStore.getState().reset();
    await flushPersist();
    await AsyncStorage.clear();
  });

  it('writes the answer fields to AsyncStorage as the user progresses', async () => {
    const s = useOnboardingStore.getState();
    s.setGoalTitle('Run a 10k');
    s.setCommitment('steady');
    s.setSelectedMarkIds(['run-easy']);
    s.setSelectedMarkTargets({ 'run-easy': 3 });
    s.setAiPackageDraft({ goal: { title: 'x' } } as never);
    await flushPersist();

    const raw = await AsyncStorage.getItem(ONBOARDING_DRAFT_STORAGE_KEY);
    expect(raw).not.toBeNull();
    const persisted = JSON.parse(raw as string).state;
    expect(persisted.goalTitle).toBe('Run a 10k');
    expect(persisted.commitment).toBe('steady');
    expect(persisted.selectedMarkIds).toEqual(['run-easy']);
    expect(persisted.selectedMarkTargets).toEqual({ 'run-easy': 3 });
    // Regenerable, potentially stale/large — never persisted.
    expect(persisted.aiPackageDraft).toBeUndefined();
    expect(persisted.aiRegenerationsUsed).toBeUndefined();
  });

  it('rehydrates the draft after a cold start', async () => {
    await AsyncStorage.setItem(
      ONBOARDING_DRAFT_STORAGE_KEY,
      JSON.stringify({
        state: {
          goalTitle: 'Learn Spanish',
          commitment: 'push',
          selectedMarkIds: ['study'],
          selectedMarkTargets: { study: 5 },
        },
        version: 0,
      })
    );

    await useOnboardingStore.persist.rehydrate();

    const s = useOnboardingStore.getState();
    expect(s.goalTitle).toBe('Learn Spanish');
    expect(s.commitment).toBe('push');
    expect(s.selectedMarkIds).toEqual(['study']);
    expect(s.selectedMarkTargets).toEqual({ study: 5 });
  });

  it('reset clears the persisted draft (completion path)', async () => {
    useOnboardingStore.getState().setGoalTitle('Temp goal');
    await flushPersist();

    useOnboardingStore.getState().reset();
    await flushPersist();

    const raw = await AsyncStorage.getItem(ONBOARDING_DRAFT_STORAGE_KEY);
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw as string).state.goalTitle).toBe('');
  });
});
