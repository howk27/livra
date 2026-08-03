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

/**
 * The stamp as a SCREEN knows it: `undefined` until the profile row has been
 * read, then a timestamp or `null`.
 */
export type VerificationStamp = string | null | undefined;

/**
 * Should the verify banner render right now?
 *
 * UNKNOWN IS NOT UNVERIFIED (QC-1061). Both screens hold the stamp in state and
 * fetch the profile in an effect, so the first render always has no stamp yet.
 * `needsEmailVerification` reads that absence as "unproven" — correct for its own
 * question, wrong for a banner — so the banner painted on mount and vanished when
 * the row arrived, flashing on every navigation to a verified account's Settings.
 *
 * Anything the user can be nagged by has to wait for the answer, so this returns
 * false while the stamp is unknown. A verified account therefore never sees the
 * banner at all, and an unverified one sees it a beat later than before.
 */
export function shouldAskToVerify(
  user: CredentialUser | null | undefined,
  emailVerifiedAt: VerificationStamp,
): boolean {
  if (emailVerifiedAt === undefined) return false;
  return needsEmailVerification(user, emailVerifiedAt);
}

/**
 * Should a return to the foreground re-read the stamp? (2026-08-02 QA: the
 * website flow stamped the row while the app sat in the background, and the
 * banner never noticed — both screens read the stamp exactly once, on mount.)
 *
 * True for a signed-in account whose stamp is null OR still unknown: unknown
 * means the mount read may have failed (offline, transient), and coming back
 * to the foreground is exactly the moment to retry. This deliberately differs
 * from shouldAskToVerify, where unknown must stay silent (QC-1061) — an extra
 * SELECT is harmless, an extra banner is not.
 */
export function shouldRecheckVerification(
  userId: string | null | undefined,
  emailVerifiedAt: VerificationStamp,
): boolean {
  if (!userId) return false;
  return !emailVerifiedAt;
}

/** GoTrue's own rejections when ASKING for a link (signInWithOtp). */
export function mapSendCodeError(message?: string | null): string {
  const m = (message ?? '').toLowerCase();
  if (m.includes('rate') || m.includes('too many') || m.includes('security purposes')) {
    return 'Too many requests. Wait a minute, then ask for a new link.';
  }
  if (m.includes('network') || m.includes('fetch')) {
    return 'No connection. Try again once you are back online.';
  }
  return 'We could not send the link. Try again in a moment.';
}

/** What the screen says once a link is on its way (M9 P7, D1: the typed code
 * is gone — verification completes on the website the link opens). */
export function describeLinkSent(email?: string | null): string {
  return email
    ? `We emailed a verification link to ${email} · open it, then come back here.`
    : 'We emailed you a verification link · open it, then come back here.';
}

/** What the screen says when a status check finds the stamp not there yet. */
export const LINK_NOT_VERIFIED_YET_COPY =
  'Not verified yet. Open the link in your email first. It can take a minute to arrive.';

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
