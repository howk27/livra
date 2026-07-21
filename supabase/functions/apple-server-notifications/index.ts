// Supabase Edge Function — App Store Server Notifications V2 endpoint.
//
// WHY THIS EXISTS:
//   Before this function, nothing in Livra ever wrote pro_unlocked = false.
//   validate-iap-receipt only ever granted. A refund, a revoke, or a cancellation
//   left the user Pro forever. Apple tells us about every one of those events —
//   we just had nowhere for it to arrive.
//
// VERIFY_JWT IS OFF FOR THIS FUNCTION — AND ONLY THIS FUNCTION.
//   Apple is not a Supabase user and does not send a Supabase JWT. If the
//   platform gateway required one, every notification would be rejected with 401
//   before this code ran. See supabase/config.toml:
//       [functions.apple-server-notifications] verify_jwt = false
//   The authentication is NOT missing, it is different: the request body is a
//   JWS that must chain to Apple's pinned root CA (verifyAppleJws.ts). An
//   unsigned or wrongly-signed POST to this URL changes nothing.
//
// SHAPE OF THE WORK:
//   1. verify signedPayload  -> notificationType + subtype + data
//   2. verify data.signedTransactionInfo -> originalTransactionId, expiresDate
//   3. decideEntitlement(type, subtype)  -> pure decision (unit-tested)
//   4. correlate originalTransactionId -> profiles row
//   5. update_pro_status RPC (service role)
//
// STATUS CODES: Apple retries on any non-2xx. We answer 200 for anything we have
// definitively handled OR definitively cannot act on (unknown subscriber), and
// 4xx/5xx only when a retry could actually help. A signature failure gets 401
// and is not retried into the void.
//
// Deploy:  supabase functions deploy apple-server-notifications --no-verify-jwt
// Secrets: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are injected automatically.
//          APPLE_ROOT_CA_G3_B64 (recommended, see verifyAppleJws.ts)
//          APPLE_BUNDLE_ID      (optional, defaults to com.livra.app)
//
// @ts-nocheck - Deno runtime imports (not Node.js)

// @ts-ignore - Deno runtime import
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { decideEntitlement } from './entitlementDecision.ts';
import { verifyAppleSignedPayload } from './verifyAppleJws.ts';

const EXPECTED_BUNDLE_ID = Deno.env.get('APPLE_BUNDLE_ID') || 'com.livra.app';

type ResponseBodyV2DecodedPayload = {
  notificationType?: string;
  subtype?: string;
  notificationUUID?: string;
  data?: {
    bundleId?: string;
    environment?: string;
    signedTransactionInfo?: string;
    signedRenewalInfo?: string;
  };
};

type JWSTransactionDecodedPayload = {
  originalTransactionId?: string;
  transactionId?: string;
  productId?: string;
  bundleId?: string;
  expiresDate?: number;
  revocationDate?: number;
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return json(405, { ok: false, error: 'method_not_allowed' });
  }

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
  const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error('[apple-notifications] missing SUPABASE_URL or SERVICE_ROLE_KEY');
    return json(500, { ok: false, error: 'server_misconfigured' });
  }

  // ── 1. Verify the outer notification ───────────────────────────────────────
  let notification: ResponseBodyV2DecodedPayload;
  try {
    const body = await req.json();
    const signedPayload = body?.signedPayload;
    if (typeof signedPayload !== 'string' || !signedPayload) {
      return json(400, { ok: false, error: 'missing_signed_payload' });
    }
    notification = await verifyAppleSignedPayload<ResponseBodyV2DecodedPayload>(signedPayload);
  } catch (err) {
    // Unverified input. Never act on it, and never 500 (Apple would retry a
    // forged request forever).
    console.error(
      '[apple-notifications] signature verification failed:',
      err instanceof Error ? err.message : String(err)
    );
    return json(401, { ok: false, error: 'invalid_signature' });
  }

  const notificationType = String(notification?.notificationType ?? '');
  const subtype = notification?.subtype ? String(notification.subtype) : null;
  const notificationUUID = notification?.notificationUUID ?? null;

  // Reject notifications for a different app that happen to be validly signed.
  const bundleId = notification?.data?.bundleId;
  if (bundleId && bundleId !== EXPECTED_BUNDLE_ID) {
    console.error('[apple-notifications] bundleId mismatch:', bundleId);
    return json(400, { ok: false, error: 'bundle_id_mismatch' });
  }

  // ── 2. Verify the nested transaction payload ───────────────────────────────
  let transaction: JWSTransactionDecodedPayload = {};
  const signedTransactionInfo = notification?.data?.signedTransactionInfo;
  if (typeof signedTransactionInfo === 'string' && signedTransactionInfo) {
    try {
      transaction =
        await verifyAppleSignedPayload<JWSTransactionDecodedPayload>(signedTransactionInfo);
    } catch (err) {
      console.error(
        '[apple-notifications] transaction signature verification failed:',
        err instanceof Error ? err.message : String(err)
      );
      return json(401, { ok: false, error: 'invalid_transaction_signature' });
    }
  }

  const originalTransactionId = transaction?.originalTransactionId
    ? String(transaction.originalTransactionId)
    : null;
  const productId = transaction?.productId ? String(transaction.productId) : null;
  const expiresDateMs =
    typeof transaction?.expiresDate === 'number' ? transaction.expiresDate : null;

  console.log('[apple-notifications] received', {
    notificationType,
    subtype,
    notificationUUID,
    originalTransactionId,
    productId,
  });

  // ── 3. Decide (pure, unit-tested) ──────────────────────────────────────────
  const decision = decideEntitlement(notificationType, subtype);

  // TEST notifications from App Store Connect carry no transaction — ack them so
  // the founder's "Send Test Notification" button shows a green result.
  if (!originalTransactionId) {
    console.log('[apple-notifications] no originalTransactionId — acknowledging only', {
      notificationType,
      reason: decision.reason,
    });
    return json(200, { ok: true, handled: false, reason: 'no_original_transaction_id' });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // ── 4. Correlate to a user by original_transaction_id ──────────────────────
  const { data: profile, error: lookupError } = await admin
    .from('profiles')
    .select('id')
    .eq('pro_original_transaction_id', originalTransactionId)
    .maybeSingle();

  if (lookupError) {
    // A DB blip IS worth a retry from Apple.
    console.error('[apple-notifications] profile lookup failed:', lookupError.message);
    return json(500, { ok: false, error: 'lookup_failed' });
  }

  if (!profile?.id) {
    // Not an error: the subscription may belong to an account that has not run
    // validate-iap-receipt yet (that call is what binds the id). Retrying will
    // not change that, so acknowledge. The user's next receipt validation
    // establishes the link, and livra_is_pro's expiry check still protects us in
    // the meantime.
    console.warn('[apple-notifications] no profile for originalTransactionId', {
      originalTransactionId,
      notificationType,
    });
    return json(200, { ok: true, handled: false, reason: 'unknown_subscriber' });
  }

  // ── 5. Apply ───────────────────────────────────────────────────────────────
  if (decision.proUnlocked === null && decision.status === null) {
    console.log('[apple-notifications] record-only, entitlement untouched', {
      userId: profile.id,
      reason: decision.reason,
    });
    return json(200, { ok: true, handled: true, action: 'record_only', reason: decision.reason });
  }

  const { error: rpcError } = await admin.rpc('update_pro_status', {
    p_user_id: profile.id,
    p_pro_unlocked: decision.proUnlocked,
    p_original_transaction_id: originalTransactionId,
    p_product_id: productId,
    // Only send an expiry when the decision says to move it. A grace-period
    // event sends null, which update_pro_status reads as "keep the stored
    // expiry" — the user keeps access to the date they already paid through.
    p_expires_at:
      decision.applyExpiry && expiresDateMs ? new Date(expiresDateMs).toISOString() : null,
    p_status: decision.status,
  });

  if (rpcError) {
    console.error('[apple-notifications] update_pro_status failed:', rpcError.message);
    return json(500, { ok: false, error: 'update_failed' });
  }

  console.log('[apple-notifications] applied', {
    userId: profile.id,
    notificationType,
    subtype,
    proUnlocked: decision.proUnlocked,
    status: decision.status,
    reason: decision.reason,
  });

  return json(200, {
    ok: true,
    handled: true,
    action: decision.proUnlocked === false ? 'revoked' : 'updated',
    reason: decision.reason,
  });
});
