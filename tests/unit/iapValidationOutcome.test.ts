// tests/unit/iapValidationOutcome.test.ts
//
// The contract these tests protect: a permanent server rejection must read as
// `invalid` so the client stops retrying and finishes the transaction, and a
// recoverable one must read as `transient`. Getting this wrong is not cosmetic —
// a permanent condition classified as transient spins the purchase UI forever
// after Apple has already taken payment.
import { classifyValidationFailure } from '../../lib/iap/validationOutcome';

describe('classifyValidationFailure — HTTP status', () => {
  it('treats 409 (subscription already linked to another account) as permanent', () => {
    expect(
      classifyValidationFailure({ httpStatus: 409, serverReason: 'subscription_already_linked' })
    ).toEqual({ status: 'invalid', reason: 'subscription_already_linked' });
  });

  it('treats 403 (JWT subject does not match claimed user) as permanent', () => {
    expect(classifyValidationFailure({ httpStatus: 403, serverReason: 'mismatched_user' }).status).toBe(
      'invalid'
    );
  });

  it('treats 401 as transient — a stale access token is refreshable', () => {
    expect(classifyValidationFailure({ httpStatus: 401, serverReason: 'unauthenticated' }).status).toBe(
      'transient'
    );
  });

  it('keeps 429 and 408 retryable even when the body reads permanent-ish', () => {
    expect(classifyValidationFailure({ httpStatus: 429, serverReason: 'invalid' }).status).toBe(
      'transient'
    );
    expect(classifyValidationFailure({ httpStatus: 408, serverReason: 'expired' }).status).toBe(
      'transient'
    );
  });

  it('treats 5xx as transient', () => {
    expect(
      classifyValidationFailure({ httpStatus: 500, serverReason: 'Failed to update premium status' })
        .status
    ).toBe('transient');
  });
});

describe('classifyValidationFailure — server reason', () => {
  it.each([
    'Invalid receipt',
    'invalid_signature',
    'invalid_bundle_id',
    'invalid_product_id',
    'invalid_transaction_payload',
    'revoked_transaction',
    'expired_subscription',
    'not_purchased',
    'subscription_already_linked',
  ])('classifies %s as permanent', (reason) => {
    expect(classifyValidationFailure({ httpStatus: 400, serverReason: reason }).status).toBe('invalid');
  });

  it('classifies an unrecognised reason as transient rather than guessing permanent', () => {
    expect(classifyValidationFailure({ httpStatus: 400, serverReason: 'server_misconfigured' })).toEqual(
      { status: 'transient', reason: 'server_misconfigured' }
    );
  });

  it('falls back to the status when the body carried no reason', () => {
    expect(classifyValidationFailure({ httpStatus: 502, serverReason: null })).toEqual({
      status: 'transient',
      reason: 'http_502',
    });
  });

  it('falls back to non_success when there is neither a status nor a reason', () => {
    expect(classifyValidationFailure({})).toEqual({ status: 'transient', reason: 'non_success' });
  });

  it('ignores whitespace-only reasons', () => {
    expect(classifyValidationFailure({ httpStatus: 409, serverReason: '   ' }).reason).toBe('http_409');
  });
});
