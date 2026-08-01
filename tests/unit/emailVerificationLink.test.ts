/**
 * M9 Phase 7 — the link path's security gate (verify-email v2).
 *
 * Under D1 the proof of inbox is possession of the session GoTrue mints when
 * /auth/v1/verify consumes the emailed link. The one regression that must
 * never ship: a client stamping email_verified_at with its EVERYDAY session.
 * The gate reads the validated JWT's `amr` claim — `otp` entries only, and
 * only recent ones. Every refusal branch is pinned here.
 */

import {
  evaluateLinkSession,
  decodeJwtPayload,
  LINK_SESSION_MAX_AGE_S,
  LINK_SESSION_MAX_SKEW_S,
} from '../../supabase/functions/verify-email/linkSessionGate';

const NOW = 1_800_000_000; // fixed epoch seconds

const session = (amr: unknown) => ({ sub: 'user-1', amr });

describe('evaluateLinkSession', () => {
  it('accepts a fresh otp-minted session', () => {
    expect(
      evaluateLinkSession(session([{ method: 'otp', timestamp: NOW - 30 }]), NOW),
    ).toEqual({ ok: true });
  });

  it('accepts the magiclink method name too', () => {
    expect(
      evaluateLinkSession(session([{ method: 'magiclink', timestamp: NOW - 30 }]), NOW),
    ).toEqual({ ok: true });
  });

  it('REFUSES a password session — the self-stamp regression', () => {
    expect(
      evaluateLinkSession(session([{ method: 'password', timestamp: NOW - 30 }]), NOW),
    ).toEqual({ ok: false, reason: 'no_otp_login' });
  });

  it('REFUSES an oauth (Sign in with Apple) session', () => {
    expect(
      evaluateLinkSession(session([{ method: 'oauth', timestamp: NOW - 30 }]), NOW),
    ).toEqual({ ok: false, reason: 'no_otp_login' });
  });

  it('REFUSES a stale otp login — an old remembered session cannot stamp later', () => {
    expect(
      evaluateLinkSession(
        session([{ method: 'otp', timestamp: NOW - LINK_SESSION_MAX_AGE_S - 1 }]),
        NOW,
      ),
    ).toEqual({ ok: false, reason: 'stale_otp_login' });
  });

  it('accepts right at the age boundary', () => {
    expect(
      evaluateLinkSession(
        session([{ method: 'otp', timestamp: NOW - LINK_SESSION_MAX_AGE_S }]),
        NOW,
      ),
    ).toEqual({ ok: true });
  });

  it('REFUSES a timestamp further in the future than tolerable skew (fail closed)', () => {
    expect(
      evaluateLinkSession(
        session([{ method: 'otp', timestamp: NOW + LINK_SESSION_MAX_SKEW_S + 1 }]),
        NOW,
      ),
    ).toEqual({ ok: false, reason: 'stale_otp_login' });
  });

  it('tolerates small forward skew', () => {
    expect(
      evaluateLinkSession(session([{ method: 'otp', timestamp: NOW + 10 }]), NOW),
    ).toEqual({ ok: true });
  });

  it('uses the NEWEST otp entry when several exist', () => {
    expect(
      evaluateLinkSession(
        session([
          { method: 'otp', timestamp: NOW - LINK_SESSION_MAX_AGE_S - 500 },
          { method: 'otp', timestamp: NOW - 5 },
        ]),
        NOW,
      ),
    ).toEqual({ ok: true });
  });

  it('REFUSES missing, empty, or malformed amr', () => {
    expect(evaluateLinkSession(session(undefined), NOW)).toEqual({ ok: false, reason: 'no_amr' });
    expect(evaluateLinkSession(session([]), NOW)).toEqual({ ok: false, reason: 'no_amr' });
    expect(evaluateLinkSession(null, NOW)).toEqual({ ok: false, reason: 'no_amr' });
    expect(
      evaluateLinkSession(session([{ method: 'otp', timestamp: 'soon' }]), NOW),
    ).toEqual({ ok: false, reason: 'no_otp_login' });
  });
});

describe('decodeJwtPayload', () => {
  const encode = (obj: unknown) =>
    Buffer.from(JSON.stringify(obj)).toString('base64url');

  it('decodes a base64url payload segment', () => {
    const jwt = `${encode({ alg: 'HS256' })}.${encode({ sub: 'u1', amr: [] })}.sig`;
    expect(decodeJwtPayload(jwt)).toEqual({ sub: 'u1', amr: [] });
  });

  it('returns null for wrong segment counts and garbage — refusal, not empty payload', () => {
    expect(decodeJwtPayload('only.two')).toBeNull();
    expect(decodeJwtPayload('')).toBeNull();
    expect(decodeJwtPayload('a.!!!not-base64!!!.c')).toBeNull();
  });
});
