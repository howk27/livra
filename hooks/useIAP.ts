/**
 * useIAP Hook - Compatibility Wrapper
 * 
 * This hook provides backward compatibility for existing code.
 * It wraps the new useIapSubscriptions hook and provides the same API.
 * 
 * @deprecated Consider migrating to useIapSubscriptions for new code
 */

import { useCallback } from 'react';
import { useIapSubscriptions } from './useIapSubscriptions';
import { MONTHLY_PRODUCT_ID } from '../lib/iap/iap';

export const useIAP = () => {
  const {
    isProUnlocked,
    products,
    isLoadingProducts,
    purchaseInProgress,
    lastError,
    connectionStatus,
    isReady,
    purchaseSubscription,
    restorePurchases,
    refreshProStatus,
  } = useIapSubscriptions();

  // Compatibility wrapper for purchasePro
  const purchasePro = useCallback(
    async (productId?: string) => {
      const targetProductId = productId || MONTHLY_PRODUCT_ID;
      await purchaseSubscription(targetProductId);
    },
    [purchaseSubscription]
  );

  // Legacy canCreateCounter function
  const canCreateCounter = useCallback(
    (currentCount: number): boolean => {
      return isProUnlocked || currentCount < 3;
    },
    [isProUnlocked]
  );

  // Legacy resetProStatus - now just clears local cache
  const resetProStatus = useCallback(async () => {
    // The new implementation handles this automatically
    // This is kept for backward compatibility
    await refreshProStatus();
  }, [refreshProStatus]);

  return {
    // State (mapped from new hook)
    isProUnlocked,
    products,
    loading: isLoadingProducts,
    purchasing: purchaseInProgress,
    error: lastError,
    isConnected: connectionStatus === 'connected',
    isInitialized: isReady,

    // Actions
    purchasePro,
    restorePurchases,
    canCreateCounter,
    resetProStatus,
    refreshProStatus,
  };
};
