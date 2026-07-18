import { getMarksForGoal, calculateCommitmentTarget } from '../../lib/goalMarkSuggestions';
import { MARK_LIBRARY } from '../../lib/suggestedCounters';

const ids = (title: string) => getMarksForGoal(title).map(m => m.id);
const cats = (title: string) => getMarksForGoal(title).map(m => m.category);

describe('getMarksForGoal', () => {
  it('returns run and steps for "Run a marathon"', () => {
    const marks = getMarksForGoal('Run a marathon');
    const markIds = marks.map(m => m.id);
    expect(markIds).toContain('run');
    expect(markIds).toContain('steps');
  });

  it('returns saving mark for "Save for a house"', () => {
    expect(ids('Save for a house')).toContain('saving');
  });

  it('returns language mark for "Learn Spanish"', () => {
    expect(ids('Learn Spanish')).toContain('language');
  });

  it('returns no more than 5 marks', () => {
    const marks = getMarksForGoal('Run a marathon lose weight get fit eat clean sleep better');
    expect(marks.length).toBeLessThanOrEqual(5);
  });

  it('returns fallback marks for an empty title', () => {
    expect(getMarksForGoal('').length).toBeGreaterThan(0);
  });

  it('returns writing mark for "Write a book"', () => {
    expect(ids('Write a book')).toContain('writing');
  });

  it('returns invest mark for "Build passive income"', () => {
    expect(ids('Build passive income')).toContain('invest');
  });
});

// â”€â”€â”€ QC4-A: domain-aware matching â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe('getMarksForGoal â€” the founder-reported blocker: "Save $5k"', () => {
  it('suggests saving, never steps/run', () => {
    const result = ids('Save $5k');
    expect(result).toContain('saving');
    expect(result).not.toContain('steps');
    expect(result).not.toContain('run');
  });

  it('returns only Finance-category marks', () => {
    expect([...new Set(cats('Save $5k'))]).toEqual(['Finance']);
  });

  it('ranks saving first', () => {
    expect(ids('Save $5k')[0]).toBe('saving');
  });

  it('handles the longer phrasing', () => {
    const result = ids('Save $5k for a house down payment');
    expect(result[0]).toBe('saving');
    expect(result).not.toContain('steps');
    expect(result).not.toContain('run');
  });

  it('reads a bare "5k" as financial when the goal reads financial', () => {
    const result = ids('Save 5k for a house down payment');
    expect(result[0]).toBe('saving');
    expect(cats('Save 5k for a house down payment')[0]).toBe('Finance');
  });
});

// The founder wrote "Save 5k" WITHOUT the dollar sign â€” the `$` fix missed this,
// and the bare-5k test above was too weak to catch it: it asserted only that
// `saving` ranked first, while run/steps still filled slots 2-4.
describe('getMarksForGoal â€” bare magnitude, no currency symbol', () => {
  it('"Save 5k" suggests no fitness marks at all', () => {
    const result = ids('Save 5k');
    expect(result).toContain('saving');
    expect(result).not.toContain('run');
    expect(result).not.toContain('steps');
    expect(result).not.toContain('cycling');
  });

  it('"Save 5k" returns only Finance marks', () => {
    expect([...new Set(cats('Save 5k'))]).toEqual(['Finance']);
  });

  it('a magnitude does not set the domain when a real word already did', () => {
    expect(cats('Save 10k')).not.toContain('Fitness');
    expect(cats('Pay off 20k of debt')).not.toContain('Fitness');
  });

  it('but a magnitude still speaks when nothing else does', () => {
    expect(ids('5k')).toContain('run');
  });

  it('"Run a 5k" is untouched by the magnitude rule', () => {
    const result = ids('Run a 5k');
    expect(result).toContain('run');
    expect(result).toContain('steps');
  });
});

describe('getMarksForGoal â€” no regression on race goals', () => {
  it('"Run a 5k" still returns run and steps', () => {
    const result = ids('Run a 5k');
    expect(result[0]).toBe('run');
    expect(result).toContain('steps');
  });

  it('"Run a 5k" surfaces no Finance marks', () => {
    expect(cats('Run a 5k')).not.toContain('Finance');
  });

  it('"Run a 10k this year" still returns run', () => {
    expect(ids('Run a 10k this year')).toContain('run');
  });
});

describe('getMarksForGoal â€” plain single-domain goals', () => {
  it('"Read nightly" ranks reading first', () => {
    expect(ids('Read nightly')[0]).toBe('reading');
  });

  it('"Meditate daily" ranks meditation first', () => {
    expect(ids('Meditate daily')[0]).toBe('meditation');
  });

  it('"Get better sleep" surfaces sleep', () => {
    expect(ids('Get better sleep')).toContain('sleep');
  });
});

describe('getMarksForGoal â€” cross-domain guard', () => {
  it('never ranks a cross-domain mark above a scoring in-domain mark', () => {
    // `5k` is a race distance in the fitness tags; the goal is financial.
    const firstCrossDomain = getMarksForGoal('Save $5k').findIndex(m => m.category !== 'Finance');
    expect(firstCrossDomain).toBe(-1);
  });

  it('keeps an ambiguous token from dragging in an unrelated domain', () => {
    const result = ids('Save money on rent');
    // Finance leads; `rent` must not pull in `family` via the "parents" tag.
    expect(cats('Save money on rent').slice(0, 2)).toEqual(['Finance', 'Finance']);
    expect(result).not.toContain('steps');
    expect(result).not.toContain('family');
  });

  it('an in-domain mark always precedes a cross-domain mark of equal relevance', () => {
    const marks = getMarksForGoal('Train for a marathon');
    const lastFitness = marks.map(m => m.category).lastIndexOf('Fitness');
    const firstOther = marks.findIndex(m => m.category !== 'Fitness');
    if (firstOther !== -1) expect(firstOther).toBeGreaterThan(lastFitness);
  });
});

describe('getMarksForGoal â€” contract preserved', () => {
  it('returns at most MAX_SUGGESTIONS (5)', () => {
    for (const title of ['Save $5k', 'Run a 5k', 'Read nightly', 'Get fit and healthy']) {
      expect(getMarksForGoal(title).length).toBeLessThanOrEqual(5);
    }
  });

  it('returns the fallback set for a garbage title', () => {
    expect(ids('zzzz qqqq wwww')).toEqual(['workout', 'focus', 'planning', 'sleep', 'water']);
  });

  it('returns three marks for an empty or stop-word-only title', () => {
    expect(getMarksForGoal('').length).toBe(3);
    expect(getMarksForGoal('   ').length).toBe(3);
    expect(getMarksForGoal('a the of').length).toBe(3);
  });

  it('returns real MarkDefinitions', () => {
    for (const mark of getMarksForGoal('Save $5k')) {
      expect(MARK_LIBRARY).toContain(mark);
    }
  });

  it('is deterministic and never returns duplicates', () => {
    for (const title of ['Save $5k', 'Get fit', 'discipline', 'Run a 5k']) {
      const result = ids(title);
      expect(result).toEqual(ids(title));
      expect(new Set(result).size).toBe(result.length);
    }
  });
});

// â”€â”€â”€ QC4-B-data: mark descriptions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe('MARK_LIBRARY descriptions', () => {
  it('every mark has a non-empty description', () => {
    for (const mark of MARK_LIBRARY) {
      expect(typeof mark.description).toBe('string');
      expect(mark.description.trim().length).toBeGreaterThan(0);
    }
  });

  it('descriptions are one plain sentence', () => {
    for (const mark of MARK_LIBRARY) {
      expect(mark.description.length).toBeLessThanOrEqual(140);
      expect(mark.description).toMatch(/\.$/);
      expect(mark.description.slice(0, -1)).not.toMatch(/[.!?]\s/);
    }
  });

  it('descriptions carry no hype, guilt, or streak-loss language', () => {
    for (const mark of MARK_LIBRARY) {
      expect(mark.description).not.toMatch(/!/);
      expect(mark.description).not.toMatch(
        /\b(streak|crush|smash|unlock|journey|don't lose|never miss|amazing|transform)\b/i
      );
    }
  });
});

describe('calculateCommitmentTarget', () => {
  it('scales with mark count', () => {
    expect(calculateCommitmentTarget('building', 'steady', 3)).toBeGreaterThan(
      calculateCommitmentTarget('building', 'steady', 1)
    );
  });

  it('all-in pushing produces highest threshold', () => {
    expect(calculateCommitmentTarget('all-in', 'pushing', 3)).toBeGreaterThan(
      calculateCommitmentTarget('starting', 'light', 3)
    );
  });

  it('returns a positive integer', () => {
    const result = calculateCommitmentTarget('leveling', 'steady', 2);
    expect(result).toBeGreaterThan(0);
    expect(Number.isInteger(result)).toBe(true);
  });

  it('returns 0 for 0 marks', () => {
    expect(calculateCommitmentTarget('building', 'steady', 0)).toBe(0);
  });
});
