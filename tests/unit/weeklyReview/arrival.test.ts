// WR-3 — the Focus arrival card's window and viewed state (spec 2026-08-29 §5).
// 2026-08-24 is a Monday.
import {
  shouldShowWeeklyReviewCard,
  weeklyReviewCardLine,
  WEEKLY_REVIEW_ARRIVAL_HOUR,
} from '../../../lib/weeklyReview/arrival';

const base = {
  todayStr: '2026-08-30', // Sunday
  hour: 20,
  viewedWeekStart: null,
  hasActiveGoals: true,
};

describe('shouldShowWeeklyReviewCard', () => {
  it('arrives Sunday at 19:00, not before', () => {
    expect(WEEKLY_REVIEW_ARRIVAL_HOUR).toBe(19);
    expect(shouldShowWeeklyReviewCard({ ...base, hour: 18 })).toBe(false);
    expect(shouldShowWeeklyReviewCard({ ...base, hour: 19 })).toBe(true);
  });

  it('stays through the Mon–Tue lookback, then clears until next Sunday', () => {
    expect(shouldShowWeeklyReviewCard({ ...base, todayStr: '2026-08-31', hour: 9 })).toBe(true); // Monday
    expect(shouldShowWeeklyReviewCard({ ...base, todayStr: '2026-09-01', hour: 9 })).toBe(true); // Tuesday
    expect(shouldShowWeeklyReviewCard({ ...base, todayStr: '2026-09-02', hour: 9 })).toBe(false); // Wednesday
    expect(shouldShowWeeklyReviewCard({ ...base, todayStr: '2026-08-29', hour: 23 })).toBe(false); // Saturday
  });

  it('viewing this week clears it; a stale viewed week does not', () => {
    // Sunday evening reviews the week of 2026-08-24.
    expect(shouldShowWeeklyReviewCard({ ...base, viewedWeekStart: '2026-08-24' })).toBe(false);
    expect(shouldShowWeeklyReviewCard({ ...base, viewedWeekStart: '2026-08-17' })).toBe(true);
    // Monday still reviews the same closed week the Sunday view recorded.
    expect(
      shouldShowWeeklyReviewCard({ ...base, todayStr: '2026-08-31', hour: 9, viewedWeekStart: '2026-08-24' }),
    ).toBe(false);
  });

  it('never shows with zero active goals', () => {
    expect(shouldShowWeeklyReviewCard({ ...base, hasActiveGoals: false })).toBe(false);
  });
});

describe('weeklyReviewCardLine', () => {
  it('carries the numbers when there are real ones', () => {
    expect(weeklyReviewCardLine(5, 12)).toBe('Your week is ready · 5 days, 12 marks');
    expect(weeklyReviewCardLine(1, 1)).toBe('Your week is ready · 1 day, 1 mark');
  });

  it('a zero is never rendered', () => {
    expect(weeklyReviewCardLine(0, 0)).toBe('Your week is ready.');
    expect(weeklyReviewCardLine(0, 3)).toBe('Your week is ready.');
    expect(weeklyReviewCardLine(2, 0)).toBe('Your week is ready.');
  });
});
