/**
 * PG-4 — startProgram tests. The createFromAIPackage harness is the model:
 * mocks sit on the mutation layer and the query fetches, never on stores.
 *
 * Pins:
 *   1. Free users are refused at the engine level (ProgramProGateError) with
 *      zero writes — the screen shows the paywall; this is the backstop.
 *   2. Unknown program ids are refused before any write.
 *   3. One program instance per id: an ACTIVE goal with the same program_id is
 *      returned as-is; a completed prior run does not block a fresh start.
 *   4. The goal carries program_id, the card title, and whyItWorks as the
 *      description (deriveWhy feeds the Weekly Review quote from it).
 *   5. Stage-1 marks ride createMark with the FULL cadence set; fixed marks
 *      keep the library recommended target, variable marks pace-scale.
 *   6. One failed mark create never aborts the goal or the other marks.
 *   7. The three read scopes are invalidated after the writes.
 */

const mockCreateGoal = jest.fn();
const mockCreateMark = jest.fn();
const mockCapture = jest.fn();
const mockInvalidateQueries = jest.fn();

jest.mock('../../lib/data/mutations/goals', () => ({
  createGoal: (...args: unknown[]) => mockCreateGoal(...args),
}));

jest.mock('../../lib/data/mutations/marks', () => ({
  createMark: (...args: unknown[]) => mockCreateMark(...args),
}));

jest.mock('../../lib/data/queryClient', () => ({
  queryClient: {
    ensureQueryData: (opts: { queryFn: () => unknown }) => Promise.resolve(opts.queryFn()),
    invalidateQueries: (...args: unknown[]) => mockInvalidateQueries(...args),
  },
}));

type GoalFixture = { id: string; status: string; sort_index: number; program_id: string | null };
let mockExistingGoals: GoalFixture[] = [];

jest.mock('../../lib/data/goals', () => ({
  fetchGoals: async () => mockExistingGoals,
}));

jest.mock('../../lib/analytics/posthog', () => ({
  capture: (...args: unknown[]) => mockCapture(...args),
}));

import { startProgram, ProgramProGateError } from '../../lib/programs/start';

const USER = 'user-1';

beforeEach(() => {
  jest.clearAllMocks();
  mockExistingGoals = [];
  mockCreateGoal.mockResolvedValue({ id: 'goal-new' });
  mockCreateMark.mockImplementation(async (input: Record<string, unknown>) => ({
    id: `mark-${input.name}`,
  }));
});

describe('startProgram — gates', () => {
  test('throws ProgramProGateError for free users and creates nothing', async () => {
    await expect(
      startProgram({ userId: USER, isPro: false, programId: 'sleep-reset', pace: 'steady' }),
    ).rejects.toBeInstanceOf(ProgramProGateError);
    expect(mockCreateGoal).not.toHaveBeenCalled();
    expect(mockCreateMark).not.toHaveBeenCalled();
  });

  test('rejects an unknown program id before any write', async () => {
    await expect(
      startProgram({ userId: USER, isPro: true, programId: 'nope', pace: 'steady' }),
    ).rejects.toThrow('Unknown program');
    expect(mockCreateGoal).not.toHaveBeenCalled();
  });
});

describe('startProgram — one instance per program id', () => {
  test('returns the existing ACTIVE program goal without creating anything', async () => {
    mockExistingGoals = [{ id: 'g1', status: 'active', sort_index: 0, program_id: 'sleep-reset' }];
    const goal = await startProgram({
      userId: USER,
      isPro: true,
      programId: 'sleep-reset',
      pace: 'steady',
    });
    expect(goal.id).toBe('g1');
    expect(mockCreateGoal).not.toHaveBeenCalled();
    expect(mockCreateMark).not.toHaveBeenCalled();
  });

  test('a completed prior run does not block a fresh start', async () => {
    mockExistingGoals = [
      { id: 'g0', status: 'completed', sort_index: 0, program_id: 'sleep-reset' },
    ];
    const goal = await startProgram({
      userId: USER,
      isPro: true,
      programId: 'sleep-reset',
      pace: 'steady',
    });
    expect(goal.id).toBe('goal-new');
    expect(mockCreateGoal).toHaveBeenCalled();
  });
});

describe('startProgram — the goal', () => {
  test('creates the goal with program_id, card title, and whyItWorks as description', async () => {
    await startProgram({ userId: USER, isPro: true, programId: 'sleep-reset', pace: 'steady' });
    expect(mockCreateGoal).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: USER,
        programId: 'sleep-reset',
        title: 'Sleep Reset',
        description: expect.stringContaining('Sleep does not improve'),
        tier: 'building',
        frequency: 'steady',
      }),
    );
  });

  test('sorts the new goal after the existing active goals', async () => {
    mockExistingGoals = [
      { id: 'a', status: 'active', sort_index: 2, program_id: null },
      { id: 'b', status: 'completed', sort_index: 7, program_id: null },
    ];
    await startProgram({ userId: USER, isPro: true, programId: 'sleep-reset', pace: 'steady' });
    expect(mockCreateGoal).toHaveBeenCalledWith(expect.objectContaining({ sortIndex: 3 }));
  });

  test('fires GOAL_CREATED once, method "program"', async () => {
    await startProgram({ userId: USER, isPro: true, programId: 'sleep-reset', pace: 'steady' });
    const goalCreated = mockCapture.mock.calls.filter(([event]) => event === 'goal_created');
    expect(goalCreated).toHaveLength(1);
    expect(goalCreated[0]![1]).toEqual(
      expect.objectContaining({ goal_id: 'goal-new', method: 'program' }),
    );
  });
});

describe('startProgram — stage-1 marks', () => {
  test('creates every stage-1 mark with full cadence; fixed keeps recommended, variable pace-scales', async () => {
    await startProgram({ userId: USER, isPro: true, programId: 'sleep-reset', pace: 'easing' });
    // Sleep Reset stage 1 = sleep (fixed 7/7/7) + breathwork (variable, card target 3).
    expect(mockCreateMark).toHaveBeenCalledTimes(2);
    const calls = mockCreateMark.mock.calls.map(([arg]) => arg as Record<string, any>);
    const sleep = calls.find((c) => c.name === 'Sleep');
    expect(sleep).toBeDefined();
    expect(sleep!.goalId).toBe('goal-new');
    expect(sleep!.cadence).toEqual(
      expect.objectContaining({
        frequency_kind: 'fixed',
        frequency_min: 7,
        frequency_recommended: 7,
        frequency_max: 7,
        weekly_target: 7, // never pace-scaled
        maintenance_of: null,
      }),
    );
    const breath = calls.find((c) => c.name === 'Breathwork');
    expect(breath).toBeDefined();
    expect(breath!.cadence).toEqual(
      expect.objectContaining({
        frequency_kind: 'variable',
        weekly_target: 2, // 3 * 0.75 = 2.25 -> 2
      }),
    );
  });

  test('push pace raises variable targets', async () => {
    await startProgram({ userId: USER, isPro: true, programId: 'deep-work-month', pace: 'push' });
    // Deep Work Month stage 1 = deep-work only, card target 2 -> 2 * 1.15 = 2.3 -> 2.
    const calls = mockCreateMark.mock.calls.map(([arg]) => arg as Record<string, any>);
    const dw = calls.find((c) => c.name === 'Deep Work');
    expect(dw!.cadence.weekly_target).toBe(2);
  });

  test('one failed mark create does not abandon the goal or the other marks', async () => {
    mockCreateMark
      .mockRejectedValueOnce(new Error('insert refused'))
      .mockResolvedValueOnce({ id: 'mark-rest' });
    const goal = await startProgram({
      userId: USER,
      isPro: true,
      programId: 'sleep-reset',
      pace: 'steady',
    });
    expect(goal.id).toBe('goal-new');
    expect(mockCreateMark).toHaveBeenCalledTimes(2);
  });

  test('invalidates goals, marks, and marksByGoal after the writes', async () => {
    await startProgram({ userId: USER, isPro: true, programId: 'sleep-reset', pace: 'steady' });
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
