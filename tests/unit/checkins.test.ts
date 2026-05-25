import {
  getTodayCheckin,
  hasCheckedInToday,
  getCheckinStreak,
} from '../../lib/checkinLogic';
import type { DailyCheckin } from '../../types/checkin';

function makeCheckin(overrides: Partial<DailyCheckin> = {}): DailyCheckin {
  return {
    id: 'c1',
    user_id: 'u1',
    goal_id: 'g1',
    date: '2026-05-25',
    showed_up: true,
    created_at: '2026-05-25T08:00:00Z',
    ...overrides,
  };
}

describe('getTodayCheckin', () => {
  test('returns matching checkin', () => {
    const checkins = [makeCheckin()];
    expect(getTodayCheckin(checkins, 'g1', '2026-05-25')).toEqual(checkins[0]);
  });

  test('returns undefined when no match for date', () => {
    const checkins = [makeCheckin({ date: '2026-05-24' })];
    expect(getTodayCheckin(checkins, 'g1', '2026-05-25')).toBeUndefined();
  });

  test('returns undefined when no match for goal', () => {
    const checkins = [makeCheckin({ goal_id: 'g2' })];
    expect(getTodayCheckin(checkins, 'g1', '2026-05-25')).toBeUndefined();
  });
});

describe('hasCheckedInToday', () => {
  test('true when checkin exists today', () => {
    const checkins = [makeCheckin()];
    expect(hasCheckedInToday(checkins, 'g1', '2026-05-25')).toBe(true);
  });

  test('false when no checkin today', () => {
    expect(hasCheckedInToday([], 'g1', '2026-05-25')).toBe(false);
  });
});

describe('getCheckinStreak', () => {
  test('0 when no checkins', () => {
    expect(getCheckinStreak([], 'g1', '2026-05-25')).toBe(0);
  });

  test('1 for a single checkin today', () => {
    const checkins = [makeCheckin({ date: '2026-05-25' })];
    expect(getCheckinStreak(checkins, 'g1', '2026-05-25')).toBe(1);
  });

  test('counts consecutive days ending today', () => {
    const checkins = [
      makeCheckin({ date: '2026-05-25' }),
      makeCheckin({ date: '2026-05-24', id: 'c2' }),
      makeCheckin({ date: '2026-05-23', id: 'c3' }),
    ];
    expect(getCheckinStreak(checkins, 'g1', '2026-05-25')).toBe(3);
  });

  test('breaks streak on gap', () => {
    const checkins = [
      makeCheckin({ date: '2026-05-25' }),
      makeCheckin({ date: '2026-05-23', id: 'c3' }),
    ];
    expect(getCheckinStreak(checkins, 'g1', '2026-05-25')).toBe(1);
  });

  test('only counts showed_up=true entries', () => {
    const checkins = [makeCheckin({ date: '2026-05-25', showed_up: false })];
    expect(getCheckinStreak(checkins, 'g1', '2026-05-25')).toBe(0);
  });

  test('0 when only yesterday checkin (not today)', () => {
    const checkins = [makeCheckin({ date: '2026-05-24' })]; // yesterday, not today
    expect(getCheckinStreak(checkins, 'g1', '2026-05-25')).toBe(0);
  });
});
