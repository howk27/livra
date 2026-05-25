import { computePace, computeProjectedMiss, suggestNewTargetDate, isPaceBehind } from '../../lib/paceEngine';
import type { MarkEvent } from '../../types';
import { format, addDays, subDays } from 'date-fns';

function makeEvent(
  markId: string,
  date: string,
  overrides: Partial<MarkEvent> = {},
): MarkEvent {
  return {
    id: `evt-${markId}-${date}`,
    user_id: 'u1',
    mark_id: markId,
    event_type: 'increment',
    amount: 1,
    occurred_at: `${date}T12:00:00Z`,
    occurred_local_date: date,
    created_at: `${date}T12:00:00Z`,
    updated_at: `${date}T12:00:00Z`,
    ...overrides,
  };
}

const today = format(new Date(), 'yyyy-MM-dd');
const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd');
const oldDate = format(subDays(new Date(), 20), 'yyyy-MM-dd');

describe('computePace', () => {
  it('returns 1 when markCount is 0 (no alert)', () => {
    expect(computePace([], 0, 14)).toBe(1);
  });

  it('returns 1 when daysElapsed is 0 (no alert)', () => {
    expect(computePace([], 2, 0)).toBe(1);
  });

  it('counts distinct mark+date pairs', () => {
    // m1 checked today twice + m2 checked today once = 2 distinct pairs
    const events = [
      makeEvent('m1', today),
      makeEvent('m1', today),
      makeEvent('m2', today),
    ];
    expect(computePace(events, 2, 14)).toBeCloseTo(2 / 28);
  });

  it('excludes events older than 14 days', () => {
    const events = [makeEvent('m1', oldDate)];
    expect(computePace(events, 1, 14)).toBe(0);
  });

  it('caps lookback window at 14 days even if daysElapsed is larger', () => {
    const events = [makeEvent('m1', today), makeEvent('m1', yesterday)];
    expect(computePace(events, 1, 30)).toBeCloseTo(2 / 14);
  });

  it('excludes deleted events', () => {
    const events = [makeEvent('m1', today, { deleted_at: today })];
    expect(computePace(events, 1, 14)).toBe(0);
  });

  it('excludes non-increment events', () => {
    const events = [makeEvent('m1', today, { event_type: 'reset' })];
    expect(computePace(events, 1, 14)).toBe(0);
  });
});

describe('computeProjectedMiss', () => {
  it('returns 0 when pace is 1 (on track)', () => {
    const future = format(addDays(new Date(), 14), 'yyyy-MM-dd');
    expect(computeProjectedMiss(future, 1)).toBe(0);
  });

  it('returns correct miss for pace 0.5 and 14 remaining days', () => {
    const future = format(addDays(new Date(), 14), 'yyyy-MM-dd');
    // projectedDays = ceil(14 / 0.5) = 28; miss = 28 - 14 = 14
    expect(computeProjectedMiss(future, 0.5)).toBe(14);
  });

  it('floors to 30 extra days when pace is 0', () => {
    const future = format(addDays(new Date(), 10), 'yyyy-MM-dd');
    // projectedDays = 10 + 30 = 40; miss = 40 - 10 = 30
    expect(computeProjectedMiss(future, 0)).toBe(30);
  });

  it('returns 0 when target is already in the past', () => {
    const past = format(subDays(new Date(), 5), 'yyyy-MM-dd');
    expect(computeProjectedMiss(past, 0.5)).toBe(0);
  });
});

describe('suggestNewTargetDate', () => {
  it('returns today + projectedDays for pace 0.5 with 14 remaining', () => {
    const future = format(addDays(new Date(), 14), 'yyyy-MM-dd');
    const expected = format(addDays(new Date(), 28), 'yyyy-MM-dd');
    expect(suggestNewTargetDate(future, 0.5)).toBe(expected);
  });

  it('adds remainingDays + 30 when pace is 0', () => {
    const future = format(addDays(new Date(), 10), 'yyyy-MM-dd');
    const expected = format(addDays(new Date(), 40), 'yyyy-MM-dd');
    expect(suggestNewTargetDate(future, 0)).toBe(expected);
  });

  it('returns today + 30 when target is past and pace is 0', () => {
    const past = format(subDays(new Date(), 5), 'yyyy-MM-dd');
    const expected = format(addDays(new Date(), 30), 'yyyy-MM-dd');
    expect(suggestNewTargetDate(past, 0)).toBe(expected);
  });
});

describe('isPaceBehind', () => {
  it('returns false when miss is 0', () => {
    expect(isPaceBehind(0)).toBe(false);
  });

  it('returns false when miss is 6', () => {
    expect(isPaceBehind(6)).toBe(false);
  });

  it('returns true when miss is exactly 7', () => {
    expect(isPaceBehind(7)).toBe(true);
  });

  it('returns true when miss is 14', () => {
    expect(isPaceBehind(14)).toBe(true);
  });
});
