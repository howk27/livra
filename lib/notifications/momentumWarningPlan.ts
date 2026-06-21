// lib/notifications/momentumWarningPlan.ts
// Pure cross-goal momentum-warning planning. No store/IO dependency so both the
// momentum service and the daily scheduler can reuse it without a dependency cycle.
import { momentumWarningDates, type MarkMomentumInput } from '../goalMomentum';
import { planMomentumWarnings, type GoalWarningInput } from '../momentumWarningPlanner';

export interface PlanGoal {
  id: string;
  title: string;
  status: string;
  linked_mark_ids?: string[];
}

export interface PlanMark {
  id: string;
  weekly_target?: number;
  last_activity_date?: string | null;
  deleted_at?: string | null;
}

export function buildMomentumWarningInputs(
  goals: PlanGoal[],
  marks: PlanMark[],
  today: string,
): GoalWarningInput[] {
  const inputs: GoalWarningInput[] = [];
  for (const g of goals) {
    if (g.status !== 'active') continue;
    const ids = new Set(g.linked_mark_ids ?? []);
    const goalMarks: MarkMomentumInput[] = marks
      .filter((m) => !m.deleted_at && ids.has(m.id))
      .map((m) => ({
        id: m.id,
        weekly_target: m.weekly_target as number,
        last_activity_date: m.last_activity_date ?? null,
      }));
    const dates = momentumWarningDates(goalMarks, today);
    if (dates) {
      inputs.push({
        goalId: g.id,
        title: g.title,
        atRiskDate: dates.atRiskDate,
        breakDate: dates.breakDate,
      });
    }
  }
  return inputs;
}

export function hasMomentumWarningPlannedForToday(
  goals: PlanGoal[],
  marks: PlanMark[],
  today: string,
): boolean {
  const planned = planMomentumWarnings(buildMomentumWarningInputs(goals, marks, today), today);
  return planned.some((w) => w.fireDay === today);
}
