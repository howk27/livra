import {
  expectedInterval,
  atRiskGapFor,
  breakGapFor,
  markGapDays,
  markMomentum,
  goalMomentumState,
  cushionFraction,
  momentumDays,
  nextMomentumRecord,
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

const mm = (state: string) => ({
  id: state, intervalDays: 1, atRiskGap: 2, breakGap: 3, gap: 0, state,
}) as any;

describe('goalMomentumState (weakest link)', () => {
  it('any broken mark breaks the goal', () => {
    expect(goalMomentumState([mm('on_track'), mm('broken')])).toBe('broken');
  });
  it('any slipping (no broken) makes the goal slipping', () => {
    expect(goalMomentumState([mm('on_track'), mm('slipping'), mm('resting')])).toBe('slipping');
  });
  it('on_track when at least one logged today and none worse', () => {
    expect(goalMomentumState([mm('on_track'), mm('resting')])).toBe('on_track');
  });
  it('resting when all resting', () => {
    expect(goalMomentumState([mm('resting'), mm('resting')])).toBe('resting');
  });
  it('empty goal is resting', () => {
    expect(goalMomentumState([])).toBe('resting');
  });
});

describe('cushionFraction', () => {
  it('is 1 at the at-risk edge and 0 at the break edge', () => {
    expect(cushionFraction(3, 3, 5)).toBeCloseTo(1);   // just at-risk
    expect(cushionFraction(4, 3, 5)).toBeCloseTo(0.5);
    expect(cushionFraction(5, 3, 5)).toBeCloseTo(0);   // breaking
  });
  it('clamps to [0,1]', () => {
    expect(cushionFraction(2, 3, 5)).toBe(1);
    expect(cushionFraction(9, 3, 5)).toBe(0);
  });
});

describe('momentumDays', () => {
  it('counts inclusive days since the run started, 0 when not started', () => {
    expect(momentumDays(null, '2026-06-10')).toBe(0);
    expect(momentumDays('2026-06-10', '2026-06-10')).toBe(1);
    expect(momentumDays('2026-05-30', '2026-06-10')).toBe(12);
  });
});

describe('nextMomentumRecord', () => {
  const T = '2026-06-10';
  it('does not start a run before the first real log', () => {
    expect(nextMomentumRecord(null, 'g1', 'resting', T)).toEqual({ goalId: 'g1', startDate: null });
  });
  it('starts the run on the first on_track day', () => {
    expect(nextMomentumRecord(null, 'g1', 'on_track', T)).toEqual({ goalId: 'g1', startDate: T });
  });
  it('continues an existing run through resting and slipping', () => {
    const prev = { goalId: 'g1', startDate: '2026-06-01' };
    expect(nextMomentumRecord(prev, 'g1', 'resting', T)).toEqual(prev);
    expect(nextMomentumRecord(prev, 'g1', 'slipping', T)).toEqual(prev);
  });
  it('resets the run when broken', () => {
    const prev = { goalId: 'g1', startDate: '2026-06-01' };
    expect(nextMomentumRecord(prev, 'g1', 'broken', T)).toEqual({ goalId: 'g1', startDate: null });
  });
});
