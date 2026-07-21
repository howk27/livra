import {
  decideEntitlement,
  type EntitlementDecision,
} from '../../supabase/functions/apple-server-notifications/entitlementDecision';

/**
 * The full App Store Server Notifications V2 decision table.
 *
 * This is payments code: a wrong cell here is either "refunded users keep Pro
 * forever" (revenue + App Store review risk) or "a paying user gets locked out"
 * (support + refund risk). The whole table is asserted explicitly rather than
 * spot-checked.
 */

const grant = (status: 'active') => ({ proUnlocked: true, status, applyExpiry: true });
const revoke = (status: 'expired' | 'refunded' | 'revoked') => ({
  proUnlocked: false,
  status,
  applyExpiry: false,
});
const recordOnly = { proUnlocked: null, status: null, applyExpiry: false };

const shapeOf = (d: EntitlementDecision) => ({
  proUnlocked: d.proUnlocked,
  status: d.status,
  applyExpiry: d.applyExpiry,
});

describe('decideEntitlement — grants', () => {
  it('SUBSCRIBED unlocks and takes the new expiry', () => {
    expect(shapeOf(decideEntitlement('SUBSCRIBED'))).toEqual(grant('active'));
  });

  it('SUBSCRIBED with the RESUBSCRIBE subtype still unlocks', () => {
    expect(shapeOf(decideEntitlement('SUBSCRIBED', 'RESUBSCRIBE'))).toEqual(grant('active'));
  });

  it('DID_RENEW unlocks and takes the new expiry', () => {
    expect(shapeOf(decideEntitlement('DID_RENEW'))).toEqual(grant('active'));
  });

  it('DID_RENEW with BILLING_RECOVERY recovers a grace-period user to active', () => {
    const d = decideEntitlement('DID_RENEW', 'BILLING_RECOVERY');
    expect(shapeOf(d)).toEqual(grant('active'));
    expect(d.reason).toBe('did_renew:billing_recovery');
  });

  it('RENEWAL_EXTENDED and OFFER_REDEEMED both grant with a new expiry', () => {
    expect(shapeOf(decideEntitlement('RENEWAL_EXTENDED'))).toEqual(grant('active'));
    expect(shapeOf(decideEntitlement('OFFER_REDEEMED'))).toEqual(grant('active'));
  });
});

describe('decideEntitlement — revocations', () => {
  it('REFUND revokes immediately as refunded', () => {
    expect(shapeOf(decideEntitlement('REFUND'))).toEqual(revoke('refunded'));
  });

  it('REVOKE revokes immediately as revoked', () => {
    expect(shapeOf(decideEntitlement('REVOKE'))).toEqual(revoke('revoked'));
  });

  it('EXPIRED revokes as expired, whatever the subtype', () => {
    for (const sub of [
      undefined,
      'VOLUNTARY',
      'BILLING_RETRY',
      'PRICE_INCREASE',
      'PRODUCT_NOT_FOR_SALE',
    ]) {
      expect(shapeOf(decideEntitlement('EXPIRED', sub))).toEqual(revoke('expired'));
    }
  });

  it('GRACE_PERIOD_EXPIRED revokes as expired', () => {
    expect(shapeOf(decideEntitlement('GRACE_PERIOD_EXPIRED'))).toEqual(revoke('expired'));
  });

  it('a revocation never writes an expiry — pro_unlocked=false is the gate', () => {
    for (const type of ['REFUND', 'REVOKE', 'EXPIRED', 'GRACE_PERIOD_EXPIRED']) {
      expect(decideEntitlement(type).applyExpiry).toBe(false);
    }
  });
});

describe('decideEntitlement — grace period', () => {
  it('DID_FAIL_TO_RENEW + GRACE_PERIOD keeps access and does NOT move the expiry', () => {
    const d = decideEntitlement('DID_FAIL_TO_RENEW', 'GRACE_PERIOD');
    expect(d.proUnlocked).toBe(true);
    expect(d.status).toBe('grace');
    // The critical assertion: applyExpiry false means update_pro_status receives
    // a NULL expiry, which it reads as "keep the stored one". If this ever became
    // true with no expiry to write, the user would be granted permanent Pro.
    expect(d.applyExpiry).toBe(false);
  });

  it('DID_FAIL_TO_RENEW without a grace subtype touches nothing (expiry handles the lapse)', () => {
    const d = decideEntitlement('DID_FAIL_TO_RENEW');
    expect(shapeOf(d)).toEqual(recordOnly);
    expect(d.reason).toBe('did_fail_to_renew:billing_retry');
  });
});

describe('decideEntitlement — record-only events must never move entitlement', () => {
  it('DID_CHANGE_RENEWAL_STATUS does NOT revoke — access runs to the paid-through date', () => {
    // Turning auto-renew off is not a cancellation of the current period.
    // Revoking here is the classic subscription bug.
    for (const sub of [undefined, 'AUTO_RENEW_DISABLED', 'AUTO_RENEW_ENABLED']) {
      const d = decideEntitlement('DID_CHANGE_RENEWAL_STATUS', sub);
      expect(shapeOf(d)).toEqual(recordOnly);
      expect(d.proUnlocked).not.toBe(false);
    }
  });

  it('DID_CHANGE_RENEWAL_PREF, PRICE_INCREASE, CONSUMPTION_REQUEST, REFUND_DECLINED, REFUND_REVERSED, RENEWAL_EXTENSION, TEST are record-only', () => {
    for (const type of [
      'DID_CHANGE_RENEWAL_PREF',
      'PRICE_INCREASE',
      'CONSUMPTION_REQUEST',
      'REFUND_DECLINED',
      'REFUND_REVERSED',
      'RENEWAL_EXTENSION',
      'TEST',
    ]) {
      expect(shapeOf(decideEntitlement(type))).toEqual(recordOnly);
    }
  });
});

describe('decideEntitlement — unknown input fails closed (changes nothing)', () => {
  it('an unrecognised notificationType is record-only', () => {
    const d = decideEntitlement('SOME_FUTURE_APPLE_EVENT');
    expect(shapeOf(d)).toEqual(recordOnly);
    expect(d.reason).toBe('unhandled:some_future_apple_event');
  });

  it('empty / null-ish input is record-only, not a revoke and not a grant', () => {
    expect(shapeOf(decideEntitlement(''))).toEqual(recordOnly);
    expect(shapeOf(decideEntitlement(undefined as unknown as string))).toEqual(recordOnly);
    expect(shapeOf(decideEntitlement(null as unknown as string, null))).toEqual(recordOnly);
  });

  it('matching is case-insensitive on both type and subtype', () => {
    expect(shapeOf(decideEntitlement('refund'))).toEqual(revoke('refunded'));
    expect(decideEntitlement('did_fail_to_renew', 'grace_period').status).toBe('grace');
  });
});

describe('decideEntitlement — invariants across the whole table', () => {
  const ALL_TYPES = [
    'SUBSCRIBED',
    'DID_RENEW',
    'RENEWAL_EXTENDED',
    'OFFER_REDEEMED',
    'REFUND',
    'REVOKE',
    'EXPIRED',
    'GRACE_PERIOD_EXPIRED',
    'DID_FAIL_TO_RENEW',
    'DID_CHANGE_RENEWAL_STATUS',
    'DID_CHANGE_RENEWAL_PREF',
    'PRICE_INCREASE',
    'CONSUMPTION_REQUEST',
    'REFUND_DECLINED',
    'REFUND_REVERSED',
    'RENEWAL_EXTENSION',
    'TEST',
    'UNKNOWN_TYPE',
  ];

  it('every decision carries a non-empty reason for the audit log', () => {
    for (const type of ALL_TYPES) {
      expect(decideEntitlement(type).reason.length).toBeGreaterThan(0);
    }
  });

  it('applyExpiry is only ever true when we are granting', () => {
    for (const type of ALL_TYPES) {
      const d = decideEntitlement(type);
      if (d.applyExpiry) expect(d.proUnlocked).toBe(true);
    }
  });

  it('status is always one of the five values the DB CHECK constraint allows', () => {
    const allowed = [null, 'active', 'grace', 'expired', 'refunded', 'revoked'];
    for (const type of ALL_TYPES) {
      expect(allowed).toContain(decideEntitlement(type).status);
    }
  });
});
