/**
 * All dynamic copy for Livra 2.0.
 * Pure functions, no side effects, no React Native imports.
 * Every string the user sees that changes with context lives here.
 */

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
  mark: "A mark is one action you'll repeat toward your goal. Small, yours. Log it each time you show up.",
  momentum: "Momentum is how your effort adds up over time. Miss a day and it bends, it does not break.",
  dailyHabit: "A daily habit is a mark you keep on its own, not tied to any goal.",
} as const;

// ─── Recurring shared lines ──────────────────────────────────────────────────

/** Shown when a free user hits the 2-goal cap (goal/new + AddGoalSheet). */
export const GOAL_LIMIT_MESSAGE =
  'Free keeps you to 2 goals at once so you can actually finish them. Livra+ opens unlimited goals.';
