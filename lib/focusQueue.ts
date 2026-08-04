import type { Mark } from '../types';
import { markWeeklyState } from './features';
import { resolveDailyTarget } from './markDailyTarget';
import { isFeasibleNow, isPreferredNow, resolveTimeAffinity } from './nextStep';

/**
 * Focus Spotlight Queue — pure selectors (founder 2026-07-23).
 *
 * Focus runs the same sequential model as the widget: ONE goal is expanded at
 * a time (the spotlight — the first goal in the user's own drag order with
 * work left today); the rest render as compact queued rows until their turn.
 *
 * The psychology this encodes (ux-psychology + behavioral review, 2026-07-23):
 * - Paradox of choice / Hick's law: five equal cards each morning is a
 *   decision; one expanded card is an instruction the user already gave
 *   themselves (it follows THEIR sort order).
 * - Zeigarnik with a lid on it: queued rows keep the other goals visible as
 *   open loops — pull, not pressure. Livra is a calm, mental app; open loops
 *   are shown quietly, never alarmed.
 * - Goal gradient: the queue physically shrinks through the day (done goals
 *   fold, the spotlight advances). Progress is shown by movement and filled
 *   checks, never as a raw "0%" or a fraction (Focus bans fractions/bars —
 *   design-decisions.md, rejected directions).
 * - Endowment: auto-advance is VIEW state only. The user's sort_index is
 *   never mutated by completing work — their arrangement stays theirs.
 */

export type QueueMark = Pick<Mark, 'dailyTarget'> & {
  id: string;
  weekly_target?: number | null;
  frequency_kind?: Mark['frequency_kind'];
  /**
   * Drive hero time-gating (see pickNextMove). Resolved name-first with emoji
   * as fallback, so a mark missing its emoji is still gated.
   */
  name?: string | null;
  emoji?: string | null;
};

/** A mark has met its daily bar today. */
export function isMarkDoneToday(mark: QueueMark, todayCount: number): boolean {
  return todayCount >= resolveDailyTarget(mark);
}

/**
 * Check-in days still owed this week across a goal's marks — the number the
 * on-pace fold speaks ("On pace · N more this week", founder 2026-07-26).
 * Per mark: cadence minus the days already banked, floored at zero so bonus
 * logs past a met cadence never lend to a sibling mark. Same weekly_target
 * fallback markWeeklyState uses, so the fold and the due filter cannot
 * disagree about when the week is finished (sum 0 ⟺ every mark doneForWeek).
 */
export function remainingThisWeek(
  marks: readonly QueueMark[],
  weeklyCounts: ReadonlyMap<string, number>,
): number {
  let remaining = 0;
  for (const m of marks) {
    const target = m.weekly_target ?? 3;
    remaining += Math.max(0, target - (weeklyCounts.get(m.id) ?? 0));
  }
  return remaining;
}

/**
 * Check-ins still owed TODAY across marks — the number the Focus header
 * speaks (founder QC64 2026-08-04: the weekly count read as a mountain and
 * "harder to hit"; the day's ask is the honest header number, weekly/total
 * stay on the goal screen). A mark owes today when its week is not done AND
 * its daily bar is unmet — the exact complement of focus.tsx's allDoneForDay
 * over the same mark set, so 0 here ⟺ the all-done banner takes over.
 */
export function remainingToday(
  marks: readonly QueueMark[],
  weeklyCounts: ReadonlyMap<string, number>,
  todayCounts: ReadonlyMap<string, number>,
): number {
  return marks.filter(
    (m) =>
      markWeeklyState(m as Pick<Mark, 'weekly_target' | 'frequency_kind'>, weeklyCounts.get(m.id) ?? 0) === 'due' &&
      !isMarkDoneToday(m, todayCounts.get(m.id) ?? 0),
  ).length;
}

/**
 * A goal has no work left TODAY: every week-due mark has met its daily bar
 * today (marks already done for the week ask nothing more). An empty mark
 * list counts as done — there is nothing to spotlight.
 */
export function isGoalDoneToday(
  marks: QueueMark[],
  weeklyCounts: ReadonlyMap<string, number>,
  todayCounts: ReadonlyMap<string, number>,
): boolean {
  const due = marks.filter(
    (m) => markWeeklyState(m as Pick<Mark, 'weekly_target' | 'frequency_kind'>, weeklyCounts.get(m.id) ?? 0) === 'due',
  );
  if (due.length === 0) return true;
  return due.every((m) => isMarkDoneToday(m, todayCounts.get(m.id) ?? 0));
}

/**
 * The spotlight: first goal in the given order (the user's drag order) that
 * still has work left today. Null when everything is done — the day is over,
 * Focus shows only folded rows and the all-done banner.
 */
export function pickSpotlightGoalId(
  orderedGoalIds: readonly string[],
  marksByGoalId: ReadonlyMap<string, QueueMark[]>,
  weeklyCounts: ReadonlyMap<string, number>,
  todayCounts: ReadonlyMap<string, number>,
): string | null {
  for (const goalId of orderedGoalIds) {
    const marks = marksByGoalId.get(goalId) ?? [];
    if (marks.length === 0) continue;
    if (!isGoalDoneToday(marks, weeklyCounts, todayCounts)) return goalId;
  }
  return null;
}

/**
 * The hero of the Next Move card (spec §1): the override if it still has work
 * today, else the first week-due mark in the user's own order with today's bar
 * unmet. Pure view selection — sort_index is never touched.
 *
 * TIME GATING (restored 2026-07-25). Device report: a "Fix my sleep" goal
 * offered Sleep as the first move of the morning, when it is the last thing
 * anyone can do. The rule for that already existed and was already specified
 * (spec 2026-07-11, lib/nextStep.ts): evening marks are not offered before
 * 16:00, daytime marks not after 20:00. M8's Next Move card replaced the old
 * hero step and never adopted it, which left `selectNextStep` orphaned — only
 * its own tests referenced it. So this is a regression against a shipped rule,
 * not a new preference.
 *
 * `now` is optional and the behaviour without it is exactly the old one, so a
 * caller that has no clock is never silently re-ordered. When nothing is
 * feasible at this hour the first due mark still heroes: an out-of-hours ask
 * beats an empty card, and the mark is genuinely still owed today.
 */
export function pickNextMove<T extends QueueMark>(
  orderedMarks: readonly T[],
  weeklyCounts: ReadonlyMap<string, number>,
  todayCounts: ReadonlyMap<string, number>,
  overrideMarkId?: string | null,
  now?: Date,
): T | null {
  const heroable = (m: T) =>
    markWeeklyState(m as Pick<Mark, 'weekly_target' | 'frequency_kind'>, weeklyCounts.get(m.id) ?? 0) === 'due' &&
    !isMarkDoneToday(m, todayCounts.get(m.id) ?? 0);

  // An explicit tap outranks the clock: if the user chose this mark, that is
  // the move, even at the wrong hour.
  if (overrideMarkId) {
    const o = orderedMarks.find((m) => m.id === overrideMarkId);
    if (o && heroable(o)) return o;
  }

  const due = orderedMarks.filter(heroable);
  if (due.length === 0) return null;
  if (!now) return due[0];

  const timed = due.map((m) => ({ mark: m, affinity: resolveTimeAffinity(m) }));
  const feasible = timed.filter((t) => isFeasibleNow(t.affinity, now));
  if (feasible.length === 0) return due[0];

  // MORNING (2026-07-25): a soft preference, applied only among marks that are
  // already feasible and already in the user's own order. It can move a
  // morning-shaped mark up; it can never remove one, and after
  // MORNING_PREFERENCE_END_HOUR it has no effect at all.
  return (feasible.find((t) => isPreferredNow(t.affinity, now)) ?? feasible[0]).mark;
}

/** How many up-next chips the Next Move card shows before it starts counting. */
export const NEXT_MOVE_CHIP_CAP = 6;

export type NextMoveChip = { id: string; name: string; doneToday: boolean };

/**
 * The up-next strip under the hero (spec §1): every OTHER due mark on the goal,
 * capped, with the remainder counted rather than listed. The hero is excluded
 * because it is already the card — a chip for it would offer the move twice.
 * Done-today marks stay in the strip (checked, not hidden): the day's shape is
 * the point, and a vanishing row reads as a mistake.
 */
export function buildNextMoveChips<T extends QueueMark & { name: string }>(
  dueMarks: readonly T[],
  hero: { id: string } | null,
  todayCounts: ReadonlyMap<string, number>,
): { chips: NextMoveChip[]; overflowCount: number } {
  const rest = hero ? dueMarks.filter((m) => m.id !== hero.id) : [...dueMarks];
  return {
    chips: rest.slice(0, NEXT_MOVE_CHIP_CAP).map((m) => ({
      id: m.id,
      name: m.name,
      doneToday: isMarkDoneToday(m, todayCounts.get(m.id) ?? 0),
    })),
    overflowCount: Math.max(0, rest.length - NEXT_MOVE_CHIP_CAP),
  };
}
