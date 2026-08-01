// lib/goals/goalLifecycle.ts
//
// M9 Phase 5A Task 6 — the query-layer replacement for the goalsSlice lifecycle
// actions: `creditMarkToGoals` (per check-in) and `checkAllGoalExpiry` /
// `checkGoalCompletion`'s deadline half (foreground + day rollover).
//
// App orchestration, not data: the row writes live in lib/data/mutations and
// each of them is one call here. What this module owns is the same policy the
// store owned —
//   • one goal credit per mark per local day (extra reps land on the mark);
//   • hitting the check-in target never auto-completes a goal (founder
//     2026-07-18) — only a passed DEADLINE acts, by expiring it;
//   • an ended goal's habits carry on as maintenance marks.
//
// Inputs come from the query cache via `readGoalDataSnapshot` — the same
// imperative read the store's `getState()` was, pointed at data that is still
// being written. Momentum snapshots keep flowing into the KEPT momentumSlice.

import type { QueryClient } from '@tanstack/react-query';
import { yyyyMmDd } from '../date';
import { queryKeys } from '../data/queryKeys';
import { creditGoalMarkCount, expireGoal } from '../data/mutations/goals';
import { convertGoalMarksToMaintenance } from '../data/mutations/marks';
import { isDeadlineExpired } from '../goalLogic';
import {
  evaluateGoalsMomentum,
  readGoalDataSnapshot,
  type GoalDataSnapshot,
} from './momentumEvaluation';
import { useMomentumStore } from '../../state/momentumSlice';
import { logger } from '../utils/logger';
import type { GoalRow } from '../data/types';

/** The event fields the once-per-day credit dedupe reads. */
export interface CreditEvent {
  mark_id: string;
  event_type: string;
  occurred_local_date: string;
  deleted_at?: string | null;
}

/**
 * One credit per mark per local day: the just-logged event is already in
 * `events`, so a SECOND increment on the latest day means this log earns no
 * count credit (the day still counts for Momentum). Verbatim from the store.
 */
export function alreadyCreditedToday(events: readonly CreditEvent[], markId: string): boolean {
  const increments = events.filter(
    (e) => e.mark_id === markId && e.event_type === 'increment' && !e.deleted_at,
  );
  const latestDay = increments.reduce(
    (max, e) => (e.occurred_local_date > max ? e.occurred_local_date : max),
    '',
  );
  return increments.filter((e) => e.occurred_local_date === latestDay).length > 1;
}

/** The ACTIVE goals currently holding this mark, resolved through live links. */
function holderGoals(snapshot: GoalDataSnapshot, markId: string): GoalRow[] {
  return snapshot.goals.filter(
    (g) =>
      g.status === 'active' &&
      (snapshot.marksByGoal[g.id] ?? []).some((m) => m.id === markId),
  );
}

function invalidateGoalReads(client: QueryClient, userId: string): void {
  void client.invalidateQueries({ queryKey: queryKeys.goals(userId) });
}

/**
 * Expire every active goal whose deadline has passed (or only those in
 * `onlyGoalIds` when given — the per-credit check the store ran). Per goal:
 * marks converted to maintenance → server status flip → momentum snapshot
 * cleared. Conversion runs FIRST because it is idempotent and the flip is the
 * commit point: whichever half fails, the goal is still 'active' and the next
 * tick re-runs both. (The store did it flip-first, which made a failed
 * conversion permanent — the goal left the active scan forever.) Failures are
 * per-goal and logged, never thrown: expiry runs on ticks and foregrounds,
 * where a throw has no user to land on.
 *
 * Returns the ids that were expired, so callers can invalidate once.
 */
export async function expireDeadlinedGoals(
  client: QueryClient,
  userId: string,
  onlyGoalIds?: readonly string[],
): Promise<string[]> {
  const snapshot = readGoalDataSnapshot(client, userId);
  const scope = onlyGoalIds ? new Set(onlyGoalIds) : null;
  const expired: string[] = [];

  for (const goal of snapshot.goals) {
    if (goal.status !== 'active') continue;
    if (scope && !scope.has(goal.id)) continue;
    // isDeadlineExpired reads status + deadline_date (with a target_date
    // fallback the row does not carry — deadline_date IS the column).
    if (!isDeadlineExpired({ ...goal, target_date: goal.deadline_date } as never)) continue;
    try {
      await convertGoalMarksToMaintenance(goal.id);
      await expireGoal(goal.id);
      useMomentumStore.getState().clearSnapshot(goal.id);
      expired.push(goal.id);
    } catch (error) {
      logger.error(`[goalLifecycle] expiry failed for goal ${goal.id}:`, error);
    }
  }

  if (expired.length > 0) {
    invalidateGoalReads(client, userId);
    void client.invalidateQueries({ queryKey: queryKeys.marks(userId) });
  }
  return expired;
}

/**
 * The post-check-in chain, replacing `goalsSlice.creditMarkToGoals`:
 * count credit (deduped per local day) → momentum for the holder goals →
 * deadline check for exactly those goals. `events` is the list the caller just
 * read from the cache — the just-logged event included — because the dedupe is
 * measured against it (M9 Phase 3 already established this hand-off).
 */
export async function creditMarkToGoals(
  client: QueryClient,
  userId: string,
  markId: string,
  events: readonly CreditEvent[],
): Promise<void> {
  const snapshot = readGoalDataSnapshot(client, userId);
  const holders = holderGoals(snapshot, markId);
  if (holders.length === 0) return;

  const skipCredit = alreadyCreditedToday(events, markId);

  if (!skipCredit) {
    for (const goal of holders) {
      try {
        await creditGoalMarkCount(goal.id, goal.current_mark_count + 1);
      } catch (error) {
        logger.error(`[goalLifecycle] credit failed for goal ${goal.id}:`, error);
      }
    }
    invalidateGoalReads(client, userId);
  }

  // Momentum (trigger 1): evaluate each holder goal on this log — same-day
  // activity is what starts (on_track) and continues a run. The holder list is
  // already active-only.
  await evaluateGoalsMomentum(holders, snapshot.marksByGoal, snapshot.events, yyyyMmDd(new Date()));

  // The deadline check the store ran per credited goal.
  await expireDeadlinedGoals(client, userId, holders.map((g) => g.id));
}
