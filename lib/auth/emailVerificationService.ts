// What soft email verification needs from Supabase, in one place so the
// settings banner and Edit Profile cannot drift apart. Decisions and copy live
// in ./emailVerification (pure); this file only talks to Supabase.
//
// M9 P7 (D1): the app SENDS the link and READS the signal — it never declares
// success. Verification completes on the website the link opens
// (livralife.com/verify-email calls the verify-email edge function with the
// session GoTrue mints by consuming the link). The profiles guard trigger
// blocks the client from writing email_verified_at either way.
import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '../utils/logger';
import { mapSendCodeError } from './emailVerification';

/** Where the emailed {{ .ConfirmationURL }} lands after GoTrue consumes the
 * token. Must be registered in Supabase → Auth → URL Configuration →
 * Redirect URLs, or GoTrue silently falls back to the Site URL. */
export const VERIFY_EMAIL_LANDING_URL = 'https://www.livralife.com/verify-email';

export type VerificationResult =
  | { ok: true; verifiedAt: string | null }
  | { ok: false; message: string };

/**
 * Reads the app's own verification signal. Returns null when unknown (no row,
 * or the read failed) — callers treat null as "not proven yet", which at worst
 * shows the banner one screen longer.
 */
export async function fetchEmailVerifiedAt(
  supabase: SupabaseClient,
  userId: string,
): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('email_verified_at')
      .eq('id', userId)
      .maybeSingle();
    if (error) throw error;
    return (data as { email_verified_at?: string | null } | null)?.email_verified_at ?? null;
  } catch (err) {
    logger.warn('[emailVerification] could not read email_verified_at:', err);
    return null;
  }
}

/**
 * Mails a verification link to the account's own address.
 * `shouldCreateUser: false` matters: this is a proof-of-inbox for someone
 * already signed in, and must never quietly mint an account for a typo'd
 * address. `emailRedirectTo` is what turns the default Magic Link template's
 * {{ .ConfirmationURL }} into a landing on our website — the {{ .Token }}
 * template gate is retired by this redesign.
 */
export async function sendVerificationLink(
  supabase: SupabaseClient,
  email: string,
): Promise<VerificationResult> {
  try {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false, emailRedirectTo: VERIFY_EMAIL_LANDING_URL },
    });
    if (error) return { ok: false, message: mapSendCodeError(error.message) };
    return { ok: true, verifiedAt: null };
  } catch (err) {
    logger.error('[emailVerification] send failed:', err);
    return { ok: false, message: mapSendCodeError(err instanceof Error ? err.message : null) };
  }
}

// submitVerificationCode is GONE (M9 P7): the app no longer redeems anything.
// The edge function keeps its code path alive for build-60 clients, whose own
// bundled copy of the old service still calls it.
