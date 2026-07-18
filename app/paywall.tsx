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
import {
  X,
  Flag,
  InfinityIcon,
  Sparkle,
  ShareNetwork,
  Heart,
  ChartBar,
  type Icon,
} from 'phosphor-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import Constants from 'expo-constants';
import {
  spacing,
  borderRadius,
  fontSize,
  fontWeight,
  shadow,
  themedColors,
  fonts,
  headerControl,
  headerControlBoxTrailing,
  categoryAccents,
} from '../theme/tokens';
import { useEffectiveTheme } from '../state/uiSlice';
import { useIapSubscriptions } from '../hooks/useIapSubscriptions';
import { MONTHLY_PRODUCT_ID, YEARLY_PRODUCT_ID } from '../lib/iap/iap';
import { parseLocalizedPrice, priceToNumber } from '../lib/iap/price';
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
import { capture } from '../lib/analytics/posthog';
import { ANALYTICS_EVENTS } from '../lib/analytics/events';
import { AppText } from '../components/Typography';
import { Card, PrimaryButton } from '../components/ui';
import { SvgLogo } from '../components/ui/SvgLogo';

// Locked Livra+ split — list only features a subscriber can use today (no dead-ends).
// Mark reordering and pace projection are built but not yet wired into a screen, so they
// are intentionally omitted here and added when their entry points ship (Phase 5 audit §5).
// QC5-D: each point carries its own accent (founder: "add some colors to the
// icons"). Sanctioned hues only — `categoryAccents` + `ember` from Tokens, no new
// palette. Four of the six are semantic, not decorative: AI takes 'ember', whose
// documented role IS the AI voice; Apple Health takes the health accent; share
// cards creative; export deepWork. 'ember' is a KEY, not a hex, because ember is
// theme-dependent (#C8913F light / #D8A658 dark) and this list is module-level —
// it resolves against the live palette at render. The tile is the app's existing
// chip grammar: an accent glyph on an applyOpacity(accent, .14) wash of itself,
// the same shape the mark chips already use.
type FeatureAccent = string | 'ember';
const PRO_FEATURES: { icon: Icon; title: string; description: string; accent: FeatureAccent }[] = [
  { icon: Flag,         title: 'Unlimited Goals',      description: 'Run as many goals at once as you want, past the 2 free.', accent: categoryAccents.fitness },
  { icon: InfinityIcon, title: 'Unlimited Marks',      description: 'Add as many marks per goal as you need.',                 accent: categoryAccents.discipline },
  { icon: Sparkle,      title: 'AI Goal Plans',        description: 'Describe a goal; Livra drafts the marks to get there.',   accent: 'ember' },
  { icon: ShareNetwork, title: 'Custom Share Cards',    description: 'Restyle your finish. Themes, accent, and layout.',        accent: categoryAccents.creative },
  { icon: Heart,        title: 'Apple Health',         description: 'Sleep, Workout, Steps. Synced automatically.',            accent: categoryAccents.health },
  { icon: ChartBar,     title: 'CSV Export',           description: 'Your history is yours. Export anytime.',                  accent: categoryAccents.deepWork },
];

const SHIPPED_PREMIUM_FEATURE_TITLES = [
  'Unlimited Goals',
  'Unlimited Marks',
  'AI Goal Plans',
  'Custom Share Cards',
  'Apple Health',
  'CSV Export',
];

type PlanType = 'monthly' | 'yearly';

/**
 * Locale-aware parse of a *formatted* price string (e.g. "$9.99", "9,99 €",
 * "1.234,56 €"). Strips currency symbols/letters/spaces, then infers the
 * decimal separator as the last '.' or ',' and treats the other as a group
 * separator. Returns 0 on failure (never NaN).
 */

function PaywallScreenContent() {
  const iapService = getIapService();
  const theme = useEffectiveTheme();
  const c = themedColors(theme);
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
    capture(ANALYTICS_EVENTS.PAYWALL_VIEWED);
  }, []);

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
        // Diagnostics are telemetry only — invoked for any internal tracking
        // side effects, but the result is intentionally not used to gate purchases.
        getIapService().getDiagnostics();
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
  
  // Calculate monthly equivalent for yearly plan - locale-safe numeric parse
  // (prefers the raw numeric `price` field; falls back to locale-aware parsing
  // of the localized string so comma-decimal/grouped currencies stay correct).
  const yearlyPriceAsNumber = priceToNumber(yearlyProduct?.price, yearlyProduct?.localizedPrice);
  const monthlyPriceAsNumber = priceToNumber(monthlyProduct?.price, monthlyProduct?.localizedPrice);

  // Safe division with NaN checks
  const monthlyEquivalent = (yearlyPriceAsNumber > 0 && !isNaN(yearlyPriceAsNumber))
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
          // Client-side signal only — best-effort, not the revenue source of truth
          // (App Store/Play server receipts are). See analytics decisions log.
          capture(ANALYTICS_EVENTS.SUBSCRIPTION_STARTED, { plan: selectedPlan, product_id: productId });
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
          setRestoreMessage('Restored. Entitlements syncing, try again in a moment.');
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
        router.replace('/(tabs)/focus');
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
      <SafeAreaView style={[styles.container, { backgroundColor: c.linen }]}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.header}>
            <TouchableOpacity
              onPress={() => router.back()}
              disabled={purchaseInProgress}
              style={[styles.headerBtn, { opacity: purchaseInProgress ? 0.5 : 1 }]}
            >
              <X size={28} color={c.inkMid} weight="regular" />
            </TouchableOpacity>
          </View>
          <View style={styles.loadingBlock}>
            {/* QC5-D: SvgLogo's default is primitiveColors.forest — the LIGHT
                palette's hex, hardcoded — so on dark this drew dark-green on a
                dark linen and all but vanished. Every other caller in the app
                already passes this theme-aware pair; the paywall was the only
                one leaning on the default. */}
            <SvgLogo width={48} height={48} color={isDark ? c.inkDark : c.forest} />
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color={c.forest} />
              <Text style={[styles.loadingText, { color: c.inkMid }]}>
                {isLoadingProducts ? 'Loading subscription options...' : 'Connecting to store...'}
              </Text>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: c.linen }]}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => router.back()}
            disabled={purchaseInProgress}
            style={[styles.headerBtn, { opacity: purchaseInProgress ? 0.5 : 1 }]}
          >
            <X size={28} color={c.inkMid} weight="regular" />
          </TouchableOpacity>
        </View>

        {/* Hero + title — structural match to reference */}
        <View style={styles.titleSection}>
          {/* QC5-D: founder — "the logo shown there should be white not green."
              White needs something to sit on: the wrap was `c.surface` (linen),
              where a white mark would be invisible. So the disc carries it — the
              app's own forest, with the logomark in inkInverse. Forest is
              structure, which is exactly what this tile is. */}
          <View
            style={[
              styles.heroIconWrap,
              {
                backgroundColor: c.forest,
                borderColor: applyOpacity(c.forest, 0.9),
              },
            ]}
          >
            <SvgLogo width={48} height={48} color={c.inkInverse} />
          </View>
          <TouchableOpacity onPress={handleTitleTap} activeOpacity={1}>
            <Text style={[styles.title, { color: c.inkDark }]}>Livra+</Text>
          </TouchableOpacity>
          <Text style={[styles.subtitle, { color: c.inkMid }]}>
            Your history and stats are always free. Livra+ adds the room and tools to finish more.
          </Text>
          {!isNativeStorePurchasesSupported() && (
            <View
              style={[
                styles.devEnvBanner,
                {
                  borderColor: c.borderMid,
                  backgroundColor: c.surface,
                },
              ]}
              accessibilityRole="text"
            >
              <AppText variant="body" style={[styles.devEnvBannerText, { color: c.inkMid }]}>
                Store purchases and restore work only in a development build or TestFlight, not in Expo Go or
                the browser.
              </AppText>
            </View>
          )}
        </View>

        {/* Features */}
        <View style={styles.featuresList}>
          {PRO_FEATURES.map((feature, index) => {
            // 'ember' is a key, not a hex — resolve it against the live palette.
            const accent = feature.accent === 'ember' ? c.ember : feature.accent;
            return (
            <View
              key={`feature-${index}-${feature.title}`}
              style={[
                styles.featureItem,
                {
                  backgroundColor: c.surface,
                  borderColor: c.borderMid,
                },
              ]}
            >
              <View
                style={[
                  styles.featureIcon,
                  { backgroundColor: applyOpacity(accent, isDark ? 0.22 : 0.14) },
                ]}
              >
                <feature.icon size={26} color={accent} weight="duotone" />
              </View>
              <View style={styles.featureText}>
                <AppText variant="body" style={[styles.featureTitle, { color: c.inkDark }]}>
                  {feature.title}
                </AppText>
                <AppText variant="body" style={[styles.featureDescription, { color: c.inkMid }]}>
                  {feature.description}
                </AppText>
              </View>
            </View>
            );
          })}
        </View>

        {/* Pricing Selection - Only show when products are loaded and connection is ready */}
        {connectionStatus === 'connected' && !isLoadingProducts && products && Array.isArray(products) && products.length > 0 && (
          <View style={styles.pricingContainer}>
            {/* Monthly Plan Option */}
            <TouchableOpacity
              style={[
                styles.planOption,
                { 
                  backgroundColor: c.surface,
                  borderColor: selectedPlan === 'monthly' ? c.accent : c.borderMid,
                  borderWidth: selectedPlan === 'monthly' ? 2 : 1,
                },
                selectedPlan === 'monthly' && shadow.md,
                isSubscribed && styles.disabledPlan,
              ]}
              onPress={() => setSelectedPlan('monthly')}
              activeOpacity={isSubscribed ? 1 : 0.7}
              disabled={isSubscribed}
            >
              <View style={styles.planHeader}>
                <Text style={[styles.planLabel, { color: c.inkDark }]}>Monthly</Text>
                {selectedPlan === 'monthly' && (
                  <View style={[styles.selectedBadge, { backgroundColor: c.forest }]}>
                    <Text style={[styles.selectedBadgeText, { color: c.inkInverse }]}>✓</Text>
                  </View>
                )}
              </View>
              {monthlyPrice && monthlyPrice.trim() !== '' ? (
                <Text style={[styles.planPrice, { color: c.inkDark }]}>
                  {monthlyPrice} <Text style={styles.planPeriod}>/ month</Text>
                </Text>
              ) : pricesMissing || isLoadingProducts ? (
                <Text style={[styles.planPrice, { color: c.inkMid }]}>
                  Loading price… <Text style={styles.planPeriod}>/ month</Text>
                </Text>
              ) : (
                <Text style={[styles.planPrice, { color: c.inkMid }]}>
                  Price unavailable <Text style={styles.planPeriod}>/ month</Text>
                </Text>
              )}
            </TouchableOpacity>

            {/* Yearly Plan Option */}
            <TouchableOpacity
              style={[
                styles.planOption,
                { 
                  backgroundColor: c.surface,
                  borderColor: selectedPlan === 'yearly' ? c.accent : c.borderMid,
                  borderWidth: selectedPlan === 'yearly' ? 2 : 1,
                },
                selectedPlan === 'yearly' && shadow.md,
                isSubscribed && styles.disabledPlan,
              ]}
              onPress={() => setSelectedPlan('yearly')}
              activeOpacity={isSubscribed ? 1 : 0.7}
              disabled={isSubscribed}
            >
              <View style={styles.planHeader}>
                <View style={styles.planHeaderLeft}>
                  <Text style={[styles.planLabel, { color: c.inkDark }]}>Yearly</Text>
                  <View style={[styles.bestValueBadge, { backgroundColor: c.forest }]}>
                    <Text style={[styles.bestValueText, { color: c.inkInverse }]}>Best value</Text>
                  </View>
                </View>
                {selectedPlan === 'yearly' && (
                  <View style={[styles.selectedBadge, { backgroundColor: c.forest }]}>
                    <Text style={[styles.selectedBadgeText, { color: c.inkInverse }]}>✓</Text>
                  </View>
                )}
              </View>
              {yearlyPrice && yearlyPrice.trim() !== '' ? (
                <>
                  <Text style={[styles.planPrice, { color: c.inkDark }]}>
                    {yearlyPrice} <Text style={styles.planPeriod}>/ year</Text>
                  </Text>
                  {pricePerMonth && pricePerMonth.trim() !== '' && savingsPercent > 0 && !isNaN(savingsPercent) && (
                    <Text style={[styles.planSavings, { color: c.inkMid }]}>
                      {pricePerMonth}/month • Save {savingsPercent}%
                    </Text>
                  )}
                </>
              ) : pricesMissing || isLoadingProducts ? (
                <Text style={[styles.planPrice, { color: c.inkMid }]}>
                  Loading price… <Text style={styles.planPeriod}>/ year</Text>
                </Text>
              ) : (
                <Text style={[styles.planPrice, { color: c.inkMid }]}>
                  Price unavailable <Text style={styles.planPeriod}>/ year</Text>
                </Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {isSubscribed && (
          <PrimaryButton
            onPress={handleManageSubscription}
            backgroundColor={c.forest}
            indicatorColor={c.inkInverse}
            shadowVariant="lg"
            style={{ marginBottom: spacing.md }}
            accessibilityLabel="Manage Livra+ subscription"
          >
            <AppText variant="button" style={{ color: c.inkInverse, fontWeight: fontWeight.bold }}>
              Manage Livra+
            </AppText>
          </PrimaryButton>
        )}

        {/* Loading State */}
        {isLoadingProducts && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color={c.forest} />
            <AppText variant="body" style={[styles.loadingText, { color: c.inkMid }]}>
              Loading subscription options...
            </AppText>
          </View>
        )}

        {/* TASK 7: Preflight health check error - show user-facing error */}
        {healthCheckFailed && !isLoadingProducts && (
          <Card
            backgroundColor={c.surface}
            borderColor={c.danger}
            borderRadiusKey="md"
            paddingKey="md"
            style={[styles.noticeCardMargin, { marginTop: spacing.sm }]}
          >
            <AppText variant="body" style={[styles.errorText, { color: c.danger, fontWeight: fontWeight.semibold }]}>
              Unable to load subscription options
            </AppText>
            <AppText variant="label" style={[styles.errorHint, { color: c.inkMid, marginTop: spacing.xs }]}>
              {healthCheckReasons.length > 0 
                ? healthCheckReasons[0] // Show first reason as user message
                : 'Please check your connection and try again.'}
            </AppText>
          </Card>
        )}

        {/* Error State - Products failed to load */}
        {productsLoadError && !isLoadingProducts && !healthCheckFailed && supportModeEnabled && (
          <ErrorDetails
            error={lastError}
            connectionStatus={connectionStatus}
            onRetry={handleRetryLoadProducts}
            showDiagnostics={supportModeEnabled}
          />
        )}

        {/* Purchase Button - Only show when products are loaded and connection is ready */}
        {connectionStatus === 'connected' && !isLoadingProducts && products && Array.isArray(products) && products.length > 0 && !isSubscribed && (
          <PrimaryButton
            onPress={handlePurchase}
            disabled={buttonDisabled}
            loading={purchaseInProgress}
            backgroundColor={c.forest}
            indicatorColor={c.inkInverse}
            shadowVariant="lg"
            style={{ marginBottom: spacing.md }}
            activeOpacity={0.8}
            accessibilityLabel="Continue with selected subscription plan"
          >
            {!isReady ? (
              <AppText variant="button" style={{ color: c.inkInverse, fontWeight: fontWeight.bold }}>Initializing...</AppText>
            ) : connectionStatus !== 'connected' ? (
              <AppText variant="button" style={{ color: c.inkInverse, fontWeight: fontWeight.bold }}>Store Not Available</AppText>
            ) : !selectedProduct ? (
              <AppText variant="button" style={{ color: c.inkInverse, fontWeight: fontWeight.bold }}>Select a Plan</AppText>
            ) : pricesMissing || (!selectedPrice || selectedPrice.trim() === '') ? (
              <AppText variant="button" style={{ color: c.inkInverse, fontWeight: fontWeight.bold }}>Loading price...</AppText>
            ) : (
              <AppText variant="button" style={{ color: c.inkInverse, fontWeight: fontWeight.bold }}>
                Start Livra+
                {selectedPrice && selectedPrice.trim() !== '' ? ` · ${selectedPrice}` : ''}
              </AppText>
            )}
          </PrimaryButton>
        )}

        {/* Operation Status / Error Display */}
        {isStrictFailure && operationState === 'error' && (
          <AppText variant="body" style={[styles.errorText, { color: c.danger, textAlign: 'center', marginTop: spacing.sm }]}>
            {operationMessage || 'Purchase failed. Please try again.'}
          </AppText>
        )}
        {(operationMessage || lastError) && !productsLoadError && !isStrictFailure && (
          <Card
            backgroundColor={c.surface}
            borderColor={
              operationState === 'subscribed'
                ? c.success
                : operationState === 'transient_error' || operationState === 'info'
                  ? c.accent
                  : c.danger
            }
            borderRadiusKey="md"
            paddingKey="md"
            style={[styles.noticeCardMargin, { marginTop: spacing.sm }]}
          >
            <AppText
              variant="body"
              style={[
                styles.errorText,
                {
                  color:
                    operationState === 'subscribed'
                      ? c.success
                      : operationState === 'transient_error' || operationState === 'info'
                        ? c.accent
                        : c.danger,
                  fontWeight: fontWeight.semibold,
                },
              ]}
            >
              {operationMessage || lastError}
            </AppText>
            {connectionStatus !== 'connected' && (
              <AppText variant="label" style={[styles.errorHint, { color: c.inkMid, marginTop: spacing.xs }]}>
                Please check your internet connection and try again.
              </AppText>
            )}
            {isTransientState && !isAlreadyOwned && (
              <PrimaryButton
                size="compact"
                onPress={handleRetryVerification}
                backgroundColor={c.forest}
                indicatorColor={c.inkInverse}
                shadowVariant="none"
                style={{ marginTop: spacing.md }}
                accessibilityLabel="Retry verification"
              >
                <AppText variant="body" style={{ color: c.inkInverse, fontWeight: fontWeight.semibold }}>
                  Retry Verification
                </AppText>
              </PrimaryButton>
            )}
            {isAlreadyOwned && !isSubscribed && (
              <PrimaryButton
                size="compact"
                onPress={handleManageSubscription}
                disabled={purchaseInProgress}
                backgroundColor={c.forest}
                indicatorColor={c.inkInverse}
                shadowVariant="none"
                style={{ marginTop: spacing.sm }}
                accessibilityLabel="Manage subscription"
              >
                <AppText variant="body" style={{ color: c.inkInverse, fontWeight: fontWeight.semibold }}>
                  Manage Subscription
                </AppText>
              </PrimaryButton>
            )}
          </Card>
        )}

        {/* Restore Button */}
        {!isSubscribed && !operationMessage && !lastError && !isStrictFailure && (
          <TouchableOpacity
            style={styles.restoreButton}
            onPress={handleRestore}
            disabled={purchaseInProgress || isLoadingProducts}
          >
            <AppText
              variant="body"
              style={[
                styles.restoreButtonText,
                {
                  color: c.inkMid,
                  opacity: purchaseInProgress || isLoadingProducts ? 0.5 : 1,
                },
              ]}
            >
              Restore Purchases
            </AppText>
          </TouchableOpacity>
        )}
        
        {/* STEP 5: Restore message display */}
        {restoreMessage && (
          <Card
            backgroundColor={
              restoreMessageType === 'success'
                ? applyOpacity(c.success, 0.15)
                : restoreMessageType === 'info'
                  ? applyOpacity(c.accent, 0.18)
                  : applyOpacity(c.danger, 0.15)
            }
            borderColor={
              restoreMessageType === 'success'
                ? c.success
                : restoreMessageType === 'info'
                  ? c.accent
                  : c.danger
            }
            borderRadiusKey="md"
            paddingKey="md"
            style={[styles.noticeCardMargin, { marginTop: spacing.sm }]}
          >
            <AppText
              variant="body"
              style={[
                styles.restoreMessageText,
                {
                  color:
                    restoreMessageType === 'success'
                      ? c.success
                      : restoreMessageType === 'info'
                        ? c.accent
                        : c.danger,
                },
              ]}
            >
              {restoreMessage}
            </AppText>
          </Card>
        )}


        {/* Common questions — reference layout */}
        <View style={styles.faq}>
          <View style={styles.faqRuleRow}>
            <View style={[styles.faqRule, { backgroundColor: c.borderMid }]} />
            <Text style={[styles.faqRuleLabel, { color: c.inkMuted }]}>
              COMMON QUESTIONS
            </Text>
            <View style={[styles.faqRule, { backgroundColor: c.borderMid }]} />
          </View>

          <View style={styles.faqItem}>
            <Text style={[styles.faqQuestion, { color: c.inkDark }]}>Does it work offline?</Text>
            <Text style={[styles.faqAnswer, { color: c.inkMid }]}>
              Yes. Tracking is local-first; sync runs when you are online.
            </Text>
          </View>

          <View style={styles.faqItem}>
            <Text style={[styles.faqQuestion, { color: c.inkDark }]}>How do I cancel?</Text>
            <Text style={[styles.faqAnswer, { color: c.inkMid }]}>
              Manage or cancel anytime in your App Store subscription settings.
            </Text>
          </View>
        </View>

        <View style={styles.legalLinks}>
          <TouchableOpacity onPress={() => router.push('/legal/privacy-policy')} style={styles.legalLink}>
            <Text style={[styles.legalLinkText, { color: c.inkMid }]}>Privacy Policy</Text>
          </TouchableOpacity>
          <Text style={[styles.legalSeparator, { color: c.inkMuted }]}> · </Text>
          <TouchableOpacity onPress={() => router.push('/legal/terms-and-conditions')} style={styles.legalLink}>
            <Text style={[styles.legalLinkText, { color: c.inkMid }]}>Terms & Conditions</Text>
          </TouchableOpacity>
        </View>

        <Text style={[styles.copyrightLine, { color: c.inkMuted }]}>
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
  showDiagnostics,
}: {
  error: string | null;
  connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error';
  onRetry: () => void;
  showDiagnostics: boolean;
}) {
  const theme = useEffectiveTheme();
  const c = themedColors(theme);
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
      backgroundColor={applyOpacity(c.danger, 0.1)}
      borderColor={c.danger}
      borderRadiusKey="md"
      paddingKey="md"
      style={[styles.noticeCardMargin, { marginTop: spacing.sm }]}
    >
      <AppText variant="body" style={[styles.errorText, { color: c.danger }]}>
        {error || 'Unable to load subscription options. Please check your connection and try again.'}
      </AppText>
      <PrimaryButton
        size="compact"
        onPress={onRetry}
        backgroundColor={c.forest}
        indicatorColor={c.inkInverse}
        shadowVariant="none"
        style={{ marginTop: spacing.md }}
        accessibilityLabel="Retry loading subscriptions"
      >
        <AppText variant="body" style={{ color: c.inkInverse, fontWeight: fontWeight.semibold }}>
          Retry Loading Subscriptions
        </AppText>
      </PrimaryButton>
      
      {/* Expandable Details */}
      {showDiagnostics && (
        <TouchableOpacity
          style={styles.detailsToggle}
          onPress={() => setExpanded(!expanded)}
        >
          <Text style={[styles.detailsToggleText, { color: c.inkMid }]}>
            {expanded ? 'Hide Details' : 'Show Details'}
          </Text>
        </TouchableOpacity>
      )}

      {showDiagnostics && expanded && diagnostics && (
        <View style={[styles.detailsContainer, { backgroundColor: c.surface }]}>
          <Text style={[styles.detailsTitle, { color: c.inkDark }]}>Diagnostics</Text>
          
          <View style={styles.detailsSection}>
            <Text style={[styles.detailsLabel, { color: c.inkMid }]}>
              Connection Status:
            </Text>
            <Text style={[styles.detailsValue, { color: c.inkDark }]}>
              {diagnostics.manager.state.connectionStatus}
            </Text>
          </View>

          <View style={styles.detailsSection}>
            <Text style={[styles.detailsLabel, { color: c.inkMid }]}>
              Products Loaded:
            </Text>
            <Text style={[styles.detailsValue, { color: c.inkDark }]}>
              {diagnostics.manager.state.products.length} / 2
            </Text>
          </View>

          <View style={styles.detailsSection}>
            <Text style={[styles.detailsLabel, { color: c.inkMid }]}>
              Export Validation:
            </Text>
            <Text style={[styles.detailsValue, { 
              color: diagnostics.exports?.requiredExportsPresent ? c.success : c.danger 
            }]}>
              {diagnostics.exports?.requiredExportsPresent ? '✓ Passed' : '✕ Failed'}
            </Text>
          </View>

          {!diagnostics.exports?.requiredExportsPresent && diagnostics.exports?.missing && diagnostics.exports.missing.length > 0 && (
            <View style={styles.detailsSection}>
              <Text style={[styles.detailsLabel, { color: c.inkMid }]}>
                Missing Exports:
              </Text>
              <Text style={[styles.detailsValue, { color: c.danger }]}>
                {diagnostics.exports.missing.join(', ') || 'None'}
              </Text>
            </View>
          )}

          <View style={styles.detailsSection}>
            <Text style={[styles.detailsLabel, { color: c.inkMid }]}>
              Bundle ID:
            </Text>
            <Text style={[styles.detailsValue, { color: c.inkDark }]}>
              {diagnostics.manager.bundleId}
            </Text>
          </View>

          <View style={styles.detailsSection}>
            <Text style={[styles.detailsLabel, { color: c.inkMid }]}>
              Product IDs Configured:
            </Text>
            <Text style={[styles.detailsValue, { color: c.inkDark }]}>
              {diagnostics.manager.productIdsConfigured.join(', ')}
            </Text>
          </View>

          {diagnostics.manager.state.lastError && (
            <View style={styles.detailsSection}>
              <Text style={[styles.detailsLabel, { color: c.inkMid }]}>
                Last Error:
              </Text>
              <Text style={[styles.detailsValue, { color: c.danger }]}>
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
  container: {
    flex: 1,
  },
  content: {
    padding: spacing.xl,
    // QC4-K: converge the close button's distance below the safe-area inset onto
    // the shared headerControl.topGap (was the spacing.xl page padding, 32).
    paddingTop: headerControl.topGap,
  },
  header: {
    alignItems: 'flex-end',
    marginBottom: spacing.md,
  },
  // QC4-K: 44pt close target (was hitSlop 12 on a 28pt icon = 52 wide but the
  // slop clipped against the header's own bounds).
  headerBtn: { ...headerControlBoxTrailing },
  titleSection: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  heroIconWrap: {
    width: 88,
    height: 88,
    borderRadius: borderRadius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  heroLogo: {
    width: '100%',
    height: '100%',
  },
  title: {
    fontSize: fontSize['3xl'],
    fontWeight: fontWeight.bold,
    marginBottom: spacing.sm,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: fontSize.base,
    textAlign: 'center',
    paddingHorizontal: spacing.lg,
    lineHeight: 22,
  },
  devEnvBanner: {
    marginTop: spacing.md,
    marginHorizontal: spacing.lg,
    padding: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  devEnvBannerText: {
    fontSize: fontSize.sm,
    textAlign: 'center',
    lineHeight: 20,
  },
  featuresList: {
    marginBottom: spacing.xl,
  },
  featureItem: {
    flexDirection: 'row',
    padding: spacing.md,
    borderRadius: borderRadius.card,
    marginBottom: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
  },
  featureIcon: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  featureText: {
    flex: 1,
    justifyContent: 'center',
  },
  featureTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    marginBottom: 2,
  },
  featureDescription: {
    fontSize: fontSize.sm,
  },
  pricingContainer: {
    marginBottom: spacing.lg,
    gap: spacing.md,
  },
  subscribedContainer: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  subscribedText: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
  },
  subscribedHint: {
    fontSize: fontSize.sm,
  },
  manageSubscriptionButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
  },
  manageSubscriptionText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  planOption: {
    padding: spacing.lg,
    borderRadius: borderRadius.xl,
    marginBottom: spacing.sm,
  },
  disabledPlan: {
    opacity: 0.6,
  },
  planHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  planHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  planLabel: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
  },
  bestValueBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  bestValueText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    textTransform: 'uppercase',
  },
  selectedBadge: {
    width: 24,
    height: 24,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedBadgeText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
  },
  planPrice: {
    fontSize: fontSize['3xl'],
    fontWeight: fontWeight.bold,
    marginBottom: spacing.xs,
  },
  planPeriod: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.normal,
  },
  planSavings: {
    fontSize: fontSize.sm,
  },
  purchaseButtonText: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
  },
  /** Margins for `Card` / notice blocks (border + padding live on `Card`) */
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
  loadingBlock: {
    alignItems: 'center',
    marginTop: spacing.xl,
    marginBottom: spacing.md,
    gap: spacing.lg,
  },
  loadingLogo: {
    width: 72,
    height: 72,
    borderRadius: borderRadius.lg,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  loadingText: {
    fontSize: fontSize.sm,
  },
  restoreButton: {
    padding: spacing.md,
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  restoreButtonText: {
    fontSize: fontSize.base,
  },
  restoreMessageText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    textAlign: 'center',
  },
  manageSubscriptionsButton: {
    padding: spacing.md,
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  manageSubscriptionsText: {
    fontSize: fontSize.sm,
    textDecorationLine: 'underline',
  },
  faq: {
    marginTop: spacing.xl,
  },
  faqRuleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  faqRule: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
  faqRuleLabel: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    letterSpacing: 1.4,
  },
  faqItem: {
    marginBottom: spacing.md,
  },
  faqQuestion: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    marginBottom: spacing.xs,
  },
  faqAnswer: {
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
  legalLinks: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    gap: spacing.xs,
    flexWrap: 'wrap',
  },
  copyrightLine: {
    fontSize: fontSize.xs,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  legalLink: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  legalLinkText: {
    fontSize: fontSize.sm,
    textDecorationLine: 'underline',
  },
  legalSeparator: {
    fontSize: fontSize.sm,
  },
  retryButton: {
    padding: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  retryButtonText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
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
    fontFamily: fonts.mono,
  },
});

// Error Boundary Fallback Component with Retry
function PaywallErrorFallback({ onRetry }: { onRetry: () => void }) {
  const theme = useEffectiveTheme();
  const c = themedColors(theme);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: c.linen }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <X size={28} color={c.inkMid} weight="regular" />
        </View>
        <View style={styles.loadingBlock}>
          {/* Same theme-aware pair as every other SvgLogo caller — see the note
              on the loading block above. */}
          <SvgLogo width={48} height={48} color={theme === 'dark' ? c.inkDark : c.forest} />
          <AppText variant="headline" style={[styles.title, { color: c.inkDark }]}>
            Unable to load subscription options
          </AppText>
          <AppText variant="body" style={[styles.loadingText, { color: c.inkMid }]}>
            Please check your connection and try again.
          </AppText>
          <PrimaryButton
            size="compact"
            onPress={onRetry}
            backgroundColor={c.forest}
            indicatorColor={c.inkInverse}
            shadowVariant="none"
            style={{ marginTop: spacing.md, alignSelf: 'stretch' }}
            accessibilityLabel="Try again"
          >
            <AppText variant="body" style={{ color: c.inkInverse, fontWeight: fontWeight.semibold }}>Try Again</AppText>
          </PrimaryButton>
        </View>
      </ScrollView>
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
