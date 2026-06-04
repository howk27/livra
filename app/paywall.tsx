import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Linking,
  Alert,
  Platform,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import Constants from 'expo-constants';
import { colors as tokenColors } from '../theme/tokens';
import { colors } from '../theme/colors';
import { spacing, borderRadius, fontSize, fontWeight, shadow, fonts, radius } from '../theme/tokens';
import { useEffectiveTheme } from '../state/uiSlice';
import { useIapSubscriptions } from '../hooks/useIapSubscriptions';
import { MONTHLY_PRODUCT_ID, YEARLY_PRODUCT_ID } from '../lib/iap/iap';
import { logger } from '../lib/utils/logger';
import { getIapService } from '../lib/services/iap/getIapService';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { diagEvent, exportSupportBundle, getSupportDiagnosticsEnabled } from '../lib/debug/iapDiagnostics';
import {
  checkProStatus,
  normalizeIapError,
  isNativeStorePurchasesSupported,
  type NormalizedIapError,
} from '../lib/iap/iap';
import { env } from '../lib/env';
import { applyOpacity } from '@/src/components/icons/color';
import { AppText } from '../components/Typography';
import { Card, PrimaryButton } from '../components/ui';
import { SvgLogo } from '../components/ui/SvgLogo';
import { LivraWordmark } from '../components/ui/LivraWordmark';
import { SectionLabel } from '../components/ui/SectionLabel';

const PRO_FEATURES = [
  { ion: 'flag-outline',           title: 'Unlimited Goals',      description: 'Queue as many goals as you have.' },
  { ion: 'infinite-outline',       title: 'Unlimited Marks',      description: 'No ceiling on what you can build.' },
  { ion: 'swap-vertical-outline',  title: 'Mark Reordering',      description: 'Put your most important marks first.' },
  { ion: 'heart-outline',          title: 'Apple Health',         description: 'Sleep, Workout, Steps — synced automatically.' },
  { ion: 'notifications-outline',  title: 'Custom Reminders',     description: 'Daily reminders for any mark, any time.' },
  { ion: 'bar-chart-outline',      title: 'CSV Export',           description: 'Your history is yours. Export anytime.' },
];

const SHIPPED_PREMIUM_FEATURE_TITLES = [
  'Unlimited Goals',
  'Unlimited Marks',
  'Mark Reordering',
  'Apple Health',
  'Custom Reminders',
  'CSV Export',
];


type PlanType = 'monthly' | 'yearly';

function PaywallScreenContent() {
  const iapService = getIapService();
  const theme = useEffectiveTheme();
  const themeColors = colors[theme];
  const isDark = theme === 'dark';
  const router = useRouter();
  const [selectedPlan, setSelectedPlan] = useState<PlanType>('monthly');
  
  // STEP 5: Restore message state
  const [restoreMessage, setRestoreMessage] = useState<string | null>(null);
  const [restoreMessageType, setRestoreMessageType] = useState<'success' | 'info' | 'error' | null>(null);
  const [normalizedError, setNormalizedError] = useState<NormalizedIapError | null>(null);

  type OperationState =
    | 'idle'
    | 'initializing'
    | 'loadingProducts'
    | 'purchasing'
    | 'restoring'
    | 'verifying'
    | 'info'
    | 'transient_error'
    | 'error'
    | 'subscribed';
  const [operationState, setOperationState] = useState<OperationState>('idle');
  const [operationMessage, setOperationMessage] = useState<string | null>(null);
  const operationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const entitlementRefreshTokenRef = useRef(0);
  
  // TASK 7: Preflight health check error state
  const [healthCheckFailed, setHealthCheckFailed] = useState(false);
  const [healthCheckReasons, setHealthCheckReasons] = useState<string[]>([]);

  // CRITICAL: Synchronous ref guard to prevent double-tap race condition
  // This must be defined before useIapSubscriptions hook to prevent crash
  const purchaseInProgressRef = useRef(false);
  const [supportModeEnabled, setSupportModeEnabled] = useState(false);

  /** Hidden gesture (7 taps on title): support bundle export when `enableSupportBundle` + support diagnostics flag. */
  const titleTapCount = useRef(0);
  const titleTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let mounted = true;
    getSupportDiagnosticsEnabled()
      .then((enabled) => {
        if (mounted) setSupportModeEnabled(enabled);
      })
      .catch(() => {
        if (mounted) setSupportModeEnabled(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const handleTitleTap = async () => {
    if (!supportModeEnabled) return;
    titleTapCount.current += 1;

    // Clear existing timer
    if (titleTapTimer.current) {
      clearTimeout(titleTapTimer.current);
    }

    const enableSupportBundle = Constants.expoConfig?.extra?.enableSupportBundle === true;

    if (titleTapCount.current >= 7) {
      titleTapCount.current = 0;
      if (titleTapTimer.current) {
        clearTimeout(titleTapTimer.current);
        titleTapTimer.current = null;
      }

      if (enableSupportBundle) {
        // TestFlight build: export support bundle
        try {
          await exportSupportBundle();
          Alert.alert('Support Bundle', 'Support bundle exported. Check your share sheet.');
        } catch (error) {
          logger.error('[Paywall] Error exporting support bundle:', error);
          Alert.alert('Error', 'Failed to export support bundle. Please try again.');
        }
      }
      return;
    }

    // Reset counter after 3 seconds
    titleTapTimer.current = setTimeout(() => {
      titleTapCount.current = 0;
      titleTapTimer.current = null;
    }, 3000);
  };

  const {
    products,
    purchaseInProgress,
    purchaseSubscription,
    restorePurchases,
    lastError,
    lastErrorCode,
    lastErrorRawMessage,
    isReady,
    isLoadingProducts,
    connectionStatus,
    isProUnlocked,
    proStatus,
    hasPendingVerification,
    lastPurchaseUpdatedAt,
    lastPurchaseTransactionId,
    productsLoadError,
    pricesMissing,
    listenersRegistered,
    retryLoadProducts,
  } = useIapSubscriptions();

  const isSubscribed = isProUnlocked === true;
  const androidPackage = Constants.expoConfig?.android?.package || 'com.livra.app';

  const currentNormalizedError = useMemo(() => {
    if (normalizedError) return normalizedError;
    if (lastErrorCode || lastErrorRawMessage || lastError) {
      return normalizeIapError({
        code: lastErrorCode,
        message: lastErrorRawMessage || lastError || '',
      });
    }
    return null;
  }, [normalizedError, lastErrorCode, lastErrorRawMessage, lastError]);

  // Diagnostics telemetry only (not used for gating)
  useEffect(() => {
    if (env.isDev) {
      try {
        const diag = getIapService().getDiagnostics();
        // Diagnostics tracked but not used to gate purchases
      } catch (e) {
        // Silently fail - diagnostics are telemetry only
      }
    }
  }, [products, connectionStatus]);

  useEffect(() => {
    if (!env.isDev) return;
    const mismatched = PRO_FEATURES.filter(
      (feature) => !SHIPPED_PREMIUM_FEATURE_TITLES.includes(feature.title)
    );
    if (mismatched.length > 0) {
      logger.warn('[Paywall] PRO_FEATURES contains unshipped items', {
        titles: mismatched.map((f) => f.title),
      });
    }
  }, []);

  useEffect(() => {
    if (isLoadingProducts) {
      setOperationState('loadingProducts');
      setOperationMessage('Loading subscription options...');
    } else if (operationState === 'loadingProducts') {
      setOperationState('idle');
      setOperationMessage(null);
    }
  }, [isLoadingProducts, operationState]);

  const handleManageSubscription = async () => {
    const handled = await iapService.openManageSubscriptions();
    if (handled) return;

    const url = Platform.OS === 'ios'
      ? 'https://apps.apple.com/account/subscriptions'
      : `https://play.google.com/store/account/subscriptions?package=${androidPackage}`;

    const retryOpen = async () => {
      try {
        await Linking.openURL(url);
      } catch {
        // Ignore secondary failure
      }
    };

    try {
      await Linking.openURL(url);
    } catch (error) {
      Alert.alert(
        'Unable to Open Subscriptions',
        'We could not open your subscription settings. Please try again.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Try Again', onPress: () => retryOpen() },
        ]
      );
    }
  };

  const verificationPendingMessage =
    'Your purchase was accepted by the store, but Livra+ is still syncing. Check your connection and tap Verify again.';

  useEffect(() => {
    return () => {
      entitlementRefreshTokenRef.current += 1;
    };
  }, []);

  const refreshEntitlementWithBackoff = useCallback(
    async ({
      maxMs = 90000,
      requireDbConfirmation = true,
    }: { maxMs?: number; requireDbConfirmation?: boolean } = {}): Promise<
      'unlocked' | 'still_locked' | 'error' | 'aborted'
    > => {
      const delays = [0, 800, 1600, 2400, 4000, 9000, 15000, 30000, 60000, 90000].filter(
        (delay) => delay <= maxMs
      );
      const token = entitlementRefreshTokenRef.current;
      try {
        for (const delay of delays) {
          if (entitlementRefreshTokenRef.current !== token) {
            return 'aborted';
          }
          if (delay > 0) {
            await new Promise((resolve) => setTimeout(resolve, delay));
          }
          if (entitlementRefreshTokenRef.current !== token) {
            return 'aborted';
          }
          const status = await checkProStatus();
          const ok = requireDbConfirmation ? status.dbUnlocked : status.effectiveUnlocked;
          if (ok) {
            return 'unlocked';
          }
        }
        return 'still_locked';
      } catch (error) {
        logger.error('[Paywall] Error refreshing entitlement status:', error);
        return 'error';
      }
    },
    []
  );

  const lastPurchaseUpdatedRef = useRef<string | null>(null);

  // STEP 2: Deterministic product mapping - use normalized productId from IapManager
  // IapManager normalizes products to always have productId field
  const monthlyProduct = useMemo(() => {
    if (!products || !Array.isArray(products) || products.length === 0) {
      return null;
    }
    // Strict match on normalized productId (IapManager guarantees this exists)
    const found = products.find((p: any) => p?.productId === MONTHLY_PRODUCT_ID);
    return found || null;
  }, [products]);
  
  const yearlyProduct = useMemo(() => {
    if (!products || !Array.isArray(products) || products.length === 0) {
      return null;
    }
    // Strict match on normalized productId (IapManager guarantees this exists)
    const found = products.find((p: any) => p?.productId === YEARLY_PRODUCT_ID);
    return found || null;
  }, [products]);

  // Get prices for each plan - bulletproof: use localizedPrice || price, show "—" if both empty
  const monthlyPrice = monthlyProduct?.localizedPrice || monthlyProduct?.price || '';
  const yearlyPrice = yearlyProduct?.localizedPrice || yearlyProduct?.price || '';
  
  // Get price for selected plan (for purchase button) - bulletproof
  const selectedProduct = selectedPlan === 'monthly' ? monthlyProduct : yearlyProduct;
  const selectedPrice = selectedProduct?.localizedPrice || selectedProduct?.price || '';
  
  // Calculate monthly equivalent for yearly plan - null-safe with NaN checks
  const yearlyPriceAsNumber = yearlyPrice && typeof yearlyPrice === 'string'
    ? (parseFloat(yearlyPrice.replace(/[^0-9.]/g, '')) || 0)
    : 0;
  const monthlyPriceAsNumber = monthlyPrice && typeof monthlyPrice === 'string'
    ? (parseFloat(monthlyPrice.replace(/[^0-9.]/g, '')) || 0)
    : 0;
  
  // Safe division with NaN checks
  const monthlyEquivalent = (yearlyPriceAsNumber > 0 && !isNaN(yearlyPriceAsNumber) && !isNaN(12))
    ? yearlyPriceAsNumber / 12
    : 0;
  const pricePerMonth = monthlyEquivalent > 0 && !isNaN(monthlyEquivalent)
    ? `$${monthlyEquivalent.toFixed(2)}`
    : '';
  
  // Safe savings calculation with NaN checks
  const savingsPercent = (monthlyPriceAsNumber > 0 && yearlyPriceAsNumber > 0 && 
                          !isNaN(monthlyPriceAsNumber) && !isNaN(monthlyEquivalent) && monthlyPriceAsNumber > 0)
    ? Math.round((1 - monthlyEquivalent / monthlyPriceAsNumber) * 100)
    : 0;

  // Single source of truth: isReady includes listenersRegistered, so this is sufficient
  const canAttemptPurchase =
    isReady &&
    !purchaseInProgress &&
    !isSubscribed &&
    !hasPendingVerification &&
    operationState !== 'verifying';

  // Terminal gate: Block purchase if selected product has no price
  const hasValidPrice = selectedPrice && selectedPrice.trim() !== '';
  const buttonDisabled = !canAttemptPurchase || !hasValidPrice;

  // STEP 3: Remove double-authority purchase gating
  // Paywall guard is ONLY for UI spam prevention (1 second tap guard)
  // IapManager is the authoritative source for purchase state
  const handlePurchase = async () => {
    try {
      // Local tap guard: prevent UI spam only (1 second cooldown)
      if (purchaseInProgressRef.current) {
        logger.warn('[Paywall] Duplicate tap ignored (tap guard)');
        return;
      }

      // Set tap guard for 1 second to prevent UI spam
      purchaseInProgressRef.current = true;
      setTimeout(() => {
        purchaseInProgressRef.current = false;
      }, 1000);

      // Additional validation before purchase
      if (isSubscribed) {
        setOperationState('subscribed');
        setOperationMessage(null);
        Alert.alert('Subscribed', 'You already have an active subscription.');
        purchaseInProgressRef.current = false;
        return;
      }

      if (hasPendingVerification) {
        setOperationState('verifying');
        setOperationMessage('Verification pending. Please retry.');
        Alert.alert(
          'Verification Pending',
          'Your previous purchase is still being verified. Please wait a moment and tap "Retry Verification".'
        );
        purchaseInProgressRef.current = false;
        return;
      }

      setOperationState('purchasing');
      setOperationMessage('Processing purchase...');
      if (!selectedProduct) {
        logger.error('[Paywall] Purchase attempted without selected product');
        purchaseInProgressRef.current = false;
        setOperationState('error');
        setOperationMessage('Please select a plan to continue.');
        return;
      }

      // Terminal gate: Block purchase if price is missing
      const hasPrice = selectedPrice && selectedPrice.trim() !== '';
      if (!hasPrice) {
        logger.error('[Paywall] Purchase attempted with missing price', {
          productId: selectedProduct.productId,
          selectedPlan,
        });
        try {
          diagEvent('iap_prices_missing_terminal', {
            productId: selectedProduct.productId,
            selectedPlan,
            reason: 'price_missing_at_purchase_attempt',
          });
        } catch (e) {
          // Silently fail if diagnostics logging fails
        }
        Alert.alert(
          'Purchase Unavailable',
          'Subscription pricing is not available. Please try again later.',
          [{ text: 'OK' }]
        );
        purchaseInProgressRef.current = false;
        setOperationState('error');
        setOperationMessage('Subscription pricing is not available.');
        return;
      }

      const productId = selectedPlan === 'monthly' ? MONTHLY_PRODUCT_ID : YEARLY_PRODUCT_ID;
      
      // Verify product exists in loaded products (defense in depth)
      if (!products || !Array.isArray(products)) {
        logger.error('[Paywall] Purchase attempted with invalid products array');
        purchaseInProgressRef.current = false;
        return;
      }
      // STEP 2: Use normalized productId for verification (deterministic)
      const productExists = products.some(p => p?.productId === productId);
      if (!productExists) {
        const availableIds = products.map(p => p?.productId).filter((id): id is string => id !== null && id !== undefined);
        logger.error('[Paywall] Purchase attempted with product not in loaded list', {
          productId,
          availableProductIds: availableIds,
        });
        // Log diagnostic event for SKU mapping failure (safe, won't crash)
        try {
          diagEvent('paywall_sku_mapping_failed', {
            attemptedSku: productId,
            availableIdentifiers: availableIds,
            expectedSkus: [MONTHLY_PRODUCT_ID, YEARLY_PRODUCT_ID],
          });
        } catch (e) {
          // Silently fail if diagnostics logging fails - don't crash
        }
        purchaseInProgressRef.current = false;
        return;
      }

      // Log purchase attempt for diagnostics
      try {
        diagEvent('paywall_purchase_attempt', {
          sku: productId,
          planType: selectedPlan,
          timestamp: Date.now(),
          blockedByGuard: false,
        });
      } catch (e) {
        // Silently fail if diagnostics logging fails
      }

      // Always call IapManager.buy via hook - it is the authoritative source
      // IapManager will handle its own purchaseInProgress guard and throw if already in progress
      const purchaseResult = await purchaseSubscription(productId);
      if (purchaseResult.outcome === 'submitted') {
        setOperationState('verifying');
        setOperationMessage('Verifying your purchase...');
        setNormalizedError(null);
        const verificationResult = await refreshEntitlementWithBackoff({
          maxMs: 90000,
          requireDbConfirmation: true,
        });
        if (verificationResult === 'aborted') {
          return;
        }
        if (verificationResult === 'unlocked') {
          setOperationState('subscribed');
          setOperationMessage(null);
        } else if (verificationResult === 'still_locked') {
          setOperationState('info');
          setOperationMessage(verificationPendingMessage);
        } else {
          setOperationState('error');
          setOperationMessage('Purchase failed. Please try again.');
        }
        return;
      }
      if (purchaseResult.outcome === 'cancelled') {
        setOperationState('info');
        setOperationMessage('Purchase cancelled.');
        setNormalizedError(null);
        return;
      }
      // outcome === 'error'
      const normalized = normalizeIapError({
        code: purchaseResult.code,
        message: purchaseResult.message,
      });
      setNormalizedError(normalized);
      if (normalized.kind === 'already_owned') {
        setOperationState('info');
        setOperationMessage(normalized.message);
        purchaseInProgressRef.current = false;
        return;
      }
      setOperationState('error');
      setOperationMessage('Purchase failed. Please try again.');
      // Reset tap guard on error so user can retry after error is cleared
      purchaseInProgressRef.current = false;
      // Note: Tap guard auto-resets after 1 second, or on error above
      // IapManager's purchaseInProgress state is authoritative and managed by IapManager
    } finally {
      setOperationState((current) => {
        if (current === 'purchasing') {
          setOperationMessage(null);
          return 'idle';
        }
        return current;
      });
    }
  };

  // Reset guard when purchaseInProgress state changes to false
  useEffect(() => {
    if (!purchaseInProgress) {
      purchaseInProgressRef.current = false;
    }
  }, [purchaseInProgress]);

  // STEP 5: Restore must return user-visible result
  const handleRestore = async () => {
    setRestoreMessage(null);
    setRestoreMessageType(null);
    setOperationState('restoring');
    setOperationMessage('Restoring purchases...');
    setNormalizedError(null);
    
    try {
      const result = await restorePurchases();
      
      if (result.outcome === 'cancelled') {
        setRestoreMessage('Restore cancelled.');
        setRestoreMessageType('info');
        setOperationState('idle');
        setOperationMessage(null);
      } else if (result.outcome === 'none_found') {
        setRestoreMessage('No active subscription found for this Apple ID.');
        setRestoreMessageType('info');
        setOperationState('idle');
        setOperationMessage(null);
      } else if (result.outcome === 'unsupported_environment') {
        setRestoreMessage(
          'Store restore is not available in Expo Go or on the web. Use a development build or TestFlight.'
        );
        setRestoreMessageType('info');
        setOperationState('idle');
        setOperationMessage(null);
      } else if (result.outcome === 'unverifiable_receipt') {
        setRestoreMessage(
          'A subscription may exist, but the receipt could not be read to verify it. Try again later.'
        );
        setRestoreMessageType('info');
        setOperationState('idle');
        setOperationMessage(null);
      } else if (result.outcome === 'success') {
        setOperationState('verifying');
        setOperationMessage('Verifying your entitlement…');
        const verificationResult = await refreshEntitlementWithBackoff({
          maxMs: 90000,
          requireDbConfirmation: false,
        });
        if (verificationResult === 'aborted') {
          return;
        }
        if (verificationResult === 'unlocked') {
          setRestoreMessage('Restored successfully.');
          setRestoreMessageType('success');
          setOperationState('subscribed');
          setOperationMessage(null);
        } else if (verificationResult === 'still_locked') {
          setRestoreMessage('Restored. Entitlements syncing—try again in a moment.');
          setRestoreMessageType('info');
          setOperationState('info');
          setOperationMessage(verificationPendingMessage);
        } else {
          setRestoreMessage('Restore completed, but we could not verify yet.');
          setRestoreMessageType('info');
          setOperationState('error');
          setOperationMessage('Purchase failed. Please try again.');
        }
      } else {
        setRestoreMessage('Restore failed. Please try again.');
        setRestoreMessageType('error');
        setOperationState('error');
        setOperationMessage('Restore failed. Please try again.');
      }
      
      // Clear message after 5 seconds
      setTimeout(() => {
        setRestoreMessage(null);
        setRestoreMessageType(null);
      }, 5000);
    } catch (err: any) {
      logger.error('[Paywall] Error in handleRestore:', err);
      // Show user-friendly error message
      const errorMsg = err?.message || String(err);
      const errorCode = err?.code || '';
      let userMessage = 'Restore failed. Please try again.';
      
      // Check for cancellation by code or message
      const isCancelled = errorCode === 'USER_CANCELLED' || 
                         errorCode === 'E_USER_CANCELLED' ||
                         err?.cancelled === true ||
                         errorMsg.toLowerCase().includes('cancel') ||
                         errorMsg.toLowerCase().includes('request canceled');
      
      if (errorMsg.includes('network') || errorMsg.includes('connection')) {
        userMessage = 'Restore failed: Network error. Please check your connection.';
      } else if (isCancelled) {
        userMessage = 'Restore was cancelled.';
      }
      
      setRestoreMessage(userMessage);
      setRestoreMessageType(isCancelled ? 'info' : 'error');
      setOperationState(isCancelled ? 'idle' : 'error');
      setOperationMessage(isCancelled ? null : userMessage);
      
      // Clear message after 5 seconds
      setTimeout(() => {
        setRestoreMessage(null);
        setRestoreMessageType(null);
      }, 5000);
    } finally {
      setOperationState((current) => {
        if (current === 'restoring') {
          setOperationMessage(null);
          return 'idle';
        }
        return current;
      });
    }
  };

  const transientErrorCodes = new Set([
    'TRANSIENT_DB_PENDING',
    'TRANSIENT_RECEIPT_MISSING',
    'TRANSIENT_VERIFICATION_PENDING',
    'TRANSIENT_PURCHASE_TOKEN_MISSING',
  ]);
  const hasTransientError = lastErrorCode ? transientErrorCodes.has(lastErrorCode) : false;
  const isTransientState = hasTransientError || hasPendingVerification || operationState === 'transient_error';
  const normalizedKind = currentNormalizedError?.kind;
  const isAlreadyOwned = normalizedKind === 'already_owned';
  const isCancelled = normalizedKind === 'cancelled';
  const isDeferred = currentNormalizedError?.message?.toLowerCase().includes('deferred') || false;
  const hasPurchaseUpdated = !!lastPurchaseUpdatedAt;
  const hasPurchaseTransactionId = !!lastPurchaseTransactionId;
  const isStrictFailure =
    !!currentNormalizedError &&
    !isCancelled &&
    !isAlreadyOwned &&
    !isDeferred &&
    !isTransientState &&
    !hasPurchaseUpdated &&
    !hasPurchaseTransactionId;

  const handleRetryVerification = async () => {
    try {
      setOperationState('verifying');
      setOperationMessage('Verifying your purchase...');
      await iapService.recoverNow();
      const verificationResult = await refreshEntitlementWithBackoff({
        maxMs: 90000,
        requireDbConfirmation: true,
      });
      if (verificationResult === 'aborted') {
        return;
      }
      if (verificationResult === 'unlocked') {
        setOperationState('subscribed');
        setOperationMessage(null);
      } else if (verificationResult === 'still_locked') {
        setOperationState('info');
        setOperationMessage(verificationPendingMessage);
      } else {
        setOperationState('error');
        setOperationMessage('Purchase failed. Please try again.');
      }
    } catch (error) {
      logger.error('[Paywall] Retry verification failed', error);
      setOperationState('error');
      setOperationMessage('Purchase failed. Please try again.');
    } finally {
      setOperationState((current) => {
        if (current === 'verifying') {
          setOperationMessage(null);
          return 'idle';
        }
        return current;
      });
    }
  };

  useEffect(() => {
    if (isProUnlocked) {
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace('/(tabs)/focus' as any);
      }
    }
  }, [isProUnlocked, router]);

  useEffect(() => {
    if (isSubscribed) {
      setOperationState('subscribed');
      setOperationMessage(null);
      setNormalizedError(null);
    }
  }, [isSubscribed]);

  useEffect(() => {
    if (operationState === 'idle' || operationState === 'subscribed') {
      setNormalizedError(null);
    }
  }, [operationState]);

  useEffect(() => {
    if (isSubscribed) return;
    if (
      proStatus.verification === 'unverified' &&
      proStatus.status === 'unknown' &&
      (operationState === 'idle' || operationState === 'info')
    ) {
      setOperationState('info');
      setOperationMessage('Unable to verify premium status right now.');
    }
  }, [proStatus.status, proStatus.verification, isSubscribed, operationState]);

  useEffect(() => {
    if (isSubscribed) return;
    if (connectionStatus === 'connecting') {
      setOperationState('initializing');
      setOperationMessage('Connecting to store...');
      return;
    }
    if (connectionStatus === 'error' || connectionStatus === 'disconnected') {
      setOperationState('error');
      setOperationMessage('Store connection is not available. Please try again.');
    }
  }, [connectionStatus, isSubscribed]);

  useEffect(() => {
    if (isSubscribed) return;
    if (!lastError) return;
    if (hasTransientError) {
      setOperationState('transient_error');
      setOperationMessage('We couldn’t verify your purchase yet.');
    } else {
      setOperationState('error');
      setOperationMessage('Purchase failed. Please try again.');
    }
  }, [lastError, hasTransientError]);

  useEffect(() => {
    if (!lastPurchaseUpdatedAt) return;
    if (lastPurchaseUpdatedRef.current === lastPurchaseUpdatedAt) return;
    lastPurchaseUpdatedRef.current = lastPurchaseUpdatedAt;
    if (isSubscribed) return;
    setOperationState('verifying');
    setOperationMessage('Verifying your purchase...');
    setNormalizedError(null);
    refreshEntitlementWithBackoff({ maxMs: 90000, requireDbConfirmation: true })
      .then((verificationResult) => {
        if (verificationResult === 'aborted') {
          return;
        }
        if (verificationResult === 'unlocked') {
          setOperationState('subscribed');
          setOperationMessage(null);
        } else if (verificationResult === 'still_locked') {
          setOperationState('info');
          setOperationMessage(verificationPendingMessage);
        } else {
          setOperationState('error');
          setOperationMessage('Purchase failed. Please try again.');
        }
      })
      .catch(() => {
        setOperationState('error');
        setOperationMessage('Purchase failed. Please try again.');
      });
  }, [isSubscribed, lastPurchaseUpdatedAt, refreshEntitlementWithBackoff, verificationPendingMessage]);

  useEffect(() => {
    if (!isStrictFailure) return;
    if (operationState !== 'error' || operationMessage !== 'Purchase failed. Please try again.') {
      setOperationState('error');
      setOperationMessage('Purchase failed. Please try again.');
    }
  }, [isStrictFailure, operationMessage, operationState]);

  useEffect(() => {
    const shouldWatchdog = operationState === 'purchasing' || operationState === 'restoring' || operationState === 'verifying';
    if (shouldWatchdog) {
      if (operationTimerRef.current) {
        clearTimeout(operationTimerRef.current);
      }
      const watchdogMs = operationState === 'verifying' ? 95000 : 45000;
      operationTimerRef.current = setTimeout(() => {
        setOperationState('error');
        setOperationMessage('This is taking longer than expected. Please try again.');
      }, watchdogMs);
    } else if (operationTimerRef.current) {
      clearTimeout(operationTimerRef.current);
      operationTimerRef.current = null;
    }

    return () => {
      if (operationTimerRef.current) {
        clearTimeout(operationTimerRef.current);
        operationTimerRef.current = null;
      }
    };
  }, [operationState]);

  const handleRetryLoadProducts = async () => {
    try {
      await retryLoadProducts();
    } catch (err) {
      logger.error('[Paywall] Error in handleRetryLoadProducts:', err);
    }
  };


  // STEP 8: TestFlight checklist executed on paywall focus
  useFocusEffect(
    useCallback(() => {
      logger.log('[Paywall] Screen focused', {
        connectionStatus,
        productsCount: products?.length || 0,
        isLoadingProducts,
        isReady,
        productsLoadError,
      });
      
      // STEP 8: Final TestFlight checklist
      const checklist: string[] = [];
      const reasons: string[] = [];
      
      // Check 1: connectionStatus === connected
      if (connectionStatus !== 'connected') {
        reasons.push(`connectionStatus: ${connectionStatus} (expected: connected)`);
      } else {
        checklist.push('✓ connectionStatus === connected');
      }
      
      // Check 2: products.length === 2
      if (!products || products.length !== 2) {
        reasons.push(`products.length: ${products?.length || 0} (expected: 2)`);
      } else {
        checklist.push('✓ products.length === 2');
      }
      
      // Check 3: SKUs include monthly + yearly
      const productIds = products?.map(p => p?.productId).filter((id): id is string => id !== null && id !== undefined) || [];
      const hasMonthly = productIds.includes(MONTHLY_PRODUCT_ID);
      const hasYearly = productIds.includes(YEARLY_PRODUCT_ID);
      if (!hasMonthly || !hasYearly) {
        reasons.push(`SKUs missing: monthly=${hasMonthly}, yearly=${hasYearly}`);
      } else {
        checklist.push('✓ SKUs include monthly + yearly');
      }
      
      // Check 4: each product has localizedPrice non-empty OR fallback price non-empty
      const pricesValid = products?.every(p => {
        const hasLocalizedPrice = p?.localizedPrice && p.localizedPrice.trim() !== '';
        const hasPrice = p?.price && p.price.trim() !== '';
        return hasLocalizedPrice || hasPrice;
      }) || false;
      if (!pricesValid && products && products.length > 0) {
        reasons.push('Some products missing price (localizedPrice or price)');
      } else if (products && products.length > 0) {
        checklist.push('✓ All products have prices');
      }
      
      // Check 5: canAttemptPurchase true when ready (now consistent with isReady)
      if (isReady && canAttemptPurchase) {
        checklist.push('✓ canAttemptPurchase === true when ready');
      }
      
      // TASK 7: Preflight health check - log and show user-facing error if failed
      if (reasons.length > 0) {
        logger.warn('[Paywall] IAP Health Check Failed', { reasons, checklist });
        try {
          diagEvent('iap_health_failed', {
            reasons,
            checklist,
            connectionStatus,
            productsCount: products?.length || 0,
            productIds,
            isReady,
            canAttemptPurchase,
          });
        } catch (e) {
          // Silently fail if diagnostics logging fails
        }
        // TASK 7: Set health check error state for user-facing error display
        setHealthCheckFailed(true);
        setHealthCheckReasons(reasons);
      } else {
        logger.log('[Paywall] IAP Health Check Passed', { checklist });
        setHealthCheckFailed(false);
        setHealthCheckReasons([]);
      }
      
      // Diagnostic log before rendering price cards
      if (products && Array.isArray(products) && products.length > 0) {
        const productIdentifiers = products.map((p: any) => p?.productId).filter((id): id is string => id !== null && id !== undefined);
        const hasMonthly = monthlyProduct !== null;
        const hasYearly = yearlyProduct !== null;
        
        diagEvent('premium_screen_products', {
          products: products.map((p: any) => {
            return {
              productId: p?.productId || '—',
              price: (p && p.localizedPrice) ? String(p.localizedPrice) : '—',
              currency: (p && p.currency) ? String(p.currency) : '—',
              title: (p && p.title) ? String(p.title) : 'Livra+',
              description: (p && p.description) ? String(p.description) : '—',
            };
          }),
          mappingStatus: {
            monthlyFound: hasMonthly,
            yearlyFound: hasYearly,
            allProductIds: productIdentifiers,
            expectedSkus: [MONTHLY_PRODUCT_ID, YEARLY_PRODUCT_ID],
          },
        });
        
        // Log warning if products exist but mapping failed
        if (!hasMonthly || !hasYearly) {
          logger.warn('[Paywall] Product mapping incomplete', {
            productsReturned: productIdentifiers,
            monthlyFound: hasMonthly,
            yearlyFound: hasYearly,
          });
          try {
            diagEvent('paywall_sku_mapping_failed', {
              attemptedSku: !hasMonthly ? MONTHLY_PRODUCT_ID : YEARLY_PRODUCT_ID,
              availableIdentifiers: productIdentifiers,
              expectedSkus: [MONTHLY_PRODUCT_ID, YEARLY_PRODUCT_ID],
              reason: !hasMonthly && !hasYearly ? 'both_missing' : !hasMonthly ? 'monthly_missing' : 'yearly_missing',
            });
          } catch (e) {
            // Silently fail if diagnostics logging fails
          }
        }
      }
    }, [connectionStatus, products, isLoadingProducts, isReady, productsLoadError, monthlyProduct, yearlyProduct, canAttemptPurchase])
  );

  // Early return for loading state
  if (isLoadingProducts || connectionStatus === 'connecting') {
    return (
      <SafeAreaView style={styles.containerDark}>
        <TouchableOpacity
          style={styles.closeBtn}
          onPress={() => router.back()}
          disabled={purchaseInProgress}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Feather name="x" size={22} color={tokenColors.inkInverseMuted} />
        </TouchableOpacity>
        <View style={styles.loadingCenter}>
          <ActivityIndicator size="small" color={tokenColors.mintLight} />
          <Text style={styles.loadingTxt}>
            {isLoadingProducts ? 'Loading...' : 'Connecting to store...'}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const PRO_FEATURE_LABELS = [
    'Unlimited marks and goals',
    'Cloud sync across all devices',
    'CSV & PDF export',
    'Priority support',
    'Future features, always included',
  ];

  const displayPrice =
    (selectedPlan === 'monthly'
      ? monthlyPrice
      : yearlyPrice) || '$9.99';

  return (
    <SafeAreaView style={styles.containerDark}>
      {/* Close button */}
      <TouchableOpacity
        style={styles.closeBtn}
        onPress={() => router.back()}
        disabled={purchaseInProgress}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      >
        <Feather name="x" size={22} color={tokenColors.inkInverseMuted} />
      </TouchableOpacity>

      <ScrollView
        contentContainerStyle={styles.darkContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Logo + Wordmark */}
        <View style={styles.logoWrap}>
          <SvgLogo color={tokenColors.inkInverse} width={48} height={24} />
          <LivraWordmark
            color={tokenColors.inkInverse}
            fontSize={24}
            letterSpacing={6}
          />
        </View>

        {/* Tagline */}
        <TouchableOpacity onPress={handleTitleTap} activeOpacity={1}>
          <Text style={styles.darkTagline}>Go further.</Text>
        </TouchableOpacity>

        {/* Feature list */}
        <View style={styles.featureListDark}>
          {PRO_FEATURE_LABELS.map((feat) => (
            <View key={feat} style={styles.featureRowDark}>
              <Feather name="check" size={16} color={tokenColors.mint} />
              <Text style={styles.featureTextDark}>{feat}</Text>
            </View>
          ))}
        </View>

        {/* Divider */}
        <View style={styles.dividerDark} />

        {/* Price section */}
        <SectionLabel
          color={tokenColors.inkInverseMuted}
          style={styles.sectionLabelCenter}
        >
          ONE-TIME PURCHASE
        </SectionLabel>

        <Text style={styles.priceDisplay}>{displayPrice}</Text>
        <Text style={styles.noSubText}>No subscription. Ever.</Text>

        {!isNativeStorePurchasesSupported() && (
          <Text style={[styles.noSubText, { marginTop: spacing.sm, fontSize: 12 }]}>
            Store purchases work only in a development build or TestFlight.
          </Text>
        )}

        {/* Status / error messages */}
        {isStrictFailure && operationState === 'error' && (
          <Text style={styles.errorTxtDark}>
            {operationMessage || 'Purchase failed. Please try again.'}
          </Text>
        )}
        {(operationMessage || lastError) && !productsLoadError && !isStrictFailure && (
          <Text style={styles.statusTxtDark}>{operationMessage || lastError}</Text>
        )}
        {healthCheckFailed && !isLoadingProducts && (
          <Text style={styles.errorTxtDark}>
            {healthCheckReasons[0] || 'Unable to load subscription options. Check your connection.'}
          </Text>
        )}
        {productsLoadError && !isLoadingProducts && !healthCheckFailed && supportModeEnabled && (
          <Text style={styles.errorTxtDark}>
            {lastError || 'Unable to load subscription options. Please try again.'}
          </Text>
        )}

        {/* Purchase / manage button */}
        <View style={styles.purchaseBtnWrap}>
          {isSubscribed ? (
            <TouchableOpacity
              style={styles.purchaseBtn}
              onPress={handleManageSubscription}
            >
              <Text style={styles.purchaseBtnText}>Manage Livra Pro</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.purchaseBtn, (buttonDisabled || purchaseInProgress) && { opacity: 0.6 }]}
              onPress={handlePurchase}
              disabled={buttonDisabled || purchaseInProgress}
              activeOpacity={0.8}
            >
              {purchaseInProgress ? (
                <ActivityIndicator size="small" color={tokenColors.forest} />
              ) : (
                <Text style={styles.purchaseBtnText}>
                  {!isReady
                    ? 'Initializing...'
                    : connectionStatus !== 'connected'
                    ? 'Store Not Available'
                    : !selectedProduct || !selectedPrice
                    ? 'Unlock Livra Pro'
                    : `Unlock Livra Pro — ${displayPrice}`}
                </Text>
              )}
            </TouchableOpacity>
          )}
        </View>

        {/* Retry verification */}
        {isTransientState && !isAlreadyOwned && (
          <TouchableOpacity
            style={styles.restoreTouchable}
            onPress={handleRetryVerification}
          >
            <Text style={styles.restoreText}>Retry Verification</Text>
          </TouchableOpacity>
        )}

        {/* Restore */}
        {!isSubscribed && (
          <TouchableOpacity
            style={styles.restoreTouchable}
            onPress={handleRestore}
            disabled={purchaseInProgress || isLoadingProducts}
          >
            <Text style={[styles.restoreText, (purchaseInProgress || isLoadingProducts) && { opacity: 0.4 }]}>
              Restore Purchase
            </Text>
          </TouchableOpacity>
        )}

        {/* Restore message */}
        {restoreMessage && (
          <Text
            style={[
              styles.statusTxtDark,
              { color: restoreMessageType === 'error' ? '#F87171' : tokenColors.mintLight },
            ]}
          >
            {restoreMessage}
          </Text>
        )}

        {/* Legal links */}
        <View style={styles.legalRowDark}>
          <TouchableOpacity onPress={() => router.push('/legal/privacy-policy' as any)}>
            <Text style={styles.legalTxtDark}>Privacy Policy</Text>
          </TouchableOpacity>
          <Text style={styles.legalSepDark}> · </Text>
          <TouchableOpacity onPress={() => router.push('/legal/terms-and-conditions' as any)}>
            <Text style={styles.legalTxtDark}>Terms & Conditions</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.copyrightDark}>
          © {new Date().getFullYear()} Livra
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

/**
 * Error Details Component - Expandable error information
 */
function ErrorDetails({
  error,
  connectionStatus,
  onRetry,
  themeColors,
  showDiagnostics,
}: {
  error: string | null;
  connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error';
  onRetry: () => void;
  themeColors: any;
  showDiagnostics: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [diagnostics, setDiagnostics] = useState<any>(null);

  useEffect(() => {
    if (!showDiagnostics) return;
    const loadDiagnostics = async () => {
      try {
        const managerDiag = getIapService().getDiagnostics();
        setDiagnostics({
          manager: managerDiag,
          exports: managerDiag.exportDiagnostics,
        });
      } catch (err) {
        logger.error('[Paywall] Error loading diagnostics:', err);
      }
    };
    loadDiagnostics();
  }, [showDiagnostics]);

  return (
    <Card
      backgroundColor={applyOpacity(themeColors.error, 0.1)}
      borderColor={themeColors.error}
      borderRadiusKey="md"
      paddingKey="md"
      style={[styles.noticeCardMargin, { marginTop: spacing.sm }]}
    >
      <AppText variant="body" style={[styles.errorText, { color: themeColors.error }]}>
        {error || 'Unable to load subscription options. Please check your connection and try again.'}
      </AppText>
      <PrimaryButton
        size="compact"
        onPress={onRetry}
        backgroundColor={themeColors.accent.primary}
        indicatorColor={themeColors.text}
        shadowVariant="none"
        style={{ marginTop: spacing.md }}
        accessibilityLabel="Retry loading subscriptions"
      >
        <AppText variant="body" style={{ color: themeColors.text, fontWeight: fontWeight.semibold }}>
          Retry Loading Subscriptions
        </AppText>
      </PrimaryButton>
      
      {/* Expandable Details */}
      {showDiagnostics && (
        <TouchableOpacity
          style={styles.detailsToggle}
          onPress={() => setExpanded(!expanded)}
        >
          <Text style={[styles.detailsToggleText, { color: themeColors.textSecondary }]}>
            {expanded ? 'Hide Details' : 'Show Details'}
          </Text>
        </TouchableOpacity>
      )}

      {showDiagnostics && expanded && diagnostics && (
        <View style={[styles.detailsContainer, { backgroundColor: themeColors.surface }]}>
          <Text style={[styles.detailsTitle, { color: themeColors.text }]}>Diagnostics</Text>
          
          <View style={styles.detailsSection}>
            <Text style={[styles.detailsLabel, { color: themeColors.textSecondary }]}>
              Connection Status:
            </Text>
            <Text style={[styles.detailsValue, { color: themeColors.text }]}>
              {diagnostics.manager.state.connectionStatus}
            </Text>
          </View>

          <View style={styles.detailsSection}>
            <Text style={[styles.detailsLabel, { color: themeColors.textSecondary }]}>
              Products Loaded:
            </Text>
            <Text style={[styles.detailsValue, { color: themeColors.text }]}>
              {diagnostics.manager.state.products.length} / 2
            </Text>
          </View>

          <View style={styles.detailsSection}>
            <Text style={[styles.detailsLabel, { color: themeColors.textSecondary }]}>
              Export Validation:
            </Text>
            <Text style={[styles.detailsValue, { 
              color: diagnostics.exports?.requiredExportsPresent ? themeColors.success : themeColors.error 
            }]}>
              {diagnostics.exports?.requiredExportsPresent ? '✓ Passed' : '✕ Failed'}
            </Text>
          </View>

          {!diagnostics.exports?.requiredExportsPresent && diagnostics.exports?.missing && diagnostics.exports.missing.length > 0 && (
            <View style={styles.detailsSection}>
              <Text style={[styles.detailsLabel, { color: themeColors.textSecondary }]}>
                Missing Exports:
              </Text>
              <Text style={[styles.detailsValue, { color: themeColors.error }]}>
                {diagnostics.exports.missing.join(', ') || 'None'}
              </Text>
            </View>
          )}

          <View style={styles.detailsSection}>
            <Text style={[styles.detailsLabel, { color: themeColors.textSecondary }]}>
              Bundle ID:
            </Text>
            <Text style={[styles.detailsValue, { color: themeColors.text }]}>
              {diagnostics.manager.bundleId}
            </Text>
          </View>

          <View style={styles.detailsSection}>
            <Text style={[styles.detailsLabel, { color: themeColors.textSecondary }]}>
              Product IDs Configured:
            </Text>
            <Text style={[styles.detailsValue, { color: themeColors.text }]}>
              {diagnostics.manager.productIdsConfigured.join(', ')}
            </Text>
          </View>

          {diagnostics.manager.state.lastError && (
            <View style={styles.detailsSection}>
              <Text style={[styles.detailsLabel, { color: themeColors.textSecondary }]}>
                Last Error:
              </Text>
              <Text style={[styles.detailsValue, { color: themeColors.error }]}>
                {diagnostics.manager.state.lastError.code}: {diagnostics.manager.state.lastError.message}
              </Text>
            </View>
          )}
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  // ── Dark paywall container ──
  containerDark: {
    flex: 1,
    backgroundColor: tokenColors.forest,
  },
  closeBtn: {
    position: 'absolute',
    top: spacing.xl + spacing.lg,
    right: spacing.lg,
    zIndex: 10,
    padding: spacing.xs,
  },
  loadingCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  loadingTxt: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: tokenColors.inkInverseMuted,
  },
  darkContent: {
    paddingTop: spacing.xxl + spacing.xxl,
    paddingBottom: spacing.xxl,
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
  },
  logoWrap: {
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  darkTagline: {
    fontFamily: fonts.serifItalic,
    fontSize: 28,
    color: tokenColors.inkInverse,
    textAlign: 'center',
    marginTop: spacing.lg,
    marginBottom: spacing.xl,
  },
  featureListDark: {
    width: '100%',
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  featureRowDark: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  featureTextDark: {
    fontFamily: fonts.sans,
    fontSize: 15,
    color: tokenColors.inkInverse,
    flex: 1,
  },
  dividerDark: {
    height: 1,
    backgroundColor: tokenColors.forestLight,
    width: '100%',
    marginVertical: spacing.xl,
    marginHorizontal: spacing.xl,
  },
  sectionLabelCenter: {
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  priceDisplay: {
    fontFamily: fonts.serif,
    fontSize: 56,
    color: tokenColors.inkInverse,
    textAlign: 'center',
    marginTop: spacing.sm,
    lineHeight: 64,
  },
  noSubText: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: tokenColors.inkInverseMuted,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  purchaseBtnWrap: {
    width: '100%',
    marginTop: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
  purchaseBtn: {
    backgroundColor: tokenColors.surface,
    height: 56,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  purchaseBtnText: {
    fontFamily: fonts.sansMedium,
    fontSize: 15,
    color: tokenColors.forest,
  },
  restoreTouchable: {
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  restoreText: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: tokenColors.inkInverseMuted,
    textAlign: 'center',
  },
  errorTxtDark: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: '#F87171',
    textAlign: 'center',
    marginTop: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  statusTxtDark: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: tokenColors.mintLight,
    textAlign: 'center',
    marginTop: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  legalRowDark: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xl,
    flexWrap: 'wrap',
  },
  legalTxtDark: {
    fontFamily: fonts.sans,
    fontSize: 12,
    color: tokenColors.inkInverseMuted,
    textDecorationLine: 'underline',
    paddingHorizontal: spacing.xs,
  },
  legalSepDark: {
    fontFamily: fonts.sans,
    fontSize: 12,
    color: tokenColors.inkInverseMuted,
  },
  copyrightDark: {
    fontFamily: fonts.sans,
    fontSize: 11,
    color: tokenColors.inkInverseMuted,
    textAlign: 'center',
    marginTop: spacing.md,
    marginBottom: spacing.xl,
  },
  // Legacy styles (used by ErrorDetails component)
  noticeCardMargin: {
    marginBottom: spacing.md,
  },
  errorText: {
    fontSize: fontSize.sm,
    textAlign: 'center',
    marginBottom: spacing.xs,
    lineHeight: 20,
  },
  errorHint: {
    fontSize: fontSize.xs,
    textAlign: 'center',
    lineHeight: 16,
  },
  detailsToggle: {
    padding: spacing.sm,
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  detailsToggleText: {
    fontSize: fontSize.sm,
    textDecorationLine: 'underline',
  },
  detailsContainer: {
    marginTop: spacing.sm,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    gap: spacing.xs,
  },
  detailsTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    marginBottom: spacing.xs,
  },
  detailsSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  detailsLabel: {
    fontSize: fontSize.sm,
    flex: 1,
  },
  detailsValue: {
    fontSize: fontSize.sm,
    flex: 1,
    textAlign: 'right',
    fontFamily: 'monospace',
  },
});

// Error Boundary Fallback Component with Retry
function PaywallErrorFallback({ onRetry }: { onRetry: () => void }) {
  return (
    <SafeAreaView style={styles.containerDark}>
      <View style={styles.loadingCenter}>
        <Text style={[styles.noSubText, { marginBottom: spacing.md }]}>
          Unable to load subscription options
        </Text>
        <TouchableOpacity style={styles.purchaseBtn} onPress={onRetry}>
          <Text style={styles.purchaseBtnText}>Try Again</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

// TASK 2: Export with Error Boundary wrapper - NO duplicate hook call
// PaywallScreenContent already calls useIapSubscriptions, so we pass retryLoadProducts via props
export default function PaywallScreen() {
  // TASK 2: Remove duplicate hook call - PaywallScreenContent already uses it
  // Pass retryLoadProducts to ErrorBoundary fallback via closure
  const handleRetry = useCallback(() => {
    // ErrorBoundary fallback will call IAP service retry directly
    // since we can't access the hook here without duplicating it
    try {
      getIapService().retryLoadProducts();
    } catch (err) {
      logger.error('[Paywall] Error in ErrorBoundary retry:', err);
    }
  }, []);

  return (
    <ErrorBoundary
      fallback={<PaywallErrorFallback onRetry={handleRetry} />}
    >
      <PaywallScreenContent />
    </ErrorBoundary>
  );
}
