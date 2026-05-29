import { create } from 'zustand';

export type FocusArea =
  | 'health'
  | 'career'
  | 'creativity'
  | 'learning'
  | 'relationships'
  | 'finances';

interface OnboardingState {
  goalTitle: string;
  focusArea: FocusArea | null;
  identitySelections: string[];
  setGoalTitle: (title: string) => void;
  setFocusArea: (area: FocusArea | null) => void;
  setIdentitySelections: (selections: string[]) => void;
  reset: () => void;
}

const initialState = {
  goalTitle: '',
  focusArea: null as FocusArea | null,
  identitySelections: [] as string[],
};

export const useOnboardingStore = create<OnboardingState>((set) => ({
  ...initialState,
  setGoalTitle: (title) => set({ goalTitle: title }),
  setFocusArea: (area) => set({ focusArea: area }),
  setIdentitySelections: (selections) => set({ identitySelections: selections }),
  reset: () => set({ ...initialState }),
}));
