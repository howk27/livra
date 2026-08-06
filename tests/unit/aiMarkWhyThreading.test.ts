/**
 * AI-MARK-WHY (2026-08-06) — end-to-end thread test for the rationale.
 *
 * createFromAIPackage → REAL createMark → the `goal_mark_links` insert row.
 * The mutation layer is deliberately NOT mocked here (unlike
 * createFromAIPackage.test.ts): the spec's contract is "the AI's why lands on
 * the LINK ROW", and a seam assertion on createMark's arguments would keep
 * passing if createMark silently dropped the field. Only the goal mutation,
 * the query fetches, analytics, and the cache write are stubbed.
 */

const mockCreateGoal = jest.fn();
const mockWriteGoalPackageCache = jest.fn().mockResolvedValue(undefined);
const mockCapture = jest.fn();
const mockInvalidateQueries = jest.fn();

jest.mock('../../lib/data/mutations/goals', () => ({
  createGoal: (...args: unknown[]) => mockCreateGoal(...args),
}));

jest.mock('../../lib/data/queryClient', () => ({
  queryClient: {
    ensureQueryData: (opts: { queryFn: () => unknown }) => Promise.resolve(opts.queryFn()),
    invalidateQueries: (...args: unknown[]) => mockInvalidateQueries(...args),
  },
}));

jest.mock('../../lib/data/goals', () => ({
  fetchGoals: async () => [],
}));

jest.mock('../../lib/data/marks', () => ({
  fetchMarksForUser: async () => [],
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

jest.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: null }) }));

import { setSupabaseClientOverride } from '../../lib/supabase';
import { createFromAIPackage } from '../../lib/goals/createFromAIPackage';
import type { AIGoalPackage } from '../../lib/ai/goalGeneration';

const USER = '3fe1a23e-2ec2-4830-a68b-42b65fc3bcb0';
const GOAL = 'aaaaaaaa-1111-4111-8111-111111111111';

type Call = { table: string; method: string; args: unknown[] };
type Result = { data: unknown; error: unknown };

/** Same fake-client recipe as markMutations.test.ts, plus `rpc` for the free-use spend. */
function makeClient(results: Result[]) {
  const queue = [...results];
  const calls: Call[] = [];

  const from = jest.fn((table: string) => {
    const result = queue.shift() ?? { data: [], error: null };
    const builder: Record<string, unknown> = {};
    const chain =
      (method: string) =>
      (...args: unknown[]) => {
        calls.push({ table, method, args });
        return builder;
      };
    for (const m of ['select', 'insert', 'update', 'delete', 'upsert', 'eq', 'is', 'in', 'order']) {
      builder[m] = jest.fn(chain(m));
    }
    builder.single = jest.fn(() => Promise.resolve(result));
    builder.maybeSingle = jest.fn(() => Promise.resolve(result));
    builder.then = (resolve: (v: Result) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject);
    return builder;
  });
  const rpc = jest.fn(() => Promise.resolve({ data: null, error: null }));

  setSupabaseClientOverride({ from, rpc } as unknown as Parameters<
    typeof setSupabaseClientOverride
  >[0]);
  return { calls, from, rpc };
}

function linkInserts(calls: Call[]): Record<string, unknown>[] {
  return calls
    .filter((c) => c.table === 'goal_mark_links' && c.method === 'insert')
    .map((c) => c.args[0] as Record<string, unknown>);
}

afterEach(() => {
  setSupabaseClientOverride(null);
  jest.clearAllMocks();
});

const PACKAGE: AIGoalPackage = {
  goalTitle: 'Run a half marathon',
  timeframeWeeks: 12,
  confidence: 'high',
  marks: [
    { name: 'Morning run', icon: 'gym', frequency: 4, why: 'Builds endurance over time' },
    // Deliberately padded: the boundary must trim AI output before storing it.
    { name: 'Mobility', icon: 'stretch', frequency: 2, why: '  Prevents overtraining  ' },
  ],
};

describe('createFromAIPackage threads each mark why onto its link row', () => {
  it('every created mark link carries its own (normalized) rationale', async () => {
    mockCreateGoal.mockResolvedValue({ id: GOAL });
    // Per mark: marks.insert (single) → link revive update (empty) → link insert.
    const { calls } = makeClient([
      { data: { id: 'server-echo-1' }, error: null },
      { data: [], error: null },
      { data: null, error: null },
      { data: { id: 'server-echo-2' }, error: null },
      { data: [], error: null },
      { data: null, error: null },
    ]);

    await createFromAIPackage({
      userId: USER,
      isPro: false,
      goalText: 'run a half marathon',
      pkg: PACKAGE,
      title: 'Half marathon',
      marks: PACKAGE.marks,
    });

    const inserts = linkInserts(calls);
    expect(inserts).toHaveLength(2);
    expect(inserts[0]).toMatchObject({ goal_id: GOAL, why: 'Builds endurance over time' });
    expect(inserts[1]).toMatchObject({ goal_id: GOAL, why: 'Prevents overtraining' });
  });
});
