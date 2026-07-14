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

  describe('celebratory variant (PL-2 M2)', () => {
    it('reads "your longest yet" on a personal-best day', () => {
      expect(
        buildGoalWeekSentence({ momentumDays: 12, markCount: 3, dueCount: 2, isNewBest: true }),
      ).toBe('12 days · your longest yet · 3 marks · 2 due this week');
    });

    it('stays the plain sentence when isNewBest is false or omitted', () => {
      expect(
        buildGoalWeekSentence({ momentumDays: 12, markCount: 3, dueCount: 2, isNewBest: false }),
      ).toBe('12 days of momentum · 3 marks · 2 due this week');
      expect(buildGoalWeekSentence({ momentumDays: 12, markCount: 3, dueCount: 2 })).toBe(
        '12 days of momentum · 3 marks · 2 due this week',
      );
    });

    it('ignores isNewBest when there is no active run', () => {
      expect(
        buildGoalWeekSentence({ momentumDays: 0, markCount: 2, dueCount: 1, isNewBest: true }),
      ).toBe('2 marks · 1 due this week');
    });

    it('celebratory variant keeps the voice rules: no dashes, no exclamation marks', () => {
      const s = buildGoalWeekSentence({ momentumDays: 9, markCount: 1, dueCount: 0, isNewBest: true });
      expect(s).not.toMatch(/[—–-]/);
      expect(s).not.toMatch(/!/);
    });
  });

  describe('first-week variant (PL-3 M1)', () => {
    it('leads with "day {n} of week one" for a week-one goal with no run yet (day count starts at 1)', () => {
      expect(
        buildGoalWeekSentence({ momentumDays: null, markCount: 2, dueCount: 2, goalAgeDays: 0 }),
      ).toBe('day 1 of week one · 2 marks · 2 due this week');
      expect(
        buildGoalWeekSentence({ momentumDays: 0, markCount: 3, dueCount: 1, goalAgeDays: 4 }),
      ).toBe('day 5 of week one · 3 marks · 1 due this week');
    });

    it('reads "week one nearly done" on day 7 (the window closes at age 7 inclusive)', () => {
      expect(
        buildGoalWeekSentence({ momentumDays: null, markCount: 1, dueCount: 0, goalAgeDays: 7 }),
      ).toBe('week one nearly done · 1 mark · nothing due this week');
    });

    it('drops the clause once the goal leaves week one (age 8)', () => {
      expect(
        buildGoalWeekSentence({ momentumDays: null, markCount: 2, dueCount: 1, goalAgeDays: 8 }),
      ).toBe('2 marks · 1 due this week');
    });

    it('a live momentum run outranks the first-week clause', () => {
      expect(
        buildGoalWeekSentence({ momentumDays: 3, markCount: 2, dueCount: 1, goalAgeDays: 3 }),
      ).toBe('3 days of momentum · 2 marks · 1 due this week');
    });

    it('omits the clause when the age is unknown (null/undefined) or negative', () => {
      expect(
        buildGoalWeekSentence({ momentumDays: null, markCount: 2, dueCount: 1, goalAgeDays: null }),
      ).toBe('2 marks · 1 due this week');
      expect(
        buildGoalWeekSentence({ momentumDays: null, markCount: 2, dueCount: 1, goalAgeDays: -1 }),
      ).toBe('2 marks · 1 due this week');
    });

    it('first-week variant keeps the voice rules: no dashes, no exclamation marks', () => {
      const s = buildGoalWeekSentence({ momentumDays: null, markCount: 2, dueCount: 1, goalAgeDays: 2 });
      expect(s).not.toMatch(/[—–-]/);
      expect(s).not.toMatch(/!/);
    });
  });
});
