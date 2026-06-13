// lib/consistency.ts
// Weekly consistency engine — pure functions + thin @livra_consistency_history persistence.

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Mark, MarkEvent } from '../types';
import { currentWeekDates, computeCompletionsThisWeek } from './features';
import { formatDate } from './date';

const HISTORY_KEY = '@livra_consistency_history';
const MAX_BACKFILL_WEEKS = 12;

export type ConsistencyHistoryEntry = {
  weekStart: string; // ISO 'yyyy-MM-dd', always a Monday
  strong: boolean;
};

export type WeekResult = {
  expected: number;
  counted: number;
  required: number;
  strong: boolean;
  remaining: number;
};

type MarkInput = Pick<Mark, 'id'> & { weekly_target?: number | null };

// ── Pure functions ────────────────────────────────────────────────────────────

/**
 * Computes weekly consistency metrics for a set of marks.
 *
 * completionsByMark: raw (uncapped) completion counts per mark id — caller
 * is responsible for computing these via computeCompletionsThisWeek.
 *
 * Formula:
 *   expected  = Σ weeklyTarget(m)
 *   counted   = Σ min(completions(m), weeklyTarget(m))  ← bonus logs excluded by cap
 *   required  = max(1, round(0.70 × expected))
 *   strong    = counted >= required
 *   remaining = max(0, required − counted)
 */
export function computeWeek(
  marks: MarkInput[],
  completionsByMark: Record<string, number>,
  _weekDates: string[],
): WeekResult {
  let expected = 0;
  let counted = 0;

  for (const mark of marks) {
    const target = mark.weekly_target ?? 3;
    const raw = completionsByMark[mark.id] ?? 0;
    expected += target;
    counted += Math.min(raw, target);
  }

  const required = Math.max(1, Math.round(0.7 * expected));
  const strong = counted >= required;
  const remaining = Math.max(0, required - counted);

  return { expected, counted, required, strong, remaining };
}

/**
 * Total count of strong weeks across all history.
 * NOT consecutive — consecutive reintroduces the streak fragility this redesign rejects.
 */
export function weeksStrong(history: ConsistencyHistoryEntry[]): number {
  return history.filter(e => e.strong).length;
}

// ── History persistence (thin layer) ─────────────────────────────────────────

function buildWeekDatesFrom(mondayISO: string): string[] {
  const result: string[] = [];
  const monday = new Date(mondayISO + 'T00:00:00');
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    result.push(formatDate(d));
  }
  return result;
}

function advanceWeeks(isoDate: string, n: number): string {
  const d = new Date(isoDate + 'T00:00:00');
  d.setDate(d.getDate() + n * 7);
  return formatDate(d);
}

async function loadHistory(): Promise<ConsistencyHistoryEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e: unknown) =>
        e !== null &&
        typeof e === 'object' &&
        typeof (e as Record<string, unknown>).weekStart === 'string' &&
        typeof (e as Record<string, unknown>).strong === 'boolean',
    );
  } catch {
    return [];
  }
}

async function persistHistory(history: ConsistencyHistoryEntry[]): Promise<void> {
  try {
    await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch {
    // best effort — history is a convenience cache, not source of truth
  }
}

/**
 * On app open: appends one entry per completed Mon–Sun week that isn't yet recorded.
 * The in-progress week is never evaluated.
 * Backfills up to MAX_BACKFILL_WEEKS when history is empty.
 * Returns the updated history array.
 */
export async function appendCompletedWeeks(
  marks: (Pick<Mark, 'id' | 'dailyTarget'> & { weekly_target?: number | null })[],
  allEvents: MarkEvent[],
): Promise<ConsistencyHistoryEntry[]> {
  const history = await loadHistory();
  const currentWeekStart = currentWeekDates()[0]; // Monday of the in-progress week

  let nextToEvaluate: string;
  if (history.length > 0) {
    nextToEvaluate = advanceWeeks(history[history.length - 1].weekStart, 1);
  } else {
    nextToEvaluate = advanceWeeks(currentWeekStart, -MAX_BACKFILL_WEEKS);
  }

  const newEntries: ConsistencyHistoryEntry[] = [];
  let weekStart = nextToEvaluate;

  while (weekStart < currentWeekStart) {
    const weekDates = buildWeekDatesFrom(weekStart);
    const completionsByMark: Record<string, number> = {};
    for (const mark of marks) {
      const markEvents = allEvents.filter(e => e.mark_id === mark.id && !e.deleted_at);
      completionsByMark[mark.id] = computeCompletionsThisWeek(mark, markEvents, weekDates);
    }
    const result = computeWeek(marks, completionsByMark, weekDates);
    newEntries.push({ weekStart, strong: result.strong });
    weekStart = advanceWeeks(weekStart, 1);
  }

  if (newEntries.length === 0) return history;

  const updated = [...history, ...newEntries];
  await persistHistory(updated);
  return updated;
}
