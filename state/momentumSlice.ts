import { create } from 'zustand';
import type { MomentumSnapshot } from '../lib/goalMomentum';

interface MomentumState {
  /** Latest computed Momentum snapshot per goalId (in-memory cache; recomputed on log/foreground/mount). */
  snapshots: Record<string, MomentumSnapshot>;
  setSnapshot: (goalId: string, snap: MomentumSnapshot) => void;
  clearSnapshot: (goalId: string) => void;
}

export const useMomentumStore = create<MomentumState>((set) => ({
  snapshots: {},
  setSnapshot: (goalId, snap) =>
    set((s) => ({ snapshots: { ...s.snapshots, [goalId]: snap } })),
  clearSnapshot: (goalId) =>
    set((s) => {
      const next = { ...s.snapshots };
      delete next[goalId];
      return { snapshots: next };
    }),
}));
