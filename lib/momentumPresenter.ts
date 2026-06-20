// Pure mapping from a MomentumSnapshot to what the goal-card UI shows.
// No React, no I/O. The label's separator is the middle dot (U+00B7), not a dash.
import type { MomentumSnapshot } from './goalMomentum';

export type MomentumVisual = 'fresh' | 'glow' | 'neutral' | 'gauge';

export type MomentumDisplay = {
  visual: MomentumVisual;
  label: string;
  /** 0..1 cushion fill; non-null only when visual === 'gauge'. */
  cushion: number | null;
};

export function presentMomentum(snap: MomentumSnapshot | null): MomentumDisplay {
  if (!snap || snap.days <= 0 || snap.state === 'broken') {
    return { visual: 'fresh', label: 'Fresh start', cushion: null };
  }
  const label = `Momentum · ${snap.days} ${snap.days === 1 ? 'day' : 'days'}`;
  if (snap.state === 'slipping') {
    return { visual: 'gauge', label, cushion: snap.cushionRemaining ?? 0 };
  }
  if (snap.state === 'on_track') {
    return { visual: 'glow', label, cushion: null };
  }
  return { visual: 'neutral', label, cushion: null }; // resting
}

/** Banner shows when any active goal's cached snapshot is slipping and not dismissed today. */
export function shouldShowMomentumBanner(
  snapshots: Record<string, MomentumSnapshot>,
  dismissedDate: string | null,
  today: string,
): boolean {
  const anySlipping = Object.values(snapshots).some((s) => s?.state === 'slipping');
  if (!anySlipping) return false;
  return dismissedDate !== today;
}
