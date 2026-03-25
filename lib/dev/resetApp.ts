import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { resetDatabaseState } from '../db';
import { assertDevToolsAccess } from './access';
import { logger } from './logger';

export const resetApp = async (): Promise<void> => {
  assertDevToolsAccess('resetApp');

  await resetDatabaseState();

  try {
    await AsyncStorage.clear();
  } catch (error) {
    logger.warn('[DevTools] Failed to clear AsyncStorage:', error);
  }

  try {
    // Best-effort cleanup of known SecureStore keys
    await SecureStore.deleteItemAsync('supabase.auth.token');
  } catch (error) {
    logger.warn('[DevTools] Failed to clear SecureStore:', error);
  }

  logger.log('[DevTools] App reset complete');
};
