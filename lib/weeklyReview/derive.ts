// lib/weeklyReview/derive.ts
// Weekly Review derivation (WR-1, spec docs/superpowers/specs/2026-08-29-weekly-review-design.md).
//
// Pure functions only — no I/O, no store imports, no clock reads; callers pass
// `todayStr` and data in (lib/consistency.ts style). The week machinery is
// REUSED, not rebuilt: completions come from lib/features'
// buildWeeklyCountsMap, week position / goal age / the why from
// lib/moments/context. This module adds only the review WINDOW (Mon–Tue
// lookback at the just-closed week) and the copy selection on top.
//
// Copy rules bind the strings below (registered in copyDashRule.test.ts):
// no dash-as-dash, `·` separator, no guilt or urgency vocabulary, and a zero
// is never rendered — every branch that could say "0" says something warmer.

import { format } from 'date-fns';
import type { Mark, MarkEvent } from '../../types';
import { buildWeeklyCountsMap } from '../features';
import { deriveWhy, goalAgeDays, weekPositionOf } from '../moments/context';
import type { MomentumSnapshot } from '../goalMomentum';
import { addDays, formatDate, parseISO } from '../date';

// ── Input shapes ──────────────────────────────────────────────────────────────
// Old-model (`types/`) shapes on purpose: every screen already bridges query
// rows to these at the seam (app/goal/[id].tsx precedent), and the pure week
// helpers this module reuses are typed against them.

export type ReviewGoalInput = {
  id: string;
  title: string;
  /** The user's why. */
  description?: string | null;
  created_at: string;
  status: string;
  sort_index?: number | null;
};

export type ReviewMarkInput = Pick<Mark, 'id' | 'name'> & {
  weekly_target?: number | null;
  dailyTarget?: number | null;
};

export type DeriveWeeklyReviewInputs = {
  /** 'yyyy-MM-dd' — the caller's "now"; the review computes at render time. */
  todayStr: string;
  goals: ReviewGoalInput[];
  /** goalId → linked marks (goal_mark_links order; links are the only truth). */
  marksByGoal: Record<string, ReviewMarkInput[]>;
  /** All mark events; increments and soft-deletes are filtered here. */
  events: MarkEvent[];
  /** Latest momentum snapshot per goalId (state/momentumSlice shape). */
  snapshots: Record<string, MomentumSnapshot | null | undefined>;
};

// ── Output shapes ─────────────────────────────────────────────────────────────

export type ReviewMarkLine = {
  markId: string;
  name: string;
  /** Distinct days this week the mark met its daily bar (uncapped). */
  done: number;
  target: number;
  met: boolean;
};

export type ReviewGoalCard = {
  goalId: string;
  title: string;
  /** Whole weeks since the goal was created; 0 = week one. */
  weeksIn: number;
  marks: ReviewMarkLine[];
};

export type WeeklyReviewData = {
  /** ISO Monday of the reviewed week. */
  weekStart: string;
  /** The reviewed week's 7 ISO dates, Mon–Sun. */
  weekDates: string[];
  weekLabel: string;
  /** Mon–Sun; true when at least one counted log landed that day. */
  daysActive: boolean[];
  daysActiveCount: number;
  /** Counted log events in the reviewed week. */
  marksLogged: number;
  firstWeek: boolean;
  momentumHeld: boolean;
  goals: ReviewGoalCard[];
  /** First active goal's why, in goal order; null → the quote block is omitted. */
  why: string | null;
  headline: string;
  prose: string;
  closing: string;
};

// ── Review window ─────────────────────────────────────────────────────────────

/**
 * Monday of the week the review shows. The review follows the week containing
 * `todayStr` until it closes; on Monday and Tuesday it looks back at the
 * just-closed week instead, so a Monday open reviews last week rather than an
 * empty new one (spec §4). Consistency HISTORY is untouched by this window.
 */
export function reviewWeekStart(todayStr: string): string {
  const pos = weekPositionOf(todayStr); // 0 = Monday … 6 = Sunday
  const monday = addDays(parseISO(todayStr), -pos);
  return formatDate(pos <= 1 ? addDays(monday, -7) : monday);
}

/** The reviewed week's 7 ISO dates, Monday first. */
export function reviewWeekDates(todayStr: string): string[] {
  const monday = parseISO(reviewWeekStart(todayStr));
  const dates: string[] = [];
  for (let i = 0; i < 7; i++) dates.push(formatDate(addDays(monday, i)));
  return dates;
}

// ── Small named derivations ───────────────────────────────────────────────────

function isCountedLog(e: MarkEvent): boolean {
  return e.event_type === 'increment' && !e.deleted_at;
}

/** Mon–Sun activity: a day is active iff ≥1 counted log landed on it. */
export function deriveDaysActive(events: MarkEvent[], weekDates: string[]): boolean[] {
  const activeDates = new Set(
    events.filter(isCountedLog).map((e) => e.occurred_local_date),
  );
  return weekDates.map((d) => activeDates.has(d));
}

/** Counted log events inside the reviewed week. */
export function countMarksLogged(events: MarkEvent[], weekDates: string[]): number {
  const weekSet = new Set(weekDates);
  return events.filter((e) => isCountedLog(e) && weekSet.has(e.occurred_local_date)).length;
}

/** First week = the account has goals and none is older than 7 days (spec §4). */
export function deriveFirstWeek(goals: ReviewGoalInput[], todayStr: string): boolean {
  return (
    goals.length > 0 && goals.every((g) => goalAgeDays(g.created_at, todayStr) <= 7)
  );
}

/** Momentum held = every active goal has a snapshot and none is broken. */
export function deriveMomentumHeld(
  goals: ReviewGoalInput[],
  snapshots: DeriveWeeklyReviewInputs['snapshots'],
): boolean {
  if (goals.length === 0) return false;
  return goals.every((g) => {
    const snap = snapshots[g.id];
    return snap != null && snap.state !== 'broken';
  });
}

/** The quote: the first goal (in goal order) with a why; null omits the block. */
export function deriveReviewWhy(goals: ReviewGoalInput[]): string | null {
  for (const g of goals) {
    const why = deriveWhy(g.description);
    if (why) return why;
  }
  return null;
}

/**
 * The ONE room-for-more the closing may name (spec §3.7 — never a list of
 * misses): the started-but-unmet mark closest to its target, in goal order.
 * Marks with no logs are excluded; their first one "counts double when it
 * comes" and is not a miss to surface.
 */
export function deriveRoomForMore(goals: ReviewGoalCard[]): { markName: string } | null {
  let best: { markName: string; gap: number } | null = null;
  for (const g of goals) {
    for (const m of g.marks) {
      if (m.met || m.done === 0) continue;
      const gap = m.target - m.done;
      if (best === null || gap < best.gap) best = { markName: m.name, gap };
    }
  }
  return best === null ? null : { markName: best.markName };
}

// ── Copy selection ────────────────────────────────────────────────────────────
// Exported for direct pinning. Every branch is calm and forward-looking; the
// zero-activity branches carry no digits at all (a zero is never rendered).

export type CopyContext = {
  firstWeek: boolean;
  daysActiveCount: number;
  marksLogged: number;
  momentumHeld: boolean;
  hasWhy: boolean;
  /** Set when the week has goal cards and every mark line met its target. */
  everyMarkMet: boolean;
  roomForMore: { markName: string } | null;
};

export function selectHeadline(ctx: CopyContext): string {
  if (ctx.firstWeek) return 'You started. That was the hard part.';
  if (ctx.daysActiveCount === 0) return 'A quiet week.';
  if (ctx.daysActiveCount >= 6) return 'A full week.';
  if (ctx.daysActiveCount >= 3) return 'A steady week.';
  return 'You kept the thread.';
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

export function selectProse(ctx: CopyContext): string {
  if (ctx.firstWeek) {
    if (ctx.marksLogged === 0) {
      return 'Your goals are in place. The first mark is the hardest one, and next week is ready for it.';
    }
    const days = Math.max(1, ctx.daysActiveCount);
    return `${days} ${plural(days, 'day', 'days')} in, you have already logged ${ctx.marksLogged} ${plural(ctx.marksLogged, 'mark', 'marks')}. Most people never write the first one down.`;
  }
  if (ctx.daysActiveCount === 0) {
    return 'No marks landed this week, and that is simply where the week went. The thread is still yours, and Monday is a clean page.';
  }
  const base = `You showed up ${ctx.daysActiveCount} of 7 days and logged ${ctx.marksLogged} ${plural(ctx.marksLogged, 'mark', 'marks')}.`;
  return ctx.momentumHeld ? `${base} Momentum held the whole way through.` : base;
}

export function selectClosing(ctx: CopyContext): string {
  const whyPrefix = ctx.hasWhy
    ? ctx.firstWeek
      ? 'That is why you began. '
      : 'That is still the reason. '
    : '';
  if (ctx.firstWeek) {
    return `${whyPrefix}Next week is the first full one. Nothing to prove yet, just keep the thread.`;
  }
  if (ctx.roomForMore) {
    return `${whyPrefix}Next week, ${ctx.roomForMore.markName} has room for one more.`;
  }
  if (ctx.everyMarkMet) {
    return `${whyPrefix}Every mark landed where you aimed it. Carry the same rhythm into next week.`;
  }
  return `${whyPrefix}Next week is wide open. One mark on Monday is enough to begin it.`;
}

// ── Assembly ──────────────────────────────────────────────────────────────────

/** Active goals in canonical order (sort_index, the Goals-screen order). */
function activeGoalsSorted(goals: ReviewGoalInput[]): ReviewGoalInput[] {
  return goals
    .filter((g) => g.status === 'active')
    .slice()
    .sort((a, b) => (a.sort_index ?? 0) - (b.sort_index ?? 0));
}

/**
 * The whole review, derived at render time. Returns null when the user has no
 * active goals — the route quietly redirects (spec §8), nothing schedules.
 */
export function deriveWeeklyReview(inputs: DeriveWeeklyReviewInputs): WeeklyReviewData | null {
  const goals = activeGoalsSorted(inputs.goals);
  if (goals.length === 0) return null;

  const weekStart = reviewWeekStart(inputs.todayStr);
  const weekDates = reviewWeekDates(inputs.todayStr);
  const weekSet = new Set(weekDates);
  const weekEvents = inputs.events.filter((e) => weekSet.has(e.occurred_local_date));

  const daysActive = deriveDaysActive(weekEvents, weekDates);
  const daysActiveCount = daysActive.filter(Boolean).length;
  const marksLogged = countMarksLogged(weekEvents, weekDates);
  const firstWeek = deriveFirstWeek(goals, inputs.todayStr);
  const momentumHeld = deriveMomentumHeld(goals, inputs.snapshots);

  const cards: ReviewGoalCard[] = goals.map((g) => {
    const marks = inputs.marksByGoal[g.id] ?? [];
    const counts = buildWeeklyCountsMap(marks, inputs.events, weekDates);
    return {
      goalId: g.id,
      title: g.title,
      weeksIn: Math.floor(goalAgeDays(g.created_at, inputs.todayStr) / 7),
      marks: marks.map((m) => {
        const done = counts.get(m.id) ?? 0;
        const target = m.weekly_target ?? 3;
        return { markId: m.id, name: m.name, done, target, met: done >= target };
      }),
    };
  });

  const allLines = cards.flatMap((c) => c.marks);
  const why = deriveReviewWhy(goals);
  const ctx: CopyContext = {
    firstWeek,
    daysActiveCount,
    marksLogged,
    momentumHeld,
    hasWhy: why !== null,
    everyMarkMet: allLines.length > 0 && allLines.every((m) => m.met),
    roomForMore: deriveRoomForMore(cards),
  };

  return {
    weekStart,
    weekDates,
    weekLabel: firstWeek
      ? 'Your first days'
      : `Week of ${format(parseISO(weekStart), 'MMMM d')}`,
    daysActive,
    daysActiveCount,
    marksLogged,
    firstWeek,
    momentumHeld,
    goals: cards,
    why,
    headline: selectHeadline(ctx),
    prose: selectProse(ctx),
    closing: selectClosing(ctx),
  };
}
