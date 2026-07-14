// Pure context builder for the moment engine (PL-1).
// No store imports, no I/O — callers pass existing data in; everything derived here.
import { daysBetween, parseISO } from '../date';
import type { MomentumSnapshot } from '../goalMomentum';
import type { GoalMomentContext, MomentContext } from './types';

/** The goal fields the engine needs (subset of types/goal.ts Goal). */
export type MomentGoalInput = {
  id: string;
  title: string;
  /** The user's why. */
  description?: string | null;
  created_at: string;
  status: string;
};

export type BuildMomentContextInputs = {
  goals: MomentGoalInput[];
  /** Latest momentum snapshot per goalId (state/momentumSlice shape). */
  snapshots: Record<string, MomentumSnapshot>;
  /** markId → distinct-day completions this week (lib/features computeCompletionsThisWeek). */
  weeklyCounts: Record<string, number>;
  /** markId → logs recorded today. */
  todayCounts: Record<string, number>;
  /** Marks due today; drives allDoneForDay. */
  dueMarkIds: string[];
  /** 'yyyy-MM-dd'. */
  todayStr: string;
  firstName?: string | null;
  /** goalId → longest historical run. Forward tracking is PL-2's job. */
  personalBestRuns?: Record<string, number | null>;
};

export const CELEBRATION_THRESHOLDS = [7, 14, 30] as const;

/** A "record" needs a real best behind it: bests under 7 days ride the
 *  threshold celebrations instead, so day-2 "records" never fire in week one (PL-2). */
export const PERSONAL_BEST_FLOOR = 7;

/** Whole days since creation, clamped >= 0 (created "today" = 0). */
export function goalAgeDays(createdAt: string, todayStr: string): number {
  return Math.max(0, daysBetween(todayStr, createdAt));
}

/** Spec M1: days 0–7 inclusive. */
export function isFirstWeek(ageDays: number): boolean {
  return ageDays >= 0 && ageDays <= 7;
}

/** 0 = Monday … 6 = Sunday. Weeks start Monday, hardcoded (PRD §5). */
export function weekPositionOf(todayStr: string): number {
  const dow = parseISO(todayStr).getDay(); // 0=Sun..6=Sat
  return dow === 0 ? 6 : dow - 1;
}

/** Threshold the run reached exactly today, else null. Equality keeps M2 "that day only". */
export function celebrationThresholdFor(runDays: number): 7 | 14 | 30 | null {
  for (const t of CELEBRATION_THRESHOLDS) {
    if (runDays === t) return t;
  }
  return null;
}

// ── Small named derivations (each pure and directly unit-testable) ───────────

/** Current run in days; 0 when broken or no snapshot yet. */
export function deriveRunDays(snap: MomentumSnapshot | null): number {
  if (!snap || snap.state === 'broken') return 0;
  return Math.max(0, snap.days);
}

/** Cushion engaged — same predicate shouldShowMomentumBanner uses. */
export function deriveIsSlipping(snap: MomentumSnapshot | null): boolean {
  return snap?.state === 'slipping';
}

/** 0..1 cushion fill when slipping, else null. */
export function deriveCushionRemaining(snap: MomentumSnapshot | null): number | null {
  if (!deriveIsSlipping(snap)) return null;
  return snap?.cushionRemaining ?? 0;
}

/** The user's why, normalized: trimmed, null when empty or absent. */
export function deriveWhy(description: string | null | undefined): string | null {
  return description?.trim() || null;
}

/** Spec M2: run exceeds a recorded personal best of at least PERSONAL_BEST_FLOOR days.
 *  No recorded best (or one under the floor) → false. */
export function deriveIsNewBest(runDays: number, personalBest: number | null): boolean {
  return personalBest !== null && personalBest >= PERSONAL_BEST_FLOOR && runDays > personalBest;
}

/** Total logs recorded today across marks. */
export function deriveLogsToday(todayCounts: Record<string, number>): number {
  return Object.values(todayCounts).reduce((sum, n) => sum + Math.max(0, n), 0);
}

/** Every mark due today has at least one log today; false when nothing is due. */
export function deriveAllDoneForDay(
  dueMarkIds: string[],
  todayCounts: Record<string, number>,
): boolean {
  return dueMarkIds.length > 0 && dueMarkIds.every((id) => (todayCounts[id] ?? 0) > 0);
}

/** Trimmed first name, null when blank or absent. */
export function deriveFirstName(firstName: string | null | undefined): string | null {
  return firstName?.trim() || null;
}

/** Per-goal derivation: one goal + its snapshot + its recorded best → GoalMomentContext. */
export function deriveGoalContext(
  g: MomentGoalInput,
  snap: MomentumSnapshot | null,
  personalBest: number | null,
  todayStr: string,
): GoalMomentContext {
  const age = goalAgeDays(g.created_at, todayStr);
  const runDays = deriveRunDays(snap);
  const why = deriveWhy(g.description);
  return {
    goalId: g.id,
    goalTitle: g.title,
    why,
    hasWhy: why !== null,
    goalAgeDays: age,
    firstWeek: isFirstWeek(age),
    momentumRunDays: runDays,
    isSlipping: deriveIsSlipping(snap),
    cushionRemaining: deriveCushionRemaining(snap),
    personalBestRun: personalBest,
    isNewBest: deriveIsNewBest(runDays, personalBest),
    celebrationThreshold: celebrationThresholdFor(runDays),
  };
}

// ── Assembly only ─────────────────────────────────────────────────────────────

export function buildMomentContext(inputs: BuildMomentContextInputs): MomentContext {
  const goals = inputs.goals
    .filter((g) => g.status === 'active')
    .map((g) =>
      deriveGoalContext(
        g,
        inputs.snapshots[g.id] ?? null,
        inputs.personalBestRuns?.[g.id] ?? null,
        inputs.todayStr,
      ),
    );

  return {
    todayStr: inputs.todayStr,
    firstName: deriveFirstName(inputs.firstName),
    weekPosition: weekPositionOf(inputs.todayStr),
    logsToday: deriveLogsToday(inputs.todayCounts),
    allDoneForDay: deriveAllDoneForDay(inputs.dueMarkIds, inputs.todayCounts),
    goals,
    weeklyCounts: inputs.weeklyCounts,
    todayCounts: inputs.todayCounts,
  };
}
