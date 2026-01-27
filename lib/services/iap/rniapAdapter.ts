import { Platform } from 'react-native';
import Constants from 'expo-constants';

export type CapabilityMatrix = {
  hasInitConnection: boolean;
  hasEndConnection: boolean;
  hasFetchProducts: boolean;
  hasGetProducts: boolean;
  hasGetSubscriptions: boolean;
  hasRequestPurchase: boolean;
  hasRequestSubscription: boolean;
  hasRestorePurchases: boolean;
  hasGetAvailablePurchases: boolean;
  hasListeners: boolean;
  hasFinishTransaction: boolean;
  hasGetReceiptIOS: boolean;
  hasClearTransactionIOS: boolean;
  hasConvertNitroProductToProduct: boolean;
};

export type SelectedMethods = {
  productFetch: 'fetchProducts' | 'getSubscriptions' | 'getProducts' | 'none';
  purchase: 'requestPurchase' | 'requestSubscription' | 'none';
  restore: 'restorePurchases' | 'getAvailablePurchases' | 'none';
};

export type AdapterFunctions = {
  initConnection?: (...args: any[]) => Promise<any>;
  endConnection?: (...args: any[]) => Promise<any>;
  fetchProducts?: (...args: any[]) => Promise<any>;
  getProducts?: (...args: any[]) => Promise<any>;
  getSubscriptions?: (...args: any[]) => Promise<any>;
  requestPurchase?: (...args: any[]) => Promise<any>;
  requestSubscription?: (...args: any[]) => Promise<any>;
  restorePurchases?: (...args: any[]) => Promise<any>;
  getAvailablePurchases?: (...args: any[]) => Promise<any>;
  purchaseUpdatedListener?: (...args: any[]) => { remove: () => void };
  purchaseErrorListener?: (...args: any[]) => { remove: () => void };
  finishTransaction?: (...args: any[]) => Promise<any>;
  getReceiptIOS?: (...args: any[]) => Promise<any>;
  clearTransactionIOS?: (...args: any[]) => Promise<any>;
  convertNitroProductToProduct?: (...args: any[]) => any;
  deepLinkToSubscriptions?: (...args: any[]) => Promise<any>;
};

export type AdapterSnapshot = {
  module: any;
  moduleKeys: string[];
  capabilities: CapabilityMatrix;
  selectedMethods: SelectedMethods;
  functions: AdapterFunctions;
};

export type CapabilityDiagnostics = {
  capabilities: CapabilityMatrix;
  selectedMethods: SelectedMethods;
  moduleKeys: string[];
  missingRequired: string[];
  requiredCapabilitiesPresent: boolean;
};

const isExpoGo = Constants.appOwnership === 'expo';
const isNative = Platform.OS !== 'web' && !isExpoGo;

function loadRniapModule(): any {
  if (!isNative) return null;

  try {
    const mod = require('react-native-iap');
    if (mod && mod.default && typeof mod.default === 'object') {
      return mod.default;
    }
    return mod;
  } catch {
    return null;
  }
}

function resolveFunction(module: any, functionName: string): any {
  if (!module) return undefined;

  const direct = module[functionName];
  if (typeof direct === 'function') return direct;

  if ((module as any).default) {
    const nested = (module as any).default[functionName];
    if (typeof nested === 'function') return nested;
  }

  return undefined;
}

function buildCapabilities(module: any): CapabilityMatrix {
  const hasInitConnection = typeof resolveFunction(module, 'initConnection') === 'function';
  const hasEndConnection = typeof resolveFunction(module, 'endConnection') === 'function';
  const hasFetchProducts = typeof resolveFunction(module, 'fetchProducts') === 'function';
  const hasGetProducts = typeof resolveFunction(module, 'getProducts') === 'function';
  const hasGetSubscriptions = typeof resolveFunction(module, 'getSubscriptions') === 'function';
  const hasRequestPurchase = typeof resolveFunction(module, 'requestPurchase') === 'function';
  const hasRequestSubscription = typeof resolveFunction(module, 'requestSubscription') === 'function';
  const hasRestorePurchases = typeof resolveFunction(module, 'restorePurchases') === 'function';
  const hasGetAvailablePurchases = typeof resolveFunction(module, 'getAvailablePurchases') === 'function';
  const hasFinishTransaction = typeof resolveFunction(module, 'finishTransaction') === 'function';
  const hasGetReceiptIOS = typeof resolveFunction(module, 'getReceiptIOS') === 'function';
  const hasClearTransactionIOS = typeof resolveFunction(module, 'clearTransactionIOS') === 'function';
  const hasConvertNitroProductToProduct = typeof resolveFunction(module, 'convertNitroProductToProduct') === 'function';
  const hasListeners =
    typeof resolveFunction(module, 'purchaseUpdatedListener') === 'function' &&
    typeof resolveFunction(module, 'purchaseErrorListener') === 'function';

  return {
    hasInitConnection,
    hasEndConnection,
    hasFetchProducts,
    hasGetProducts,
    hasGetSubscriptions,
    hasRequestPurchase,
    hasRequestSubscription,
    hasRestorePurchases,
    hasGetAvailablePurchases,
    hasListeners,
    hasFinishTransaction,
    hasGetReceiptIOS,
    hasClearTransactionIOS,
    hasConvertNitroProductToProduct,
  };
}

function selectMethods(capabilities: CapabilityMatrix): SelectedMethods {
  const productFetch: SelectedMethods['productFetch'] = capabilities.hasFetchProducts
    ? 'fetchProducts'
    : capabilities.hasGetSubscriptions
      ? 'getSubscriptions'
      : capabilities.hasGetProducts
        ? 'getProducts'
        : 'none';

  const purchase: SelectedMethods['purchase'] = capabilities.hasRequestPurchase
    ? 'requestPurchase'
    : capabilities.hasRequestSubscription
      ? 'requestSubscription'
      : 'none';

  const restore: SelectedMethods['restore'] = capabilities.hasRestorePurchases
    ? 'restorePurchases'
    : capabilities.hasGetAvailablePurchases
      ? 'getAvailablePurchases'
      : 'none';

  return { productFetch, purchase, restore };
}

export function getRniapAdapter(): AdapterSnapshot {
  const module = loadRniapModule();
  const moduleKeys = module ? Object.keys(module).slice(0, 25) : [];
  const capabilities = buildCapabilities(module);
  const selectedMethods = selectMethods(capabilities);

  const functions: AdapterFunctions = {
    initConnection: resolveFunction(module, 'initConnection'),
    endConnection: resolveFunction(module, 'endConnection'),
    fetchProducts: resolveFunction(module, 'fetchProducts'),
    getProducts: resolveFunction(module, 'getProducts'),
    getSubscriptions: resolveFunction(module, 'getSubscriptions'),
    requestPurchase: resolveFunction(module, 'requestPurchase'),
    requestSubscription: resolveFunction(module, 'requestSubscription'),
    restorePurchases: resolveFunction(module, 'restorePurchases'),
    getAvailablePurchases: resolveFunction(module, 'getAvailablePurchases'),
    purchaseUpdatedListener: resolveFunction(module, 'purchaseUpdatedListener'),
    purchaseErrorListener: resolveFunction(module, 'purchaseErrorListener'),
    finishTransaction: resolveFunction(module, 'finishTransaction'),
    getReceiptIOS: resolveFunction(module, 'getReceiptIOS'),
    clearTransactionIOS: resolveFunction(module, 'clearTransactionIOS'),
    convertNitroProductToProduct: resolveFunction(module, 'convertNitroProductToProduct'),
    deepLinkToSubscriptions: resolveFunction(module, 'deepLinkToSubscriptions'),
  };

  return {
    module,
    moduleKeys,
    capabilities,
    selectedMethods,
    functions,
  };
}

export function getCapabilityDiagnostics(): CapabilityDiagnostics {
  const adapter = getRniapAdapter();
  const missingRequired: string[] = [];

  if (adapter.selectedMethods.productFetch === 'none') {
    missingRequired.push('productFetch(fetchProducts|getSubscriptions|getProducts)');
  }
  if (adapter.selectedMethods.purchase === 'none') {
    missingRequired.push('purchase(requestPurchase|requestSubscription)');
  }

  return {
    capabilities: adapter.capabilities,
    selectedMethods: adapter.selectedMethods,
    moduleKeys: adapter.moduleKeys,
    missingRequired,
    requiredCapabilitiesPresent: missingRequired.length === 0,
  };
}

export function validateIapCapabilities(): CapabilityDiagnostics {
  if (!isNative) {
    return {
      capabilities: {
        hasInitConnection: false,
        hasEndConnection: false,
        hasFetchProducts: false,
        hasGetProducts: false,
        hasGetSubscriptions: false,
        hasRequestPurchase: false,
        hasRequestSubscription: false,
        hasRestorePurchases: false,
        hasGetAvailablePurchases: false,
        hasListeners: false,
        hasFinishTransaction: false,
        hasGetReceiptIOS: false,
        hasClearTransactionIOS: false,
        hasConvertNitroProductToProduct: false,
      },
      selectedMethods: { productFetch: 'none', purchase: 'none', restore: 'none' },
      moduleKeys: [],
      missingRequired: [],
      requiredCapabilitiesPresent: true,
    };
  }

  const diagnostics = getCapabilityDiagnostics();

  if (!diagnostics.requiredCapabilitiesPresent) {
    const error: any = new Error(
      `IAP_CAPABILITY_MISSING: Missing required capabilities: ${diagnostics.missingRequired.join(', ')}`
    );
    error.code = 'IAP_CAPABILITY_MISSING';
    error.missing = diagnostics.missingRequired;
    error.capabilities = diagnostics.capabilities;
    error.selectedMethods = diagnostics.selectedMethods;
    error.moduleKeys = diagnostics.moduleKeys;
    throw error;
  }

  return diagnostics;
}
