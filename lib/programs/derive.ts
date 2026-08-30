// lib/programs/derive.ts
// Guided Programs derivation (PG-2, spec §4). Pure functions only: no I/O, no
// store imports, no clock reads — callers pass todayStr and data in (the
// lib/weeklyReview/derive.ts pattern). The ONLY stored program state is
// goals.program_id; everything below is computed from the card + synced rows +
// events, which is what makes a reinstall land in an identical state.
//
// The week machinery is REUSED, not rebuilt: Monday anchoring comes from
// weekPositionOf (lib/moments/context.ts) and date arithmetic from lib/date.
// Never add a fourth week helper.

import type { MarkEvent } from '../../types';
import { weekPositionOf } from '../moments/context';
import { addDays, formatDate, parseISO } from '../date';
import type { PaceLevel } from '../paceSetting';
import { DEFAULT_EASED_SCALE, type ProgramDefinition, type ProgramStage } from './types';

export type ProgramWeekGrade = 'held' | 'partial' | 'quiet';

export type ProgramEventInput = Pick<
  MarkEvent,
  'mark_id' | 'event_type' | 'occurred_local_date' | 'deleted_at'
>;

export type ProgramState = {
  programId: string;
  /** 0-based, clamped to the card. */
  stageIndex: number;
  stage: ProgramStage;
  /** eased iff the previous CLOSED week graded quiet (spec §4); week 1 is never eased. */
  mode: 'normal' | 'eased';
  /** One grade per closed week, week 1 first, capped at durationWeeks. */
  weekGrades: ProgramWeekGrade[];
  /** Today is past the final stage's week. Sticky by derivation. */
  completed: boolean;
  /** The current stage's bar, pace-scaled (and eased when mode is eased). */
  scaledBar: number;
  /** The current stage's marks with pace-scaled (and eased) weekly targets. */
  scaledMarks: { libraryId: string; weeklyTarget: number; dailyTarget?: number }[];
};

// ── Pace scaling (spec §3: ONE shared rule, not per card) ────────────────────

const PACE_FACTORS: Record<PaceLevel, number> = { easing: 0.75, steady: 1, push: 1.15 };

export function paceFactor(pace: PaceLevel): number {
  return PACE_FACTORS[pace];
}

/** Rounded, min 1. `easedScale` composes on top of pace when a stage is eased. */
export function scaleTarget(n: number, pace: PaceLevel, easedScale?: number): number {
  return Math.max(1, Math.round(n * paceFactor(pace) * (easedScale ?? 1)));
}

/**
 * The weekly target a program mark should carry. Variable marks take the
 * card's pace-scaled (and eased) target; fixed/abstinence marks are whole-day
 * states and ALWAYS keep the library's recommended value — the exact override
 * that shipped weekly_target 5 on a fixed Nutrition mark (backfilled live
 * 2026-08-04, see createFromAIPackage) must stay impossible here.
 */
export function programMarkWeeklyTarget(
  lib: { frequencyKind: string; frequency_recommended: number },
  desired: number,
  pace: PaceLevel,
  easedScale?: number,
): number {
  if (lib.frequencyKind !== 'variable') return lib.frequency_recommended;
  return scaleTarget(desired, pace, easedScale);
}

// ── Week anchoring ───────────────────────────────────────────────────────────

/** ISO Monday of the week containing dateStr ('yyyy-MM-dd'). */
export function programWeekStart(dateStr: string): string {
  return formatDate(addDays(parseISO(dateStr), -weekPositionOf(dateStr)));
}

// `created_at` arrives as a FULL ISO timestamp from the DB while this repo's
// date helpers are exercised on 'yyyy-MM-dd' strings — slice the date part off
// rather than trusting parseISO with a timestamp shape it is never fed
// elsewhere.
function weeksElapsed(createdAt: string, todayStr: string): number {
  const startMonday = parseISO(programWeekStart(createdAt.slice(0, 10)));
  const todayMonday = parseISO(programWeekStart(todayStr));
  const ms = todayMonday.getTime() - startMonday.getTime();
  return Math.max(0, Math.round(ms / (7 * 24 * 60 * 60 * 1000)));
}

// ── Grading ──────────────────────────────────────────────────────────────────

function isCountedLog(e: ProgramEventInput): boolean {
  return e.event_type === 'increment' && !e.deleted_at;
}

/** Distinct active days (>=1 counted log on a goal mark) inside one week. */
function activeDaysInWeek(
  events: ProgramEventInput[],
  markIds: Set<string>,
  weekMonday: string,
): number {
  const monday = parseISO(weekMonday);
  const days = new Set<string>();
  for (let i = 0; i < 7; i++) days.add(formatDate(addDays(monday, i)));
  const active = new Set<string>();
  for (const e of events) {
    if (!isCountedLog(e)) continue;
    if (!markIds.has(e.mark_id)) continue;
    if (days.has(e.occurred_local_date)) active.add(e.occurred_local_date);
  }
  return active.size;
}

// ── Assembly ─────────────────────────────────────────────────────────────────

/**
 * The whole program state, derived at render time.
 *
 * `goalMarks` = the program goal's LIVE linked marks (marksByGoal[goal.id]);
 * grading counts active days across whatever marks the goal still has (spec
 * §8: a deleted stage mark is graded around, never resurrected).
 *
 * Grades and eased mode are a sequential fold: week i's bar is stage i's,
 * pace-scaled, and eased-scaled when week i-1 graded quiet — so what the user
 * was ASKED that week is what the week is graded against.
 */
export function deriveProgramState(
  def: ProgramDefinition,
  goal: { created_at: string | null },
  goalMarks: { id: string }[],
  events: ProgramEventInput[],
  pace: PaceLevel,
  todayStr: string,
): ProgramState {
  const createdAt = goal.created_at ?? todayStr;
  const elapsed = weeksElapsed(createdAt, todayStr);
  const stageIndex = Math.min(elapsed, def.durationWeeks - 1);
  const completed = elapsed >= def.durationWeeks;

  const markIds = new Set(goalMarks.map((m) => m.id));
  const startMonday = programWeekStart(createdAt.slice(0, 10));

  const closedWeeks = Math.min(elapsed, def.durationWeeks);
  const weekGrades: ProgramWeekGrade[] = [];
  let prevQuiet = false;
  for (let i = 0; i < closedWeeks; i++) {
    const stage = def.stages[i];
    const eased = i > 0 && prevQuiet;
    const bar = scaleTarget(
      stage.bar.daysRequired,
      pace,
      eased ? (stage.easedScale ?? DEFAULT_EASED_SCALE) : undefined,
    );
    const weekMonday = formatDate(addDays(parseISO(startMonday), i * 7));
    const active = activeDaysInWeek(events, markIds, weekMonday);
    const grade: ProgramWeekGrade = active >= bar ? 'held' : active >= 1 ? 'partial' : 'quiet';
    weekGrades.push(grade);
    prevQuiet = grade === 'quiet';
  }

  const stage = def.stages[stageIndex];
  const lastClosed = weekGrades.length > 0 ? weekGrades[weekGrades.length - 1] : null;
  // Only an OPEN current stage can be eased; once the card is complete the
  // grades are history and mode is informational.
  const mode: ProgramState['mode'] = !completed && lastClosed === 'quiet' ? 'eased' : 'normal';
  const easedScale = mode === 'eased' ? (stage.easedScale ?? DEFAULT_EASED_SCALE) : undefined;

  return {
    programId: def.id,
    stageIndex,
    stage,
    mode,
    weekGrades,
    completed,
    scaledBar: scaleTarget(stage.bar.daysRequired, pace, easedScale),
    scaledMarks: stage.marks.map((m) => ({
      libraryId: m.libraryId,
      weeklyTarget: scaleTarget(m.weeklyTarget, pace, easedScale),
      dailyTarget: m.dailyTarget,
    })),
  };
}
