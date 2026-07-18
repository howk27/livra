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

/** The goal's full check-in commitment (stored as goal.target_mark_count).
 *  NOT the same as lib/goalLogic's calculateUnlockThreshold, which gates early
 *  manual completion — the old shared name hid a real bug (M7). */
export function calculateCommitmentTarget(tier: TierId, frequency: FrequencyId, associatedMarkCount: number): number {
  const { durationWeeks } = TIERS[tier];
  const { daysPerWeekMid } = FREQUENCIES[frequency];
  return Math.floor(durationWeeks * daysPerWeekMid * associatedMarkCount * 0.80);
}

/** Human-readable commitment summary, e.g. "~180 check-ins over 16 weeks". */
export function commitmentSummary(tier: TierId, frequency: FrequencyId, associatedMarkCount: number): string {
  const threshold = calculateCommitmentTarget(tier, frequency, associatedMarkCount);
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

/**
 * `$` survives the strip: it is the signal that separates "Save $5k" (money)
 * from "Run a 5k" (race distance). The old `[^a-z0-9\s]` strip destroyed it
 * before scoring ever saw it. Everything else non-alphanumeric is noise.
 */
function tokenize(title: string): string[] {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9$\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1 && !STOP_WORDS.has(t));
}

/**
 * Domain signals per `MarkDefinition.category`. Inferring the goal's domain(s)
 * from its title lets in-domain marks outrank cross-domain ones, so a single
 * ambiguous token (`5k` = race distance AND money) cannot hijack the result.
 */
const DOMAIN_SIGNALS: Record<string, string[]> = {
  'Finance': [
    'save', 'saving', 'savings', 'money', 'budget', 'budgeting', 'debt', 'invest',
    'investing', 'investment', 'stock', 'stocks', 'wealth', 'income', 'salary',
    'retire', 'retirement', 'mortgage', 'rent', 'spend', 'spending', 'frugal',
    'fund', 'cash', 'dollar', 'dollars', 'hustle', 'freelance', 'revenue', 'profit',
    'financial', 'finance', 'afford', 'payment', 'loan', 'credit', 'emergency',
  ],
  'Fitness': [
    'run', 'running', 'jog', 'jogging', 'marathon', '5k', '10k', 'gym', 'workout',
    'lift', 'lifting', 'muscle', 'strength', 'fitness', 'fit', 'race', 'triathlon',
    'swim', 'swimming', 'cycling', 'bike', 'cardio', 'steps', 'walk', 'walking',
    'train', 'training', 'athlete', 'pushups', 'pullups', 'tone', 'bulk',
  ],
  'Health': [
    'weight', 'diet', 'eat', 'eating', 'nutrition', 'calories', 'water',
    'hydration', 'hydrate', 'sugar', 'alcohol', 'sober', 'sobriety', 'vitamins',
    'supplements', 'health', 'healthy', 'lose', 'fat', 'food', 'meal', 'meals',
  ],
  'Recovery': [
    'sleep', 'rest', 'recovery', 'recover', 'stretch', 'mobility', 'flexibility',
    'injury', 'yoga', 'burnout', 'fatigue', 'tired', 'insomnia', 'sore',
  ],
  'Mindset': [
    'meditate', 'meditation', 'mindfulness', 'mindful', 'anxiety', 'anxious',
    'stress', 'calm', 'gratitude', 'grateful', 'journal', 'journaling', 'breathe',
    'breathing', 'breathwork', 'mental', 'therapy', 'confidence', 'confident',
    'affirmations', 'happiness', 'happier', 'peace', 'present',
  ],
  'Deep Work': [
    'read', 'reading', 'book', 'books', 'focus', 'study', 'studying', 'exam',
    'degree', 'course', 'certification', 'learning', 'write', 'writing', 'blog',
    'novel', 'author', 'language', 'spanish', 'french', 'japanese', 'korean',
    'italian', 'portuguese', 'fluent', 'code', 'coding', 'productivity',
    'productive', 'distraction', 'skill', 'practice', 'phone', 'screen',
  ],
  'Discipline': [
    'discipline', 'disciplined', 'willpower', 'habit', 'habits', 'routine',
    'morning', 'wake', 'early', 'cold', 'shower', 'posture', 'consistency',
    'consistent', 'quit', 'cook', 'cooking',
  ],
  'Relationships': [
    'family', 'friends', 'friendship', 'social', 'socialize', 'network',
    'networking', 'partner', 'marriage', 'kids', 'parents', 'community',
    'volunteer', 'lonely', 'loneliness', 'connection', 'connect',
  ],
  'Creative': [
    'creative', 'creativity', 'art', 'draw', 'drawing', 'paint', 'painting',
    'design', 'music', 'guitar', 'piano', 'hobby', 'photography', 'photo',
  ],
};

/** `$5k` / `$200` — currency is a domain signal, never a race distance. */
function isCurrencyToken(token: string): boolean {
  return token.startsWith('$');
}

/**
 * A bare magnitude — `5k`, `10k`, `200`. Ambiguous by nature: "Save 5k" is money
 * and "Run a 5k" is a race, and the token alone cannot tell you which. So it
 * FOLLOWS the domain, never sets it (see `inferDomains`) and never scores against
 * an out-of-domain mark (see `scoreMark`). Founders type "Save 5k" without the `$`.
 */
function isMagnitudeToken(token: string): boolean {
  return /^\d+k?$/.test(token);
}

/** Light suffix stem: "saving" → "sav", "save" → "sav", "reading" → "read". */
function stem(word: string): string {
  return word.replace(/(ing|ed|es|s)$/, '').replace(/e$/, '');
}

/**
 * True when two words are the same word modulo a suffix — "save"/"saving",
 * "read"/"reading", "meditate"/"meditation". Deliberately conservative: a bare
 * shared prefix of <5 chars is not enough ("stretch"/"strength" must not match).
 */
function isPrefixRelated(a: string, b: string): boolean {
  if (a === b) return true;

  const stemA = stem(a);
  const stemB = stem(b);
  if (stemA.length >= 3 && stemA === stemB) return true;

  const shorter = a.length <= b.length ? a : b;
  const longer = a.length <= b.length ? b : a;
  if (shorter.length >= 3 && longer.startsWith(shorter)) return true;

  let i = 0;
  while (i < shorter.length && a[i] === b[i]) i++;
  return i >= 5;
}

function domainsFromTokens(tokens: string[]): Set<string> {
  const domains = new Set<string>();
  for (const token of tokens) {
    if (isCurrencyToken(token)) {
      domains.add('Finance');
      continue;
    }
    for (const [category, signals] of Object.entries(DOMAIN_SIGNALS)) {
      if (signals.some(signal => isPrefixRelated(signal, token))) domains.add(category);
    }
  }
  return domains;
}

/**
 * Two passes, because an ambiguous magnitude must not out-vote a word that means
 * something. "Save 5k" reads Finance from `save`; letting `5k` also vote Fitness
 * would make Run in-domain and rank it above the user's actual savings marks —
 * the exact QC4 bug. Magnitudes only get a vote when nothing else spoke ("5k").
 */
function inferDomains(tokens: string[]): Set<string> {
  const decisive = domainsFromTokens(tokens.filter(t => !isMagnitudeToken(t)));
  if (decisive.size > 0) return decisive;
  return domainsFromTokens(tokens);
}

/**
 * Relevance of a mark's own tags/name to the goal tokens. Currency tokens are
 * excluded from tag matching entirely — `$5k` is money, and matching it against
 * the `5k` race-distance tags on `steps`/`run` is exactly the bug this replaces.
 */
function scoreMark(mark: MarkDefinition, tokens: string[], domains: Set<string>): number {
  let score = 0;
  const tags = mark.tags.map(t => t.toLowerCase());
  const identity = [mark.id, mark.name].map(s => s.toLowerCase());
  const inDomain = domains.has(mark.category);

  for (const token of tokens) {
    if (isCurrencyToken(token)) continue;
    // `5k` may only speak for marks in the domain the real words already chose.
    // Without this, "Save 5k" still scores `run`/`steps` on their race tags.
    if (isMagnitudeToken(token) && domains.size > 0 && !inDomain) continue;

    for (const tag of tags) {
      if (tag === token) score += 3;
      else if (isPrefixRelated(tag, token)) score += 2;
      // Multi-word tags match per word, never per substring: "down payment"
      // must match `payment`, while "parents" must NOT match `rent`.
      else if (tag.includes(' ') && tag.split(' ').some(w => isPrefixRelated(w, token))) score += 1;
    }
    // A mark's own name is a stronger signal than a merely related tag.
    for (const name of identity) {
      if (name === token) score += 4;
      else if (isPrefixRelated(name, token)) score += 2;
    }
  }
  return score;
}

/**
 * Ranking tier. Higher wins, and a tier gap is never crossed by score:
 *   2 — in-domain and matching the goal's words
 *   1 — out-of-domain but matching (e.g. `sleep` for a marathon goal)
 *   0 — in-domain filler with no word match (only used to top up to 5)
 */
function tierOf(inDomain: boolean, score: number): number {
  if (score > 0) return inDomain ? 2 : 1;
  return inDomain ? 0 : -1;
}

const FALLBACK_IDS = ['workout', 'focus', 'planning', 'sleep', 'water'];

export function getMarksForGoal(goalTitle: string): MarkDefinition[] {
  const tokens = tokenize(goalTitle);
  if (tokens.length === 0) return MARK_LIBRARY.slice(0, 3);

  const domains = inferDomains(tokens);

  const ranked = MARK_LIBRARY
    .map(mark => {
      const score = scoreMark(mark, tokens, domains);
      return { mark, score, tier: tierOf(domains.has(mark.category), score) };
    })
    .filter(({ tier }) => tier >= 0)
    // Ties break on mark id, never on MARK_LIBRARY array order.
    .sort((a, b) => b.tier - a.tier || b.score - a.score || a.mark.id.localeCompare(b.mark.id))
    .slice(0, MAX_SUGGESTIONS)
    .map(({ mark }) => mark);

  if (ranked.length > 0) return ranked;

  return FALLBACK_IDS
    .map(id => MARK_LIBRARY.find(m => m.id === id))
    .filter(Boolean) as MarkDefinition[];
}
