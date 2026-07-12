import { resolveInitialDisplayName } from '../../lib/profile/displayName';

describe('resolveInitialDisplayName (FU-4 profile pre-fill)', () => {
  it('prefers the saved profiles.display_name', () => {
    expect(
      resolveInitialDisplayName('Deivi', { display_name: 'Meta Name', full_name: 'Full Name' })
    ).toBe('Deivi');
  });

  it('trims the saved profile name', () => {
    expect(resolveInitialDisplayName('  Deivi  ', null)).toBe('Deivi');
  });

  it('falls back to user_metadata.display_name when the profile row is empty', () => {
    expect(
      resolveInitialDisplayName(null, { display_name: 'Meta Name', full_name: 'Full Name' })
    ).toBe('Meta Name');
  });

  it('falls back to user_metadata.full_name when display_name is missing', () => {
    expect(resolveInitialDisplayName(undefined, { full_name: 'Full Name' })).toBe('Full Name');
  });

  it('skips whitespace-only values at every level', () => {
    expect(
      resolveInitialDisplayName('   ', { display_name: '  ', full_name: '  Full Name ' })
    ).toBe('Full Name');
  });

  it('ignores non-string metadata values', () => {
    expect(resolveInitialDisplayName(null, { display_name: 42, full_name: { a: 1 } })).toBe('');
  });

  it('returns empty string when no name exists anywhere', () => {
    expect(resolveInitialDisplayName(null, null)).toBe('');
    expect(resolveInitialDisplayName(undefined, {})).toBe('');
  });
});
