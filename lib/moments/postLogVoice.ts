// PL-4 (M5): pure post-log voice evaluation. One function turns raw store data
// into the engine call — the same context recipe Focus's momentCtx uses
// (weekly counts, due marks, lifetime counts), scoped to the mark just logged.
// No store imports, no I/O: callers (state/voiceSlice) pass live data in.
import { addDays, daysBetween, parseISO, yyyyMmDd } from '../date';
import { endsComebackGap } from '../comeback';
import {
  buildGoalLifetimeLogCounts,
  buildWeeklyCountsMap,
  markWeeklyState,
} from '../features';
import type { MomentumSnapshot } from '../goalMomentum';
import type { IdentityMilestone } from '../identity';
import { resolveLibraryMark } from '../markCategoryResolve';
import { logger } from '../utils/logger';
import type { Mark, MarkEvent } from '../../types';
import { buildMomentContext, type MomentGoalInput } from './context';
import { selectMoment, type SelectOptions } from './select';
import type { Moment } from './types';

/** spec §2 (Task 4): account-wide first-week variant, or null outside it. */
export type AccountFirstVariant = 'firstEver' | 'firstDayClosed' | 'dayTwoReturn' | 'weekOne' | null;

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
  /** spec §2 (Task 4): the milestone THIS log crossed, already filtered for
   *  once-ever by the caller (state/voiceSlice checks useIdentityStore's
   *  hasFired before calling in) — this module stays store-free. */
  identityMilestone?: IdentityMilestone | null;
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

/** Non-deleted increments only — the account-wide ledger the first-week
 *  variants read from (Task 4, spec §2). */
function accountIncrements(events: MarkEvent[]): MarkEvent[] {
  return events.filter((e) => !e.deleted_at && e.event_type === 'increment');
}

/**
 * spec §2 (Task 4): which account-wide first-week milestone this log
 * represents, if any. `endsComebackGapFlag` forces this null — a comeback log
 * is a normal check-in and outranks the first-week story entirely (spec §3).
 * Account age = earliest event date, no profile dependency; the whole
 * calculation stays inside the first-week window (earliest log date within 7
 * days of today).
 *
 * `closesDayNow` is "this log is the one that finished the day", not merely
 * "the day is finished" — the caller owns that distinction (QC2-F's bonus-log
 * rule, applied per day), because a day-one bonus log would otherwise say
 * "Day one, closed" a second time.
 */
export function computeAccountFirstVariant(
  events: MarkEvent[],
  todayStr: string,
  closesDayNow: boolean,
  endsComebackGapFlag: boolean,
): AccountFirstVariant {
  if (endsComebackGapFlag) return null;

  const incs = accountIncrements(events);
  if (incs.length === 0) return null;

  const dates = Array.from(new Set(incs.map((e) => e.occurred_local_date))).sort();
  const earliestDate = dates[0]!;
  const accountAgeDays = Math.max(0, daysBetween(todayStr, earliestDate));
  if (accountAgeDays > 7) return null; // outside the first-week window

  if (incs.length === 1) return 'firstEver';

  // isFirstDayWithAnyLog already pins the account to day one (the only log date
  // there is IS today), which is why no separate age clause is needed here.
  const isFirstDayWithAnyLog = dates.length === 1 && dates[0] === todayStr;
  if (closesDayNow && isFirstDayWithAnyLog) return 'firstDayClosed';

  const todayLogCount = incs.filter((e) => e.occurred_local_date === todayStr).length;
  const isFirstLogToday = todayLogCount === 1;
  const priorDates = dates.filter((d) => d < todayStr);

  if (isFirstLogToday && priorDates.length === 1) {
    const yesterday = yyyyMmDd(addDays(parseISO(todayStr), -1));
    if (priorDates[0] === yesterday) return 'dayTwoReturn';
  }

  if (isFirstLogToday && earliestDate === yyyyMmDd(addDays(parseISO(todayStr), -6))) {
    return 'weekOne';
  }

  return null;
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

  // spec §3 (Task 1/4): a comeback log is a normal check-in that outranks
  // every other postLog pick, computed from the FULL ledger (stripped of
  // today's own events by endsComebackGap itself). Spec §2: the comeback line
  // fires ONCE, on the FIRST log after the gap — later logs the same day are
  // ordinary check-ins.
  const endsComebackGapFlag =
    endsComebackGap(inputs.events, inputs.todayStr) &&
    accountIncrements(inputs.events).filter((e) => e.occurred_local_date === inputs.todayStr)
      .length === 1;

  // The day is closed when every due mark has a log; it CLOSES on the log that
  // filled the last of them. If this mark already had a log today, everything
  // else was done before this one landed — a bonus, not the closing move.
  const markLogsToday = accountIncrements(inputs.events).filter(
    (e) => e.mark_id === mark.id && e.occurred_local_date === inputs.todayStr,
  ).length;
  const closesDayNow = ctx.allDoneForDay && markLogsToday === 1;

  // spec §2 (Task 4): account-wide first-week fuel, suppressed by a comeback.
  const accountFirstVariant = computeAccountFirstVariant(
    inputs.events,
    inputs.todayStr,
    closesDayNow,
    endsComebackGapFlag,
  );

  // spec §2/§5 (Task 4/5): a library identityLine REPLACES the pool template
  // for the identity `claim` variant only — `fact` always speaks the pool.
  const identityMilestone = inputs.identityMilestone ?? null;
  const identityLibraryLine =
    identityMilestone?.tier === 'identity'
      ? resolveLibraryMark({ name: mark.name, emoji: mark.emoji })?.identityLine ?? null
      : null;

  return selectMoment('postLog', ctx, {
    rng: inputs.rng,
    goalId: mark.goal_id ?? undefined,
    lastMomentIds: inputs.lastMomentIds,
    closesWeekForMark,
    bonusAfterWeekDone,
    identityMilestone,
    markName: mark.name,
    identityLibraryLine,
    endsComebackGap: endsComebackGapFlag,
    accountFirstVariant,
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
