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

import { getSupabaseClient } from '../supabase';
import { MARK_LIBRARY } from '../suggestedCounters';
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
  /** Capped to 3 on activate */
  marks: AIGoalMark[];
};

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
  'calories', 'gratitude', 'journaling',
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
};

/** Resolves an AI icon string to the matching MARK_LIBRARY entry (emoji, color, id). */
export function resolveMarkForAIIcon(icon: string): {
  markId: string;
  emoji: string;
  color: string;
} {
  const markId = AI_ICON_TO_MARK_ID[icon as ValidIcon] ?? AI_ICON_TO_MARK_ID[FALLBACK_ICON];
  const mark = MARK_LIBRARY.find((m) => m.id === markId);
  return {
    markId,
    emoji: mark?.emoji ?? '🎯',
    color: mark?.color ?? '#4A6A8C',
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
 * - Marks array capped at 3 (free-tier activate cap)
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

  const validMarks: AIGoalMark[] = [];
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
    const icon: string = (VALID_ICONS as readonly string[]).includes(rawIcon)
      ? rawIcon
      : FALLBACK_ICON;

    validMarks.push({
      name: String(mark.name).trim(),
      icon,
      frequency,
      why: String(mark.why).trim(),
    });
  }

  if (validMarks.length === 0) return null;

  return {
    goalTitle: String(r.goalTitle).trim(),
    timeframeWeeks,
    confidence: r.confidence as 'high' | 'low',
    marks: validMarks.slice(0, 3),
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

// ─── Main entry point ─────────────────────────────────────────────────────────

export const MIN_GOAL_LENGTH = 10;

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
 * enforces the free-use gate server-side, calls Anthropic with a server-held
 * key, validates the contract, and increments ai_uses_count via service-role.
 *
 * Pass `isRegen: true` for regeneration calls. The Edge Function treats the
 * initial call + up to 2 regens as one free draft: regens bypass the gate and
 * do not increment ai_uses_count (the initial call already consumed the use).
 *
 * The client never sees the API key and cannot bypass the free-use gate.
 * The typed goal text is preserved on every failure path (caller keeps it).
 */
export async function generateGoalPackage(
  goalText: string,
  options: { isRegen?: boolean } = {},
): Promise<GenerationResult> {
  const trimmed = goalText.trim();
  if (trimmed.length < MIN_GOAL_LENGTH) {
    return { ok: false, reason: 'goal_too_short' };
  }

  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.functions.invoke('ai-goal-generation', {
      body: { goalText: trimmed, isRegen: options.isRegen ?? false },
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
