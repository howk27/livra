import { categoryAccents } from '../theme/tokens';
import type { SuggestedCounter } from './suggestedCounters';
import type { Mark } from '../types';
import type { MarkType } from '@/src/types/counters';

/**
 * QC4-M — one taxonomy, one palette.
 *
 * This module used to carry a fourth, invented taxonomy (Productivity |
 * Fitness | Wellness | Learning | Lifestyle) with five bright hex literals of
 * its own (`#F97316` = Tailwind orange-500, `#3B82F6`, …). Marks previewed in
 * their authored muted color and then SAVED in one of those five brights — the
 * thing you built was not the thing you got.
 *
 * `categoryAccents` (theme/tokens.ts) is the sanctioned palette and the only
 * source of mark color. A category here is a KEY into it, never a hex literal:
 * there is no hex in this file, by construction.
 *
 * The buckets are the app's real taxonomy — `MARK_LIBRARY.category` in
 * lib/suggestedCounters.ts, the same 9 strings components/ui/MarkRow.tsx's
 * CATEGORY_MAP already renders — plus `email` / `planning` / `custom`, which
 * CATEGORY_MAP also carries. Saved color and rendered accent are now the same
 * value resolved from the same table.
 */
export type MarkCategory = keyof typeof categoryAccents;

/** Display name for a category key. The picker shows this; storage never does. */
export const CATEGORY_LABELS: Record<MarkCategory, string> = {
  recovery: 'Recovery',
  fitness: 'Fitness',
  health: 'Health',
  mindset: 'Mindset',
  deepWork: 'Deep Work',
  creative: 'Creative',
  discipline: 'Discipline',
  relationships: 'Relationships',
  finance: 'Finance',
  email: 'Email',
  planning: 'Planning',
  custom: 'Custom',
};

/**
 * MARK_LIBRARY.category (the real 9) → sanctioned accent key. Every one of the
 * nine has a sanctioned accent, so nothing here falls back — but an unknown
 * category string (a future library entry) resolves to `custom` rather than
 * inventing a color.
 */
const LIBRARY_CATEGORY_TO_KEY: Record<string, MarkCategory> = {
  Recovery: 'recovery',
  Fitness: 'fitness',
  Health: 'health',
  Mindset: 'mindset',
  'Deep Work': 'deepWork',
  Finance: 'finance',
  Discipline: 'discipline',
  Relationships: 'relationships',
  Creative: 'creative',
};

/**
 * Picker icon → category key, for marks the user builds by hand (no library
 * entry to read a category off).
 *
 * Each row matches what the app RENDERS for that icon, so a custom mark's
 * stored color equals the accent its row shows. The library entry sharing the
 * icon's emoji decides: `sleep` (🌙) resolves to library Sleep = Recovery, so
 * sleep → recovery, not a "Wellness" guess. `planning` (🗓️) resolves to
 * library Planning = Deep Work, which is why it is deepWork here and not the
 * `planning` accent — see the report.
 */
const ICON_CATEGORY_MAP: Record<Exclude<MarkType, 'custom'>, MarkCategory> = {
  // body
  gym: 'fitness',
  steps: 'fitness',
  // health
  calories: 'health',
  water: 'health',
  no_sugar: 'health',
  no_beer: 'health',
  no_smoking: 'health',
  soda_free: 'health',
  // recovery
  sleep: 'recovery',
  rest: 'recovery',
  // mind
  meditation: 'mindset',
  mood: 'mindset',
  journaling: 'mindset',
  gratitude: 'mindset',
  // work / learning
  reading: 'deepWork',
  study: 'deepWork',
  language: 'deepWork',
  focus: 'deepWork',
  tasks: 'deepWork',
  planning: 'deepWork',
  email: 'email',
  // the rest
  screen_free: 'discipline',
  no_spending: 'finance',
};

/**
 * Keyword → category key for a mark with no library entry and no stored color
 * (legacy rows, renamed marks). Ordered: the first entry whose keyword appears
 * in the name wins, so the narrow buckets (email, planning, finance) are tried
 * before the broad ones.
 */
const CATEGORY_KEYWORDS: Array<[MarkCategory, string[]]> = [
  ['email', ['email', 'inbox', 'mail']],
  ['finance', ['money', 'budget', 'saving', 'spend', 'invest', 'finance', 'debt']],
  ['relationships', ['family', 'friend', 'social', 'partner', 'call ', 'network']],
  ['creative', ['draw', 'paint', 'music', 'art', 'design', 'creative']],
  ['fitness', ['gym', 'run', 'step', 'walk', 'workout', 'exercise', 'lift', 'training', 'cycl', 'swim']],
  ['health', ['water', 'hydrate', 'calorie', 'nutrition', 'meal', 'sugar', 'alcohol', 'beer', 'smok', 'soda', 'vitamin']],
  ['recovery', ['sleep', 'rest', 'nap', 'stretch', 'recover', 'mobility']],
  ['mindset', ['meditat', 'mindful', 'mood', 'journal', 'gratitude', 'breath', 'affirm']],
  ['discipline', ['screen', 'phone', 'cold shower', 'wake', 'posture', 'habit', 'routine']],
  ['deepWork', ['focus', 'task', 'deep work', 'study', 'read', 'learn', 'language', 'book', 'course', 'writ', 'plan', 'work', 'meeting']],
];

function normalizeLabel(value: string): string {
  return value.trim().toLowerCase();
}

function categoryFromKeywords(value: string): MarkCategory {
  const name = normalizeLabel(value);
  for (const [category, keywords] of CATEGORY_KEYWORDS) {
    if (keywords.some((keyword) => name.includes(keyword))) return category;
  }
  return 'custom';
}

/** The sanctioned accent for a category key. The ONLY way color leaves here. */
export function getCategoryColor(category: MarkCategory): string {
  return categoryAccents[category];
}

export function getCategoryForIcon(iconType: Exclude<MarkType, 'custom'>): MarkCategory {
  return ICON_CATEGORY_MAP[iconType] ?? 'custom';
}

/**
 * A library mark's category — read off the entry itself, not guessed from its
 * name. The old keyword guess is what sent "Steps" through a `Fitness` bucket
 * that painted it orange-500.
 */
export function getCategoryForSuggestedCounter(counter: SuggestedCounter): MarkCategory {
  return LIBRARY_CATEGORY_TO_KEY[counter.category] ?? 'custom';
}

/**
 * QC4-M: THE contract between preview and save for a library mark. Both the
 * popular chip in app/mark/new.tsx and the record it writes call this — one
 * function, so they cannot drift apart again.
 */
export function colorForSuggestedCounter(counter: SuggestedCounter): string {
  return getCategoryColor(getCategoryForSuggestedCounter(counter));
}

export function getCategoryForMark(mark: Pick<Mark, 'name' | 'color'>): MarkCategory {
  return categoryFromKeywords(mark.name || '');
}

const SANCTIONED_COLORS: ReadonlySet<string> = new Set(
  Object.values(categoryAccents).map(hex => hex.toLowerCase())
);

/**
 * True only for a hex that is currently in `categoryAccents`.
 *
 * A whitelist, deliberately — not a blacklist of the legacy hexes. Marks saved
 * before QC4-M carry a dead value: either one of the five invented generics
 * (`#F97316`, `#3B82F6`, …) or a hand-picked one from the old "Vibe" grid that
 * VD-7 deleted. Listing those would rot the moment another stale value turns up;
 * asking "is this a color we still sanction?" cannot.
 */
function isSanctionedColor(color: string | null | undefined): boolean {
  return !!color && SANCTIONED_COLORS.has(color.toLowerCase());
}

/**
 * Render color for a stored mark. QC4-M made new marks save a sanctioned accent,
 * but marks written BEFORE it kept their dead hex and `mark.color ||` handed it
 * straight back — so old marks stayed bright while new ones went muted, in the
 * same list. Heals on READ: an unsanctioned stored color is ignored and the
 * category-derived accent is used instead.
 *
 * Read, not a data migration: nothing is rewritten, so this reverses by deleting
 * the check. The cost is that a color hand-picked from the old Vibe grid is also
 * replaced — four of its six swatches were byte-identical to the machine
 * defaults, so a deliberate pick is genuinely indistinguishable from a derived
 * one. VD-7 already settled that direction: color is category-derived, not chosen.
 */
export function getCategoryColorForMark(mark: Pick<Mark, 'name' | 'color'>): string {
  if (isSanctionedColor(mark.color)) return mark.color as string;
  return getCategoryColor(getCategoryForMark(mark));
}
