import { resolveIosTransactionJws } from '../../lib/services/iap/iosTransactionJws';

/**
 * Client-side JWS resolution for an iOS purchase.
 *
 * The regression this locks down: expo-iap (StoreKit 2) exposes no
 * `getReceiptIOS` and leaves `transactionReceipt` empty, so the old code threw
 * TRANSIENT_RECEIPT_MISSING before the edge function was ever called. The JWS
 * must come from `purchaseToken` first, `getTransactionJwsIOS` second, and the
 * transient case must be reachable ONLY when both are empty.
 */

const JWS = 'header.payload.signature';
const OTHER_JWS = 'other.payload.signature';

describe('resolveIosTransactionJws — purchaseToken is preferred', () => {
  it('uses purchase.purchaseToken and never calls the fallback getter', async () => {
    const getter = jest.fn(async () => OTHER_JWS);
    const result = await resolveIosTransactionJws(
      { purchaseToken: JWS, transactionId: '2000000000000002' },
      getter
    );

    expect(result).toEqual({ jws: JWS, source: 'purchaseToken' });
    expect(getter).not.toHaveBeenCalled();
  });

  it('trims whitespace around the token', async () => {
    const result = await resolveIosTransactionJws({ purchaseToken: `  ${JWS}  ` }, undefined);
    expect(result).toEqual({ jws: JWS, source: 'purchaseToken' });
  });

  it('works with no fallback getter available at all', async () => {
    const result = await resolveIosTransactionJws({ purchaseToken: JWS }, undefined);
    expect(result.source).toBe('purchaseToken');
  });
});

describe('resolveIosTransactionJws — getTransactionJwsIOS fallback', () => {
  it('falls back when purchaseToken is empty, passing the transaction id', async () => {
    const getter = jest.fn(async () => JWS);
    const result = await resolveIosTransactionJws(
      { purchaseToken: '', transactionId: '2000000000000002' },
      getter
    );

    expect(result).toEqual({ jws: JWS, source: 'getTransactionJwsIOS' });
    expect(getter).toHaveBeenCalledWith('2000000000000002');
  });

  it('falls back when purchaseToken is missing entirely', async () => {
    const getter = jest.fn(async () => JWS);
    const result = await resolveIosTransactionJws({ transactionId: 42 }, getter);

    expect(result.jws).toBe(JWS);
    expect(getter).toHaveBeenCalledWith('42');
  });

  it('falls back when purchaseToken is whitespace only', async () => {
    const getter = jest.fn(async () => JWS);
    const result = await resolveIosTransactionJws({ purchaseToken: '   ' }, getter);
    expect(result.source).toBe('getTransactionJwsIOS');
    expect(getter).toHaveBeenCalledWith(undefined);
  });
});

describe('resolveIosTransactionJws — both sources empty (the transient case)', () => {
  it('reports none when there is no token and no getter', async () => {
    const result = await resolveIosTransactionJws({ purchaseToken: null }, undefined);
    expect(result).toEqual({ source: 'none' });
  });

  it('reports none when the getter returns null', async () => {
    const result = await resolveIosTransactionJws({}, async () => null);
    expect(result).toEqual({ source: 'none' });
  });

  it('reports none when the getter returns an empty string', async () => {
    const result = await resolveIosTransactionJws({}, async () => '');
    expect(result).toEqual({ source: 'none' });
  });

  it('reports none (not a crash) when the getter throws, and keeps the reason', async () => {
    const result = await resolveIosTransactionJws({}, async () => {
      throw new Error('StoreKit unavailable');
    });
    expect(result.source).toBe('none');
    expect(result.jws).toBeUndefined();
    expect(result.fallbackError).toBe('StoreKit unavailable');
  });

  it('reports none for a null purchase', async () => {
    expect(await resolveIosTransactionJws(null, undefined)).toEqual({ source: 'none' });
  });

  it('ignores a non-function fallback', async () => {
    const result = await resolveIosTransactionJws({}, 'nope' as unknown as undefined);
    expect(result).toEqual({ source: 'none' });
  });
});
