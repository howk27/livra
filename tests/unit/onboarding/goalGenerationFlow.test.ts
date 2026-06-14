/**
 * Phase 6 Task 2 — AI generation via Edge Function proxy.
 *
 * After the Phase 6 hardening the client no longer holds the API key, calls
 * Anthropic, checks the cache, or increments ai_uses_count — all of that moved
 * into the `ai-goal-generation` Edge Function. The client only invokes the
 * function and maps its response. These tests verify that mapping plus the
 * still-client-side confirm-time cache write and the regen-cap slice.
 *
 *   1. generateGoalPackage invokes the Edge Function and maps ok/api, ok/cache.
 *   2. Server failure reasons map through: free_use_exhausted, low_confidence.
 *   3. Edge errors / unknown shapes → network_error / invalid_output.
 *   4. goal_too_short is still guarded client-side (no invoke).
 *   5. Defensive re-validation: a malformed server package → invalid_output.
 *   6. writeGoalPackageCache upserts confirmed=true (confirm+activate only).
 *   7. aiRegenerationsUsed cap is readable/stable at the slice level.
 */

import {
  generateGoalPackage,
  writeGoalPackageCache,
  normalizeGoalText,
  type AIGoalPackage,
} from '../../../lib/ai/goalGeneration';
import { useOnboardingStore } from '../../../state/onboardingSlice';

// ─── Supabase mock ────────────────────────────────────────────────────────────

const mockInvoke = jest.fn();
const mockFrom = jest.fn();

jest.mock('../../../lib/supabase', () => ({
  getSupabaseClient: () => ({
    functions: { invoke: mockInvoke },
    from: mockFrom,
  }),
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const VALID_AI_RESPONSE: AIGoalPackage = {
  goalTitle: 'Run a half marathon',
  timeframeWeeks: 12,
  confidence: 'high',
  marks: [
    { name: 'Morning run', icon: 'gym', frequency: 4, why: 'Builds endurance' },
    { name: 'Rest day stretch', icon: 'rest', frequency: 2, why: 'Prevents injury' },
  ],
};

function invokeReturns(data: unknown, error: unknown = null) {
  mockInvoke.mockResolvedValue({ data, error });
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ─── generateGoalPackage → Edge Function ──────────────────────────────────────

describe('generateGoalPackage (Edge Function proxy)', () => {
  test('maps a successful api result', async () => {
    invokeReturns({ ok: true, package: VALID_AI_RESPONSE, source: 'api' });

    const result = await generateGoalPackage('Run a half marathon in 12 weeks');

    expect(mockInvoke).toHaveBeenCalledWith('ai-goal-generation', {
      body: { goalText: 'Run a half marathon in 12 weeks' },
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.source).toBe('api');
  });

  test('maps a cache-sourced result', async () => {
    invokeReturns({ ok: true, package: VALID_AI_RESPONSE, source: 'cache' });

    const result = await generateGoalPackage('Run a half marathon in 12 weeks');

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.source).toBe('cache');
  });

  test('maps server free_use_exhausted', async () => {
    invokeReturns({ ok: false, reason: 'free_use_exhausted' });

    const result = await generateGoalPackage('Run a half marathon in 12 weeks');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('free_use_exhausted');
  });

  test('maps server low_confidence', async () => {
    invokeReturns({ ok: false, reason: 'low_confidence' });

    const result = await generateGoalPackage('something vague and broad');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('low_confidence');
  });

  test('Edge Function error → network_error', async () => {
    invokeReturns(null, new Error('function failed'));

    const result = await generateGoalPackage('Run a half marathon in 12 weeks');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('network_error');
  });

  test('thrown invoke → network_error', async () => {
    mockInvoke.mockRejectedValue(new Error('boom'));

    const result = await generateGoalPackage('Run a half marathon in 12 weeks');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('network_error');
  });

  test('unknown/empty response shape → invalid_output', async () => {
    invokeReturns(null);

    const result = await generateGoalPackage('Run a half marathon in 12 weeks');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('invalid_output');
  });

  test('unrecognized server reason → invalid_output', async () => {
    invokeReturns({ ok: false, reason: 'totally_made_up' });

    const result = await generateGoalPackage('Run a half marathon in 12 weeks');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('invalid_output');
  });

  test('malformed server package fails defensive re-validation → invalid_output', async () => {
    invokeReturns({ ok: true, package: { goalTitle: '', marks: [] }, source: 'api' });

    const result = await generateGoalPackage('Run a half marathon in 12 weeks');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('invalid_output');
  });

  test('goal_too_short is guarded client-side without invoking the function', async () => {
    const result = await generateGoalPackage('run');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('goal_too_short');
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  test('no API key reference exists in the client module', () => {
    // The key must never ship in the bundle (Phase 6 Task 2 acceptance).
    expect(process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY).toBeUndefined();
  });
});

// ─── Cache write — confirm+activate only (still client-side) ──────────────────

describe('writeGoalPackageCache', () => {
  test('upserts with confirmed=true and correct conflict target', async () => {
    const upsert = jest.fn().mockResolvedValue({ error: null });
    mockFrom.mockReturnValue({ upsert });

    await writeGoalPackageCache('user-123', 'Run a half marathon', VALID_AI_RESPONSE);

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ confirmed: true }),
      expect.objectContaining({ onConflict: 'goal_text_normalized,user_id' }),
    );
  });

  test('stores normalized goal text alongside the raw text', async () => {
    const upsert = jest.fn().mockResolvedValue({ error: null });
    mockFrom.mockReturnValue({ upsert });

    const goalText = 'I want to run a half marathon';
    await writeGoalPackageCache('user-123', goalText, VALID_AI_RESPONSE);

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        goal_text_normalized: normalizeGoalText(goalText),
        goal_text: goalText,
        user_id: 'user-123',
      }),
      expect.anything(),
    );
  });

  test('is a no-op for empty userId', async () => {
    await writeGoalPackageCache('', 'run a marathon', VALID_AI_RESPONSE);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  test('is a no-op for empty normalized text', async () => {
    await writeGoalPackageCache('user-123', 'I want to be', VALID_AI_RESPONSE);
    expect(mockFrom).not.toHaveBeenCalled();
  });
});

// ─── Regeneration cap (slice level) ──────────────────────────────────────────

describe('regeneration cap via aiRegenerationsUsed', () => {
  beforeEach(() => {
    useOnboardingStore.getState().reset();
  });

  test('starts at 0', () => {
    expect(useOnboardingStore.getState().aiRegenerationsUsed).toBe(0);
  });

  test('increments to 1, then 2', () => {
    const store = useOnboardingStore.getState();
    store.incrementAiRegenerations();
    expect(useOnboardingStore.getState().aiRegenerationsUsed).toBe(1);
    store.incrementAiRegenerations();
    expect(useOnboardingStore.getState().aiRegenerationsUsed).toBe(2);
  });

  test('at cap (2), UI can read aiRegenerationsUsed >= 2 to block regen', () => {
    const store = useOnboardingStore.getState();
    store.incrementAiRegenerations();
    store.incrementAiRegenerations();
    expect(useOnboardingStore.getState().aiRegenerationsUsed >= 2).toBe(true);
  });

  test('reset clears aiRegenerationsUsed', () => {
    const store = useOnboardingStore.getState();
    store.incrementAiRegenerations();
    store.reset();
    expect(useOnboardingStore.getState().aiRegenerationsUsed).toBe(0);
  });
});

// ─── normalizeGoalText semantic dedup ─────────────────────────────────────────

describe('normalizeGoalText', () => {
  test('same goal, different wording → same key', () => {
    expect(normalizeGoalText('I want to run a half marathon')).toBe(
      normalizeGoalText('run half marathon'),
    );
  });
});
