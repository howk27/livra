// Pure gate for the M9 Phase 7 link path: is this JWT a session GoTrue minted
// by ACCEPTING an email OTP / magic link, recently?
//
// Why this exists: under the link flow the proof of inbox is no longer a typed
// code — it is POSSESSION of the session that /auth/v1/verify minted when it
// consumed the emailed token. The function therefore must refuse to stamp for
// any OTHER kind of session, or every signed-in client could self-verify by
// simply calling the function with its everyday password/Apple session. The
// JWT's `amr` claim (authentication methods references) records how the
// session was earned; GoTrue writes `{ method: 'otp', timestamp }` for both
// magic-link and code verifications, and `password` / `oauth` for the everyday
// paths. Recency bounds the window so a long-lived remembered session that
// once involved an OTP cannot stamp arbitrarily later.
//
// Pure and Deno-free so jest can exercise every branch
// (tests/unit/emailVerificationLink.test.ts), same pattern as
// validate-iap-receipt/jwsEntitlement.ts.

export const LINK_SESSION_MAX_AGE_S = 600;
/** Tolerated forward clock skew between GoTrue and this function. */
export const LINK_SESSION_MAX_SKEW_S = 90;

const OTP_METHODS = new Set(['otp', 'magiclink']);

export type LinkSessionVerdict =
  | { ok: true }
  | { ok: false; reason: 'no_amr' | 'no_otp_login' | 'stale_otp_login' };

interface AmrEntry {
  method?: unknown;
  timestamp?: unknown;
}

/**
 * `payload` is the decoded JWT body of a session ALREADY validated against
 * GoTrue (auth.getUser) — this gate never replaces signature verification, it
 * only reads how the validated session was earned.
 */
export function evaluateLinkSession(payload: unknown, nowEpochS: number): LinkSessionVerdict {
  if (typeof payload !== 'object' || payload === null) return { ok: false, reason: 'no_amr' };
  const amr = (payload as { amr?: unknown }).amr;
  if (!Array.isArray(amr) || amr.length === 0) return { ok: false, reason: 'no_amr' };

  const otpTimestamps = amr
    .filter(
      (e: AmrEntry) =>
        typeof e === 'object' &&
        e !== null &&
        typeof e.method === 'string' &&
        OTP_METHODS.has(e.method) &&
        typeof e.timestamp === 'number' &&
        Number.isFinite(e.timestamp),
    )
    .map((e: AmrEntry) => e.timestamp as number);

  if (otpTimestamps.length === 0) return { ok: false, reason: 'no_otp_login' };

  const newest = Math.max(...otpTimestamps);
  const age = nowEpochS - newest;
  // A timestamp further in the future than tolerable skew is as untrustworthy
  // as a stale one — fail closed rather than treating it as "fresh".
  if (age > LINK_SESSION_MAX_AGE_S || age < -LINK_SESSION_MAX_SKEW_S) {
    return { ok: false, reason: 'stale_otp_login' };
  }
  return { ok: true };
}

/** Base64url-decode a JWT's payload segment. Returns null on any malformation —
 * callers must treat null as a refusal, never as an empty payload. */
export function decodeJwtPayload(jwt: string): unknown {
  const segments = jwt.split('.');
  if (segments.length !== 3) return null;
  try {
    const b64 = segments[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}
