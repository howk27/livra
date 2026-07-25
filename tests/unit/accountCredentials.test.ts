import {
  APPLE_PRIVATE_RELAY_DOMAIN,
  MIN_PASSWORD_LENGTH,
  authProviders,
  describeEmailChangeOutcome,
  emailChangeReauthMethod,
  emailChangeRequiresPassword,
  hasPasswordIdentity,
  isApplePrivateRelayEmail,
  isEmailAlreadyInUseError,
  mapEmailChangeError,
  mapPasswordChangeError,
  mapReauthError,
  pendingEmail,
  validateEmailChange,
  validateEmailChangeRequest,
  validateNewPassword,
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

describe('add-password validation (no password on the account)', () => {
  const base = { newPassword: 'newpassword', confirmPassword: 'newpassword' };

  it('accepts a new password with no current password anywhere in the input', () => {
    expect(validateNewPassword(base)).toBeNull();
    expect(Object.keys(base)).not.toContain('currentPassword');
  });

  it('enforces the same minimum length as signup', () => {
    const short = 'a'.repeat(MIN_PASSWORD_LENGTH - 1);
    expect(validateNewPassword({ newPassword: short, confirmPassword: short })).toMatch(
      new RegExp(`${MIN_PASSWORD_LENGTH} characters`),
    );
  });

  it('rejects a mismatched confirmation', () => {
    expect(validateNewPassword({ ...base, confirmPassword: 'newpassword2' })).toMatch(/do not match/i);
  });

  it('rejects an empty password', () => {
    expect(validateNewPassword({ newPassword: '', confirmPassword: '' })).toMatch(/new password/i);
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

/**
 * Founder decision 2026-07-24 — which fields a password protects.
 * Email is the recovery channel and IS gated. Name/avatar are not: they are
 * display preferences, and an Apple-only account has no password to demand.
 */
describe('emailChangeRequiresPassword', () => {
  it('demands a password from an account that HAS one', () => {
    expect(emailChangeRequiresPassword(emailUser)).toBe(true);
  });

  it('does not demand one from an Apple-only account', () => {
    // There is nothing to reauthenticate against; asking would dead-end them.
    expect(emailChangeRequiresPassword(appleUser)).toBe(false);
  });

  it('treats an unknown user as password-less rather than guessing', () => {
    expect(emailChangeRequiresPassword(null)).toBe(false);
    expect(emailChangeRequiresPassword(undefined)).toBe(false);
    expect(emailChangeRequiresPassword({})).toBe(false);
  });

  it('follows hasPasswordIdentity exactly — one rule, one place', () => {
    for (const u of [emailUser, appleUser, {}, null]) {
      expect(emailChangeRequiresPassword(u)).toBe(hasPasswordIdentity(u));
    }
  });

  it('demands a password from a linked Apple+email account', () => {
    expect(
      emailChangeRequiresPassword({
        email: 'sam@example.com',
        identities: [{ provider: 'apple' }, { provider: 'email' }],
      }),
    ).toBe(true);
  });
});

describe('validateEmailChangeRequest', () => {
  const base = { currentEmail: 'sam@example.com', requiresPassword: true };

  it('accepts a new address with the current password supplied', () => {
    expect(
      validateEmailChangeRequest({ ...base, nextEmail: 'new@example.com', currentPassword: 'hunter22' }),
    ).toBeNull();
  });

  it('refuses a new address with no password when one is required', () => {
    expect(
      validateEmailChangeRequest({ ...base, nextEmail: 'new@example.com', currentPassword: '' }),
    ).toBe('Enter your current password to change your email.');
  });

  it('treats whitespace as no password', () => {
    expect(
      validateEmailChangeRequest({ ...base, nextEmail: 'new@example.com', currentPassword: '   ' }),
    ).toBe('Enter your current password to change your email.');
  });

  it('accepts a password-less account with no password supplied', () => {
    expect(
      validateEmailChangeRequest({
        nextEmail: 'new@example.com',
        currentEmail: 'old@example.com',
        currentPassword: '',
        requiresPassword: false,
      }),
    ).toBeNull();
  });

  it('reports the address problem BEFORE asking for a password', () => {
    // Otherwise a user types a typo, is asked for a password, and only then
    // learns the address was never valid.
    expect(
      validateEmailChangeRequest({ ...base, nextEmail: 'not-an-email', currentPassword: '' }),
    ).toBe('Please enter a valid email address.');
    expect(
      validateEmailChangeRequest({ ...base, nextEmail: 'sam@example.com', currentPassword: '' }),
    ).toBe('That is already your email.');
    expect(
      validateEmailChangeRequest({ ...base, nextEmail: '  ', currentPassword: '' }),
    ).toBe('Enter the email you want to use.');
  });

  it('agrees with validateEmailChange on every address question', () => {
    for (const nextEmail of ['new@example.com', 'not-an-email', 'sam@example.com', '']) {
      const addressProblem = validateEmailChange(nextEmail, base.currentEmail);
      if (addressProblem) {
        expect(
          validateEmailChangeRequest({ ...base, nextEmail, currentPassword: 'hunter22' }),
        ).toBe(addressProblem);
      }
    }
  });
});

/**
 * VERIFIED LIVE 2026-07-25: the project auto-confirms ("Confirm email" off), so
 * no confirmation link is ever sent — the gate the Apple-only path used to lean
 * on does not exist, and "Secure email change" cannot restore it while
 * confirmations are off. An Apple account therefore proves ownership with a
 * fresh Sign in with Apple.
 */
describe('emailChangeReauthMethod', () => {
  it('asks a password account for its password', () => {
    expect(emailChangeReauthMethod(emailUser)).toBe('password');
  });

  it('asks an Apple-only account for a fresh Apple sign-in', () => {
    expect(emailChangeReauthMethod(appleUser)).toBe('apple');
  });

  it('prefers the password when an account has both', () => {
    expect(
      emailChangeReauthMethod({
        email: 'sam@example.com',
        identities: [{ provider: 'apple' }, { provider: 'email' }],
      }),
    ).toBe('password');
  });

  it('returns none when there is no provable identity at all', () => {
    expect(emailChangeReauthMethod(null)).toBe('none');
    expect(emailChangeReauthMethod({})).toBe('none');
    expect(emailChangeReauthMethod({ identities: [{ provider: 'google' }] })).toBe('none');
  });

  it('agrees with emailChangeRequiresPassword on every account shape', () => {
    for (const u of [emailUser, appleUser, {}, null]) {
      expect(emailChangeReauthMethod(u) === 'password').toBe(emailChangeRequiresPassword(u));
    }
  });
});
