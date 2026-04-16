import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '../utils/logger';

/** Set when SecureStore setItem fails (session may not persist after restart). */
export const AUTH_STORAGE_WRITE_FAILED_KEY = 'livra_auth_storage_write_failed_v1';

/**
 * Set when SecureStore deleteItemAsync fails after retry — disk session may outlive in-memory sign-out.
 * Bootstrap runs a one-shot local signOut to realign.
 */
export const AUTH_STORAGE_REMOVE_FAILED_KEY = 'livra_auth_storage_remove_failed_v1';

export async function markAuthStorageWriteFailed(): Promise<void> {
  try {
    await AsyncStorage.setItem(AUTH_STORAGE_WRITE_FAILED_KEY, '1');
  } catch (e) {
    logger.warn('[AuthStorage] Could not persist write-failed flag', e);
  }
}

export async function markAuthStorageRemoveFailed(): Promise<void> {
  try {
    await AsyncStorage.setItem(AUTH_STORAGE_REMOVE_FAILED_KEY, '1');
  } catch (e) {
    logger.warn('[AuthStorage] Could not persist remove-failed flag', e);
  }
}

export async function clearAuthStorageWriteFailed(): Promise<void> {
  try {
    await AsyncStorage.removeItem(AUTH_STORAGE_WRITE_FAILED_KEY);
  } catch (e) {
    logger.warn('[AuthStorage] Could not clear write-failed flag', e);
  }
}

export async function clearAuthStorageRemoveFailed(): Promise<void> {
  try {
    await AsyncStorage.removeItem(AUTH_STORAGE_REMOVE_FAILED_KEY);
  } catch (e) {
    logger.warn('[AuthStorage] Could not clear remove-failed flag', e);
  }
}

/** After successful sign-out or storage recovery — avoids stale banners across cycles. */
export async function clearAllAuthStorageHealthFlags(): Promise<void> {
  await clearAuthStorageWriteFailed();
  await clearAuthStorageRemoveFailed();
}

export async function getAuthStorageWriteFailed(): Promise<boolean> {
  try {
    const v = await AsyncStorage.getItem(AUTH_STORAGE_WRITE_FAILED_KEY);
    return v === '1';
  } catch {
    return false;
  }
}

export async function getAuthStorageRemoveFailed(): Promise<boolean> {
  try {
    const v = await AsyncStorage.getItem(AUTH_STORAGE_REMOVE_FAILED_KEY);
    return v === '1';
  } catch {
    return false;
  }
}
