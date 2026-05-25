import { classifyMarkTier, isMarkFirstWeek } from '../../lib/weeklyReflectionLogic';
import { getReflectionCopy } from '../../lib/weeklyReflectionCopy';
import type { MarkEvent } from '../../types';

const WEEK_DATES = ['2026-05-18','2026-05-19','2026-05-20','2026-05-21','2026-05-22','2026-05-23','2026-05-24'];
const WEEK_START = '2026-05-18';
const MARK_ID = 'mark-1';

function makeEvent(date: string): MarkEvent {
  return {
    id: `e-${date}`,
    user_id: 'u1',
    mark_id: MARK_ID,
    event_type: 'increment',
    amount: 1,
    occurred_at: `${date}T08:00:00Z`,
    occurred_local_date: date,
    created_at: `${date}T08:00:00Z`,
    updated_at: `${date}T08:00:00Z`,
  } as MarkEvent;
}

describe('classifyMarkTier', () => {
  test('first_week overrides all else', () => {
    expect(classifyMarkTier(MARK_ID, [], WEEK_DATES, true)).toBe('first_week');
  });
  test('missing — 0 days logged', () => {
    expect(classifyMarkTier(MARK_ID, [], WEEK_DATES, false)).toBe('missing');
  });
  test('strong — 5 of 7 days', () => {
    const events = ['2026-05-18','2026-05-19','2026-05-20','2026-05-21','2026-05-22'].map(makeEvent);
    expect(classifyMarkTier(MARK_ID, events, WEEK_DATES, false)).toBe('strong');
  });
  test('strong — 7 of 7 days', () => {
    const events = WEEK_DATES.map(makeEvent);
    expect(classifyMarkTier(MARK_ID, events, WEEK_DATES, false)).toBe('strong');
  });
  test('solid — 3 of 7 days', () => {
    const events = ['2026-05-18','2026-05-19','2026-05-20'].map(makeEvent);
    expect(classifyMarkTier(MARK_ID, events, WEEK_DATES, false)).toBe('solid');
  });
  test('solid — 4 of 7 days', () => {
    const events = ['2026-05-18','2026-05-19','2026-05-20','2026-05-21'].map(makeEvent);
    expect(classifyMarkTier(MARK_ID, events, WEEK_DATES, false)).toBe('solid');
  });
  test('inconsistent — 1 of 7 days', () => {
    expect(classifyMarkTier(MARK_ID, [makeEvent('2026-05-18')], WEEK_DATES, false)).toBe('inconsistent');
  });
  test('inconsistent — 2 of 7 days', () => {
    const events = ['2026-05-18','2026-05-20'].map(makeEvent);
    expect(classifyMarkTier(MARK_ID, events, WEEK_DATES, false)).toBe('inconsistent');
  });
  test('ignores deleted events', () => {
    const events = WEEK_DATES.map(d => ({ ...makeEvent(d), deleted_at: '2026-05-25T00:00:00Z' })) as MarkEvent[];
    expect(classifyMarkTier(MARK_ID, events, WEEK_DATES, false)).toBe('missing');
  });
  test('ignores events outside the week window', () => {
    const events = [makeEvent('2026-05-10'), makeEvent('2026-05-11')];
    expect(classifyMarkTier(MARK_ID, events, WEEK_DATES, false)).toBe('missing');
  });
  test('ignores events for other marks', () => {
    const events = WEEK_DATES.map(d => ({ ...makeEvent(d), mark_id: 'other-mark' })) as MarkEvent[];
    expect(classifyMarkTier(MARK_ID, events, WEEK_DATES, false)).toBe('missing');
  });
});

describe('isMarkFirstWeek', () => {
  test('true if created 3 days before weekStart', () => {
    expect(isMarkFirstWeek('2026-05-15T00:00:00Z', WEEK_START)).toBe(true);
  });
  test('true if created on weekStart', () => {
    expect(isMarkFirstWeek('2026-05-18T00:00:00Z', WEEK_START)).toBe(true);
  });
  test('false if created 7 or more days before weekStart', () => {
    expect(isMarkFirstWeek('2026-05-11T00:00:00Z', WEEK_START)).toBe(false);
  });
});

describe('getReflectionCopy', () => {
  const tiers = ['strong','solid','inconsistent','missing','first_week'] as const;
  test.each(tiers)('%s returns non-empty title and body', (tier) => {
    const { title, body } = getReflectionCopy(tier, MARK_ID, WEEK_START);
    expect(title.length).toBeGreaterThan(0);
    expect(body.length).toBeGreaterThan(0);
  });
  test('same mark+week always returns same copy', () => {
    expect(getReflectionCopy('strong', MARK_ID, WEEK_START)).toEqual(
      getReflectionCopy('strong', MARK_ID, WEEK_START)
    );
  });
  test('different marks may return different copy', () => {
    const results = new Set(['m1','m2','m3','m4','m5','m6','m7','m8','m9','m10'].map(
      id => getReflectionCopy('strong', id, WEEK_START).title
    ));
    expect(results.size).toBeGreaterThan(1);
  });
});
