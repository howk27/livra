import '@testing-library/jest-native/extend-expect';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

// Mock Expo modules
jest.mock('expo-sqlite', () => {
  const mockDb = {
    execAsync: jest.fn(() => Promise.resolve()),
    runAsync: jest.fn(() => Promise.resolve({ changes: 1 })),
    getAllAsync: jest.fn(() => Promise.resolve([])),
    withTransactionAsync: jest.fn(async (cb) => cb(mockDb)),
  };
  return {
    openDatabaseAsync: jest.fn(() => Promise.resolve(mockDb)),
  };
});

jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(),
  cancelScheduledNotificationAsync: jest.fn(),
  cancelAllScheduledNotificationsAsync: jest.fn(),
  getAllScheduledNotificationsAsync: jest.fn(),
}));

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

jest.mock('expo-iap', () => ({
  initConnection: jest.fn(),
  endConnection: jest.fn(),
  purchaseUpdatedListener: jest.fn(() => ({ remove: jest.fn() })),
  purchaseErrorListener: jest.fn(() => ({ remove: jest.fn() })),
  fetchProducts: jest.fn(() => Promise.resolve([])),
  requestPurchase: jest.fn(),
  finishTransaction: jest.fn(),
  restorePurchases: jest.fn(() => Promise.resolve()),
  getAvailablePurchases: jest.fn(() => Promise.resolve([])),
  getReceiptIOS: jest.fn(() => Promise.resolve('')),
  clearTransactionIOS: jest.fn(() => Promise.resolve()),
  deepLinkToSubscriptions: jest.fn(() => Promise.resolve()),
}));

