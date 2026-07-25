import type { Mark } from '../types';
import { markWeeklyState } from './features';
import { resolveDailyTarget } from './markDailyTarget';

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
};

/** A mark has met its daily bar today. */
export function isMarkDoneToday(mark: QueueMark, todayCount: number): boolean {
  return todayCount >= resolveDailyTarget(mark);
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
 */
export function pickNextMove<T extends QueueMark>(
  orderedMarks: readonly T[],
  weeklyCounts: ReadonlyMap<string, number>,
  todayCounts: ReadonlyMap<string, number>,
  overrideMarkId?: string | null,
): T | null {
  const heroable = (m: T) =>
    markWeeklyState(m as Pick<Mark, 'weekly_target' | 'frequency_kind'>, weeklyCounts.get(m.id) ?? 0) === 'due' &&
    !isMarkDoneToday(m, todayCounts.get(m.id) ?? 0);

  if (overrideMarkId) {
    const o = orderedMarks.find((m) => m.id === overrideMarkId);
    if (o && heroable(o)) return o;
  }
  return orderedMarks.find(heroable) ?? null;
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
