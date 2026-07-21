import {
  extractActiveEntitlement,
  type AppleReceiptInfo,
  type AppleVerifyReceiptResponse,
} from '../../supabase/functions/validate-iap-receipt/receiptEntitlement';

/**
 * Entitlement extraction from an Apple /verifyReceipt response.
 *
 * This decides whether a purchase unlocks Pro. Every branch is exercised against
 * a fixed clock: active, expired, cancelled (refunded), and trial.
 */

const ALLOWED = new Set(['livra_plus_monthly', 'livra_plus_yearly']);
const NOW = Date.parse('2026-07-21T12:00:00.000Z');
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const info = (over: Partial<AppleReceiptInfo> = {}): AppleReceiptInfo => ({
  product_id: 'livra_plus_monthly',
  transaction_id: '1000000000000001',
  original_transaction_id: '1000000000000001',
  purchase_date_ms: String(NOW - DAY),
  expires_date_ms: String(NOW + 29 * DAY),
  ...over,
});

const receipt = (items: AppleReceiptInfo[]): AppleVerifyReceiptResponse => ({
  status: 0,
  environment: 'Sandbox',
  latest_receipt_info: items,
});

const extract = (r: AppleVerifyReceiptResponse, transactionId?: string) =>
  extractActiveEntitlement(r, NOW, ALLOWED, transactionId);

describe('extractActiveEntitlement — active subscription', () => {
  it('returns the entitlement with the fields the DB needs', () => {
    const result = extract(receipt([info()]));
    expect(result).toEqual({
      productId: 'livra_plus_monthly',
      transactionId: '1000000000000001',
      originalTransactionId: '1000000000000001',
      expiresDateMs: NOW + 29 * DAY,
    });
  });

  it('carries original_transaction_id through — it is the webhook correlation key', () => {
    const result = extract(
      receipt([info({ transaction_id: '2000', original_transaction_id: '1000' })])
    );
    expect(result?.originalTransactionId).toBe('1000');
    expect(result?.transactionId).toBe('2000');
  });

  it('accepts the yearly product too', () => {
    const result = extract(receipt([info({ product_id: 'livra_plus_yearly' })]));
    expect(result?.productId).toBe('livra_plus_yearly');
  });

  it('picks the furthest-future expiry when a receipt holds several renewals', () => {
    const result = extract(
      receipt([
        info({ transaction_id: 'old', expires_date_ms: String(NOW + DAY) }),
        info({ transaction_id: 'new', expires_date_ms: String(NOW + 30 * DAY) }),
      ])
    );
    expect(result?.transactionId).toBe('new');
    expect(result?.expiresDateMs).toBe(NOW + 30 * DAY);
  });
});

describe('extractActiveEntitlement — trial', () => {
  it('an introductory/free-trial period is a normal active entitlement', () => {
    // Apple reports trials as ordinary rows with a short expires_date_ms; there
    // is nothing extra to honour — a trial user is entitled until it ends.
    const result = extract(
      receipt([info({ expires_date_ms: String(NOW + 3 * DAY) })])
    );
    expect(result?.expiresDateMs).toBe(NOW + 3 * DAY);
  });

  it('an ENDED trial does not unlock', () => {
    expect(extract(receipt([info({ expires_date_ms: String(NOW - HOUR) })]))).toBeNull();
  });
});

describe('extractActiveEntitlement — expired', () => {
  it('returns null when the only entitlement has lapsed', () => {
    expect(extract(receipt([info({ expires_date_ms: String(NOW - DAY) })]))).toBeNull();
  });

  it('an expiry exactly at now is treated as expired (strictly-future required)', () => {
    expect(extract(receipt([info({ expires_date_ms: String(NOW) })]))).toBeNull();
  });

  it('an expired row does not shadow a still-active one', () => {
    const result = extract(
      receipt([
        info({ transaction_id: 'gone', expires_date_ms: String(NOW - DAY) }),
        info({ transaction_id: 'live', expires_date_ms: String(NOW + DAY) }),
      ])
    );
    expect(result?.transactionId).toBe('live');
  });
});

describe('extractActiveEntitlement — cancelled / refunded', () => {
  it('a cancellation_date_ms row never unlocks, even with a future expiry', () => {
    const result = extract(
      receipt([info({ cancellation_date_ms: String(NOW - HOUR) })])
    );
    expect(result).toBeNull();
  });

  it('a refunded row is skipped in favour of a genuinely active one', () => {
    const result = extract(
      receipt([
        info({ transaction_id: 'refunded', cancellation_date_ms: String(NOW - HOUR) }),
        info({ transaction_id: 'good' }),
      ])
    );
    expect(result?.transactionId).toBe('good');
  });
});

describe('extractActiveEntitlement — product allowlist', () => {
  it('ignores a product id that is not ours', () => {
    expect(extract(receipt([info({ product_id: 'some_other_app_sub' })]))).toBeNull();
  });

  it('ignores a row with no product id at all', () => {
    expect(extract(receipt([info({ product_id: undefined })]))).toBeNull();
  });
});

describe('extractActiveEntitlement — client-reported transactionId is authoritative', () => {
  it('returns that exact transaction when it is active', () => {
    const result = extract(
      receipt([info({ transaction_id: 'A' }), info({ transaction_id: 'B' })]),
      'A'
    );
    expect(result?.transactionId).toBe('A');
  });

  it('returns null when the named transaction is expired, instead of unlocking off another row', () => {
    const result = extract(
      receipt([
        info({ transaction_id: 'A', expires_date_ms: String(NOW - DAY) }),
        info({ transaction_id: 'B', expires_date_ms: String(NOW + DAY) }),
      ]),
      'A'
    );
    expect(result).toBeNull();
  });

  it('falls back to the best active row when the named transaction is absent', () => {
    const result = extract(receipt([info({ transaction_id: 'B' })]), 'NOT_PRESENT');
    expect(result?.transactionId).toBe('B');
  });
});

describe('extractActiveEntitlement — malformed input fails closed', () => {
  it('returns null for an empty or missing latest_receipt_info', () => {
    expect(extract(receipt([]))).toBeNull();
    expect(extract({ status: 0 })).toBeNull();
    expect(
      extract({ status: 0, latest_receipt_info: undefined as unknown as AppleReceiptInfo[] })
    ).toBeNull();
  });

  it('returns null when expires_date_ms is missing or unparseable', () => {
    expect(extract(receipt([info({ expires_date_ms: undefined })]))).toBeNull();
    expect(extract(receipt([info({ expires_date_ms: 'not-a-number' })]))).toBeNull();
  });

  it('does not mutate the caller’s response object while sorting', () => {
    const items = [
      info({ transaction_id: 'first', expires_date_ms: String(NOW + DAY) }),
      info({ transaction_id: 'second', expires_date_ms: String(NOW + 2 * DAY) }),
    ];
    const r = receipt(items);
    extract(r);
    expect(r.latest_receipt_info?.[0].transaction_id).toBe('first');
  });
});
