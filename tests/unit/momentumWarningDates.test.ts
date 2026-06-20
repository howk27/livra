import { momentumWarningDates } from '../../lib/goalMomentum';

describe('momentumWarningDates', () => {
  it('returns null when there are no marks', () => {
    expect(momentumWarningDates([], '2026-06-19')).toBeNull();
  });

  it('returns null when no mark has been logged', () => {
    const marks = [{ id: 'a', weekly_target: 7, last_activity_date: null }];
    expect(momentumWarningDates(marks, '2026-06-19')).toBeNull();
  });

  it('daily mark: atRisk = last+2, break = last+3', () => {
    const marks = [{ id: 'a', weekly_target: 7, last_activity_date: '2026-06-17' }];
    expect(momentumWarningDates(marks, '2026-06-19')).toEqual({
      atRiskDate: '2026-06-19',
      breakDate: '2026-06-20',
    });
  });

  it('2x/week mark: atRisk = last+5, break = last+8', () => {
    const marks = [{ id: 'a', weekly_target: 2, last_activity_date: '2026-06-10' }];
    expect(momentumWarningDates(marks, '2026-06-19')).toEqual({
      atRiskDate: '2026-06-15',
      breakDate: '2026-06-18',
    });
  });

  it('defaults weekly_target null to 3/week (interval 2.33, atRiskGap 4, breakGap 6)', () => {
    const marks = [{ id: 'a', weekly_target: null, last_activity_date: '2026-06-10' }];
    expect(momentumWarningDates(marks, '2026-06-19')).toEqual({
      atRiskDate: '2026-06-14',
      breakDate: '2026-06-16',
    });
  });

  it('weakest link = soonest breakDate across marks', () => {
    const marks = [
      { id: 'slow', weekly_target: 2, last_activity_date: '2026-06-18' }, // break far out
      { id: 'fast', weekly_target: 7, last_activity_date: '2026-06-17' }, // break 2026-06-20
    ];
    expect(momentumWarningDates(marks, '2026-06-19')).toEqual({
      atRiskDate: '2026-06-19',
      breakDate: '2026-06-20',
    });
  });

  it('ignores never-logged marks when another mark has a run', () => {
    const marks = [
      { id: 'logged', weekly_target: 7, last_activity_date: '2026-06-17' },
      { id: 'fresh', weekly_target: 7, last_activity_date: null },
    ];
    expect(momentumWarningDates(marks, '2026-06-19')).toEqual({
      atRiskDate: '2026-06-19',
      breakDate: '2026-06-20',
    });
  });
});
