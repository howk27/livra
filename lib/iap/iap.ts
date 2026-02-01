/**
 * Centralized In-App Purchase (IAP) Module
 * 
 * This module handles all IAP operations using react-native-iap v14.5
 * It provides a clean interface for:
 * - Initializing store connection
 * - Loading subscription products
 * - Requesting purchases
 * - Handling purchase updates
 * - Restoring purchases
 * - Managing entitlements
 */

import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { logger } from '../utils/logger';
import { MONTHLY_SKU, YEARLY_SKU, ALL_SUBS_SKUS } from './skus';

// Subscription product IDs - Imported from single source of truth (lib/iap/skus.ts)
export const MONTHLY_PRODUCT_ID = MONTHLY_SKU;
export const YEARLY_PRODUCT_ID = YEARLY_SKU;

export const SUBSCRIPTION_PRODUCT_IDS = [MONTHLY_PRODUCT_ID, YEARLY_PRODUCT_ID];
export const ALL_PRODUCT_IDS = SUBSCRIPTION_PRODUCT_IDS;

export type ReceiptValidationResult =
  | { status: 'valid' }
  | { status: 'invalid'; reason: string }
  | { status: 'transient'; reason: string };

export type ProStatusResult = {
  status: 'unlocked' | 'locked' | 'unknown';
  source: 'db' | 'cache' | 'none';
  reason?: string;
};

// Check if running in Expo Go
const isExpoGo = Constants.appOwnership === 'expo';

export interface IAPProduct {
  productId: string;
  title: string;
  description: string;
  price: string;
  localizedPrice: string;
  currency: string;
  type: 'subscription' | 'iap';
}

export interface IAPState {
  isReady: boolean;
  isLoadingProducts: boolean;
  products: IAPProduct[];
  purchaseInProgress: boolean;
  lastError: string | null;
  connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error';
}

export interface IAPError {
  code: string;
  message: string;
  userMessage: string;
}

export type NormalizedIapError = {
  kind:
    | 'cancelled'
    | 'payment_declined'
    | 'billing_unavailable'
    | 'network'
    | 'already_owned'
    | 'unknown';
  title: string;
  message: string;
  canRetry: boolean;
  showManage: boolean;
  showRestore: boolean;
};

export function normalizeIapError(error: any): NormalizedIapError {
  const rawMessage = String(error?.message || error || '');
  const message = rawMessage.toLowerCase();
  const code = String(error?.code || error?.errorCode || '').toUpperCase();

  const isCancelled =
    code === 'USER_CANCELLED' ||
    code === 'E_USER_CANCELLED' ||
    message.includes('cancel');

  if (isCancelled) {
    return {
      kind: 'cancelled',
      title: 'Purchase cancelled',
      message: 'Purchase cancelled.',
      canRetry: true,
      showManage: false,
      showRestore: false,
    };
  }

  const isAlreadyOwned =
    code === 'ALREADY_OWNED' ||
    code === 'E_ALREADY_OWNED' ||
    message.includes('already') ||
    message.includes('owned');

  if (isAlreadyOwned) {
    return {
      kind: 'already_owned',
      title: 'Already subscribed',
      message: 'You’re already subscribed.',
      canRetry: false,
      showManage: true,
      showRestore: true,
    };
  }

  const isNetwork =
    code === 'E_NETWORK_ERROR' ||
    code === 'NETWORK_ERROR' ||
    message.includes('network') ||
    message.includes('connection') ||
    message.includes('timeout');

  if (isNetwork) {
    return {
      kind: 'network',
      title: 'Connection issue',
      message: 'We couldn’t verify your purchase due to a connection issue. Please try again.',
      canRetry: true,
      showManage: false,
      showRestore: true,
    };
  }

  const isPaymentDeclined =
    code === 'E_PAYMENT_INVALID' ||
    message.includes('declined') ||
    message.includes('insufficient') ||
    message.includes('payment method') ||
    message.includes('card') ||
    message.includes('funds');

  if (isPaymentDeclined) {
    return {
      kind: 'payment_declined',
      title: 'Payment declined',
      message: 'Payment method was declined. Please check your payment method and try again.',
      canRetry: true,
      showManage: true,
      showRestore: false,
    };
  }

  const isBillingUnavailable =
    code === 'E_BILLING_UNAVAILABLE' ||
    code === 'E_PAYMENT_NOT_ALLOWED' ||
    code === 'E_SERVICE_UNAVAILABLE' ||
    code === 'E_SERVICE_ERROR' ||
    code === 'E_STORE_NOT_CONNECTED' ||
    code === 'E_ITEM_UNAVAILABLE' ||
    message.includes('not available') ||
    message.includes('not allowed') ||
    message.includes('billing') ||
    message.includes('store not connected') ||
    message.includes('capability');

  if (isBillingUnavailable) {
    return {
      kind: 'billing_unavailable',
      title: 'Purchases unavailable',
      message: 'Purchases aren’t available on this device/account right now.',
      canRetry: false,
      showManage: true,
      showRestore: false,
    };
  }

  return {
    kind: 'unknown',
    title: 'Purchase failed',
    message: 'Purchase failed. Please try again.',
    canRetry: true,
    showManage: false,
    showRestore: false,
  };
}

/**
 * Get user-friendly error message from IAP error
 */
export function getIAPErrorMessage(error: any): IAPError {
  const errorMessage = error?.message || String(error) || 'Unknown error';
  const errorCode = error?.code || error?.errorCode || 'UNKNOWN';

  // Map common error codes to user-friendly messages
  if (errorMessage.includes('cancel') || errorMessage.includes('Cancel') || errorCode === 'E_USER_CANCELLED') {
    return {
      code: 'USER_CANCELLED',
      message: errorMessage,
      userMessage: 'Purchase was cancelled.',
    };
  }

  if (errorMessage.includes('network') || errorMessage.includes('connection') || errorCode === 'E_NETWORK_ERROR') {
    return {
      code: 'NETWORK_ERROR',
      message: errorMessage,
      userMessage: 'Network error. Please check your connection and try again.',
    };
  }

  if (errorMessage.includes('already') || errorCode === 'E_ALREADY_OWNED') {
    return {
      code: 'ALREADY_OWNED',
      message: errorMessage,
      userMessage: 'You already own this product. Try restoring purchases.',
    };
  }

  if (errorMessage.includes('not available') || errorMessage.includes('not found') || errorCode === 'E_ITEM_UNAVAILABLE') {
    return {
      code: 'ITEM_UNAVAILABLE',
      message: errorMessage,
      userMessage: 'This product is not available. Please check App Store Connect configuration.',
    };
  }

  if (errorMessage.includes('Store not connected') || errorCode === 'E_STORE_NOT_CONNECTED') {
    return {
      code: 'STORE_NOT_CONNECTED',
      message: errorMessage,
      userMessage: 'Store connection is not available. Please check your internet connection.',
    };
  }

  if (errorMessage.includes('SKU') || errorMessage.includes('productId') || errorCode === 'E_SKU_NOT_FOUND') {
    return {
      code: 'SKU_MISMATCH',
      message: errorMessage,
      userMessage: 'Product ID mismatch. Please verify App Store Connect configuration matches code.',
    };
  }

  if (errorMessage.includes('capability') || errorMessage.includes('entitlement')) {
    return {
      code: 'IAP_CAPABILITY_MISSING',
      message: errorMessage,
      userMessage: 'In-App Purchase capability is not enabled. Please contact support.',
    };
  }

  if (errorMessage.includes('Missing purchase request configuration') || errorMessage.includes('missing') && errorMessage.includes('configuration')) {
    return {
      code: 'PURCHASE_CONFIG_MISSING',
      message: errorMessage,
      userMessage: 'Unable to start purchase. Please try again.',
    };
  }

  return {
    code: 'UNKNOWN',
    message: errorMessage,
    userMessage: 'Unable to start purchase. Please try again.',
  };
}

/**
 * Check if user has premium status
 * Priority: Supabase database > Local storage (with TTL)
 */
export async function checkProStatus(): Promise<ProStatusResult> {
  const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
  
  try {
    const { supabase } = await import('../supabase');
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      const { data } = await supabase
        .from('profiles')
        .select('pro_unlocked')
        .eq('id', user.id)
        .single();

      if (data?.pro_unlocked) {
        // Store with timestamp
        const cacheEntry = {
          value: true,
          checkedAt: new Date().toISOString(),
        };
        await AsyncStorage.setItem('pro_unlocked', JSON.stringify(cacheEntry));
        return { status: 'unlocked', source: 'db' };
      } else {
        // Clear stale local cache if user is not premium in database
        await AsyncStorage.removeItem('pro_unlocked');
        return { status: 'locked', source: 'db' };
      }
    }
  } catch (error) {
    logger.error('[IAP] Error checking Supabase pro status:', error);
    // Fall through to cache check with TTL
  }

  // Fallback to local storage with TTL check
  try {
    const cached = await AsyncStorage.getItem('pro_unlocked');
    if (cached) {
      try {
        const cacheEntry = JSON.parse(cached);
        if (cacheEntry.checkedAt) {
          const checkedAt = new Date(cacheEntry.checkedAt);
          const age = Date.now() - checkedAt.getTime();
          if (age < CACHE_TTL_MS && cacheEntry.value === true) {
            logger.log('[IAP] Cached pro status available (non-authoritative)', { ageHours: age / (60 * 60 * 1000) });
            return { status: 'unknown', source: 'cache', reason: 'db_unavailable' };
          } else {
            logger.log('[IAP] Cached pro status expired, requiring online verification', { ageHours: age / (60 * 60 * 1000) });
            await AsyncStorage.removeItem('pro_unlocked');
            return { status: 'unknown', source: 'none', reason: 'cache_expired' };
          }
        }
      } catch (parseError) {
        // Legacy format (just "true" string) - treat as expired
        logger.log('[IAP] Legacy cache format detected, clearing');
        await AsyncStorage.removeItem('pro_unlocked');
        return { status: 'unknown', source: 'none', reason: 'legacy_cache' };
      }
    }
  } catch (cacheError) {
    logger.error('[IAP] Error reading cache:', cacheError);
  }

  return { status: 'unknown', source: 'none', reason: 'db_unavailable' };
}

/**
 * Validate receipt with server-side Edge Function
 */
export async function validateReceiptWithServer(params: {
  platform: 'ios' | 'android';
  receipt?: string;
  purchaseToken?: string;
  transactionId?: string;
  productId?: string;
}): Promise<ReceiptValidationResult> {
  try {
    const { supabase } = await import('../supabase');
    const { logger } = await import('../utils/logger');

    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      logger.error('[IAP] Cannot validate receipt: user not logged in');
      return { status: 'transient', reason: 'user_not_logged_in' };
    }

    // Platform-specific validation: iOS requires receipt, Android requires purchaseToken
    if (params.platform === 'ios' && !params.receipt) {
      logger.error('[IAP] iOS receipt validation called without receipt');
      return { status: 'transient', reason: 'receipt_missing' };
    }

    if (params.platform === 'android' && !params.purchaseToken) {
      logger.error('[IAP] Android receipt validation called without purchaseToken');
      return { status: 'transient', reason: 'purchase_token_missing' };
    }

    // Build request body based on platform
    const requestBody: any = {
      platform: params.platform,
      userId: user.id,
      transactionId: params.transactionId,
      productId: params.productId,
    };

    if (params.platform === 'ios') {
      requestBody.receipt = params.receipt;
    } else {
      // Android
      requestBody.purchaseToken = params.purchaseToken;
    }

    // Invoke receipt validation via Supabase Edge Function.
    // IMPORTANT: Do not log receipt/token.
    const validationPromise = supabase.functions.invoke('validate-iap-receipt', {
      body: requestBody,
    });

    // Timeout promise REJECTS. We MUST catch it below and return transient.
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Receipt validation timeout')), 30000);
    });

    const result = await Promise.race([validationPromise, timeoutPromise]) as {
      data?: any;
      error?: any;
    };

    const data = result?.data;
    const error = result?.error;

    if (error) {
      // Edge function responded with an error (not a timeout)
      logger.error('[IAP] Edge Function error during receipt validation', {
        code: error?.code,
        message: error?.message ?? String(error),
        transactionId: params.transactionId,
        productId: params.productId,
        platform: params.platform,
      });
      return { status: 'transient', reason: `edge_error:${error?.code ?? 'UNKNOWN'}` };
    }

    if (data && typeof data !== 'object') {
      logger.error('[IAP] Receipt validation failed (unexpected response shape)', {
        transactionId: params.transactionId,
        productId: params.productId,
        platform: params.platform,
        responseType: typeof data,
      });
      return { status: 'transient', reason: 'invalid_response_shape' };
    }

    if (data?.success === true) {
      logger.log('[IAP] Receipt validated successfully', {
        transactionId: data.transactionId || params.transactionId,
        environment: data.environment,
        productId: params.productId,
        platform: params.platform,
        inputType: params.platform === 'ios' ? 'receipt' : 'purchaseToken',
      });
      return { status: 'valid' };
    }

    // Edge function returned a non-success response
    logger.error('[IAP] Receipt validation failed (non-success response)', {
      transactionId: params.transactionId,
      productId: params.productId,
      platform: params.platform,
      serverError: data?.error ?? 'Unknown error',
    });
    const serverReason = String(data?.error ?? data?.reason ?? 'non_success');
    const invalidSignals = ['invalid', 'expired', 'revoked', 'not_purchased', 'mismatched'];
    const isInvalid = invalidSignals.some((signal) => serverReason.toLowerCase().includes(signal));
    return isInvalid
      ? { status: 'invalid', reason: serverReason }
      : { status: 'transient', reason: serverReason };
  } catch (err: any) {
    // This catches BOTH timeout rejection and unexpected failures.
    const msg = err?.message ?? String(err);

    const { logger } = await import('../utils/logger');

    if (typeof msg === 'string' && msg.includes('Receipt validation timeout')) {
      logger.error('[IAP] Receipt validation timeout after 30s', {
        transactionId: params.transactionId,
        productId: params.productId,
        platform: params.platform,
      });
      return { status: 'transient', reason: 'timeout_30s' };
    }

    logger.error('[IAP] Receipt validation unexpected failure', {
      message: msg,
      transactionId: params.transactionId,
      productId: params.productId,
      platform: params.platform,
    });
    return { status: 'transient', reason: 'unexpected_failure' };
  }
}

/**
 * Set local Pro cache (NON-AUTHORITATIVE) - Backward compatible alias
 * 
 * @deprecated Use setLocalProCache() instead - keeping unlockPro() as alias for backward compatibility
 */
export async function unlockPro(): Promise<void> {
  await setLocalProCache();
}

/**
 * Set local Pro cache (NON-AUTHORITATIVE)
 * 
 * This function ONLY caches pro status locally AFTER database confirmation.
 * It does NOT update the database - only the Edge Function can do that.
 * 
 * Flow:
 * 1. Edge Function validates receipt and updates DB (pro_unlocked = true)
 * 2. Client calls checkProStatus() to verify DB update
 * 3. If DB confirms pro_unlocked = true, THEN call this to cache locally
 * 
 * This ensures the client never unlocks Pro without DB confirmation.
 * 
 * @returns {Promise<boolean>} true if cache was set successfully, false otherwise
 */
export async function setLocalProCache(): Promise<boolean> {
    // Verify DB status BEFORE caching locally
    // This ensures we only cache if DB has confirmed the unlock
    try {
      const proStatus = await checkProStatus();
      if (proStatus.status === 'unlocked') {
        // DB confirms pro_unlocked = true - safe to cache locally with timestamp
        const cacheEntry = {
          value: true,
          checkedAt: new Date().toISOString(),
        };
        await AsyncStorage.setItem('pro_unlocked', JSON.stringify(cacheEntry));
        logger.log('[IAP] Local Pro cache set after DB confirmation');
        return true;
      } else {
        // DB does not confirm - do NOT cache locally
        logger.warn('[IAP] Pro status not confirmed in database - not caching locally. Edge Function may still be processing.');
        // Wait 1000ms and retry once (max 1 retry) to allow Edge Function propagation
        await new Promise(resolve => setTimeout(resolve, 1000));
        const retryStatus = await checkProStatus();
        if (retryStatus.status === 'unlocked') {
          const cacheEntry = {
            value: true,
            checkedAt: new Date().toISOString(),
          };
          await AsyncStorage.setItem('pro_unlocked', JSON.stringify(cacheEntry));
          logger.log('[IAP] Local Pro cache set after retry DB confirmation');
          return true;
        } else {
          // DB still does not confirm after retry
          logger.error('[IAP] Pro status still not confirmed after retry - Edge Function may have failed');
          // Remove stale cache if exists
          await AsyncStorage.removeItem('pro_unlocked');
          return false;
        }
      }
    } catch (error) {
      logger.error('[IAP] Error setting local Pro cache:', error);
      // Remove stale cache on error
      await AsyncStorage.removeItem('pro_unlocked').catch(() => {});
      return false;
    }
}

/**
 * Get debug information about IAP state
 */
export async function getIAPDebugInfo(): Promise<{
  bundleId: string;
  environment: string;
  skusRequested: string[];
  productsReturned: number;
  connectionStatus: string;
  lastError: string | null;
  isExpoGo: boolean;
  platform: string;
}> {
  const bundleId = Constants.expoConfig?.ios?.bundleIdentifier || 'unknown';
  const environment = __DEV__ ? 'development' : 'production';
  
  return {
    bundleId,
    environment: isExpoGo ? 'Expo Go' : environment,
    skusRequested: ALL_PRODUCT_IDS,
    productsReturned: 0, // Will be updated by hook
    connectionStatus: 'unknown', // Will be updated by hook
    lastError: null, // Will be updated by hook
    isExpoGo,
    platform: Platform.OS,
  };
}
