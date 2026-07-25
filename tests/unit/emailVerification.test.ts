// Soft email verification (founder call 2026-07-25): let people in, prove the
// address afterwards. These are the decisions the screens delegate.
import {
  VERIFICATION_CODE_LENGTH,
  describeCodeSent,
  isEmailProven,
  mapSendCodeError,
  mapVerifyEmailError,
  needsEmailVerification,
  normalizeVerificationCode,
  validateVerificationCode,
} from '../../lib/auth/emailVerification';
import type { CredentialUser } from '../../lib/auth/accountCredentials';

const user = (over: Partial<CredentialUser> = {}): CredentialUser =>
  ({ id: 'u1', email: 'dei@example.com', ...over } as CredentialUser);

describe('isEmailProven', () => {
  it('is proven once the column carries a stamp', () => {
    expect(isEmailProven({ email: 'dei@example.com', emailVerifiedAt: '2026-07-25T10:00:00Z' })).toBe(true);
  });

  it('is unproven with no stamp', () => {
    expect(isEmailProven({ email: 'dei@example.com', emailVerifiedAt: null })).toBe(false);
  });

  it('treats an Apple private relay address as proven without a stamp', () => {
    // Apple issued it against a verified Apple ID, and the user cannot receive
    // at it outside Apple's forwarding. Nagging them would be noise.
    expect(isEmailProven({ email: 'abc123@privaterelay.appleid.com', emailVerifiedAt: null })).toBe(true);
  });

  it('is unproven when there is no address at all', () => {
    expect(isEmailProven({ email: null, emailVerifiedAt: null })).toBe(false);
  });
});

describe('needsEmailVerification', () => {
  it('asks an unproven password account', () => {
    expect(needsEmailVerification(user(), null)).toBe(true);
  });

  it('does not ask once the stamp is there', () => {
    expect(needsEmailVerification(user(), '2026-07-25T10:00:00Z')).toBe(false);
  });

  it('does not ask a relay address', () => {
    expect(needsEmailVerification(user({ email: 'x@privaterelay.appleid.com' }), null)).toBe(false);
  });

  it('does not ask when signed out, or when the account has no address', () => {
    expect(needsEmailVerification(null, null)).toBe(false);
    expect(needsEmailVerification(user({ email: null }), null)).toBe(false);
  });
});

describe('the code itself', () => {
  it('keeps digits only, from however the code was pasted', () => {
    expect(normalizeVerificationCode(' 12 34-56 ')).toBe('123456');
  });

  it('never grows past the code length', () => {
    expect(normalizeVerificationCode('1234567890')).toHaveLength(VERIFICATION_CODE_LENGTH);
  });

  it('asks for the code before anything is typed', () => {
    expect(validateVerificationCode('')).toBe('Enter the code from your email.');
  });

  it('names the length while the code is short', () => {
    expect(validateVerificationCode('123')).toContain(String(VERIFICATION_CODE_LENGTH));
  });

  it('passes a full code, spaced or not', () => {
    expect(validateVerificationCode('123456')).toBeNull();
    expect(validateVerificationCode('12 34 56')).toBeNull();
  });
});

describe('failure copy', () => {
  it('distinguishes a wrong code from an expired one', () => {
    expect(mapVerifyEmailError('invalid_code')).not.toBe(mapVerifyEmailError('expired_code'));
    expect(mapVerifyEmailError('expired_code')).toContain('expired');
  });

  it('says the code worked when only the save failed', () => {
    expect(mapVerifyEmailError('stamp_failed')).toContain('right');
  });

  it('reads an unknown server code as transient rather than leaking it', () => {
    const copy = mapVerifyEmailError('some_new_thing');
    expect(copy).toBe(mapVerifyEmailError('verify_failed'));
    expect(copy).not.toContain('some_new_thing');
  });

  it('recognises the rate limit when asking for a code', () => {
    expect(mapSendCodeError('For security purposes, you can only request this after 51 seconds'))
      .toContain('Wait a minute');
  });
});

describe('confirmation copy', () => {
  it('names the address the code went to', () => {
    expect(describeCodeSent('dei@example.com')).toContain('dei@example.com');
  });

  it('still says something useful with no address to name', () => {
    expect(describeCodeSent(null)).toContain('Code sent');
  });

  it('uses the middle dot separator, never a dash', () => {
    expect(describeCodeSent('dei@example.com')).toContain('·');
    expect(describeCodeSent('dei@example.com')).not.toMatch(/[—–]|\s-\s/);
  });
});
