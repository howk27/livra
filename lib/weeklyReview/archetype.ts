// lib/weeklyReview/archetype.ts
// The named week on the Weekly Story card (spec 2026-09-15, section 3).
// Pure: signals in, one archetype out. Ordered rules, first match wins, and the
// table is exhaustive over days 0..7 (pinned by tests/unit/weeklyReview/archetype.test.ts).
// Two people with the same week get the same name; that is what makes
// "what was your week?" a comparison and not a lottery.
// Names and lines are [ASSUMED] until the founder voice pass.
import type { WeeklyReviewData } from './derive';

export const ARCHETYPE_IDS = [
  'strong_open',
  'first_marks',
  'week_one',
  'full_send',
  'clean_sweep',
  'comeback',
  'locked_in',
  'slow_burn',
  'back_on_it',
  'long_game',
  'steady_hand',
  'the_middle',
  'breather',
  'kept_the_thread',
  'rest_week',
  'quiet_week',
] as const;

export type ArchetypeId = (typeof ARCHETYPE_IDS)[number];

export type ArchetypeSignals = {
  /** 0..7, the reviewed week. */
  daysActiveCount: number;
  /** 0..7, the seven days before the reviewed week. */
  prevDaysActiveCount: number;
  firstWeek: boolean;
  /** Every mark line met its target; false when there are no marks. */
  allMarksMet: boolean;
  momentumHeld: boolean;
  /** Largest weeksIn across goals; 0 with no goals. */
  maxWeeksIn: number;
};

export type Archetype = { id: ArchetypeId; name: string; line: string };

/** Card name box fits two lines at 59pt: at most 16 characters, longest word 11. */
export const ARCHETYPE_NAME_MAX = 16;
export const ARCHETYPE_WORD_MAX = 11;

type Rule = {
  id: ArchetypeId;
  name: string;
  line: string | ((s: ArchetypeSignals) => string);
  when: (s: ArchetypeSignals) => boolean;
};

const RULES: readonly Rule[] = [
  { id: 'strong_open', name: 'Strong Open', line: 'First week and you already mean it.', when: (s) => s.firstWeek && s.daysActiveCount >= 4 },
  { id: 'first_marks', name: 'First Marks', line: 'The hard one is the first one. Done.', when: (s) => s.firstWeek && s.daysActiveCount >= 1 },
  { id: 'week_one', name: 'Week One', line: 'The page is open. That counts.', when: (s) => s.firstWeek },
  { id: 'full_send', name: 'Full Send', line: 'Every day. No notes.', when: (s) => s.daysActiveCount >= 7 && s.allMarksMet },
  { id: 'clean_sweep', name: 'Clean Sweep', line: 'Seven for seven.', when: (s) => s.daysActiveCount >= 7 },
  { id: 'comeback', name: 'The Comeback', line: "Last week was quiet. This one wasn't.", when: (s) => s.daysActiveCount >= 5 && s.prevDaysActiveCount <= 2 },
  { id: 'locked_in', name: 'Locked In', line: 'Showed up, and finished what you showed up for.', when: (s) => s.daysActiveCount >= 5 && s.allMarksMet },
  { id: 'slow_burn', name: 'The Slow Burn', line: 'Not loud. Not gone. Still going.', when: (s) => s.daysActiveCount >= 5 },
  { id: 'back_on_it', name: 'Back On It', line: 'The gap closed.', when: (s) => s.daysActiveCount >= 3 && s.prevDaysActiveCount <= 1 },
  { id: 'long_game', name: 'Long Game', line: (s) => `Week ${s.maxWeeksIn}. Still here.`, when: (s) => s.daysActiveCount >= 3 && s.maxWeeksIn >= 8 },
  { id: 'steady_hand', name: 'Steady Hand', line: 'Half the week, all of the habit.', when: (s) => s.daysActiveCount >= 3 && s.momentumHeld },
  { id: 'the_middle', name: 'The Middle', line: 'Some days yes, some days no. It adds up.', when: (s) => s.daysActiveCount >= 3 },
  { id: 'breather', name: 'Breather', line: 'Big week before this one. Rest is part of it.', when: (s) => s.daysActiveCount >= 1 && s.prevDaysActiveCount >= 5 },
  { id: 'kept_the_thread', name: 'Kept the Thread', line: 'Not much. Not nothing.', when: (s) => s.daysActiveCount >= 1 },
  { id: 'rest_week', name: 'Rest Week', line: "You'll know when it's Monday.", when: (s) => s.prevDaysActiveCount >= 4 },
  { id: 'quiet_week', name: 'Quiet Week', line: 'The thread is still yours.', when: () => true },
];

// Shipped exhaustiveness check (tsconfig excludes tests, so this lives here):
// every id has a rule and every rule has an id.
const _ruleIds: Record<ArchetypeId, true> = Object.fromEntries(
  RULES.map((r) => [r.id, true]),
) as Record<ArchetypeId, true>;
void _ruleIds;

export function deriveArchetype(s: ArchetypeSignals): Archetype {
  const rule = RULES.find((r) => r.when(s)) ?? RULES[RULES.length - 1];
  return {
    id: rule.id,
    name: rule.name,
    line: typeof rule.line === 'function' ? rule.line(s) : rule.line,
  };
}

/** Fold a derived review into the six signals. */
export function archetypeSignalsFrom(review: WeeklyReviewData): ArchetypeSignals {
  const lines = review.goals.flatMap((g) => g.marks);
  return {
    daysActiveCount: review.daysActiveCount,
    prevDaysActiveCount: review.prevDaysActiveCount,
    firstWeek: review.firstWeek,
    allMarksMet: lines.length > 0 && lines.every((m) => m.met),
    momentumHeld: review.momentumHeld,
    maxWeeksIn: review.goals.reduce((max, g) => Math.max(max, g.weeksIn), 0),
  };
}
