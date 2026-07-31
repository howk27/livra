/**
 * FU-6 — createFromAIPackage confirm-path tests.
 *
 * M9 Phase 3 Task 6: the helper writes through `lib/data/mutations/` now, so the
 * mocks sit on the mutation layer and the query fetches, not the Zustand stores.
 *
 * Verifies the shared persist helper used by /goal/suggest:
 *   1. createGoal is called with the confirmed title/description and the store's
 *      old tier/frequency defaults written explicitly.
 *   2. Each selected mark is created through createMark with goalId (the link is
 *      part of the same call) and weekly_target = AI frequency.
 *   3. writeGoalPackageCache is invoked with the raw goal text (not the edited title).
 *   4. The 2-goal cap pre-check throws GoalLimitError BEFORE any write (the
 *      soft-cap Alert lives in the caller).
 *   5. A single mark create failure does not abort the goal or the remaining marks.
 *   6. GOAL_CREATED fires once, method 'ai' (moved out of the store with the write).
 */

import { GoalLimitError } from '../../lib/errors';
import { type AIGoalPackage } from '../../lib/ai/goalGeneration';

const mockCreateGoal = jest.fn();
const mockCreateMark = jest.fn();
const mockWriteGoalPackageCache = jest.fn().mockResolvedValue(undefined);
const mockCapture = jest.fn();
const mockInvalidateQueries = jest.fn();

jest.mock('../../lib/data/mutations/goals', () => ({
  createGoal: (...args: unknown[]) => mockCreateGoal(...args),
}));

jest.mock('../../lib/data/mutations/marks', () => ({
  createMark: (...args: unknown[]) => mockCreateMark(...args),
}));

// The helper reads goals (cap + sort index) and marks (ceiling trim) through the
// singleton client. `ensureQueryData` just runs the queryFn, which the two
// fetch mocks below control.
jest.mock('../../lib/data/queryClient', () => ({
  queryClient: {
    ensureQueryData: (opts: { queryFn: () => unknown }) => Promise.resolve(opts.queryFn()),
    invalidateQueries: (...args: unknown[]) => mockInvalidateQueries(...args),
  },
}));

let mockExistingGoals: Array<{ status: string; sort_index: number }> = [];
let mockExistingMarks: Array<{ id: string; deleted_at: string | null }> = [];

jest.mock('../../lib/data/goals', () => ({
  fetchGoals: async () => mockExistingGoals,
}));

jest.mock('../../lib/data/marks', () => ({
  fetchMarksForUser: async () => mockExistingMarks,
}));

jest.mock('../../lib/analytics/posthog', () => ({
  capture: (...args: unknown[]) => mockCapture(...args),
}));

jest.mock('../../lib/ai/goalGeneration', () => {
  const actual = jest.requireActual('../../lib/ai/goalGeneration');
  return {
    ...actual,
    writeGoalPackageCache: (...args: unknown[]) => mockWriteGoalPackageCache(...args),
  };
});

const mockRpc = jest.fn().mockResolvedValue({ data: null, error: null });
jest.mock('../../lib/supabase', () => ({
  getSupabaseClient: () => ({ rpc: mockRpc }),
}));

import { createFromAIPackage } from '../../lib/goals/createFromAIPackage';

const SAMPLE_PACKAGE: AIGoalPackage = {
  goalTitle: 'Run a half marathon',
  timeframeWeeks: 12,
  confidence: 'high',
  marks: [
    { name: 'Morning run', icon: 'gym', frequency: 4, why: 'Builds endurance over time' },
    { name: 'Mobility', icon: 'stretch', frequency: 2, why: 'Prevents overtraining' },
  ],
};

const existing = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `existing-${i}`, deleted_at: null }));

beforeEach(() => {
  jest.clearAllMocks();
  mockExistingGoals = [];
  mockExistingMarks = [];
  mockCreateGoal.mockResolvedValue({ id: 'goal-1' });
  mockCreateMark.mockImplementation(async (input: Record<string, unknown>) => ({
    id: `mark-${input.name}`,
  }));
});

describe('createFromAIPackage — confirm path', () => {
  test('creates the goal with the confirmed title/description and the explicit store defaults', async () => {
    await createFromAIPackage({
      userId: 'user-1',
      isPro: false,
      goalText: 'run a half marathon this year',
      pkg: SAMPLE_PACKAGE,
      title: 'Half marathon',
      description: 'For my 30th birthday',
      marks: SAMPLE_PACKAGE.marks,
    });

    expect(mockCreateGoal).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Half marathon',
        description: 'For my 30th birthday',
        userId: 'user-1',
        // The store defaulted these; the mutation takes nulls, so the helper
        // must write them explicitly or the hero's unlock maths changes shape.
        tier: 'building',
        frequency: 'steady',
      }),
    );
  });

  test('does NOT write the AI projection to the deadline — soft projection only (QC3-C)', async () => {
    await createFromAIPackage({
      userId: 'user-1',
      isPro: false,
      goalText: 'run a half marathon this year',
      pkg: SAMPLE_PACKAGE, // timeframeWeeks: 12
      title: 'Half marathon',
      marks: SAMPLE_PACKAGE.marks,
    });

    // Founder call: the AI finish date is a soft projection shown only at review
    // (GoalPackageReview derives it from timeframeWeeks). It must never become
    // the goal's expiring deadline.
    const arg = mockCreateGoal.mock.calls[0]![0] as Record<string, unknown>;
    expect(arg.deadlineDate).toBeUndefined();
    expect(arg.target_date).toBeUndefined();
  });

  test('falls back to the package title when the confirmed title is blank', async () => {
    await createFromAIPackage({
      userId: 'user-1',
      isPro: false,
      goalText: 'run a half marathon',
      pkg: SAMPLE_PACKAGE,
      title: '   ',
      marks: SAMPLE_PACKAGE.marks,
    });

    expect(mockCreateGoal).toHaveBeenCalledWith(
      expect.objectContaining({ title: SAMPLE_PACKAGE.goalTitle }),
    );
  });

  test('sorts the new goal after the existing active goals', async () => {
    mockExistingGoals = [
      { status: 'active', sort_index: 0 },
      { status: 'completed', sort_index: 4 }, // completed rows do not claim slots
    ];
    await createFromAIPackage({
      userId: 'user-1',
      isPro: true,
      goalText: 'run a half marathon',
      pkg: SAMPLE_PACKAGE,
      title: 'Half marathon',
      marks: SAMPLE_PACKAGE.marks,
    });

    expect(mockCreateGoal).toHaveBeenCalledWith(expect.objectContaining({ sortIndex: 1 }));
  });

  test('creates each selected AI mark linked to the goal, weekly_target = AI frequency', async () => {
    await createFromAIPackage({
      userId: 'user-1',
      isPro: false,
      goalText: 'run a half marathon',
      pkg: SAMPLE_PACKAGE,
      title: 'Half marathon',
      marks: SAMPLE_PACKAGE.marks,
    });

    expect(mockCreateMark).toHaveBeenCalledTimes(2);
    // Name is canonicalized to the library name (2026-07-19 founder decision):
    // 'Morning run' (icon: gym) persists as 'Workout', 'Mobility' (icon: stretch)
    // persists as 'Stretch' — not the AI's free-text names. The goal link rides
    // the same call via goalId; `marks.goal_id` is never written.
    expect(mockCreateMark).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Workout',
        goalId: 'goal-1',
        cadence: expect.objectContaining({ weekly_target: 4 }),
      }),
    );
    expect(mockCreateMark).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Stretch',
        goalId: 'goal-1',
        cadence: expect.objectContaining({ weekly_target: 2 }),
      }),
    );
  });

  test('only creates marks for the caller-filtered selection (deselected marks excluded)', async () => {
    await createFromAIPackage({
      userId: 'user-1',
      isPro: false,
      goalText: 'run a half marathon',
      pkg: SAMPLE_PACKAGE,
      title: 'Half marathon',
      marks: [SAMPLE_PACKAGE.marks[0]!], // only the run mark kept
    });

    expect(mockCreateMark).toHaveBeenCalledTimes(1);
    expect(mockCreateMark).toHaveBeenCalledWith(expect.objectContaining({ name: 'Workout' }));
  });

  test('writes the goal package cache keyed by the raw goal text, not the edited title', async () => {
    await createFromAIPackage({
      userId: 'user-1',
      isPro: false,
      goalText: 'run a half marathon this year',
      pkg: SAMPLE_PACKAGE,
      title: 'Half marathon (edited)',
      marks: SAMPLE_PACKAGE.marks,
    });

    expect(mockWriteGoalPackageCache).toHaveBeenCalledWith(
      'user-1',
      'run a half marathon this year',
      SAMPLE_PACKAGE,
    );
  });

  test('fires GOAL_CREATED once, method "ai" (analytics moved out of the store)', async () => {
    await createFromAIPackage({
      userId: 'user-1',
      isPro: false,
      goalText: 'run a half marathon',
      pkg: SAMPLE_PACKAGE,
      title: 'Half marathon',
      marks: SAMPLE_PACKAGE.marks,
    });

    const goalCreated = mockCapture.mock.calls.filter(([event]) => event === 'goal_created');
    expect(goalCreated).toHaveLength(1);
    expect(goalCreated[0]![1]).toEqual(
      expect.objectContaining({ goal_id: 'goal-1', method: 'ai', mark_count: 0 }),
    );
  });

  test('the 2-goal cap throws GoalLimitError BEFORE any write (free user, 2 live goals)', async () => {
    mockExistingGoals = [
      { status: 'active', sort_index: 0 },
      { status: 'active', sort_index: 1 },
    ];

    await expect(
      createFromAIPackage({
        userId: 'user-1',
        isPro: false,
        goalText: 'run a half marathon',
        pkg: SAMPLE_PACKAGE,
        title: 'Half marathon',
        marks: SAMPLE_PACKAGE.marks,
      }),
    ).rejects.toBeInstanceOf(GoalLimitError);

    expect(mockCreateGoal).not.toHaveBeenCalled();
    expect(mockCreateMark).not.toHaveBeenCalled();
  });

  test('Pro is never capped on goals', async () => {
    mockExistingGoals = Array.from({ length: 5 }, (_, i) => ({
      status: 'active',
      sort_index: i,
    }));
    await createFromAIPackage({
      userId: 'user-1',
      isPro: true,
      goalText: 'run a half marathon',
      pkg: SAMPLE_PACKAGE,
      title: 'Half marathon',
      marks: SAMPLE_PACKAGE.marks,
    });
    expect(mockCreateGoal).toHaveBeenCalled();
  });

  test('a single mark create failure does not abort the goal or the remaining marks', async () => {
    mockCreateMark
      .mockRejectedValueOnce(new Error('insert refused'))
      .mockResolvedValueOnce({ id: 'mark-rest' });

    const goal = await createFromAIPackage({
      userId: 'user-1',
      isPro: false,
      goalText: 'run a half marathon',
      pkg: SAMPLE_PACKAGE,
      title: 'Half marathon',
      marks: SAMPLE_PACKAGE.marks,
    });

    expect(goal.id).toBe('goal-1');
    expect(mockCreateMark).toHaveBeenCalledTimes(2);
    // Cache write still happens — confirm still succeeds overall.
    expect(mockWriteGoalPackageCache).toHaveBeenCalled();
  });

  test('invalidates the goal and mark reads after the writes', async () => {
    await createFromAIPackage({
      userId: 'user-1',
      isPro: false,
      goalText: 'run a half marathon',
      pkg: SAMPLE_PACKAGE,
      title: 'Half marathon',
      marks: SAMPLE_PACKAGE.marks,
    });

    const keys = mockInvalidateQueries.mock.calls.map(
      ([arg]) => (arg as { queryKey: readonly string[] }).queryKey.join('/'),
    );
    expect(keys).toEqual(
      expect.arrayContaining([
        'livra/user-1/goals',
        'livra/user-1/marks',
        'livra/user-1/marks/by-goal-map',
      ]),
    );
  });
});

describe('createFromAIPackage — free use spent on create (2026-07-19)', () => {
  test('non-Pro user consumes the free AI use on goal creation', async () => {
    await createFromAIPackage({
      userId: 'user-1',
      isPro: false,
      goalText: 'run a half marathon',
      pkg: SAMPLE_PACKAGE,
      title: 'Half marathon',
      marks: SAMPLE_PACKAGE.marks,
    });

    expect(mockRpc).toHaveBeenCalledWith('increment_ai_uses_count', { p_user_id: 'user-1' });
  });

  test('Pro user does NOT consume a free use (unlimited)', async () => {
    await createFromAIPackage({
      userId: 'user-1',
      isPro: true,
      goalText: 'run a half marathon',
      pkg: SAMPLE_PACKAGE,
      title: 'Half marathon',
      marks: SAMPLE_PACKAGE.marks,
    });

    expect(mockRpc).not.toHaveBeenCalled();
  });

  test('a failed increment does not abort the goal (goal already exists)', async () => {
    mockRpc.mockRejectedValueOnce(new Error('rpc down'));

    const goal = await createFromAIPackage({
      userId: 'user-1',
      isPro: false,
      goalText: 'run a half marathon',
      pkg: SAMPLE_PACKAGE,
      title: 'Half marathon',
      marks: SAMPLE_PACKAGE.marks,
    });

    expect(goal.id).toBe('goal-1');
  });
});

/**
 * Free-tier ceiling (2026-07-22). The trim mirrors the RESTRICTIVE account
 * ceiling on public.marks so a refused insert never surfaces as a raw RLS error.
 * Counted from the QUERY layer now — the SQLite store no longer sees
 * mutation-created marks until sync pulls them.
 */
describe('createFromAIPackage — free-tier account ceiling', () => {
  const args = (isPro: boolean) => ({
    userId: 'user-1',
    isPro,
    goalText: 'run a half marathon',
    pkg: SAMPLE_PACKAGE,
    title: 'Half marathon',
    marks: SAMPLE_PACKAGE.marks, // 2 marks
  });

  test('creates every package mark when the account has room', async () => {
    mockExistingMarks = existing(2); // headroom 4
    await createFromAIPackage(args(false));
    expect(mockCreateMark).toHaveBeenCalledTimes(2);
  });

  test('trims the package to the remaining headroom', async () => {
    mockExistingMarks = existing(5); // headroom 1
    await createFromAIPackage(args(false));
    expect(mockCreateMark).toHaveBeenCalledTimes(1);
  });

  test('creates no marks at all when the account is already at the ceiling', async () => {
    mockExistingMarks = existing(6); // headroom 0
    const goal = await createFromAIPackage(args(false));
    expect(mockCreateMark).not.toHaveBeenCalled();
    // The goal itself still exists — the goal cap is a separate wall.
    expect(goal.id).toBe('goal-1');
  });

  test('soft-deleted marks do not consume headroom', async () => {
    mockExistingMarks = [
      ...existing(4),
      { id: 'gone-1', deleted_at: '2026-01-01' },
      { id: 'gone-2', deleted_at: '2026-01-01' },
    ];
    await createFromAIPackage(args(false)); // 4 active → headroom 2
    expect(mockCreateMark).toHaveBeenCalledTimes(2);
  });

  test('Pro is never trimmed', async () => {
    mockExistingMarks = existing(40);
    await createFromAIPackage(args(true));
    expect(mockCreateMark).toHaveBeenCalledTimes(2);
  });
});
