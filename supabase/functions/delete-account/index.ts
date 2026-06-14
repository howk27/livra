// Supabase Edge Function — AUTH-1: permanent account deletion.
//
// Why this exists:
//   The client "Delete Account" action previously only told the user to email
//   support. App Store Guideline 5.1.1(v) requires in-app account deletion that
//   actually removes the account. The anon/authenticated client cannot delete an
//   auth user — that needs the service role and the admin API.
//
// What it does:
//   - Authenticates the caller via the JWT in the Authorization header.
//   - Resolves the caller's own user id from that JWT (a user can only delete
//     themselves — the id is never taken from the request body).
//   - Calls auth.admin.deleteUser(userId) with the service-role client.
//
// Data cleanup is automatic: every user-owned table
//   (profiles, counters, counter_events, counter_streaks, counter_badges,
//    mark_notes, goals, goal_mark_links, ai_goal_packages)
//   has a foreign key REFERENCES auth.users(id) ON DELETE CASCADE, so removing
//   the auth user removes all associated rows. See the companion migration
//   supabase/migrations/20260614_delete_account_cascade_check.sql which asserts
//   those cascades still exist.
//
// Deploy:  supabase functions deploy delete-account
// Secrets: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically.
// STATUS:  DEPLOYED 2026-06-14 — deployed manually by the user.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') {
    return json(405, { ok: false, error: 'method_not_allowed' });
  }

  // Auth: require a bearer JWT. The user may only delete themselves.
  const authHeader = req.headers.get('Authorization') ?? '';
  const jwt = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!jwt) return json(401, { ok: false, error: 'unauthenticated' });

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
  const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error('[delete-account] missing SUPABASE_URL or SERVICE_ROLE_KEY');
    return json(500, { ok: false, error: 'server_misconfigured' });
  }

  // Service-role client: bypasses RLS and can call the admin API.
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Resolve the caller from their JWT — id comes from the token, never the body.
  const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
  const user = userData?.user;
  if (userErr || !user) return json(401, { ok: false, error: 'unauthenticated' });

  // Delete the auth user. ON DELETE CASCADE removes all owned rows.
  const { error: deleteErr } = await admin.auth.admin.deleteUser(user.id);
  if (deleteErr) {
    console.error('[delete-account] deleteUser failed:', deleteErr.message);
    return json(500, { ok: false, error: 'delete_failed' });
  }

  return json(200, { ok: true });
});
