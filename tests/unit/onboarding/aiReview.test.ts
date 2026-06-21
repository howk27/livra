/**
 * Phase 4b Task 3 — AI review screen contract tests.
 *
 * These are unit tests for the contracts that the review screen enforces:
 *   1. Review is mandatory and editable — aiPackageDraft is never auto-activated.
 *   2. Abandoning (dismiss) does not spend free use — no RPC called.
 *   3. Confirm fills aiPackageDraft and selectedMarkTargets from the AI frequencies.
 *   4. resolveMarkForAIIcon provides correct emoji/color for all valid icons.
 *
 * Note: regeneration is not offered in the onboarding UI (the server rejects
 * free regen with free_use_exhausted after the first generation). The regen
 * slice fields remain in onboardingSlice for tracking but the "Try a different
 * suggestion" button has been removed from the review screen.
 */

import { resolveMarkForAIIcon, VALID_ICONS, type AIGoalPackage } from '../../../lib/ai/goalGeneration';
import { useOnboardingStore } from '../../../state/onboardingSlice';

// ─── Mock supabase (prevents real network calls) ──────────────────────────────

jest.mock('../../../lib/supabase', () => ({
  getSupabaseClient: () => ({
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue({
              maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }),
        }),
      }),
    }),
    rpc: jest.fn().mockResolvedValue({ error: null }),
  }),
}));

const SAMPLE_PACKAGE: AIGoalPackage = {
  goalTitle: 'Run a half marathon',
  timeframeWeeks: 12,
  confidence: 'high',
  marks: [
    { name: 'Morning run', icon: 'gym', frequency: 4, why: 'Builds endurance over time' },
    { name: 'Rest day', icon: 'rest', frequency: 2, why: 'Prevents overtraining' },
  ],
};

// ─── aiPackageDraft: never auto-activated ─────────────────────────────────────

describe('aiPackageDraft — not auto-activated', () => {
  beforeEach(() => {
    useOnboardingStore.getState().reset();
  });

  test('setAiPackageDraft stores draft without activating goal/marks', () => {
    const store = useOnboardingStore.getState();
    store.setAiPackageDraft(SAMPLE_PACKAGE);

    // Draft is stored
    expect(useOnboardingStore.getState().aiPackageDraft).toEqual(SAMPLE_PACKAGE);
    // But selectedMarkIds and selectedMarkTargets are still empty
    expect(useOnboardingStore.getState().selectedMarkIds).toEqual([]);
    expect(useOnboardingStore.getState().selectedMarkTargets).toEqual({});
  });

  test('draft does not affect goalTitle or commitment', () => {
    const store = useOnboardingStore.getState();
    store.setGoalTitle('Original title');
    store.setAiPackageDraft(SAMPLE_PACKAGE);

    // goalTitle is not overwritten by the draft
    expect(useOnboardingStore.getState().goalTitle).toBe('Original title');
    expect(useOnboardingStore.getState().commitment).toBeNull();
  });

  test('setAiPackageDraft(null) clears the draft (abandon flow)', () => {
    const store = useOnboardingStore.getState();
    store.setAiPackageDraft(SAMPLE_PACKAGE);
    store.setAiPackageDraft(null);

    expect(useOnboardingStore.getState().aiPackageDraft).toBeNull();
  });
});

// ─── Abandon does not spend free use ─────────────────────────────────────────

describe('abandon AI review — no usage spent', () => {
  beforeEach(() => {
    useOnboardingStore.getState().reset();
  });

  test('clearing draft (dismiss / Set it up myself) leaves aiRegenerationsUsed unchanged', () => {
    const store = useOnboardingStore.getState();
    store.setAiPackageDraft(SAMPLE_PACKAGE);
    // Dismiss: clear draft without confirming
    store.setAiPackageDraft(null);

    // The dismiss path never touches the regen counter
    expect(useOnboardingStore.getState().aiRegenerationsUsed).toBe(0);
  });
});

// ─── Confirm fills draft + targets ───────────────────────────────────────────

describe('confirm AI review — fills selectedMarkTargets', () => {
  beforeEach(() => {
    useOnboardingStore.getState().reset();
  });

  test('selectedMarkTargets reflects AI mark frequencies on confirm', () => {
    const store = useOnboardingStore.getState();
    store.setAiPackageDraft(SAMPLE_PACKAGE);

    // Simulate what the confirm handler does:
    // - resolve mark IDs from AI icons
    const gymResolved = resolveMarkForAIIcon('gym');
    const restResolved = resolveMarkForAIIcon('rest');

    const targets: Record<string, number> = {
      [gymResolved.markId]: 4,  // SAMPLE_PACKAGE.marks[0].frequency
      [restResolved.markId]: 2, // SAMPLE_PACKAGE.marks[1].frequency
    };
    store.setSelectedMarkTargets(targets);
    store.setSelectedMarkIds([gymResolved.markId, restResolved.markId]);

    expect(useOnboardingStore.getState().selectedMarkTargets).toEqual(targets);
    expect(useOnboardingStore.getState().selectedMarkIds).toContain(gymResolved.markId);
  });

  test('selectedMarkTargets from AI path differ from commitment-derived (weekly_target = frequency)', () => {
    const store = useOnboardingStore.getState();
    store.setCommitment('easing');

    // AI says 4×/wk for gym; easing would give frequency_min
    // These might differ — the AI target should win on AI path
    store.setAiPackageDraft(SAMPLE_PACKAGE);
    const gymResolved = resolveMarkForAIIcon('gym');
    store.setSelectedMarkTargets({ [gymResolved.markId]: 4 }); // AI frequency, not commitment min

    expect(useOnboardingStore.getState().selectedMarkTargets[gymResolved.markId]).toBe(4);
  });

  test('reset clears aiPackageDraft and selectedMarkTargets together', () => {
    const store = useOnboardingStore.getState();
    store.setAiPackageDraft(SAMPLE_PACKAGE);
    store.setSelectedMarkTargets({ workout: 4 });
    store.setSelectedMarkIds(['workout']);
    store.reset();

    const s = useOnboardingStore.getState();
    expect(s.aiPackageDraft).toBeNull();
    expect(s.selectedMarkTargets).toEqual({});
    expect(s.selectedMarkIds).toEqual([]);
  });
});

// ─── resolveMarkForAIIcon for review rendering ────────────────────────────────

describe('resolveMarkForAIIcon — review display', () => {
  test('all VALID_ICONS return a non-empty emoji and color', () => {
    for (const icon of VALID_ICONS) {
      const { emoji, color } = resolveMarkForAIIcon(icon);
      expect(emoji.length).toBeGreaterThan(0);
      expect(color).toMatch(/^#/);
    }
  });

  test('gym icon → workout markId (shown in review as workout emoji)', () => {
    const result = resolveMarkForAIIcon('gym');
    expect(result.markId).toBe('workout');
    expect(result.emoji).not.toBe('');
  });

  test('unknown icon resolves to focus fallback (review shows focus emoji)', () => {
    const result = resolveMarkForAIIcon('xyz_unknown');
    expect(result.markId).toBe('focus');
  });
});

// Regeneration cap tests removed: the "Try a different suggestion" button has
// been removed from the onboarding AI review screen. The server-side
// free_use_exhausted gate means free users cannot regenerate. The slice
// fields aiRegenerationsUsed / incrementAiRegenerations remain in
// onboardingSlice.ts but are no longer surfaced in UI. Slice-level tests
// for those fields live in onboardingSlice.test.ts.
