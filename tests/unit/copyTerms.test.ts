import { TERMS } from '../../lib/copy';

describe('TERMS canonical definitions', () => {
  const keys = ['goal', 'mark', 'momentum', 'dailyHabit'] as const;

  it.each(keys)('defines a non-empty %s definition', (key) => {
    expect(typeof TERMS[key]).toBe('string');
    expect(TERMS[key].trim().length).toBeGreaterThan(0);
  });

  it('has no em-dash or en-dash in any definition', () => {
    for (const key of keys) {
      expect(TERMS[key]).not.toMatch(/[—–]/);
    }
  });

  it('mark definition names the action and the log moment, without vague filler', () => {
    // Concrete, not vague: mentions repeating an action and logging it, and drops
    // the vague "show up" the current copy uses.
    expect(TERMS.mark.toLowerCase()).toMatch(/repeat/);
    expect(TERMS.mark.toLowerCase()).toMatch(/log/);
    expect(TERMS.mark.toLowerCase()).not.toMatch(/show up/);
    expect(TERMS.mark).not.toMatch(/ - /);
  });
});
