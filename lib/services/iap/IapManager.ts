/**
 * IAP Manager - SINGLE SOURCE OF TRUTH for react-native-iap
 * 
 * Capability-based adapter loads react-native-iap dynamically at runtime.
 * All other files must use IapManager, never import react-native-iap directly.
 * 
 * Responsibilities:
 * - One-time initialization (idempotent)
 * - Register listeners exactly once
 * - Load subscriptions with capped retry (max 2 attempts)
 * - Expose state: connectionStatus, products, lastError, isLoadingProducts
 * - Expose actions: buy(productId), restore(), retryLoadProducts()
 * 
 * Rules:
 * - Never run initConnection() more than once per session
 * - Never register listeners more than once
 * - No retry loops, no AppState loops
 * - Normalize ESM/CJS export shapes to prevent "undefined is not a function"
 */

import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '../../utils/logger';
import { diagEvent, logSupportDiagnosticsSignal, updateDiagnosticsState } from '../../debug/iapDiagnostics';
import {
  SUBSCRIPTION_PRODUCT_IDS,
  MONTHLY_PRODUCT_ID,
  YEARLY_PRODUCT_ID,
  type IAPProduct,
} from '../../iap/iap';
import {
  checkProStatus,
  validateReceiptWithServer,
  unlockPro,
  getIAPErrorMessage,
} from '../../iap/iap';
import {
  getCapabilityDiagnostics,
  getRniapAdapter,
  validateIapCapabilities,
  type CapabilityDiagnostics,
} from './rniapAdapter';

const isExpoGo = Constants.appOwnership === 'expo';

/**
 * Detect if running under New Architecture (bridgeless mode)
 */
function detectNewArchitecture(): boolean {
  if (typeof global === 'undefined') return false;
  return !!(
    (global as any).RN$Bridgeless ||
    (global as any).__turboModuleProxy ||
    (global as any).nativeFabricUIManager
  );
}

const isNewArch = detectNewArchitecture();

// Track if convertNitroProductToProduct was actually used (for diagnostics)
let conversionUsed = false;

const PROCESSED_INDEX_KEY = 'iap_processed_index';
const PROCESSED_MAX = 50;
const PENDING_TX_KEY = 'iap_pending_tx';
const STUCK_MARKER_KEY = 'iap_stuck_purchase_marker';

function isMissingFunctionError(error: any): boolean {
  const message = String(error?.message || '').toLowerCase();
  return (
    message.includes('is not a function') ||
    message.includes('undefined is not a function') ||
    message.includes('not available') ||
    message.includes('not implemented')
  );
}

/**
 * Extract product ID from raw product object (Nitro API)
 * Tries multiple field names and conversion helpers
 */
function getProductId(raw: any): string | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const { functions } = getRniapAdapter();

  // Try Nitro conversion helper first (most reliable)
  if (typeof functions.convertNitroProductToProduct === 'function') {
    try {
      const converted = functions.convertNitroProductToProduct(raw);
      if (converted && converted.id && typeof converted.id === 'string' && converted.id.trim()) {
        return converted.id.trim();
      }
    } catch (e) {
      // Conversion failed, try direct fields
    }
  }

  // Try direct field access (prioritized order)
  const candidateFields = [
    raw.productId,
    raw.productIdentifier,
    raw.id,
    raw.sku,
    raw.identifier,
    raw.product?.id,
    raw.product?.productId,
    raw.product?.sku,
  ];

  for (const candidate of candidateFields) {
    if (candidate && typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }

  return null;
}

/**
 * Format price from micros (Android IAP format)
 * Converts priceAmountMicros to major units and formats with currency
 */
function formatPriceFromMicros(micros: number | string, currencyCode?: string): { price: string; localizedPrice: string } {
  const numericMicros = typeof micros === 'string' ? parseInt(micros, 10) : micros;
  if (isNaN(numericMicros) || numericMicros <= 0) {
    return { price: '', localizedPrice: '' };
  }
  
  const majorUnits = numericMicros / 1_000_000;
  const price = majorUnits.toFixed(2);
  
  let localizedPrice = price;
  if (currencyCode && currencyCode.trim() !== '') {
    const code = currencyCode.toUpperCase().trim();
    const numericPrice = parseFloat(price);
    const canUseIntl = typeof Intl !== 'undefined' && typeof Intl.NumberFormat === 'function';
    if (canUseIntl && /^[A-Z]{3}$/.test(code) && !isNaN(numericPrice)) {
      try {
        localizedPrice = new Intl.NumberFormat(undefined, { style: 'currency', currency: code }).format(numericPrice);
      } catch {
        localizedPrice = `${code} ${price}`;
      }
    } else if (code === 'USD' || code === 'CAD' || code === 'AUD') {
      localizedPrice = `$${price}`;
    } else if (code === 'EUR') {
      localizedPrice = `€${price}`;
    } else if (code === 'GBP') {
      localizedPrice = `£${price}`;
    } else {
      localizedPrice = `${code} ${price}`;
    }
  }
  
  return { price, localizedPrice };
}

/**
 * Normalize a raw product from Nitro API to IAPProduct shape
 * Extracts productId, localizedPrice, currency, title, description with comprehensive fallback logic
 * Returns null if productId cannot be extracted (product is invalid)
 */
function normalizeProduct(raw: any): IAPProduct | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const { functions } = getRniapAdapter();

  // Try to get converted product for better field access
  let converted: any = null;
  if (typeof functions.convertNitroProductToProduct === 'function') {
    try {
      converted = functions.convertNitroProductToProduct(raw);
      // Track conversion usage (one-time diagnostic event)
      if (!conversionUsed) {
        conversionUsed = true;
        diagEvent('iap_conversion_used', {
          hadConversion: true,
          conversionSucceeded: !!converted,
        });
      }
    } catch (e) {
      // Conversion failed, use raw object
      diagEvent('iap_conversion_failed', {
        hadConversion: true,
        error: String(e).substring(0, 100),
      });
    }
  }

  const source = converted || raw;

  // Extract productId - try in prioritized order
  // CRITICAL: Nitro API uses 'id' field, ensure we extract from it
  let productId: string | null = null;
  
  // Try conversion helper first
  if (converted && converted.id && typeof converted.id === 'string' && converted.id.trim()) {
    productId = converted.id.trim();
  } else {
    // Try direct field access (prioritized order)
    // IMPORTANT: For Nitro API, 'id' field takes priority after productId/productIdentifier
    const candidateFields = [
      raw.productId,
      raw.productIdentifier,
      raw.id, // Nitro API primary identifier
      source?.id, // Try converted source id
      raw.sku,
      raw.identifier,
      raw.product?.id,
      raw.product?.productId,
      raw.product?.sku,
      source?.productId,
      source?.productIdentifier,
      source?.sku,
      source?.identifier,
    ];

    for (const candidate of candidateFields) {
      if (candidate && typeof candidate === 'string' && candidate.trim()) {
        productId = candidate.trim();
        break;
      }
    }
  }

  // productId is required - if we can't extract it, product is invalid
  if (!productId || productId.length === 0) {
    return null;
  }

  // Extract currency FIRST (needed for micros conversion)
  let currency = '';
  const currencyCandidates = [
    source?.currency,
    source?.currencyCode,
    raw?.currency,
    raw?.currencyCode,
  ];

  for (const candidate of currencyCandidates) {
    if (candidate && typeof candidate === 'string' && candidate.trim()) {
      currency = candidate.trim();
      break;
    }
  }

  // Extract localizedPrice - try in prioritized order
  let localizedPrice = '';
  let price = '';
  const priceCandidates = [
    source?.localizedPrice,
    source?.displayPrice,
    source?.priceString,
    source?.price,
    raw?.localizedPrice,
    raw?.displayPrice,
    raw?.priceString,
    raw?.price,
  ];

  // Also try subscriptionOfferDetails for Nitro API (Android)
  if (!localizedPrice && raw?.subscriptionOfferDetails && Array.isArray(raw.subscriptionOfferDetails) && raw.subscriptionOfferDetails.length > 0) {
    const offer = raw.subscriptionOfferDetails[0];
    let phaseList: any[] | null = null;
    
    // Handle both pricingPhases structure types
    if (offer?.pricingPhases?.pricingPhaseList && Array.isArray(offer.pricingPhases.pricingPhaseList)) {
      phaseList = offer.pricingPhases.pricingPhaseList;
    } else if (Array.isArray(offer?.pricingPhases)) {
      phaseList = offer.pricingPhases;
    }
    
    if (phaseList && phaseList.length > 0) {
      const firstPhase = phaseList[0];
      if (firstPhase?.priceAmountMicros !== undefined && firstPhase.priceAmountMicros !== null) {
        // Use priceAmountMicros (Android format)
        const currencyCode = currency || source?.currencyCode || raw?.currencyCode || '';
        const formatted = formatPriceFromMicros(firstPhase.priceAmountMicros, currencyCode);
        price = formatted.price;
        localizedPrice = formatted.localizedPrice;
        
        // Emit diagnostic event
        diagEvent('iap_price_from_micros_used', {
          productId: productId || 'unknown',
          hadCurrency: !!currencyCode,
          currencyCode: currencyCode && /^[A-Z]{3}$/.test(currencyCode) ? currencyCode : undefined,
          priceFieldUsed: 'priceAmountMicros',
        });
        
        if (!currencyCode || currencyCode.trim() === '') {
          diagEvent('iap_price_from_micros_missing_currency', {
            productId: productId || 'unknown',
            priceFieldUsed: 'priceAmountMicros',
          });
        }
      } else if (firstPhase?.price) {
        // Fallback to price field if priceAmountMicros not available
        localizedPrice = String(firstPhase.price);
      }
    }
  }

  // Try priceCandidates if still empty
  if (!localizedPrice) {
    for (const candidate of priceCandidates) {
      if (candidate !== undefined && candidate !== null && candidate !== '') {
        localizedPrice = String(candidate);
        break;
      }
    }
  }

  // Extract title
  let title = '';
  const titleCandidates = [
    source?.title,
    source?.localizedTitle,
    raw?.title,
    raw?.localizedTitle,
  ];

  for (const candidate of titleCandidates) {
    if (candidate && typeof candidate === 'string' && candidate.trim()) {
      title = candidate.trim();
      break;
    }
  }

  // Extract description
  let description = '';
  const descriptionCandidates = [
    source?.description,
    source?.localizedDescription,
    raw?.description,
    raw?.localizedDescription,
  ];

  for (const candidate of descriptionCandidates) {
    if (candidate && typeof candidate === 'string' && candidate.trim()) {
      description = candidate.trim();
      break;
    }
  }

  // Extract price (numeric string, fallback to localizedPrice)
  // Note: price may already be set from subscriptionOfferDetails micros conversion above
  if (!price) {
    price = localizedPrice || '';
    if (!price && source?.price) {
      price = String(source.price);
    } else if (!price && raw?.price) {
      price = String(raw.price);
    }
  }

  // STEP 1: Ensure localizedPrice always has a usable value
  // If localizedPrice is missing but we have numeric price + currency, format a fallback
  let finalLocalizedPrice = localizedPrice;
  let priceFieldUsed = 'localizedPrice'; // Track which field produced the price
  
  if (!finalLocalizedPrice || finalLocalizedPrice.trim() === '') {
    // Try to construct from numeric price + currency
    const numericPrice = price ? parseFloat(String(price).replace(/[^0-9.]/g, '')) : null;
    if (numericPrice && !isNaN(numericPrice) && currency && currency.trim() !== '') {
      // Format based on currency code, prefer Intl when available
      const currencyCode = currency.toUpperCase();
      const canUseIntl = typeof Intl !== 'undefined' && typeof Intl.NumberFormat === 'function';
      if (canUseIntl && /^[A-Z]{3}$/.test(currencyCode)) {
        try {
          finalLocalizedPrice = new Intl.NumberFormat(undefined, { style: 'currency', currency: currencyCode }).format(numericPrice);
          priceFieldUsed = 'formatted_from_price_currency_intl';
        } catch {
          finalLocalizedPrice = `${currencyCode} ${numericPrice.toFixed(2)}`;
          priceFieldUsed = 'formatted_from_price_currency';
        }
      } else if (currencyCode === 'USD' || currencyCode === 'CAD' || currencyCode === 'AUD') {
        finalLocalizedPrice = `$${numericPrice.toFixed(2)}`;
        priceFieldUsed = 'formatted_from_price_currency';
      } else if (currencyCode === 'EUR') {
        finalLocalizedPrice = `€${numericPrice.toFixed(2)}`;
        priceFieldUsed = 'formatted_from_price_currency';
      } else if (currencyCode === 'GBP') {
        finalLocalizedPrice = `£${numericPrice.toFixed(2)}`;
        priceFieldUsed = 'formatted_from_price_currency';
      } else {
        // Generic format: currency code + price
        finalLocalizedPrice = `${currencyCode} ${numericPrice.toFixed(2)}`;
        priceFieldUsed = 'formatted_from_price_currency';
      }
    } else if (price && price.trim() !== '') {
      // Last resort: use price as string
      finalLocalizedPrice = String(price);
      priceFieldUsed = 'price_fallback';
    } else {
      // Still empty - will be handled by UI
      finalLocalizedPrice = '';
      priceFieldUsed = 'none';
    }
  }

  // Track priceFieldUsed in diagnostics separately (not in product object to avoid breaking interface)
  // This will be logged when products are set in loadProducts()
  
  return {
    productId,
    title: title || '',
    description: description || '',
    price: price || '',
    localizedPrice: finalLocalizedPrice,
    currency: currency || '',
    type: (SUBSCRIPTION_PRODUCT_IDS as readonly string[]).includes(productId) ? 'subscription' : 'iap',
  };
}

// ============================================================================
// IAP MANAGER CLASS
// ============================================================================

export interface IapManagerState {
  connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error';
  products: IAPProduct[];
  isLoadingProducts: boolean;
  lastError: {
    code: string;
    message: string;
    userMessage: string;
  } | null;
  isInitialized: boolean;
  listenersRegistered: boolean;
  pricesMissing: boolean;
}

type IapManagerListener = (state: IapManagerState) => void;

class IapManagerClass {
  private state: IapManagerState = {
    connectionStatus: 'disconnected',
    products: [],
    isLoadingProducts: false,
    lastError: null,
    isInitialized: false,
    listenersRegistered: false,
    pricesMissing: false,
  };

  private stateListeners: Set<IapManagerListener> = new Set();
  private purchaseUpdateSubscription: { remove: () => void } | null = null;
  private purchaseErrorSubscription: { remove: () => void } | null = null;
  private initPromise: Promise<void> | null = null;
  private loadProductsAttempts = 0;
  private maxLoadAttempts = 2;
  private exportMismatchDetected = false; // Prevent retry loops on export mismatch
  private terminalError = false; // Prevents re-initialization after terminal error
  private purchaseInProgress = false; // Single-flight guard to prevent repeated purchase attempts
  private pendingPurchase: { sku: string; startedAt: number } | null = null; // Track pending purchase for timeout
  private purchaseTimeoutId: ReturnType<typeof setTimeout> | null = null; // Timeout to clear stuck purchases
  private lastProductFetchMethod: string | null = null;
  private lastPurchaseMethod: string | null = null;
  private lastRestoreMethod: string | null = null;
  private recoveryInProgress = false;
  private async loadStuckMarker(): Promise<{ count: number; firstSeen: string; lastSeen: string } | null> {
    try {
      const raw = await AsyncStorage.getItem(STUCK_MARKER_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed.count !== 'number' || !parsed.firstSeen || !parsed.lastSeen) {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  private async incrementStuckMarker(reason: string, transactionId?: string, productId?: string): Promise<void> {
    const now = new Date().toISOString();
    const existing = await this.loadStuckMarker();
    const next = {
      count: (existing?.count || 0) + 1,
      firstSeen: existing?.firstSeen || now,
      lastSeen: now,
    };
    await AsyncStorage.setItem(STUCK_MARKER_KEY, JSON.stringify(next));
    diagEvent('iap_stuck_marker_incremented', {
      reason,
      count: next.count,
      firstSeen: next.firstSeen,
      lastSeen: next.lastSeen,
      transactionId,
      productId,
    });
  }

  private async clearStuckMarker(): Promise<void> {
    await AsyncStorage.removeItem(STUCK_MARKER_KEY);
  }

  /**
   * Subscribe to state changes
   */
  subscribe(listener: IapManagerListener): () => void {
    this.stateListeners.add(listener);
    // Immediately call with current state
    listener(this.state);
    return () => {
      this.stateListeners.delete(listener);
    };
  }

  private notifyStateChange(): void {
    this.stateListeners.forEach(listener => {
      try {
        listener(this.state);
      } catch (error) {
        logger.error('[IAP Manager] Error in state listener', error);
      }
    });
  }

  private setState(updates: Partial<IapManagerState>): void {
    this.state = { ...this.state, ...updates };
    this.notifyStateChange();
  }

  /**
   * Get current state
   */
  getState(): IapManagerState {
    return { ...this.state };
  }

  private getAdapterOrThrow(context: string) {
    try {
      validateIapCapabilities();
      return getRniapAdapter();
    } catch (error: any) {
      const normalizedError = {
        code: error?.code || 'IAP_CAPABILITY_MISSING',
        message: error?.message || 'IAP capabilities missing',
        userMessage: 'Purchases unavailable due to a configuration error. Please contact support.',
      };

      this.setState({
        connectionStatus: 'error',
        lastError: normalizedError,
      });

      updateDiagnosticsState({
        connectionStatus: 'error',
        lastError: normalizedError,
      });

      diagEvent('iap_manager_capability_missing', {
        context,
        missing: error?.missing || [],
        capabilities: error?.capabilities || {},
        moduleKeys: error?.moduleKeys || [],
      });

      throw error;
    }
  }

  private getTransactionKey(purchase: any): string | null {
    if (!purchase || typeof purchase !== 'object') return null;

    if (Platform.OS === 'android') {
      const token = purchase.purchaseToken || purchase.token || null;
      return token ? `android:${String(token)}` : null;
    }

    const tx =
      purchase.transactionId ||
      purchase.transactionIdentifier ||
      purchase.originalTransactionIdentifier ||
      null;
    return tx ? `ios:${String(tx)}` : null;
  }

  private async loadProcessedIndex(): Promise<string[]> {
    try {
      const raw = await AsyncStorage.getItem(PROCESSED_INDEX_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private async saveProcessedIndex(keys: string[]): Promise<void> {
    await AsyncStorage.setItem(PROCESSED_INDEX_KEY, JSON.stringify(keys));
  }

  private async isProcessed(key: string): Promise<boolean> {
    const keys = await this.loadProcessedIndex();
    return keys.includes(key);
  }

  private async markProcessed(key: string): Promise<void> {
    const keys = await this.loadProcessedIndex();
    const next = [key, ...keys.filter(k => k !== key)].slice(0, PROCESSED_MAX);
    await AsyncStorage.setItem(`iap_processed:${key}`, String(Date.now()));
    await this.saveProcessedIndex(next);

    const removed = keys.filter(k => !next.includes(k));
    for (const removedKey of removed) {
      await AsyncStorage.removeItem(`iap_processed:${removedKey}`);
    }
  }

  private async clearPendingTransaction(): Promise<void> {
    await AsyncStorage.removeItem(PENDING_TX_KEY);
  }

  private async persistPendingTransaction(purchase: any, reason: string): Promise<void> {
    const key = this.getTransactionKey(purchase);
    if (!key) return;

    let pending: any = null;
    try {
      const raw = await AsyncStorage.getItem(PENDING_TX_KEY);
      pending = raw ? JSON.parse(raw) : null;
    } catch {
      pending = null;
    }

    const next = {
      key,
      platform: Platform.OS,
      productId: purchase?.productId || purchase?.productIdentifier || purchase?.product_id || purchase?.sku || null,
      transactionId: purchase?.transactionId || purchase?.transactionIdentifier || purchase?.originalTransactionIdentifier || null,
      purchaseToken: purchase?.purchaseToken || null,
      createdAt: pending?.createdAt || Date.now(),
      retryCount: typeof pending?.retryCount === 'number' ? pending.retryCount + 1 : 0,
      reason,
    };

    await AsyncStorage.setItem(PENDING_TX_KEY, JSON.stringify(next));
  }

  private async recoverPendingTransactionOnce(): Promise<void> {
    try {
      const raw = await AsyncStorage.getItem(PENDING_TX_KEY);
      if (!raw) return;
      const pending = JSON.parse(raw);
      if (!pending || !pending.key) return;
      if (pending.retryCount >= 3) return;
      if (Date.now() - (pending.createdAt || 0) < 3000) return;

      const { functions } = getRniapAdapter();
      if (typeof functions.getAvailablePurchases !== 'function') return;

      const purchases: any[] = await functions.getAvailablePurchases();
      const match = purchases.find((p: any) => {
        const key = this.getTransactionKey(p);
        if (pending.key && key === pending.key) return true;
        if (pending.purchaseToken && p?.purchaseToken === pending.purchaseToken) return true;
        if (pending.transactionId && (p?.transactionId === pending.transactionId || p?.transactionIdentifier === pending.transactionId)) return true;
        if (pending.productId && (p?.productId === pending.productId || p?.productIdentifier === pending.productId)) return true;
        return false;
      });

      if (!match) {
        const next = { ...pending, retryCount: pending.retryCount + 1 };
        await AsyncStorage.setItem(PENDING_TX_KEY, JSON.stringify(next));
        return;
      }

      try {
        await this.handlePurchaseUpdate(match);
        await this.clearPendingTransaction();
      } catch (error: any) {
        const isTransient =
          error?.code === 'TRANSIENT_DB_PENDING' ||
          error?.code === 'TRANSIENT_RECEIPT_MISSING' ||
          error?.code === 'TRANSIENT_VERIFICATION_PENDING' ||
          error?.code === 'TRANSIENT_PURCHASE_TOKEN_MISSING';

        if (isTransient) {
          const next = { ...pending, retryCount: pending.retryCount + 1 };
          await AsyncStorage.setItem(PENDING_TX_KEY, JSON.stringify(next));
          return;
        }

        await this.markProcessed(pending.key);
        await this.clearPendingTransaction();
      }
    } catch (error) {
      logger.warn('[IAP Manager] Pending transaction recovery failed', error);
    }
  }

  private async hasPendingTransaction(): Promise<boolean> {
    try {
      const raw = await AsyncStorage.getItem(PENDING_TX_KEY);
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      return !!parsed?.key;
    } catch {
      return false;
    }
  }

  /**
   * Initialize IAP connection (idempotent - only runs once)
   */
  async initialize(): Promise<void> {
    // Skip on web/Expo Go
    if (Platform.OS === 'web' || isExpoGo) {
      logger.log('[IAP Manager] Skipping initialization (web/Expo Go)');
      this.setState({
        connectionStatus: 'disconnected',
        isInitialized: true,
      });
      const isUnlocked = await checkProStatus();
      return;
    }

    // If terminal error occurred, do not re-initialize
    if (this.terminalError) {
      logger.log('[IAP Manager] Terminal error detected, skipping re-initialization');
      return;
    }

    // If already initialized successfully, return immediately
    if (this.state.isInitialized && this.state.connectionStatus === 'connected') {
      logger.log('[IAP Manager] Already initialized and connected, skipping');
      return;
    }

    // If initialization in progress, wait for it
    if (this.initPromise) {
      logger.log('[IAP Manager] Initialization in progress, waiting...');
      return this.initPromise;
    }

    // Start initialization
    this.initPromise = this._doInitialize();
    try {
      await this.initPromise;
    } finally {
      this.initPromise = null;
    }
  }

  private async _doInitialize(): Promise<void> {
    const initStart = Date.now();
    try {
      // Step 1: Validate minimum viable IAP capabilities with fallback retry
      let validationPassed = false;
      let validationError: any = null;
      let capabilityDiagnostics: CapabilityDiagnostics | null = null;

      try {
        capabilityDiagnostics = validateIapCapabilities();
        this.exportMismatchDetected = false;
        validationPassed = true;
      } catch (error: any) {
        validationError = error;

        // Fallback: Retry after short delay to allow module to finish loading
        if (error?.code === 'IAP_CAPABILITY_MISSING') {
          logger.warn('[IAP Manager] Capability validation failed - retrying after delay', {
            missing: error?.missing || [],
            capabilities: error?.capabilities || {},
            moduleKeys: error?.moduleKeys || [],
          });

          await new Promise(resolve => setTimeout(resolve, 100));

          try {
            capabilityDiagnostics = validateIapCapabilities();
            this.exportMismatchDetected = false;
            validationPassed = true;
            logger.log('[IAP Manager] Capability validation passed on retry');
          } catch (retryError: any) {
            validationError = retryError;
          }
        }
      }

      if (!validationPassed) {
        // Minimum capabilities missing - stop initialization and set error state
        this.exportMismatchDetected = true;
        const errorMsg = validationError?.message || 'IAP capabilities validation failed';
        const normalizedError = {
          code: validationError?.code || 'IAP_CAPABILITY_MISSING',
          message: errorMsg,
          userMessage: 'Purchases unavailable due to a configuration error. Please contact support.',
        };

        logger.error('[IAP Manager] Capability validation failed - stopping initialization', {
          error: validationError,
          code: validationError?.code,
          message: errorMsg,
          missing: validationError?.missing || [],
          capabilities: validationError?.capabilities || {},
          moduleKeys: validationError?.moduleKeys || [],
        });

        // Only mark as terminal if NO viable product fetch or purchase capability exists
        const capabilitySnapshot = getCapabilityDiagnostics();
        if (!capabilitySnapshot.requiredCapabilitiesPresent) {
          this.terminalError = true;
        }
        
        this.setState({
          connectionStatus: 'error',
          isInitialized: true, // Mark as initialized to prevent retry loops
          lastError: normalizedError,
        });

        updateDiagnosticsState({
          connectionStatus: 'error',
          lastError: normalizedError,
        });

        const initDuration = Date.now() - initStart;
        diagEvent('iap_manager_init_error', {
          error: normalizedError,
          bundleId: Constants.expoConfig?.ios?.bundleIdentifier,
          isNewArch,
          terminal: this.terminalError,
          missing: validationError?.missing || [],
          capabilities: validationError?.capabilities || {},
          moduleKeys: validationError?.moduleKeys || [],
        }, initDuration);

        // DO NOT throw - just set error state and return
        // This prevents retry loops
        return;
      }

      this.setState({ connectionStatus: 'connecting' });
      updateDiagnosticsState({ connectionStatus: 'connecting' });

      diagEvent('iap_manager_init_start', {
        bundleId: Constants.expoConfig?.ios?.bundleIdentifier,
        platform: Platform.OS,
        capabilities: capabilityDiagnostics?.capabilities || {},
        selectedMethods: capabilityDiagnostics?.selectedMethods || {},
        moduleKeys: capabilityDiagnostics?.moduleKeys || [],
      });

      // Step 2: Initialize connection
      const { functions } = getRniapAdapter();
      if (typeof functions.initConnection === 'function') {
        await functions.initConnection();
      }

      // Small delay to allow StoreKit to sync
      await new Promise(resolve => setTimeout(resolve, 500));

      // Step 3: Clear pending transactions on iOS (if function exists and is callable)
      // 4C: Gate clearTransactionIOS - only run in dev or if stuck purchase marker exists
      const marker = await this.loadStuckMarker();
      const firstSeenMs = marker?.firstSeen ? new Date(marker.firstSeen).getTime() : 0;
      const markerAgeMs = firstSeenMs ? Date.now() - firstSeenMs : 0;
      const markerEligible = !!marker && marker.count <= 3 && markerAgeMs <= 7 * 24 * 60 * 60 * 1000;
      const shouldClearTransactions = __DEV__ || markerEligible;
      if (marker && !markerEligible && !__DEV__) {
        diagEvent('iap_stuck_marker_expired', {
          count: marker.count,
          firstSeen: marker.firstSeen,
          lastSeen: marker.lastSeen,
        });
      }
      if (Platform.OS === 'ios' && shouldClearTransactions && typeof functions.clearTransactionIOS === 'function') {
        try {
          await functions.clearTransactionIOS();
          logger.log('[IAP Manager] Cleared pending iOS transactions');
          diagEvent('iap_manager_clearTransactionsIOS_executed', {
            reason: __DEV__ ? 'dev_mode' : 'stuck_purchase_marker',
          });
          // Clear marker after successful clear
          if (!__DEV__) {
            await this.clearStuckMarker();
          }
        } catch (clearError: any) {
          logger.warn('[IAP Manager] Could not clear pending transactions (non-critical):', clearError);
          diagEvent('iap_manager_clearTransactionsIOS_error', {
            error: clearError,
          });
        }
      } else {
        diagEvent('iap_manager_clearTransactionsIOS_skipped', {
          reason: !shouldClearTransactions ? 'not_dev_and_no_marker' : 'function_unavailable',
        });
      }

      const initDuration = Date.now() - initStart;
      this.setState({
        connectionStatus: 'connected',
        isInitialized: true,
      });

      updateDiagnosticsState({ connectionStatus: 'connected' });
      diagEvent('iap_manager_init_success', {
        bundleId: Constants.expoConfig?.ios?.bundleIdentifier,
        platform: Platform.OS,
        step: 'initConnection_ok',
        capabilities: capabilityDiagnostics?.capabilities || {},
        selectedMethods: capabilityDiagnostics?.selectedMethods || {},
      }, initDuration);

      logger.log('[IAP Manager] Initialization successful', {
        duration: initDuration,
        bundleId: Constants.expoConfig?.ios?.bundleIdentifier,
      });

      // Step 4: Register listeners (exactly once)
      this.registerListeners();
      diagEvent('iap_manager_step', { step: 'listeners_ok' });

      // Step 4b: Attempt single recovery pass for pending transactions
      await this.recoverPendingTransactionOnce();

      // Step 5: Check current premium status
      const isUnlocked = await checkProStatus();

      // Step 6: Load products (with capped retry)
      await this.loadProducts();
    } catch (error: any) {
      const initDuration = Date.now() - initStart;
      const iapError = getIAPErrorMessage(error);
      const normalizedError = {
        code: iapError.code,
        message: iapError.message,
        userMessage: iapError.userMessage,
      };

      logger.error('[IAP Manager] Initialization failed', {
        error,
        code: error?.code,
        message: error?.message,
        bundleId: Constants.expoConfig?.ios?.bundleIdentifier,
      });

      diagEvent('iap_manager_init_error', {
        error: normalizedError,
        bundleId: Constants.expoConfig?.ios?.bundleIdentifier,
      }, initDuration);

      this.setState({
        connectionStatus: 'error',
        isInitialized: true, // Mark as initialized even on error to prevent retry loops
        lastError: normalizedError,
      });

      updateDiagnosticsState({
        connectionStatus: 'error',
        lastError: normalizedError,
      });

      throw error;
    }
  }

  /**
   * Register purchase listeners (exactly once)
   */
  private registerListeners(): void {
    if (this.state.listenersRegistered) {
      logger.log('[IAP Manager] Listeners already registered, skipping');
      return;
    }

    try {
      const { functions } = this.getAdapterOrThrow('registerListeners');
      if (typeof functions.purchaseUpdatedListener === 'function') {
        this.purchaseUpdateSubscription = functions.purchaseUpdatedListener(
          (purchase: any) => {
            this.handlePurchaseUpdate(purchase).catch((error: any) => {
              logger.error('[IAP Manager] Unhandled purchase update error', error);
              diagEvent('iap_manager_purchaseUpdated_unhandled', {
                error: {
                  code: error?.code || 'UNKNOWN',
                  message: error?.message || String(error),
                },
              });
              const iapError = getIAPErrorMessage(error);
              this.setState({
                lastError: {
                  code: iapError.code,
                  message: iapError.message,
                  userMessage: iapError.userMessage,
                },
              });
              updateDiagnosticsState({
                lastError: {
                  code: iapError.code,
                  message: iapError.message,
                },
              });
              this.clearPurchaseGuard('error');
            });
          }
        );
      }

      if (typeof functions.purchaseErrorListener === 'function') {
        this.purchaseErrorSubscription = functions.purchaseErrorListener(
          (error: any) => {
            this.handlePurchaseError(error);
          }
        );
      }

      const listenersRegistered =
        typeof functions.purchaseUpdatedListener === 'function' &&
        typeof functions.purchaseErrorListener === 'function';

      this.setState({ listenersRegistered });
      updateDiagnosticsState({ iapListenersActive: listenersRegistered });
      if (listenersRegistered) {
        diagEvent('iap_manager_listeners_registered', {
          step: 'listeners_ok',
        });
      } else {
        diagEvent('iap_manager_listeners_error', {
          error: 'Listeners unavailable',
        });
      }

      logger.log('[IAP Manager] Purchase listeners registered');
    } catch (error: any) {
      logger.error('[IAP Manager] Failed to register listeners', error);
      diagEvent('iap_manager_listeners_error', { error });
      throw error;
    }
  }

  /**
   * Handle purchase update from StoreKit
   */
  private async handlePurchaseUpdate(purchase: any): Promise<void> {
    let transactionFinished = false;
    let finishAttempted = false;
    const transactionId = (purchase as any).transactionId || (purchase as any).transactionIdentifier;
    let functions = getRniapAdapter().functions;
    try {
      functions = this.getAdapterOrThrow('handlePurchaseUpdate').functions;
    } catch {
      // Fall back to best-effort snapshot for cleanup paths.
    }
    
    // TASK B2: Safely extract productId - do NOT assume purchase.productId exists
    // Try multiple possible fields in order of likelihood
    const productId = 
      purchase.productId || 
      purchase.productIdentifier || 
      purchase.product_id ||
      (purchase as any).sku ||
      (purchase as any).identifier ||
      null;
    
    // Helper function to attempt finishTransaction with idempotency guard
    const attemptFinishTransaction = async (reason: string) => {
      if (finishAttempted) {
        logger.log('[IAP Manager] finishTransaction already attempted, skipping', { reason, transactionId, productId });
        return;
      }
      finishAttempted = true;
      diagEvent('iap_manager_finishTransaction_attempted', { reason, transactionId, productId });

      try {
        if (typeof functions.finishTransaction === 'function') {
          await functions.finishTransaction({ purchase, isConsumable: false });
        } else {
          throw new Error('finishTransaction not available');
        }
        transactionFinished = true;
        diagEvent('iap_manager_finishTransaction_success', { reason, transactionId, productId });
        logger.log('[IAP Manager] Transaction finished', {
          transactionId,
          productId,
          reason,
        });
      } catch (finishError: any) {
        transactionFinished = false;
        logger.error('[IAP Manager] Error finishing transaction', {
          error: finishError,
          transactionId,
          productId,
          reason,
        });
        diagEvent('iap_manager_finishTransaction_error', { reason, transactionId, productId, error: finishError });

        // Set recovery marker ONLY on finishTransaction failure
        try {
          await this.incrementStuckMarker('finishTransaction_failed', transactionId, productId);
          logger.log('[IAP Manager] Set recovery marker for stuck transaction', {
            transactionId,
            productId,
            reason,
          });
          diagEvent('iap_manager_stuck_transaction_marker_set', { reason: 'finishTransaction_failed', transactionId, productId });
        } catch (markerError) {
          logger.warn('[IAP Manager] Could not set recovery marker:', markerError);
        }
      }
    };

    const transactionKey = this.getTransactionKey(purchase);
    if (transactionKey && await this.isProcessed(transactionKey)) {
      await attemptFinishTransaction('already_processed');
      await this.clearPendingTransaction();
      this.clearPurchaseGuard('updated');
      return;
    }
    
    if (!productId) {
      logger.error('[IAP Manager] Cannot extract productId from purchase', {
        purchaseKeys: Object.keys(purchase || {}),
        transactionId,
      });
      diagEvent('iap_manager_purchaseUpdated_missing_productId', {
        transactionId,
        purchaseKeys: Object.keys(purchase || {}),
      });
      // Still finish transaction to prevent retry loops
      await attemptFinishTransaction('missing_productId');
      this.clearPurchaseGuard('updated');
      throw new Error('Purchase received but product ID could not be determined');
    }

    let shouldFinishTransactionOnError = true;
    try {
      logger.log('[IAP Manager] Purchase update received', {
        productId,
        transactionId,
        timestamp: new Date().toISOString(),
      });

      diagEvent('iap_manager_purchaseUpdated', {
        productId,
        transactionId,
        purchaseKeys: Object.keys(purchase || {}),
      });

      // Get receipt
      // Platform-specific receipt/token extraction
      let receipt: string | undefined;
      let purchaseToken: string | undefined;
      
      if (Platform.OS === 'ios') {
        // iOS: require receipt
        try {
          if (typeof functions.getReceiptIOS === 'function') {
            receipt = await functions.getReceiptIOS();
          }
          if (receipt) {
            diagEvent('iap_manager_receipt_retrieved', {
              receipt_length: receipt.length,
              method: 'getReceiptIOS',
            });
          } else {
            receipt = purchase.transactionReceipt || undefined;
          }
        } catch (receiptError) {
          logger.warn('[IAP Manager] Could not get iOS receipt:', receiptError);
          receipt = purchase.transactionReceipt || undefined;
        }
        
        // iOS: receipt is required - if missing, treat as transient
        if (!receipt) {
          logger.error('[IAP Manager] iOS receipt not available for validation', {
            transactionId,
            productId,
            hasTransactionReceipt: !!purchase.transactionReceipt,
          });
          diagEvent('iap_manager_receipt_missing_transient', {
            transactionId,
            productId,
            platform: 'ios',
          });
          shouldFinishTransactionOnError = false;
          const receiptMissingError: any = new Error('Purchase receipt is being retrieved. Please try again in a moment.');
          receiptMissingError.code = 'TRANSIENT_RECEIPT_MISSING';
          throw receiptMissingError;
        }
      } else {
        // Android: require purchaseToken
        purchaseToken = purchase.purchaseToken || undefined;
        
        // Android: purchaseToken is required - if missing, treat as transient
        if (!purchaseToken) {
          logger.error('[IAP Manager] Android purchaseToken not available for validation', {
            transactionId,
            productId,
            hasPurchaseToken: !!purchase.purchaseToken,
          });
          diagEvent('iap_manager_purchase_token_missing_transient', {
            transactionId,
            productId,
            platform: 'android',
          });
          shouldFinishTransactionOnError = false;
          const tokenMissingError: any = new Error('Purchase token is being retrieved. Please try again in a moment.');
          tokenMissingError.code = 'TRANSIENT_PURCHASE_TOKEN_MISSING';
          throw tokenMissingError;
        }
      }

      // Validate receipt server-side BEFORE unlocking
      logger.log('[IAP Manager] Validating receipt before unlock', {
        transactionId,
        productId,
        platform: Platform.OS,
      });
      
      const validation = await validateReceiptWithServer({
        platform: Platform.OS as 'ios' | 'android',
        receipt,
        purchaseToken,
        transactionId,
        productId,
      });

      if (validation.status === 'valid') {
        // Receipt validated - confirm DB entitlement before finishing transaction
        const dbConfirmation = await this.confirmDbEntitlement();
        
        if (!dbConfirmation.confirmed) {
          // DB not updated yet - treat as transient
          logger.error('[IAP Manager] DB entitlement not confirmed after validation', {
            transactionId,
            productId,
            attempts: dbConfirmation.attempts,
          });
          diagEvent('iap_manager_db_unlock_pending_transient', {
            transactionId,
            productId,
            attempts: dbConfirmation.attempts,
            validationStatus: 'valid',
          });
          shouldFinishTransactionOnError = false;
          const transientError: any = new Error('Purchase is being verified. Please try again in a moment.');
          transientError.code = 'TRANSIENT_DB_PENDING';
          throw transientError;
        }

        // DB confirmed - proceed with unlock flow
        const { setLocalProCache } = await import('../../iap/iap');
        const cacheSet = await setLocalProCache();
        
        if (cacheSet) {
          logger.log('[IAP Manager] Local Pro cache set after DB confirmation', {
            transactionId,
            productId,
          });
          
          diagEvent('iap_manager_db_unlock_confirmed', {
            transactionId,
            productId,
          });
        } else {
          logger.error('[IAP Manager] DB unlock not confirmed after retry', {
            transactionId,
            productId,
          });
          
          diagEvent('iap_manager_db_unlock_failed', {
            transactionId,
            productId,
            error: 'DB confirmation failed after retry',
          });
        }
      } else if (validation.status === 'invalid') {
        logger.error('[IAP Manager] Receipt validation failed - not unlocking', {
          transactionId,
          productId,
          reason: validation.reason,
        });
        diagEvent('iap_manager_receipt_validation_failed', {
          transactionId,
          productId,
          reason: validation.reason,
        });
        // Still finish transaction to prevent retry loops, but don't unlock
        await attemptFinishTransaction('post_validation_invalid');
        if (transactionKey) {
          await this.markProcessed(transactionKey);
          await this.clearPendingTransaction();
        }
        
        // Emit outcome event
        diagEvent('iap_manager_purchase_outcome_invalid', {
          transactionId,
          productId,
          validationStatus: 'invalid',
          reason: validation.reason,
          finishAttempted,
          transactionFinished,
        });
        
        const invalidError: any = new Error('Receipt validation failed. Please contact support.');
        invalidError.code = 'RECEIPT_INVALID';
        throw invalidError;
      } else if (validation.status === 'transient') {
        logger.error('[IAP Manager] Receipt validation transient failure - not finishing transaction', {
          transactionId,
          productId,
          reason: validation.reason,
        });
        diagEvent('iap_manager_receipt_validation_transient', {
          transactionId,
          productId,
          reason: validation.reason,
        });
        shouldFinishTransactionOnError = false;
        
        // Emit outcome event
        diagEvent('iap_manager_purchase_outcome_transient', {
          transactionId,
          productId,
          validationStatus: 'transient',
          reason: validation.reason,
          finishAttempted: false,
          transactionFinished: false,
        });
        
        const verificationPendingError: any = new Error('Purchase is being verified. Please try again in a moment.');
        verificationPendingError.code = 'TRANSIENT_VERIFICATION_PENDING';
        await this.persistPendingTransaction(purchase, verificationPendingError.code);
        throw verificationPendingError;
      }

      // CRITICAL: Finish transaction AFTER validation and unlock (required by Apple)
      await attemptFinishTransaction('post_validation_success');
      if (transactionKey) {
        await this.markProcessed(transactionKey);
        await this.clearPendingTransaction();
      }

      // Emit success outcome event after transaction finished
      diagEvent('iap_manager_purchase_outcome_success', {
        transactionId,
        productId,
        validationStatus: 'valid',
        dbConfirmed: true,
        finishAttempted,
        transactionFinished,
      });

      // Clear any previous error state on successful purchase completion
      this.setState({ lastError: null });
    } catch (error: any) {
      logger.error('[IAP Manager] Error processing purchase:', error);

      // Determine if this is a transient error (check error codes first, then fallback to message patterns)
      const isTransient = 
        error?.code === 'TRANSIENT_DB_PENDING' ||
        error?.code === 'TRANSIENT_RECEIPT_MISSING' ||
        error?.code === 'TRANSIENT_PURCHASE_TOKEN_MISSING' ||
        error?.code === 'TRANSIENT_VERIFICATION_PENDING' ||
        error?.message?.includes('Purchase is being verified') ||
        error?.message?.includes('Purchase receipt is being retrieved');

      if (isTransient) {
        // Transient error - don't finish transaction, emit outcome_transient
        diagEvent('iap_manager_purchase_outcome_transient', {
          transactionId,
          productId,
          validationStatus: 'transient',
          reason: error?.code || error?.message || 'transient_error',
          finishAttempted,
          transactionFinished: false,
        });
        await this.persistPendingTransaction(purchase, error?.code || 'transient_error');
        const transientUserMessage = 'We couldn’t verify your purchase yet. Please try again.';
        this.setState({
          lastError: {
            code: error?.code || 'TRANSIENT_VERIFICATION',
            message: error?.message || 'Verification pending',
            userMessage: transientUserMessage,
          },
        });
        updateDiagnosticsState({
          lastError: {
            code: error?.code || 'TRANSIENT_VERIFICATION',
            message: error?.message || 'Verification pending',
          },
        });
      } else {
        // Non-transient error - try to finish transaction best-effort, emit outcome_error
        if (!transactionFinished && shouldFinishTransactionOnError && !finishAttempted) {
          await attemptFinishTransaction('error_cleanup');
        }
        if (transactionKey) {
          await this.markProcessed(transactionKey);
          await this.clearPendingTransaction();
        }

        diagEvent('iap_manager_purchase_outcome_error', {
          transactionId,
          productId,
          validationStatus: 'error',
          reason: error?.code || error?.message || 'unknown_error',
          finishAttempted,
          transactionFinished,
        });

        // Update diagnostics state with user-safe error message
        const iapError = getIAPErrorMessage(error);
        updateDiagnosticsState({
          lastError: {
            code: iapError.code,
            message: iapError.message,
          },
        });

        // P1: Update IapManager state so paywall UI can display the error
        // Only set for non-transient errors (transient errors are handled above)
        this.setState({
          lastError: {
            code: iapError.code,
            message: iapError.message,
            userMessage: iapError.userMessage,
          },
        });
      }
    } finally {
      // TASK 1: Clear purchase guard after processing (success or error)
      this.clearPurchaseGuard('updated');
    }
  }

  /**
   * Handle purchase error
   */
  private handlePurchaseError(error: any): void {
    const isIPad = Platform.OS === 'ios' && Platform.isPad;
    logger.error('[IAP Manager] Purchase error', {
      error,
      code: error?.code,
      domain: error?.domain,
      message: error?.message,
      responseCode: error?.responseCode,
      platform: Platform.OS,
      isIPad,
      deviceModel: Device.modelName || Device.deviceName || 'Unknown',
      iosVersion: Platform.Version,
      bundleId: Constants.expoConfig?.ios?.bundleIdentifier,
    });

    diagEvent('iap_manager_purchaseError', {
      error: {
        code: error?.code || 'UNKNOWN',
        message: error?.message || 'Unknown error',
      },
      isIPad,
      platform: Platform.OS,
    });

    updateDiagnosticsState({
      lastPurchaseError: {
        code: error?.code || 'UNKNOWN',
        message: error?.message || 'Unknown error',
      },
    });

    // P1: Update IapManager state for non-cancellation errors so paywall UI can display them
    const iapError = getIAPErrorMessage(error);
    const isCancelled = iapError.code === 'USER_CANCELLED';
    
    if (!isCancelled) {
      this.setState({
        lastError: {
          code: iapError.code,
          message: iapError.message,
          userMessage: iapError.userMessage,
        },
      });
    }

    // TASK 1: Clear purchase guard on error
    this.clearPurchaseGuard('error');
  }

  /**
   * Load subscription products (with capped retry: max 2 attempts)
   */
  async loadProducts(): Promise<void> {
    // Stop if export mismatch detected - no retries
    if (this.exportMismatchDetected) {
      logger.warn('[IAP Manager] Export mismatch detected - skipping product load');
      return;
    }

    if (this.state.connectionStatus !== 'connected') {
      logger.warn('[IAP Manager] Cannot load products - connection not established');
      return;
    }

    // NEVER overwrite existing products - if we have products, keep them
    if (this.state.products.length > 0) {
      this.loadProductsAttempts = 0;
      logger.log('[IAP Manager] Products already loaded, skipping', {
        existingCount: this.state.products.length,
      });
      return;
    }

    // Cap retries
    if (this.loadProductsAttempts >= this.maxLoadAttempts) {
      logger.error('[IAP Manager] Max load attempts reached', {
        attempts: this.loadProductsAttempts,
      });
      return;
    }

    this.loadProductsAttempts++;
    this.setState({ isLoadingProducts: true });
    updateDiagnosticsState({ isLoadingProducts: true });

    const startTime = Date.now();
    diagEvent('iap_manager_loadProducts_start', {
      skus: SUBSCRIPTION_PRODUCT_IDS,
      attempt: this.loadProductsAttempts,
    });

    try {
      logger.log('[IAP Manager] Loading products...', {
        skus: SUBSCRIPTION_PRODUCT_IDS,
        attempt: this.loadProductsAttempts,
        bundleId: Constants.expoConfig?.ios?.bundleIdentifier,
      });

      let snap = this.getAdapterOrThrow('loadProducts');
      let refreshed = false;
      let { functions, selectedMethods, moduleKeys } = snap;
      const fetchOrder: Array<'fetchProducts' | 'getSubscriptions' | 'getProducts'> = [
        'fetchProducts',
        'getSubscriptions',
        'getProducts',
      ];
      let subscriptionProducts: any[] = [];
      let productFetchMethod: string | null = null;
      let lastFetchError: any = null;

      const callLegacyFetch = async (
        fn: (...args: any[]) => Promise<any>,
        label: 'getSubscriptions' | 'getProducts'
      ) => {
        try {
          return await fn({ skus: SUBSCRIPTION_PRODUCT_IDS });
        } catch (error) {
          if (isMissingFunctionError(error)) {
            throw error;
          }
          try {
            return await fn(SUBSCRIPTION_PRODUCT_IDS);
          } catch {
            throw error;
          }
        }
      };

      for (const method of fetchOrder) {
        if (method === 'fetchProducts' && typeof functions.fetchProducts === 'function') {
          try {
            productFetchMethod = 'fetchProducts';
            subscriptionProducts = await functions.fetchProducts({
              skus: SUBSCRIPTION_PRODUCT_IDS,
              type: 'subs',
            });
            break;
          } catch (error) {
            lastFetchError = error;
            if (isMissingFunctionError(error)) {
              if (!refreshed) {
                snap = getRniapAdapter();
                ({ functions, selectedMethods, moduleKeys } = snap);
                refreshed = true;
              }
              continue;
            }
            throw error;
          }
        }

        if (method === 'getSubscriptions' && typeof functions.getSubscriptions === 'function') {
          try {
            productFetchMethod = 'getSubscriptions';
            subscriptionProducts = await callLegacyFetch(functions.getSubscriptions, 'getSubscriptions');
            break;
          } catch (error) {
            lastFetchError = error;
            if (isMissingFunctionError(error)) {
              if (!refreshed) {
                snap = getRniapAdapter();
                ({ functions, selectedMethods, moduleKeys } = snap);
                refreshed = true;
              }
              continue;
            }
            throw error;
          }
        }

        if (method === 'getProducts' && typeof functions.getProducts === 'function') {
          try {
            productFetchMethod = 'getProducts';
            subscriptionProducts = await callLegacyFetch(functions.getProducts, 'getProducts');
            break;
          } catch (error) {
            lastFetchError = error;
            if (isMissingFunctionError(error)) {
              if (!refreshed) {
                snap = getRniapAdapter();
                ({ functions, selectedMethods, moduleKeys } = snap);
                refreshed = true;
              }
              continue;
            }
            throw error;
          }
        }
      }

      if (!productFetchMethod) {
        const error: any = new Error('No product fetch method available');
        error.code = 'IAP_CAPABILITY_MISSING';
        error.selectedMethods = selectedMethods;
        error.moduleKeys = moduleKeys;
        error.lastFetchError = lastFetchError;
        throw error;
      }

      const duration = Date.now() - startTime;
      this.lastProductFetchMethod = productFetchMethod;

      const rawProductCount = subscriptionProducts?.length || 0;

      // Capture diagnostic info about first product structure (one-time, non-sensitive)
      // Runtime inspection: log first product structure for debugging (guarded by __DEV__)
      let firstProductDiagnostics: any = null;
      let firstRawKeys: string[] = [];
      if (subscriptionProducts && subscriptionProducts.length > 0) {
        const firstProduct = subscriptionProducts[0];
        if (firstProduct && typeof firstProduct === 'object') {
          firstRawKeys = Object.keys(firstProduct);
          const keys = firstRawKeys.slice(0, 15); // Limit to first 15 keys for diagnostics
          
          // One-time debug log (guarded by __DEV__) - redact sensitive data
          if (__DEV__) {
            const sanitizedProduct: any = {};
            for (const key of firstRawKeys.slice(0, 20)) {
              const value = firstProduct[key];
              if (key.includes('receipt') || key.includes('transaction')) {
                sanitizedProduct[key] = '[REDACTED]';
              } else if (typeof value === 'string' && value.length > 100) {
                sanitizedProduct[key] = value.substring(0, 100) + '...';
              } else {
                sanitizedProduct[key] = value;
              }
            }
            logger.log('[IAP Manager] First product structure (raw IAP product):', {
              keys: firstRawKeys,
              sample: JSON.stringify(sanitizedProduct, null, 2).substring(0, 500),
            });
          }

          firstProductDiagnostics = {
            firstProductKeys: keys,
            candidateIdFields: {
              productId: typeof firstProduct.productId,
              productIdentifier: typeof firstProduct.productIdentifier,
              id: typeof firstProduct.id,
              sku: typeof firstProduct.sku,
              identifier: typeof firstProduct.identifier,
            },
          };
        }
      }

      // Normalize products using normalizeProduct() function
      const normalizedProducts: IAPProduct[] = [];
      const rawProductIds: (string | null)[] = [];
      const normalizationErrors: Array<{ index: number; fields: string[] }> = [];

      for (let i = 0; i < (subscriptionProducts || []).length; i++) {
        const raw = subscriptionProducts[i];
        const normalized = normalizeProduct(raw);
        
        if (normalized) {
          normalizedProducts.push(normalized);
          rawProductIds.push(normalized.productId);
        } else {
          // Product normalization failed - collect info for error message
          rawProductIds.push(null);
          const availableFields = raw && typeof raw === 'object' ? Object.keys(raw) : [];
          normalizationErrors.push({
            index: i,
            fields: availableFields,
          });
        }
      }

      // If normalization failed for any products, raise terminal error
      if (normalizationErrors.length > 0 && normalizedProducts.length === 0) {
        const errorFields = normalizationErrors.map(e => `Product ${e.index}: fields present [${e.fields.join(', ')}]`).join('; ');
        const errorMsg = `Product normalization failed. ${errorFields}. Tried: productId, productIdentifier, id, sku, identifier`;
        
        const normalizedError = {
          code: 'PRODUCT_NORMALIZATION_FAILED',
          message: errorMsg,
          userMessage: 'Unable to load subscription options. Please try again later.',
        };

        this.setState({
          products: [],
          isLoadingProducts: false,
          lastError: normalizedError,
          pricesMissing: false,
        });

        updateDiagnosticsState({
          isReady: false,
          isLoadingProducts: false,
          productsReturnedCount: 0,
          productIdsReturned: [],
          lastError: normalizedError,
          rawProductCount,
          normalizedProductCount: 0,
          firstRawKeys,
        });

        diagEvent('iap_manager_loadProducts_error', {
          error: normalizedError,
          attempts: this.loadProductsAttempts,
          rawProductCount,
          normalizedProductCount: 0,
          normalizationErrors,
          firstRawKeys,
        }, duration);

        return; // Terminal error - no retry
      }

      const validProductIds = normalizedProducts.map(p => p.productId);
      const missingSkus = SUBSCRIPTION_PRODUCT_IDS.filter(id => !validProductIds.includes(id));
      const hasValidProducts = normalizedProducts.length > 0 && missingSkus.length < SUBSCRIPTION_PRODUCT_IDS.length;

      // TASK 5: Fix pricesMissing logic - true only if BOTH localizedPrice AND price are empty
      const expectedSkus = [MONTHLY_PRODUCT_ID, YEARLY_PRODUCT_ID];
      const pricesMissing = expectedSkus.some(sku => {
        const product = normalizedProducts.find(p => p.productId === sku);
        if (!product) return false; // Product not found is handled separately
        // pricesMissing = true only if BOTH are empty
        const hasLocalizedPrice = product.localizedPrice && product.localizedPrice.trim() !== '';
        const hasPrice = product.price && product.price.trim() !== '';
        return !hasLocalizedPrice && !hasPrice;
      });

      // Verify each required SKU has usable price and emit terminal event if missing
      const missingPriceSkus: string[] = [];
      expectedSkus.forEach(sku => {
        const product = normalizedProducts.find(p => p.productId === sku);
        if (product) {
          const hasLocalizedPrice = product.localizedPrice && product.localizedPrice.trim() !== '';
          const hasPrice = product.price && product.price.trim() !== '';
          if (!hasLocalizedPrice && !hasPrice) {
            missingPriceSkus.push(sku);
          }
        }
      });

      if (missingPriceSkus.length > 0) {
        diagEvent('iap_manager_prices_missing_terminal', {
          missingPriceSkus,
          receivedSkus: validProductIds,
          firstRawKeys,
          productFetchMethod,
        });
      }

      logger.log('[IAP Manager] Products loaded', {
        count: rawProductCount,
        validCount: normalizedProducts.length,
        validProductIds,
        missingSkus,
        pricesMissing,
        duration,
      });

      diagEvent('iap_manager_loadProducts_success', {
        count: rawProductCount,
        validCount: normalizedProducts.length,
        productIds: validProductIds,
        rawProductIds,
        missingSkus,
        step: 'fetchProducts_ok',
        productFetchMethod,
        rawProductCount,
        normalizedProductCount: normalizedProducts.length,
        normalizedProductIds: validProductIds,
        firstRawKeys,
        pricesMissing,
        ...(firstProductDiagnostics || {}),
      }, duration);

      // Validate: must have at least one valid product matching expected SKUs
      if (!hasValidProducts) {
        const errorMsg = missingSkus.length === SUBSCRIPTION_PRODUCT_IDS.length
          ? 'No valid products returned from StoreKit'
          : `Missing expected products: ${missingSkus.join(', ')}`;
        
        const normalizedError = {
          code: 'PRODUCT_ID_MISSING_OR_MISMATCH',
          message: errorMsg,
          userMessage: 'Unable to load subscription options. Please check your connection and try again.',
        };

        this.setState({
          products: [],
          isLoadingProducts: false,
          lastError: normalizedError,
        });

        updateDiagnosticsState({
          isReady: false,
          isLoadingProducts: false,
          productsReturnedCount: normalizedProducts.length,
          productIdsReturned: validProductIds,
          lastError: normalizedError,
          rawProductCount,
          normalizedProductCount: normalizedProducts.length,
          normalizedProductIds: validProductIds,
          firstRawKeys,
          pricesMissing: false,
        });

        diagEvent('iap_manager_loadProducts_error', {
          error: normalizedError,
          attempts: this.loadProductsAttempts,
          missingSkus,
          validProductIds,
        }, duration);

        // Retry if under limit
        if (this.loadProductsAttempts < this.maxLoadAttempts) {
          logger.warn('[IAP Manager] Invalid products returned, retrying...', {
            attempt: this.loadProductsAttempts,
            missingSkus,
            validProductIds,
          });
          await new Promise(resolve => setTimeout(resolve, 1000 + (this.loadProductsAttempts * 500)));
          return this.loadProducts();
        }

        return; // Max attempts reached
      }

      // Success: we have valid products
      this.loadProductsAttempts = 0; // Reset on success
      
      // isReady is true only when: connected, products loaded, and all expected SKUs present
      // AND prices are available (not missing)
      const isReady = 
        this.state.connectionStatus === 'connected' &&
        normalizedProducts.length > 0 &&
        missingSkus.length === 0 &&
        !pricesMissing;

      // Set terminal error if prices missing (user-friendly message)
      const terminalError = pricesMissing ? {
        code: 'PRICES_MISSING',
        message: 'Product prices not available from App Store',
        userMessage: 'Subscription pricing unavailable. Please try again later.',
      } : null;

      this.setState({
        products: normalizedProducts,
        isLoadingProducts: false,
        lastError: terminalError,  // Set error if prices missing
        pricesMissing,
      });

      updateDiagnosticsState({
        isReady,
        isLoadingProducts: false,
        productsReturnedCount: normalizedProducts.length,
        productIdsReturned: validProductIds,
        lastError: null,
        rawProductCount,
        normalizedProductCount: normalizedProducts.length,
        normalizedProductIds: validProductIds,
        firstRawKeys,
        pricesMissing,
      });

      diagEvent('iap_manager_products_set', {
        count: normalizedProducts.length,
        productIds: validProductIds,
        missingSkus,
        isReady,
      });
    } catch (error: any) {
      const duration = Date.now() - startTime;
      
      // Check if this is a capability mismatch error - stop retries immediately
      if (error?.code === 'IAP_CAPABILITY_MISSING' || error?.message?.includes('IAP_CAPABILITY_MISSING')) {
        this.exportMismatchDetected = true;
        const normalizedError = {
          code: 'IAP_CAPABILITY_MISSING',
          message: error.message || 'IAP capability validation failed',
          userMessage: 'Purchases unavailable due to a configuration error. Please contact support.',
        };

        logger.error('[IAP Manager] Capability mismatch detected during product load - stopping retries', {
          error,
          missing: error?.missing || [],
          capabilities: error?.capabilities || {},
          moduleKeys: error?.moduleKeys || [],
        });

        this.setState({
          isLoadingProducts: false,
          lastError: normalizedError,
          // DO NOT overwrite products - keep existing if any
        });

        updateDiagnosticsState({
          isLoadingProducts: false,
          lastError: normalizedError,
        });

        diagEvent('iap_manager_loadProducts_error', {
          error: normalizedError,
          attempts: this.loadProductsAttempts,
          capabilityMismatch: true,
        }, duration);

        return; // Stop - no retries
      }

      const iapError = getIAPErrorMessage(error);
      const normalizedError = {
        code: iapError.code,
        message: iapError.message,
        userMessage: iapError.userMessage,
      };

      logger.error('[IAP Manager] Failed to load products', {
        error,
        code: error?.code,
        message: error?.message,
        attempt: this.loadProductsAttempts,
      });

      // Retry if under limit (only for non-export-mismatch errors)
      if (this.loadProductsAttempts < this.maxLoadAttempts) {
        logger.log('[IAP Manager] Retrying product load...', {
          attempt: this.loadProductsAttempts,
          maxAttempts: this.maxLoadAttempts,
        });
        await new Promise(resolve => setTimeout(resolve, 1000 + (this.loadProductsAttempts * 500))); // 1s, 1.5s
        return this.loadProducts();
      }

      // Max attempts reached - but DO NOT overwrite products if we had them before
      this.setState({
        // Only set products to [] if we never had products
        products: this.state.products.length > 0 ? this.state.products : [],
        isLoadingProducts: false,
        lastError: normalizedError,
      });

      updateDiagnosticsState({
        isLoadingProducts: false,
        productsReturnedCount: 0,
        productIdsReturned: [],
        lastError: normalizedError,
        rawProductCount: 0,
        normalizedProductCount: 0,
        normalizedProductIds: [],
        pricesMissing: false,
      });

      diagEvent('iap_manager_loadProducts_error', {
        error: normalizedError,
        attempts: this.loadProductsAttempts,
      }, duration);
    }
  }

  /**
   * Multi-signature requestPurchase with full observability
   * Tries signatures in order, stops at first success
   */
  private async requestSubscriptionNitroSafe(
    sku: string,
    requestPurchaseFn: (...args: any[]) => Promise<any>
  ): Promise<string> {
    // Define signatures in exact order
    // Doc-correct signature with request.apple/request.google must be tried early (top 3)
    const signatures = [
      {
        name: 'requestPurchase({request:{apple:{sku},google:{skus}},type})',
        params: {
          request: {
            apple: { sku },
            google: { skus: [sku] },
          },
          type: 'subs',
        },
      },
      {
        name: 'requestPurchase({sku})',
        params: { sku },
      },
      {
        name: 'requestPurchase({sku,quantity})',
        params: { sku, quantity: 1 },
      },
      {
        name: 'requestPurchase({skus})',
        params: { skus: [sku] },
      },
      {
        name: 'requestPurchase({skus,quantity})',
        params: { skus: [sku], quantity: 1 },
      },
      {
        name: 'requestPurchase({productId})',
        params: { productId: sku },
      },
      {
        name: 'requestPurchase({productId,quantity})',
        params: { productId: sku, quantity: 1 },
      },
      {
        name: 'requestPurchase({sku,type})',
        params: { sku, type: 'subs' },
      },
      {
        name: 'requestPurchase({sku,quantity,type})',
        params: { sku, quantity: 1, type: 'subs' },
      },
    ];

    const attemptResults: Array<{
      signatureName: string;
      paramsKeys: string[];
      errorCode: string;
      errorMessage: string;
    }> = [];

    let lastError: any = null;
    let lastErrorCode = '';
    let lastErrorMessage = '';

    for (const signature of signatures) {
      const paramsKeys = Object.keys(signature.params).sort();

      try {
        diagEvent('iap_requestPurchase_attempt', {
          sku,
          signatureName: signature.name,
          paramsKeys,
        });

        await requestPurchaseFn(signature.params);

        diagEvent('iap_requestPurchase_signature_success', {
          sku,
          signatureName: signature.name,
        });

        return signature.name;
      } catch (error: any) {
        lastError = error;
        lastErrorCode = error?.code ?? '';
        lastErrorMessage = error?.message ?? String(error);

        attemptResults.push({
          signatureName: signature.name,
          paramsKeys,
          errorCode: lastErrorCode,
          errorMessage: lastErrorMessage,
        });

        diagEvent('iap_requestPurchase_signature_failed', {
          sku,
          signatureName: signature.name,
          errorCode: lastErrorCode,
          errorMessage: lastErrorMessage,
        });

        // Determine if we should try next signature (case-insensitive)
        const msg = (lastErrorMessage || '').toLowerCase();
        const code = (lastErrorCode || '').toLowerCase();

        const shouldTryNext =
          (msg.includes('missing') && msg.includes('configuration')) ||
          (msg.includes('sku') && msg.includes('required')) ||
          (msg.includes('invalid') && msg.includes('request')) ||
          code.includes('invalid_request') ||
          code.includes('e_invalid_request');

        if (!shouldTryNext) {
          // Non-configuration errors (user cancelled, network, etc.) - don't try more
          throw error;
        }
      }
    }

    // All signatures failed
    const finalError: any = new Error(
      `All requestPurchase signatures failed. Last error: ${lastErrorMessage}`
    );
    finalError.code = 'PURCHASE_SIGNATURE_FAILED';
    finalError.sku = sku;
    finalError.signaturesTried = signatures.map(s => s.name);
    finalError.attemptResults = attemptResults;
    finalError.lastErrorCode = lastErrorCode;
    finalError.lastErrorMessage = lastErrorMessage;

    diagEvent('iap_manager_requestPurchase_all_signatures_failed', {
      sku,
      signaturesTried: signatures.map(s => s.name),
      attemptResults,
      lastErrorCode,
      lastErrorMessage,
    });

    throw finalError;
  }

  /**
   * Request subscription purchase
   */
  async buy(productId: string): Promise<void> {
    if (this.state.connectionStatus !== 'connected') {
      throw new Error('Store connection is not available. Please check your internet connection.');
    }

    if (this.state.products.length === 0) {
      throw new Error('Products not loaded. Please wait for products to load.');
    }

    const product = this.state.products.find(p => p.productId === productId);
    
    // Compute SKU with fallback - ensure we have a valid identifier
    const sku = product?.productId || productId;
    
    // Validate SKU: must be non-empty string and in SUBSCRIPTION_PRODUCT_IDS
    if (!sku || typeof sku !== 'string' || sku.trim() === '') {
      const errorMsg = 'Invalid SKU: SKU must be a non-empty string';
      logger.error('[IAP Manager] Purchase blocked: invalid SKU', {
        productId,
        sku,
        productFound: !!product,
      });
      diagEvent('paywall_purchase_blocked_invalid_sku', {
        productId,
        sku: sku || 'empty',
        productFound: !!product,
        reason: 'sku_empty_or_invalid',
      });
      throw new Error(errorMsg);
    }
    
    if (!(SUBSCRIPTION_PRODUCT_IDS as readonly string[]).includes(sku)) {
      const errorMsg = `Invalid product ID: ${sku}. Must be one of: ${SUBSCRIPTION_PRODUCT_IDS.join(', ')}`;
      logger.error('[IAP Manager] Purchase blocked: SKU not in allowed list', {
        sku,
        allowedSkus: SUBSCRIPTION_PRODUCT_IDS,
      });
      diagEvent('paywall_purchase_blocked_invalid_sku', {
        productId: sku,
        allowedSkus: SUBSCRIPTION_PRODUCT_IDS,
        reason: 'sku_not_in_allowed_list',
      });
      throw new Error(errorMsg);
    }
    
    if (!product) {
      throw new Error(`Product not available. Please ensure subscription options are loaded.`);
    }

    // Skip on web/Expo Go
    if (Platform.OS === 'web' || isExpoGo) {
      const { setLocalProCache } = await import('../../iap/iap');
      await setLocalProCache();
      return;
    }

    // TASK B1: Set pendingPurchase and guard BEFORE requestPurchase
    // Single-flight guard: prevent repeated purchase attempts
    if (this.purchaseInProgress) {
      logger.warn('[IAP Manager] Purchase blocked: already in progress', {
        productId,
        sku,
      });
      diagEvent('iap_manager_buy_blocked', {
        productId,
        sku,
        reason: 'purchase_in_progress',
        blockedByGuard: true,
      });
      throw new Error('Purchase already in progress. Please wait for the current purchase to complete.');
    }

    // TASK B1: Set guard and pendingPurchase BEFORE requestPurchase
    this.purchaseInProgress = true;
    this.pendingPurchase = { sku, startedAt: Date.now() };
    // P1: Clear previous error when starting new purchase attempt
    this.setState({ lastError: null });
    const startTime = Date.now();
    
    // TASK B1: Start 90s timeout failsafe
    this.purchaseTimeoutId = setTimeout(() => {
      if (this.purchaseInProgress && this.pendingPurchase) {
        logger.error('[IAP Manager] Purchase timeout - clearing stuck purchase guard', {
          sku: this.pendingPurchase.sku,
          age: Date.now() - this.pendingPurchase.startedAt,
        });
        diagEvent('iap_manager_purchase_timeout', {
          sku: this.pendingPurchase.sku,
          age: Date.now() - this.pendingPurchase.startedAt,
          reason: 'timeout_90s',
        });
        
        // Set user-friendly error
        const timeoutError = {
          code: 'PURCHASE_TIMEOUT',
          message: 'Purchase timed out. Please try again.',
          userMessage: 'Purchase timed out. Please try again or contact support.',
        };
        this.setState({ lastError: timeoutError });
        updateDiagnosticsState({ lastPurchaseError: timeoutError });
        
        this.clearPurchaseGuard('timeout');
      }
    }, 90000); // 90 seconds
    
    diagEvent('iap_manager_buy_start', {
      productId,
      sku,
      selectedPurchaseMethod: getRniapAdapter().selectedMethods.purchase,
      requestSignatureUsed: 'will_determine_in_requestSubscriptionNitroSafe',
    });
    
    diagEvent('iap_manager_purchase_guard_set', {
      sku,
      reason: 'buy_called',
    });

    try {
      logger.log('[IAP Manager] Requesting purchase', {
        productId,
        bundleId: Constants.expoConfig?.ios?.bundleIdentifier,
      });

      let snap = this.getAdapterOrThrow('buy');
      let { functions, selectedMethods, moduleKeys } = snap;
      if (selectedMethods.purchase === 'none') {
        const error: any = new Error('No purchase method available');
        error.code = 'IAP_CAPABILITY_MISSING';
        error.selectedMethods = selectedMethods;
        error.moduleKeys = moduleKeys;
        throw error;
      }

      // Request purchase using best available method
      // Enhanced logging for iPad debugging
      const isIPad = Platform.OS === 'ios' && Platform.isPad;
      logger.log('[IAP Manager] Requesting purchase (capability-based)', {
        productId,
        sku,
        isIPad,
        deviceModel: Device.modelName || Device.deviceName || 'Unknown',
        iosVersion: Platform.Version,
      });

      // Emit telemetry before calling purchase handler
      diagEvent('iap_buy_about_to_call_requestSubscriptionNitroSafe', {
        sku,
        productId,
        selectedPurchaseMethod: selectedMethods.purchase,
        isNewArch,
        connectionStatus: this.state.connectionStatus,
        listenersRegistered: this.state.listenersRegistered,
        purchaseInProgress: this.purchaseInProgress,
        pendingPurchaseSku: this.pendingPurchase?.sku || null,
      });

      let signatureName = 'unknown';
      if (selectedMethods.purchase === 'requestPurchase') {
        if (typeof functions.requestPurchase !== 'function') {
          throw new Error('requestPurchase not available');
        }
        signatureName = await this.requestSubscriptionNitroSafe(sku, functions.requestPurchase);
        this.lastPurchaseMethod = 'requestPurchase';
      } else if (selectedMethods.purchase === 'requestSubscription') {
        if (typeof functions.requestSubscription !== 'function') {
          throw new Error('requestSubscription not available');
        }
        try {
          await functions.requestSubscription({ sku });
          signatureName = 'requestSubscription({sku})';
        } catch (error: any) {
          if (isMissingFunctionError(error)) {
            snap = getRniapAdapter();
            ({ functions, selectedMethods, moduleKeys } = snap);
            if (typeof functions.requestPurchase === 'function') {
              signatureName = await this.requestSubscriptionNitroSafe(sku, functions.requestPurchase);
              this.lastPurchaseMethod = 'requestPurchase';
              // Continue with success path
            } else {
              throw error;
            }
          }
          if (typeof functions.requestSubscription !== 'function') {
            throw new Error('requestSubscription not available');
          }
          await functions.requestSubscription({ sku, quantity: 1 });
          signatureName = 'requestSubscription({sku,quantity})';
        }
        this.lastPurchaseMethod = 'requestSubscription';
      }

      const duration = Date.now() - startTime;
      logger.log('[IAP Manager] Purchase request submitted', {
        productId,
        sku,
        duration,
      });

      diagEvent('iap_manager_buy_success', {
        productId,
        sku,
        selectedPurchaseMethod: selectedMethods.purchase,
        signatureName,
      }, duration);

      // Purchase completion is handled by purchaseUpdatedListener
    } catch (error: any) {
      const duration = Date.now() - startTime;
      const iapError = getIAPErrorMessage(error);

      logger.error('[IAP Manager] Purchase request failed', {
        error,
        productId,
        sku,
        code: error?.code,
        message: error?.message,
      });

      diagEvent('iap_manager_buy_error', {
        error: {
          code: iapError.code,
          message: iapError.message,
        },
        productId,
        sku,
        selectedPurchaseMethod: getRniapAdapter().selectedMethods.purchase,
        attemptResults: error?.attemptResults || undefined,
        signaturesTried: error?.signaturesTried || undefined,
        lastErrorCode: error?.lastErrorCode || undefined,
        lastErrorMessage: error?.lastErrorMessage || undefined,
      }, duration);

      updateDiagnosticsState({
        lastPurchaseError: {
          code: iapError.code,
          message: iapError.message,
        },
      });

      // CRITICAL FIX: Clear guard on synchronous error
      // If requestPurchase throws synchronously (before listener callback),
      // handlePurchaseError will never fire, so we must clear guard here
      // This prevents stuck purchase state after synchronous errors
      this.clearPurchaseGuard('error');
      
      throw error;
    }
    // Note: Guard is cleared in handlePurchaseUpdate/handlePurchaseError for async errors
    // Guard is cleared here for synchronous errors (before listener callback)
  }

  /**
   * TASK 1: Clear purchase guard helper (called from callbacks or timeout)
   */
  private clearPurchaseGuard(reason: 'updated' | 'error' | 'timeout'): void {
    if (this.purchaseTimeoutId) {
      clearTimeout(this.purchaseTimeoutId);
      this.purchaseTimeoutId = null;
    }
    
    const wasInProgress = this.purchaseInProgress;
    const pendingSku = this.pendingPurchase?.sku;
    
    this.purchaseInProgress = false;
    this.pendingPurchase = null;
    
    if (wasInProgress) {
      logger.log('[IAP Manager] Purchase guard cleared', {
        reason,
        sku: pendingSku,
      });
      diagEvent('iap_manager_purchase_guard_cleared', {
        reason,
        sku: pendingSku || 'unknown',
      });
    }
  }

  /**
   * Confirm DB entitlement by polling checkProStatus() with backoff
   * Returns confirmed status and number of attempts made
   */
  private async confirmDbEntitlement(): Promise<{ confirmed: boolean; attempts: number }> {
    const delays = [250, 500, 1000]; // ms backoff delays
    let attempts = 0;

    for (let i = 0; i < delays.length; i++) {
      attempts++;
      try {
        const isUnlocked = await checkProStatus();
        if (isUnlocked) {
          logger.log('[IAP Manager] DB entitlement confirmed', {
            attempts,
            delay: delays[i - 1] || 0,
          });
          return { confirmed: true, attempts };
        }
      } catch (error) {
        logger.warn('[IAP Manager] Error checking DB entitlement', {
          attempt: attempts,
          error,
        });
      }

      // Wait before next attempt (except on last iteration)
      if (i < delays.length - 1) {
        await new Promise(resolve => setTimeout(resolve, delays[i]));
      }
    }

    logger.warn('[IAP Manager] DB entitlement not confirmed after all attempts', {
      attempts,
    });
    return { confirmed: false, attempts };
  }

  /**
   * Restore purchases
   * Returns typed outcome to distinguish success, none found, cancelled, and error cases
   */
  async restore(): Promise<{
    outcome: 'success' | 'none_found' | 'cancelled' | 'error';
    foundPurchases: number;
    dbConfirmed?: boolean;
  }> {
    if (Platform.OS === 'web' || isExpoGo) {
      const isUnlocked = await checkProStatus();
      return { outcome: isUnlocked ? 'success' : 'none_found', foundPurchases: 0 };
    }

    if (this.state.connectionStatus !== 'connected') {
      const isUnlocked = await checkProStatus();
      return { outcome: isUnlocked ? 'success' : 'none_found', foundPurchases: 0 };
    }

    const startTime = Date.now();
    diagEvent('iap_manager_restore_start', {});

    try {
      logger.log('[IAP Manager] Restoring purchases...');

      let snap;
      try {
        snap = this.getAdapterOrThrow('restore');
      } catch {
        snap = getRniapAdapter();
      }
      const { functions, selectedMethods } = snap;
      const restoreOrder = ['restorePurchases', 'getAvailablePurchases'] as const;
      let purchases: any[] = [];
      let restoreMethod: (typeof restoreOrder)[number] | null = null;
      let lastError: any = null;

      for (const method of restoreOrder) {
        if (method === 'restorePurchases' && typeof functions.restorePurchases === 'function') {
          try {
            restoreMethod = 'restorePurchases';
            await functions.restorePurchases();
            if (typeof functions.getAvailablePurchases === 'function') {
              purchases = await functions.getAvailablePurchases();
            } else {
              purchases = [];
            }
            break;
          } catch (error) {
            lastError = error;
            if (isMissingFunctionError(error)) {
              continue;
            }
            throw error;
          }
        }

        if (method === 'getAvailablePurchases' && typeof functions.getAvailablePurchases === 'function') {
          try {
            restoreMethod = 'getAvailablePurchases';
            purchases = await functions.getAvailablePurchases();
            break;
          } catch (error) {
            lastError = error;
            if (isMissingFunctionError(error)) {
              continue;
            }
            throw error;
          }
        }
      }

      if (!restoreMethod) {
        // No restore API - fall back to DB check without throwing
        const isUnlocked = await checkProStatus();
        this.lastRestoreMethod = 'none';
        return { outcome: isUnlocked ? 'success' : 'none_found', foundPurchases: 0 };
      }

      this.lastRestoreMethod = restoreMethod;

      logger.log('[IAP Manager] Available purchases retrieved', {
        count: purchases?.length || 0,
        purchases: purchases?.map((p: any) => ({
          productId: getProductId(p),
          transactionId: (p as any).transactionId || (p as any).transactionIdentifier,
        })),
      });

      if (purchases && Array.isArray(purchases) && purchases.length > 0) {
        const validProductIds = [MONTHLY_PRODUCT_ID, YEARLY_PRODUCT_ID];
        const proPurchase = purchases.find((p: any) => {
          const pid = getProductId(p);
          return pid && validProductIds.includes(pid);
        });

        if (proPurchase) {
          const transactionId = (proPurchase as any).transactionId || (proPurchase as any).transactionIdentifier;
          const productId = getProductId(proPurchase);
          
          if (!productId) {
            logger.warn('[IAP Manager] Found purchase but could not extract product ID');
            return { outcome: 'none_found', foundPurchases: purchases?.length || 0 };
          }

          // Platform-specific receipt/token extraction
          let receipt: string | undefined;
          let purchaseToken: string | undefined;
          let hasRequiredReceiptToken = false;
          
          if (Platform.OS === 'ios') {
            // iOS: require receipt
            try {
              if (typeof functions.getReceiptIOS === 'function') {
                receipt = await functions.getReceiptIOS();
              }
            } catch (receiptError) {
              logger.warn('[IAP Manager] Could not get iOS receipt for restore:', receiptError);
            }
            
            hasRequiredReceiptToken = !!receipt;
            if (!hasRequiredReceiptToken) {
              logger.warn('[IAP Manager] iOS receipt not available for restore validation', {
                transactionId,
                productId,
              });
            }
          } else {
            // Android: require purchaseToken
            purchaseToken = proPurchase.purchaseToken || undefined;
            hasRequiredReceiptToken = !!purchaseToken;
            
            if (!hasRequiredReceiptToken) {
              logger.warn('[IAP Manager] Android purchaseToken not available for restore validation', {
                transactionId,
                productId,
              });
            }
          }

          // Only validate if we have the required receipt/token
          if (!hasRequiredReceiptToken) {
            // Cannot validate without required receipt/token - return with none_found
            logger.warn('[IAP Manager] Cannot restore: receipt/token not available for validation', {
              platform: Platform.OS,
              transactionId,
              productId,
            });
            return { outcome: 'none_found', foundPurchases: purchases?.length || 0 };
          }

          // Validate receipt
          const validation = await validateReceiptWithServer({
            platform: Platform.OS as 'ios' | 'android',
            receipt,
            purchaseToken,
            transactionId,
            productId,
          });

          if (validation.status === 'valid') {
            // Use setLocalProCache (non-authoritative) after DB confirmation
            const { setLocalProCache } = await import('../../iap/iap');
            const cacheSet = await setLocalProCache();
            if (cacheSet) {
              logger.log('[IAP Manager] Local Pro cache set after restore (DB confirmed)', {
                transactionId,
                productId,
              });
            } else {
              logger.error('[IAP Manager] DB unlock not confirmed after restore', {
                transactionId,
                productId,
              });
            }
            diagEvent('iap_manager_restore_success', {
              foundPurchases: purchases?.length || 0,
              restoredProductId: productId,
              dbConfirmed: cacheSet,
            }, Date.now() - startTime);
            return { outcome: 'success', foundPurchases: purchases?.length || 0, dbConfirmed: cacheSet };
          }
        }
      }

      // Fallback to database check
      const isUnlocked = await checkProStatus();

      logger.log('[IAP Manager] Restore completed', {
        foundPurchases: purchases?.length || 0,
        isUnlocked,
      });

      diagEvent('iap_manager_restore_success', {
        foundPurchases: purchases?.length || 0,
        isUnlocked,
      }, Date.now() - startTime);
      
      return { outcome: isUnlocked ? 'success' : 'none_found', foundPurchases: purchases?.length || 0 };
    } catch (error: any) {
      const duration = Date.now() - startTime;
      const iapError = getIAPErrorMessage(error);
      
      // Detect USER_CANCELLED and emit with cancelled flag
      const isCancelled = iapError.code === 'USER_CANCELLED' || 
                         error?.code === 'E_USER_CANCELLED' ||
                         error?.message?.toLowerCase().includes('cancel') ||
                         error?.message?.toLowerCase().includes('request canceled');

      logger.error('[IAP Manager] Restore error', error);

      diagEvent('iap_manager_restore_error', {
        error: {
          code: iapError.code,
          message: iapError.message,
          cancelled: isCancelled,
        },
      }, duration);
      
      // Return typed outcome instead of throwing
      return { 
        outcome: isCancelled ? 'cancelled' : 'error', 
        foundPurchases: 0 
      };
    }
  }

  /**
   * Manual retry of product loading
   * Only works if export mismatch is not detected
   */
  async retryLoadProducts(): Promise<void> {
    if (this.exportMismatchDetected) {
      logger.warn('[IAP Manager] Cannot retry - export mismatch detected. Re-initialize required.');
      return;
    }

    this.loadProductsAttempts = 0; // Reset counter
    this.setState({ lastError: null });
    await this.loadProducts();
  }

  async recoverNow(): Promise<{ outcome: 'attempted' | 'no_pending' | 'busy' | 'error' }> {
    if (this.recoveryInProgress) {
      diagEvent('iap_recover_now_busy', {});
      return { outcome: 'busy' };
    }
    this.recoveryInProgress = true;
    try {
      const hasPending = await this.hasPendingTransaction();
      if (!hasPending) {
        diagEvent('iap_recover_now_no_pending', {});
        return { outcome: 'no_pending' };
      }
      diagEvent('iap_recover_now_attempted', {});
      await this.recoverPendingTransactionOnce();
      return { outcome: 'attempted' };
    } catch (error: any) {
      diagEvent('iap_recover_now_error', { error: error?.message || String(error) });
      return { outcome: 'error' };
    } finally {
      this.recoveryInProgress = false;
    }
  }

  async retryInit(): Promise<void> {
    if (this.initPromise) {
      return;
    }
    this.exportMismatchDetected = false;
    this.terminalError = false;
    this.setState({ lastError: null });
    diagEvent('iap_manager_step', { step: 'retry_init_requested' });
    await this.initialize();
  }

  async openManageSubscriptions(): Promise<boolean> {
    try {
      const { functions } = getRniapAdapter();
      if (typeof functions.deepLinkToSubscriptions === 'function') {
        diagEvent('iap_manager_manage_subscriptions_called', { method: 'deepLinkToSubscriptions' });
        await functions.deepLinkToSubscriptions();
        return true;
      }
    } catch (error: any) {
      diagEvent('iap_manager_manage_subscriptions_failed', {
        error: {
          code: error?.code || 'UNKNOWN',
          message: error?.message || String(error),
        },
      });
      logger.warn('[IAP Manager] Manage subscriptions handler failed', error);
    }
    return false;
  }

  /**
   * Tear down IAP connection
   */
  async tearDown(): Promise<void> {
    try {
      // Remove listeners
      const hadUpdateSub = !!this.purchaseUpdateSubscription;
      const hadErrorSub = !!this.purchaseErrorSubscription;
      
      if (this.purchaseUpdateSubscription) {
        this.purchaseUpdateSubscription.remove();
        this.purchaseUpdateSubscription = null;
      }
      if (this.purchaseErrorSubscription) {
        this.purchaseErrorSubscription.remove();
        this.purchaseErrorSubscription = null;
      }
      
      // Emit diagnostic event for listener cleanup
      diagEvent('iap_manager_listeners_unregistered', {
        hadUpdateSub,
        hadErrorSub,
      });

      // End connection
      if (this.state.isInitialized && this.state.connectionStatus === 'connected') {
        const { functions } = getRniapAdapter();
        if (typeof functions.endConnection === 'function') {
          await functions.endConnection();
        }
      }

      this.setState({
        connectionStatus: 'disconnected',
        isInitialized: false,
        listenersRegistered: false,
        products: [], // Clear products on tear down
      });

      this.loadProductsAttempts = 0;
      this.exportMismatchDetected = false; // Reset flag to allow re-initialization
      this.terminalError = false; // Reset terminal error flag

      logger.log('[IAP Manager] Tear down complete');
      diagEvent('iap_manager_tearDown_success', {});
    } catch (error: any) {
      logger.error('[IAP Manager] Error during tear down', error);
      // Reset state even if tear down fails
      this.setState({
        connectionStatus: 'disconnected',
        isInitialized: false,
        listenersRegistered: false,
        products: [],
      });
    }
  }

  /**
   * Get diagnostic information - actionable for TestFlight debugging
   * Includes self-check verification of capability selection and function usage
   */
  getDiagnostics(): {
    state: IapManagerState;
      exportDiagnostics: {
        requiredExportsPresent: boolean;
        missing: string[];
        capabilities: CapabilityDiagnostics['capabilities'];
        selectedProductFetchMethod: string;
        selectedPurchaseMethod: string;
        selectedRestoreMethod: string;
        lastProductFetchMethod: string | null;
        lastPurchaseMethod: string | null;
        lastRestoreMethod: string | null;
        isNewArch: boolean;
        executionEnvironment: string;
        nativeModuleKeys: string[];
        nativeModuleKeysCount: number;
        selfCheck: {
          productFetchFunction: string;
          purchaseFunction: string;
          conversionPresent: boolean;
          conversionUsed: boolean;
        };
      };
    bundleId: string;
    isTestFlight: boolean;
    productIdsConfigured: string[];
    exportMismatchDetected: boolean;
    lastSuccessfulStep: string;
    productsLoadedCount: number;
    connectionStatus: string;
    lastError: { code: string; message: string; userMessage: string } | null;
    skusRequested: string[];
    skusReceived: string[];
    missingSkus: string[];
  } {
    const state = this.getState();
    const capabilityDiagnostics = getCapabilityDiagnostics();
    const { functions } = getRniapAdapter();

    // Self-check: Verify selected methods and conversion availability
    const selfCheck = {
      productFetchFunction: capabilityDiagnostics.selectedMethods.productFetch,
      purchaseFunction: capabilityDiagnostics.selectedMethods.purchase,
      conversionPresent: typeof functions.convertNitroProductToProduct === 'function',
      conversionUsed: conversionUsed, // Tracked during product normalization
    };
    
    // Calculate missing SKUs
    const skusReceived = state.products.map(p => p.productId).filter((id): id is string => !!id);
    const missingSkus = SUBSCRIPTION_PRODUCT_IDS.filter(id => !skusReceived.includes(id));
    
    // Determine last successful step
    let lastSuccessfulStep = 'none';
    if (state.isInitialized && state.connectionStatus === 'connected') {
      lastSuccessfulStep = 'initConnection_ok';
        if (state.listenersRegistered) {
          lastSuccessfulStep = 'listeners_ok';
          if (state.products.length > 0) {
            lastSuccessfulStep = 'fetchProducts_ok';
          }
        }
    }

    const diagnostics = {
      state,
      exportDiagnostics: {
        requiredExportsPresent: capabilityDiagnostics.requiredCapabilitiesPresent,
        missing: capabilityDiagnostics.missingRequired,
        capabilities: capabilityDiagnostics.capabilities,
        selectedProductFetchMethod: capabilityDiagnostics.selectedMethods.productFetch,
        selectedPurchaseMethod: capabilityDiagnostics.selectedMethods.purchase,
        selectedRestoreMethod: capabilityDiagnostics.selectedMethods.restore,
        lastProductFetchMethod: this.lastProductFetchMethod,
        lastPurchaseMethod: this.lastPurchaseMethod,
        lastRestoreMethod: this.lastRestoreMethod,
        isNewArch,
        executionEnvironment: Constants.executionEnvironment || 'unknown',
        nativeModuleKeys: capabilityDiagnostics.moduleKeys,
        nativeModuleKeysCount: capabilityDiagnostics.moduleKeys.length,
        selfCheck,
      },
      bundleId: Constants.expoConfig?.ios?.bundleIdentifier || 'unknown',
      isTestFlight: (Constants.appOwnership as string) === 'standalone' && !__DEV__,
      productIdsConfigured: SUBSCRIPTION_PRODUCT_IDS,
      exportMismatchDetected: this.exportMismatchDetected,
      lastSuccessfulStep,
      productsLoadedCount: state.products.length,
      connectionStatus: state.connectionStatus,
      lastError: state.lastError,
      skusRequested: SUBSCRIPTION_PRODUCT_IDS,
      skusReceived,
      missingSkus,
    };
    logSupportDiagnosticsSignal({
      selectedMethods: capabilityDiagnostics.selectedMethods,
      missingSkus,
      lastSuccessfulStep,
      lastErrorCode: state.lastError?.code || null,
    });
    return diagnostics;
  }
}

// Singleton instance
export const IapManager = new IapManagerClass();

