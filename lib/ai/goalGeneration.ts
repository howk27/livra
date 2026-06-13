/**
 * AI goal generation — Phase 4b.
 * Uses fetch directly (no SDK). Requires EXPO_PUBLIC_ANTHROPIC_API_KEY.
 *
 * Entry points:
 *   generateGoalPackage   — cache → API, with one silent retry
 *   validateAIGoalPackage — exported for tests
 *   writeGoalPackageCache — called on confirm+activate
 *   getAiUsesCount        — Supabase profile read
 *   incrementAiUsesCount  — called on confirm+activate
 *   resolveMarkForAIIcon  — icon → MARK_LIBRARY lookup for persist
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
  | 'no_api_key';

// ─── Valid icon list ──────────────────────────────────────────────────────────

/**
 * The exhaustive list of icon values the AI is allowed to return.
 * These map to entries in MARK_LIBRARY via AI_ICON_TO_MARK_ID.
 * Passed verbatim into the system prompt so the model is constrained.
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
 * Validates raw AI output against the AIGoalPackage contract.
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

// ─── System prompt ────────────────────────────────────────────────────────────

function buildSystemPrompt(): string {
  return `You are a goal-setting assistant for Livra, a habit tracking app. Given a user's goal description, suggest a structured goal package.

Valid icon values — use ONLY these exact strings: ${VALID_ICONS.join(', ')}

Respond with valid JSON matching this exact schema. No markdown. No explanation. JSON only:
{"goalTitle":"Clean specific goal title","timeframeWeeks":12,"confidence":"high","marks":[{"name":"Mark name","icon":"one_valid_icon","frequency":3,"why":"One sentence explaining why this helps the goal"}]}

Rules:
- goalTitle: specific and achievable, max 80 characters
- timeframeWeeks: integer 1–52
- confidence: "high" if you understand the goal clearly; "low" if it is unclear, unsafe, or contains multiple goals
- marks: 2–3 items; frequency is times per week (integer 1–7); icon MUST be one of the listed values
- why: one concrete sentence per mark
- For unclear/unsafe input: set confidence:"low" and still return a plausible package
- If multiple goals are given: scope to one; use "low" confidence`;
}

// ─── API call ─────────────────────────────────────────────────────────────────

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-haiku-4-5-20251001';
const REQUEST_TIMEOUT_MS = 14_000;

async function callAnthropicAPI(goalText: string): Promise<unknown> {
  const apiKey = process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY ?? '';
  if (!apiKey) throw new Error('no_api_key');

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 512,
        system: buildSystemPrompt(),
        messages: [{ role: 'user', content: `Goal: ${goalText}` }],
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    throw new Error(`api_http_${response.status}`);
  }

  const data = await response.json() as {
    content?: Array<{ type: string; text?: string }>;
  };
  const text = data.content?.[0]?.text;
  if (!text) throw new Error('empty_response');

  // throws SyntaxError on malformed JSON — triggers the silent retry
  return JSON.parse(text);
}

// ─── Semantic cache (Supabase ai_goal_packages) ───────────────────────────────

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

async function checkCache(normalizedText: string): Promise<AIGoalPackage | null> {
  if (!normalizedText) return null;
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('ai_goal_packages')
      .select('package_json')
      .eq('goal_text_normalized', normalizedText)
      .eq('confirmed', true)
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    return validateAIGoalPackage((data as Record<string, unknown>).package_json);
  } catch {
    return null;
  }
}

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

// ─── ai_uses_count (profiles table) ──────────────────────────────────────────

export async function getAiUsesCount(userId: string): Promise<number> {
  if (!userId) return 0;
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('profiles')
      .select('ai_uses_count')
      .eq('id', userId)
      .single();
    if (error || !data) return 0;
    return (data as { ai_uses_count?: number }).ai_uses_count ?? 0;
  } catch {
    return 0;
  }
}

/**
 * Increments ai_uses_count in the profiles table.
 * Called only on confirm+activate — NOT on failed/abandoned attempts.
 */
export async function incrementAiUsesCount(userId: string): Promise<void> {
  if (!userId) return;
  try {
    const supabase = getSupabaseClient();
    // Use rpc to avoid read-modify-write race; fallback to client-side if rpc missing
    const { error } = await supabase.rpc('increment_ai_uses_count', { p_user_id: userId });
    if (error) {
      // Graceful degradation: try direct update (may race on concurrent sessions)
      const { data } = await supabase
        .from('profiles')
        .select('ai_uses_count')
        .eq('id', userId)
        .single();
      const current = (data as { ai_uses_count?: number } | null)?.ai_uses_count ?? 0;
      await supabase
        .from('profiles')
        .update({ ai_uses_count: current + 1 })
        .eq('id', userId);
    }
  } catch (err) {
    logger.error('[goalGeneration] incrementAiUsesCount failed:', err);
  }
}

// ─── Main entry point ─────────────────────────────────────────────────────────

export const MIN_GOAL_LENGTH = 10;

/**
 * Attempts to generate an AIGoalPackage for the given goal text.
 *
 * Flow:
 *   1. Return cached result if a matching confirmed package exists.
 *   2. Check API key; fail fast with 'no_api_key' if missing.
 *   3. Call Anthropic API; on malformed-JSON/network error make one silent retry.
 *   4. Validate output contract; return 'invalid_output' if unsalvageable.
 *   5. Return 'low_confidence' if AI flagged the goal as unclear/unsafe.
 *
 * Does NOT write to cache or increment ai_uses_count — those happen on confirm+activate.
 */
export async function generateGoalPackage(goalText: string): Promise<GenerationResult> {
  const trimmed = goalText.trim();
  if (trimmed.length < MIN_GOAL_LENGTH) {
    return { ok: false, reason: 'goal_too_short' };
  }

  const normalized = normalizeGoalText(trimmed);

  // 1. Cache check
  const cached = await checkCache(normalized);
  if (cached) {
    return { ok: true, package: cached, source: 'cache' };
  }

  // 2. API key guard
  if (!process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY) {
    return { ok: false, reason: 'no_api_key' };
  }

  // 3. API call with one silent retry on any error
  let raw: unknown;
  try {
    raw = await callAnthropicAPI(trimmed);
  } catch (firstErr) {
    if (String(firstErr).includes('no_api_key')) {
      return { ok: false, reason: 'no_api_key' };
    }
    try {
      raw = await callAnthropicAPI(trimmed);
    } catch {
      return { ok: false, reason: 'network_error' };
    }
  }

  // 4. Validate output contract
  const pkg = validateAIGoalPackage(raw);
  if (!pkg) {
    return { ok: false, reason: 'invalid_output' };
  }

  // 5. Low-confidence → manual fallback
  if (pkg.confidence === 'low') {
    return { ok: false, reason: 'low_confidence' };
  }

  return { ok: true, package: pkg, source: 'api' };
}
