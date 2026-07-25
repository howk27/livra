// Comeback flow (spec §3, 2026-07-24): pure detection + selection. The kindness
// lives in the words — a comeback log is a NORMAL check-in (spec Decision #4).
import { addDays, parseISO, yyyyMmDd } from './date';
import { resolveDailyTarget } from './markDailyTarget';
import { resolveLibraryMark } from './markCategoryResolve';
import type { MarkEvent } from '../types';
import type { QueueMark } from './focusQueue';

export type ComebackMark = QueueMark & { name: string; emoji?: string | null };

const GENERIC_ASK = 'The smallest version counts today.';

export function lastLogDate(events: MarkEvent[]): string | null {
  let latest: string | null = null;
  for (const e of events) {
    if (e.deleted_at || e.event_type !== 'increment') continue;
    if (latest === null || e.occurred_local_date > latest) latest = e.occurred_local_date;
  }
  return latest;
}

/** 2+ FULL quiet local calendar days: last log date ≤ today − 3. Date strings
 *  compare lexicographically (yyyy-MM-dd), so no hour math and no DST traps. */
export function isComebackState(events: MarkEvent[], todayStr: string): boolean {
  const last = lastLogDate(events);
  if (last === null) return false;
  return last <= yyyyMmDd(addDays(parseISO(todayStr), -3));
}

/** Voice-side predicate: was there a comeback gap BEFORE today's fresh log?
 *  Called after the log persists, so today's events are stripped first. */
export function endsComebackGap(events: MarkEvent[], todayStr: string): boolean {
  return isComebackState(events.filter((e) => e.occurred_local_date !== todayStr), todayStr);
}

/** Easiest due mark: lowest daily ask, tie → first in the given (goal) order. */
export function pickComebackMove(dueMarks: ComebackMark[]): ComebackMark | null {
  let best: ComebackMark | null = null;
  for (const m of dueMarks) {
    if (best === null || resolveDailyTarget(m) < resolveDailyTarget(best)) best = m;
  }
  return best;
}

export function resolveComebackAsk(mark: { name: string; emoji?: string | null }): string {
  return resolveLibraryMark(mark)?.comebackAsk ?? GENERIC_ASK;
}
