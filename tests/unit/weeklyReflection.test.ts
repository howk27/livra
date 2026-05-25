jest.mock('../../lib/health/healthReader');

import { classifyMarkTier, isMarkFirstWeek, buildReflectionItems } from '../../lib/weeklyReflectionLogic';
import { getReflectionCopy } from '../../lib/weeklyReflectionCopy';
import { readHealthDays } from '../../lib/health/healthReader';
import type { MarkEvent, Mark } from '../../types';

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
  test('false if created 3 days before weekStart', () => {
    expect(isMarkFirstWeek('2026-05-15T00:00:00Z', WEEK_START)).toBe(false);
  });
  test('true if created on weekStart', () => {
    expect(isMarkFirstWeek('2026-05-18T00:00:00Z', WEEK_START)).toBe(true);
  });
  test('true if created after weekStart (mid-week)', () => {
    expect(isMarkFirstWeek('2026-05-20T00:00:00Z', WEEK_START)).toBe(true);
  });
  test('false if created 7 or more days before weekStart', () => {
    expect(isMarkFirstWeek('2026-05-11T00:00:00Z', WEEK_START)).toBe(false);
  });
});

describe('classifyMarkTier — healthDays override', () => {
  test('healthDays replaces events — 5 active days → strong', () => {
    const healthDays = new Set(['2026-05-18','2026-05-19','2026-05-20','2026-05-21','2026-05-22']);
    expect(classifyMarkTier(MARK_ID, [], WEEK_DATES, false, healthDays)).toBe('strong');
  });

  test('healthDays replaces events — 3 active days → solid', () => {
    const healthDays = new Set(['2026-05-18','2026-05-19','2026-05-20']);
    expect(classifyMarkTier(MARK_ID, [], WEEK_DATES, false, healthDays)).toBe('solid');
  });

  test('healthDays replaces events — 1 active day → inconsistent', () => {
    const healthDays = new Set(['2026-05-18']);
    expect(classifyMarkTier(MARK_ID, [], WEEK_DATES, false, healthDays)).toBe('inconsistent');
  });

  test('healthDays replaces events — 0 active days → missing', () => {
    expect(classifyMarkTier(MARK_ID, [], WEEK_DATES, false, new Set())).toBe('missing');
  });

  test('empty healthDays falls back to events', () => {
    const events = WEEK_DATES.map(makeEvent);
    expect(classifyMarkTier(MARK_ID, events, WEEK_DATES, false, new Set())).toBe('strong');
  });

  test('undefined healthDays falls back to events', () => {
    const events = WEEK_DATES.map(makeEvent);
    expect(classifyMarkTier(MARK_ID, events, WEEK_DATES, false, undefined)).toBe('strong');
  });

  test('first_week still overrides even with healthDays', () => {
    const healthDays = new Set(WEEK_DATES);
    expect(classifyMarkTier(MARK_ID, [], WEEK_DATES, true, healthDays)).toBe('first_week');
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

const BASE_MARK: Mark = {
  id: MARK_ID,
  user_id: 'u1',
  name: 'Workout',
  unit: 'sessions',
  enable_streak: false,
  sort_index: 0,
  total: 0,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

describe('buildReflectionItems', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (readHealthDays as jest.Mock).mockResolvedValue(new Set<string>());
  });

  test('returns one item per mark', async () => {
    const items = await buildReflectionItems([BASE_MARK], [], WEEK_DATES, WEEK_START);
    expect(items).toHaveLength(1);
    expect(items[0]!.mark).toBe(BASE_MARK);
  });

  test('uses healthDays when mark has health_kit_type', async () => {
    const healthMark: Mark = { ...BASE_MARK, health_kit_type: 'workout' as any };
    const activeDays = new Set(['2026-05-18','2026-05-19','2026-05-20','2026-05-21','2026-05-22']);
    (readHealthDays as jest.Mock).mockResolvedValue(activeDays);

    const items = await buildReflectionItems([healthMark], [], WEEK_DATES, WEEK_START);
    expect(items[0]!.tier).toBe('strong');
    expect(readHealthDays).toHaveBeenCalledWith('workout', WEEK_DATES, undefined);
  });

  test('falls back to events when health read fails', async () => {
    const healthMark: Mark = { ...BASE_MARK, health_kit_type: 'workout' as any };
    (readHealthDays as jest.Mock).mockRejectedValue(new Error('HealthKit unavailable'));
    const events = WEEK_DATES.map(makeEvent);

    const items = await buildReflectionItems([healthMark], events, WEEK_DATES, WEEK_START);
    expect(items[0]!.tier).toBe('strong');
  });

  test('unconnected mark uses events', async () => {
    const events = [makeEvent('2026-05-18')];
    const items = await buildReflectionItems([BASE_MARK], events, WEEK_DATES, WEEK_START);
    expect(items[0]!.tier).toBe('inconsistent');
    expect(readHealthDays).not.toHaveBeenCalled();
  });

  test('items contain non-empty title and body', async () => {
    const items = await buildReflectionItems([BASE_MARK], [], WEEK_DATES, WEEK_START);
    expect(items[0]!.title.length).toBeGreaterThan(0);
    expect(items[0]!.body.length).toBeGreaterThan(0);
  });
});
