import { create } from 'zustand';

export type CommitmentLevel = 'easing' | 'steady' | 'push';

// Placeholder — filled in Phase 4b
export type AIGoalPackage = {
  goalTitle: string;
  marks: Array<{
    id: string;
    name: string;
    emoji: string;
    weeklyTarget: number;
  }>;
};

export interface OnboardingState {
  goalTitle: string;
  commitment: CommitmentLevel | null;
  /** IDs of marks selected on the marks screen (MARK_LIBRARY ids) */
  selectedMarkIds: string[];
  /** AI-generated package held until confirm+activate (4b). Null until then. */
  aiPackageDraft: AIGoalPackage | null;
  /** How many times the user has regenerated an AI package. Capped at 2 in 4b. */
  aiRegenerationsUsed: number;
  setGoalTitle: (title: string) => void;
  setCommitment: (level: CommitmentLevel | null) => void;
  setSelectedMarkIds: (ids: string[]) => void;
  setAiPackageDraft: (pkg: AIGoalPackage | null) => void;
  incrementAiRegenerations: () => void;
  reset: () => void;
}

const initialState = {
  goalTitle: '',
  commitment: null as CommitmentLevel | null,
  selectedMarkIds: [] as string[],
  aiPackageDraft: null as AIGoalPackage | null,
  aiRegenerationsUsed: 0,
};

export const useOnboardingStore = create<OnboardingState>((set) => ({
  ...initialState,
  setGoalTitle: (title) => set({ goalTitle: title }),
  setCommitment: (level) => set({ commitment: level }),
  setSelectedMarkIds: (ids) => set({ selectedMarkIds: ids }),
  setAiPackageDraft: (pkg) => set({ aiPackageDraft: pkg }),
  incrementAiRegenerations: () =>
    set((s) => ({ aiRegenerationsUsed: s.aiRegenerationsUsed + 1 })),
  reset: () => set({ ...initialState }),
}));
