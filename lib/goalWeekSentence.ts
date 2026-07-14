// lib/goalWeekSentence.ts
// Pure builder for the goal-detail week sentence (VD-4; celebratory variant PL-2).
// One calm line: "{N} days of momentum · {M} marks · {K} due this week".
// Middle dot separators only; no prose dashes (Jest-enforced voice rule).

export type GoalWeekSentenceInput = {
  /** Momentum run day count; null (or 0) when there is no active run/snapshot. */
  momentumDays: number | null;
  /** Number of marks linked to the goal. */
  markCount: number;
  /** Marks still due this week (weekly target not yet met). */
  dueCount: number;
  /** M2 celebration (PL-2): the run just passed the personal best, today only. */
  isNewBest?: boolean;
};

/**
 * Builds the week sentence for a goal's study screen.
 * - Momentum clause is omitted entirely when there is no active run.
 * - On a personal-best day the momentum clause reads "{N} days · your longest yet"
 *   (calm count stays the representation; one enriched line, no chrome).
 * - Zero due reads "nothing due this week" (calm, never a bare 0).
 * - Returns '' when the goal has no marks (the screen shows the empty card instead).
 */
export function buildGoalWeekSentence({
  momentumDays,
  markCount,
  dueCount,
  isNewBest = false,
}: GoalWeekSentenceInput): string {
  if (markCount <= 0) return '';

  const parts: string[] = [];
  if (momentumDays != null && momentumDays > 0) {
    const days = `${momentumDays} day${momentumDays === 1 ? '' : 's'}`;
    parts.push(isNewBest ? `${days} · your longest yet` : `${days} of momentum`);
  }
  parts.push(`${markCount} mark${markCount === 1 ? '' : 's'}`);
  parts.push(dueCount === 0 ? 'nothing due this week' : `${dueCount} due this week`);

  return parts.join(' · ');
}
