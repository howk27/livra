/**
 * M9 Phase 5A Task 6 — lib/goals/goalLifecycle.ts, the query-layer replacement
 * for goalsSlice.creditMarkToGoals / checkAllGoalExpiry.
 *
 * Load-bearing claims:
 *   1. ONE credit per mark per local day — a second increment on the latest day
 *      earns no count write, but momentum still evaluates (the day counts).
 *   2. The credit lands on every ACTIVE holder goal (membership through links),
 *      never on completed/expired holders.
 *   3. A passed deadline expires the goal: server flip + momentum snapshot
 *      cleared + maintenance conversion — and only deadlined goals.
 *   4. One goal's failed write never blocks the others (per-goal isolation).
 */

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('../../lib/data/mutations/goals', () => ({
  creditGoalMarkCount: jest.fn().mockResolvedValue(undefined),
  expireGoal: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../lib/data/mutations/marks', () => ({
  convertGoalMarksToMaintenance: jest.fn().mockResolvedValue(undefined),
}));

import { QueryClient } from '@tanstack/react-query';
import {
  alreadyCreditedToday,
  creditMarkToGoals,
  expireDeadlinedGoals,
} from '../../lib/goals/goalLifecycle';
import { creditGoalMarkCount, expireGoal } from '../../lib/data/mutations/goals';
import { convertGoalMarksToMaintenance } from '../../lib/data/mutations/marks';
import { queryKeys } from '../../lib/data/queryKeys';
import { useMomentumStore } from '../../state/momentumSlice';
import type { GoalRow, MarkRow, MarkEventRow } from '../../lib/data/types';

const USER = 'user-1';

const goalRow = (id: string, overrides: Partial<GoalRow> = {}): GoalRow =>
  ({
    id,
    user_id: USER,
    title: `Goal ${id}`,
    status: 'active',
    sort_index: 0,
    current_mark_count: 5,
    target_mark_count: 20,
    deadline_date: null,
    completed_at: null,
    created_at: '2026-06-01T00:00:00Z',
    updated_at: '2026-06-01T00:00:00Z',
    deleted_at: null,
    ...overrides,
  }) as GoalRow;

const markRow = (id: string): MarkRow =>
  ({ id, user_id: USER, name: `Mark ${id}`, deleted_at: null }) as MarkRow;

const increment = (markId: string, localDate: string): MarkEventRow =>
  ({
    id: `${markId}-${localDate}-${Math.random()}`,
    user_id: USER,
    mark_id: markId,
    event_type: 'increment',
    occurred_at: `${localDate}T10:00:00Z`,
    occurred_local_date: localDate,
    deleted_at: null,
  }) as MarkEventRow;

function seededClient(
  goals: GoalRow[],
  marksByGoal: Record<string, MarkRow[]>,
  events: MarkEventRow[],
): QueryClient {
  // Infinity keeps the cache from scheduling GC timers, which otherwise hold
  // the jest process open after the run.
  const client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
  client.setQueryData(queryKeys.goals(USER), goals);
  client.setQueryData(queryKeys.marksByGoal(USER), marksByGoal);
  client.setQueryData(queryKeys.userCheckins(USER), events);
  client.setQueryData(queryKeys.marks(USER), Object.values(marksByGoal).flat());
  return client;
}

beforeEach(() => {
  jest.clearAllMocks();
  useMomentumStore.setState({ snapshots: {} });
});

describe('alreadyCreditedToday', () => {
  it('false on the first increment of the latest day', () => {
    expect(alreadyCreditedToday([increment('a', '2026-07-31')], 'a')).toBe(false);
  });

  it('true on the second increment of the latest day', () => {
    expect(
      alreadyCreditedToday([increment('a', '2026-07-31'), increment('a', '2026-07-31')], 'a'),
    ).toBe(true);
  });

  it('yesterday’s events never make today read as credited', () => {
    expect(
      alreadyCreditedToday(
        [increment('a', '2026-07-30'), increment('a', '2026-07-30'), increment('a', '2026-07-31')],
        'a',
      ),
    ).toBe(false);
  });

  it('other marks’ events are invisible', () => {
    expect(
      alreadyCreditedToday([increment('b', '2026-07-31'), increment('a', '2026-07-31')], 'a'),
    ).toBe(false);
  });
});

describe('creditMarkToGoals', () => {
  it('credits every ACTIVE holder goal by one, through links', async () => {
    const client = seededClient(
      [goalRow('g1'), goalRow('g2', { current_mark_count: 9 }), goalRow('g3', { status: 'completed' })],
      { g1: [markRow('a')], g2: [markRow('a'), markRow('b')], g3: [markRow('a')] },
      [increment('a', '2026-07-31')],
    );
    await creditMarkToGoals(client, USER, 'a', [increment('a', '2026-07-31')]);
    expect(creditGoalMarkCount).toHaveBeenCalledWith('g1', 6);
    expect(creditGoalMarkCount).toHaveBeenCalledWith('g2', 10);
    // The completed holder is never credited.
    expect(jest.mocked(creditGoalMarkCount).mock.calls.map((c) => c[0])).not.toContain('g3');
  });

  it('a second same-day log earns no count write but still evaluates momentum', async () => {
    const events = [increment('a', '2026-07-31'), increment('a', '2026-07-31')];
    const client = seededClient([goalRow('g1')], { g1: [markRow('a')] }, events);
    await creditMarkToGoals(client, USER, 'a', events);
    expect(creditGoalMarkCount).not.toHaveBeenCalled();
    // Momentum stored a snapshot for the holder goal regardless.
    expect(useMomentumStore.getState().snapshots['g1']).toBeDefined();
  });

  it('a mark held by no active goal is a no-op', async () => {
    const client = seededClient([goalRow('g1')], { g1: [markRow('b')] }, []);
    await creditMarkToGoals(client, USER, 'a', [increment('a', '2026-07-31')]);
    expect(creditGoalMarkCount).not.toHaveBeenCalled();
    expect(expireGoal).not.toHaveBeenCalled();
  });

  it('one holder’s failed credit does not block the other holder', async () => {
    jest.mocked(creditGoalMarkCount).mockRejectedValueOnce(new Error('injected'));
    const client = seededClient(
      [goalRow('g1'), goalRow('g2')],
      { g1: [markRow('a')], g2: [markRow('a')] },
      [increment('a', '2026-07-31')],
    );
    await creditMarkToGoals(client, USER, 'a', [increment('a', '2026-07-31')]);
    expect(creditGoalMarkCount).toHaveBeenCalledTimes(2);
  });
});

describe('expireDeadlinedGoals', () => {
  it('expires only active goals whose deadline has passed: flip + snapshot cleared + maintenance', async () => {
    useMomentumStore.setState({
      snapshots: {
        deadlined: { state: 'on_track', days: 3, cushionRemaining: null, slippingMarkId: null },
      },
    } as never);
    const client = seededClient(
      [
        goalRow('deadlined', { deadline_date: '2020-01-01' }),
        goalRow('future', { deadline_date: '2999-01-01' }),
        goalRow('no-deadline'),
        goalRow('done', { status: 'completed', deadline_date: '2020-01-01' }),
      ],
      {},
      [],
    );
    const expired = await expireDeadlinedGoals(client, USER);
    expect(expired).toEqual(['deadlined']);
    expect(expireGoal).toHaveBeenCalledTimes(1);
    expect(expireGoal).toHaveBeenCalledWith('deadlined');
    expect(convertGoalMarksToMaintenance).toHaveBeenCalledWith('deadlined');
    expect(useMomentumStore.getState().snapshots['deadlined']).toBeUndefined();
  });

  it('scopes to onlyGoalIds when given', async () => {
    const client = seededClient(
      [
        goalRow('in-scope', { deadline_date: '2020-01-01' }),
        goalRow('out-of-scope', { deadline_date: '2020-01-01' }),
      ],
      {},
      [],
    );
    const expired = await expireDeadlinedGoals(client, USER, ['in-scope']);
    expect(expired).toEqual(['in-scope']);
    expect(expireGoal).toHaveBeenCalledTimes(1);
  });

  it('converts marks BEFORE the status flip, so a conversion failure stays retryable', async () => {
    // The Task 7 review finding: with expire-first, a failed maintenance
    // conversion is NEVER retried — the next tick skips the goal because its
    // status is no longer 'active'. Convert-first keeps the goal active on
    // either failure, and the conversion is idempotent, so the next tick
    // re-runs both halves.
    jest.mocked(convertGoalMarksToMaintenance).mockRejectedValueOnce(new Error('injected'));
    const client = seededClient([goalRow('deadlined', { deadline_date: '2020-01-01' })], {}, []);
    const expired = await expireDeadlinedGoals(client, USER);
    expect(expired).toEqual([]);
    expect(expireGoal).not.toHaveBeenCalled();
  });

  it('runs conversion before the flip in the success path too', async () => {
    const client = seededClient([goalRow('deadlined', { deadline_date: '2020-01-01' })], {}, []);
    await expireDeadlinedGoals(client, USER);
    const convertOrder = jest.mocked(convertGoalMarksToMaintenance).mock.invocationCallOrder[0];
    const expireOrder = jest.mocked(expireGoal).mock.invocationCallOrder[0];
    expect(convertOrder).toBeLessThan(expireOrder);
  });

  it('one goal’s failed expiry does not block the next', async () => {
    jest.mocked(expireGoal).mockRejectedValueOnce(new Error('injected'));
    const client = seededClient(
      [
        goalRow('g1', { deadline_date: '2020-01-01' }),
        goalRow('g2', { deadline_date: '2020-01-01' }),
      ],
      {},
      [],
    );
    const expired = await expireDeadlinedGoals(client, USER);
    expect(expired).toEqual(['g2']);
    expect(expireGoal).toHaveBeenCalledTimes(2);
  });
});
