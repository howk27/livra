// PL-4 (M5): pure post-log voice evaluation. One function turns raw store data
// into the engine call — the same context recipe Focus's momentCtx uses
// (weekly counts, due marks, lifetime counts), scoped to the mark just logged.
// No store imports, no I/O: callers (state/voiceSlice) pass live data in.
import {
  buildGoalLifetimeLogCounts,
  buildWeeklyCountsMap,
  markWeeklyState,
} from '../features';
import type { MomentumSnapshot } from '../goalMomentum';
import { logger } from '../utils/logger';
import type { Mark, MarkEvent } from '../../types';
import { buildMomentContext, type MomentGoalInput } from './context';
import { selectMoment, type SelectOptions } from './select';
import type { Moment } from './types';

export type PostLogVoiceInputs = {
  /** The mark that was just (successfully) incremented. */
  markId: string;
  /** 'yyyy-MM-dd' — the log's local date. */
  todayStr: string;
  /** Monday-first week containing todayStr (lib/features currentWeekDates shape). */
  weekDates: string[];
  firstName?: string | null;
  /** All marks; soft-deleted rows are filtered here. */
  marks: Mark[];
  /** All mark events, INCLUDING the event just persisted (counted after the log lands). */
  events: MarkEvent[];
  goals: MomentGoalInput[];
  snapshots: Record<string, MomentumSnapshot>;
  personalBestRuns?: Record<string, number | null>;
  /** Caller-held anti-repeat state (state/voiceSlice owns it). */
  lastMomentIds?: SelectOptions['lastMomentIds'];
  /** Injectable randomness for the 1-in-3 gate; defaults inside the selector. */
  rng?: () => number;
};

/** markId → increment total for todayStr (same recipe as Focus's todayCountsMap). */
export function buildTodayCounts(
  events: MarkEvent[],
  todayStr: string,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const e of events) {
    if (e.deleted_at || e.event_type !== 'increment') continue;
    if (e.occurred_local_date !== todayStr) continue;
    counts[e.mark_id] = (counts[e.mark_id] ?? 0) + (e.amount ?? 1);
  }
  return counts;
}

/**
 * Evaluates the post-log moment for a successful increment. Returns null when
 * Livra stays quiet (the majority case: the 1-in-3 gate, or an unknown mark).
 * Pure and deterministic given inputs; all randomness flows through rng.
 */
export function evaluatePostLogVoice(inputs: PostLogVoiceInputs): Moment | null {
  const activeMarks = inputs.marks.filter((m) => !m.deleted_at);
  const mark = activeMarks.find((m) => m.id === inputs.markId);
  if (!mark) return null;

  const weeklyCountsMap = buildWeeklyCountsMap(activeMarks, inputs.events, inputs.weekDates);
  const todayCounts = buildTodayCounts(inputs.events, inputs.todayStr);

  // Same due/pressure recipe as Focus: maintenance habits carry no goal-pressure.
  const dueMarkIds = activeMarks
    .filter((m) => !m.maintenance_of)
    .filter((m) => markWeeklyState(m, weeklyCountsMap.get(m.id) ?? 0) === 'due')
    .map((m) => m.id);

  const activeGoalIds = inputs.goals.filter((g) => g.status === 'active').map((g) => g.id);
  const goalLifetimeLogCounts = buildGoalLifetimeLogCounts(
    activeMarks,
    activeGoalIds,
    inputs.events,
  );

  const ctx = buildMomentContext({
    goals: inputs.goals,
    snapshots: inputs.snapshots,
    weeklyCounts: Object.fromEntries(weeklyCountsMap),
    todayCounts,
    dueMarkIds,
    todayStr: inputs.todayStr,
    firstName: inputs.firstName,
    personalBestRuns: inputs.personalBestRuns,
    goalLifetimeLogCounts,
  });

  // "Closes the week": the completions count sits exactly at the target, so the
  // day this log flipped is the day the week closed for this mark.
  const weeklyCount = weeklyCountsMap.get(mark.id) ?? 0;
  const doneForWeek = markWeeklyState(mark, weeklyCount) === 'doneForWeek';
  const closesWeekForMark = doneForWeek && weeklyCount === (mark.weekly_target ?? 3);

  // QC2-F "bonus log": the count sits PAST the target, so the week was already
  // closed before this log landed. Disjoint from closesWeekForMark by
  // construction (=== target vs > target); logging itself is never blocked.
  const bonusAfterWeekDone = doneForWeek && weeklyCount > (mark.weekly_target ?? 3);

  return selectMoment('postLog', ctx, {
    rng: inputs.rng,
    goalId: mark.goal_id ?? undefined,
    lastMomentIds: inputs.lastMomentIds,
    closesWeekForMark,
    bonusAfterWeekDone,
  });
}

/**
 * The store-glue contract for the increment path: state/voiceSlice's
 * `evaluatePostLog` action satisfies it. Declared here so this module never
 * imports the slice (spec §2: lib/moments stays pure — callers pass data in).
 */
export type PostLogVoiceEvaluator = (
  markId: string,
  todayStr: string,
  firstName?: string | null,
  rng?: () => number,
) => boolean;

/**
 * The increment path's single voice call (PL-4 retry #1/#2): wraps error
 * handling around an INJECTED evaluator (hooks/useCounters passes voiceSlice's
 * action in at the call site) so incrementMark gains exactly one call and zero
 * branches, and this module stays store-free — no lib/moments ↔ state cycle.
 * Never throws — voice is decoration; a failure here must never block logging
 * or the mark_logged capture.
 */
export function maybeShowPostLogVoice(
  markId: string,
  todayStr: string,
  firstName: string | null | undefined,
  evaluate: PostLogVoiceEvaluator,
  rng?: () => number,
): boolean {
  try {
    return evaluate(markId, todayStr, firstName, rng);
  } catch (error) {
    logger.error('[moments] Post-log voice evaluation failed:', error);
    return false;
  }
}
