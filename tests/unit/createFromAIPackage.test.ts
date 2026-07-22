/**
 * FU-6 — createFromAIPackage confirm-path tests.
 *
 * Verifies the shared persist helper used by both onboarding and /goal/suggest:
 *   1. createGoal is called with method: 'ai' and the confirmed title/description.
 *   2. Each selected mark is created (weekly_target = AI frequency) and linked.
 *   3. writeGoalPackageCache is invoked with the raw goal text (not the edited title).
 *   4. GoalLimitError from createGoal propagates uncaught (soft-cap Alert lives in the caller).
 *   5. A single mark create/link failure does not abort the goal or the remaining marks.
 */

import { GoalLimitError } from '../../state/goalsSlice';
import { type AIGoalPackage } from '../../lib/ai/goalGeneration';

const mockCreateGoal = jest.fn();
const mockLinkMarkToGoal = jest.fn();
const mockAddMark = jest.fn();
const mockWriteGoalPackageCache = jest.fn().mockResolvedValue(undefined);

jest.mock('../../state/goalsSlice', () => {
  const actual = jest.requireActual('../../state/goalsSlice');
  return {
    ...actual,
    useGoalsStore: {
      getState: () => ({
        createGoal: mockCreateGoal,
        linkMarkToGoal: mockLinkMarkToGoal,
      }),
    },
  };
});

// `marks` is read to size the package against the free-tier account ceiling.
let mockExistingMarks: Array<{ id: string; goal_id: string | null; deleted_at: string | null }> = [];

jest.mock('../../state/countersSlice', () => ({
  useMarksStore: {
    getState: () => ({
      addMark: mockAddMark,
      marks: mockExistingMarks,
    }),
  },
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
  Array.from({ length: n }, (_, i) => ({ id: `existing-${i}`, goal_id: null, deleted_at: null }));

beforeEach(() => {
  jest.clearAllMocks();
  mockExistingMarks = [];
  mockCreateGoal.mockResolvedValue({ id: 'goal-1' });
  mockAddMark.mockImplementation(async (data: Record<string, unknown>) => ({
    id: `mark-${data.name}`,
  }));
  mockLinkMarkToGoal.mockResolvedValue(undefined);
});

describe('createFromAIPackage — confirm path', () => {
  test('creates the goal with method: "ai" and the confirmed title/description', async () => {
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
        isPro: false,
        method: 'ai',
      }),
    );
  });

  test('does NOT write the AI projection to target_date — soft projection only (QC3-C)', async () => {
    await createFromAIPackage({
      userId: 'user-1',
      isPro: false,
      goalText: 'run a half marathon this year',
      pkg: SAMPLE_PACKAGE, // timeframeWeeks: 12
      title: 'Half marathon',
      marks: SAMPLE_PACKAGE.marks,
    });

    // Founder call: the AI finish date is a soft projection shown only at review
    // (GoalPackageReview derives it from timeframeWeeks). It must never become the
    // goal's expiring deadline, so createGoal is called with no target_date.
    const arg = mockCreateGoal.mock.calls[0]![0] as { target_date?: string };
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

  test('creates and links a mark per selected AI mark, weekly_target = AI frequency', async () => {
    await createFromAIPackage({
      userId: 'user-1',
      isPro: false,
      goalText: 'run a half marathon',
      pkg: SAMPLE_PACKAGE,
      title: 'Half marathon',
      marks: SAMPLE_PACKAGE.marks,
    });

    expect(mockAddMark).toHaveBeenCalledTimes(2);
    // Name is canonicalized to the library name (2026-07-19 founder decision):
    // 'Morning run' (icon: gym) persists as 'Workout', 'Mobility' (icon: stretch)
    // persists as 'Stretch' — not the AI's free-text names.
    expect(mockAddMark).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Workout', weekly_target: 4, goal_id: 'goal-1' }),
    );
    expect(mockAddMark).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Stretch', weekly_target: 2, goal_id: 'goal-1' }),
    );
    expect(mockLinkMarkToGoal).toHaveBeenCalledTimes(2);
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

    expect(mockAddMark).toHaveBeenCalledTimes(1);
    expect(mockAddMark).toHaveBeenCalledWith(expect.objectContaining({ name: 'Workout' }));
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

  test('GoalLimitError from createGoal propagates uncaught', async () => {
    mockCreateGoal.mockRejectedValue(new GoalLimitError());

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

    // No marks should be attempted once goal creation itself failed.
    expect(mockAddMark).not.toHaveBeenCalled();
  });

  test('a single mark create failure does not abort the goal or the remaining marks', async () => {
    mockAddMark
      .mockRejectedValueOnce(new Error('db write failed'))
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
    expect(mockAddMark).toHaveBeenCalledTimes(2);
    // Only the surviving mark gets linked.
    expect(mockLinkMarkToGoal).toHaveBeenCalledTimes(1);
    expect(mockLinkMarkToGoal).toHaveBeenCalledWith('goal-1', 'mark-rest');
    // Cache write still happens — confirm still succeeds overall.
    expect(mockWriteGoalPackageCache).toHaveBeenCalled();
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
 * Free-tier ceiling (2026-07-22). addMark writes straight to the store, so this
 * path never ran useMarks.createMark's gating. Without the trim a free user near
 * the 6-mark account ceiling gets marks locally that the RESTRICTIVE policy on
 * public.marks rejects at sync — the raw RLS error the founder hit.
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
    expect(mockAddMark).toHaveBeenCalledTimes(2);
  });

  test('trims the package to the remaining headroom', async () => {
    mockExistingMarks = existing(5); // headroom 1
    await createFromAIPackage(args(false));
    expect(mockAddMark).toHaveBeenCalledTimes(1);
    expect(mockLinkMarkToGoal).toHaveBeenCalledTimes(1);
  });

  test('creates no marks at all when the account is already at the ceiling', async () => {
    mockExistingMarks = existing(6); // headroom 0
    const goal = await createFromAIPackage(args(false));
    expect(mockAddMark).not.toHaveBeenCalled();
    // The goal itself still exists — the caller owns the 2-goal cap, not this.
    expect(goal.id).toBe('goal-1');
  });

  test('soft-deleted marks do not consume headroom', async () => {
    mockExistingMarks = [
      ...existing(4),
      { id: 'gone-1', goal_id: null, deleted_at: '2026-01-01' },
      { id: 'gone-2', goal_id: null, deleted_at: '2026-01-01' },
    ];
    await createFromAIPackage(args(false)); // 4 active → headroom 2
    expect(mockAddMark).toHaveBeenCalledTimes(2);
  });

  test('Pro is never trimmed', async () => {
    mockExistingMarks = existing(40);
    await createFromAIPackage(args(true));
    expect(mockAddMark).toHaveBeenCalledTimes(2);
  });
});
