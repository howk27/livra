import {
  APPLE_PRIVATE_RELAY_DOMAIN,
  MIN_PASSWORD_LENGTH,
  authProviders,
  describeEmailChangeOutcome,
  hasPasswordIdentity,
  isApplePrivateRelayEmail,
  isEmailAlreadyInUseError,
  mapEmailChangeError,
  mapPasswordChangeError,
  mapReauthError,
  pendingEmail,
  validateEmailChange,
  validatePasswordChange,
  type CredentialUser,
} from '../../lib/auth/accountCredentials';

const emailUser: CredentialUser = {
  email: 'sam@example.com',
  identities: [{ provider: 'email' }],
  app_metadata: { provider: 'email', providers: ['email'] },
};

const appleUser: CredentialUser = {
  email: `abc123@${APPLE_PRIVATE_RELAY_DOMAIN}`,
  identities: [{ provider: 'apple' }],
  app_metadata: { provider: 'apple', providers: ['apple'] },
};

describe('private relay detection', () => {
  it('detects an Apple private relay address', () => {
    expect(isApplePrivateRelayEmail(appleUser.email)).toBe(true);
  });

  it('is case and whitespace tolerant', () => {
    expect(isApplePrivateRelayEmail(`  X9@${APPLE_PRIVATE_RELAY_DOMAIN.toUpperCase()} `)).toBe(true);
  });

  it('leaves ordinary addresses alone', () => {
    expect(isApplePrivateRelayEmail('sam@example.com')).toBe(false);
    expect(isApplePrivateRelayEmail('sam@privaterelay.appleid.com.evil.test')).toBe(false);
  });

  it('handles missing values', () => {
    expect(isApplePrivateRelayEmail(null)).toBe(false);
    expect(isApplePrivateRelayEmail(undefined)).toBe(false);
    expect(isApplePrivateRelayEmail('')).toBe(false);
  });
});

describe('provider detection', () => {
  it('reads providers from identities and app_metadata without duplicates', () => {
    expect(authProviders(emailUser)).toEqual(['email']);
    expect(
      authProviders({
        identities: [{ provider: 'apple' }],
        app_metadata: { provider: 'Email', providers: ['apple', 'email'] },
      }).sort(),
    ).toEqual(['apple', 'email']);
  });

  it('only reports a password identity for email accounts', () => {
    expect(hasPasswordIdentity(emailUser)).toBe(true);
    expect(hasPasswordIdentity(appleUser)).toBe(false);
    expect(hasPasswordIdentity(null)).toBe(false);
    expect(hasPasswordIdentity({})).toBe(false);
  });
});

describe('password change validation', () => {
  const base = { currentPassword: 'oldpassword', newPassword: 'newpassword', confirmPassword: 'newpassword' };

  it('accepts a valid change', () => {
    expect(validatePasswordChange(base)).toBeNull();
  });

  it('requires the current password first (reauth cannot be skipped)', () => {
    expect(validatePasswordChange({ ...base, currentPassword: '   ' })).toMatch(/current password/i);
  });

  it('enforces the same minimum length as signup', () => {
    const short = 'a'.repeat(MIN_PASSWORD_LENGTH - 1);
    expect(validatePasswordChange({ ...base, newPassword: short, confirmPassword: short })).toMatch(
      new RegExp(`${MIN_PASSWORD_LENGTH} characters`),
    );
    const exact = 'a'.repeat(MIN_PASSWORD_LENGTH);
    expect(validatePasswordChange({ ...base, newPassword: exact, confirmPassword: exact })).toBeNull();
  });

  it('rejects a new password equal to the current one', () => {
    expect(
      validatePasswordChange({ currentPassword: 'oldpassword', newPassword: 'oldpassword', confirmPassword: 'oldpassword' }),
    ).toMatch(/already your password/i);
  });

  it('rejects a mismatched confirmation', () => {
    expect(validatePasswordChange({ ...base, confirmPassword: 'newpassword2' })).toMatch(/do not match/i);
  });

  it('rejects an empty new password', () => {
    expect(validatePasswordChange({ ...base, newPassword: '', confirmPassword: '' })).toMatch(/new password/i);
  });
});

describe('email change validation', () => {
  it('accepts a different, well formed address', () => {
    expect(validateEmailChange(' new@example.com ', 'sam@example.com')).toBeNull();
  });

  it('rejects empty and malformed addresses', () => {
    expect(validateEmailChange('   ', 'sam@example.com')).toMatch(/enter the email/i);
    expect(validateEmailChange('not-an-email', 'sam@example.com')).toMatch(/valid email/i);
  });

  it('rejects the address already on the account, ignoring case', () => {
    expect(validateEmailChange('SAM@example.com', 'sam@example.com')).toMatch(/already your email/i);
  });
});

describe('email change outcome, derived from what Supabase returned', () => {
  it('reports pending when confirmation is ON (new_email carries the request)', () => {
    const outcome = describeEmailChangeOutcome(
      { email: 'sam@example.com', new_email: 'new@example.com' },
      'new@example.com',
    );
    expect(outcome.status).toBe('pending');
    expect(outcome.message).toContain('new@example.com');
    expect(outcome.message).toMatch(/stays the same/i);
  });

  it('reports applied when confirmation is OFF (address already swapped, no mail sent)', () => {
    const outcome = describeEmailChangeOutcome({ email: 'new@example.com' }, 'new@example.com');
    expect(outcome.status).toBe('applied');
    expect(outcome.message).toMatch(/is now new@example.com/i);
    expect(outcome.message).not.toMatch(/inbox|link|sent/i);
  });

  it('never promises an inbox link when nothing indicates one was sent', () => {
    const outcome = describeEmailChangeOutcome({ email: 'sam@example.com' }, 'new@example.com');
    expect(outcome.status).toBe('unknown');
    expect(outcome.message).not.toMatch(/we sent|check your inbox/i);
  });

  it('handles a missing user object', () => {
    expect(describeEmailChangeOutcome(null, 'new@example.com').status).toBe('unknown');
  });
});

describe('pending email banner source', () => {
  it('returns the address still awaiting confirmation', () => {
    expect(pendingEmail({ email: 'sam@example.com', new_email: 'new@example.com' })).toBe('new@example.com');
  });

  it('returns null once the change landed or was never requested', () => {
    expect(pendingEmail({ email: 'new@example.com', new_email: 'new@example.com' })).toBeNull();
    expect(pendingEmail({ email: 'sam@example.com' })).toBeNull();
    expect(pendingEmail(null)).toBeNull();
  });
});

describe('error mapping', () => {
  it('recognises the already-in-use path from message or code', () => {
    expect(isEmailAlreadyInUseError({ message: 'A user with this email address has already been registered' })).toBe(true);
    expect(isEmailAlreadyInUseError({ code: 'email_exists' })).toBe(true);
    expect(isEmailAlreadyInUseError({ message: 'network request failed' })).toBe(false);
    expect(mapEmailChangeError({ code: 'email_exists' })).toMatch(/another account/i);
  });

  it('maps rate limit and network email failures', () => {
    expect(mapEmailChangeError({ message: 'Email rate limit exceeded' })).toMatch(/minute/i);
    expect(mapEmailChangeError({ message: 'Network request failed' })).toMatch(/connection/i);
    expect(mapEmailChangeError(null)).toMatch(/could not change your email/i);
  });

  it('maps a failed reauthentication to a wrong-password message', () => {
    expect(mapReauthError({ message: 'Invalid login credentials' })).toMatch(/current password is not right/i);
    expect(mapReauthError({ message: 'Network request failed' })).toMatch(/connection/i);
    expect(mapReauthError(null)).toMatch(/could not confirm your current password/i);
  });

  it('maps password update failures', () => {
    expect(
      mapPasswordChangeError({ message: 'New password should be different from the old password.' }),
    ).toMatch(/already your password/i);
    expect(mapPasswordChangeError({ message: 'Password is too weak' })).toMatch(/longer password/i);
    expect(mapPasswordChangeError(null)).toMatch(/could not change your password/i);
  });
});

describe('copy rules', () => {
  const messages = [
    validatePasswordChange({ currentPassword: '', newPassword: '', confirmPassword: '' }),
    validateEmailChange('', null),
    describeEmailChangeOutcome({ email: 'a@b.co', new_email: 'c@d.co' }, 'c@d.co').message,
    describeEmailChangeOutcome({ email: 'c@d.co' }, 'c@d.co').message,
    describeEmailChangeOutcome(null, 'c@d.co').message,
    mapEmailChangeError(null),
    mapReauthError(null),
    mapPasswordChangeError(null),
    mapPasswordChangeError({ message: 'weak' }),
  ].filter((m): m is string => typeof m === 'string');

  it('uses no em-dash, en-dash, or hyphen-as-dash in user copy', () => {
    for (const message of messages) {
      expect(message).not.toMatch(/[—–]/);
      expect(message).not.toMatch(/ - /);
    }
  });
});
