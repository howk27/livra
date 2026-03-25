import { getWeeklyReviewSeedRange } from '../../lib/dev/seedWeeklyReviewDemo';

describe('seedWeeklyReviewDemo date range', () => {
  it('generates a 7-day window ending today', () => {
    const referenceDate = new Date('2026-02-11T10:00:00');
    const range = getWeeklyReviewSeedRange(referenceDate);
    expect(range.dates.length).toBe(7);
    expect(range.weekEnd).toBe('2026-02-11');
    expect(range.weekStart).toBe('2026-02-05');
  });
});
