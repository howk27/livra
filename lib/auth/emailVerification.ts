// Soft email verification (founder call 2026-07-25): the door stays open, the
// address gets proven afterwards. Pure decisions only — no Supabase, no I/O, so
// every rule here is testable and the screens stay thin.
//
// The signal is profiles.email_verified_at, NOT auth.users.email_confirmed_at:
// this project auto-confirms at signup, so the auth column is stamped ~50ms
// after created_at for everybody and proves nothing. Writing the real column is
// the verify-email edge function's job alone; the client cannot (the profiles
// guard trigger pins it for the two PostgREST roles).
import { isApplePrivateRelayEmail, type CredentialUser } from './accountCredentials';

/** GoTrue's email OTP is six digits. */
export const VERIFICATION_CODE_LENGTH = 6;

export type VerificationSubject = {
  email?: string | null;
  /** profiles.email_verified_at, ISO string or null. */
  emailVerifiedAt?: string | null;
};

/**
 * Is this address proven? A private-relay address is proven by construction:
 * Apple issued it against a verified Apple ID, and the migration stamps those
 * at signup. The predicate answers true for them regardless, so a device on an
 * older row (or an account created before the migration lands) is never nagged
 * about mail it cannot receive.
 */
export function isEmailProven(subject: VerificationSubject): boolean {
  if (subject.emailVerifiedAt) return true;
  return isApplePrivateRelayEmail(subject.email);
}

/**
 * Should this account be asked to prove its address? Only a signed-in account
 * with an unproven address. No email at all (an Apple account that hid it and
 * supplied nothing) is nothing to ask about.
 */
export function needsEmailVerification(
  user: CredentialUser | null | undefined,
  emailVerifiedAt: string | null | undefined,
): boolean {
  if (!user?.email) return false;
  return !isEmailProven({ email: user.email, emailVerifiedAt });
}

/** Digits only: people paste codes with spaces, and mail clients add them. */
export function normalizeVerificationCode(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, VERIFICATION_CODE_LENGTH);
}

/** Null when the code is worth sending; otherwise the sentence to show. */
export function validateVerificationCode(raw: string): string | null {
  const code = normalizeVerificationCode(raw);
  if (code.length === 0) return 'Enter the code from your email.';
  if (code.length < VERIFICATION_CODE_LENGTH) {
    return `The code is ${VERIFICATION_CODE_LENGTH} digits.`;
  }
  return null;
}

/** The error codes verify-email returns, plus the transport failures around it. */
export type VerifyEmailFailure =
  | 'invalid_code'
  | 'expired_code'
  | 'verify_failed'
  | 'identity_mismatch'
  | 'no_email_on_account'
  | 'missing_token'
  | 'bad_request'
  | 'unauthenticated'
  | 'server_misconfigured'
  | 'stamp_failed'
  | 'network';

const FAILURE_COPY: Record<VerifyEmailFailure, string> = {
  invalid_code: 'That code did not match. Check the email and try again.',
  expired_code: 'That code has expired. Send a new one.',
  verify_failed: 'We could not check that code. Try again in a moment.',
  identity_mismatch: 'That code belongs to a different account.',
  no_email_on_account: 'This account has no email address to verify.',
  missing_token: 'Enter the code from your email.',
  bad_request: 'We could not check that code. Try again in a moment.',
  unauthenticated: 'Sign in again, then verify your email.',
  server_misconfigured: 'Verification is unavailable right now. Try again later.',
  stamp_failed: 'Your code was right, but saving it failed. Try again.',
  network: 'No connection. Try again once you are back online.',
};

/** Never leaks a raw server string to the user; unknown codes read as transient. */
export function mapVerifyEmailError(code?: string | null): string {
  if (code && code in FAILURE_COPY) return FAILURE_COPY[code as VerifyEmailFailure];
  return FAILURE_COPY.verify_failed;
}

/** GoTrue's own rejections when ASKING for a code (signInWithOtp). */
export function mapSendCodeError(message?: string | null): string {
  const m = (message ?? '').toLowerCase();
  if (m.includes('rate') || m.includes('too many') || m.includes('security purposes')) {
    return 'Too many requests. Wait a minute, then ask for a new code.';
  }
  if (m.includes('network') || m.includes('fetch')) {
    return 'No connection. Try again once you are back online.';
  }
  return 'We could not send the code. Try again in a moment.';
}

/** What the screen says once a code is on its way. */
export function describeCodeSent(email?: string | null): string {
  return email
    ? `Code sent to ${email} · it expires in about an hour.`
    : 'Code sent · it expires in about an hour.';
}

/**
 * How long "Send again" stays quiet after a code goes out.
 *
 * GoTrue rate-limits resends server-side and `mapSendCodeError` explains the
 * refusal honestly, so this is not what protects the endpoint — it is what
 * stops the user tapping into a refusal they had no way to see coming. A
 * minute is the shape of the wait GoTrue imposes by default.
 */
export const RESEND_COOLDOWN_SECONDS = 60;

/** The resend control's label, counting down while the wait is on. */
export function describeResend(secondsLeft: number): string {
  return secondsLeft > 0 ? `Send again in ${secondsLeft}s` : 'Send again';
}

/**
 * Seconds still to wait, from when the last code went out.
 *
 * Clamped at BOTH ends. Zero is the obvious one. The ceiling matters because a
 * corrected device clock or a timezone crossing can put "now" behind the send,
 * which would otherwise compute a wait longer than the cooldown — unbounded,
 * and counting up. Nobody should wait more than the cooldown they were promised.
 */
export function resendSecondsLeft(sentAtMs: number | null, nowMs: number): number {
  if (sentAtMs === null) return 0;
  const elapsed = Math.floor((nowMs - sentAtMs) / 1000);
  const left = RESEND_COOLDOWN_SECONDS - elapsed;
  return Math.min(RESEND_COOLDOWN_SECONDS, Math.max(0, left));
}
