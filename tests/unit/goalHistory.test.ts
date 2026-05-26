import { formatDuration, formatTargetDelta } from '../../lib/goalHistory';

describe('formatDuration', () => {
  it('returns "Same day" when completed_at is on the same day as created_at', () => {
    expect(formatDuration('2026-01-10T09:00:00.000Z', '2026-01-10T18:00:00.000Z')).toBe('Same day');
  });

  it('returns "Same day" when differenceInDays is 0', () => {
    expect(formatDuration('2026-01-10T00:00:00.000Z', '2026-01-10T23:59:59.000Z')).toBe('Same day');
  });

  it('returns "1 day" for a one-day difference', () => {
    expect(formatDuration('2026-01-10T00:00:00.000Z', '2026-01-11T00:00:00.000Z')).toBe('1 day');
  });

  it('returns "N days" for multi-day differences', () => {
    expect(formatDuration('2026-01-01T00:00:00.000Z', '2026-02-17T00:00:00.000Z')).toBe('47 days');
  });

  it('handles large values', () => {
    expect(formatDuration('2025-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')).toBe('365 days');
  });
});

describe('formatTargetDelta', () => {
  it('returns "On time" when completed on the target date', () => {
    expect(formatTargetDelta('2026-03-15T14:00:00.000Z', '2026-03-15')).toBe('On time');
  });

  it('returns "1 day early" for singular', () => {
    expect(formatTargetDelta('2026-03-14T14:00:00.000Z', '2026-03-15')).toBe('1 day early');
  });

  it('returns "N days early" for plural', () => {
    expect(formatTargetDelta('2026-03-10T14:00:00.000Z', '2026-03-15')).toBe('5 days early');
  });

  it('returns "1 day late" for singular', () => {
    expect(formatTargetDelta('2026-03-16T14:00:00.000Z', '2026-03-15')).toBe('1 day late');
  });

  it('returns "N days late" for plural', () => {
    expect(formatTargetDelta('2026-03-25T14:00:00.000Z', '2026-03-15')).toBe('10 days late');
  });
});
