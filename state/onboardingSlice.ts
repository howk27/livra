import { create } from 'zustand';
import type { AIGoalPackage } from '../lib/ai/goalGeneration';

export type { AIGoalPackage };
export type CommitmentLevel = 'easing' | 'steady' | 'push';

export interface OnboardingState {
  goalTitle: string;
  commitment: CommitmentLevel | null;
  /** IDs of marks selected on the marks screen (MARK_LIBRARY ids) */
  selectedMarkIds: string[];
  /** Per-mark weekly targets, keyed by MARK_LIBRARY id. Set alongside selectedMarkIds. */
  selectedMarkTargets: Record<string, number>;
  /** AI-generated package held until confirm+activate. */
  aiPackageDraft: AIGoalPackage | null;
  /** How many times the user has regenerated an AI package this session. Capped at 2. */
  aiRegenerationsUsed: number;
  setGoalTitle: (title: string) => void;
  setCommitment: (level: CommitmentLevel | null) => void;
  setSelectedMarkIds: (ids: string[]) => void;
  setSelectedMarkTargets: (targets: Record<string, number>) => void;
  setAiPackageDraft: (pkg: AIGoalPackage | null) => void;
  incrementAiRegenerations: () => void;
  reset: () => void;
}

const initialState = {
  goalTitle: '',
  commitment: null as CommitmentLevel | null,
  selectedMarkIds: [] as string[],
  selectedMarkTargets: {} as Record<string, number>,
  aiPackageDraft: null as AIGoalPackage | null,
  aiRegenerationsUsed: 0,
};

export const useOnboardingStore = create<OnboardingState>((set) => ({
  ...initialState,
  setGoalTitle: (title) => set({ goalTitle: title }),
  setCommitment: (level) => set({ commitment: level }),
  setSelectedMarkIds: (ids) => set({ selectedMarkIds: ids }),
  setSelectedMarkTargets: (targets) => set({ selectedMarkTargets: targets }),
  setAiPackageDraft: (pkg) => set({ aiPackageDraft: pkg }),
  incrementAiRegenerations: () =>
    set((s) => ({ aiRegenerationsUsed: s.aiRegenerationsUsed + 1 })),
  reset: () => set({ ...initialState }),
}));
