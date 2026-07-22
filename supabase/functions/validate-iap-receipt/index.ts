// Supabase Edge Function: Validate IAP Receipt/Token (Subscriptions)
// Validates receipts server-side before granting premium access.
//
// STOREKIT 2 (2026-07-22): the client (expo-iap >= 4) is a StoreKit 2 client and
// has NO legacy base64 receipt to send — `transactionReceipt` is empty and
// `getReceiptIOS` does not exist. It now sends `jws`, the Apple-signed
// transaction, which we verify against the pinned Apple root
// (../_shared/verifyAppleJws.ts, the same verifier the server-notifications
// function uses) and then derive the entitlement from (jwsEntitlement.ts).
// The legacy `receipt` → /verifyReceipt path below is INTENTIONALLY still here
// for clients on an older build; it is chosen only when no `jws` is supplied.
//
// IMPORTANT:
// - iOS: checks ACTIVE entitlement (expires_date_ms > now, not cancelled).
// - Android: accepts purchaseToken for future support (currently NOT implemented; returns 501).
// - Accepts only allowed subscription product IDs.
// - Uses SECURITY DEFINER RPC update_pro_status to set pro_unlocked in DB
//   (defined in supabase/migrations/20260721_iap_subscription_lifecycle.sql).
//
// IDENTITY (fixed 2026-07-21): the user id comes from the caller's JWT, NEVER
// from the request body. Previously the body's userId was used after only
// checking that such a user existed — so any signed-in user could POST their own
// valid receipt with someone else's userId and unlock Pro on that account. Same
// pattern as supabase/functions/delete-account/index.ts. The body value is still
// read, but only to detect and reject a mismatch loudly.
//
// EXPIRY (fixed 2026-07-21): we now persist expires_date_ms, the
// original_transaction_id and the product id, so entitlement can lapse on its
// own (livra_is_pro checks pro_expires_at) and so App Store Server Notifications
// can correlate a refund/expiry back to this user.
//
// @ts-nocheck - Deno runtime imports (not Node.js)
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// @ts-ignore - Deno runtime import
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  extractActiveEntitlement,
  type AppleVerifyReceiptResponse,
} from "./receiptEntitlement.ts";
import {
  deriveJwsEntitlement,
  type JWSTransactionDecodedPayload,
} from "./jwsEntitlement.ts";
import { verifyAppleSignedPayload } from "../_shared/verifyAppleJws.ts";

const APPLE_PRODUCTION_VERIFY_URL = "https://buy.itunes.apple.com/verifyReceipt";
const APPLE_SANDBOX_VERIFY_URL = "https://sandbox.itunes.apple.com/verifyReceipt";

// App Store Connect Shared Secret (required for auto-renewable subscriptions).
// STILL USED: the legacy /verifyReceipt path below stays live until the JWS path
// is proven on device. Do not remove.
const APPLE_SHARED_SECRET = Deno.env.get("APPLE_SHARED_SECRET") || "";

// Same default and env var as apple-server-notifications — one app identity.
const EXPECTED_BUNDLE_ID = Deno.env.get("APPLE_BUNDLE_ID") || "com.livra.app";

// Allowed subscription product IDs (must match App Store Connect + client code)
const ALLOWED_PRODUCT_IDS = new Set(["livra_plus_monthly", "livra_plus_yearly"]);

type ValidationRequest = {
  platform: "ios" | "android";

  // iOS StoreKit 2 signed transaction JWS (expo-iap `purchaseToken` /
  // `getTransactionJwsIOS`). PREFERRED — this is what a current client sends.
  jws?: string;

  // iOS legacy StoreKit 1 base64 receipt. Kept for clients on an older build.
  receipt?: string;

  // Android purchase token (future support)
  purchaseToken?: string;

  // Client-reported user id. NOT trusted for identity — only cross-checked
  // against the JWT so a mismatch is rejected instead of silently honoured.
  userId?: string;
  transactionId?: string;
  productId?: string; // Optional client-reported product id (not trusted)
};

serve(async (req: any) => {
  try {
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    if (req.method !== "POST") {
      return json(405, { error: "Method not allowed" });
    }

    // Identity first: no valid bearer JWT, no validation. The id we act on comes
    // from the token, never the body.
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!jwt) {
      return json(401, { error: "unauthenticated" });
    }

    const body: ValidationRequest = await req.json();
    const { platform, jws, receipt, purchaseToken, transactionId } = body || {};
    const claimedUserId = body?.userId;

    if (!platform) {
      return json(400, { error: "Missing required field: platform" });
    }

    // Validate required input based on platform
    if (platform === "ios") {
      if (typeof jws !== "undefined" && (typeof jws !== "string" || !jws.trim())) {
        return json(400, { error: "invalid_transaction_payload", message: "jws must be a non-empty string" });
      }
      if (!jws && !receipt) {
        return json(400, { error: "Missing required field: jws (ios)" });
      }
    } else if (platform === "android") {
      if (!purchaseToken) {
        return json(400, { error: "Missing required field: purchaseToken (android)" });
      }
    } else {
      return json(400, { error: "Invalid platform" });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
      return json(500, { error: "Server configuration error" });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Resolve the caller FROM THE TOKEN. This is the identity we unlock.
    const { data: userData, error: userError } = await supabase.auth.getUser(jwt);
    if (userError || !userData?.user?.id) {
      return json(401, { error: "unauthenticated" });
    }
    const userId: string = userData.user.id;

    // The body's userId is advisory only. If it disagrees with the token, the
    // client is confused or someone is attempting to unlock another account —
    // either way, refuse rather than pick a winner.
    if (claimedUserId && claimedUserId !== userId) {
      console.error("[validate-iap-receipt] body userId does not match JWT subject");
      return json(403, { error: "mismatched_user" });
    }

    // ---- ANDROID (future) ----
    // We accept purchaseToken now so client + API shape is future-proof,
    // but we DO NOT unlock until Google verification is implemented.
    if (platform === "android") {
      return json(501, {
        error: "Android receipt validation not implemented yet",
        message: "purchaseToken was received but Google verification is not implemented.",
      });
    }

    // ---- iOS (current) ----
    const nowMs = Date.now();
    let entitlement:
      | { productId: string; transactionId: string; originalTransactionId: string; expiresDateMs: number }
      | null = null;
    let environment: string | undefined;
    let validationPath: "jws" | "legacy_receipt";

    if (jws) {
      // ===== StoreKit 2 path (current clients) =====
      // The client is expo-iap, a StoreKit 2 client: it has no legacy receipt to
      // give us, only the Apple-signed transaction JWS. Trust comes from the
      // signature + pinned Apple root, exactly as for server notifications —
      // NOT from the fact that a signed-in user posted it.
      validationPath = "jws";

      let transaction: JWSTransactionDecodedPayload;
      try {
        transaction = await verifyAppleSignedPayload<JWSTransactionDecodedPayload>(jws);
      } catch (err) {
        console.error(
          "[validate-iap-receipt] JWS signature verification failed:",
          err instanceof Error ? err.message : String(err)
        );
        // Permanent, not a server fault: never 5xx (the client retries 5xx).
        return json(400, { error: "invalid_signature" });
      }

      const derived = deriveJwsEntitlement(
        transaction,
        nowMs,
        EXPECTED_BUNDLE_ID,
        ALLOWED_PRODUCT_IDS
      );

      if (!derived.ok) {
        console.error("[validate-iap-receipt] JWS entitlement rejected:", derived.reason);
        return json(400, {
          error: derived.reason,
          allowedProductIds: Array.from(ALLOWED_PRODUCT_IDS),
        });
      }

      entitlement = derived.entitlement;
      environment = derived.entitlement.environment;
    } else {
      // ===== Legacy /verifyReceipt path (older deployed clients) =====
      // Kept alive deliberately until the JWS path is proven on device.
      validationPath = "legacy_receipt";

      // 1) Validate receipt with Apple (production first)
      let appleResponse = await validateReceiptWithApple(receipt as string, false);

      // If sandbox receipt sent to prod, retry on sandbox (21007)
      if (appleResponse.status === 21007) {
        appleResponse = await validateReceiptWithApple(receipt as string, true);
      }

      if (appleResponse.status !== 0) {
        return json(400, {
          error: "Invalid receipt",
          status: appleResponse.status,
          message: getAppleStatusMessage(appleResponse.status),
        });
      }

      // 2) Determine ACTIVE subscription entitlement
      entitlement = extractActiveEntitlement(
        appleResponse,
        nowMs,
        ALLOWED_PRODUCT_IDS,
        transactionId
      );
      environment = appleResponse.environment;
    }

    if (!entitlement) {
      return json(400, {
        error: "No active subscription entitlement found",
        allowedProductIds: Array.from(ALLOWED_PRODUCT_IDS),
      });
    }

    // 3) Update pro status via SECURITY DEFINER RPC
    // Defined in supabase/migrations/20260721_iap_subscription_lifecycle.sql.
    // We persist the EXPIRY and the original_transaction_id, not just a boolean:
    //  - pro_expires_at is what makes entitlement lapse by itself (livra_is_pro),
    //    so a missed webhook can never leave a lapsed user permanently Pro.
    //  - pro_original_transaction_id is what App Store Server Notifications use
    //    to find this user again on refund/expiry, and it is UNIQUE, so one Apple
    //    subscription cannot unlock a second account.
    const { error: updateError } = await supabase.rpc("update_pro_status", {
      p_user_id: userId,
      p_pro_unlocked: true,
      p_original_transaction_id: entitlement.originalTransactionId || null,
      p_product_id: entitlement.productId,
      p_expires_at: new Date(entitlement.expiresDateMs).toISOString(),
      p_status: "active",
    });

    if (updateError) {
      console.error("Error updating pro status:", updateError);

      // The RPC raises 23505 when this Apple subscription is already bound to a
      // DIFFERENT Livra account. That is a permanent, client-visible condition,
      // not a server fault — and it must NOT come back as a 500, because
      // lib/iap/iap.ts maps 500 to `transient` and would retry forever.
      if (updateError.code === "23505") {
        return json(409, {
          error: "subscription_already_linked",
          message:
            "This subscription is already active on another Livra account. Sign in with that account, or contact support.",
        });
      }

      return json(500, { error: "Failed to update premium status", details: updateError.message });
    }

    return json(200, {
      success: true,
      message: "Premium status activated",
      platform: "ios",
      transactionId: entitlement.transactionId,
      originalTransactionId: entitlement.originalTransactionId,
      productId: entitlement.productId,
      expiresDateMs: entitlement.expiresDateMs,
      environment,
      validationPath,
    });
  } catch (error) {
    console.error("Error validating receipt:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return json(500, { error: "Internal server error", details: errorMessage });
  }
});

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
}

function json(status: number, body: any) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(), "Content-Type": "application/json" },
  });
}

async function validateReceiptWithApple(
  receipt: string,
  useSandbox: boolean
): Promise<AppleVerifyReceiptResponse> {
  const url = useSandbox ? APPLE_SANDBOX_VERIFY_URL : APPLE_PRODUCTION_VERIFY_URL;

  const requestBody: any = {
    "receipt-data": receipt,
    "exclude-old-transactions": true,
  };

  // For subscriptions, Apple expects the shared secret ("password")
  if (APPLE_SHARED_SECRET) requestBody.password = APPLE_SHARED_SECRET;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    throw new Error(`Apple API error: ${response.status} ${response.statusText}`);
  }

  return await response.json();
}

function getAppleStatusMessage(status: number): string {
  const statusMessages: Record<number, string> = {
    21000: "The App Store could not read the JSON object you provided.",
    21002: "The data in the receipt-data property was malformed or missing.",
    21003: "The receipt could not be authenticated.",
    21004: "The shared secret you provided does not match the shared secret on file.",
    21005: "The receipt server is not currently available.",
    21006: "This receipt is valid but the subscription has expired.",
    21007: "This receipt is from the sandbox environment, but it was sent to the production service.",
    21008: "This receipt is from the production environment, but it was sent to the sandbox service.",
    21010: "This receipt could not be authorized.",
  };
  return statusMessages[status] || `Unknown error (status: ${status})`;
}