/**
 * useIapSubscriptions Hook
 * 
 * Production-ready IAP hook using IapManager
 * Uses react-native-iap v14.5 via canonical import boundary
 * 
 * State Machine: idle → connecting → loadingProducts → ready(products) OR error(code,message)
 * NO AUTO-RETRIES - Manual retry only
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import {
  SUBSCRIPTION_PRODUCT_IDS,
  ALL_PRODUCT_IDS,
  type IAPProduct,
  type IAPState,
} from '../lib/iap/iap';
import { logger } from '../lib/utils/logger';
import {
  diagEvent,
  updateDiagnosticsState,
} from '../lib/debug/iapDiagnostics';
import { IapManager, type IapManagerState } from '../lib/services/iap/IapManager';
import { checkProStatus } from '../lib/iap/iap';
import { MONTHLY_SKU, YEARLY_SKU } from '../lib/iap/skus';

const isExpoGo = Constants.appOwnership === 'expo';

interface UseIapSubscriptionsReturn {
  // State
  isReady: boolean;
  isLoadingProducts: boolean;
  products: IAPProduct[];
  purchaseInProgress: boolean;
  lastError: string | null;
  lastErrorCode: string | null;
  connectionStatus: IAPState['connectionStatus'];
  isProUnlocked: boolean;
  productsLoadError: boolean;
  pricesMissing: boolean;
  listenersRegistered: boolean;

  // Actions
  purchaseSubscription: (productId: string) => Promise<void>;
  restorePurchases: () => Promise<RestoreOutcome>;
  refreshProStatus: () => Promise<void>;
  retryLoadProducts: () => Promise<void>;

  // Debug
    debugInfo: {
      bundleId: string;
      environment: string;
      skusRequested: string[];
      productsReturned: number;
      connectionStatus: string;
      lastError: string | null;
      isExpoGo: boolean;
      platform: string;
      isIPad: boolean;
    };
}

type RestoreOutcome = {
  outcome: 'success' | 'none_found' | 'cancelled' | 'error';
  foundPurchases: number;
  dbConfirmed?: boolean;
  errorCode?: string;
  message?: string;
};

export function useIapSubscriptions(): UseIapSubscriptionsReturn {
  const [managerState, setManagerState] = useState<IapManagerState>(IapManager.getState());
  const [purchaseInProgress, setPurchaseInProgress] = useState(false);
  const [isProUnlocked, setIsProUnlocked] = useState(false);
  
  const [debugInfo, setDebugInfo] = useState({
    bundleId: Constants.expoConfig?.ios?.bundleIdentifier || 'unknown',
    environment: __DEV__ ? 'development' : 'production',
    skusRequested: ALL_PRODUCT_IDS,
    productsReturned: 0,
    connectionStatus: 'disconnected',
    lastError: null as string | null,
    isExpoGo,
    platform: Platform.OS,
    isIPad: Platform.OS === 'ios' && Device.deviceType === Device.DeviceType.TABLET,
  });

  const initRef = useRef(false);

  // Subscribe to manager state changes
  useEffect(() => {
    const unsubscribe = IapManager.subscribe((state) => {
      setManagerState(state);
      
      // Update diagnostics with same isReady logic as hook return value
      const productIds = state.products.map(p => p.productId).filter((id): id is string => !!id);
      const hasMonthly = productIds.includes(MONTHLY_SKU);
      const hasYearly = productIds.includes(YEARLY_SKU);
      const bothSkusPresent = hasMonthly && hasYearly;
      const allProductsHavePrice = state.products.every(p => {
        const hasLocalizedPrice = p.localizedPrice && p.localizedPrice.trim() !== '';
        const hasPrice = p.price && p.price.trim() !== '';
        return hasLocalizedPrice || hasPrice;
      });
      const derivedIsReady = 
        state.connectionStatus === 'connected' && 
        state.products.length >= 2 && 
        bothSkusPresent &&
        allProductsHavePrice &&
        !state.pricesMissing &&
        state.listenersRegistered;
      
      updateDiagnosticsState({
        connectionStatus: state.connectionStatus,
        isReady: derivedIsReady,
        isLoadingProducts: state.isLoadingProducts,
        productsReturnedCount: state.products.length,
        productIdsReturned: state.products.map(p => p.productId),
        lastError: state.lastError,
      });

      // Update debug info
      setDebugInfo((prev) => ({
        ...prev,
        productsReturned: state.products.length,
        connectionStatus: state.connectionStatus,
        lastError: state.lastError?.message || null,
      }));
    });

    return unsubscribe;
  }, []);

  // Reset purchaseInProgress when premium unlocks (purchase completed)
  useEffect(() => {
    if (isProUnlocked && purchaseInProgress) {
      logger.log('[IAP Hook] Purchase completed - premium unlocked, resetting purchase state');
      setPurchaseInProgress(false);
    }
  }, [isProUnlocked, purchaseInProgress]);

  // Initialize IAP on mount (exactly once)
  useEffect(() => {
    if (initRef.current) {
      return;
    }

    initRef.current = true;

    const initialize = async () => {
      try {
        await IapManager.initialize();
        
        // Check premium status
        const isUnlocked = await checkProStatus();
        setIsProUnlocked(isUnlocked);
      } catch (error: any) {
        logger.error('[IAP Hook] Initialization error:', error);
      }
    };

    initialize();

    // NOTE: Do NOT tear down on hook unmount - this causes issues when navigating
    // between screens. Tear down should only happen on app exit.
    // If you need to tear down, call IapManager.tearDown() explicitly from app-level cleanup.
  }, []);

  // Update premium status when manager state changes
  useEffect(() => {
    const checkStatus = async () => {
      const isUnlocked = await checkProStatus();
      setIsProUnlocked(isUnlocked);
    };
    checkStatus();
  }, [managerState.products.length]);

  /**
   * Request subscription purchase
   */
  const purchaseSubscription = useCallback(
    async (productId: string) => {
      // Validate state
      if (managerState.connectionStatus !== 'connected') {
        const errorMsg = 'Store connection is not available. Please check your internet connection.';
        logger.error('[IAP Hook] Purchase attempted with disconnected store', {
          connectionStatus: managerState.connectionStatus,
          productId,
        });
        throw new Error(errorMsg);
      }

      if (managerState.products.length === 0) {
        const errorMsg = 'Products not loaded. Please wait for products to load.';
        logger.error('[IAP Hook] Purchase attempted when products not loaded', {
          productId,
        });
        throw new Error(errorMsg);
      }

      const product = managerState.products.find(p => p.productId === productId);
      if (!product) {
        const errorMsg = `Product not available. Please ensure subscription options are loaded.`;
        logger.error('[IAP Hook] Purchase attempted with product not in loaded list', {
          requestedProductId: productId,
          availableProductIds: managerState.products.map(p => p.productId),
        });
        throw new Error(errorMsg);
      }

      if (!(SUBSCRIPTION_PRODUCT_IDS as readonly string[]).includes(productId)) {
        const errorMsg = `Invalid product ID: ${productId}. Must be one of: ${SUBSCRIPTION_PRODUCT_IDS.join(', ')}`;
        logger.error('[IAP Hook] Invalid product ID:', { productId, validIds: SUBSCRIPTION_PRODUCT_IDS });
        throw new Error(errorMsg);
      }

      setPurchaseInProgress(true);
      diagEvent('requestPurchase_start', { productId });

      try {
        await IapManager.buy(productId);
        // Purchase completion is handled by IapManager's purchaseUpdatedListener
        // Emit submitted event, not success - true success is after validation/unlock
        diagEvent('requestPurchase_submitted', { productId });
        // Note: setPurchaseInProgress(false) is handled by purchaseUpdatedListener
        // when purchase completes or fails. No fallback timeout needed.
      } catch (error: any) {
        // Check if this is a user cancellation - handle gracefully
        const isUserCancellation = 
          error?.code === 'USER_CANCELLED' || 
          error?.code === 'E_USER_CANCELLED' ||
          error?.message?.toLowerCase().includes('cancel');

        if (isUserCancellation) {
          // User cancelled - don't log as error, just reset state
          logger.log('[IAP Hook] Purchase cancelled by user');
          diagEvent('requestPurchase_error', {
            error: {
              code: 'USER_CANCELLED',
              message: 'Purchase cancelled by user',
            },
            productId,
          });
          setPurchaseInProgress(false);
          // Don't throw - cancellation is expected behavior
          return;
        }

        // Actual error - log and throw
        logger.error('[IAP Hook] Purchase failed', {
          error,
          productId,
          code: error?.code,
          message: error?.message,
        });
        diagEvent('requestPurchase_error', {
          error: {
            code: error?.code || 'UNKNOWN',
            message: error?.message || 'Unknown error',
          },
          productId,
        });
        // Reset purchase state immediately on error so user can retry
        setPurchaseInProgress(false);
        throw error;
      }
    },
    [managerState]
  );

  /**
   * Restore purchases
   */
  const restorePurchases = useCallback(async (): Promise<RestoreOutcome> => {
    setPurchaseInProgress(true);
    diagEvent('restore_start', {});

    try {
      const result = await IapManager.restore();
      let outcomeResult: RestoreOutcome = { ...result };
      
      // Refresh is best-effort: never downgrade a successful restore if refresh fails.
      // Keep outcome 'success' and surface a non-fatal message instead.
      // Refresh premium status only after confirmed success
      if (outcomeResult.outcome === 'success' && outcomeResult.dbConfirmed !== false) {
        try {
          const isUnlocked = await checkProStatus();
          setIsProUnlocked(isUnlocked);
        } catch (refreshError: any) {
          diagEvent('restore_refresh_failed', {
            code: refreshError?.code || 'UNKNOWN',
            message: refreshError?.message || 'Refresh failed',
          });
          outcomeResult = {
            ...outcomeResult,
            errorCode: outcomeResult.errorCode || 'POST_RESTORE_REFRESH_FAILED',
            message: outcomeResult.message || 'Restored. Entitlements syncing—try again in a moment.',
          };
        }
      }
      
      // Emit correct event based on typed outcome
      if (result.outcome === 'success') {
        diagEvent('restore_success', {
          foundPurchases: result.foundPurchases,
          dbConfirmed: result.dbConfirmed,
        });
      } else if (result.outcome === 'none_found') {
        diagEvent('restore_none_found', {
          foundPurchases: result.foundPurchases,
        });
      } else if (result.outcome === 'cancelled') {
        logger.log('[IAP Hook] Restore cancelled by user');
        diagEvent('restore_cancelled', {
          foundPurchases: result.foundPurchases,
        });
      } else {
        // outcome === 'error'
        logger.error('[IAP Hook] Restore error');
        diagEvent('restore_error', {
          foundPurchases: result.foundPurchases,
        });
      }
      return outcomeResult;
    } catch (error: any) {
      // Fallback error handling if restore() throws unexpectedly
      logger.error('[IAP Hook] Restore error:', error);
      diagEvent('restore_error', {
        error: {
          code: error?.code || 'UNKNOWN',
          message: error?.message || 'Unknown error',
        },
      });
      return {
        outcome: 'error',
        foundPurchases: 0,
        errorCode: error?.code || 'UNKNOWN',
        message: error?.message || 'Unknown error',
      };
    } finally {
      setPurchaseInProgress(false);
    }
  }, []);

  /**
   * Refresh premium status from database
   */
  const refreshProStatus = useCallback(async () => {
    const isUnlocked = await checkProStatus();
    setIsProUnlocked(isUnlocked);
  }, []);

  /**
   * Manual retry of product loading
   */
  const retryLoadProducts = useCallback(async () => {
    logger.log('[IAP Hook] Manual retry of product loading requested');
    await IapManager.retryLoadProducts();
  }, []);

  // TASK D1: Derive UI state - isReady means:
  // - Store connected
  // - Products loaded
  // - BOTH SKUs present
  // - Each SKU has at least one usable price field
  const productIds = managerState.products.map(p => p.productId).filter((id): id is string => !!id);
  const hasMonthly = productIds.includes(MONTHLY_SKU);
  const hasYearly = productIds.includes(YEARLY_SKU);
  const bothSkusPresent = hasMonthly && hasYearly;
  
  // Check each product has at least one usable price
  const allProductsHavePrice = managerState.products.every(p => {
    const hasLocalizedPrice = p.localizedPrice && p.localizedPrice.trim() !== '';
    const hasPrice = p.price && p.price.trim() !== '';
    return hasLocalizedPrice || hasPrice;
  });
  
  const isReady = 
    managerState.connectionStatus === 'connected' && 
    managerState.products.length >= 2 && 
    bothSkusPresent &&
    allProductsHavePrice &&
    !managerState.pricesMissing &&
    managerState.listenersRegistered;
  const isLoadingProducts = managerState.isLoadingProducts;
  const productsLoadError = managerState.connectionStatus === 'connected' && managerState.products.length === 0 && managerState.lastError !== null;
  const lastError = managerState.lastError?.userMessage || null;
  const lastErrorCode = managerState.lastError?.code || null;
  const pricesMissing = managerState.pricesMissing || false;

  return {
    isReady,
    isLoadingProducts,
    products: managerState.products,
    purchaseInProgress,
    lastError,
    lastErrorCode,
    connectionStatus: managerState.connectionStatus,
    isProUnlocked,
    productsLoadError,
    pricesMissing,
    listenersRegistered: managerState.listenersRegistered,
    purchaseSubscription,
    restorePurchases,
    refreshProStatus,
    retryLoadProducts,
    debugInfo,
  };
}
