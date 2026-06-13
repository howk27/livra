// tests/unit/consistency.test.ts
// TDD: tests written before lib/consistency.ts exists.

import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('../../lib/appDate', () => ({
  getAppDate: jest.fn(),
}));

import { getAppDate } from '../../lib/appDate';
const mockGetAppDate = getAppDate as jest.Mock;

// June 12 2026 is a Friday (dow=5).
// currentWeekDates() → Mon Jun 8 – Sun Jun 14, weekStart = '2026-06-08'
const FRIDAY_JUN_12 = new Date(2026, 5, 12, 10, 0, 0); // month is 0-indexed

const HISTORY_KEY = '@livra_consistency_history';

beforeEach(async () => {
  mockGetAppDate.mockReturnValue(new Date(FRIDAY_JUN_12));
  await AsyncStorage.clear();
});

import { computeWeek, weeksStrong, appendCompletedWeeks } from '../../lib/consistency';

// ── computeWeek ──────────────────────────────────────────────────────────────

describe('computeWeek', () => {
  const weekDates = [
    '2026-06-08', '2026-06-09', '2026-06-10', '2026-06-11',
    '2026-06-12', '2026-06-13', '2026-06-14',
  ];

  it('computes all formula fields for two marks', () => {
    const marks = [
      { id: 'a', weekly_target: 3 },
      { id: 'b', weekly_target: 5 },
    ];
    const completions = { a: 2, b: 4 };
    // expected=8, counted=6, required=max(1,round(5.6))=6, strong=true, remaining=0
    const r = computeWeek(marks, completions, weekDates);
    expect(r.expected).toBe(8);
    expect(r.counted).toBe(6);
    expect(r.required).toBe(6);
    expect(r.strong).toBe(true);
    expect(r.remaining).toBe(0);
  });

  it('caps per-mark completions at weekly_target — bonus log days excluded', () => {
    const marks = [{ id: 'a', weekly_target: 3 }];
    const completions = { a: 5 }; // 2 bonus days logged beyond cap
    // counted = min(5,3) = 3, required=max(1,round(2.1))=2, strong=true
    const r = computeWeek(marks, completions, weekDates);
    expect(r.counted).toBe(3);
    expect(r.strong).toBe(true);
    expect(r.remaining).toBe(0);
  });

  it('remaining equals the forgiveness copy number', () => {
    const marks = [
      { id: 'a', weekly_target: 5 },
      { id: 'b', weekly_target: 5 },
    ];
    const completions = { a: 2, b: 2 };
    // expected=10, counted=4, required=max(1,round(7))=7, remaining=3
    const r = computeWeek(marks, completions, weekDates);
    expect(r.remaining).toBe(3);
    expect(r.strong).toBe(false);
  });

  it('rounds required to 1 for low-volume week (expected=2)', () => {
    const marks = [{ id: 'a', weekly_target: 2 }];
    const completions = { a: 0 };
    // required = max(1, round(0.7*2)) = max(1, round(1.4)) = max(1,1) = 1
    const r = computeWeek(marks, completions, weekDates);
    expect(r.required).toBe(1);
    expect(r.remaining).toBe(1);
  });

  it('handles empty marks list', () => {
    const r = computeWeek([], {}, weekDates);
    expect(r.expected).toBe(0);
    expect(r.counted).toBe(0);
    expect(r.required).toBe(1); // max(1, round(0)) = 1
    expect(r.strong).toBe(false);
    expect(r.remaining).toBe(1);
  });

  it('returns strong=true and remaining=0 when all marks fully met', () => {
    const marks = [
      { id: 'a', weekly_target: 3 },
      { id: 'b', weekly_target: 7 },
    ];
    const completions = { a: 3, b: 7 };
    // expected=10, counted=10, required=max(1,round(7))=7, strong=true
    const r = computeWeek(marks, completions, weekDates);
    expect(r.strong).toBe(true);
    expect(r.remaining).toBe(0);
  });

  it('defaults missing weekly_target to 3', () => {
    const marks = [{ id: 'a' }]; // no weekly_target field
    const completions = { a: 3 };
    // expected=3, counted=3, required=max(1,round(2.1))=2, strong=true
    const r = computeWeek(marks, completions, weekDates);
    expect(r.expected).toBe(3);
    expect(r.strong).toBe(true);
  });
});

// ── weeksStrong ──────────────────────────────────────────────────────────────

describe('weeksStrong', () => {
  it('returns 0 for empty history', () => {
    expect(weeksStrong([])).toBe(0);
  });

  it('counts total strong weeks across all time', () => {
    const history = [
      { weekStart: '2026-05-18', strong: true },
      { weekStart: '2026-05-25', strong: false },
      { weekStart: '2026-06-01', strong: true },
    ];
    expect(weeksStrong(history)).toBe(2);
  });

  it('returns 0 when no weeks are strong', () => {
    const history = [
      { weekStart: '2026-05-18', strong: false },
      { weekStart: '2026-05-25', strong: false },
    ];
    expect(weeksStrong(history)).toBe(0);
  });

  it('counts non-consecutive strong weeks correctly', () => {
    const history = [
      { weekStart: '2026-01-05', strong: true },
      { weekStart: '2026-01-12', strong: false },
      { weekStart: '2026-01-19', strong: false },
      { weekStart: '2026-01-26', strong: true },
      { weekStart: '2026-02-02', strong: true },
    ];
    expect(weeksStrong(history)).toBe(3);
  });
});

// ── appendCompletedWeeks ─────────────────────────────────────────────────────

// Today = Jun 12 2026 (Fri), in-progress week Mon = 2026-06-08 (Jun 8)
// Last complete week: Mon 2026-06-01 (Jun 1–7)
// Two complete weeks back: Mon 2026-05-25 (May 25–31)

const mkMark = (id: string, weekly_target = 3, dailyTarget: number | null = 1) => ({
  id,
  weekly_target,
  dailyTarget,
});

const mkEvent = (markId: string, date: string, amount = 1) => ({
  id: `${markId}-${date}`,
  mark_id: markId,
  event_type: 'increment' as const,
  occurred_local_date: date,
  amount,
  deleted_at: null,
  user_id: 'u1',
  created_at: date,
  note: null,
});

describe('appendCompletedWeeks', () => {
  it('skips the in-progress current week — adds nothing when up-to-date', async () => {
    // History has the last completed week already; 2026-06-08 is in-progress
    const existing = [{ weekStart: '2026-06-01', strong: true }];
    await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(existing));

    const result = await appendCompletedWeeks([mkMark('a')], []);
    expect(result).toHaveLength(1);
    expect(result[0].weekStart).toBe('2026-06-01');
  });

  it('appends one missed completed week with correct strong value', async () => {
    // Last recorded: 2026-05-25. Missing: 2026-06-01. In-progress: 2026-06-08.
    const existing = [{ weekStart: '2026-05-25', strong: false }];
    await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(existing));

    const marks = [mkMark('a', 3)];
    // 2 completion days in week of 2026-06-01 (Jun 1–7)
    const events = [
      mkEvent('a', '2026-06-02'), // Jun 2 (Mon)
      mkEvent('a', '2026-06-03'), // Jun 3 (Tue)
    ];
    const result = await appendCompletedWeeks(marks, events);

    expect(result).toHaveLength(2);
    expect(result[1].weekStart).toBe('2026-06-01');
    // 2 completions, target=3, expected=3, counted=2, required=max(1,round(2.1))=2, strong=(2>=2)=true
    expect(result[1].strong).toBe(true);
  });

  it('backfills multiple missed completed weeks on a late app open', async () => {
    // Last recorded: 2026-05-18. Missing: 2026-05-25 and 2026-06-01. In-progress: 2026-06-08.
    const existing = [{ weekStart: '2026-05-18', strong: true }];
    await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(existing));

    // No events → both missing weeks are sub-threshold (strong=false)
    const result = await appendCompletedWeeks([mkMark('a', 3)], []);

    expect(result).toHaveLength(3);
    expect(result[1].weekStart).toBe('2026-05-25');
    expect(result[2].weekStart).toBe('2026-06-01');
    expect(result[1].strong).toBe(false);
    expect(result[2].strong).toBe(false);
  });

  it('does not re-record already-recorded weeks', async () => {
    const existing = [
      { weekStart: '2026-05-25', strong: true },
      { weekStart: '2026-06-01', strong: false },
    ];
    await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(existing));

    const result = await appendCompletedWeeks([mkMark('a')], []);
    expect(result).toHaveLength(2); // unchanged
  });

  it('starts from empty history — backfills at most MAX_BACKFILL_WEEKS completed weeks', async () => {
    // Empty history, today = 2026-06-12.
    // Current in-progress Mon = 2026-06-08. Backfill limit = 12 weeks back.
    const result = await appendCompletedWeeks([mkMark('a')], []);
    expect(result.length).toBeLessThanOrEqual(12);
    // All entries should be Mondays strictly before 2026-06-08
    for (const entry of result) {
      expect(entry.weekStart < '2026-06-08').toBe(true);
    }
  });
});
