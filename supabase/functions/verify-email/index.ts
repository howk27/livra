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
// TWO PATHS since M9 Phase 7 (founder ruling D1, 2026-07-27 — link replaces
// the typed code; the {{ .Token }} template gate is RETIRED BY REDESIGN, the
// default {{ .ConfirmationURL }} is exactly right):
//
//   CODE path (body { token }) — build-60 clients. Authenticates the caller
//   via the JWT in the Authorization header, verifies the emailed code against
//   GoTrue (type 'email') using the caller's OWN address read from their auth
//   record — never an address from the body — confirms the verified identity
//   IS the caller, then stamps. The session verifyOtp mints is discarded.
//
//   LINK path (body { mode: 'link' }) — the website landing page at
//   livralife.com/verify-email. Tapping the emailed link has GoTrue's
//   /auth/v1/verify CONSUME the token and mint a session; possession of that
//   session is the proof of inbox. The page calls this function with it, and
//   the gate (linkSessionGate.ts) requires the validated JWT's `amr` to show a
//   RECENT `otp` acceptance — an everyday password/Apple session is refused,
//   which is what keeps the stamp non-self-asserted on this path. The minted
//   session is used for this one call and never returned to any app client.
//
// Either way: the guard trigger blocks the two PostgREST roles from writing
// email_verified_at at all; this function, holding service_role, is the only
// writer, and it stamps only after GoTrue accepted something.
//
// Deploy:  supabase functions deploy verify-email
// Secrets: SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are
//          injected automatically.
// STATUS:  v1 (code path only) ACTIVE since 2026-07-25; v2 adds the link path.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { evaluateLinkSession, decodeJwtPayload } from './linkSessionGate.ts';

// Narrowed from '*' (Phase 7 security pass): the website landing page made
// this function a real browser caller, so the wildcard stopped being inert.
// The native app's supabase-js invoke sends no Origin header and CORS never
// gates it either way.
const ALLOWED_ORIGINS = new Set(['https://www.livralife.com', 'https://livralife.com']);

function corsHeaders(origin: string | null): Record<string, string> {
  return {
    'Access-Control-Allow-Origin':
      origin && ALLOWED_ORIGINS.has(origin) ? origin : 'https://www.livralife.com',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}

/** GoTrue's rejections, mapped to the three outcomes the app can act on. */
function classifyOtpError(message: string): 'invalid_code' | 'expired_code' | 'verify_failed' {
  const m = message.toLowerCase();
  if (m.includes('expired')) return 'expired_code';
  if (m.includes('invalid') || m.includes('not found')) return 'invalid_code';
  return 'verify_failed';
}

Deno.serve(async (req: Request) => {
  const cors = corsHeaders(req.headers.get('Origin'));
  const json = (status: number, body: unknown): Response =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors });
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
  let mode = '';
  try {
    const body = await req.json();
    token = String(body?.token ?? '').trim();
    mode = String(body?.mode ?? '').trim();
  } catch {
    return json(400, { ok: false, error: 'bad_request' });
  }
  if (mode !== 'link' && !token) return json(400, { ok: false, error: 'missing_token' });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // The caller comes from the token, and their address comes from their auth
  // record — the body carries the code and nothing else.
  const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
  const caller = userData?.user;
  if (userErr || !caller) return json(401, { ok: false, error: 'unauthenticated' });
  if (!caller.email) return json(400, { ok: false, error: 'no_email_on_account' });

  const stamp = async (): Promise<Response> => {
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
  };

  if (mode === 'link') {
    // The JWT itself is the proof: GoTrue minted it by consuming the emailed
    // link. getUser above validated it; the gate now reads HOW it was earned.
    const payload = decodeJwtPayload(jwt);
    const verdict = payload
      ? evaluateLinkSession(payload, Math.floor(Date.now() / 1000))
      : ({ ok: false, reason: 'no_amr' } as const);
    if (!verdict.ok) {
      console.warn('[verify-email] link session refused:', verdict.reason);
      return json(403, { ok: false, error: 'not_a_link_session' });
    }
    return await stamp();
  }

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

  return await stamp();
});
