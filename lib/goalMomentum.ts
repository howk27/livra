// Goal-scoped Momentum engine: forgiving, frequency-aware run.
// Pure functions only — no I/O. Distinct from the legacy per-mark lib/momentum.ts.

/** Expected days between logs for a mark, from its weekly target. Default 3/week. */
export function expectedInterval(weeklyTarget?: number | null): number {
  const t = weeklyTarget && weeklyTarget > 0 ? weeklyTarget : 3;
  return 7 / t;
}

/** Whole-day gap at which a mark goes at-risk. */
export function atRiskGapFor(interval: number): number {
  return Math.ceil(interval) + 1;
}

/** Whole-day gap at which a mark's run breaks. */
export function breakGapFor(interval: number): number {
  return Math.ceil(2 * interval) + 1;
}
