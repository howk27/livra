// tests/unit/goalLogic.test.ts
import {
  getActiveGoal,
  getActiveGoals,
  calculateGoalProgress,
  calculateUnlockThreshold,
  goalCommitmentTarget,
  goalWeekFraming,
  isDeadlineExpired,
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

// ── isDeadlineExpired: boundary tests restored from the deleted goalStore.test.ts;
// the function now gates the server-writing expiry pass in lib/goals/goalLifecycle.ts ──

describe('isDeadlineExpired', () => {
  const past = new Date(Date.now() - 86_400_000).toISOString();
  const future = new Date(Date.now() + 86_400_000).toISOString();

  test('false when no deadline', () => {
    expect(isDeadlineExpired(g({}))).toBe(false);
  });

  test('false when deadline is in the future', () => {
    expect(isDeadlineExpired(g({ deadline_date: future }))).toBe(false);
  });

  test('true when deadline has passed and status is active', () => {
    expect(isDeadlineExpired(g({ deadline_date: past }))).toBe(true);
  });

  test('false when deadline has passed but status is completed', () => {
    expect(isDeadlineExpired(g({ deadline_date: past, status: 'completed' }))).toBe(false);
  });

  test('false when deadline has passed but status is paused', () => {
    expect(isDeadlineExpired(g({ deadline_date: past, status: 'paused' }))).toBe(false);
  });

  test('falls back to target_date when deadline_date absent', () => {
    expect(isDeadlineExpired(g({ target_date: past }))).toBe(true);
  });

  test('deadline_date wins over target_date when both present', () => {
    expect(isDeadlineExpired(g({ deadline_date: future, target_date: past }))).toBe(false);
  });
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

// ── calculateUnlockThreshold: mark-days, scaled by linked mark count ─────────

describe('calculateUnlockThreshold', () => {
  // Progress counts one per linked mark per day, so the unlock floor must
  // scale the same way — a flat 7 under two marks filled in half the claimed
  // effort (founder device report 2026-07-26: "two marks and 7 check-ins
  // doesn't add up").
  const today = () => new Date().toISOString();
  const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

  test('fresh one-mark goal floors at 7', () => {
    expect(calculateUnlockThreshold(g({ created_at: today(), linked_mark_ids: ['m1'] }))).toBe(7);
  });

  test('fresh two-mark goal floors at 14 — the floor scales with marks', () => {
    expect(
      calculateUnlockThreshold(g({ created_at: today(), linked_mark_ids: ['m1', 'm2'] })),
    ).toBe(14);
  });

  test('no linked marks behaves as one mark (never zero)', () => {
    expect(calculateUnlockThreshold(g({ created_at: today() }))).toBe(7);
    expect(calculateUnlockThreshold(g({ created_at: today(), linked_mark_ids: [] }))).toBe(7);
  });

  test('age growth scales by mark count too (20 days, 2 marks → 32)', () => {
    // floor(20 × 0.8) = 16 mark-days per mark.
    expect(calculateUnlockThreshold(g({ created_at: daysAgo(20), linked_mark_ids: ['m1'] }))).toBe(16);
    expect(
      calculateUnlockThreshold(g({ created_at: daysAgo(20), linked_mark_ids: ['m1', 'm2'] })),
    ).toBe(32);
  });

  test('cap is per-mark as well (ancient goal, 2 marks → 730)', () => {
    expect(
      calculateUnlockThreshold(g({ created_at: daysAgo(2000), linked_mark_ids: ['m1', 'm2'] })),
    ).toBe(730);
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
