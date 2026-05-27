// tests/unit/iapReVerify.test.ts
import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('../../lib/iap/iap', () => ({
  validateReceiptWithServer: jest.fn(),
  checkProStatus: jest.fn(),
}));

import {
  getStoredReceipt,
  storeReceipt,
  shouldReVerify,
  markVerified,
  IAP_RECEIPT_KEY,
  IAP_LAST_VERIFY_KEY,
} from '../../lib/iap/iapReVerify';

beforeEach(() => {
  jest.clearAllMocks();
  (AsyncStorage as any).clear();
});

describe('storeReceipt / getStoredReceipt', () => {
  it('persists and retrieves the receipt string', async () => {
    await storeReceipt('receipt-abc123');
    expect(await getStoredReceipt()).toBe('receipt-abc123');
  });

  it('returns null when nothing is stored', async () => {
    expect(await getStoredReceipt()).toBeNull();
  });

  it('uses the correct AsyncStorage key', async () => {
    await storeReceipt('r');
    expect(await AsyncStorage.getItem(IAP_RECEIPT_KEY)).toBe('r');
  });
});

describe('shouldReVerify', () => {
  it('returns true when no last-verify timestamp exists', async () => {
    expect(await shouldReVerify()).toBe(true);
  });

  it('returns false when verified less than 24 hours ago', async () => {
    const recent = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(); // 1h ago
    await AsyncStorage.setItem(IAP_LAST_VERIFY_KEY, recent);
    expect(await shouldReVerify()).toBe(false);
  });

  it('returns true when verified more than 24 hours ago', async () => {
    const old = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(); // 25h ago
    await AsyncStorage.setItem(IAP_LAST_VERIFY_KEY, old);
    expect(await shouldReVerify()).toBe(true);
  });
});

describe('markVerified', () => {
  it('writes a timestamp to AsyncStorage', async () => {
    const before = Date.now();
    await markVerified();
    const stored = await AsyncStorage.getItem(IAP_LAST_VERIFY_KEY);
    expect(stored).not.toBeNull();
    const ts = new Date(stored!).getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
  });
});
