import type { Mark, MarkEvent } from '../types';
import { isMarkActiveOnDate } from './features';
import { resolveDailyTarget } from './markDailyTarget';
import { computeStreak } from '../hooks/useStreaks';
import { getAppDate } from './appDate';

function parseLocalNoon(dateStr: string): Date {
  return new Date(`${dateStr}T12:00:00`);
}

/** Minimal mark shape for schedule + daily target when counter row is missing. */
function markForScoring(
  markId: string,
  counters: Mark[],
): Pick<Mark, 'id' | 'name' | 'dailyTarget' | 'schedule_type' | 'schedule_days' | 'deleted_at'> {
  const found = counters.find((c) => c.id === markId);
  if (found) {
    return {
      id: found.id,
      name: found.name,
      dailyTarget: found.dailyTarget,
      schedule_type: found.schedule_type,
      schedule_days: found.schedule_days,
      deleted_at: found.deleted_at,
    };
  }
  return {
    id: markId,
    name: '',
    dailyTarget: null,
    schedule_type: 'daily',
    schedule_days: undefined,
    deleted_at: null,
  };
}

export type WeeklyTopMarkStats = {
  markId: string;
  markName: string;
  /** sum(min(actual, dailyTarget)) over elapsed scheduled days in week (Mon–Sun window, date <= today) */
  completedUnitsWeek: number;
  /** sum(dailyTarget) over those same days */
  expectedUnitsWeek: number;
  /** completedUnitsWeek / expectedUnitsWeek; 0 if denominator 0 */
  consistencyScore: number;
  /** Days in window where actual >= dailyTarget and mark scheduled */
  completedDaysWeek: number;
  /** Elapsed scheduled days in week (date <= today) */
  activeDaysWeek: number;
  /** Latest YYYY-MM-DD where target met; '' if none */
  lastTargetMetDate: string;
  /** Latest YYYY-MM-DD with any increment; '' if none */
  lastAnyIncrementDate: string;
};

/**
 * Per spec: only days in week with date <= todayLocalDate and mark scheduled count.
 * Excludes mark from ranking when expectedUnitsWeek === 0 (no scheduled days in elapsed window).
 */
export function computeWeeklyTopMarkStats(
  markId: string,
  weekDates: string[],
  todayLocalDate: string,
  amountsByDate: Map<string, number>,
  counters: Mark[],
): WeeklyTopMarkStats | null {
  const m = markForScoring(markId, counters);
  if (m.deleted_at) return null;

  let completedUnitsWeek = 0;
  let expectedUnitsWeek = 0;
  let completedDaysWeek = 0;
  let activeDaysWeek = 0;
  let lastTargetMetDate = '';
  let lastAnyIncrementDate = '';

  for (const dateStr of weekDates) {
    if (dateStr > todayLocalDate) break;
    const d = parseLocalNoon(dateStr);
    if (!isMarkActiveOnDate(m as Mark, d)) continue;

    const target = resolveDailyTarget(m as Mark);
    const actual = amountsByDate.get(dateStr) ?? 0;
    activeDaysWeek += 1;
    expectedUnitsWeek += target;
    const credited = Math.min(actual, target);
    completedUnitsWeek += credited;
    if (actual >= target) {
      completedDaysWeek += 1;
      if (dateStr > lastTargetMetDate) lastTargetMetDate = dateStr;
    }
    if (actual > 0 && dateStr > lastAnyIncrementDate) lastAnyIncrementDate = dateStr;
  }

  if (expectedUnitsWeek <= 0) return null;

  const consistencyScore = completedUnitsWeek / expectedUnitsWeek;

  return {
    markId,
    markName: (counters.find((c) => c.id === markId)?.name ?? m.name ?? '').trim() || 'Mark',
    completedUnitsWeek,
    expectedUnitsWeek,
    consistencyScore,
    completedDaysWeek,
    activeDaysWeek,
    lastTargetMetDate,
    lastAnyIncrementDate,
  };
}

function lastCompletionTieBreak(s: WeeklyTopMarkStats): string {
  return (s.lastTargetMetDate || s.lastAnyIncrementDate || '').slice(0, 10);
}

/** Top Mark: consistencyScore → days ratio → clamped units → recent completion → name */
function compareTopMark(a: WeeklyTopMarkStats, b: WeeklyTopMarkStats): number {
  const eps = 1e-9;
  if (Math.abs(a.consistencyScore - b.consistencyScore) > eps) return b.consistencyScore - a.consistencyScore;
  const ratioA = a.activeDaysWeek > 0 ? a.completedDaysWeek / a.activeDaysWeek : 0;
  const ratioB = b.activeDaysWeek > 0 ? b.completedDaysWeek / b.activeDaysWeek : 0;
  if (Math.abs(ratioA - ratioB) > eps) return ratioB - ratioA;
  if (a.completedUnitsWeek !== b.completedUnitsWeek) return b.completedUnitsWeek - a.completedUnitsWeek;
  const recA = lastCompletionTieBreak(a);
  const recB = lastCompletionTieBreak(b);
  if (recA !== recB) return recB.localeCompare(recA);
  return a.markName.localeCompare(b.markName);
}

export type TopMarkWeeklyResult = {
  markId: string | null;
  name: string;
  subtitle: string;
  flavorLine: string;
  stats: WeeklyTopMarkStats | null;
};

function hashPickIndex(seed: string, modulo: number): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % modulo;
}

function flavorLineForTopMark(displayName: string, markId: string, weekStart: string): string {
  const name = displayName.trim() || 'This habit';
  const templates = [
    `${name} led the rhythm this week.`,
    `Keep letting ${name} anchor your days.`,
    `${name} stayed steady — that compounds.`,
    `Momentum is building around ${name}.`,
    `${name} showed up. That's the whole game.`,
    `Carry ${name}'s energy into what's next.`,
    `${name} kept the thread going — nice work.`,
    `This week, ${name} was the one that stuck.`,
  ];
  const i = hashPickIndex(`${weekStart}\0${markId}`, templates.length);
  return templates[i]!;
}

export function pickTopMarkForWeek(params: {
  weekDates: string[];
  todayLocalDate: string;
  weekEvents: MarkEvent[];
  counters: Mark[];
}): TopMarkWeeklyResult | null {
  const { weekDates, todayLocalDate, weekEvents, counters } = params;

  const byMarkDate = new Map<string, Map<string, number>>();
  for (const e of weekEvents) {
    if (e.deleted_at || e.event_type !== 'increment') continue;
    const date = e.occurred_local_date;
    if (!byMarkDate.has(e.mark_id)) byMarkDate.set(e.mark_id, new Map());
    const inner = byMarkDate.get(e.mark_id)!;
    inner.set(date, (inner.get(date) ?? 0) + (e.amount ?? 1));
  }

  const weekStart = weekDates[0]!;

  const candidates: WeeklyTopMarkStats[] = [];
  for (const c of counters) {
    if (c.deleted_at) continue;
    const amounts = byMarkDate.get(c.id) ?? new Map<string, number>();
    const stats = computeWeeklyTopMarkStats(c.id, weekDates, todayLocalDate, amounts, counters);
    if (stats) candidates.push(stats);
  }

  if (candidates.length === 0) return null;

  candidates.sort(compareTopMark);
  const winner = candidates[0]!;
  const mark = counters.find((x) => x.id === winner.markId && !x.deleted_at);

  const titleName = mark?.name?.trim() || winner.markName;
  const flavorName = titleName === 'Mark' ? 'This habit' : titleName;
  const pct = Math.round(winner.consistencyScore * 100);
  const subtitle = `${winner.completedDaysWeek} of ${winner.activeDaysWeek} targets met · ${pct}% weekly follow-through`;

  return {
    markId: winner.markId,
    name: titleName,
    subtitle,
    flavorLine: flavorLineForTopMark(flavorName, winner.markId, weekStart),
    stats: winner,
  };
}

// ── Streak highlight (current streak strength + weekly tie-breakers) ─────────

export type StreakHighlightResult = {
  markId: string | null;
  markName: string;
  currentStreakDays: number;
  subtitle: string;
  detailLine: string;
};

type StreakCandidate = {
  markId: string;
  markName: string;
  currentStreakDays: number;
  weekStats: WeeklyTopMarkStats;
};

function compareStreakHighlight(a: StreakCandidate, b: StreakCandidate): number {
  if (a.currentStreakDays !== b.currentStreakDays) return b.currentStreakDays - a.currentStreakDays;
  const eps = 1e-9;
  if (Math.abs(a.weekStats.consistencyScore - b.weekStats.consistencyScore) > eps) {
    return b.weekStats.consistencyScore - a.weekStats.consistencyScore;
  }
  if (a.weekStats.completedDaysWeek !== b.weekStats.completedDaysWeek) {
    return b.weekStats.completedDaysWeek - a.weekStats.completedDaysWeek;
  }
  const recA = lastCompletionTieBreak(a.weekStats);
  const recB = lastCompletionTieBreak(b.weekStats);
  if (recA !== recB) return recB.localeCompare(recA);
  return a.markName.localeCompare(b.markName);
}

export function pickStreakHighlightForWeek(params: {
  weekDates: string[];
  todayLocalDate: string;
  weekEvents: MarkEvent[];
  counters: Mark[];
  allEvents: MarkEvent[];
}): StreakHighlightResult | null {
  const { weekDates, todayLocalDate, weekEvents, counters, allEvents } = params;

  const byMarkDate = new Map<string, Map<string, number>>();
  for (const e of weekEvents) {
    if (e.deleted_at || e.event_type !== 'increment') continue;
    if (!byMarkDate.has(e.mark_id)) byMarkDate.set(e.mark_id, new Map());
    const inner = byMarkDate.get(e.mark_id)!;
    inner.set(e.occurred_local_date, (inner.get(e.occurred_local_date) ?? 0) + (e.amount ?? 1));
  }

  const candidates: StreakCandidate[] = [];
  const anchor = getAppDate();

  for (const c of counters) {
    if (c.deleted_at || !c.enable_streak) continue;
    const amounts = byMarkDate.get(c.id) ?? new Map<string, number>();
    const weekStats = computeWeeklyTopMarkStats(c.id, weekDates, todayLocalDate, amounts, counters);
    if (!weekStats) continue;

    const markEvents = allEvents.filter(
      (e) => !e.deleted_at && e.mark_id === c.id,
    );
    const { current } = computeStreak(markEvents, anchor);
    const name = (c.name ?? '').trim() || 'Mark';
    candidates.push({
      markId: c.id,
      markName: name,
      currentStreakDays: current,
      weekStats,
    });
  }

  if (candidates.length === 0) return null;

  candidates.sort(compareStreakHighlight);
  const w = candidates[0]!;
  const streakLabel = w.currentStreakDays === 1 ? '1 day streak' : `${w.currentStreakDays} day streak`;
  return {
    markId: w.markId,
    markName: w.markName,
    currentStreakDays: w.currentStreakDays,
    subtitle: 'Current streak leader',
    detailLine: `${streakLabel} · ${w.markName}`,
  };
}

// ── Best day (normalized daily follow-through) ───────────────────────────────

export type BestDayResult = {
  dateStr: string;
  /** e.g. THU — match Tracking strip */
  dayShortLabel: string;
  bestDayScore: number;
  scheduledMarksDay: number;
  completedMarksDay: number;
  completedUnitsDay: number;
  expectedUnitsDay: number;
  headlineLine: string;
};

const WEEKDAY_SHORT = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

function weekdayShortFromDateStr(dateStr: string): string {
  const d = parseLocalNoon(dateStr);
  return WEEKDAY_SHORT[d.getDay()] ?? '';
}

export function pickBestDayForWeek(params: {
  weekDates: string[];
  todayLocalDate: string;
  weekEvents: MarkEvent[];
  counters: Mark[];
}): BestDayResult | null {
  const { weekDates, todayLocalDate, weekEvents, counters } = params;

  const actualByMarkDate = new Map<string, Map<string, number>>();
  for (const e of weekEvents) {
    if (e.deleted_at || e.event_type !== 'increment') continue;
    if (!actualByMarkDate.has(e.mark_id)) actualByMarkDate.set(e.mark_id, new Map());
    const inner = actualByMarkDate.get(e.mark_id)!;
    inner.set(e.occurred_local_date, (inner.get(e.occurred_local_date) ?? 0) + (e.amount ?? 1));
  }

  type Agg = {
    dateStr: string;
    scheduledMarksDay: number;
    expectedUnitsDay: number;
    completedUnitsDay: number;
    completedMarksDay: number;
    bestDayScore: number;
  };

  const aggs: Agg[] = [];

  for (const dateStr of weekDates) {
    if (dateStr > todayLocalDate) continue;

    let scheduledMarksDay = 0;
    let expectedUnitsDay = 0;
    let completedUnitsDay = 0;
    let completedMarksDay = 0;
    const d = parseLocalNoon(dateStr);

    for (const c of counters) {
      if (c.deleted_at) continue;
      if (!isMarkActiveOnDate(c, d)) continue;
      scheduledMarksDay += 1;
      const target = resolveDailyTarget(c);
      const actual = actualByMarkDate.get(c.id)?.get(dateStr) ?? 0;
      expectedUnitsDay += target;
      completedUnitsDay += Math.min(actual, target);
      if (actual >= target) completedMarksDay += 1;
    }

    const bestDayScore = expectedUnitsDay > 0 ? completedUnitsDay / expectedUnitsDay : 0;
    aggs.push({
      dateStr,
      scheduledMarksDay,
      expectedUnitsDay,
      completedUnitsDay,
      completedMarksDay,
      bestDayScore,
    });
  }

  const ranked = aggs.filter((a) => a.expectedUnitsDay > 0);
  if (ranked.length === 0) return null;

  const compareBestDay = (a: Agg, b: Agg): number => {
    const eps = 1e-9;
    if (Math.abs(a.bestDayScore - b.bestDayScore) > eps) return b.bestDayScore - a.bestDayScore;
    const ratioA = a.scheduledMarksDay > 0 ? a.completedMarksDay / a.scheduledMarksDay : 0;
    const ratioB = b.scheduledMarksDay > 0 ? b.completedMarksDay / b.scheduledMarksDay : 0;
    if (Math.abs(ratioA - ratioB) > eps) return ratioB - ratioA;
    if (a.completedUnitsDay !== b.completedUnitsDay) return b.completedUnitsDay - a.completedUnitsDay;
    return b.dateStr.localeCompare(a.dateStr);
  };

  ranked.sort(compareBestDay);
  const best = ranked[0]!;
  const label = weekdayShortFromDateStr(best.dateStr);
  const pct = Math.round(best.bestDayScore * 100);
  const headlineLine =
    best.expectedUnitsDay > 0
      ? `Best day: ${label} · ${pct}% of planned completions (${best.completedMarksDay}/${best.scheduledMarksDay} marks)`
      : `Best day: ${label}`;

  return {
    dateStr: best.dateStr,
    dayShortLabel: label,
    bestDayScore: best.bestDayScore,
    scheduledMarksDay: best.scheduledMarksDay,
    completedMarksDay: best.completedMarksDay,
    completedUnitsDay: best.completedUnitsDay,
    expectedUnitsDay: best.expectedUnitsDay,
    headlineLine,
  };
}
