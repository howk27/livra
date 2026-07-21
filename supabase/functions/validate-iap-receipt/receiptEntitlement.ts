// Pure entitlement extraction from an Apple /verifyReceipt response.
//
// Deliberately dependency-free (no Deno globals, no imports, no clock): the
// caller passes `nowMs` in. That is the whole reason this lives outside
// index.ts — it makes the one piece of logic that decides whether a paying user
// gets unlocked unit-testable from plain jest, without a Deno runtime, a network,
// or an Apple sandbox account. See tests/unit/iapReceiptEntitlement.test.ts.

export type AppleReceiptInfo = {
  product_id?: string;
  transaction_id?: string;
  original_transaction_id?: string;
  purchase_date_ms?: string;
  expires_date_ms?: string;
  cancellation_date_ms?: string;
};

export type AppleVerifyReceiptResponse = {
  status: number;
  environment?: 'Production' | 'Sandbox';
  receipt?: unknown;
  latest_receipt_info?: AppleReceiptInfo[];
  pending_renewal_info?: Array<{
    product_id?: string;
    original_transaction_id?: string;
    auto_renew_status?: string;
    expiration_intent?: string;
  }>;
};

export type ActiveEntitlement = {
  productId: string;
  transactionId: string;
  originalTransactionId: string;
  expiresDateMs: number;
};

/**
 * Returns the ACTIVE subscription entitlement in a verifyReceipt response, or
 * null when there is none.
 *
 * "Active" means all of:
 *   - product_id is one of ours (`allowedProductIds`)
 *   - not cancelled (a refund stamps cancellation_date_ms)
 *   - expires_date_ms parses to a finite number
 *   - expires_date_ms is still in the future relative to `nowMs`
 *
 * When `transactionId` is supplied (the client tells us which purchase it just
 * made) that exact transaction is authoritative: if it is present but expired we
 * return null rather than silently unlocking off some other row in the receipt.
 */
export function extractActiveEntitlement(
  appleResponse: AppleVerifyReceiptResponse,
  nowMs: number,
  allowedProductIds: ReadonlySet<string>,
  transactionId?: string
): ActiveEntitlement | null {
  const list = Array.isArray(appleResponse?.latest_receipt_info)
    ? appleResponse.latest_receipt_info
    : [];

  if (list.length === 0) return null;

  const candidates = list
    .map((x) => ({
      productId: x?.product_id ? String(x.product_id) : '',
      transactionId: x?.transaction_id ? String(x.transaction_id) : '',
      originalTransactionId: x?.original_transaction_id
        ? String(x.original_transaction_id)
        : '',
      expiresDateMs: x?.expires_date_ms ? Number(String(x.expires_date_ms)) : NaN,
      cancelled: x?.cancellation_date_ms ? String(x.cancellation_date_ms) : '',
    }))
    .filter((x) => allowedProductIds.has(x.productId))
    .filter((x) => !x.cancelled)
    .filter((x) => Number.isFinite(x.expiresDateMs));

  if (candidates.length === 0) return null;

  const strip = (c: (typeof candidates)[number]): ActiveEntitlement => ({
    productId: c.productId,
    transactionId: c.transactionId,
    originalTransactionId: c.originalTransactionId,
    expiresDateMs: c.expiresDateMs,
  });

  if (transactionId) {
    const exact = candidates.find((c) => c.transactionId === transactionId);
    if (exact) return exact.expiresDateMs > nowMs ? strip(exact) : null;
  }

  const best = [...candidates].sort((a, b) => b.expiresDateMs - a.expiresDateMs)[0];
  if (!best) return null;

  return best.expiresDateMs > nowMs ? strip(best) : null;
}
