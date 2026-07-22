// Pure entitlement derivation from an ALREADY-VERIFIED StoreKit 2 transaction.
//
// Sibling of receiptEntitlement.ts (legacy /verifyReceipt path) and deliberately
// dependency-free for the same reason: no Deno globals, no imports, no clock —
// `nowMs` is passed in. That makes the one decision which unlocks a paying user
// unit-testable from plain jest. See tests/unit/iapJwsEntitlement.test.ts.
//
// SIGNATURE IS NOT THIS MODULE'S JOB. The caller MUST have run the payload
// through ../_shared/verifyAppleJws.ts first. This function assumes the fields
// are authentic and only decides whether they constitute an active entitlement
// for THIS app.

export type JWSTransactionDecodedPayload = {
  originalTransactionId?: string;
  transactionId?: string;
  webOrderLineItemId?: string;
  bundleId?: string;
  productId?: string;
  purchaseDate?: number;
  expiresDate?: number;
  revocationDate?: number;
  revocationReason?: number;
  type?: string;
  environment?: string;
};

export type JwsEntitlement = {
  productId: string;
  transactionId: string;
  originalTransactionId: string;
  expiresDateMs: number;
  environment?: string;
};

/**
 * Rejection reasons. Each string is chosen so the client's status mapping in
 * lib/iap/iap.ts (`invalidSignals`) classifies it as PERMANENTLY invalid rather
 * than transient — a retry can never change any of them.
 */
export type JwsEntitlementRejection =
  | 'invalid_bundle_id'
  | 'invalid_product_id'
  | 'revoked_transaction'
  | 'invalid_transaction_payload'
  | 'expired_subscription';

export type JwsEntitlementResult =
  | { ok: true; entitlement: JwsEntitlement }
  | { ok: false; reason: JwsEntitlementRejection };

function str(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
}

function num(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim() !== '') return Number(value);
  return NaN;
}

/**
 * Decide whether a verified StoreKit 2 transaction grants Pro right now.
 *
 * Checks run in this fixed order, and each one is a hard stop:
 *   1. bundleId matches this app          (a validly-signed transaction for a
 *                                          DIFFERENT Apple app is still forged
 *                                          input as far as we are concerned)
 *   2. productId is one of our subscriptions
 *   3. not revoked (refund / family-sharing revoke stamps revocationDate)
 *   4. expiresDate parses and is still in the future
 */
export function deriveJwsEntitlement(
  transaction: JWSTransactionDecodedPayload | null | undefined,
  nowMs: number,
  expectedBundleId: string,
  allowedProductIds: ReadonlySet<string>
): JwsEntitlementResult {
  const bundleId = str(transaction?.bundleId);
  if (!bundleId || bundleId !== expectedBundleId) {
    return { ok: false, reason: 'invalid_bundle_id' };
  }

  const productId = str(transaction?.productId);
  if (!productId || !allowedProductIds.has(productId)) {
    return { ok: false, reason: 'invalid_product_id' };
  }

  const revocationDate = num(transaction?.revocationDate);
  if (Number.isFinite(revocationDate) && revocationDate > 0) {
    return { ok: false, reason: 'revoked_transaction' };
  }

  const transactionId = str(transaction?.transactionId);
  const originalTransactionId = str(transaction?.originalTransactionId);
  if (!transactionId || !originalTransactionId) {
    // Without the original transaction id we cannot bind the subscription to
    // exactly one account, which is what the UNIQUE column + replay guard rely
    // on. Refuse rather than unlock something we cannot revoke later.
    return { ok: false, reason: 'invalid_transaction_payload' };
  }

  const expiresDateMs = num(transaction?.expiresDate);
  if (!Number.isFinite(expiresDateMs)) {
    // A subscription with no expiry is not a subscription we sell.
    return { ok: false, reason: 'invalid_transaction_payload' };
  }

  if (expiresDateMs <= nowMs) {
    return { ok: false, reason: 'expired_subscription' };
  }

  return {
    ok: true,
    entitlement: {
      productId,
      transactionId,
      originalTransactionId,
      expiresDateMs,
      environment: str(transaction?.environment) || undefined,
    },
  };
}
