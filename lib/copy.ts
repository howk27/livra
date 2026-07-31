/**
 * All dynamic copy for Livra 2.0.
 * Pure functions, no side effects, no React Native imports.
 * Every string the user sees that changes with context lives here.
 */

import { FREE_MARKS_PER_GOAL, FREE_MARK_CEILING } from './gating';
// Type-only: erased at build time, so this file still has no runtime dependency
// on the AI module. See GENERATION_ERROR_COPY below for why it is imported.
import type { GenerationFailReason } from './ai/goalGeneration';
// Type-only for the same reason: the exhaustiveness constraint on DATA_ERROR_COPY
// must sit in a file tsc reads, and this keeps lib/copy.ts runtime-free of lib/data.
import { asDataError, type DataErrorKind } from './data/errors';

// ─── Momentum at-risk warning copy (Phase 1.3) ──────────────────────────────
// No dashes. Offer-framed with a rest-out. Rotate, never the same template twice in a row.

export interface MomentumCopy {
  /** Rendered, goal titles substituted. */
  text: string;
  /** Raw pool entry, used by the caller to avoid back-to-back repeats. */
  template: string;
}

const MOMENTUM_FIRST_NUDGE: string[] = [
  "[Goal] is slipping a little. One log keeps your momentum. Or rest easy if today's a rest day.",
  "Your momentum on [Goal] is dipping. A single log today and you're back on it.",
  "[Goal] could use a touch today. One mark keeps the momentum going. No pressure if you're resting.",
  'Momentum fades quietly. One log on [Goal] today and it holds.',
  "You've built real momentum on [Goal]. One log keeps it.",
  '[Goal] is asking for a little attention. One mark today, or rest if that\'s what today is.',
  'Still time to keep your momentum on [Goal]. One log is all it takes.',
  'Your run on [Goal] is worth protecting. A single mark today keeps it alive.',
  'Momentum on [Goal] is slipping. One small log brings it back. Resting is fine too.',
];

const MOMENTUM_FINAL_NUDGE: string[] = [
  "Last call on [Goal]'s momentum. One log today keeps it, or let it rest. Your call.",
  'Your momentum on [Goal] resets after today. One mark holds it, no guilt either way.',
  "[Goal]'s momentum resets after today. One log keeps it, or a fresh start tomorrow is just fine.",
  "Today's the day to keep your momentum on [Goal]. One log holds it, or rest if that's right for today.",
  'One log on [Goal] today keeps your momentum. After that it resets, and that is okay too.',
  'Your run on [Goal] holds with a single log today. Or let it rest and begin fresh tomorrow.',
  'Keep [Goal] going with one mark today. No mark is fine too, a fresh start always waits.',
  'Momentum on [Goal] is at its edge. One log today, or a clean slate tomorrow. Either is fine.',
];

const MOMENTUM_COMBINED: string[] = [
  'Two of your goals are slipping a little, [Goal A] and [Goal B]. One log each keeps them going, or rest easy if today\'s a rest day.',
  'Your momentum on [Goal A] and [Goal B] is dipping. A single log on each holds them. No pressure if you\'re resting.',
  '[Goal A] and [Goal B] could both use a touch today. One mark each keeps the momentum, or rest if that\'s today.',
  'A little attention keeps [Goal A] and [Goal B] going. One log each today, or rest easy.',
  'Momentum on [Goal A] and [Goal B] is slipping a little. One small log each brings them back. Resting is fine too.',
  'Still time to keep [Goal A] and [Goal B] going. One log on each is all it takes, or let today rest.',
];

const MOMENTUM_BANNER: string[] = [
  'Some of your momentum is slipping a little. A log or two keeps things going.',
  'A bit of your momentum is dipping. One log brings it back, or rest easy today.',
  'Momentum slipping a little. A single mark holds it, no pressure if you\'re resting.',
  'Some momentum could use a touch today. A log keeps it going, or let today be a rest day.',
  'A little of your momentum is fading. One log today and it holds.',
  'Your momentum is slipping a touch. A mark or two keeps it, resting is fine too.',
];

function rotatePick(pool: string[], lastTemplate?: string): string {
  const avail = pool.length > 1 ? pool.filter((t) => t !== lastTemplate) : pool;
  const source = avail.length > 0 ? avail : pool;
  return source[Math.floor(Math.random() * source.length)]!;
}

export function getMomentumFirstNudgeCopy(goalTitle: string, lastTemplate?: string): MomentumCopy {
  const template = rotatePick(MOMENTUM_FIRST_NUDGE, lastTemplate);
  return { template, text: template.replace('[Goal]', goalTitle) };
}

export function getMomentumFinalNudgeCopy(goalTitle: string, lastTemplate?: string): MomentumCopy {
  const template = rotatePick(MOMENTUM_FINAL_NUDGE, lastTemplate);
  return { template, text: template.replace('[Goal]', goalTitle) };
}

export function getMomentumCombinedCopy(goalA: string, goalB: string, lastTemplate?: string): MomentumCopy {
  const template = rotatePick(MOMENTUM_COMBINED, lastTemplate);
  return { template, text: template.replace('[Goal A]', goalA).replace('[Goal B]', goalB) };
}

export function getMomentumBannerCopy(lastTemplate?: string): MomentumCopy {
  const template = rotatePick(MOMENTUM_BANNER, lastTemplate);
  return { template, text: template };
}

// ─── Canonical term definitions (single source; screens import these) ────────
// New shared copy (anything shown on more than one screen, and every core-term
// definition) lives in this file. One-off copy may stay inline.

export const TERMS = {
  goal: "A goal is something you're working toward. Pick one or two that matter and give them the time.",
  mark: "A mark is one small action you repeat toward your goal. You log it each time you do it.",
  momentum: "Momentum is how your effort adds up over time. Miss a day and it bends, it does not break.",
  dailyHabit: "A daily habit is a mark you keep on its own, not tied to any goal.",
} as const;

// ─── Recurring shared lines ──────────────────────────────────────────────────

/** Shown when a free user hits the 2-goal cap (goal/new + the suggest-a-plan flow). */
export const GOAL_LIMIT_MESSAGE =
  'Free keeps you to 2 goals at once so you can actually finish them. Livra+ opens unlimited goals.';

/**
 * The two free-tier mark limits, each with its own reason (2026-07-22). They are
 * different walls and must never share one message: one goal being full says
 * nothing about the account, and a full account says nothing about this goal.
 * Numbers come from lib/gating.ts so copy and gate can never drift.
 */
export const MARK_PER_GOAL_LIMIT_MESSAGE =
  `Free keeps each goal to ${FREE_MARKS_PER_GOAL} marks so the goal stays something you can actually do. Livra+ opens unlimited marks.`;

export const MARK_CEILING_MESSAGE =
  `Free tracks ${FREE_MARK_CEILING} marks in total across your goals and daily habits, and you’re at ${FREE_MARK_CEILING}. Free one up, or Livra+ opens unlimited marks.`;

// ─── AI generation failure copy (onboarding + /goal/suggest share one source) ─
// Keys mirror GenerationFailReason in lib/ai/goalGeneration.ts. Kept here (not
// in goalGeneration) so screens that mock the AI module still resolve real copy.
// goal_too_short is empty: both callers gate the button on MIN_GOAL_LENGTH.

// KEYED ON THE UNION, NOT ON `string`. b503cfa put an exhaustive
// `Record<GenerationFailReason, true>` in aiPlanSuggestedAnalytics.test.ts and
// described it as making a missing string "a TYPE error at npm run type-check".
// It is not: tsconfig.json EXCLUDES `tests/**`, so tsc never reads that file and
// the record only constrains the six keys somebody remembered to list. Two new
// reasons were added here and sailed straight past it.
//
// The constraint belongs in a file tsc actually compiles. `import type` is
// erased at build time, so this keeps the promise in the header above: screens
// that mock the AI module still resolve real copy, because no runtime import of
// goalGeneration is created.
export const GENERATION_ERROR_COPY: Record<GenerationFailReason, string> = {
  low_confidence: 'Couldn’t make sense of that. Try describing your goal in one sentence.',
  free_use_exhausted:
    'You’ve used your free AI plan. Livra+ unlocks unlimited AI goal plans. Or continue manually below.',
  // Answered by waiting, not by paying, so these must never mention Livra+: a
  // subscriber who hits one would be sold what they already own.
  //
  // SPLIT BY WINDOW. "Give it a few minutes" is true of the hourly cap and a LIE
  // about the daily one. A free user who hits 15/day was being told to wait
  // minutes for something that resets tomorrow, and would keep retrying for
  // hours. The server has always known which window it was.
  rate_limited_hour:
    'That’s a lot of plans in a short time. Give it a few minutes, or continue manually below.',
  rate_limited_day:
    'You’ve reached today’s limit for generated plans. It resets tomorrow. Or continue manually below.',
  // Version-skew fallback only: a client carrying the split reasons can meet a
  // function still returning the bare string. Deliberately vague about the wait,
  // because in this case we genuinely do not know which window was hit.
  rate_limited:
    'You’ve made a lot of plans recently. Try again a bit later, or continue manually below.',
  invalid_output: 'Something went wrong. Continue manually below.',
  network_error: 'Couldn’t reach Livra AI. Check your connection or continue manually.',
  goal_too_short: '',
} as const;

// ─── Data-layer failure copy (M9 Phase 3, T3) ────────────────────────────────
//
// THE ONLY user-facing words for a failed read or write. A raw error never leaves
// `lib/data/` (Spec §6): `toDataError` classifies it and the raw text goes to the
// logger, then a screen asks for the line below. `tests/unit/errorClassifier.test.ts`
// fails if a screen renders `error.message` into UI instead.
//
// KEYED ON THE UNION, in a file `tsc` compiles, for the same reason GENERATION_ERROR_COPY
// above lives here rather than in a test: `tsconfig.json` excludes `tests/**`.
// `import type` is erased, so this adds no runtime dependency on the data layer.
// CONFIRMED 2026-07-30: deleting `conflict` from this record produces
// `lib/copy.ts TS2741: Property 'conflict' is missing`, the same failure b503cfa's
// test-file record could not produce.
//
// Each line says what happened and what to do about it, and none of them apologises
// or guesses. Two deliberate restraints:
//   · `permission` does NOT claim to be the free-tier cap. 42501 comes from the
//     restrictive RLS layer AND from a genuine permission bug (fec1618), so naming
//     the cap would be a confident lie in the second case.
//   · `network` promises no later sync. The offline queue is Phase 4; until it
//     exists, "it will sync when you're back" is not true of a write.
export const DATA_ERROR_COPY: Record<DataErrorKind, string> = {
  network: 'No connection. Check your network and try again.',
  auth_expired: 'Your session ended. Sign in again to pick up where you left off.',
  // No dash: `tests/unit/copyDashRule.test.ts` bans em and en dashes in this file,
  // and it caught this line on the first run.
  permission:
    'That change was not allowed. You may be at a free plan limit. If not, sign in again and retry.',
  limit_reached: 'You’re at a free plan limit. Free up a slot, or Livra+ opens unlimited goals and marks.',
  not_found: 'That’s not here anymore. It may have been removed on another device.',
  conflict: 'That’s already saved. Pull down to refresh and it will show up.',
  server: 'Livra couldn’t finish that. Try again in a moment.',
  unknown: 'That didn’t go through. Try again.',
} as const;

/** The user-facing line for a classified data failure. Screens call THIS, never `.message`. */
export function dataErrorCopy(error: { kind: DataErrorKind } | null | undefined): string | null {
  if (!error) return null;
  return DATA_ERROR_COPY[error.kind] ?? DATA_ERROR_COPY.unknown;
}

/**
 * M9 Phase 3. The same table, for a failure that DEFINITELY happened.
 *
 * `dataErrorCopy` is nullable because a read query has no error most of the time.
 * A `catch` block is the opposite case: something failed, the surface has to say
 * something, and `?? fallback` at every call site is four chances to pick a
 * different fallback. The nullable path survives only because `throw undefined` is
 * legal JavaScript, not because "no error" is a state a catch can be in.
 *
 * (No dash in this comment: the rule at the top of DATA_ERROR_COPY covers the
 * whole file, and it caught this on the full-suite run.)
 */
export function caughtErrorCopy(error: unknown): string {
  const classified = asDataError(error);
  return (classified && dataErrorCopy(classified)) || DATA_ERROR_COPY.unknown;
}

/** Inline exhausted panel on /goal/suggest. Honest, never a wall: manual stays free. */
export const AI_EXHAUSTED_COPY = {
  title: 'You’ve used your free AI plan.',
  body: 'Livra+ includes unlimited AI goal plans.',
  upsell: 'See Livra+',
  manual: 'Build it myself · always free',
} as const;
