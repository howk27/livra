/**
 * Hero-step selection for Focus goal cards (spec 2026-07-11).
 * Pure: takes candidates + a Date so tests control the clock.
 * The hero only ever names the NEXT thing (invitation, never a debt).
 */
import { resolveLibraryMark } from './markCategoryResolve';

export type TimeAffinity = 'anytime' | 'morning' | 'daytime' | 'evening';

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
/**
 * Morning marks stop being PREFERRED at this hour. They are never hidden by it —
 * see `isPreferredNow`.
 */
export const MORNING_PREFERENCE_END_HOUR = 11;

/**
 * The hard gate: may this mark be offered at all right now?
 *
 * `morning` deliberately answers this the same way `daytime` does. Morning is a
 * PREFERENCE, not a window (founder 2026-07-25) — a cold shower at 2pm is still
 * a cold shower, so hiding it would be Livra deciding your morning is over. What
 * it does inherit is the daytime ceiling: nothing morning-shaped should lead the
 * card at 11pm either.
 */
export function isFeasibleNow(affinity: TimeAffinity, now: Date): boolean {
  const hour = now.getHours();
  if (affinity === 'daytime' || affinity === 'morning') return hour < DAYTIME_CUTOFF_HOUR;
  if (affinity === 'evening') return hour >= EVENING_START_HOUR;
  return true;
}

/**
 * The soft gate: among the marks that are feasible, should this one go FIRST?
 *
 * Only `morning` is ever preferred, and only early. This is the whole mechanism
 * behind the third bucket: it can promote a mark up the user's order, and it can
 * never remove one. Callers must treat a false here as "no opinion", not "no".
 */
export function isPreferredNow(affinity: TimeAffinity, now: Date): boolean {
  return affinity === 'morning' && now.getHours() < MORNING_PREFERENCE_END_HOUR;
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
  if (feasible.length > 0) {
    // A morning mark early in the day outranks being behind: the hour is the
    // scarcer resource. Same rule as pickNextMove, so the two selectors cannot
    // disagree about what "next" means.
    const preferred = feasible.filter((c) => isPreferredNow(c.timeAffinity, now));
    return { kind: 'step', candidate: mostBehind(preferred.length > 0 ? preferred : feasible) };
  }
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
