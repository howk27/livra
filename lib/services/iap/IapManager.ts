/**
 * IAP Manager - SINGLE SOURCE OF TRUTH for react-native-iap
 * 
 * This is the ONLY file that directly imports react-native-iap.
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
// SINGLE IMPORT POINT for react-native-iap - handles all export shapes
import * as RNIapModule from 'react-native-iap';
import { logger } from '../../utils/logger';
import { diagEvent, updateDiagnosticsState } from '../../debug/iapDiagnostics';
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

const isExpoGo = Constants.appOwnership === 'expo';
const isNative = Platform.OS !== 'web' && !isExpoGo;

// ============================================================================
// ROBUST MODULE LOADER - Handles all ESM/CJS/NewArch export shapes
// ============================================================================

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

/**
 * Robust module loader that handles all export shapes:
 * - CommonJS require shape
 * - ESM namespace shape  
 * - default export shape (module.default)
 * - New Architecture compatibility
 * 
 * This function resolves the actual module object regardless of how
 * react-native-iap exports its functions in the current build environment.
 */
function loadRNIapModule(): any {
  if (!isNative) {
    return null;
  }

  // Try the namespace import first (most common in ESM)
  let mod = RNIapModule;

  // Check if we need to access via .default (ESM interop)
  if (mod && (mod as any).default && typeof (mod as any).default === 'object') {
    // Try default export
    const defaultMod = (mod as any).default;
    if (defaultMod && typeof defaultMod.initConnection === 'function') {
      mod = defaultMod;
    }
  }

  return mod;
}

/**
 * Resolve a function from the module, trying multiple paths
 */
function resolveFunction(module: any, functionName: string): any {
  if (!module) return undefined;

  // Try direct access
  let fn = module[functionName];
  if (typeof fn === 'function') return fn;

  // Try via default export
  if ((module as any).default) {
    fn = (module as any).default[functionName];
    if (typeof fn === 'function') return fn;
  }

  // Return undefined if not found or not a function
  return undefined;
}

// Load the module once
const rnIapModule = loadRNIapModule();
const isNewArch = detectNewArchitecture();

/**
 * Detect if Nitro API is available at runtime (Nitro-only, no legacy fallback)
 */
function detectApiMode(): 'nitro' | 'none' {
  if (!isNative || !rnIapModule) {
    return 'none';
  }

  // Check for Nitro API only
  const hasNitro = 
    typeof resolveFunction(rnIapModule, 'fetchProducts') === 'function' &&
    typeof resolveFunction(rnIapModule, 'requestPurchase') === 'function';

  return hasNitro ? 'nitro' : 'none';
}

/**
 * Resolve IAP API - Nitro-only implementation
 */
function resolveIapApi(mode: 'nitro' | 'none') {
  if (!isNative || !rnIapModule || mode === 'none') {
    return {
      initConnection: async () => {},
      endConnection: async () => {},
      fetchProducts: async () => [],
      requestPurchase: async () => null,
      getAvailablePurchases: async () => [],
      restorePurchases: async () => {},
      finishTransaction: async () => {},
      purchaseUpdatedListener: () => ({ remove: () => {} }),
      purchaseErrorListener: () => ({ remove: () => {} }),
      getReceiptIOS: async () => undefined,
      clearTransactionIOS: async () => {},
      convertNitroProductToProduct: undefined,
    };
  }

  // Resolve Nitro API functions only
  return {
    initConnection: resolveFunction(rnIapModule, 'initConnection'),
    endConnection: resolveFunction(rnIapModule, 'endConnection'),
    finishTransaction: resolveFunction(rnIapModule, 'finishTransaction'),
    purchaseUpdatedListener: resolveFunction(rnIapModule, 'purchaseUpdatedListener'),
    purchaseErrorListener: resolveFunction(rnIapModule, 'purchaseErrorListener'),
    getAvailablePurchases: resolveFunction(rnIapModule, 'getAvailablePurchases'),
    restorePurchases: resolveFunction(rnIapModule, 'restorePurchases'),
    getReceiptIOS: resolveFunction(rnIapModule, 'getReceiptIOS'),
    clearTransactionIOS: resolveFunction(rnIapModule, 'clearTransactionIOS'),
    fetchProducts: resolveFunction(rnIapModule, 'fetchProducts'),
    requestPurchase: resolveFunction(rnIapModule, 'requestPurchase'),
    convertNitroProductToProduct: resolveFunction(rnIapModule, 'convertNitroProductToProduct'),
  };
}

// Detect API mode and create adapter
const detectedApiMode = detectApiMode();
const IAPAdapter = resolveIapApi(detectedApiMode);

/**
 * Extract product ID from raw product object (Nitro API)
 * Tries multiple field names and conversion helpers
 */
function getProductId(raw: any): string | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  // Try Nitro conversion helper first (most reliable)
  if (typeof IAPAdapter.convertNitroProductToProduct === 'function') {
    try {
      const converted = IAPAdapter.convertNitroProductToProduct(raw);
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
 * Normalize a raw product from Nitro API to IAPProduct shape
 * Extracts productId, localizedPrice, currency, title, description with comprehensive fallback logic
 * Returns null if productId cannot be extracted (product is invalid)
 */
function normalizeProduct(raw: any): IAPProduct | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  // Try to get converted product for better field access
  let converted: any = null;
  if (typeof IAPAdapter.convertNitroProductToProduct === 'function') {
    try {
      converted = IAPAdapter.convertNitroProductToProduct(raw);
    } catch (e) {
      // Conversion failed, use raw object
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

  // Extract localizedPrice - try in prioritized order
  let localizedPrice = '';
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

  // Also try subscriptionOfferDetails for Nitro API
  if (!localizedPrice && raw?.subscriptionOfferDetails && Array.isArray(raw.subscriptionOfferDetails) && raw.subscriptionOfferDetails.length > 0) {
    const offer = raw.subscriptionOfferDetails[0];
    if (offer?.pricingPhases && Array.isArray(offer.pricingPhases) && offer.pricingPhases.length > 0) {
      const phase = offer.pricingPhases[0];
      if (phase?.price) {
        localizedPrice = String(phase.price);
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

  // Extract currency
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
  let price = localizedPrice || '';
  if (!price && source?.price) {
    price = String(source.price);
  } else if (!price && raw?.price) {
    price = String(raw.price);
  }

  // STEP 1: Ensure localizedPrice always has a usable value
  // If localizedPrice is missing but we have numeric price + currency, format a fallback
  let finalLocalizedPrice = localizedPrice;
  let priceFieldUsed = 'localizedPrice'; // Track which field produced the price
  
  if (!finalLocalizedPrice || finalLocalizedPrice.trim() === '') {
    // Try to construct from numeric price + currency
    const numericPrice = price ? parseFloat(String(price).replace(/[^0-9.]/g, '')) : null;
    if (numericPrice && !isNaN(numericPrice) && currency && currency.trim() !== '') {
      // Format based on currency code
      const currencyCode = currency.toUpperCase();
      if (currencyCode === 'USD' || currencyCode === 'CAD' || currencyCode === 'AUD') {
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

/**
 * Get API diagnostics - Nitro-only
 */
function getApiDiagnostics(): {
  apiMode: 'nitro' | 'none';
  exportTypes: Record<string, string>;
  moduleKeys: string[];
  requiredExportsPresent: boolean;
} {
  if (!isNative || !rnIapModule) {
    return {
      apiMode: 'none',
      exportTypes: {},
      moduleKeys: [],
      requiredExportsPresent: false,
    };
  }

  const apiMode = detectedApiMode;

  // Required Nitro functions only
  const required = [
    'initConnection',
    'endConnection',
    'fetchProducts',
    'requestPurchase',
    'finishTransaction',
    'purchaseUpdatedListener',
    'purchaseErrorListener',
  ];

  // Build export types for Nitro API only
  const exportTypes: Record<string, string> = {
    initConnection: typeof IAPAdapter.initConnection,
    endConnection: typeof IAPAdapter.endConnection,
    finishTransaction: typeof IAPAdapter.finishTransaction,
    purchaseUpdatedListener: typeof IAPAdapter.purchaseUpdatedListener,
    purchaseErrorListener: typeof IAPAdapter.purchaseErrorListener,
    getAvailablePurchases: typeof IAPAdapter.getAvailablePurchases,
    restorePurchases: typeof IAPAdapter.restorePurchases,
    getReceiptIOS: typeof IAPAdapter.getReceiptIOS,
    clearTransactionIOS: typeof IAPAdapter.clearTransactionIOS,
    fetchProducts: typeof IAPAdapter.fetchProducts,
    requestPurchase: typeof IAPAdapter.requestPurchase,
    convertNitroProductToProduct: typeof IAPAdapter.convertNitroProductToProduct,
  };

  // Check if all required Nitro exports are present
  const requiredExportsPresent = required.every(
    key => typeof (IAPAdapter as any)[key] === 'function'
  );

  const moduleKeys = rnIapModule ? Object.keys(rnIapModule).slice(0, 25) : [];

  return {
    apiMode,
    exportTypes,
    moduleKeys,
    requiredExportsPresent,
  };
}

/**
 * Validate IAP exports - Nitro-only validation
 * @throws Error with code 'IAP_EXPORT_MISMATCH' if validation fails
 */
function validateIapExports(): void {
  if (!isNative) {
    logger.log('[IAP Manager] Skipping export validation (web/Expo Go)');
    diagEvent('iap_adapter_validated', {
      apiMode: detectedApiMode,
      requiredExportsPresent: true,
      missing: [],
      invalid: [],
      isValid: true,
    });
    return;
  }

  const diagnostics = getApiDiagnostics();
  const { apiMode, exportTypes, requiredExportsPresent } = diagnostics;

  // Required Nitro functions only
  const required = [
    'initConnection',
    'endConnection',
    'fetchProducts',
    'requestPurchase',
    'finishTransaction',
    'purchaseUpdatedListener',
    'purchaseErrorListener',
  ];

  const missing: string[] = [];
  const invalid: string[] = [];

  // Validate required Nitro functions
  for (const key of required) {
    const value = (IAPAdapter as any)[key];
    const valueType = typeof value;
    
    if (value === undefined) {
      missing.push(key);
    } else if (valueType !== 'function') {
      invalid.push(`${key} (type: ${valueType})`);
    }
  }

  const isValid = apiMode === 'nitro' && missing.length === 0 && invalid.length === 0;

  // Detect export shape for diagnostics
  let detectedShape = 'unknown';
  if (rnIapModule) {
    if ((rnIapModule as any).default && typeof (rnIapModule as any).default === 'object') {
      detectedShape = 'default-export';
    } else if (typeof (rnIapModule as any).initConnection === 'function') {
      detectedShape = 'namespace';
    } else {
      detectedShape = 'unresolved';
    }
  }

  // Log detailed diagnostics
  diagEvent('iap_adapter_validated', {
    apiMode,
    detectedShape,
    missing,
    invalid,
    isValid,
    requiredExportsPresent,
    exportTypes,
    isNewArch,
    moduleKeys: diagnostics.moduleKeys,
  });

  if (!isValid) {
    const errorMsg = `IAP_EXPORT_MISMATCH: Missing required functions for Nitro API (fetchProducts/requestPurchase): ${missing.join(', ')}${invalid.length > 0 ? `, invalid types: ${invalid.join(', ')}` : ''}`;
    
    logger.error('[IAP Manager] Export validation failed', {
      apiMode,
      missing,
      invalid,
      exportTypes,
      isNewArch,
      detectedShape,
      moduleKeys: diagnostics.moduleKeys,
      platform: Platform.OS,
      bundleId: Constants.expoConfig?.ios?.bundleIdentifier,
    });

    const error: any = new Error(errorMsg);
    error.code = 'IAP_EXPORT_MISMATCH';
    error.apiMode = apiMode;
    error.missing = missing;
    error.invalid = invalid;
    error.exportTypes = exportTypes;
    error.isNewArch = isNewArch;
    throw error;
  }

  logger.log('[IAP Manager] Export validation passed (Nitro API)', {
    apiMode,
    exportTypes,
    detectedShape,
    isNewArch,
    platform: Platform.OS,
    bundleId: Constants.expoConfig?.ios?.bundleIdentifier,
  });
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
      // Step 1: Validate Nitro exports are valid
      try {
        validateIapExports();
        this.exportMismatchDetected = false;
      } catch (validationError: any) {
        // Export mismatch detected - stop initialization and set error state
        this.exportMismatchDetected = true;
        const errorMsg = validationError?.message || 'IAP exports validation failed';
        const normalizedError = {
          code: validationError?.code || 'IAP_EXPORT_MISMATCH',
          message: errorMsg,
          userMessage: 'Purchases unavailable due to a configuration error. Please contact support.',
        };

        logger.error('[IAP Manager] Export validation failed - stopping initialization', {
          error: validationError,
          code: validationError?.code,
          message: errorMsg,
          missing: validationError?.missing || [],
          detectedShape: validationError?.detectedShape,
        });

        this.terminalError = true; // Mark as terminal error
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
          terminal: true,
          apiMode: detectedApiMode,
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
        apiMode: detectedApiMode,
      });

      // Step 2: Initialize connection
      await IAPAdapter.initConnection();

      // Small delay to allow StoreKit to sync
      await new Promise(resolve => setTimeout(resolve, 500));

      // Step 3: Clear pending transactions on iOS (if function exists and is callable)
      // 4C: Gate clearTransactionIOS - only run in dev or if stuck purchase marker exists
      const shouldClearTransactions = __DEV__ || await AsyncStorage.getItem('iap_stuck_purchase_marker');
      if (Platform.OS === 'ios' && shouldClearTransactions && IAPAdapter.clearTransactionIOS && typeof IAPAdapter.clearTransactionIOS === 'function') {
        try {
          await IAPAdapter.clearTransactionIOS();
          logger.log('[IAP Manager] Cleared pending iOS transactions');
          diagEvent('iap_manager_clearTransactionsIOS_executed', {
            reason: __DEV__ ? 'dev_mode' : 'stuck_purchase_marker',
          });
          // Clear marker after successful clear
          if (!__DEV__) {
            await AsyncStorage.removeItem('iap_stuck_purchase_marker');
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
        apiMode: detectedApiMode,
      }, initDuration);

      logger.log('[IAP Manager] Initialization successful', {
        duration: initDuration,
        bundleId: Constants.expoConfig?.ios?.bundleIdentifier,
      });

      // Step 4: Register listeners (exactly once)
      this.registerListeners();
      diagEvent('iap_manager_step', { step: 'listeners_ok' });

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
      this.purchaseUpdateSubscription = IAPAdapter.purchaseUpdatedListener(
        async (purchase: any) => {
          await this.handlePurchaseUpdate(purchase);
        }
      );

      this.purchaseErrorSubscription = IAPAdapter.purchaseErrorListener(
        (error: any) => {
          this.handlePurchaseError(error);
        }
      );

      this.setState({ listenersRegistered: true });
      updateDiagnosticsState({ iapListenersActive: true });
      diagEvent('iap_manager_listeners_registered', {
        step: 'listeners_ok',
      });

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
    
    // TASK B2: Safely extract productId - do NOT assume purchase.productId exists
    // Try multiple possible fields in order of likelihood
    const productId = 
      purchase.productId || 
      purchase.productIdentifier || 
      purchase.product_id ||
      (purchase as any).sku ||
      (purchase as any).identifier ||
      null;
    
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
      try {
        await IAPAdapter.finishTransaction({ purchase, isConsumable: false });
      } catch (finishError: any) {
        logger.error('[IAP Manager] Error finishing transaction with missing productId:', finishError);
      }
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
      let receipt: string | undefined;
      if (Platform.OS === 'ios') {
        try {
          receipt = await IAPAdapter.getReceiptIOS();
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
      } else {
        receipt = purchase.purchaseToken || transactionId || undefined;
      }

      // 4A: iOS receipt missing must be TRANSIENT
      // TASK 6: Strict strategy - validate receipt BEFORE unlockPro and finishTransaction
      const receiptToValidate = receipt || transactionId || '';
      if (!receiptToValidate) {
        logger.error('[IAP Manager] Receipt not available for validation', {
          transactionId,
          productId,
          hasReceipt: !!receipt,
          hasTransactionId: !!transactionId,
        });
        diagEvent('iap_manager_receipt_missing_transient', {
          transactionId,
          productId,
          hasReceipt: !!receipt,
          hasTransactionId: !!transactionId,
        });
        shouldFinishTransactionOnError = false;
        const receiptMissingError: any = new Error('Purchase receipt is being retrieved. Please try again in a moment.');
        receiptMissingError.code = 'TRANSIENT_RECEIPT_MISSING';
        throw receiptMissingError;
      }

      // Validate receipt server-side BEFORE unlocking
      logger.log('[IAP Manager] Validating receipt before unlock', {
        transactionId,
        productId,
      });
      
      const validation = await validateReceiptWithServer(receiptToValidate, transactionId, productId);

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
        finishAttempted = true;
        try {
          await IAPAdapter.finishTransaction({ purchase, isConsumable: false });
          transactionFinished = true;
        } catch (finishError: any) {
          logger.error('[IAP Manager] Error finishing transaction after validation failure:', finishError);
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
        throw verificationPendingError;
      }

      // CRITICAL: Finish transaction AFTER validation and unlock (required by Apple)
      // 4B: finishTransaction failure policy - DO NOT mark as finished if finishTransaction throws
      // Set recovery marker for clearTransactionIOS on next launch
      finishAttempted = true;
      try {
        await IAPAdapter.finishTransaction({ purchase, isConsumable: false });
        transactionFinished = true;
        logger.log('[IAP Manager] Transaction finished', {
          transactionId,
          productId,
        });
        diagEvent('iap_manager_finishTransaction_success', {
          transactionId,
          productId,
        });
      } catch (finishError: any) {
        // DO NOT mark as finished - transaction is still pending and needs recovery
        transactionFinished = false;
        logger.error('[IAP Manager] Error finishing transaction after validation', {
          error: finishError,
          transactionId,
          productId,
        });
        diagEvent('iap_manager_finishTransaction_error', {
          error: finishError,
          transactionId,
          productId,
          afterValidation: true,
        });
        // Set recovery marker so clearTransactionIOS can run on next launch in production
        try {
          await AsyncStorage.setItem('iap_stuck_purchase_marker', 'true');
          logger.log('[IAP Manager] Set recovery marker for stuck transaction', {
            transactionId,
            productId,
          });
          diagEvent('iap_manager_stuck_transaction_marker_set', {
            transactionId,
            productId,
            reason: 'finishTransaction_failed',
          });
        } catch (markerError) {
          logger.error('[IAP Manager] Failed to set recovery marker', markerError);
        }
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
      } else {
        // Non-transient error - try to finish transaction best-effort, emit outcome_error
        if (!transactionFinished && shouldFinishTransactionOnError && !finishAttempted) {
          finishAttempted = true;
          try {
            await IAPAdapter.finishTransaction({ purchase, isConsumable: false });
            transactionFinished = true;
          } catch (finishError: any) {
            logger.error('[IAP Manager] Error finishing transaction in error handler:', finishError);
          }
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

      // Load products using Nitro API
      if (detectedApiMode !== 'nitro') {
        throw new Error('Nitro API is required but not available');
      }

      // Nitro API: fetchProducts with type: 'subs' for subscriptions
      const subscriptionProducts: any[] = await IAPAdapter.fetchProducts({
        skus: SUBSCRIPTION_PRODUCT_IDS,
        type: 'subs',
      });

      const duration = Date.now() - startTime;

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
            logger.log('[IAP Manager] First product structure (Nitro API):', {
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
          apiMode: detectedApiMode,
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
          apiMode: detectedApiMode,
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
        apiMode: detectedApiMode,
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
          apiMode: detectedApiMode,
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

      this.setState({
        products: normalizedProducts,
        isLoadingProducts: false,
        lastError: null,
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
        apiMode: detectedApiMode,
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
      
      // Check if this is an export mismatch error - stop retries immediately
      if (error?.code === 'IAP_EXPORT_MISMATCH' || error?.message?.includes('IAP_EXPORT_MISMATCH')) {
        this.exportMismatchDetected = true;
        const normalizedError = {
          code: 'IAP_EXPORT_MISMATCH',
          message: error.message || 'IAP exports validation failed',
          userMessage: 'Purchases unavailable due to a configuration error. Please contact support.',
        };

        logger.error('[IAP Manager] Export mismatch detected during product load - stopping retries', {
          error,
          missing: error?.missing || [],
          detectedShape: error?.detectedShape,
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
          exportMismatch: true,
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
        apiMode: detectedApiMode,
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
  private async requestSubscriptionNitroSafe(sku: string): Promise<string> {
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

        await IAPAdapter.requestPurchase(signature.params);

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
      apiMode: detectedApiMode,
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

      // Purchase using Nitro API
      if (detectedApiMode !== 'nitro') {
        throw new Error('Nitro API is required but not available');
      }

      // Nitro API: requestPurchase with safe wrapper and fallback
      // Enhanced logging for iPad debugging
      const isIPad = Platform.OS === 'ios' && Platform.isPad;
      logger.log('[IAP Manager] Requesting purchase (Nitro API)', {
        productId,
        sku,
        isIPad,
        deviceModel: Device.modelName || Device.deviceName || 'Unknown',
        iosVersion: Platform.Version,
      });

      // Emit telemetry before calling requestSubscriptionNitroSafe
      diagEvent('iap_buy_about_to_call_requestSubscriptionNitroSafe', {
        sku,
        productId,
        detectedApiMode,
        isNewArch,
        connectionStatus: this.state.connectionStatus,
        listenersRegistered: this.state.listenersRegistered,
        purchaseInProgress: this.purchaseInProgress,
        pendingPurchaseSku: this.pendingPurchase?.sku || null,
      });

      // Multi-signature requestPurchase call
      const signatureName = await this.requestSubscriptionNitroSafe(sku);

      const duration = Date.now() - startTime;
      logger.log('[IAP Manager] Purchase request submitted', {
        productId,
        sku,
        duration,
      });

      diagEvent('iap_manager_buy_success', {
        productId,
        sku,
        apiMode: detectedApiMode,
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
        apiMode: detectedApiMode,
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

      // Restore using Nitro API
      if (detectedApiMode !== 'nitro') {
        throw new Error('Nitro API is required but not available');
      }

      // Nitro API: restorePurchases triggers purchaseUpdatedListener, then get available purchases
      if (typeof IAPAdapter.restorePurchases === 'function') {
        await IAPAdapter.restorePurchases();
      }
      const purchases: any[] = await IAPAdapter.getAvailablePurchases();

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

          // Get receipt
          let receipt: string | undefined;
          if (Platform.OS === 'ios') {
            try {
              receipt = await IAPAdapter.getReceiptIOS();
            } catch (receiptError) {
              logger.warn('[IAP Manager] Could not get iOS receipt for restore:', receiptError);
            }
          } else {
            receipt = proPurchase.purchaseToken || transactionId || undefined;
          }

          // Validate receipt
          const receiptToValidate = receipt || transactionId || '';
          const validation = await validateReceiptWithServer(
            receiptToValidate,
            transactionId,
            productId
          );

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

  /**
   * Tear down IAP connection
   */
  async tearDown(): Promise<void> {
    try {
      // Remove listeners
      if (this.purchaseUpdateSubscription) {
        this.purchaseUpdateSubscription.remove();
        this.purchaseUpdateSubscription = null;
      }
      if (this.purchaseErrorSubscription) {
        this.purchaseErrorSubscription.remove();
        this.purchaseErrorSubscription = null;
      }

      // End connection
      if (this.state.isInitialized && this.state.connectionStatus === 'connected') {
        await IAPAdapter.endConnection();
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
   */
  getDiagnostics(): {
    state: IapManagerState;
      exportDiagnostics: {
        apiMode: 'nitro' | 'none';
        requiredExportsPresent: boolean;
        exportTypes: Record<string, string>;
        moduleKeys: string[];
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
    const diagnostics = getApiDiagnostics();
    
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

    return {
      state,
      exportDiagnostics: {
        apiMode: diagnostics.apiMode,
        requiredExportsPresent: diagnostics.requiredExportsPresent,
        exportTypes: diagnostics.exportTypes,
        moduleKeys: diagnostics.moduleKeys,
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
  }
}

// Singleton instance
export const IapManager = new IapManagerClass();

