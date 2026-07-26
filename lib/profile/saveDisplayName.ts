import type { SupabaseClient } from '@supabase/supabase-js';

export type SaveDisplayNameResult = { ok: true } | { ok: false; error: unknown };

/**
 * Write the display name to public.profiles.
 *
 * DO NOT REPLACE THIS WITH `.upsert({ id, display_name })`. That was the
 * original implementation and it could never save, for anyone, on any provider
 * — every profiles.display_name in production was NULL. PostgREST compiles an
 * upsert into
 *
 *     INSERT INTO profiles (id, display_name) VALUES (...)
 *     ON CONFLICT (id) DO UPDATE SET id = excluded.id,
 *                                    display_name = excluded.display_name
 *
 * i.e. every payload column joins the SET list, primary key included. On this
 * database `authenticated` holds column-level UPDATE for exactly avatar_url,
 * display_name, full_name and onboarding_completed, so `SET id = ...` asks for
 * a privilege the role does not have and Postgres answers 42501 permission
 * denied. The screen caught that and said "Could not save profile", which read
 * as "editing my name does nothing".
 *
 * Proven live 2026-07-25 by running three statement shapes as `authenticated`
 * inside a rolled-back transaction: the upsert failed 42501, the same upsert
 * without id in the SET succeeded, and a plain UPDATE succeeded. Every other
 * profiles write in this repo (avatarStorage, uiSlice) already used UPDATE —
 * this one call was the outlier.
 *
 * The insert fallback covers the account whose profile row never got created
 * (the signup insert is best-effort): without it a plain UPDATE matching zero
 * rows would report success and save nothing, which is the same silent failure
 * wearing a different hat.
 */
export async function saveDisplayName(
  supabase: SupabaseClient,
  userId: string,
  displayName: string
): Promise<SaveDisplayNameResult> {
  const { data, error } = await supabase
    .from('profiles')
    .update({ display_name: displayName })
    .eq('id', userId)
    .select('id');

  if (error) return { ok: false, error };
  if (Array.isArray(data) && data.length > 0) return { ok: true };

  const { error: insertError } = await supabase
    .from('profiles')
    .insert({ id: userId, display_name: displayName });

  if (insertError) return { ok: false, error: insertError };
  return { ok: true };
}
