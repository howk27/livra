import { resolveMarkDefinition } from '../../lib/markDefinition';

describe('resolveMarkDefinition', () => {
  it('returns the library description for a library mark (name match)', () => {
    expect(resolveMarkDefinition({ name: 'Sleep', emoji: '🌙' })).toBe(
      'Nights you get the sleep you planned for; check in the morning after.',
    );
  });

  it('matches a library mark case-insensitively', () => {
    expect(resolveMarkDefinition({ name: 'sleep' })).toContain('Nights you get the sleep');
  });

  it('falls back to the emoji when the name was renamed', () => {
    // '🌙' is Sleep's emoji; a renamed mark still resolves via emoji.
    expect(resolveMarkDefinition({ name: 'Bedtime', emoji: '🌙' })).toContain(
      'Nights you get the sleep',
    );
  });

  it('returns a concrete auto-template for a custom mark', () => {
    expect(resolveMarkDefinition({ name: 'Floss', emoji: null })).toBe(
      'One check-in = each time you floss.',
    );
  });

  it('auto-template contains no em/en dash or hyphen-as-dash', () => {
    const line = resolveMarkDefinition({ name: 'Walk the Dog' });
    expect(line).not.toMatch(/[—–]/);
    expect(line).not.toMatch(/ - /);
  });
});
