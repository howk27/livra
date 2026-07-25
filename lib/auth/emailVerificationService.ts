// The two round trips soft email verification needs, in one place so the
// settings banner and Edit Profile cannot drift apart. Decisions and copy live
// in ./emailVerification (pure); this file only talks to Supabase.
//
// Asking for the code is a plain client call (GoTrue rate-limits it). Declaring
// success is NOT: the profiles guard trigger blocks the client from writing
// email_verified_at, and the verify-email edge function is the only writer, so
// the stamp always follows a code GoTrue actually accepted.
import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '../utils/logger';
import { mapSendCodeError, mapVerifyEmailError, normalizeVerificationCode } from './emailVerification';

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
 * Mails a six-digit code to the account's own address. `shouldCreateUser: false`
 * matters: this is a proof-of-inbox for someone already signed in, and must
 * never quietly mint an account for a typo'd address.
 */
export async function sendVerificationCode(
  supabase: SupabaseClient,
  email: string,
): Promise<VerificationResult> {
  try {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false },
    });
    if (error) return { ok: false, message: mapSendCodeError(error.message) };
    return { ok: true, verifiedAt: null };
  } catch (err) {
    logger.error('[emailVerification] send failed:', err);
    return { ok: false, message: mapSendCodeError(err instanceof Error ? err.message : null) };
  }
}

/**
 * Hands the code to the edge function, which verifies it and stamps the column.
 * The address is never sent: the function reads it off the caller's own auth
 * record, so a code cannot be redeemed against somebody else's address.
 */
export async function submitVerificationCode(
  supabase: SupabaseClient,
  rawCode: string,
): Promise<VerificationResult> {
  const token = normalizeVerificationCode(rawCode);
  try {
    const { data, error } = await supabase.functions.invoke('verify-email', {
      method: 'POST',
      body: { token },
    });
    const payload = data as { ok?: boolean; error?: string; email_verified_at?: string } | null;

    if (payload?.ok === true) {
      return { ok: true, verifiedAt: payload.email_verified_at ?? new Date().toISOString() };
    }
    // supabase-js leaves `data` null on a non-2xx (the FunctionsHttpError trap
    // that made every IAP rejection read transient, lib/iap/validationOutcome.ts),
    // so an error with no payload is classified from the transport, not assumed.
    if (payload?.error) return { ok: false, message: mapVerifyEmailError(payload.error) };
    if (error) {
      logger.warn('[emailVerification] verify rejected:', error.message);
      return { ok: false, message: mapVerifyEmailError('verify_failed') };
    }
    return { ok: false, message: mapVerifyEmailError('verify_failed') };
  } catch (err) {
    logger.error('[emailVerification] verify threw:', err);
    return { ok: false, message: mapVerifyEmailError('network') };
  }
}
