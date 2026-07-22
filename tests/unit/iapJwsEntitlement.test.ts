import {
  deriveJwsEntitlement,
  type JWSTransactionDecodedPayload,
} from '../../supabase/functions/validate-iap-receipt/jwsEntitlement';

/**
 * Entitlement derivation from a VERIFIED StoreKit 2 transaction.
 *
 * This is the decision that unlocks a paying user on the JWS path. Every gate is
 * exercised against a fixed clock: valid, expired, revoked, wrong bundle,
 * disallowed product, and malformed payloads.
 */

const ALLOWED = new Set(['livra_plus_monthly', 'livra_plus_yearly']);
const BUNDLE = 'com.livra.app';
const NOW = Date.parse('2026-07-22T12:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

const tx = (over: Partial<JWSTransactionDecodedPayload> = {}): JWSTransactionDecodedPayload => ({
  bundleId: BUNDLE,
  productId: 'livra_plus_monthly',
  transactionId: '2000000000000002',
  originalTransactionId: '2000000000000001',
  purchaseDate: NOW - DAY,
  expiresDate: NOW + 29 * DAY,
  environment: 'Sandbox',
  ...over,
});

const derive = (t: JWSTransactionDecodedPayload | null | undefined) =>
  deriveJwsEntitlement(t, NOW, BUNDLE, ALLOWED);

describe('deriveJwsEntitlement — active subscription', () => {
  it('returns the fields update_pro_status needs', () => {
    const result = derive(tx());
    expect(result).toEqual({
      ok: true,
      entitlement: {
        productId: 'livra_plus_monthly',
        transactionId: '2000000000000002',
        originalTransactionId: '2000000000000001',
        expiresDateMs: NOW + 29 * DAY,
        environment: 'Sandbox',
      },
    });
  });

  it('accepts the yearly product too', () => {
    const result = derive(tx({ productId: 'livra_plus_yearly' }));
    expect(result.ok).toBe(true);
  });

  it('accepts numeric-string dates and ids (Apple has shipped both shapes)', () => {
    const result = deriveJwsEntitlement(
      tx({ expiresDate: String(NOW + DAY) as unknown as number }),
      NOW,
      BUNDLE,
      ALLOWED
    );
    expect(result).toMatchObject({ ok: true, entitlement: { expiresDateMs: NOW + DAY } });
  });
});

describe('deriveJwsEntitlement — expiry', () => {
  it('rejects a transaction that expired one hour ago', () => {
    const result = derive(tx({ expiresDate: NOW - 60 * 60 * 1000 }));
    expect(result).toEqual({ ok: false, reason: 'expired_subscription' });
  });

  it('rejects a transaction expiring exactly now (not strictly in the future)', () => {
    expect(derive(tx({ expiresDate: NOW }))).toEqual({ ok: false, reason: 'expired_subscription' });
  });

  it('rejects a transaction with no expiry at all', () => {
    const { expiresDate: _drop, ...rest } = tx();
    expect(derive(rest)).toEqual({ ok: false, reason: 'invalid_transaction_payload' });
  });
});

describe('deriveJwsEntitlement — revocation', () => {
  it('rejects a refunded/revoked transaction even while still inside its window', () => {
    const result = derive(tx({ revocationDate: NOW - DAY, revocationReason: 1 }));
    expect(result).toEqual({ ok: false, reason: 'revoked_transaction' });
  });

  it('revocation is checked before expiry so a refund never reads as merely expired', () => {
    const result = derive(tx({ revocationDate: NOW - DAY, expiresDate: NOW - DAY }));
    expect(result).toEqual({ ok: false, reason: 'revoked_transaction' });
  });

  it('treats revocationDate 0 as not revoked', () => {
    expect(derive(tx({ revocationDate: 0 })).ok).toBe(true);
  });
});

describe('deriveJwsEntitlement — app identity', () => {
  it('rejects a validly-signed transaction belonging to another app', () => {
    const result = derive(tx({ bundleId: 'com.someoneelse.app' }));
    expect(result).toEqual({ ok: false, reason: 'invalid_bundle_id' });
  });

  it('rejects a transaction with no bundleId rather than assuming ours', () => {
    const { bundleId: _drop, ...rest } = tx();
    expect(derive(rest)).toEqual({ ok: false, reason: 'invalid_bundle_id' });
  });

  it('checks the bundle before the product, so a foreign app never leaks product info', () => {
    const result = derive(tx({ bundleId: 'com.someoneelse.app', productId: 'not_ours' }));
    expect(result).toEqual({ ok: false, reason: 'invalid_bundle_id' });
  });
});

describe('deriveJwsEntitlement — product allowlist', () => {
  it('rejects a product we do not sell', () => {
    expect(derive(tx({ productId: 'livra_lifetime_hack' }))).toEqual({
      ok: false,
      reason: 'invalid_product_id',
    });
  });

  it('rejects an empty product id', () => {
    expect(derive(tx({ productId: '' }))).toEqual({ ok: false, reason: 'invalid_product_id' });
  });
});

describe('deriveJwsEntitlement — malformed payloads', () => {
  it('rejects a transaction with no originalTransactionId (cannot bind to one account)', () => {
    expect(derive(tx({ originalTransactionId: '' }))).toEqual({
      ok: false,
      reason: 'invalid_transaction_payload',
    });
  });

  it('rejects a transaction with no transactionId', () => {
    expect(derive(tx({ transactionId: '' }))).toEqual({
      ok: false,
      reason: 'invalid_transaction_payload',
    });
  });

  it('rejects null/undefined without throwing', () => {
    expect(derive(null)).toEqual({ ok: false, reason: 'invalid_bundle_id' });
    expect(derive(undefined)).toEqual({ ok: false, reason: 'invalid_bundle_id' });
  });
});
