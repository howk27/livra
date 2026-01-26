import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Linking, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import Constants from 'expo-constants';
import { colors } from '../theme/colors';
import { spacing, borderRadius, fontSize, fontWeight, shadow } from '../theme/tokens';
import { useEffectiveTheme } from '../state/uiSlice';
import { useIapSubscriptions } from '../hooks/useIapSubscriptions';
import { MONTHLY_PRODUCT_ID, YEARLY_PRODUCT_ID } from '../lib/iap/iap';
import { logger } from '../lib/utils/logger';
import { IapManager } from '../lib/services/iap/IapManager';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { diagEvent, exportSupportBundle } from '../lib/debug/iapDiagnostics';
import { checkProStatus } from '../lib/iap/iap';

const PRO_FEATURES = [
  { icon: '∞', title: 'Unlimited Marks', description: 'Create as many marks as you need' },
  { icon: '📊', title: 'PDF & CSV Export', description: 'Export your data anytime' },
  { icon: '🎨', title: 'Premium Themes', description: 'Access all accent colors and themes' },
  { icon: '🎯', title: 'Icon Pack', description: 'More emojis and custom icons' },
  { icon: '🔔', title: 'Multiple Reminders', description: 'Set reminders for each mark' },
  { icon: '☁️', title: 'Cloud Backup', description: 'Automatic sync across all devices' },
];

type PlanType = 'monthly' | 'yearly';

function PaywallScreenContent() {
  const theme = useEffectiveTheme();
  const themeColors = colors[theme];
  const router = useRouter();
  const [selectedPlan, setSelectedPlan] = useState<PlanType>('monthly');
  
  // STEP 5: Restore message state
  const [restoreMessage, setRestoreMessage] = useState<string | null>(null);
  const [restoreMessageType, setRestoreMessageType] = useState<'success' | 'info' | 'error' | null>(null);
  
  // TASK 7: Preflight health check error state
  const [healthCheckFailed, setHealthCheckFailed] = useState(false);
  const [healthCheckReasons, setHealthCheckReasons] = useState<string[]>([]);

  // CRITICAL: Synchronous ref guard to prevent double-tap race condition
  // This must be defined before useIapSubscriptions hook to prevent crash
  const purchaseInProgressRef = useRef(false);

  // Hidden gesture for diagnostics (tap title 7 times within 3 seconds)
  const titleTapCount = useRef(0);
  const titleTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleTitleTap = async () => {
    titleTapCount.current += 1;

    // Clear existing timer
    if (titleTapTimer.current) {
      clearTimeout(titleTapTimer.current);
    }

    // Check if support bundle is enabled (TestFlight-safe)
    const enableSupportBundle = Constants.expoConfig?.extra?.enableSupportBundle === true;

    // If 7 taps reached:
    // - In __DEV__: open diagnostics screen
    // - In TestFlight (if enableSupportBundle): export support bundle
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
    isReady,
    isLoadingProducts,
    connectionStatus,
    isProUnlocked,
    productsLoadError,
    pricesMissing,
    listenersRegistered,
    retryLoadProducts,
  } = useIapSubscriptions();

  // Diagnostics telemetry only (not used for gating)
  useEffect(() => {
    if (__DEV__) {
      try {
        const diag = IapManager.getDiagnostics();
        // Diagnostics tracked but not used to gate purchases
      } catch (e) {
        // Silently fail - diagnostics are telemetry only
      }
    }
  }, [products, connectionStatus]);

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
  const canAttemptPurchase = isReady && !purchaseInProgress;

  // Terminal gate: Block purchase if selected product has no price
  const hasValidPrice = selectedPrice && selectedPrice.trim() !== '';
  const buttonDisabled = !canAttemptPurchase || purchaseInProgress || !hasValidPrice;

  // STEP 3: Remove double-authority purchase gating
  // Paywall guard is ONLY for UI spam prevention (1 second tap guard)
  // IapManager is the authoritative source for purchase state
  const handlePurchase = async () => {
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
    if (!selectedProduct) {
      logger.error('[Paywall] Purchase attempted without selected product');
      purchaseInProgressRef.current = false;
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
    try {
      await purchaseSubscription(productId);
    } catch (err: any) {
      // Normalize error via getIAPErrorMessage
      const { getIAPErrorMessage } = await import('../lib/iap/iap');
      const iapError = getIAPErrorMessage(err);
      
      // Surface error to user - never fail silently
      const userMessage = iapError.userMessage || 'Unable to start purchase. Please try again.';
      const supportCode = iapError.code || 'UNKNOWN';
      Alert.alert(
        'Purchase Failed',
        `${userMessage}\n\nSupport code: ${supportCode}`,
        [{ text: 'OK' }]
      );
      // Reset tap guard on error so user can retry after error is cleared
      purchaseInProgressRef.current = false;
    }
    // Note: Tap guard auto-resets after 1 second, or on error above
    // IapManager's purchaseInProgress state is authoritative and managed by IapManager
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
    
    try {
      const result = await restorePurchases();
      
      if (result.outcome === 'cancelled') {
        setRestoreMessage('Restore cancelled.');
        setRestoreMessageType('info');
      } else if (result.outcome === 'none_found') {
        setRestoreMessage('No active subscription found for this Apple ID.');
        setRestoreMessageType('info');
      } else if (result.outcome === 'success') {
        if (result.dbConfirmed === false) {
          setRestoreMessage('Restored. Entitlements syncing—try again in a moment.');
          setRestoreMessageType('info');
        } else {
          // Double-check DB on success for user confidence
          const isUnlocked = await checkProStatus();
          setRestoreMessage(isUnlocked ? 'Restored successfully.' : 'Restored. Entitlements syncing—try again in a moment.');
          setRestoreMessageType(isUnlocked ? 'success' : 'info');
        }
      } else {
        setRestoreMessage('Restore failed. Please try again.');
        setRestoreMessageType('error');
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
      
      // Clear message after 5 seconds
      setTimeout(() => {
        setRestoreMessage(null);
        setRestoreMessageType(null);
      }, 5000);
    }
  };

  const transientErrorCodes = new Set([
    'TRANSIENT_DB_PENDING',
    'TRANSIENT_RECEIPT_MISSING',
    'TRANSIENT_VERIFICATION_PENDING',
    'TRANSIENT_PURCHASE_TOKEN_MISSING',
  ]);
  const hasTransientError = lastErrorCode ? transientErrorCodes.has(lastErrorCode) : false;

  const handleRetryVerification = async () => {
    try {
      await IapManager.recoverNow();
      await checkProStatus();
    } catch (error) {
      logger.error('[Paywall] Retry verification failed', error);
    }
  };

  const handleRetryLoadProducts = async () => {
    try {
      await retryLoadProducts();
    } catch (err) {
      logger.error('[Paywall] Error in handleRetryLoadProducts:', err);
    }
  };

  // Auto-navigate back if purchase was successful
  // CRITICAL: Delay must be sufficient to ensure Apple Pay sheet has fully dismissed
  // before navigation occurs. Apple Pay dismissal animation can take up to 2-3 seconds.
  useEffect(() => {
    if (isProUnlocked && !purchaseInProgress) {
      // Extended delay to ensure Apple Pay sheet has fully dismissed
      // and purchase flow is completely finished before navigation
      const timer = setTimeout(() => {
        router.back();
      }, 3000); // Increased from 1500ms to 3000ms for safety
      return () => clearTimeout(timer);
    }
  }, [isProUnlocked, purchaseInProgress, router]);

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
              title: (p && p.title) ? String(p.title) : 'Livra Plus',
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
  if (isLoadingProducts || connectionStatus !== 'connected') {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.header}>
            <TouchableOpacity 
              onPress={() => router.back()}
              disabled={purchaseInProgress}
              style={{ opacity: purchaseInProgress ? 0.5 : 1 }}
            >
              <Text style={[styles.closeButton, { color: themeColors.textSecondary }]}>✕</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color={themeColors.primary} />
            <Text style={[styles.loadingText, { color: themeColors.textSecondary }]}>
              {isLoadingProducts ? 'Loading subscription options...' : 'Connecting to store...'}
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity 
            onPress={() => router.back()}
            disabled={purchaseInProgress}
            style={{ opacity: purchaseInProgress ? 0.5 : 1 }}
          >
            <Text style={[styles.closeButton, { color: themeColors.textSecondary }]}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* Title Section */}
        <View style={styles.titleSection}>
          <Text style={styles.proIcon}>⭐</Text>
          <TouchableOpacity onPress={handleTitleTap} activeOpacity={1}>
            <Text style={[styles.title, { color: themeColors.text }]}>Upgrade to Livra+</Text>
          </TouchableOpacity>
          <Text style={[styles.subtitle, { color: themeColors.textSecondary }]}>
            Unlock unlimited tracking potential
          </Text>
        </View>

        {/* Features List */}
        <View style={styles.featuresList}>
          {PRO_FEATURES && Array.isArray(PRO_FEATURES) && PRO_FEATURES.map((feature, index) => {
            if (!feature) return null;
            return (
              <View
                key={`feature-${index}-${feature.title || index}`}
                style={[styles.featureItem, { backgroundColor: themeColors.surface }]}
              >
                <View
                  style={[styles.featureIcon, { backgroundColor: themeColors.primary + '20' }]}
                >
                  <Text style={[styles.featureIconText, { color: themeColors.primary }]}>
                    {feature.icon || ''}
                  </Text>
                </View>
                <View style={styles.featureText}>
                  <Text style={[styles.featureTitle, { color: themeColors.text }]}>
                    {feature.title || ''}
                  </Text>
                  <Text style={[styles.featureDescription, { color: themeColors.textSecondary }]}>
                    {feature.description || ''}
                  </Text>
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
                  backgroundColor: themeColors.surface,
                  borderColor: selectedPlan === 'monthly' ? themeColors.primary : themeColors.border,
                  borderWidth: selectedPlan === 'monthly' ? 2 : 1,
                },
                selectedPlan === 'monthly' && shadow.md,
              ]}
              onPress={() => setSelectedPlan('monthly')}
              activeOpacity={0.7}
            >
              <View style={styles.planHeader}>
                <Text style={[styles.planLabel, { color: themeColors.text }]}>Monthly</Text>
                {selectedPlan === 'monthly' && (
                  <View style={[styles.selectedBadge, { backgroundColor: themeColors.primary }]}>
                    <Text style={styles.selectedBadgeText}>✓</Text>
                  </View>
                )}
              </View>
              {monthlyPrice && monthlyPrice.trim() !== '' ? (
                <Text style={[styles.planPrice, { color: themeColors.text }]}>
                  {monthlyPrice} <Text style={styles.planPeriod}>/ month</Text>
                </Text>
              ) : pricesMissing || isLoadingProducts ? (
                <Text style={[styles.planPrice, { color: themeColors.textSecondary }]}>
                  Loading price… <Text style={styles.planPeriod}>/ month</Text>
                </Text>
              ) : (
                <Text style={[styles.planPrice, { color: themeColors.textSecondary }]}>
                  — <Text style={styles.planPeriod}>/ month</Text>
                </Text>
              )}
            </TouchableOpacity>

            {/* Yearly Plan Option */}
            <TouchableOpacity
              style={[
                styles.planOption,
                { 
                  backgroundColor: themeColors.surface,
                  borderColor: selectedPlan === 'yearly' ? themeColors.primary : themeColors.border,
                  borderWidth: selectedPlan === 'yearly' ? 2 : 1,
                },
                selectedPlan === 'yearly' && shadow.md,
              ]}
              onPress={() => setSelectedPlan('yearly')}
              activeOpacity={0.7}
            >
              <View style={styles.planHeader}>
                <View style={styles.planHeaderLeft}>
                  <Text style={[styles.planLabel, { color: themeColors.text }]}>Yearly</Text>
                  <View style={[styles.bestValueBadge, { backgroundColor: themeColors.accent?.primary || themeColors.primary }]}>
                    <Text style={styles.bestValueText}>Best value</Text>
                  </View>
                </View>
                {selectedPlan === 'yearly' && (
                  <View style={[styles.selectedBadge, { backgroundColor: themeColors.primary }]}>
                    <Text style={styles.selectedBadgeText}>✓</Text>
                  </View>
                )}
              </View>
              {yearlyPrice && yearlyPrice.trim() !== '' ? (
                <>
                  <Text style={[styles.planPrice, { color: themeColors.text }]}>
                    {yearlyPrice} <Text style={styles.planPeriod}>/ year</Text>
                  </Text>
                  {pricePerMonth && pricePerMonth.trim() !== '' && savingsPercent > 0 && !isNaN(savingsPercent) && (
                    <Text style={[styles.planSavings, { color: themeColors.textSecondary }]}>
                      {pricePerMonth}/month • Save {savingsPercent}%
                    </Text>
                  )}
                </>
              ) : pricesMissing || isLoadingProducts ? (
                <Text style={[styles.planPrice, { color: themeColors.textSecondary }]}>
                  Loading price… <Text style={styles.planPeriod}>/ year</Text>
                </Text>
              ) : (
                <Text style={[styles.planPrice, { color: themeColors.textSecondary }]}>
                  — <Text style={styles.planPeriod}>/ year</Text>
                </Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Loading State */}
        {isLoadingProducts && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color={themeColors.primary} />
            <Text style={[styles.loadingText, { color: themeColors.textSecondary }]}>
              Loading subscription options...
            </Text>
          </View>
        )}

        {/* TASK 7: Preflight health check error - show user-facing error + retry */}
        {healthCheckFailed && !isLoadingProducts && (
          <View style={[styles.errorContainer, { backgroundColor: themeColors.surface, borderColor: themeColors.error }]}>
            <Text style={[styles.errorText, { color: themeColors.error, fontWeight: fontWeight.semibold }]}>
              Unable to load subscription options
            </Text>
            <Text style={[styles.errorHint, { color: themeColors.textSecondary, marginTop: spacing.xs }]}>
              {healthCheckReasons.length > 0 
                ? healthCheckReasons[0] // Show first reason as user message
                : 'Please check your connection and try again.'}
            </Text>
            <TouchableOpacity
              style={[styles.retryButton, { backgroundColor: themeColors.primary, marginTop: spacing.md }]}
              onPress={handleRetryLoadProducts}
            >
              <Text style={styles.retryButtonText}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Error State - Products failed to load */}
        {productsLoadError && !isLoadingProducts && !healthCheckFailed && (
          <ErrorDetails
            error={lastError}
            connectionStatus={connectionStatus}
            onRetry={handleRetryLoadProducts}
            themeColors={themeColors}
          />
        )}

        {/* Purchase Button - Only show when products are loaded and connection is ready */}
        {connectionStatus === 'connected' && !isLoadingProducts && products && Array.isArray(products) && products.length > 0 && (
          <TouchableOpacity
            style={[
              styles.purchaseButton,
              { backgroundColor: themeColors.primary },
              shadow.lg,
              buttonDisabled && styles.disabledButton,
            ]}
            onPress={handlePurchase}
            disabled={buttonDisabled}
            activeOpacity={0.8}
          >
            {purchaseInProgress ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : !isReady ? (
              <Text style={styles.purchaseButtonText}>Initializing...</Text>
            ) : connectionStatus !== 'connected' ? (
              <Text style={styles.purchaseButtonText}>Store Not Available</Text>
            ) : !selectedProduct ? (
              <Text style={styles.purchaseButtonText}>Select a Plan</Text>
            ) : pricesMissing || (!selectedPrice || selectedPrice.trim() === '') ? (
              <Text style={styles.purchaseButtonText}>Loading price...</Text>
            ) : (
              <Text style={styles.purchaseButtonText}>
                Continue with {selectedPlan === 'monthly' ? 'Monthly' : 'Yearly'} Plan
                {selectedPrice && selectedPrice.trim() !== '' ? ` - ${selectedPrice}` : ''}
              </Text>
            )}
          </TouchableOpacity>
        )}

        {/* General Error Display - Prominently shown for purchase errors */}
        {lastError && !productsLoadError && (
          <View style={[styles.errorContainer, { backgroundColor: themeColors.surface, borderColor: themeColors.error }]}>
            <Text style={[styles.errorText, { color: themeColors.error, fontWeight: fontWeight.semibold }]}>
              {lastError}
            </Text>
            {connectionStatus !== 'connected' && connectionStatus !== 'connecting' && (
              <Text style={[styles.errorHint, { color: themeColors.textSecondary, marginTop: spacing.xs }]}>
                Please check your internet connection and try again.
              </Text>
            )}
            {purchaseInProgress && (
              <Text style={[styles.errorHint, { color: themeColors.textSecondary, marginTop: spacing.xs }]}>
                Purchase in progress. Please wait...
              </Text>
            )}
            {hasTransientError && (
              <TouchableOpacity
                style={[styles.retryButton, { backgroundColor: themeColors.primary, marginTop: spacing.md }]}
                onPress={handleRetryVerification}
              >
                <Text style={styles.retryButtonText}>Retry Verification</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Restore Button */}
        <TouchableOpacity
          style={styles.restoreButton}
          onPress={handleRestore}
          disabled={purchaseInProgress || isLoadingProducts}
        >
          <Text style={[
            styles.restoreButtonText, 
            { 
              color: themeColors.textSecondary,
              opacity: (purchaseInProgress || isLoadingProducts) ? 0.5 : 1,
            }
          ]}>
            Restore Purchases
          </Text>
        </TouchableOpacity>
        
        {/* STEP 5: Restore message display */}
        {restoreMessage && (
          <View style={[
            styles.restoreMessageContainer,
            {
              backgroundColor: restoreMessageType === 'success' 
                ? (themeColors.success || '#4CAF50') + '20'
                : restoreMessageType === 'info'
                  ? (themeColors.primary || '#007AFF') + '15'
                  : (themeColors.error || '#F44336') + '20',
              borderColor: restoreMessageType === 'success'
                ? (themeColors.success || '#4CAF50')
                : restoreMessageType === 'info'
                  ? (themeColors.primary || '#007AFF')
                  : (themeColors.error || '#F44336'),
            }
          ]}>
            <Text style={[
              styles.restoreMessageText,
              {
                color: restoreMessageType === 'success'
                  ? (themeColors.success || '#4CAF50')
                  : restoreMessageType === 'info'
                    ? (themeColors.primary || '#007AFF')
                    : (themeColors.error || '#F44336'),
              }
            ]}>
              {restoreMessage}
            </Text>
          </View>
        )}

        {/* Manage Subscriptions Link */}
        <TouchableOpacity
          style={styles.manageSubscriptionsButton}
          onPress={() => {
            // Open App Store subscription management
            const url = 'https://apps.apple.com/account/subscriptions';
            Linking.openURL(url).catch((err: any) => {
              logger.error('[Paywall] Error opening subscription management:', err);
            });
          }}
        >
          <Text style={[styles.manageSubscriptionsText, { color: themeColors.textSecondary }]}>
            Manage Subscriptions
          </Text>
        </TouchableOpacity>

        {/* FAQ */}
        <View style={styles.faq}>
          <Text style={[styles.faqTitle, { color: themeColors.text }]}>
            Frequently Asked Questions
          </Text>
          
          <View style={styles.faqItem}>
            <Text style={[styles.faqQuestion, { color: themeColors.text }]}>
              Will this work offline?
            </Text>
            <Text style={[styles.faqAnswer, { color: themeColors.textSecondary }]}>
              Yes! All features work offline. Cloud sync is optional and requires sign-in.
            </Text>
          </View>

          <View style={styles.faqItem}>
            <Text style={[styles.faqQuestion, { color: themeColors.text }]}>
              Can I cancel anytime?
            </Text>
            <Text style={[styles.faqAnswer, { color: themeColors.textSecondary }]}>
              Yes! You can cancel your subscription anytime through your App Store account settings. Your subscription will remain active until the end of the current billing period.
            </Text>
          </View>
        </View>

        {/* Legal Links - Required for App Store */}
        <View style={styles.legalLinks}>
          <TouchableOpacity
            onPress={() => router.push('/legal/privacy-policy')}
            style={styles.legalLink}
          >
            <Text style={[styles.legalLinkText, { color: themeColors.textSecondary }]}>
              Privacy Policy
            </Text>
          </TouchableOpacity>
          <Text style={[styles.legalSeparator, { color: themeColors.textTertiary }]}>•</Text>
          <TouchableOpacity
            onPress={() => router.push('/legal/terms-and-conditions')}
            style={styles.legalLink}
          >
            <Text style={[styles.legalLinkText, { color: themeColors.textSecondary }]}>
              Terms & Conditions
            </Text>
          </TouchableOpacity>
        </View>
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
}: {
  error: string | null;
  connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error';
  onRetry: () => void;
  themeColors: any;
}) {
  const [expanded, setExpanded] = useState(false);
  const [diagnostics, setDiagnostics] = useState<any>(null);

  useEffect(() => {
    const loadDiagnostics = async () => {
      try {
        const managerDiag = IapManager.getDiagnostics();
        setDiagnostics({
          manager: managerDiag,
          exports: managerDiag.exportDiagnostics,
        });
      } catch (err) {
        logger.error('[Paywall] Error loading diagnostics:', err);
      }
    };
    loadDiagnostics();
  }, []);

  return (
    <View style={styles.errorContainer}>
      <Text style={[styles.errorText, { color: themeColors.error }]}>
        {error || 'Unable to load subscription options. Please check your connection and try again.'}
      </Text>
      <TouchableOpacity
        style={[styles.retryButton, { backgroundColor: themeColors.primary }]}
        onPress={onRetry}
      >
        <Text style={styles.retryButtonText}>Retry Loading Subscriptions</Text>
      </TouchableOpacity>
      
      {/* Expandable Details */}
      <TouchableOpacity
        style={styles.detailsToggle}
        onPress={() => setExpanded(!expanded)}
      >
        <Text style={[styles.detailsToggleText, { color: themeColors.textSecondary }]}>
          {expanded ? 'Hide Details' : 'Show Details'}
        </Text>
      </TouchableOpacity>

      {expanded && diagnostics && (
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
              color: diagnostics.exports?.requiredExportsPresent ? '#34C759' : themeColors.error 
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: spacing.xl,
  },
  header: {
    alignItems: 'flex-end',
    marginBottom: spacing.md,
  },
  closeButton: {
    fontSize: fontSize['2xl'],
    fontWeight: fontWeight.bold,
  },
  titleSection: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  proIcon: {
    fontSize: 64,
    marginBottom: spacing.md,
  },
  title: {
    fontSize: fontSize['3xl'],
    fontWeight: fontWeight.bold,
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontSize: fontSize.lg,
  },
  featuresList: {
    marginBottom: spacing.xl,
  },
  featureItem: {
    flexDirection: 'row',
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.sm,
  },
  featureIcon: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  featureIconText: {
    fontSize: fontSize['2xl'],
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
  planOption: {
    padding: spacing.lg,
    borderRadius: borderRadius.xl,
    marginBottom: spacing.sm,
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
    color: '#FFFFFF',
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    textTransform: 'uppercase',
  },
  selectedBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedBadgeText: {
    color: '#FFFFFF',
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
  purchaseButton: {
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  purchaseButtonText: {
    color: '#FFFFFF',
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
  },
  disabledButton: {
    opacity: 0.6,
  },
  errorContainer: {
    marginBottom: spacing.md,
    marginTop: spacing.sm,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: 'rgba(255, 59, 48, 0.1)',
    borderWidth: 1,
    borderStyle: 'solid',
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
  restoreMessageContainer: {
    padding: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
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
    marginTop: spacing.lg,
  },
  faqTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    marginBottom: spacing.md,
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
    marginTop: spacing.xl,
    marginBottom: spacing.lg,
    gap: spacing.sm,
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
    color: '#FFFFFF',
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
    fontFamily: 'monospace',
  },
});

// Error Boundary Fallback Component with Retry
function PaywallErrorFallback({ onRetry }: { onRetry: () => void }) {
  const theme = useEffectiveTheme();
  const themeColors = colors[theme];
  
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={[styles.closeButton, { color: themeColors.textSecondary }]}>✕</Text>
        </View>
        <View style={styles.loadingContainer}>
          <Text style={[styles.title, { color: themeColors.text }]}>
            Unable to load subscription options
          </Text>
          <Text style={[styles.loadingText, { color: themeColors.textSecondary }]}>
            Please check your connection and try again.
          </Text>
          <TouchableOpacity
            style={[styles.retryButton, { backgroundColor: themeColors.primary, marginTop: spacing.md }]}
            onPress={onRetry}
          >
            <Text style={styles.retryButtonText}>Try Again</Text>
          </TouchableOpacity>
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
    // ErrorBoundary fallback will call IapManager.retryLoadProducts directly
    // since we can't access the hook here without duplicating it
    try {
      IapManager.retryLoadProducts();
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
