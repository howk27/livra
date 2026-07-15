// QC2-C: pure helpers for the goal-detail hero ring. The entrance sweep
// animates 0 -> ringFraction(...) once per screen open (ProgressArc mounts
// with from=0); later logs animate from the current value, never a cold zero.

/** 0..1 fill fraction for the hero ring. Guards zero/negative thresholds. */
export function ringFraction(progress: number, threshold: number): number {
  if (threshold <= 0) return 0;
  return Math.min(1, Math.max(0, progress / threshold));
}

/** True only when the goal's check-in target is fully met (ember tint sanctioned). */
export function isRingComplete(progress: number, threshold: number): boolean {
  return threshold > 0 && progress >= threshold;
}
