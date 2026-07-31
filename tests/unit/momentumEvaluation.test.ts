/**
 * M9 Phase 5A Task 6 — lib/goals/momentumEvaluation.ts, the query-layer
 * replacement for goalsSlice.evaluateActiveGoalsMomentum.
 *
 * The load-bearing claims:
 *   1. `lastActivityByMark` derives each mark's latest activity from live
 *      increment events ONLY — tombstoned rows and non-increment events never
 *      count — and INCLUDES today (unlike useCheckin's gap measurement): the
 *      retired `marks.last_activity_date` column was stamped on log, and
 *      same-day activity is what puts a goal on_track.
 *   2. `evaluateGoalsMomentum` evaluates ACTIVE goals only, stores a snapshot
 *      per goal in momentumSlice, and one goal's failure never blocks the rest.
 */

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  lastActivityByMark,
  momentumMarkInputs,
  evaluateGoalsMomentum,
} from '../../lib/goals/momentumEvaluation';
import { useMomentumStore } from '../../state/momentumSlice';
import type { MarkRow } from '../../lib/data/types';

const event = (
  markId: string,
  localDate: string,
  overrides: Partial<{ event_type: string; deleted_at: string | null }> = {},
) => ({
  mark_id: markId,
  event_type: overrides.event_type ?? 'increment',
  occurred_local_date: localDate,
  deleted_at: overrides.deleted_at ?? null,
});

const markRow = (id: string, overrides: Partial<MarkRow> = {}): MarkRow =>
  ({
    id,
    user_id: 'user-1',
    name: `Mark ${id}`,
    weekly_target: 7,
    deleted_at: null,
    ...overrides,
  }) as MarkRow;

describe('lastActivityByMark', () => {
  it('returns the latest live increment date per mark, today included', () => {
    const map = lastActivityByMark([
      event('a', '2026-07-29'),
      event('a', '2026-07-31'), // today counts
      event('b', '2026-07-20'),
    ]);
    expect(map.get('a')).toBe('2026-07-31');
    expect(map.get('b')).toBe('2026-07-20');
  });

  it('ignores tombstoned rows and non-increment events', () => {
    const map = lastActivityByMark([
      event('a', '2026-07-31', { deleted_at: '2026-07-31T10:00:00Z' }),
      event('a', '2026-07-25'),
      event('a', '2026-07-30', { event_type: 'decrement' }),
    ]);
    expect(map.get('a')).toBe('2026-07-25');
  });

  it('has no entry for a mark that never logged — momentum reads that as resting', () => {
    expect(lastActivityByMark([]).get('never')).toBeUndefined();
  });
});

describe('momentumMarkInputs', () => {
  it('projects id + weekly_target and fills activity from the derived map', () => {
    const inputs = momentumMarkInputs(
      [markRow('a', { weekly_target: 3 }), markRow('b')],
      new Map([['a', '2026-07-30']]),
    );
    expect(inputs).toEqual([
      { id: 'a', weekly_target: 3, last_activity_date: '2026-07-30' },
      { id: 'b', weekly_target: 7, last_activity_date: null },
    ]);
  });

  it('drops tombstoned marks, as the store version did', () => {
    const inputs = momentumMarkInputs(
      [markRow('dead', { deleted_at: '2026-07-01T00:00:00Z' })],
      new Map(),
    );
    expect(inputs).toEqual([]);
  });
});

describe('evaluateGoalsMomentum', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    useMomentumStore.setState({ snapshots: {} });
  });

  it('evaluates active goals only and stores one snapshot each', async () => {
    const result = await evaluateGoalsMomentum(
      [
        { id: 'g-active', status: 'active' },
        { id: 'g-done', status: 'completed' },
      ],
      { 'g-active': [markRow('a')], 'g-done': [markRow('b')] },
      [event('a', '2026-07-31')],
      '2026-07-31',
    );
    expect([...result.keys()]).toEqual(['g-active']);
    const stored = useMomentumStore.getState().snapshots['g-active'];
    expect(stored).toBeDefined();
    expect(useMomentumStore.getState().snapshots['g-done']).toBeUndefined();
    // Same-day activity on the goal's only mark ⇒ the goal is on track.
    expect(stored!.state).toBe('on_track');
  });

  it('a goal with a broken record does not block the others', async () => {
    // Poison one goal's persisted record so JSON.parse inside its evaluation
    // would fail if it were trusted; loadMomentumRecord swallows it, so the real
    // per-goal isolation lever is the try/catch around each evaluation. Assert
    // the catch by making setSnapshot throw once.
    const original = useMomentumStore.getState().setSnapshot;
    const throwing = jest
      .fn()
      .mockImplementationOnce(() => {
        throw new Error('injected');
      })
      .mockImplementation(original);
    useMomentumStore.setState({ setSnapshot: throwing } as never);
    try {
      const result = await evaluateGoalsMomentum(
        [
          { id: 'g-1', status: 'active' },
          { id: 'g-2', status: 'active' },
        ],
        { 'g-1': [markRow('a')], 'g-2': [markRow('b')] },
        [],
        '2026-07-31',
      );
      // g-1's evaluation succeeded (it stays in the returned map, as in the
      // store version) but its snapshot write threw — and g-2 still evaluated
      // AND stored. The isolation claim is about g-2, not g-1's bookkeeping.
      expect(result.has('g-1')).toBe(true);
      expect(useMomentumStore.getState().snapshots['g-1']).toBeUndefined();
      expect(result.has('g-2')).toBe(true);
      expect(useMomentumStore.getState().snapshots['g-2']).toBeDefined();
    } finally {
      useMomentumStore.setState({ setSnapshot: original } as never);
    }
  });
});
