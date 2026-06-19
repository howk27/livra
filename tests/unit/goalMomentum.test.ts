import {
  expectedInterval,
  atRiskGapFor,
  breakGapFor,
  markGapDays,
  markMomentum,
} from '../../lib/goalMomentum';

describe('interval + thresholds', () => {
  it('derives interval = 7 / weekly_target, defaulting to 3', () => {
    expect(expectedInterval(7)).toBeCloseTo(1.0);
    expect(expectedInterval(4)).toBeCloseTo(1.75);
    expect(expectedInterval(2)).toBeCloseTo(3.5);
    expect(expectedInterval(null)).toBeCloseTo(7 / 3);
    expect(expectedInterval(0)).toBeCloseTo(7 / 3);
  });

  it('matches the spec cushion table', () => {
    expect(atRiskGapFor(expectedInterval(7))).toBe(2);
    expect(breakGapFor(expectedInterval(7))).toBe(3);
    expect(atRiskGapFor(expectedInterval(4))).toBe(3);
    expect(breakGapFor(expectedInterval(4))).toBe(5);
    expect(atRiskGapFor(expectedInterval(2))).toBe(5);
    expect(breakGapFor(expectedInterval(2))).toBe(8);
  });
});

describe('markGapDays', () => {
  it('returns whole days since last log, null when never logged', () => {
    expect(markGapDays('2026-06-10', '2026-06-10')).toBe(0);
    expect(markGapDays('2026-06-08', '2026-06-10')).toBe(2);
    expect(markGapDays(undefined, '2026-06-10')).toBeNull();
    expect(markGapDays(null, '2026-06-10')).toBeNull();
  });
});

describe('markMomentum (daily mark, target 7: at-risk 2 / break 3)', () => {
  const mk = (last?: string) => ({ id: 'm1', weekly_target: 7, last_activity_date: last });
  it('classifies by gap', () => {
    expect(markMomentum(mk('2026-06-10'), '2026-06-10').state).toBe('on_track'); // gap 0
    expect(markMomentum(mk('2026-06-09'), '2026-06-10').state).toBe('resting');  // gap 1 (<2)
    expect(markMomentum(mk('2026-06-08'), '2026-06-10').state).toBe('slipping'); // gap 2 (<3)
    expect(markMomentum(mk('2026-06-07'), '2026-06-10').state).toBe('broken');   // gap 3 (>=3)
    expect(markMomentum(mk(undefined), '2026-06-10').state).toBe('resting');     // never logged
  });
});

describe('markMomentum (2x/week, target 2: at-risk 5 / break 8)', () => {
  const mk = (last?: string) => ({ id: 'm2', weekly_target: 2, last_activity_date: last });
  it('gives low-frequency marks more rope', () => {
    expect(markMomentum(mk('2026-06-07'), '2026-06-10').state).toBe('resting');  // gap 3 (<5)
    expect(markMomentum(mk('2026-06-05'), '2026-06-10').state).toBe('slipping'); // gap 5 (<8)
    expect(markMomentum(mk('2026-06-02'), '2026-06-10').state).toBe('broken');   // gap 8 (>=8)
  });
});
