/**
 * AI goal generation — Phase 4b + Phase 6 Task 2 (server proxy).
 *
 * The Anthropic call, the semantic cache lookup, the free-use gate, and the
 * ai_uses_count increment all live in the `ai-goal-generation` Supabase Edge
 * Function now. The API key is never in the client bundle. This module only:
 *   - calls the Edge Function and maps its response
 *   - keeps the pure helpers the UI needs (icon resolution, package validation,
 *     normalization) and the confirm-time cache write
 *
 * Entry points:
 *   generateGoalPackage   — invokes the Edge Function, maps result
 *   validateAIGoalPackage — defensive re-validation of the server package; tests
 *   writeGoalPackageCache — called on confirm+activate (marks the package cached)
 *   resolveMarkForAIIcon  — icon → MARK_LIBRARY lookup for persist
 *   normalizeGoalText     — semantic cache key (shared shape with the server)
 */

import { addDays, format } from 'date-fns';
import { getSupabaseClient } from '../supabase';
import { MARK_LIBRARY } from '../suggestedCounters';
import { colorForSuggestedCounter, getCategoryColor } from '../markCategory';
import { logger } from '../utils/logger';

// ─── Types ────────────────────────────────────────────────────────────────────

export type AIGoalMark = {
  name: string;
  /** Must be one of VALID_ICONS */
  icon: string;
  /** Times per week, 1–7 */
  frequency: number;
  /** One-line rationale shown in the review screen */
  why: string;
};

export type AIGoalPackage = {
  goalTitle: string;
  /** 1–52 */
  timeframeWeeks: number;
  /** 'low' → manual fallback, goal text preserved */
  confidence: 'high' | 'low';
  /** Capped to AI_PACKAGE_MAX_MARKS on validate/activate */
  marks: AIGoalMark[];
};

/**
 * Max marks kept in a validated AI package. Raised 3 → 4 (QC2-G, 2026-07-14):
 * the server now suggests 3–4 marks. Mirrors the Edge Function's cap; below the
 * free per-goal cap (FREE_MARKS_PER_GOAL = 5) so a full package always activates.
 */
export const AI_PACKAGE_MAX_MARKS = 4;

export type GenerationResult =
  | { ok: true; package: AIGoalPackage; source: 'api' | 'cache' }
  | { ok: false; reason: GenerationFailReason };

export type GenerationFailReason =
  | 'goal_too_short'
  | 'low_confidence'
  | 'network_error'
  | 'invalid_output'
  /** Server free-use gate: non-Pro user has already spent their free generation. */
  | 'free_use_exhausted';

// ─── Valid icon list ──────────────────────────────────────────────────────────

/**
 * The exhaustive list of icon values the AI is allowed to return.
 * These map to entries in MARK_LIBRARY via AI_ICON_TO_MARK_ID.
 * Mirrors the same list in the Edge Function system prompt.
 */
export const VALID_ICONS = [
  'gym', 'sleep', 'reading', 'meditation', 'water', 'study',
  'focus', 'tasks', 'planning', 'language', 'rest', 'steps',
  'calories', 'gratitude', 'journaling', 'run', 'stretch', 'nutrition',
  'meal-prep', 'breathwork', 'wake-early', 'no-alcohol', 'screen-time',
  'finance', 'saving', 'socialize', 'family', 'creative', 'writing',
] as const;

export type ValidIcon = typeof VALID_ICONS[number];

const FALLBACK_ICON: ValidIcon = 'focus';

/** Maps each AI icon key to the closest MARK_LIBRARY id. */
export const AI_ICON_TO_MARK_ID: Record<ValidIcon, string> = {
  gym:        'workout',
  sleep:      'sleep',
  reading:    'reading',
  meditation: 'meditation',
  water:      'water',
  study:      'study',
  focus:      'focus',
  tasks:      'planning',
  planning:   'planning',
  language:   'language',
  rest:       'rest',
  steps:      'steps',
  calories:   'calories',
  gratitude:  'gratitude',
  journaling: 'journaling',
  run:           'run',
  stretch:       'stretch',
  nutrition:     'nutrition',
  'meal-prep':   'meal-prep',
  breathwork:    'breathwork',
  'wake-early':  'wake-early',
  'no-alcohol':  'no-alcohol',
  'screen-time': 'screen-time',
  finance:       'finance',
  saving:        'saving',
  socialize:     'socialize',
  family:        'family',
  creative:      'creative',
  writing:       'writing',
};

/**
 * Effort-category collapse (spec 2026-07-11, narrowed 2026-07-12): two marks
 * one single activity satisfies must not coexist. Confirmed-overlap pairs only;
 * icons not listed are always kept (gym + steps are distinct efforts and may
 * coexist — run/steps-style overlaps are handled by the system prompt's prose
 * distinctness rule instead). Applied in validateAIGoalPackage — first mark
 * per category wins.
 */
export const AI_ICON_EFFORT_CATEGORY: Partial<Record<ValidIcon, string>> = {
  gratitude: 'reflection',
  journaling: 'reflection',
  focus: 'deep-work',
  study: 'deep-work',
  // One sit satisfies both — a breathing session is a meditation.
  meditation: 'calm',
  breathwork: 'calm',
  // "Eat the way I intended" and "prep meals ahead" are the same eating
  // discipline; the model kept surfacing both in one goal.
  nutrition: 'nutrition',
  'meal-prep': 'nutrition',
  // NOTE deliberately NOT collapsed: run/steps/swim/cycling (a triathlon needs
  // them distinct) and finance/saving/invest/no-spend (distinct money efforts).
  // Those softer overlaps are left to the system prompt's prose distinctness rule.
};

/** Resolves an AI icon string to the matching MARK_LIBRARY entry (emoji, color, id, name). */
export function resolveMarkForAIIcon(icon: string): {
  markId: string;
  emoji: string;
  color: string;
  /** The library's canonical name (2026-07-19 founder decision: AI marks show
   * the library name, not the model's free-text — see validateAIGoalPackage). */
  name: string;
} {
  const markId = AI_ICON_TO_MARK_ID[icon as ValidIcon] ?? AI_ICON_TO_MARK_ID[FALLBACK_ICON];
  const mark = MARK_LIBRARY.find((m) => m.id === markId);
  return {
    markId,
    emoji: mark?.emoji ?? '🎯',
    // QC4-M: sanctioned accents only. An unknown markId falls back to the
    // `custom` accent rather than a hardcoded hex.
    color: mark ? colorForSuggestedCounter(mark) : getCategoryColor('custom'),
    name: mark?.name ?? 'Focus',
  };
}

// ─── Validation ───────────────────────────────────────────────────────────────

/**
 * Validates a package against the AIGoalPackage contract.
 *
 * The Edge Function validates server-side too; this re-validation is a defensive
 * guard on whatever the function returns (and the cache read), so the client
 * never trusts an unvalidated shape.
 *
 * Repair rules:
 * - Off-model icon → replaced with FALLBACK_ICON (not dropped)
 * - Marks with frequency out of 1–7 → dropped
 * - Marks with missing name/why → dropped
 * - Marks array capped at AI_PACKAGE_MAX_MARKS (4). Legacy 2–3-mark packages
 *   (pre-QC2-G server, or cache rows written before the founder redeploys the
 *   Edge Function) still validate — the minimum is 1 salvageable mark.
 *
 * Returns null if the package cannot be salvaged (no valid marks, bad envelope).
 */
export function validateAIGoalPackage(raw: unknown): AIGoalPackage | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;

  if (typeof r.goalTitle !== 'string' || !r.goalTitle.trim()) return null;

  const rawWeeks = r.timeframeWeeks;
  if (typeof rawWeeks !== 'number' || !Number.isFinite(rawWeeks)) return null;
  const timeframeWeeks = Math.round(rawWeeks);
  if (timeframeWeeks < 1 || timeframeWeeks > 52) return null;

  if (r.confidence !== 'high' && r.confidence !== 'low') return null;

  if (!Array.isArray(r.marks)) return null;

  const validMarks: (AIGoalMark & { __repaired?: boolean })[] = [];
  for (const m of r.marks as unknown[]) {
    if (!m || typeof m !== 'object') continue;
    const mark = m as Record<string, unknown>;

    if (typeof mark.name !== 'string' || !String(mark.name).trim()) continue;
    if (typeof mark.why !== 'string') continue;

    const rawFreq = mark.frequency;
    if (typeof rawFreq !== 'number' || !Number.isFinite(rawFreq)) continue;
    const frequency = Math.round(rawFreq);
    if (frequency < 1 || frequency > 7) continue;

    // Icon: repair if not in valid set
    const rawIcon = typeof mark.icon === 'string' ? mark.icon : '';
    const repaired = !(VALID_ICONS as readonly string[]).includes(rawIcon);
    const icon: string = repaired ? FALLBACK_ICON : rawIcon;

    validMarks.push({
      name: String(mark.name).trim(),
      icon,
      frequency,
      why: String(mark.why).trim(),
      ...(repaired ? { __repaired: true } : {}),
    });
  }

  // Effort-category collapse: one real-world activity never appears as two marks.
  // Then canonicalize each mark to its library name and dedupe by library id, so
  // AI free-text names (and any junk/emoji) never reach the UI or persistence
  // (founder decision 2026-07-19: AI marks show the library's canonical name).
  const seenCategories = new Set<string>();
  const seenMarkIds = new Set<string>();
  const distinctMarks: AIGoalMark[] = [];
  for (const m of validMarks) {
    const category = m.__repaired ? undefined : AI_ICON_EFFORT_CATEGORY[m.icon as ValidIcon];
    if (category) {
      if (seenCategories.has(category)) continue;
      seenCategories.add(category);
    }
    const resolved = resolveMarkForAIIcon(m.icon);
    if (seenMarkIds.has(resolved.markId)) continue;
    seenMarkIds.add(resolved.markId);
    const { __repaired: _repaired, ...rest } = m;
    distinctMarks.push({ ...rest, name: resolved.name });
  }

  if (distinctMarks.length === 0) return null;

  return {
    goalTitle: String(r.goalTitle).trim(),
    timeframeWeeks,
    confidence: r.confidence as 'high' | 'low',
    marks: distinctMarks.slice(0, AI_PACKAGE_MAX_MARKS),
  };
}

// ─── Semantic cache key ────────────────────────────────────────────────────────
// Must stay byte-for-byte identical to the Edge Function's normalizer so a
// confirm-time client write lines up with the server-side cache lookup.

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'to', 'i', 'my', 'want', 'get',
  'be', 'do', 'make', 'become', 'have', 'of', 'in', 'for',
]);

export function normalizeGoalText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w))
    .sort()
    .join(' ')
    .trim();
}

// ─── Cache write (ai_goal_packages) ────────────────────────────────────────────
// Written by the client on confirm+activate. RLS scopes rows to the user; the
// Edge Function reads these (confirmed=true) before spending an Anthropic call.

export async function writeGoalPackageCache(
  userId: string,
  goalText: string,
  pkg: AIGoalPackage,
): Promise<void> {
  const normalized = normalizeGoalText(goalText);
  if (!normalized || !userId) return;
  try {
    const supabase = getSupabaseClient();
    await supabase.from('ai_goal_packages').upsert(
      {
        user_id: userId,
        goal_text: goalText,
        goal_text_normalized: normalized,
        package_json: pkg as unknown as Record<string, unknown>,
        confirmed: true,
      },
      { onConflict: 'goal_text_normalized,user_id' },
    );
  } catch (err) {
    logger.error('[goalGeneration] cache write failed:', err);
  }
}

// ─── Projected finish date (client-owned calendar math) ────────────────────────
// QC3-C: the model returns an honest `timeframeWeeks`; the client owns the
// calendar so no stale/hallucinated absolute date ever ships from the model.
// today + weeks*7 days → the goal's target_date and the review readiness line.

/** The projected Date the user will be ready, from now + timeframeWeeks*7 days. */
export function projectedFinishDate(timeframeWeeks: number, from: Date = new Date()): Date {
  const days = Math.max(0, Math.round(timeframeWeeks)) * 7;
  return addDays(from, days);
}

/** Projected finish date as a `yyyy-MM-dd` string for goal.target_date storage. */
export function deriveTargetDate(timeframeWeeks: number, from: Date = new Date()): string {
  return format(projectedFinishDate(timeframeWeeks, from), 'yyyy-MM-dd');
}

/**
 * Readiness line for the review/commit step:
 * "You'll be ready to {goal} by {Mon D, YYYY}." (no dash-as-dash; `·` reserved
 * for the mark rows). The date is derived, never model-emitted.
 */
export function buildReadinessLine(
  goalTitle: string,
  timeframeWeeks: number,
  from: Date = new Date(),
): string {
  const dateLabel = format(projectedFinishDate(timeframeWeeks, from), 'MMM d, yyyy');
  return `You'll be ready to ${goalTitle.trim()} by ${dateLabel}.`;
}

// ─── Main entry point ─────────────────────────────────────────────────────────

/**
 * Minimum trimmed length for a goal to clear the pre-generation gate.
 * Lowered 10 → 4 (QC3-B, 2026-07-15): the old floor rejected terse-but-real
 * goals like "save 10k" (8 chars) and "read" (4). The gate now pairs a short
 * length floor with a real-word check (see meetsGoalTextGate) so single
 * characters and all-initials strings still bounce, but concrete short goals
 * pass through to the model.
 */
export const MIN_GOAL_LENGTH = 4;

/**
 * Whether goalText clears the client-side gate before we spend a generation:
 * at least MIN_GOAL_LENGTH characters AND at least one real word (a run of 2+
 * non-space characters). Empty/whitespace-only, single characters, and
 * all-single-letter strings ("a b c") fail; "save 10k", "read", "learn" pass.
 */
export function meetsGoalTextGate(goalText: string): boolean {
  const trimmed = goalText.trim();
  if (trimmed.length < MIN_GOAL_LENGTH) return false;
  return trimmed.split(/\s+/).some((word) => word.length >= 2);
}

/** Shape returned by the ai-goal-generation Edge Function. */
type EdgeResponse =
  | { ok: true; package: unknown; source?: 'api' | 'cache' }
  | { ok: false; reason?: string };

const KNOWN_FAIL_REASONS: ReadonlySet<string> = new Set([
  'goal_too_short',
  'low_confidence',
  'network_error',
  'invalid_output',
  'free_use_exhausted',
]);

/**
 * Generates an AIGoalPackage by invoking the `ai-goal-generation` Edge Function.
 *
 * The function authenticates the caller (JWT), checks the per-user cache,
 * enforces the free-use gate server-side, calls the model with a server-held
 * key, validates the contract, and increments ai_uses_count via service-role.
 *
 * The client never sees the API key and cannot bypass the free-use gate.
 * Every generation (including regenerations) counts as a use for non-Pro users.
 * The typed goal text is preserved on every failure path (caller keeps it).
 *
 * `context` (QC3-C): optional free-text the user gives about their experience,
 * time, or a deadline. Trimmed and capped to CONTEXT_MAX_LENGTH here (the edge
 * fn re-caps defensively); the server uses it to set a REALISTIC timeframe.
 */
export const CONTEXT_MAX_LENGTH = 400;

export async function generateGoalPackage(
  goalText: string,
  context?: string,
): Promise<GenerationResult> {
  const trimmed = goalText.trim();
  if (!meetsGoalTextGate(trimmed)) {
    return { ok: false, reason: 'goal_too_short' };
  }

  const trimmedContext = (context ?? '').trim().slice(0, CONTEXT_MAX_LENGTH);

  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.functions.invoke('ai-goal-generation', {
      body: {
        goalText: trimmed,
        ...(trimmedContext ? { context: trimmedContext } : {}),
      },
    });

    if (error) {
      logger.error('[goalGeneration] edge function error:', error);
      return { ok: false, reason: 'network_error' };
    }

    if (!data || typeof data !== 'object') {
      return { ok: false, reason: 'invalid_output' };
    }

    const res = data as EdgeResponse;

    if (res.ok === true) {
      // Defensive: never trust an unvalidated package from the wire.
      const pkg = validateAIGoalPackage(res.package);
      if (!pkg) return { ok: false, reason: 'invalid_output' };
      return { ok: true, package: pkg, source: res.source === 'cache' ? 'cache' : 'api' };
    }

    const reason = typeof res.reason === 'string' && KNOWN_FAIL_REASONS.has(res.reason)
      ? (res.reason as GenerationFailReason)
      : 'invalid_output';
    return { ok: false, reason };
  } catch (err) {
    logger.error('[goalGeneration] generateGoalPackage failed:', err);
    return { ok: false, reason: 'network_error' };
  }
}
