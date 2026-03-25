import { computeWeeklyReview, getEmptyStateCtaTarget } from '../../lib/review/weeklyReview';

const weekStart = '2026-02-02';
const weekEnd = '2026-02-08';

const counters = [
  { id: 'c1', name: 'Meditation', emoji: '🧘' },
  { id: 'c2', name: 'Workout', emoji: '🏋️' },
  { id: 'c3', name: 'Reading', emoji: '📚' },
];

const events = [
  { counter_id: 'c1', event_type: 'increment' as const, amount: 1, occurred_local_date: '2026-02-02' },
  { counter_id: 'c1', event_type: 'increment' as const, amount: 2, occurred_local_date: '2026-02-03' },
  { counter_id: 'c2', event_type: 'increment' as const, amount: 1, occurred_local_date: '2026-02-03' },
  { counter_id: 'c3', event_type: 'increment' as const, amount: 3, occurred_local_date: '2026-02-07' },
];

const streaks = [
  { counter_id: 'c1', current_streak: 4, last_increment_date: '2026-02-03' },
  { counter_id: 'c2', current_streak: 0, last_increment_date: '2026-01-28' },
];

describe('computeWeeklyReview', () => {
  it('computes totals, days active, and best/worst day', () => {
    const review = computeWeeklyReview({
      weekStart,
      weekEnd,
      events,
      counters,
      streaks,
    });

    expect(review.totalActivity).toBe(7);
    expect(review.daysActive).toBe(3);
    expect(review.bestDay.total).toBe(3);
    expect(review.worstDay.total).toBe(0);
    expect(review.topCounters[0].id).toBe('c3');
    expect(review.streaksActive.length).toBe(1);
    expect(review.insight.length).toBeGreaterThan(0);
  });

  it('detects best week in recent history', () => {
    const historyEvents = [
      { counter_id: 'c1', event_type: 'increment' as const, amount: 6, occurred_local_date: '2026-02-05' },
    ];
    const review = computeWeeklyReview({
      weekStart,
      weekEnd,
      events: historyEvents,
      counters,
      streaks,
      historyTotals: [
        { weekStart: '2026-01-05', totalActivity: 4 },
        { weekStart: '2026-01-12', totalActivity: 5 },
        { weekStart: '2026-01-19', totalActivity: 6 },
        { weekStart: '2026-01-26', totalActivity: 3 },
      ],
    });

    expect(review.insight).toMatch(/best week/i);
  });

  it('returns correct empty state CTA target', () => {
    expect(getEmptyStateCtaTarget(true)).toBe('/(tabs)/home');
    expect(getEmptyStateCtaTarget(false)).toBe('/counter/new');
  });

  it('prioritizes strong finish insight', () => {
    const strongFinishEvents = [
      { counter_id: 'c1', event_type: 'increment' as const, amount: 5, occurred_local_date: '2026-02-07' },
      { counter_id: 'c1', event_type: 'increment' as const, amount: 4, occurred_local_date: '2026-02-08' },
    ];
    const review = computeWeeklyReview({
      weekStart,
      weekEnd,
      events: strongFinishEvents,
      counters,
      streaks: [],
      historyTotals: [],
    });

    expect(review.insight).toMatch(/finished strong/i);
  });

  it('recomputes totals when events change', () => {
    const baseReview = computeWeeklyReview({
      weekStart,
      weekEnd,
      events: [
        { counter_id: 'c1', event_type: 'increment' as const, amount: 1, occurred_local_date: '2026-02-02' },
      ],
      counters,
      streaks: [],
    });

    const updatedReview = computeWeeklyReview({
      weekStart,
      weekEnd,
      events: [
        { counter_id: 'c1', event_type: 'increment' as const, amount: 4, occurred_local_date: '2026-02-02' },
      ],
      counters,
      streaks: [],
    });

    expect(updatedReview.totalActivity).toBeGreaterThan(baseReview.totalActivity);
  });
});
