import { useOnboardingStore } from '../../../state/onboardingSlice';

// Reset store between tests
beforeEach(() => {
  useOnboardingStore.setState({
    goalTitle: '',
    focusArea: null,
    identitySelections: [],
  });
});

describe('useOnboardingStore', () => {
  test('initial state has empty goalTitle, null focusArea, empty identitySelections', () => {
    const state = useOnboardingStore.getState();
    expect(state.goalTitle).toBe('');
    expect(state.focusArea).toBeNull();
    expect(state.identitySelections).toEqual([]);
  });

  test('setGoalTitle updates goalTitle', () => {
    useOnboardingStore.getState().setGoalTitle('Run a marathon');
    expect(useOnboardingStore.getState().goalTitle).toBe('Run a marathon');
  });

  test('setFocusArea updates focusArea', () => {
    useOnboardingStore.getState().setFocusArea('health');
    expect(useOnboardingStore.getState().focusArea).toBe('health');
  });

  test('setFocusArea accepts null', () => {
    useOnboardingStore.getState().setFocusArea('career');
    useOnboardingStore.getState().setFocusArea(null);
    expect(useOnboardingStore.getState().focusArea).toBeNull();
  });

  test('setIdentitySelections replaces the array', () => {
    useOnboardingStore.getState().setIdentitySelections(['Sleep better', 'Move my body']);
    expect(useOnboardingStore.getState().identitySelections).toEqual(['Sleep better', 'Move my body']);
  });

  test('setIdentitySelections caps at 3 items', () => {
    useOnboardingStore.getState().setIdentitySelections(['Sleep better', 'Move my body', 'Read consistently', 'Plan my days']);
    expect(useOnboardingStore.getState().identitySelections).toHaveLength(3);
    expect(useOnboardingStore.getState().identitySelections).toEqual(['Sleep better', 'Move my body', 'Read consistently']);
  });

  test('reset returns all fields to initial values', () => {
    const store = useOnboardingStore.getState();
    store.setGoalTitle('Something');
    store.setFocusArea('career');
    store.setIdentitySelections(['Read consistently']);
    store.reset();
    const after = useOnboardingStore.getState();
    expect(after.goalTitle).toBe('');
    expect(after.focusArea).toBeNull();
    expect(after.identitySelections).toEqual([]);
  });
});
