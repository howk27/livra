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
});
