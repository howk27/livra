// Soft email verification (founder call 2026-07-25): let people in, prove the
// address afterwards. These are the decisions the screens delegate.
// M9 P7 (D1): the typed code is GONE — its helpers and their tests died with
// it; the link-sent copy claims are ported below.
import {
  RESEND_COOLDOWN_SECONDS,
  describeLinkSent,
  describeResend,
  resendSecondsLeft,
  isEmailProven,
  mapSendCodeError,
  needsEmailVerification,
  shouldAskToVerify,
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

describe('shouldAskToVerify — the banner rule (QC-1061: it flashed on navigation)', () => {
  it('stays silent while the stamp is UNKNOWN', () => {
    // The whole bug in one assertion. Both screens mount with no stamp and fetch
    // the profile in an effect, so `undefined` is the state of every first render.
    // `needsEmailVerification` answers true there — right for its own question,
    // wrong for a banner — which painted it for a frame on every navigation.
    expect(shouldAskToVerify(user(), undefined)).toBe(false);
    expect(needsEmailVerification(user(), undefined)).toBe(true); // the trap, pinned
  });

  it('asks once the row is read and the stamp is genuinely absent', () => {
    expect(shouldAskToVerify(user(), null)).toBe(true);
  });

  it('never asks a verified or relay account', () => {
    expect(shouldAskToVerify(user(), '2026-07-25T10:00:00Z')).toBe(false);
    expect(shouldAskToVerify(user({ email: 'x@privaterelay.appleid.com' }), null)).toBe(false);
  });

  it('never asks when signed out', () => {
    expect(shouldAskToVerify(null, null)).toBe(false);
    expect(shouldAskToVerify(null, undefined)).toBe(false);
  });
});

describe('failure copy', () => {
  it('recognises the rate limit when asking for a link', () => {
    expect(mapSendCodeError('For security purposes, you can only request this after 51 seconds'))
      .toContain('Wait a minute');
  });

  it('never leaks the raw server message', () => {
    const copy = mapSendCodeError('pg_boss saturated: worker 7 dead');
    expect(copy).not.toContain('pg_boss');
  });
});

describe('confirmation copy', () => {
  it('names the address the link went to', () => {
    expect(describeLinkSent('dei@example.com')).toContain('dei@example.com');
  });

  it('still says something useful with no address to name', () => {
    expect(describeLinkSent(null)).toContain('verification link');
  });

  it('uses the middle dot separator, never a dash', () => {
    expect(describeLinkSent('dei@example.com')).toContain('·');
    expect(describeLinkSent('dei@example.com')).not.toMatch(/[—–]|\s-\s/);
  });
});

// The resend cooldown is a COURTESY, not the rate limit — GoTrue enforces that
// server-side either way. Its whole job is to make the wait visible instead of
// letting the user tap into a refusal they could not see coming.
describe('resend cooldown', () => {
  const T0 = 1_700_000_000_000;

  it('asks for no wait before a code has ever been sent', () => {
    expect(resendSecondsLeft(null, T0)).toBe(0);
  });

  it('starts at the full cooldown the instant a code goes out', () => {
    expect(resendSecondsLeft(T0, T0)).toBe(RESEND_COOLDOWN_SECONDS);
  });

  it('counts down as time passes', () => {
    expect(resendSecondsLeft(T0, T0 + 15_000)).toBe(RESEND_COOLDOWN_SECONDS - 15);
  });

  it('reaches zero exactly at the cooldown, not a tick late', () => {
    expect(resendSecondsLeft(T0, T0 + RESEND_COOLDOWN_SECONDS * 1000)).toBe(0);
  });

  it('never goes negative, however long the screen stays open', () => {
    expect(resendSecondsLeft(T0, T0 + 86_400_000)).toBe(0);
  });

  it('survives a clock correction backwards without offering a negative wait', () => {
    // A user crossing a timezone or a corrected device clock can put "now"
    // behind the send. Capping at the full cooldown is the honest answer.
    expect(resendSecondsLeft(T0, T0 - 10_000)).toBeLessThanOrEqual(RESEND_COOLDOWN_SECONDS);
    expect(resendSecondsLeft(T0, T0 - 10_000)).toBeGreaterThan(0);
  });

  it('names the wait while it lasts, and stops naming it after', () => {
    expect(describeResend(42)).toBe('Send again in 42s');
    expect(describeResend(0)).toBe('Send again');
  });

  it('uses no dash in the label (copy rule)', () => {
    expect(describeResend(42)).not.toMatch(/[—–]|\s-\s/);
  });
});
