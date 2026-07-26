/**
 * Hero-step selection for Focus goal cards (spec 2026-07-11).
 * Pure: takes candidates + a Date so tests control the clock.
 * The hero only ever names the NEXT thing (invitation, never a debt).
 */
import { resolveLibraryMark } from './markCategoryResolve';

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

/**
 * The mark's time affinity, resolved through the app's ONE library matcher;
 * custom and unmatched marks are anytime.
 *
 * This used to match on emoji alone, which is the weaker key and silently lost
 * the gate in three ways resolveLibraryMark already handles: `Mark.emoji` is
 * OPTIONAL, so a mark without one was never gated at all; a legacy mark whose
 * emoji was later reassigned (an old '🧘' that once meant meditation) resolved
 * to the wrong entry; and '🚫' is shared by no-alcohol and no-sugar, so a
 * collision resolves to whichever is declared first.
 *
 * Name-first with an emoji fallback is exactly the rule the rest of the app
 * uses for the same question (QC2-A) — the affinity lookup had simply never
 * been brought in line with it.
 */
export function resolveTimeAffinity(
  mark: { name?: string | null; emoji?: string | null } | null | undefined,
): TimeAffinity {
  if (!mark) return 'anytime';
  return resolveLibraryMark({ name: mark.name ?? '', emoji: mark.emoji })?.timeAffinity ?? 'anytime';
}
