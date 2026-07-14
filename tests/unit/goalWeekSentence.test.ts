import { buildGoalWeekSentence } from '../../lib/goalWeekSentence';

describe('buildGoalWeekSentence', () => {
  it('renders all three clauses with middle-dot separators', () => {
    expect(
      buildGoalWeekSentence({ momentumDays: 9, markCount: 3, dueCount: 2 }),
    ).toBe('9 days of momentum · 3 marks · 2 due this week');
  });

  it('omits the momentum clause when there is no active run (null)', () => {
    expect(
      buildGoalWeekSentence({ momentumDays: null, markCount: 3, dueCount: 2 }),
    ).toBe('3 marks · 2 due this week');
  });

  it('omits the momentum clause when the run day count is 0', () => {
    expect(
      buildGoalWeekSentence({ momentumDays: 0, markCount: 2, dueCount: 1 }),
    ).toBe('2 marks · 1 due this week');
  });

  it('uses singular forms for 1 day and 1 mark', () => {
    expect(
      buildGoalWeekSentence({ momentumDays: 1, markCount: 1, dueCount: 1 }),
    ).toBe('1 day of momentum · 1 mark · 1 due this week');
  });

  it('reads "nothing due this week" when nothing is due', () => {
    expect(
      buildGoalWeekSentence({ momentumDays: 5, markCount: 2, dueCount: 0 }),
    ).toBe('5 days of momentum · 2 marks · nothing due this week');
  });

  it('returns an empty string when the goal has no marks', () => {
    expect(
      buildGoalWeekSentence({ momentumDays: 4, markCount: 0, dueCount: 0 }),
    ).toBe('');
  });

  it('never emits a prose dash', () => {
    const s = buildGoalWeekSentence({ momentumDays: 12, markCount: 4, dueCount: 3 });
    expect(s).not.toMatch(/[—–-]/);
  });
});
