// tests/unit/goalLogic.test.ts
import {
  getActiveGoal,
  getActiveGoals,
  calculateGoalProgress,
  goalCommitmentTarget,
  goalWeekFraming,
} from '../../lib/goalLogic';
import type { Goal } from '../../types/goal';
import type { MarkEvent } from '../../types';

const g = (over: Partial<Goal>): Goal => ({
  id: 'x', user_id: 'u', title: 't', sort_index: 0, status: 'active',
  current_mark_count: 0, created_at: '2026-01-01', updated_at: '2026-01-01', ...over,
});

test('getActiveGoals returns all active sorted by sort_index', () => {
  const goals = [
    g({ id: 'b', sort_index: 1 }),
    g({ id: 'a', sort_index: 0 }),
    g({ id: 'c', status: 'completed' }),
  ];
  expect(getActiveGoals(goals).map((x) => x.id)).toEqual(['a', 'b']);
});

test('getActiveGoal returns the first active by sort_index', () => {
  const goals = [g({ id: 'b', sort_index: 1 }), g({ id: 'a', sort_index: 0 })];
  expect(getActiveGoal(goals)?.id).toBe('a');
});

// ── calculateGoalProgress: check-in DAYS, not taps ───────────────────────────

const ev = (over: Partial<MarkEvent>): MarkEvent => ({
  id: Math.random().toString(36).slice(2),
  user_id: 'u',
  mark_id: 'm1',
  event_type: 'increment',
  amount: 1,
  occurred_at: '2026-07-01T10:00:00Z',
  occurred_local_date: '2026-07-01',
  created_at: '2026-07-01T10:00:00Z',
  updated_at: '2026-07-01T10:00:00Z',
  ...over,
});

describe('calculateGoalProgress (day-based)', () => {
  const goal = g({ linked_mark_ids: ['m1', 'm2'] });

  test('spamming + on one mark in one day counts as 1', () => {
    const events = Array.from({ length: 7 }, () => ev({ occurred_local_date: '2026-07-01' }));
    expect(calculateGoalProgress(goal, events)).toBe(1);
  });

  test('one mark across three days counts as 3', () => {
    const events = ['2026-07-01', '2026-07-02', '2026-07-03'].map(d =>
      ev({ occurred_local_date: d })
    );
    expect(calculateGoalProgress(goal, events)).toBe(3);
  });

  test('two marks on the same day count as 2 (one per mark per day)', () => {
    const events = [
      ev({ mark_id: 'm1', occurred_local_date: '2026-07-01' }),
      ev({ mark_id: 'm2', occurred_local_date: '2026-07-01' }),
    ];
    expect(calculateGoalProgress(goal, events)).toBe(2);
  });

  test('unlinked marks and deleted/non-increment events never count', () => {
    const events = [
      ev({ mark_id: 'other', occurred_local_date: '2026-07-01' }),
      ev({ deleted_at: '2026-07-02T00:00:00Z', occurred_local_date: '2026-07-02' }),
      ev({ event_type: 'reset', occurred_local_date: '2026-07-03' }),
    ];
    expect(calculateGoalProgress(goal, events)).toBe(0);
  });

  test('a day only counts once the mark meets its daily target', () => {
    const marks = [{ id: 'm1', dailyTarget: 3 }];
    const oneRep = [ev({ occurred_local_date: '2026-07-01' })];
    const threeReps = Array.from({ length: 3 }, () => ev({ occurred_local_date: '2026-07-01' }));
    expect(calculateGoalProgress(goal, oneRep, marks)).toBe(0);
    expect(calculateGoalProgress(goal, threeReps, marks)).toBe(1);
  });

  test('amount sums toward the daily target', () => {
    const marks = [{ id: 'm1', dailyTarget: 3 }];
    const events = [ev({ amount: 3, occurred_local_date: '2026-07-01' })];
    expect(calculateGoalProgress(goal, events, marks)).toBe(1);
  });

  test('no linked marks means 0', () => {
    expect(calculateGoalProgress(g({}), [ev({})])).toBe(0);
  });
});

// ── goalCommitmentTarget ─────────────────────────────────────────────────────

describe('goalCommitmentTarget', () => {
  test('returns the creation-time commitment when set', () => {
    expect(goalCommitmentTarget(g({ target_mark_count: 84 }))).toBe(84);
  });
  test('null when unset, null, or zero', () => {
    expect(goalCommitmentTarget(g({}))).toBeNull();
    expect(goalCommitmentTarget(g({ target_mark_count: null }))).toBeNull();
    expect(goalCommitmentTarget(g({ target_mark_count: 0 }))).toBeNull();
  });
});

// ── goalWeekFraming ──────────────────────────────────────────────────────────

describe('goalWeekFraming', () => {
  const DAY = 86_400_000;
  const created = '2026-07-01T00:00:00Z';
  const t0 = new Date(created).getTime();

  test('week 1 on the day of creation', () => {
    expect(goalWeekFraming(g({ tier: 'building', created_at: created }), t0)).toEqual({
      week: 1,
      totalWeeks: 10,
    });
  });

  test('week advances every 7 days', () => {
    expect(goalWeekFraming(g({ tier: 'building', created_at: created }), t0 + 7 * DAY)).toEqual({
      week: 2,
      totalWeeks: 10,
    });
  });

  test('caps at the tier duration', () => {
    expect(goalWeekFraming(g({ tier: 'starting', created_at: created }), t0 + 400 * DAY)).toEqual({
      week: 6,
      totalWeeks: 6,
    });
  });

  test('null when the goal has no tier', () => {
    expect(goalWeekFraming(g({ created_at: created }), t0)).toBeNull();
  });
});
