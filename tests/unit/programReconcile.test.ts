/**
 * PG-4 — reconcileProgramStageMarks tests. ADDITIVE ONLY, IDEMPOTENT (spec §5):
 *
 *   1. No active goal with a known program_id -> zero DB reads, zero writes.
 *   2. A mark the CURRENT stage lists that the goal lacks is created + linked.
 *   3. NEVER resurrects: a tombstoned mark (or tombstoned link) for a stage's
 *      library id is skipped.
 *   4. A live VARIABLE mark whose weekly_target drifted from the scaled stage
 *      target is rewritten; fixed marks and correct targets are untouched.
 *   5. A second run with everything in place makes zero writes (idempotence).
 *   6. One goal failing never blocks the others; the function never throws.
 */

const mockCreateMark = jest.fn();
const mockEditMark = jest.fn();
const mockInvalidateQueries = jest.fn();

jest.mock('../../lib/data/mutations/marks', () => ({
  createMark: (...args: unknown[]) => mockCreateMark(...args),
  editMark: (...args: unknown[]) => mockEditMark(...args),
}));

type GoalFixture = {
  id: string;
  status: string;
  sort_index: number;
  program_id: string | null;
  created_at: string;
};
let mockExistingGoals: GoalFixture[] = [];

jest.mock('../../lib/data/goals', () => ({
  fetchGoals: async () => mockExistingGoals,
}));

jest.mock('../../lib/data/queryClient', () => ({
  queryClient: {
    ensureQueryData: (opts: { queryFn: () => unknown }) => Promise.resolve(opts.queryFn()),
    invalidateQueries: (...args: unknown[]) => mockInvalidateQueries(...args),
  },
}));

type EventFixture = {
  mark_id: string;
  event_type: string;
  occurred_local_date: string;
  deleted_at: string | null;
};
let mockEvents: EventFixture[] = [];

jest.mock('../../lib/goals/momentumEvaluation', () => ({
  readGoalDataSnapshot: () => ({
    goals: [],
    marks: [],
    marksByGoal: {},
    events: mockEvents,
  }),
}));

let mockPace = 'steady';
jest.mock('../../lib/paceSetting', () => ({
  getPace: async () => mockPace,
}));

type LinkRow = { mark_id: string; deleted_at: string | null };
type MarkRowFixture = {
  id: string;
  name: string;
  weekly_target: number | null;
  frequency_kind: string | null;
  deleted_at: string | null;
};
let mockLinksByGoal: Record<string, { data: LinkRow[] | null; error: unknown }> = {};
let mockMarkRows: MarkRowFixture[] = [];
const mockFrom = jest.fn();

jest.mock('../../lib/data/client', () => ({
  dataClient: () => ({
    from: (table: string) => {
      mockFrom(table);
      if (table === 'goal_mark_links') {
        return {
          select: () => ({
            eq: (_col: string, goalId: string) =>
              mockLinksByGoal[goalId] ?? { data: [], error: null },
          }),
        };
      }
      return {
        select: () => ({
          in: (_col: string, ids: string[]) => ({
            data: mockMarkRows.filter((m) => ids.includes(m.id)),
            error: null,
          }),
        }),
      };
    },
  }),
}));

import { reconcileProgramStageMarks } from '../../lib/programs/reconcile';

const USER = 'user-1';
// Monday 2026-08-03 anchors week 1; today 2026-08-10 is the first day of week 2.
const CREATED = '2026-08-03T00:00:00.000Z';
const TODAY = '2026-08-10';

const ev = (markId: string, date: string): EventFixture => ({
  mark_id: markId,
  event_type: 'increment',
  occurred_local_date: date,
  deleted_at: null,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockExistingGoals = [];
  mockEvents = [];
  mockPace = 'steady';
  mockLinksByGoal = {};
  mockMarkRows = [];
  mockCreateMark.mockResolvedValue({ id: 'mark-created' });
  mockEditMark.mockResolvedValue(undefined);
});

describe('reconcileProgramStageMarks', () => {
  test('does nothing when no active goal carries a known program_id', async () => {
    mockExistingGoals = [
      { id: 'g1', status: 'active', sort_index: 0, program_id: null, created_at: CREATED },
      { id: 'g2', status: 'active', sort_index: 1, program_id: 'unknown-card', created_at: CREATED },
    ];
    await reconcileProgramStageMarks(USER, TODAY);
    expect(mockFrom).not.toHaveBeenCalled();
    expect(mockCreateMark).not.toHaveBeenCalled();
    expect(mockEditMark).not.toHaveBeenCalled();
  });

  test('creates a stage mark the goal lacks, linked to the goal', async () => {
    // Sleep Reset week 2 stage lists sleep + breathwork + no-caffeine; the goal
    // holds only Sleep and Breathwork. Week 1 held (3 active days on Sleep).
    mockExistingGoals = [
      { id: 'g1', status: 'active', sort_index: 0, program_id: 'sleep-reset', created_at: CREATED },
    ];
    mockLinksByGoal = {
      g1: {
        data: [
          { mark_id: 'ms', deleted_at: null },
          { mark_id: 'mb', deleted_at: null },
        ],
        error: null,
      },
    };
    mockMarkRows = [
      { id: 'ms', name: 'Sleep', weekly_target: 7, frequency_kind: 'fixed', deleted_at: null },
      { id: 'mb', name: 'Breathwork', weekly_target: 3, frequency_kind: 'variable', deleted_at: null },
    ];
    mockEvents = [ev('ms', '2026-08-03'), ev('ms', '2026-08-04'), ev('ms', '2026-08-05')];

    await reconcileProgramStageMarks(USER, TODAY);

    expect(mockCreateMark).toHaveBeenCalledTimes(1);
    expect(mockCreateMark).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: USER,
        name: 'Cut Caffeine',
        goalId: 'g1',
        cadence: expect.objectContaining({
          frequency_kind: 'fixed',
          weekly_target: 7,
          maintenance_of: null,
        }),
      }),
    );
    expect(mockEditMark).not.toHaveBeenCalled();
    // Something changed -> reads invalidated.
    expect(mockInvalidateQueries).toHaveBeenCalled();
  });

  test('NEVER resurrects: a tombstoned mark for a stage library id is skipped', async () => {
    mockExistingGoals = [
      { id: 'g1', status: 'active', sort_index: 0, program_id: 'sleep-reset', created_at: CREATED },
    ];
    mockLinksByGoal = {
      g1: {
        data: [
          { mark_id: 'ms', deleted_at: null },
          { mark_id: 'mb', deleted_at: null },
          { mark_id: 'mc', deleted_at: null },
        ],
        error: null,
      },
    };
    mockMarkRows = [
      { id: 'ms', name: 'Sleep', weekly_target: 7, frequency_kind: 'fixed', deleted_at: null },
      { id: 'mb', name: 'Breathwork', weekly_target: 3, frequency_kind: 'variable', deleted_at: null },
      // The user deleted Cut Caffeine; it stays deleted.
      { id: 'mc', name: 'Cut Caffeine', weekly_target: 7, frequency_kind: 'fixed', deleted_at: '2026-08-08T00:00:00Z' },
    ];
    mockEvents = [ev('ms', '2026-08-03'), ev('ms', '2026-08-04'), ev('ms', '2026-08-05')];

    await reconcileProgramStageMarks(USER, TODAY);
    expect(mockCreateMark).not.toHaveBeenCalled();
    expect(mockEditMark).not.toHaveBeenCalled();
  });

  test('a tombstoned LINK is equally final', async () => {
    mockExistingGoals = [
      { id: 'g1', status: 'active', sort_index: 0, program_id: 'sleep-reset', created_at: CREATED },
    ];
    mockLinksByGoal = {
      g1: {
        data: [
          { mark_id: 'ms', deleted_at: null },
          { mark_id: 'mb', deleted_at: null },
          { mark_id: 'mc', deleted_at: '2026-08-08T00:00:00Z' },
        ],
        error: null,
      },
    };
    mockMarkRows = [
      { id: 'ms', name: 'Sleep', weekly_target: 7, frequency_kind: 'fixed', deleted_at: null },
      { id: 'mb', name: 'Breathwork', weekly_target: 3, frequency_kind: 'variable', deleted_at: null },
      { id: 'mc', name: 'Cut Caffeine', weekly_target: 7, frequency_kind: 'fixed', deleted_at: null },
    ];
    mockEvents = [ev('ms', '2026-08-03'), ev('ms', '2026-08-04'), ev('ms', '2026-08-05')];

    await reconcileProgramStageMarks(USER, TODAY);
    expect(mockCreateMark).not.toHaveBeenCalled();
  });

  test('rewrites a variable mark whose weekly_target drifted from the scaled stage target', async () => {
    // Deep Work Month week 2: deep-work target 3, planning target 3 (steady).
    mockExistingGoals = [
      { id: 'g2', status: 'active', sort_index: 0, program_id: 'deep-work-month', created_at: CREATED },
    ];
    mockLinksByGoal = {
      g2: {
        data: [
          { mark_id: 'md', deleted_at: null },
          { mark_id: 'mp', deleted_at: null },
        ],
        error: null,
      },
    };
    mockMarkRows = [
      // Stage-1 target was 2; week 2 wants 3 -> drift.
      { id: 'md', name: 'Deep Work', weekly_target: 2, frequency_kind: 'variable', deleted_at: null },
      { id: 'mp', name: 'Planning', weekly_target: 3, frequency_kind: 'variable', deleted_at: null },
    ];
    // Week 1 held (bar 3): 3 active days on Deep Work.
    mockEvents = [ev('md', '2026-08-03'), ev('md', '2026-08-04'), ev('md', '2026-08-05')];

    await reconcileProgramStageMarks(USER, TODAY);

    expect(mockEditMark).toHaveBeenCalledTimes(1);
    expect(mockEditMark).toHaveBeenCalledWith('md', { cadence: { weekly_target: 3 } });
    expect(mockCreateMark).not.toHaveBeenCalled();
  });

  test('an eased stage writes eased targets', async () => {
    // Week 1 quiet (no events) -> week 2 eased: deep-work 3 * 0.6 = 1.8 -> 2.
    mockExistingGoals = [
      { id: 'g2', status: 'active', sort_index: 0, program_id: 'deep-work-month', created_at: CREATED },
    ];
    mockLinksByGoal = {
      g2: { data: [{ mark_id: 'md', deleted_at: null }], error: null },
    };
    mockMarkRows = [
      { id: 'md', name: 'Deep Work', weekly_target: 2, frequency_kind: 'variable', deleted_at: null },
    ];
    mockEvents = [];

    await reconcileProgramStageMarks(USER, TODAY);

    // Eased desired = 2 and the stored value is already 2 -> no edit; the
    // missing Planning mark is created with the eased target 3 * 0.6 -> 2.
    expect(mockEditMark).not.toHaveBeenCalled();
    expect(mockCreateMark).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Planning',
        cadence: expect.objectContaining({ weekly_target: 2 }),
      }),
    );
  });

  test('idempotent: a run with everything in place makes zero writes', async () => {
    mockExistingGoals = [
      { id: 'g1', status: 'active', sort_index: 0, program_id: 'sleep-reset', created_at: CREATED },
    ];
    mockLinksByGoal = {
      g1: {
        data: [
          { mark_id: 'ms', deleted_at: null },
          { mark_id: 'mb', deleted_at: null },
          { mark_id: 'mc', deleted_at: null },
        ],
        error: null,
      },
    };
    mockMarkRows = [
      { id: 'ms', name: 'Sleep', weekly_target: 7, frequency_kind: 'fixed', deleted_at: null },
      { id: 'mb', name: 'Breathwork', weekly_target: 3, frequency_kind: 'variable', deleted_at: null },
      { id: 'mc', name: 'Cut Caffeine', weekly_target: 7, frequency_kind: 'fixed', deleted_at: null },
    ];
    mockEvents = [ev('ms', '2026-08-03'), ev('ms', '2026-08-04'), ev('ms', '2026-08-05')];

    await reconcileProgramStageMarks(USER, TODAY);
    expect(mockCreateMark).not.toHaveBeenCalled();
    expect(mockEditMark).not.toHaveBeenCalled();
    expect(mockInvalidateQueries).not.toHaveBeenCalled();
  });

  test('one goal failing never blocks the others and the function never throws', async () => {
    mockExistingGoals = [
      { id: 'g1', status: 'active', sort_index: 0, program_id: 'sleep-reset', created_at: CREATED },
      { id: 'g2', status: 'active', sort_index: 1, program_id: 'deep-work-month', created_at: CREATED },
    ];
    mockLinksByGoal = {
      g1: { data: null, error: new Error('links read failed') },
      g2: { data: [{ mark_id: 'md', deleted_at: null }], error: null },
    };
    mockMarkRows = [
      { id: 'md', name: 'Deep Work', weekly_target: 3, frequency_kind: 'variable', deleted_at: null },
    ];
    // Week 1 held for g2 so week 2 is normal; Planning (target 3) is missing.
    mockEvents = [ev('md', '2026-08-03'), ev('md', '2026-08-04'), ev('md', '2026-08-05')];

    await expect(reconcileProgramStageMarks(USER, TODAY)).resolves.toBeUndefined();
    expect(mockCreateMark).toHaveBeenCalledWith(expect.objectContaining({ name: 'Planning' }));
  });
});
