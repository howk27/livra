// Pure notificationType -> entitlement decision table for App Store Server
// Notifications V2.
//
// Deliberately dependency-free (no imports, no Deno globals, no clock, no DB):
// this is the single place that decides whether an Apple event REVOKES a paying
// user's access, and getting it wrong is either "refunded users keep Pro forever"
// or "paying users get locked out". It is therefore split out so the whole table
// can be unit-tested from plain jest — see tests/unit/appleNotificationDecision.test.ts.
//
// Reference: App Store Server Notifications V2 notificationType + subtype.

export type ProStatus = 'active' | 'grace' | 'expired' | 'refunded' | 'revoked';

export type EntitlementDecision = {
  /**
   * true  -> grant / keep entitlement
   * false -> revoke now
   * null  -> DO NOT TOUCH entitlement (record-only event)
   */
  proUnlocked: boolean | null;
  /** New lifecycle status, or null to leave the stored status alone. */
  status: ProStatus | null;
  /**
   * true  -> write the transaction's expiresDate to pro_expires_at
   * false -> leave pro_expires_at as it is (the user keeps access until the date
   *          they already paid through)
   */
  applyExpiry: boolean;
  /** Short machine-readable explanation, logged and returned to Apple. */
  reason: string;
};

const RECORD_ONLY = (reason: string): EntitlementDecision => ({
  proUnlocked: null,
  status: null,
  applyExpiry: false,
  reason,
});

/**
 * Map an Apple notification to an entitlement change.
 *
 * `applyExpiry: false` combined with `proUnlocked: true` is the grace-period
 * shape: still entitled, expiry date unchanged. update_pro_status treats a NULL
 * expiry as "keep the stored one" precisely so this shape is expressible.
 */
export function decideEntitlement(
  notificationType: string,
  subtype?: string | null
): EntitlementDecision {
  const type = String(notificationType ?? '').toUpperCase();
  const sub = String(subtype ?? '').toUpperCase();

  switch (type) {
    // ── Grants ───────────────────────────────────────────────────────────────
    // First purchase, resubscribe after a lapse, and every successful renewal.
    // The signed transaction carries the new expiresDate, so we take it.
    case 'SUBSCRIBED':
      return {
        proUnlocked: true,
        status: 'active',
        applyExpiry: true,
        reason: `subscribed${sub ? `:${sub.toLowerCase()}` : ''}`,
      };

    case 'DID_RENEW':
      // DID_RENEW also arrives with subtype BILLING_RECOVERY when a failed
      // renewal finally goes through — that is a recovery back to active, which
      // is exactly what this branch already does.
      return {
        proUnlocked: true,
        status: 'active',
        applyExpiry: true,
        reason: `did_renew${sub ? `:${sub.toLowerCase()}` : ''}`,
      };

    // The developer extended the renewal date, or the user redeemed an offer /
    // upgraded. Both carry a new, later expiresDate that we must honour.
    case 'RENEWAL_EXTENDED':
      return {
        proUnlocked: true,
        status: 'active',
        applyExpiry: true,
        reason: 'renewal_extended',
      };

    case 'OFFER_REDEEMED':
      return {
        proUnlocked: true,
        status: 'active',
        applyExpiry: true,
        reason: `offer_redeemed${sub ? `:${sub.toLowerCase()}` : ''}`,
      };

    // ── Revocations ──────────────────────────────────────────────────────────
    // A refund is money returned: access ends immediately, not at period end.
    case 'REFUND':
      return {
        proUnlocked: false,
        status: 'refunded',
        applyExpiry: false,
        reason: 'refund',
      };

    // Family Sharing access withdrawn, or Apple revoked the purchase.
    case 'REVOKE':
      return {
        proUnlocked: false,
        status: 'revoked',
        applyExpiry: false,
        reason: 'revoke',
      };

    // The subscription actually ended (voluntary, billing retry exhausted, or
    // the product was pulled). Subtypes: VOLUNTARY, BILLING_RETRY,
    // PRICE_INCREASE, PRODUCT_NOT_FOR_SALE — every one of them means "over".
    case 'EXPIRED':
      return {
        proUnlocked: false,
        status: 'expired',
        applyExpiry: false,
        reason: `expired${sub ? `:${sub.toLowerCase()}` : ''}`,
      };

    // The billing grace period ran out without a successful charge.
    case 'GRACE_PERIOD_EXPIRED':
      return {
        proUnlocked: false,
        status: 'expired',
        applyExpiry: false,
        reason: 'grace_period_expired',
      };

    // ── Grace ────────────────────────────────────────────────────────────────
    // Renewal charge failed. With the GRACE_PERIOD subtype Apple is still
    // retrying AND the user is meant to keep access for the grace window, so we
    // hold entitlement and do NOT move the expiry — GRACE_PERIOD_EXPIRED (or
    // DID_RENEW on recovery) is what resolves it.
    case 'DID_FAIL_TO_RENEW':
      if (sub === 'GRACE_PERIOD') {
        return {
          proUnlocked: true,
          status: 'grace',
          applyExpiry: false,
          reason: 'did_fail_to_renew:grace_period',
        };
      }
      // No grace period configured: the subscription is in billing retry and
      // simply lapses at its existing expiry. Nothing to change — livra_is_pro's
      // expiry check handles the lapse on its own. Revoking here would cut off a
      // user who has already paid through the end of the period.
      return RECORD_ONLY('did_fail_to_renew:billing_retry');

    // ── Record-only ──────────────────────────────────────────────────────────
    // The user turned auto-renew off (or back on). They keep everything they
    // paid for until the current period ends. Revoking here is the single most
    // common paid-subscription bug; do not.
    case 'DID_CHANGE_RENEWAL_STATUS':
      return RECORD_ONLY(
        `did_change_renewal_status${sub ? `:${sub.toLowerCase()}` : ''}`
      );

    // Plan switch scheduled for the next period — current entitlement unaffected.
    case 'DID_CHANGE_RENEWAL_PREF':
      return RECORD_ONLY(
        `did_change_renewal_pref${sub ? `:${sub.toLowerCase()}` : ''}`
      );

    case 'PRICE_INCREASE':
      return RECORD_ONLY(`price_increase${sub ? `:${sub.toLowerCase()}` : ''}`);

    case 'CONSUMPTION_REQUEST':
      return RECORD_ONLY('consumption_request');

    case 'REFUND_DECLINED':
      return RECORD_ONLY('refund_declined');

    case 'REFUND_REVERSED':
      // Apple reversed a refund. Reinstating entitlement needs the real expiry
      // from a fresh receipt check, which this endpoint does not do, so record
      // only and leave it to the next client-side validate-iap-receipt call.
      return RECORD_ONLY('refund_reversed');

    case 'RENEWAL_EXTENSION':
      // Status of a bulk extension request — not an entitlement change.
      return RECORD_ONLY(`renewal_extension${sub ? `:${sub.toLowerCase()}` : ''}`);

    case 'TEST':
      return RECORD_ONLY('test');

    // Unknown / future notification types must never move entitlement.
    default:
      return RECORD_ONLY(`unhandled:${type.toLowerCase() || 'empty'}`);
  }
}
