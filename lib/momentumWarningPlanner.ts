// Pure cross-goal merge: per-goal warning dates → at most one push per calendar day.
import { addDays, parseISO, formatDate } from './date';

export type GoalWarningInput = {
  goalId: string;
  title: string;
  atRiskDate: string;
  breakDate: string;
};

export type WarningGoalRef = { goalId: string; title: string; isFinal: boolean };
export type PlannedWarning = { fireDay: string; goals: WarningGoalRef[] };

export function planMomentumWarnings(
  inputs: GoalWarningInput[],
  today: string,
): PlannedWarning[] {
  // goalId+day → ref (collapse same-goal duplicates; first nudge wins over final when same day)
  type Cand = { fireDay: string; goalId: string; title: string; isFinal: boolean };
  const cands: Cand[] = [];

  for (const g of inputs) {
    const finalDay = formatDate(addDays(parseISO(g.breakDate), -1));
    const firstDay = g.atRiskDate;
    // first nudge
    if (firstDay >= today) {
      cands.push({ fireDay: firstDay, goalId: g.goalId, title: g.title, isFinal: false });
    }
    // final nudge — skip if it collapses onto the first (daily); the first already covers it
    if (finalDay !== firstDay && finalDay >= today) {
      cands.push({ fireDay: finalDay, goalId: g.goalId, title: g.title, isFinal: true });
    }
  }

  const byDay = new Map<string, WarningGoalRef[]>();
  for (const c of cands) {
    const refs = byDay.get(c.fireDay) ?? [];
    if (!refs.some((r) => r.goalId === c.goalId)) {
      refs.push({ goalId: c.goalId, title: c.title, isFinal: c.isFinal });
    }
    byDay.set(c.fireDay, refs);
  }

  return [...byDay.keys()]
    .sort()
    .map((fireDay) => ({ fireDay, goals: byDay.get(fireDay)! }));
}
