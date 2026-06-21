// Supabase Edge Function — Phase 6 Task 2: AI goal generation proxy.
//
// Why this exists (AUDIT_LOG.md, Phase 6 Task 1 audit, findings B & C):
//   - The OpenAI key used to ship in the client bundle (EXPO_PUBLIC_*) and the
//     request went straight to api.openai.com → a billable key anyone could
//     extract, on an unmetered endpoint.
//   - ai_uses_count was incremented client-side but never *gated*, so a modified
//     client could call the model unbounded.
//
// This function moves all of that server-side:
//   - OPENAI_API_KEY lives in Supabase secrets (Deno.env), never the client.
//   - The caller is authenticated via the JWT in the Authorization header.
//   - The free-use gate is enforced here, before the OpenAI call.
//   - ai_uses_count is incremented via the service-role client, which bypasses
//     the profiles column-guard trigger (Task 1) — the same pattern
//     validate-iap-receipt uses to write pro_unlocked.
//
// Deploy:  supabase functions deploy ai-goal-generation
// Secrets: supabase secrets set OPENAI_API_KEY=sk-...
//          (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically.)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ─── Constants (kept in sync with lib/ai/goalGeneration.ts) ────────────────────

const VALID_ICONS = [
  'gym', 'sleep', 'reading', 'meditation', 'water', 'study',
  'focus', 'tasks', 'planning', 'language', 'rest', 'steps',
  'calories', 'gratitude', 'journaling',
] as const;
const FALLBACK_ICON = 'focus';

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const MODEL = 'gpt-4o-mini';
const REQUEST_TIMEOUT_MS = 14_000;
const MIN_GOAL_LENGTH = 10;

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'to', 'i', 'my', 'want', 'get',
  'be', 'do', 'make', 'become', 'have', 'of', 'in', 'for',
]);

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// ─── Types ─────────────────────────────────────────────────────────────────────

type AIGoalMark = { name: string; icon: string; frequency: number; why: string };
type AIGoalPackage = {
  goalTitle: string;
  timeframeWeeks: number;
  confidence: 'high' | 'low';
  marks: AIGoalMark[];
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

function normalizeGoalText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w))
    .sort()
    .join(' ')
    .trim();
}

function validateAIGoalPackage(raw: unknown): AIGoalPackage | null {
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
    const rawIcon = typeof mark.icon === 'string' ? mark.icon : '';
    const icon = (VALID_ICONS as readonly string[]).includes(rawIcon) ? rawIcon : FALLBACK_ICON;
    validMarks.push({ name: String(mark.name).trim(), icon, frequency, why: String(mark.why).trim() });
  }

  if (validMarks.length === 0) return null;

  return {
    goalTitle: String(r.goalTitle).trim(),
    timeframeWeeks,
    confidence: r.confidence as 'high' | 'low',
    marks: validMarks.slice(0, 3),
  };
}

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

async function callOpenAI(goalText: string, apiKey: string): Promise<unknown> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 512,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: buildSystemPrompt() },
          { role: 'user', content: `Goal: ${goalText}` },
        ],
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) throw new Error(`api_http_${response.status}`);

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error('empty_response');
  return JSON.parse(text); // throws on malformed JSON → triggers the one retry
}

// ─── Handler ─────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') {
    return json(405, { ok: false, reason: 'invalid_output' });
  }

  // Auth: require a bearer JWT.
  const authHeader = req.headers.get('Authorization') ?? '';
  const jwt = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!jwt) return json(401, { error: 'unauthenticated' });

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
  const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY') ?? '';
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return json(500, { ok: false, reason: 'network_error' });
  }

  // Same init pattern as validate-iap-receipt: service-role client.
  // It bypasses RLS and the profiles column-guard trigger (current_user = 'service_role').
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Resolve the caller from their JWT.
  const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
  const user = userData?.user;
  if (userErr || !user) return json(401, { error: 'unauthenticated' });

  // Parse body.
  let goalText = '';
  let isRegen = false;
  try {
    const body = await req.json();
    goalText = String(body?.goalText ?? '').trim();
    isRegen = body?.isRegen === true;
  } catch {
    return json(400, { ok: false, reason: 'invalid_output' });
  }
  if (goalText.length < MIN_GOAL_LENGTH) {
    return json(200, { ok: false, reason: 'goal_too_short' });
  }

  const normalized = normalizeGoalText(goalText);

  // 1. Cache check (per-user, confirmed) — free, no model cost, no gate.
  if (normalized) {
    const { data: cacheRow } = await admin
      .from('ai_goal_packages')
      .select('package_json')
      .eq('user_id', user.id)
      .eq('goal_text_normalized', normalized)
      .eq('confirmed', true)
      .limit(1)
      .maybeSingle();
    if (cacheRow) {
      const cached = validateAIGoalPackage((cacheRow as Record<string, unknown>).package_json);
      if (cached) return json(200, { ok: true, package: cached, source: 'cache' });
    }
  }

  // 2. Read entitlement + usage.
  const { data: profile } = await admin
    .from('profiles')
    .select('pro_unlocked, ai_uses_count')
    .eq('id', user.id)
    .single();
  const isPro = !!(profile as { pro_unlocked?: boolean } | null)?.pro_unlocked;
  const usesCount = (profile as { ai_uses_count?: number } | null)?.ai_uses_count ?? 0;

  // 3. Free-use gate (server-enforced). Pro bypasses; "1 free ever" otherwise.
  //    Regenerations (isRegen=true) are part of the same free draft session:
  //    the initial call already incremented the counter, so regens pass through
  //    without consuming an additional use. An exhausted non-regen caller is
  //    blocked as before.
  if (!isPro && usesCount >= 1 && !isRegen) {
    return json(200, { ok: false, reason: 'free_use_exhausted' });
  }

  // 4. Misconfiguration guard — soft failure → client offers manual fallback.
  if (!OPENAI_API_KEY) {
    console.error('[ai-goal-generation] OPENAI_API_KEY not set');
    return json(200, { ok: false, reason: 'network_error' });
  }

  // 5. OpenAI call with one silent retry on any error.
  let raw: unknown;
  try {
    raw = await callOpenAI(goalText, OPENAI_API_KEY);
  } catch {
    try {
      raw = await callOpenAI(goalText, OPENAI_API_KEY);
    } catch {
      return json(200, { ok: false, reason: 'network_error' });
    }
  }

  // 6. Validate contract.
  const pkg = validateAIGoalPackage(raw);
  if (!pkg) return json(200, { ok: false, reason: 'invalid_output' });

  // Low confidence → manual fallback. Free use is NOT consumed (user can retry).
  if (pkg.confidence === 'low') {
    return json(200, { ok: false, reason: 'low_confidence' });
  }

  // 7. Consume one free use (non-Pro, initial call only) via service-role.
  //    Regens are free within the same draft session — the initial call already
  //    incremented ai_uses_count, so we skip the increment for regens.
  //    Prefer the atomic RPC; fall back to a direct update. Both run as
  //    service_role, so the Task 1 profiles trigger guard permits the write.
  if (!isPro && !isRegen) {
    const { error: rpcErr } = await admin.rpc('increment_ai_uses_count', { p_user_id: user.id });
    if (rpcErr) {
      await admin.from('profiles').update({ ai_uses_count: usesCount + 1 }).eq('id', user.id);
    }
  }

  return json(200, { ok: true, package: pkg, source: 'api' });
});
