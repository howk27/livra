// Supabase Edge Function — soft email verification (founder call 2026-07-25).
//
// Why this exists:
//   Livra lets people in at the door and asks them to prove the inbox
//   afterwards. Supabase has no setting for that shape, and
//   auth.users.email_confirmed_at is worthless here (autoconfirm stamps it ~50ms
//   after signup for everyone), so the app keeps its own signal:
//   profiles.email_verified_at.
//
//   The stamp must not be self-asserted. The client CAN request the code itself
//   (signInWithOtp is rate-limited by GoTrue), but it must not be the thing that
//   declares success — the guard trigger blocks the two PostgREST roles from
//   writing email_verified_at at all, and this function, holding service_role,
//   is the only writer. It stamps only after GoTrue accepts the code.
//
// What it does:
//   - Authenticates the caller via the JWT in the Authorization header.
//   - Verifies the emailed code against GoTrue (type 'email'), using the caller's
//     OWN address read from their auth record — never an address from the body,
//     so a caller cannot verify their way onto someone else's mail.
//   - Confirms the verified identity is the caller, then stamps
//     profiles.email_verified_at with the service-role client.
//
// The verification round trip issues a session server-side as a side effect of
// verifyOtp. It is discarded here and never returned: the caller is already
// signed in, and handing back a second session would swap their live one for no
// reason (and re-run the app's onAuthStateChange path mid-screen).
//
// Deploy:  supabase functions deploy verify-email
// Secrets: SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are
//          injected automatically.
// GATE:    the Magic Link email template must contain {{ .Token }} — without it
//          Supabase mails a link and the user has no code to type.
// STATUS:  NOT YET DEPLOYED.

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

/** GoTrue's rejections, mapped to the three outcomes the app can act on. */
function classifyOtpError(message: string): 'invalid_code' | 'expired_code' | 'verify_failed' {
  const m = message.toLowerCase();
  if (m.includes('expired')) return 'expired_code';
  if (m.includes('invalid') || m.includes('not found')) return 'invalid_code';
  return 'verify_failed';
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') {
    return json(405, { ok: false, error: 'method_not_allowed' });
  }

  const authHeader = req.headers.get('Authorization') ?? '';
  const jwt = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!jwt) return json(401, { ok: false, error: 'unauthenticated' });

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
  const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY) {
    console.error('[verify-email] missing SUPABASE_URL, ANON_KEY or SERVICE_ROLE_KEY');
    return json(500, { ok: false, error: 'server_misconfigured' });
  }

  let token = '';
  try {
    const body = await req.json();
    token = String(body?.token ?? '').trim();
  } catch {
    return json(400, { ok: false, error: 'bad_request' });
  }
  if (!token) return json(400, { ok: false, error: 'missing_token' });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // The caller comes from the token, and their address comes from their auth
  // record — the body carries the code and nothing else.
  const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
  const caller = userData?.user;
  if (userErr || !caller) return json(401, { ok: false, error: 'unauthenticated' });
  if (!caller.email) return json(400, { ok: false, error: 'no_email_on_account' });

  // Anon client: verifyOtp is a public auth operation, and using the service
  // role for it would skip the very check being performed.
  const anon = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: verified, error: verifyErr } = await anon.auth.verifyOtp({
    email: caller.email,
    token,
    type: 'email',
  });

  if (verifyErr || !verified?.user) {
    const kind = classifyOtpError(verifyErr?.message ?? '');
    console.warn('[verify-email] otp rejected:', kind);
    return json(400, { ok: false, error: kind });
  }

  // Belt and braces: GoTrue verified an address, this asserts it was the
  // caller's. A mismatch means the code belonged to another account.
  if (verified.user.id !== caller.id) {
    console.error('[verify-email] verified identity does not match caller');
    return json(403, { ok: false, error: 'identity_mismatch' });
  }

  const verifiedAt = new Date().toISOString();
  const { error: stampErr } = await admin
    .from('profiles')
    .update({ email_verified_at: verifiedAt })
    .eq('id', caller.id);

  if (stampErr) {
    console.error('[verify-email] stamp failed:', stampErr.message);
    return json(500, { ok: false, error: 'stamp_failed' });
  }

  return json(200, { ok: true, email_verified_at: verifiedAt });
});
