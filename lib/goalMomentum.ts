// Goal-scoped Momentum engine: forgiving, frequency-aware run.
// Pure functions only — no I/O. Distinct from the legacy per-mark lib/momentum.ts.

import { daysBetween } from './date';

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

export type MarkMomentumState = 'on_track' | 'resting' | 'slipping' | 'broken';

export type MarkMomentumInput = {
  id: string;
  weekly_target?: number | null;
  last_activity_date?: string | null;
};

export type MarkMomentum = {
  id: string;
  intervalDays: number;
  atRiskGap: number;
  breakGap: number;
  gap: number | null;
  state: MarkMomentumState;
};

/** Whole days since the mark's last log; null when never logged. */
export function markGapDays(
  lastActivityDate: string | null | undefined,
  today: string,
): number | null {
  if (!lastActivityDate) return null;
  return daysBetween(today, lastActivityDate);
}

export function markMomentum(mark: MarkMomentumInput, today: string): MarkMomentum {
  const intervalDays = expectedInterval(mark.weekly_target);
  const atRiskGap = atRiskGapFor(intervalDays);
  const breakGap = breakGapFor(intervalDays);
  const gap = markGapDays(mark.last_activity_date, today);

  let state: MarkMomentumState;
  if (gap === null) state = 'resting';
  else if (gap <= 0) state = 'on_track';
  else if (gap < atRiskGap) state = 'resting';
  else if (gap < breakGap) state = 'slipping';
  else state = 'broken';

  return { id: mark.id, intervalDays, atRiskGap, breakGap, gap, state };
}

export type GoalMomentumState = 'on_track' | 'resting' | 'slipping' | 'broken';

export function goalMomentumState(marks: MarkMomentum[]): GoalMomentumState {
  if (marks.some((m) => m.state === 'broken')) return 'broken';
  if (marks.some((m) => m.state === 'slipping')) return 'slipping';
  if (marks.some((m) => m.state === 'on_track')) return 'on_track';
  return 'resting';
}

/** Fraction of cushion remaining before break, clamped [0,1]. 1 = just at-risk, 0 = breaking. */
export function cushionFraction(gap: number, atRiskGap: number, breakGap: number): number {
  if (breakGap <= atRiskGap) return 0;
  const frac = (breakGap - gap) / (breakGap - atRiskGap);
  return Math.max(0, Math.min(1, frac));
}

/** Inclusive count of good-standing days since the run began; 0 when not started. */
export function momentumDays(startDate: string | null, today: string): number {
  if (!startDate) return 0;
  return daysBetween(today, startDate) + 1;
}
