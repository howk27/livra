import { MARK_LIBRARY, MarkDefinition } from './suggestedCounters';

// ─── Commitment system types ──────────────────────────────────────────────────

export type TierId = 'starting' | 'building' | 'leveling' | 'all-in';
export type FrequencyId = 'light' | 'steady' | 'pushing';

export const TIERS: Record<TierId, {
  label: string;
  durationWeeks: number;
  description: string;
  defaultFrequency: FrequencyId;
  allowedFrequencies: FrequencyId[];
}> = {
  'starting': { label: 'Just starting',        durationWeeks: 6,  description: 'First attempt, building the habit',    defaultFrequency: 'light',   allowedFrequencies: ['light', 'steady'] },
  'building': { label: 'Building consistency', durationWeeks: 10, description: 'Some experience, making it stick',     defaultFrequency: 'steady',  allowedFrequencies: ['light', 'steady', 'pushing'] },
  'leveling': { label: 'Leveling up',          durationWeeks: 16, description: 'Comfortable, pushing further',         defaultFrequency: 'steady',  allowedFrequencies: ['steady', 'pushing'] },
  'all-in':   { label: 'All in',               durationWeeks: 24, description: 'High commitment, serious outcome',     defaultFrequency: 'pushing', allowedFrequencies: ['steady', 'pushing'] },
};

export const FREQUENCIES: Record<FrequencyId, {
  label: string;
  daysPerWeekMid: number;
  range: string;
  restDays: string;
}> = {
  'light':   { label: 'Light',        daysPerWeekMid: 2.5, range: '2–3 days/week', restDays: '4–5 rest days' },
  'steady':  { label: 'Steady',       daysPerWeekMid: 4.5, range: '4–5 days/week', restDays: '2–3 rest days' },
  'pushing': { label: 'Pushing past', daysPerWeekMid: 5.5, range: '5–6 days/week', restDays: '1–2 rest days' },
};

/** Minimum check-ins required to unlock goal completion. */
export function calculateUnlockThreshold(tier: TierId, frequency: FrequencyId, associatedMarkCount: number): number {
  const { durationWeeks } = TIERS[tier];
  const { daysPerWeekMid } = FREQUENCIES[frequency];
  return Math.floor(durationWeeks * daysPerWeekMid * associatedMarkCount * 0.80);
}

/** Human-readable commitment summary, e.g. "~180 check-ins over 16 weeks". */
export function commitmentSummary(tier: TierId, frequency: FrequencyId, associatedMarkCount: number): string {
  const threshold = calculateUnlockThreshold(tier, frequency, associatedMarkCount);
  const weeks = TIERS[tier].durationWeeks;
  return `~${threshold} check-ins over ${weeks} weeks`;
}

// ─── Suggestion engine ────────────────────────────────────────────────────────

const MAX_SUGGESTIONS = 5;

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'to', 'for', 'of', 'in',
  'on', 'at', 'by', 'my', 'i', 'want', 'become', 'be', 'get', 'do',
  'build', 'start', 'make', 'learn', 'improve', 'better', 'more',
]);

function tokenize(title: string): string[] {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1 && !STOP_WORDS.has(t));
}

function scoreMark(mark: MarkDefinition, tokens: string[]): number {
  let score = 0;
  const lowerTags = mark.tags.map(t => t.toLowerCase());
  for (const token of tokens) {
    for (const tag of lowerTags) {
      if (tag === token) {
        score += 2;
      } else if (tag.includes(token) || token.includes(tag)) {
        score += 1;
      }
    }
  }
  return score;
}

const FALLBACK_IDS = ['workout', 'focus', 'planning', 'sleep', 'water'];

export function getMarksForGoal(goalTitle: string): MarkDefinition[] {
  const tokens = tokenize(goalTitle);
  if (tokens.length === 0) return MARK_LIBRARY.slice(0, 3);

  const scored = MARK_LIBRARY
    .map(mark => ({ mark, score: scoreMark(mark, tokens) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_SUGGESTIONS)
    .map(({ mark }) => mark);

  if (scored.length > 0) return scored;

  return FALLBACK_IDS
    .map(id => MARK_LIBRARY.find(m => m.id === id))
    .filter(Boolean) as MarkDefinition[];
}
