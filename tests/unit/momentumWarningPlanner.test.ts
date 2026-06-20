import { planMomentumWarnings } from '../../lib/momentumWarningPlanner';

const today = '2026-06-19';

describe('planMomentumWarnings', () => {
  it('single goal, distinct first/final days → two single-goal warnings (1+1)', () => {
    const out = planMomentumWarnings(
      [{ goalId: 'g1', title: 'Run', atRiskDate: '2026-06-20', breakDate: '2026-06-23' }],
      today,
    );
    expect(out).toEqual([
      { fireDay: '2026-06-20', goals: [{ goalId: 'g1', title: 'Run', isFinal: false }] },
      { fireDay: '2026-06-22', goals: [{ goalId: 'g1', title: 'Run', isFinal: true }] },
    ]);
  });

  it('daily collapse: atRisk and break-1 same day → one first-framed nudge', () => {
    const out = planMomentumWarnings(
      [{ goalId: 'g1', title: 'Run', atRiskDate: '2026-06-20', breakDate: '2026-06-21' }],
      today,
    );
    expect(out).toEqual([
      { fireDay: '2026-06-20', goals: [{ goalId: 'g1', title: 'Run', isFinal: false }] },
    ]);
  });

  it('drops nudges whose day is strictly before today', () => {
    const out = planMomentumWarnings(
      [{ goalId: 'g1', title: 'Run', atRiskDate: '2026-06-17', breakDate: '2026-06-20' }],
      today,
    );
    // first (06-17) dropped; final = break-1 = 06-19 (today) kept
    expect(out).toEqual([
      { fireDay: '2026-06-19', goals: [{ goalId: 'g1', title: 'Run', isFinal: true }] },
    ]);
  });

  it('two goals same fire-day → one combined warning naming both', () => {
    const out = planMomentumWarnings(
      [
        { goalId: 'g1', title: 'Run', atRiskDate: '2026-06-20', breakDate: '2026-06-25' },
        { goalId: 'g2', title: 'Read', atRiskDate: '2026-06-20', breakDate: '2026-06-26' },
      ],
      today,
    );
    expect(out[0]).toEqual({
      fireDay: '2026-06-20',
      goals: [
        { goalId: 'g1', title: 'Run', isFinal: false },
        { goalId: 'g2', title: 'Read', isFinal: false },
      ],
    });
  });

  it('two goals different days → separate single-goal warnings, at most one per day', () => {
    const out = planMomentumWarnings(
      [
        { goalId: 'g1', title: 'Run', atRiskDate: '2026-06-20', breakDate: '2026-06-21' },
        { goalId: 'g2', title: 'Read', atRiskDate: '2026-06-22', breakDate: '2026-06-23' },
      ],
      today,
    );
    expect(out.map((w) => w.fireDay)).toEqual(['2026-06-20', '2026-06-22']);
    for (const w of out) expect(w.goals.length).toBe(1);
  });

  it('returns empty when every candidate is in the past', () => {
    const out = planMomentumWarnings(
      [{ goalId: 'g1', title: 'Run', atRiskDate: '2026-06-10', breakDate: '2026-06-12' }],
      today,
    );
    expect(out).toEqual([]);
  });
});
