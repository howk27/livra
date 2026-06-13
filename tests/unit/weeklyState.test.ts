// tests/unit/weeklyState.test.ts
// Tests for currentWeekDates, markWeeklyState, and computeCompletionsThisWeek.

jest.mock('../../lib/appDate', () => ({ getAppDate: jest.fn(() => new Date()) }));
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));
// appDateSlice is imported by lib/appDate at module level — stub it out.
jest.mock('../../state/appDateSlice', () => ({
  useAppDateStore: { getState: jest.fn(() => ({ debugDateOverride: undefined })) },
}));

import { getAppDate } from '../../lib/appDate';
import {
  currentWeekDates,
  markWeeklyState,
  computeCompletionsThisWeek,
} from '../../lib/features';
import type { MarkEvent } from '../../types';

const mockGetAppDate = getAppDate as jest.MockedFunction<typeof getAppDate>;

afterEach(() => {
  mockGetAppDate.mockReset();
});

// ── Helpers ─────────────────────────────────────────────────────────────────

function setFakeDate(isoDate: string): void {
  const [y, m, d] = isoDate.split('-').map(Number);
  mockGetAppDate.mockReturnValue(new Date(y, m - 1, d, 12, 0, 0, 0));
}

function makeEvent(overrides: Partial<MarkEvent>): MarkEvent {
  return {
    id: overrides.id ?? 'e1',
    user_id: 'u1',
    mark_id: overrides.mark_id ?? 'm1',
    event_type: overrides.event_type ?? 'increment',
    amount: overrides.amount ?? 1,
    occurred_at: overrides.occurred_at ?? new Date().toISOString(),
    occurred_local_date: overrides.occurred_local_date ?? '2026-06-08',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    deleted_at: overrides.deleted_at ?? null,
    meta: overrides.meta,
  };
}

// ── currentWeekDates ─────────────────────────────────────────────────────────

describe('currentWeekDates', () => {
  it('returns exactly 7 ISO date strings', () => {
    setFakeDate('2026-06-10'); // Wednesday
    const dates = currentWeekDates();
    expect(dates).toHaveLength(7);
    dates.forEach(d => expect(d).toMatch(/^\d{4}-\d{2}-\d{2}$/));
  });

  it('first date is Monday and last is Sunday', () => {
    setFakeDate('2026-06-10'); // Wednesday → week Mon 2026-06-08 .. Sun 2026-06-14
    const dates = currentWeekDates();
    expect(dates[0]).toBe('2026-06-08'); // Monday
    expect(dates[6]).toBe('2026-06-14'); // Sunday
  });

  it('covers the correct week when today is Monday', () => {
    setFakeDate('2026-06-08'); // Monday
    const dates = currentWeekDates();
    expect(dates[0]).toBe('2026-06-08');
    expect(dates[6]).toBe('2026-06-14');
  });

  it('covers the correct week when today is Sunday', () => {
    setFakeDate('2026-06-14'); // Sunday
    const dates = currentWeekDates();
    expect(dates[0]).toBe('2026-06-08'); // Monday of same week
    expect(dates[6]).toBe('2026-06-14');
  });

  it('covers the correct week when today is Saturday', () => {
    setFakeDate('2026-06-13'); // Saturday
    const dates = currentWeekDates();
    expect(dates[0]).toBe('2026-06-08');
    expect(dates[6]).toBe('2026-06-14');
  });

  it('returns consecutive dates Mon through Sun', () => {
    setFakeDate('2026-06-10');
    const dates = currentWeekDates();
    for (let i = 1; i < 7; i++) {
      const prev = new Date(dates[i - 1]);
      const curr = new Date(dates[i]);
      expect(curr.getTime() - prev.getTime()).toBe(24 * 60 * 60 * 1000);
    }
  });
});

// ── markWeeklyState ──────────────────────────────────────────────────────────

describe('markWeeklyState', () => {
  it('returns "due" when below target', () => {
    expect(markWeeklyState({ weekly_target: 3, frequency_kind: 'variable' }, 2)).toBe('due');
  });

  it('returns "doneForWeek" at target', () => {
    expect(markWeeklyState({ weekly_target: 3, frequency_kind: 'variable' }, 3)).toBe('doneForWeek');
  });

  it('returns "doneForWeek" above target', () => {
    expect(markWeeklyState({ weekly_target: 3, frequency_kind: 'variable' }, 5)).toBe('doneForWeek');
  });

  it('defaults to target=3 when weekly_target is null', () => {
    expect(markWeeklyState({ weekly_target: null, frequency_kind: 'variable' }, 2)).toBe('due');
    expect(markWeeklyState({ weekly_target: null, frequency_kind: 'variable' }, 3)).toBe('doneForWeek');
  });

  it('fixed mark returns "doneForWeek" at 7 completions (no special casing — caller gates UI)', () => {
    expect(markWeeklyState({ weekly_target: 7, frequency_kind: 'fixed' }, 7)).toBe('doneForWeek');
  });

  it('returns "due" at 0 completions', () => {
    expect(markWeeklyState({ weekly_target: 5, frequency_kind: 'variable' }, 0)).toBe('due');
  });
});

// ── computeCompletionsThisWeek ───────────────────────────────────────────────

describe('computeCompletionsThisWeek', () => {
  const mark = { id: 'm1', dailyTarget: 1 };
  const weekDates = [
    '2026-06-08', '2026-06-09', '2026-06-10',
    '2026-06-11', '2026-06-12', '2026-06-13', '2026-06-14',
  ];

  it('returns 0 for empty events', () => {
    expect(computeCompletionsThisWeek(mark, [], weekDates)).toBe(0);
  });

  it('counts 1 completed day for 3 logs on the same day (bar=1)', () => {
    const events = [
      makeEvent({ occurred_local_date: '2026-06-10', amount: 1 }),
      makeEvent({ id: 'e2', occurred_local_date: '2026-06-10', amount: 1 }),
      makeEvent({ id: 'e3', occurred_local_date: '2026-06-10', amount: 1 }),
    ];
    expect(computeCompletionsThisWeek(mark, events, weekDates)).toBe(1);
  });

  it('counts multiple distinct completed days', () => {
    const events = [
      makeEvent({ occurred_local_date: '2026-06-08' }),
      makeEvent({ id: 'e2', occurred_local_date: '2026-06-10' }),
      makeEvent({ id: 'e3', occurred_local_date: '2026-06-12' }),
    ];
    expect(computeCompletionsThisWeek(mark, events, weekDates)).toBe(3);
  });

  it('handles daily bar > 1: partial day not counted (Water: bar=8)', () => {
    const waterMark = { id: 'm1', dailyTarget: 8 };
    const events = [
      makeEvent({ occurred_local_date: '2026-06-08', amount: 7 }), // under bar
      makeEvent({ id: 'e2', occurred_local_date: '2026-06-09', amount: 8 }), // meets bar
    ];
    expect(computeCompletionsThisWeek(waterMark, events, weekDates)).toBe(1);
  });

  it('does not count events outside the week', () => {
    const events = [
      makeEvent({ occurred_local_date: '2026-06-07' }), // before Mon
      makeEvent({ id: 'e2', occurred_local_date: '2026-06-15' }), // after Sun
      makeEvent({ id: 'e3', occurred_local_date: '2026-06-10' }), // in week
    ];
    expect(computeCompletionsThisWeek(mark, events, weekDates)).toBe(1);
  });

  it('does not count deleted events', () => {
    const events = [
      makeEvent({ occurred_local_date: '2026-06-10', deleted_at: '2026-06-10T12:00:00Z' }),
      makeEvent({ id: 'e2', occurred_local_date: '2026-06-11' }), // valid
    ];
    expect(computeCompletionsThisWeek(mark, events, weekDates)).toBe(1);
  });

  it('does not count decrement events', () => {
    const events = [
      makeEvent({ occurred_local_date: '2026-06-10', event_type: 'decrement' }),
    ];
    expect(computeCompletionsThisWeek(mark, events, weekDates)).toBe(0);
  });

  // Phase 2 will cap weekly consistency math at weekly_target; this test verifies the raw count passthrough
  it('Phase 2 passthrough: raw count exceeds weekly_target but markWeeklyState still returns doneForWeek', () => {
    const variableMark = { id: 'm1', dailyTarget: 1, weekly_target: 3, frequency_kind: 'variable' as const };
    // 5 distinct completed days in the week
    const events = [
      makeEvent({ id: 'e1', occurred_local_date: '2026-06-08' }),
      makeEvent({ id: 'e2', occurred_local_date: '2026-06-09' }),
      makeEvent({ id: 'e3', occurred_local_date: '2026-06-10' }),
      makeEvent({ id: 'e4', occurred_local_date: '2026-06-11' }),
      makeEvent({ id: 'e5', occurred_local_date: '2026-06-12' }),
    ];
    const rawCount = computeCompletionsThisWeek(variableMark, events, weekDates);
    // Raw count is 5 — uncapped (Phase 2 will cap at weekly_target=3 for consistency math)
    expect(rawCount).toBe(5);
    expect(markWeeklyState(variableMark, rawCount)).toBe('doneForWeek');
  });
});
