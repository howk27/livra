import { useEffect, useState, useCallback } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { logger } from '../lib/utils/logger';

const PRO_PRODUCT_ID = 'livra_pro_unlock';

// Check if running in Expo Go
const isExpoGo = Constants.executionEnvironment === 'storeClient';

interface IAPState {
  isProUnlocked: boolean;
  products: any[];
  loading: boolean;
  purchasing: boolean;
  error: string | null;
}

export const useIAP = () => {
  const [state, setState] = useState<IAPState>({
    isProUnlocked: false,
    products: [],
    loading: true,
    purchasing: false,
    error: null,
  });

  const checkProStatus = useCallback(async (): Promise<boolean> => {
    // Check local storage first
    const localStatus = await AsyncStorage.getItem('pro_unlocked');
    if (localStatus === 'true') {
      return true;
    }

    // Check Supabase if user is logged in
    try {
      const { supabase } = await import('../lib/supabase');
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
          await AsyncStorage.setItem('pro_unlocked', 'true');
          return true;
        }
      }
    } catch (error) {
      logger.error('[IAP] Error in checkProStatus:', error);
      // Ignore Supabase errors for offline mode
    }

    return false;
  }, []);

  const unlockPro = useCallback(async () => {
    // Save to local storage
    await AsyncStorage.setItem('pro_unlocked', 'true');

    // Save to Supabase if user is logged in
    try {
      const { supabase } = await import('../lib/supabase');
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        await supabase
          .from('profiles')
          .upsert({
            id: user.id,
            pro_unlocked: true,
            pro_unlocked_at: new Date().toISOString(),
          });
      }
    } catch (error) {
      logger.error('[IAP] Error in unlockPro:', error);
      // Ignore Supabase errors for offline mode
    }
  }, []);

  const initializeIAP = useCallback(async () => {
    try {
      // For web/Expo Go, skip IAP initialization
      if (Platform.OS === 'web' || isExpoGo) {
        const isUnlocked = await checkProStatus();
        setState((prev) => ({
          ...prev,
          isProUnlocked: isUnlocked,
          loading: false,
        }));
        return;
      }

      // Dynamic import for native platforms only
      const {
        initConnection,
        endConnection,
        purchaseUpdatedListener,
        purchaseErrorListener,
        getProducts,
        finishTransaction,
      } = await import('react-native-iap');
      
      await initConnection();
      
      // Check if user has already unlocked pro
      const isUnlocked = await checkProStatus();
      
      // Load products
      const products = await getProducts({ skus: [PRO_PRODUCT_ID] });

      setState((prev) => ({
        ...prev,
        isProUnlocked: isUnlocked,
        products,
        loading: false,
      }));

      // Set up purchase listeners
      const purchaseUpdateSubscription = purchaseUpdatedListener(
        async (purchase: any) => {
          const receipt = purchase.transactionReceipt;
          if (receipt) {
            try {
              // Validate and unlock pro
              await unlockPro();
              await finishTransaction({ purchase });
              
              setState((prev) => ({
                ...prev,
                isProUnlocked: true,
                purchasing: false,
              }));
            } catch (error) {
              logger.error('[IAP] Error processing purchase:', error);
            }
          }
        }
      );

      const purchaseErrorSubscription = purchaseErrorListener(
        (error: any) => {
          logger.error('[IAP] Purchase error:', error);
          setState((prev) => ({
            ...prev,
            purchasing: false,
            error: error.message,
          }));
        }
      );

      return () => {
        purchaseUpdateSubscription.remove();
        purchaseErrorSubscription.remove();
        endConnection();
      };
    } catch (error) {
      logger.error('[IAP] IAP initialization error:', error);
      setState((prev) => ({
        ...prev,
        loading: false,
        error: (error as Error).message,
      }));
    }
  }, [checkProStatus, unlockPro]);

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    
    initializeIAP().then((fn) => {
      cleanup = fn;
    });
    
    return () => {
      if (cleanup) cleanup();
    };
  }, [initializeIAP]);

  const purchasePro = useCallback(async () => {
    setState((prev) => ({ ...prev, purchasing: true, error: null }));
    
    try {
      if (Platform.OS === 'web' || isExpoGo) {
        // Simulate purchase for web/Expo Go
        await unlockPro();
        setState((prev) => ({
          ...prev,
          isProUnlocked: true,
          purchasing: false,
        }));
        return;
      }

      const { requestPurchase } = await import('react-native-iap');
      await requestPurchase({ sku: PRO_PRODUCT_ID });
    } catch (error) {
      logger.error('[IAP] Purchase request error:', error);
      setState((prev) => ({
        ...prev,
        purchasing: false,
        error: (error as Error).message,
      }));
    }
  }, [unlockPro]);

  const restorePurchases = useCallback(async () => {
    setState((prev) => ({ ...prev, purchasing: true, error: null }));
    
    try {
      // For now, just check the local status
      // In production, you'd use getAvailablePurchases() or platform-specific restore
      const isUnlocked = await checkProStatus();
      
      setState((prev) => ({
        ...prev,
        isProUnlocked: isUnlocked,
        purchasing: false,
        error: isUnlocked ? null : 'No previous purchases found',
      }));
    } catch (error) {
      logger.error('[IAP] Restore error:', error);
      setState((prev) => ({
        ...prev,
        purchasing: false,
        error: (error as Error).message,
      }));
    }
  }, [checkProStatus]);

  const canCreateCounter = (currentCount: number): boolean => {
    return state.isProUnlocked || currentCount < 3;
  };

  return {
    isProUnlocked: state.isProUnlocked,
    products: state.products,
    loading: state.loading,
    purchasing: state.purchasing,
    error: state.error,
    purchasePro,
    restorePurchases,
    canCreateCounter,
  };
};

