import { resolveFirstName, resolveInitialDisplayName } from '../../lib/profile/displayName';

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

describe('resolveFirstName (PL-4 voice/greeting {name} slot)', () => {
  it('takes the first word of the resolved metadata name', () => {
    expect(resolveFirstName({ full_name: 'Dei Sierra' })).toBe('Dei');
    expect(resolveFirstName({ display_name: 'Deivi S', full_name: 'Other' })).toBe('Deivi');
  });

  it('falls back to the email prefix when no metadata name exists', () => {
    expect(resolveFirstName(null, 'deivi@example.com')).toBe('deivi');
    expect(resolveFirstName({}, 'deivi@example.com')).toBe('deivi');
  });

  it('returns null when no name exists anywhere', () => {
    expect(resolveFirstName(null, null)).toBeNull();
    expect(resolveFirstName({}, undefined)).toBeNull();
  });

  it('never leaks an Apple hide-my-email relay token as a name', () => {
    expect(resolveFirstName(null, 'a1b2c3d4x9@privaterelay.appleid.com')).toBeNull();
    expect(resolveFirstName({}, 'ABC.DEF@PrivateRelay.AppleID.com')).toBeNull();
  });

  it('still uses a real metadata name for a hide-my-email user', () => {
    expect(
      resolveFirstName({ full_name: 'Dei Sierra' }, 'a1b2@privaterelay.appleid.com')
    ).toBe('Dei');
  });
});
