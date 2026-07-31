// lib/goals/momentumEvaluation.ts
//
// M9 Phase 5A Task 6 — the query-layer replacement for
// `goalsSlice.evaluateActiveGoalsMomentum`.
//
// Same loop, new inputs: active goals and their linked marks come from the query
// layer (rows), and each mark's `last_activity_date` is DERIVED from the
// check-in events instead of read off the mark row. The denormalised column
// froze at the cutover — nothing has written it since check-ins became one
// `mark_events` row — so deriving is not an optimisation, it is the only
// truthful source. Same rule as `lastActivityBefore` in hooks/useCheckin.ts,
// except today's log counts here: the old column was stamped ON log, and
// same-day activity is exactly what puts a goal `on_track`.
//
// Writes go where they always did: the AsyncStorage momentum record (via
// `evaluateGoalMomentum`) and the KEPT `momentumSlice` snapshots.

import { yyyyMmDd } from '../date';
import { evaluateGoalMomentum } from '../goalMomentumStore';
import { useMomentumStore } from '../../state/momentumSlice';
import { logger } from '../utils/logger';
import type { MarkMomentumInput, MomentumSnapshot } from '../goalMomentum';
import type { GoalRow, MarkRow, MarkEventRow } from '../data/types';

type ActivityEvent = Pick<
  MarkEventRow,
  'mark_id' | 'event_type' | 'occurred_local_date' | 'deleted_at'
>;

/** Latest live increment's local date per mark — today included. */
export function lastActivityByMark(
  events: readonly ActivityEvent[],
): Map<string, string> {
  const latest = new Map<string, string>();
  for (const e of events) {
    if (e.event_type !== 'increment' || e.deleted_at) continue;
    const prev = latest.get(e.mark_id);
    if (prev === undefined || e.occurred_local_date > prev) {
      latest.set(e.mark_id, e.occurred_local_date);
    }
  }
  return latest;
}

/** Momentum inputs for one goal's linked marks, activity derived from events. */
export function momentumMarkInputs(
  marks: readonly MarkRow[],
  lastActivity: ReadonlyMap<string, string>,
): MarkMomentumInput[] {
  return marks
    .filter((m) => !m.deleted_at)
    .map((m) => ({
      id: m.id,
      weekly_target: m.weekly_target,
      last_activity_date: lastActivity.get(m.id) ?? null,
    }));
}

/**
 * Re-evaluate Momentum for every ACTIVE goal in `goals` and store each snapshot
 * in `momentumSlice`. Returns the snapshots by goal id. Failures are per-goal:
 * one goal's broken record never blocks the others (as in the store version).
 */
export async function evaluateGoalsMomentum(
  goals: readonly Pick<GoalRow, 'id' | 'status'>[],
  marksByGoal: Readonly<Record<string, readonly MarkRow[]>>,
  events: readonly ActivityEvent[],
  today: string = yyyyMmDd(new Date()),
): Promise<Map<string, MomentumSnapshot>> {
  const lastActivity = lastActivityByMark(events);
  const result = new Map<string, MomentumSnapshot>();
  for (const goal of goals) {
    if (goal.status !== 'active') continue;
    try {
      const inputs = momentumMarkInputs(marksByGoal[goal.id] ?? [], lastActivity);
      const snap = await evaluateGoalMomentum(goal.id, inputs, today);
      result.set(goal.id, snap);
      useMomentumStore.getState().setSnapshot(goal.id, snap, today);
    } catch (err) {
      logger.warn(`[Momentum] evaluation failed for goal ${goal.id}:`, err);
    }
  }
  return result;
}
