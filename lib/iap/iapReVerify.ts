// lib/iap/iapReVerify.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '../utils/logger';
import { validateReceiptWithServer, checkProStatus } from './iap';

export const IAP_RECEIPT_KEY = '@livra_iap_receipt';
export const IAP_LAST_VERIFY_KEY = '@livra_iap_last_verify';

const VERIFY_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

export async function storeReceipt(receipt: string): Promise<void> {
  await AsyncStorage.setItem(IAP_RECEIPT_KEY, receipt);
}

export async function getStoredReceipt(): Promise<string | null> {
  return AsyncStorage.getItem(IAP_RECEIPT_KEY);
}

export async function shouldReVerify(): Promise<boolean> {
  const lastVerify = await AsyncStorage.getItem(IAP_LAST_VERIFY_KEY);
  if (!lastVerify) return true;
  const age = Date.now() - new Date(lastVerify).getTime();
  return age >= VERIFY_INTERVAL_MS;
}

export async function markVerified(): Promise<void> {
  await AsyncStorage.setItem(IAP_LAST_VERIFY_KEY, new Date().toISOString());
}

/**
 * Silently re-verifies the stored receipt with the edge function.
 * If the server reports the subscription is no longer active, clears the local
 * pro cache (forces a DB re-read on the next checkProStatus call).
 *
 * Fails open: any network or server error leaves pro status unchanged.
 * Only call this when the user is known to be pro (checkProStatus returned effectiveUnlocked=true).
 */
export async function reVerifyProOnLaunch(): Promise<void> {
  try {
    const needsVerify = await shouldReVerify();
    if (!needsVerify) {
      logger.log('[IAP] Re-verify skipped — checked within last 24h');
      return;
    }

    const receipt = await getStoredReceipt();
    if (!receipt) {
      logger.log('[IAP] Re-verify skipped — no stored receipt');
      return;
    }

    logger.log('[IAP] Silently re-verifying subscription receipt');
    const result = await validateReceiptWithServer({ platform: 'ios', receipt });

    if (result.status === 'invalid') {
      logger.log('[IAP] Re-verify: subscription lapsed — clearing local pro cache');
      await AsyncStorage.removeItem('pro_unlocked');
      // checkProStatus will re-read from DB on next call; DB was already updated by the edge function.
    } else if (result.status === 'valid') {
      logger.log('[IAP] Re-verify: subscription still active');
    } else {
      // transient — fail open, do not revoke
      logger.log('[IAP] Re-verify: transient error — leaving pro status unchanged', result.reason);
    }

    await markVerified();
  } catch (err) {
    logger.error('[IAP] Re-verify unexpected error — failing open', err);
  }
}
