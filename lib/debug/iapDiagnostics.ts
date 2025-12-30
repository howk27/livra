/**
 * IAP Diagnostics Store
 * 
 * Production-safe diagnostic logging for react-native-iap v14.5
 * Maintains a ring buffer of diagnostic events for in-app debugging
 */

import { Platform, Share } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { ALL_SUBS_SKUS } from '../iap/skus';

export type DiagnosticEventType =
  | 'initConnection_start'
  | 'initConnection_success'
  | 'initConnection_error'
  | 'fetchProducts_start'
  | 'fetchProducts_success'
  | 'fetchProducts_error'
  | 'products_state_set'
  | 'requestPurchase_start'
  | 'requestPurchase_submitted'
  | 'requestPurchase_success'
  | 'requestPurchase_error'
  | 'purchaseUpdated_received'
  | 'purchaseError_received'
  | 'receipt_retrieved'
  | 'receipt_failed'
  | 'finishTransaction_success'
  | 'finishTransaction_error'
  | 'restore_start'
  | 'restore_success'
  | 'restore_error'
  | 'restore_cancelled'
  | 'restore_none_found'
  | 'iap_manager_receipt_missing_transient'
  | 'iap_manager_purchase_token_missing_transient'
  | 'iap_manager_clearTransactionsIOS_executed'
  | 'iap_manager_clearTransactionsIOS_skipped'
  | 'iap_manager_clearTransactionsIOS_error'
  | 'retry_scheduled'
  | 'retry_cancelled'
  | 'state_transition'
  | 'iap_manager_init_start'
  | 'iap_manager_init_success'
  | 'iap_manager_init_error'
  | 'iap_manager_listeners_registered'
  | 'iap_manager_listeners_error'
  | 'iap_manager_loadProducts_start'
  | 'iap_manager_loadProducts_success'
  | 'iap_manager_loadProducts_error'
  | 'iap_manager_products_set'
  | 'iap_manager_buy_start'
  | 'iap_manager_buy_success'
  | 'iap_manager_buy_error'
  | 'iap_manager_purchaseUpdated'
  | 'iap_manager_purchaseError'
  | 'iap_manager_finishTransaction_attempted'
  | 'iap_manager_finishTransaction_success'
  | 'iap_manager_finishTransaction_error'
  | 'iap_manager_stuck_transaction_marker_set'
  | 'iap_manager_receipt_retrieved'
  | 'iap_manager_restore_start'
  | 'iap_manager_restore_success'
  | 'iap_manager_restore_error'
  | 'iap_manager_tearDown_success'
  | 'iap_service_export_validation_success'
  | 'iap_service_export_validation_failed'
  | 'iap_adapter_validated'
  | 'iap_manager_step'
  | 'premium_screen_products'
  | 'paywall_purchase_attempt'
  | 'paywall_purchase_attempt_blocked'
  | 'paywall_sku_mapping_failed'
  | 'paywall_purchase_blocked_invalid_sku'
  | 'iap_manager_buy_blocked'
  | 'iap_manager_requestPurchase_signature_success'
  | 'iap_manager_requestPurchase_all_signatures_failed'
  | 'iap_requestPurchase_attempt'
  | 'iap_requestPurchase_signature_success'
  | 'iap_requestPurchase_signature_failed'
  | 'iap_health_failed'
  | 'iap_manager_purchase_guard_set'
  | 'iap_manager_purchase_guard_cleared'
  | 'iap_manager_purchase_timeout'
  | 'iap_manager_receipt_validation_failed'
  | 'iap_manager_receipt_validation_transient'
  | 'iap_manager_db_unlock_confirmed'
  | 'iap_manager_db_unlock_failed'
  | 'iap_manager_purchaseUpdated_missing_productId'
  | 'iap_buy_about_to_call_requestSubscriptionNitroSafe'
  | 'iap_manager_purchase_outcome_success'
  | 'iap_manager_purchase_outcome_transient'
  | 'iap_manager_purchase_outcome_invalid'
  | 'iap_manager_purchase_outcome_error'
  | 'iap_manager_db_unlock_pending_transient'
  | 'iap_manager_prices_missing_terminal'
  | 'diagnostics_opened_hidden_gesture'
  | 'iap_prices_missing_terminal'
  | 'iap_price_from_micros_used'
  | 'iap_price_from_micros_missing_currency'
  | 'iap_manager_listeners_unregistered';

export interface DiagnosticEvent {
  timestamp: string;
  type: DiagnosticEventType;
  payload: Record<string, any>;
  duration?: number; // milliseconds
}

interface IAPDiagnosticsState {
  connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error';
  isReady: boolean;
  isLoadingProducts: boolean;
  productsReturnedCount: number;
  productIdsReturned: string[];
  rawProductCount?: number;
  normalizedProductCount?: number;
  normalizedProductIds?: string[];
  apiMode?: 'nitro' | 'none';
  firstRawKeys?: string[];
  pricesMissing?: boolean;
  lastError: {
    code: string;
    message: string;
    domain?: string;
    responseCode?: string;
  } | null;
  lastPurchaseAttempt: {
    productId: string;
    timestamp: string;
  } | null;
  lastPurchaseError: {
    code: string;
    message: string;
    domain?: string;
    responseCode?: string;
  } | null;
  lastReceiptInfo: {
    exists: boolean;
    length: number;
    timestamp: string;
  } | null;
  environmentHints: {
    isTestFlight: boolean;
    sandboxDetected: boolean;
    iosVersion: string;
    deviceModel: string;
    bundleId: string;
  };
  iapListenersActive: boolean;
}

const MAX_EVENTS = 200;
const events: DiagnosticEvent[] = [];

let currentState: Partial<IAPDiagnosticsState> = {
  connectionStatus: 'disconnected',
  isReady: false,
  isLoadingProducts: false,
  productsReturnedCount: 0,
  productIdsReturned: [],
  lastError: null,
  lastPurchaseAttempt: null,
  lastPurchaseError: null,
  lastReceiptInfo: null,
  environmentHints: {
    isTestFlight: Constants.executionEnvironment === 'storeClient', // Canonical: storeClient = TestFlight
    sandboxDetected: false, // Will be updated if we detect sandbox receipt
    iosVersion: Platform.OS === 'ios' ? Platform.Version : 'N/A',
    deviceModel: Device.modelName || Device.deviceName || 'Unknown',
    bundleId: Constants.expoConfig?.ios?.bundleIdentifier || 'unknown',
  },
  iapListenersActive: false,
};

/**
 * Log a diagnostic event
 */
export function diagEvent(
  type: DiagnosticEventType,
  payload: Record<string, any> = {},
  duration?: number
): void {
  const event: DiagnosticEvent = {
    timestamp: new Date().toISOString(),
    type,
    payload: sanitizePayload(payload),
    duration,
  };

  events.push(event);
  
  // Maintain ring buffer
  if (events.length > MAX_EVENTS) {
    events.shift();
  }

  // Update current state based on event type
  updateStateFromEvent(type, payload);
}

/**
 * Sanitize payload to remove sensitive data
 */
function sanitizePayload(payload: Record<string, any>): Record<string, any> {
  const sanitized: Record<string, any> = {};

  for (const [key, value] of Object.entries(payload)) {
    if (key.includes('receipt') && typeof value === 'string' && value.length > 0) {
      // Only store receipt length, never content
      sanitized[`${key}_length`] = value.length;
      sanitized[`${key}_exists`] = true;
    } else if (key.includes('transactionId') || key.includes('transaction_id')) {
      // Mask transaction ID (show last 4 chars only)
      const str = String(value);
      sanitized[key] = str.length > 4 ? `***${str.slice(-4)}` : '***';
    } else if (key.includes('email') || key.includes('appleId') || key.includes('user')) {
      // Never log user identifiers
      sanitized[key] = '[REDACTED]';
    } else if (key === 'error' && value && typeof value === 'object') {
      // Sanitize error objects
      sanitized[key] = {
        code: value.code || value.errorCode || 'UNKNOWN',
        message: value.message || String(value),
        domain: value.domain,
        responseCode: value.responseCode,
        // Never include stack traces or full error objects
      };
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Update current state from event
 */
function updateStateFromEvent(type: DiagnosticEventType, payload: Record<string, any>): void {
  switch (type) {
    case 'initConnection_success':
    case 'iap_manager_init_success':
      currentState.connectionStatus = 'connected';
      break;
    case 'initConnection_error':
    case 'iap_manager_init_error':
      currentState.connectionStatus = 'error';
      currentState.lastError = {
        code: payload.error?.code || 'CONNECTION_ERROR',
        message: payload.error?.message || 'Connection failed',
        domain: payload.error?.domain,
        responseCode: payload.error?.responseCode,
      };
      break;
    case 'fetchProducts_success':
    case 'iap_manager_loadProducts_success':
      currentState.productsReturnedCount = payload.count || 0;
      currentState.productIdsReturned = payload.productIds || [];
      currentState.isLoadingProducts = false;
      break;
    case 'fetchProducts_error':
    case 'iap_manager_loadProducts_error':
      currentState.isLoadingProducts = false;
      currentState.lastError = {
        code: payload.error?.code || 'PRODUCTS_ERROR',
        message: payload.error?.message || 'Failed to load products',
        domain: payload.error?.domain,
        responseCode: payload.error?.responseCode,
      };
      break;
    case 'requestPurchase_start':
    case 'paywall_purchase_attempt':
      currentState.lastPurchaseAttempt = {
        productId: payload.productId || payload.sku || 'unknown',
        timestamp: new Date().toISOString(),
      };
      break;
    case 'requestPurchase_error':
    case 'purchaseError_received':
      currentState.lastPurchaseError = {
        code: payload.error?.code || payload.code || 'PURCHASE_ERROR',
        message: payload.error?.message || payload.message || 'Purchase failed',
        domain: payload.error?.domain || payload.domain,
        responseCode: payload.error?.responseCode || payload.responseCode,
      };
      break;
    case 'receipt_retrieved':
    case 'iap_manager_receipt_retrieved':
      currentState.lastReceiptInfo = {
        exists: true,
        length: payload.receipt_length || 0,
        timestamp: new Date().toISOString(),
      };
      // Detect sandbox if receipt environment indicates it
      if (payload.environment === 'Sandbox') {
        if (!currentState.environmentHints) {
          currentState.environmentHints = {
            isTestFlight: false,
            sandboxDetected: false,
            iosVersion: Platform.OS === 'ios' ? Platform.Version : 'N/A',
            deviceModel: Device.modelName || Device.deviceName || 'Unknown',
            bundleId: Constants.expoConfig?.ios?.bundleIdentifier || 'unknown',
          };
        }
        currentState.environmentHints.sandboxDetected = true;
      }
      break;
    case 'receipt_failed':
      currentState.lastReceiptInfo = {
        exists: false,
        length: 0,
        timestamp: new Date().toISOString(),
      };
      break;
  }
}

/**
 * Update state directly (for state transitions)
 */
export function updateDiagnosticsState(updates: Partial<IAPDiagnosticsState>): void {
  currentState = { ...currentState, ...updates };
}

/**
 * Get current diagnostic snapshot
 */
export function getDiagSnapshot(): {
  state: IAPDiagnosticsState;
  events: DiagnosticEvent[];
  quickChecks: {
    hasProducts: boolean;
    connected: boolean;
    skusMatchExpected: boolean;
    iapListenersActive: boolean;
    canAttemptPurchase: boolean;
  };
} {
  // Import from single source of truth
  const expectedSkus = [...ALL_SUBS_SKUS];
  const returnedSkus = currentState.productIdsReturned || [];
  const skusMatchExpected = expectedSkus.every(sku => returnedSkus.includes(sku));

  return {
    state: currentState as IAPDiagnosticsState,
    events: [...events].slice(-50), // Last 50 events for timeline
    quickChecks: {
      hasProducts: (currentState.productsReturnedCount || 0) > 0,
      connected: currentState.connectionStatus === 'connected',
      skusMatchExpected,
      iapListenersActive: currentState.iapListenersActive || false,
      canAttemptPurchase:
        currentState.connectionStatus === 'connected' &&
        (currentState.productsReturnedCount || 0) > 0 &&
        (currentState.iapListenersActive || false),
    },
  };
}

/**
 * Redact sensitive data from diagnostics object
 * Redacts only actual sensitive data (receipts, tokens, transaction IDs, purchase objects)
 * Preserves booleans, function type strings, and computed flags
 */
export function redactSensitiveData(obj: any, depth: number = 0): any {
  if (depth > 10) return '[Max Depth Reached]'; // Prevent infinite recursion
  
  if (obj === null || obj === undefined) {
    return obj;
  }
  
  // Preserve primitives (booleans, numbers, strings that aren't sensitive)
  if (typeof obj !== 'object') {
    // Preserve function type strings (e.g., "function", "undefined")
    if (typeof obj === 'string' && (obj === 'function' || obj === 'undefined' || obj === 'object')) {
      return obj;
    }
    return obj;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => redactSensitiveData(item, depth + 1));
  }
  
  const redacted: any = {};
  // Only redact keys that contain sensitive data AND have sensitive values
  const sensitiveKeyPatterns = ['receipt', 'token', 'transaction', 'purchase'];
  
  for (const key in obj) {
    if (!obj.hasOwnProperty(key)) continue;
    
    const lowerKey = key.toLowerCase();
    const isSensitiveKey = sensitiveKeyPatterns.some(sensitive => lowerKey.includes(sensitive));
    const value = obj[key];
    
    // Preserve booleans, numbers, and function type strings even if key contains sensitive pattern
    const shouldPreserve = (typeof value === 'boolean') || 
                          (typeof value === 'number') ||
                          (typeof value === 'string' && (value === 'function' || value === 'undefined' || value === 'object'));
    
    if (shouldPreserve) {
      redacted[key] = value;
      continue;
    }
    
    // Mask transaction IDs (show last 4 chars) instead of full redaction
    if (lowerKey.includes('transaction') && typeof value === 'string' && value.length > 4) {
      const str = String(value);
      redacted[key] = str.length > 4 ? `***${str.slice(-4)}` : '***';
      continue;
    }
    
    const isSensitiveValue = isSensitiveKey && (
      (typeof value === 'string' && value.length > 20) || // Long strings likely receipts/tokens
      (typeof value === 'object' && value !== null) ||    // Objects likely purchase/receipt objects
      (Array.isArray(value) && value.length > 0 && typeof value[0] === 'object') // Arrays of objects
    );
    
    if (isSensitiveValue) {
      redacted[key] = '[REDACTED]';
    } else {
      redacted[key] = redactSensitiveData(obj[key], depth + 1);
    }
  }
  
  return redacted;
}

/**
 * Get diagnostics as JSON string for sharing/copying
 * Automatically redacts sensitive data (receipt, token, transaction, purchase)
 */
export function getDiagnosticsAsString(): string {
  const snapshot = getDiagSnapshot();
  
  const diagnostics = {
    timestamp: new Date().toISOString(),
    bundleId: snapshot.state.environmentHints?.bundleId,
    platform: Platform.OS,
    environment: snapshot.state.environmentHints,
    state: {
      connectionStatus: snapshot.state.connectionStatus,
      isReady: snapshot.state.isReady,
      isLoadingProducts: snapshot.state.isLoadingProducts,
      productsReturnedCount: snapshot.state.productsReturnedCount,
      productIdsReturned: snapshot.state.productIdsReturned,
      lastError: snapshot.state.lastError,
      lastPurchaseAttempt: snapshot.state.lastPurchaseAttempt,
      lastPurchaseError: snapshot.state.lastPurchaseError,
      lastReceiptInfo: snapshot.state.lastReceiptInfo,
      iapListenersActive: snapshot.state.iapListenersActive,
    },
    quickChecks: snapshot.quickChecks,
    eventTimeline: snapshot.events.map(e => ({
      time: e.timestamp,
      type: e.type,
      duration: e.duration,
      payload: e.payload,
    })),
  };

  // Redact sensitive data before stringifying
  const redacted = redactSensitiveData(diagnostics);
  
  return JSON.stringify(redacted, null, 2);
}

/**
 * Share diagnostics using Share API
 */
export async function copyDiagnosticsToClipboard(): Promise<void> {
  const jsonString = getDiagnosticsAsString();
  
  // Use Share API which works on both iOS and Android
  // User can copy from the share sheet
  await Share.share({
    message: jsonString,
    title: 'IAP Diagnostics',
  });
}

/**
 * Export support bundle for TestFlight debugging
 * Uses expo-sharing for better file handling than Share API
 */
export async function exportSupportBundle(): Promise<void> {
  const snapshot = getDiagSnapshot();
  const { IapManager } = await import('../services/iap/IapManager');
  const managerDiagnostics = IapManager.getDiagnostics();
  const { logger } = await import('../utils/logger');
  
  // Detect New Architecture
  function detectNewArchitecture(): boolean {
    if (typeof global === 'undefined') return false;
    return !!(
      (global as any).RN$Bridgeless ||
      (global as any).__turboModuleProxy ||
      (global as any).nativeFabricUIManager
    );
  }
  
  // Collect comprehensive support bundle
  const supportBundle = {
    timestamp: new Date().toISOString(),
    app: {
      bundleId: Constants.expoConfig?.ios?.bundleIdentifier || 'unknown',
      version: Constants.expoConfig?.version || 'unknown',
      platform: Platform.OS,
      isTestFlight: Constants.executionEnvironment === 'storeClient',
      isNewArch: detectNewArchitecture(),
    },
    environment: snapshot.state.environmentHints,
    iapManager: {
      connectionStatus: managerDiagnostics.connectionStatus,
      isReady: (() => {
        const derivedIsReady =
          managerDiagnostics.connectionStatus === 'connected' &&
          (managerDiagnostics.productsLoadedCount ?? 0) > 0 &&
          (managerDiagnostics.state as any)?.listenersRegistered === true;
        return derivedIsReady;
      })(),
      productsLoadedCount: managerDiagnostics.productsLoadedCount,
      listenersRegistered: managerDiagnostics.state?.listenersRegistered || false,
      lastError: managerDiagnostics.lastError,
      skusRequested: managerDiagnostics.skusRequested,
      skusReceived: managerDiagnostics.skusReceived,
      missingSkus: managerDiagnostics.missingSkus || [],
      exportDiagnostics: managerDiagnostics.exportDiagnostics,
    },
    diagnosticsState: {
      connectionStatus: snapshot.state.connectionStatus,
      isReady: snapshot.state.isReady,
      isLoadingProducts: snapshot.state.isLoadingProducts,
      productsReturnedCount: snapshot.state.productsReturnedCount,
      productIdsReturned: snapshot.state.productIdsReturned,
      lastError: snapshot.state.lastError,
      lastPurchaseAttempt: snapshot.state.lastPurchaseAttempt,
      lastPurchaseError: snapshot.state.lastPurchaseError,
      iapListenersActive: snapshot.state.iapListenersActive,
    },
    quickChecks: snapshot.quickChecks,
    eventTimeline: snapshot.events.map(e => ({
      time: e.timestamp,
      type: e.type,
      duration: e.duration,
      payload: e.payload,
    })),
  };

  // Redact sensitive data
  const redacted = redactSensitiveData(supportBundle);
  const jsonString = JSON.stringify(redacted, null, 2);

  // Use expo-sharing for file export (better than Share API)
  try {
    const dir = FileSystem.cacheDirectory;
    if (!dir) {
      throw new Error('FileSystem.cacheDirectory unavailable');
    }
    const fileName = `livra-iap-support-${new Date().toISOString().split('T')[0]}.json`;
    const fileUri = `${dir}${fileName}`;
    
    await FileSystem.writeAsStringAsync(fileUri, jsonString, {
      encoding: 'utf8',
    });
    
    const isAvailable = await Sharing.isAvailableAsync();
    if (isAvailable) {
      await Sharing.shareAsync(fileUri, {
        mimeType: 'application/json',
        dialogTitle: 'Export IAP Support Bundle',
      });
    } else {
      // Fallback to Share API if expo-sharing not available
      await Share.share({
        message: jsonString,
        title: 'IAP Support Bundle',
      });
    }
  } catch (error) {
    logger.error('[Diagnostics] Error exporting support bundle:', error);
    throw error;
  }
}

/**
 * Normalize IAP error for consistent logging
 */
export function normalizeIapError(err: any): {
  code: string;
  message: string;
  domain?: string;
  responseCode?: string;
  rawName?: string;
} {
  return {
    code: err?.code || err?.errorCode || err?.nativeErrorCode || 'UNKNOWN',
    message: err?.message || err?.debugMessage || String(err) || 'Unknown error',
    domain: err?.domain,
    responseCode: err?.responseCode,
    rawName: err?.name,
  };
}

