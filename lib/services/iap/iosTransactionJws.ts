// Pure resolution of the StoreKit 2 transaction JWS for an iOS purchase.
//
// WHY THIS EXISTS
// expo-iap (>= 4.x) is a StoreKit 2 client. StoreKit 2 does NOT hand out the
// legacy base64 app receipt on a purchase: `purchase.transactionReceipt` is
// empty and `getReceiptIOS` is not even exported by the module. The previous
// code tested `typeof functions.getReceiptIOS === 'function'`, fell through to
// the empty `transactionReceipt`, and threw TRANSIENT_RECEIPT_MISSING *before*
// ever calling the edge function — which is why a failed purchase produced zero
// server logs and a 90s spinner.
//
// The signed JWS is available in two places, in this order of preference:
//   1. `purchase.purchaseToken` — expo-iap's unified token field; on iOS this IS
//      the transaction JWS (types.d.ts: "Unified purchase token (iOS JWS,
//      Android purchaseToken)").
//   2. `getTransactionJwsIOS(transactionId)` — explicit per-transaction getter.
//
// Kept dependency-free (no react-native, no expo-iap import, no clock) so the
// decision that gates every paying iOS user is unit-testable from plain jest.

export type IosJwsSource = 'purchaseToken' | 'getTransactionJwsIOS' | 'none';

export type IosJwsResolution = {
  /** The signed JWS, or undefined when neither source produced one. */
  jws?: string;
  /** Where it came from — diagnostics only, safe to log (never log `jws`). */
  source: IosJwsSource;
  /** Set when the fallback getter threw; diagnostics only. */
  fallbackError?: string;
};

export type IosJwsPurchaseLike = {
  purchaseToken?: string | null;
  transactionId?: string | number | null;
} | null | undefined;

export type GetTransactionJwsIOS = (transactionId?: string) => Promise<string | null | undefined>;

function clean(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Resolve the JWS to send to the server for an iOS purchase.
 *
 * Returns `{ source: 'none' }` when BOTH sources are empty — only then may the
 * caller raise the transient "receipt is being retrieved" error. A thrown
 * fallback is treated as an empty fallback, not as a hard failure.
 */
export async function resolveIosTransactionJws(
  purchase: IosJwsPurchaseLike,
  getTransactionJwsIOS?: GetTransactionJwsIOS | null
): Promise<IosJwsResolution> {
  const fromPurchase = clean(purchase?.purchaseToken);
  if (fromPurchase) {
    return { jws: fromPurchase, source: 'purchaseToken' };
  }

  if (typeof getTransactionJwsIOS !== 'function') {
    return { source: 'none' };
  }

  const rawTransactionId = purchase?.transactionId;
  const transactionId =
    rawTransactionId === null || rawTransactionId === undefined
      ? undefined
      : String(rawTransactionId);

  try {
    const fromGetter = clean(await getTransactionJwsIOS(transactionId));
    if (fromGetter) {
      return { jws: fromGetter, source: 'getTransactionJwsIOS' };
    }
    return { source: 'none' };
  } catch (error) {
    return {
      source: 'none',
      fallbackError: error instanceof Error ? error.message : String(error),
    };
  }
}
