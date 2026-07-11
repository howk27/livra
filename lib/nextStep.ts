/**
 * Hero-step selection for Focus goal cards (spec 2026-07-11).
 * Pure: takes candidates + a Date so tests control the clock.
 * The hero only ever names the NEXT thing (invitation, never a debt).
 */
import { MARK_LIBRARY } from './suggestedCounters';

export type TimeAffinity = 'anytime' | 'daytime' | 'evening';

export type NextStepCandidate = {
  markId: string;
  name: string;
  weeklyCount: number;
  weeklyTarget: number;
  loggedToday: boolean;
  timeAffinity: TimeAffinity;
};

export type NextStepResult =
  | { kind: 'step'; candidate: NextStepCandidate }
  | { kind: 'tomorrow'; candidate: NextStepCandidate }
  | { kind: 'allClear' };

/** Daytime marks are not suggested at/after this hour. */
export const DAYTIME_CUTOFF_HOUR = 20;
/** Evening marks are not suggested before this hour. */
export const EVENING_START_HOUR = 16;

export function isFeasibleNow(affinity: TimeAffinity, now: Date): boolean {
  const hour = now.getHours();
  if (affinity === 'daytime') return hour < DAYTIME_CUTOFF_HOUR;
  if (affinity === 'evening') return hour >= EVENING_START_HOUR;
  return true;
}

function mostBehind(candidates: NextStepCandidate[]): NextStepCandidate {
  let best = candidates[0];
  for (const c of candidates.slice(1)) {
    const bestRatio = best.weeklyCount / Math.max(1, best.weeklyTarget);
    const ratio = c.weeklyCount / Math.max(1, c.weeklyTarget);
    if (ratio < bestRatio) best = c;
  }
  return best;
}

export function selectNextStep(
  candidates: NextStepCandidate[],
  now: Date,
): NextStepResult {
  const due = candidates.filter((c) => c.weeklyCount < c.weeklyTarget);
  const notToday = due.filter((c) => !c.loggedToday);
  if (notToday.length === 0) return { kind: 'allClear' };

  const feasible = notToday.filter((c) => isFeasibleNow(c.timeAffinity, now));
  if (feasible.length > 0) return { kind: 'step', candidate: mostBehind(feasible) };
  return { kind: 'tomorrow', candidate: mostBehind(notToday) };
}

/** Emoji-match against MARK_LIBRARY (existing Focus pattern); custom marks are anytime. */
export function resolveTimeAffinity(emoji: string | null | undefined): TimeAffinity {
  if (!emoji) return 'anytime';
  const def = MARK_LIBRARY.find((m) => m.emoji === emoji);
  return def?.timeAffinity ?? 'anytime';
}
