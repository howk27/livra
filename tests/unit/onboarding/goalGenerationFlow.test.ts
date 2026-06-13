/**
 * Phase 4b Task 2 — Free-use, cache, regen cap tests.
 *
 * Tests verify:
 *   1. Cache is checked before any API call — cache hit skips fetch.
 *   2. Failed/abandoned generations do NOT increment ai_uses_count
 *      (generateGoalPackage never calls incrementAiUsesCount).
 *   3. incrementAiUsesCount and writeGoalPackageCache are separate functions
 *      called only on confirm+activate — not wired into generation.
 *   4. aiRegenerationsUsed cap: slice enforces the count; at 2 the UI
 *      must block — verified that the slice value is stable and readable.
 *   5. normalizeGoalText semantic dedup: same goal → same key → cache hit avoids
 *      second API call.
 */

import {
  generateGoalPackage,
  writeGoalPackageCache,
  incrementAiUsesCount,
  getAiUsesCount,
  normalizeGoalText,
  type AIGoalPackage,
} from '../../../lib/ai/goalGeneration';
import { useOnboardingStore } from '../../../state/onboardingSlice';

// ─── Supabase mock ────────────────────────────────────────────────────────────

const mockFrom = jest.fn();
const mockRpc = jest.fn();

jest.mock('../../../lib/supabase', () => ({
  getSupabaseClient: () => ({
    from: mockFrom,
    rpc: mockRpc,
  }),
}));

// ─── Fetch mock ───────────────────────────────────────────────────────────────

const VALID_AI_RESPONSE: AIGoalPackage = {
  goalTitle: 'Run a half marathon',
  timeframeWeeks: 12,
  confidence: 'high',
  marks: [
    { name: 'Morning run', icon: 'gym', frequency: 4, why: 'Builds endurance' },
    { name: 'Rest day stretch', icon: 'rest', frequency: 2, why: 'Prevents injury' },
  ],
};

function mockFetchSuccess(pkg: AIGoalPackage) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ content: [{ type: 'text', text: JSON.stringify(pkg) }] }),
  } as Response);
}

function mockFetchNetworkError() {
  global.fetch = jest.fn().mockRejectedValue(new Error('network error'));
}

function mockFetchHttpError(status = 500) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: false,
    status,
    json: async () => ({}),
  } as Response);
}

/** Build the supabase query chain mock: .from().select().eq().eq().limit().maybeSingle() */
function setupCacheMiss() {
  const maybeSingle = jest.fn().mockResolvedValue({ data: null, error: null });
  const limit = jest.fn().mockReturnValue({ maybeSingle });
  const eq2 = jest.fn().mockReturnValue({ limit });
  const eq1 = jest.fn().mockReturnValue({ eq: eq2 });
  const select = jest.fn().mockReturnValue({ eq: eq1 });
  mockFrom.mockReturnValue({ select });
}

function setupCacheHit(pkg: AIGoalPackage) {
  const maybeSingle = jest.fn().mockResolvedValue({ data: { package_json: pkg }, error: null });
  const limit = jest.fn().mockReturnValue({ maybeSingle });
  const eq2 = jest.fn().mockReturnValue({ limit });
  const eq1 = jest.fn().mockReturnValue({ eq: eq2 });
  const select = jest.fn().mockReturnValue({ eq: eq1 });
  mockFrom.mockReturnValue({ select });
}

// ─── Env setup ────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY = 'test-key';
});

// ─── Cache-before-call ────────────────────────────────────────────────────────

describe('cache check before API call', () => {
  test('cache hit returns package without calling fetch', async () => {
    setupCacheHit(VALID_AI_RESPONSE);
    mockFetchSuccess(VALID_AI_RESPONSE);

    const result = await generateGoalPackage('Run a half marathon in 12 weeks');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.source).toBe('cache');
    }
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('cache miss proceeds to API call', async () => {
    setupCacheMiss();
    mockFetchSuccess(VALID_AI_RESPONSE);

    const result = await generateGoalPackage('Run a half marathon in 12 weeks');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.source).toBe('api');
    }
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test('same goal text (different wording) hits cache via normalization', () => {
    const a = normalizeGoalText('I want to run a half marathon');
    const b = normalizeGoalText('run half marathon');
    expect(a).toBe(b);
  });

  test('cache error is swallowed and proceeds to API call', async () => {
    // Simulate checkCache throwing (e.g. supabase unavailable)
    mockFrom.mockImplementation(() => {
      throw new Error('db down');
    });
    mockFetchSuccess(VALID_AI_RESPONSE);

    const result = await generateGoalPackage('Run a half marathon in 12 weeks');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.source).toBe('api');
    }
  });
});

// ─── Free-use accounting ──────────────────────────────────────────────────────

describe('free-use accounting', () => {
  test('generateGoalPackage does NOT call incrementAiUsesCount (RPC)', async () => {
    setupCacheMiss();
    mockFetchSuccess(VALID_AI_RESPONSE);

    await generateGoalPackage('Run a half marathon in 12 weeks');

    expect(mockRpc).not.toHaveBeenCalled();
  });

  test('failed generation (network error) does NOT call RPC', async () => {
    setupCacheMiss();
    mockFetchNetworkError();

    const result = await generateGoalPackage('Run a half marathon in 12 weeks');

    expect(result.ok).toBe(false);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  test('failed generation (HTTP 500) does NOT call RPC', async () => {
    setupCacheMiss();
    mockFetchHttpError(500);

    const result = await generateGoalPackage('Run a half marathon in 12 weeks');

    expect(result.ok).toBe(false);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  test('incrementAiUsesCount calls RPC on success', async () => {
    mockRpc.mockResolvedValue({ error: null });

    await incrementAiUsesCount('user-123');

    expect(mockRpc).toHaveBeenCalledWith('increment_ai_uses_count', { p_user_id: 'user-123' });
  });

  test('incrementAiUsesCount falls back to direct update on RPC error', async () => {
    mockRpc.mockResolvedValue({ error: new Error('rpc not found') });

    const update = jest.fn().mockReturnValue({ eq: jest.fn().mockResolvedValue({ error: null }) });
    const single = jest.fn().mockResolvedValue({ data: { ai_uses_count: 2 }, error: null });
    const eqInner = jest.fn().mockReturnValue({ single });
    const select = jest.fn().mockReturnValue({ eq: eqInner });
    mockFrom.mockReturnValue({ select, update });

    await incrementAiUsesCount('user-123');

    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith({ ai_uses_count: 3 });
  });

  test('getAiUsesCount returns count from profiles table', async () => {
    const single = jest.fn().mockResolvedValue({ data: { ai_uses_count: 5 }, error: null });
    const eq = jest.fn().mockReturnValue({ single });
    const select = jest.fn().mockReturnValue({ eq });
    mockFrom.mockReturnValue({ select });

    const count = await getAiUsesCount('user-123');
    expect(count).toBe(5);
  });

  test('getAiUsesCount returns 0 on error', async () => {
    const single = jest.fn().mockResolvedValue({ data: null, error: new Error('fail') });
    const eq = jest.fn().mockReturnValue({ single });
    const select = jest.fn().mockReturnValue({ eq });
    mockFrom.mockReturnValue({ select });

    const count = await getAiUsesCount('user-123');
    expect(count).toBe(0);
  });

  test('incrementAiUsesCount is a no-op for empty userId', async () => {
    await incrementAiUsesCount('');
    expect(mockRpc).not.toHaveBeenCalled();
  });
});

// ─── Cache write on confirm+activate ─────────────────────────────────────────

describe('cache write — confirm+activate only', () => {
  test('writeGoalPackageCache upserts with confirmed=true', async () => {
    const upsert = jest.fn().mockResolvedValue({ error: null });
    mockFrom.mockReturnValue({ upsert });

    await writeGoalPackageCache('user-123', 'Run a half marathon', VALID_AI_RESPONSE);

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ confirmed: true }),
      expect.objectContaining({ onConflict: 'goal_text_normalized,user_id' }),
    );
  });

  test('writeGoalPackageCache stores normalized goal text', async () => {
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

  test('writeGoalPackageCache is a no-op for empty userId', async () => {
    await writeGoalPackageCache('', 'run a marathon', VALID_AI_RESPONSE);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  test('writeGoalPackageCache is a no-op for empty normalized text', async () => {
    // Stop-word-only goal normalizes to empty string
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

  test('incrementAiRegenerations increments to 1, then 2', () => {
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
    store.incrementAiRegenerations();
    store.reset();
    expect(useOnboardingStore.getState().aiRegenerationsUsed).toBe(0);
  });
});

// ─── generateGoalPackage guards ───────────────────────────────────────────────

describe('generateGoalPackage guards', () => {
  test('returns goal_too_short for text under 10 chars', async () => {
    const result = await generateGoalPackage('run');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('goal_too_short');
    }
  });

  test('returns no_api_key when env var is missing', async () => {
    setupCacheMiss();
    delete process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY;

    const result = await generateGoalPackage('Run a half marathon in 12 weeks');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('no_api_key');
    }

    // Restore for subsequent tests
    process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY = 'test-key';
  });

  test('returns low_confidence when AI returns confidence:low', async () => {
    setupCacheMiss();
    const lowConf = { ...VALID_AI_RESPONSE, confidence: 'low' as const };
    mockFetchSuccess(lowConf);

    const result = await generateGoalPackage('Run a half marathon in 12 weeks');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('low_confidence');
    }
  });

  test('returns network_error after two fetch failures', async () => {
    setupCacheMiss();
    mockFetchNetworkError();

    const result = await generateGoalPackage('Run a half marathon in 12 weeks');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('network_error');
    }
    // One silent retry means fetch called twice
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});
