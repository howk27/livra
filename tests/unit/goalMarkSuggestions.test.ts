import { getMarksForGoal, calculateUnlockThreshold } from '../../lib/goalMarkSuggestions';

describe('getMarksForGoal', () => {
  it('returns run and steps for "Run a marathon"', () => {
    const marks = getMarksForGoal('Run a marathon');
    const ids = marks.map(m => m.id);
    expect(ids).toContain('run');
    expect(ids).toContain('steps');
  });

  it('returns saving mark for "Save for a house"', () => {
    const marks = getMarksForGoal('Save for a house');
    const ids = marks.map(m => m.id);
    expect(ids).toContain('saving');
  });

  it('returns language mark for "Learn Spanish"', () => {
    const marks = getMarksForGoal('Learn Spanish');
    const ids = marks.map(m => m.id);
    expect(ids).toContain('language');
  });

  it('returns no more than 5 marks', () => {
    const marks = getMarksForGoal('Run a marathon lose weight get fit eat clean sleep better');
    expect(marks.length).toBeLessThanOrEqual(5);
  });

  it('returns fallback marks for an empty title', () => {
    const marks = getMarksForGoal('');
    expect(marks.length).toBeGreaterThan(0);
  });

  it('returns writing mark for "Write a book"', () => {
    const marks = getMarksForGoal('Write a book');
    const ids = marks.map(m => m.id);
    expect(ids).toContain('writing');
  });

  it('returns invest mark for "Build passive income"', () => {
    const marks = getMarksForGoal('Build passive income');
    const ids = marks.map(m => m.id);
    expect(ids).toContain('invest');
  });
});

describe('calculateUnlockThreshold', () => {
  it('scales with mark count', () => {
    const one = calculateUnlockThreshold('building', 'steady', 1);
    const three = calculateUnlockThreshold('building', 'steady', 3);
    expect(three).toBeGreaterThan(one);
  });

  it('all-in pushing produces highest threshold', () => {
    const high = calculateUnlockThreshold('all-in', 'pushing', 3);
    const low = calculateUnlockThreshold('starting', 'light', 3);
    expect(high).toBeGreaterThan(low);
  });

  it('returns a positive integer', () => {
    const result = calculateUnlockThreshold('leveling', 'steady', 2);
    expect(result).toBeGreaterThan(0);
    expect(Number.isInteger(result)).toBe(true);
  });

  it('returns 0 for 0 marks', () => {
    expect(calculateUnlockThreshold('building', 'steady', 0)).toBe(0);
  });
});
