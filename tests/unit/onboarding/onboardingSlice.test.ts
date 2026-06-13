import { useOnboardingStore, CommitmentLevel } from '../../../state/onboardingSlice';

beforeEach(() => {
  useOnboardingStore.getState().reset();
});

describe('useOnboardingStore', () => {
  test('initial state has empty goalTitle, null commitment, empty selectedMarkIds', () => {
    const s = useOnboardingStore.getState();
    expect(s.goalTitle).toBe('');
    expect(s.commitment).toBeNull();
    expect(s.selectedMarkIds).toEqual([]);
    expect(s.aiPackageDraft).toBeNull();
    expect(s.aiRegenerationsUsed).toBe(0);
  });

  test('setGoalTitle updates goalTitle', () => {
    useOnboardingStore.getState().setGoalTitle('Run a marathon');
    expect(useOnboardingStore.getState().goalTitle).toBe('Run a marathon');
  });

  test('setCommitment sets level to easing/steady/push', () => {
    const levels: CommitmentLevel[] = ['easing', 'steady', 'push'];
    for (const level of levels) {
      useOnboardingStore.getState().setCommitment(level);
      expect(useOnboardingStore.getState().commitment).toBe(level);
    }
  });

  test('setCommitment accepts null', () => {
    useOnboardingStore.getState().setCommitment('push');
    useOnboardingStore.getState().setCommitment(null);
    expect(useOnboardingStore.getState().commitment).toBeNull();
  });

  test('setSelectedMarkIds replaces the array', () => {
    useOnboardingStore.getState().setSelectedMarkIds(['workout', 'sleep']);
    expect(useOnboardingStore.getState().selectedMarkIds).toEqual(['workout', 'sleep']);
  });

  test('setSelectedMarkIds replaces on second call', () => {
    useOnboardingStore.getState().setSelectedMarkIds(['workout', 'sleep']);
    useOnboardingStore.getState().setSelectedMarkIds(['run']);
    expect(useOnboardingStore.getState().selectedMarkIds).toEqual(['run']);
  });

  test('setAiPackageDraft stores a package', () => {
    const pkg = { goalTitle: 'Test goal', marks: [{ id: 'run', name: 'Run', emoji: '🏃', weeklyTarget: 3 }] };
    useOnboardingStore.getState().setAiPackageDraft(pkg);
    expect(useOnboardingStore.getState().aiPackageDraft).toEqual(pkg);
  });

  test('setAiPackageDraft accepts null', () => {
    useOnboardingStore.getState().setAiPackageDraft({ goalTitle: 'x', marks: [] });
    useOnboardingStore.getState().setAiPackageDraft(null);
    expect(useOnboardingStore.getState().aiPackageDraft).toBeNull();
  });

  test('incrementAiRegenerations increments by 1 each call', () => {
    useOnboardingStore.getState().incrementAiRegenerations();
    expect(useOnboardingStore.getState().aiRegenerationsUsed).toBe(1);
    useOnboardingStore.getState().incrementAiRegenerations();
    expect(useOnboardingStore.getState().aiRegenerationsUsed).toBe(2);
  });

  test('reset restores all fields to initial values', () => {
    const store = useOnboardingStore.getState();
    store.setGoalTitle('Something');
    store.setCommitment('push');
    store.setSelectedMarkIds(['run', 'sleep']);
    store.setAiPackageDraft({ goalTitle: 'x', marks: [] });
    store.incrementAiRegenerations();
    store.reset();
    const after = useOnboardingStore.getState();
    expect(after.goalTitle).toBe('');
    expect(after.commitment).toBeNull();
    expect(after.selectedMarkIds).toEqual([]);
    expect(after.aiPackageDraft).toBeNull();
    expect(after.aiRegenerationsUsed).toBe(0);
  });

  test('focusArea and identitySelections fields do not exist', () => {
    const s = useOnboardingStore.getState() as Record<string, unknown>;
    expect(s['focusArea']).toBeUndefined();
    expect(s['identitySelections']).toBeUndefined();
    expect(s['setFocusArea']).toBeUndefined();
    expect(s['setIdentitySelections']).toBeUndefined();
  });

  test('sequence: goal → commitment → marks draft survives until reset', () => {
    const store = useOnboardingStore.getState();
    store.setGoalTitle('Run a marathon');
    store.setCommitment('steady');
    store.setSelectedMarkIds(['workout', 'run']);
    const s = useOnboardingStore.getState();
    expect(s.goalTitle).toBe('Run a marathon');
    expect(s.commitment).toBe('steady');
    expect(s.selectedMarkIds).toEqual(['workout', 'run']);
    store.reset();
    const after = useOnboardingStore.getState();
    expect(after.goalTitle).toBe('');
    expect(after.commitment).toBeNull();
    expect(after.selectedMarkIds).toEqual([]);
  });
});
