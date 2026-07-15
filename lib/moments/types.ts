// Moment engine types (PL-1). Pure data shapes — no React, no stores, no I/O.
// This module family is the contract PL-2..PL-6 consume.

/** Where a voice line can render. Existing text slots only — no new chrome. */
export type Surface =
  | 'greeting'
  | 'momentumBanner'
  | 'goalDetail'
  | 'postLog'
  | 'emptyState'
  | 'restLine';

/** The six spec moments (M1–M6, docs/superpowers/specs/2026-07-14-psychology-layer-design.md §3)
 *  plus the rest register (QC2-F, founder device note #6). */
export type MomentType =
  | 'firstWeek' // M1 — first-week scaffolding
  | 'celebration' // M2 — momentum celebration
  | 'whyResurface' // M3 — why-resurfacing at slipping (the one direct sentence)
  | 'emptyInvitation' // M4 — empty states as invitations
  | 'postLog' // M5 — post-log micro-feedback
  | 'greetingDefault' // M6 — default greeting rotation
  | 'rest'; // QC2-F — rest register: done-for-week line + bonus-log acknowledgment

/** A single line Livra says. `id` is stable per template (type.variant.index) and
 *  doubles as the caller-held anti-repeat token. */
export type Moment = {
  id: string;
  surface: Surface;
  type: MomentType;
  text: string;
};

/** M4 distinguishes a brand-new user from one who deleted everything. */
export type EmptyVariant = 'firstRun' | 'returnedEmpty';

/** The five empty surfaces M4 speaks on (PL-5). Registry keys are `${surface}.${variant}`. */
export type EmptySurface = 'focus' | 'goals' | 'goalDetail' | 'history' | 'markDetail';

/** Per-goal derived facts. All derivations happen in buildMomentContext. */
export type GoalMomentContext = {
  goalId: string;
  goalTitle: string;
  /** The user's why (goal description), untruncated; templates truncate at fill time. */
  why: string | null;
  hasWhy: boolean;
  /** Whole days since goal creation, clamped >= 0. */
  goalAgeDays: number;
  /** goalAgeDays 0–7 inclusive (spec M1). */
  firstWeek: boolean;
  /** Current momentum run in days (snapshot.days). */
  momentumRunDays: number;
  /** Cushion engaged — snapshot.state === 'slipping', the same predicate
   *  shouldShowMomentumBanner (lib/momentumPresenter.ts) uses. */
  isSlipping: boolean;
  /** 0..1 cushion fill when slipping, else null (mirrors MomentumSnapshot). */
  cushionRemaining: number | null;
  /** Longest historical run. INPUT here — forward tracking lands in PL-2. */
  personalBestRun: number | null;
  /** Run exceeds the recorded personal best (spec M2). */
  isNewBest: boolean;
  /** 7 | 14 | 30 when the run reached that threshold today, else null (spec M2). */
  celebrationThreshold: 7 | 14 | 30 | null;
  /** Lifetime log events across the goal's marks (PL-3, M1). Counted AFTER the
   *  current log lands, so 1 means the first-ever log. null = caller did not
   *  supply lifetime counts; first-log/orientation predicates fall back. */
  lifetimeLogCount: number | null;
};

/** Everything the selector needs, built once per render by buildMomentContext. */
export type MomentContext = {
  todayStr: string;
  firstName: string | null;
  /** 0 = Monday … 6 = Sunday (weeks start Monday, hardcoded). */
  weekPosition: number;
  /** Total logs recorded today across marks. */
  logsToday: number;
  /** Every mark due today has at least one log today. */
  allDoneForDay: boolean;
  /** Active goals only. */
  goals: GoalMomentContext[];
  /** Raw passthroughs for later tasks (PL-4 "closes the week" needs weekly counts). */
  weeklyCounts: Record<string, number>;
  todayCounts: Record<string, number>;
};
