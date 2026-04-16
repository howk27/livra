import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { logger } from './utils/logger';
import { env } from './env';
import {
  markAuthStorageWriteFailed,
  clearAuthStorageWriteFailed,
  markAuthStorageRemoveFailed,
  clearAuthStorageRemoveFailed,
} from './auth/authStorageHealth';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

/** Log storage issues without key names or values (auth tokens). */
function logAuthStorageError(op: 'getItem' | 'setItem' | 'removeItem', error: unknown): void {
  const name = error instanceof Error ? error.name : 'unknown';
  const message = error instanceof Error ? error.message : String(error);
  logger.error(`[AuthStorage] ${op} failed`, { errorName: name, messageLength: message.length });
}

// Custom storage adapter for Expo SecureStore
const ExpoSecureStoreAdapter = {
  getItem: async (key: string) => {
    try {
      if (Platform.OS === 'web') {
        return localStorage.getItem(key);
      }
      return await SecureStore.getItemAsync(key);
    } catch (error) {
      logAuthStorageError('getItem', error);
      return null;
    }
  },
  setItem: async (key: string, value: string) => {
    try {
      if (Platform.OS === 'web') {
        localStorage.setItem(key, value);
        await clearAuthStorageWriteFailed();
        return;
      }
      await SecureStore.setItemAsync(key, value);
      await clearAuthStorageWriteFailed();
    } catch (error) {
      logAuthStorageError('setItem', error);
      await markAuthStorageWriteFailed();
      // Propagate so GoTrue does not assume persistence succeeded (avoids fake-success logins)
      throw error;
    }
  },
  // Bounded retry: transient Keychain errors should not leave a ghost session on disk after sign-out.
  removeItem: async (key: string) => {
    const runWeb = () => {
      localStorage.removeItem(key);
    };
    const runNative = async () => {
      await SecureStore.deleteItemAsync(key);
    };
    try {
      if (Platform.OS === 'web') {
        runWeb();
        await clearAuthStorageRemoveFailed();
        return;
      }
      try {
        await runNative();
      } catch (firstErr) {
        logAuthStorageError('removeItem', firstErr);
        await new Promise<void>((r) => setTimeout(r, 120));
        await runNative();
      }
      await clearAuthStorageRemoveFailed();
    } catch (error) {
      logAuthStorageError('removeItem', error);
      // Separate from write-failed: boot will run local signOut once to clear orphaned SecureStore session.
      await markAuthStorageRemoveFailed();
      // Resolve so GoTrue can finish in-memory sign-out.
    }
  },
};

// Validate Supabase configuration for production
const isSupabaseConfigured = supabaseUrl && 
  supabaseAnonKey && 
  !supabaseUrl.includes('placeholder') && 
  supabaseUrl.startsWith('https://');

// Production build validation - fail if Supabase not configured
const isProduction = env.isProduction;
if (isProduction && !isSupabaseConfigured) {
  // Don't log specific variable names in production to avoid exposing configuration details
  const errorMessage = 
    '❌ CRITICAL: Backend service is not configured for production build!\n' +
    'Production builds require valid backend configuration.';
  logger.error(errorMessage);
  // In production, throw error to prevent app from running with broken backend
  if (typeof window === 'undefined' || Platform.OS !== 'web') {
    // For native builds, we'll show a runtime error screen
    // For now, log the error - the app will fail gracefully when trying to use Supabase
  }
}

if (!isSupabaseConfigured) {
  if (!isProduction) {
    logger.warn(
      '⚠️ Backend service is not configured.\n' +
      'The app will work in offline mode, but authentication and cloud sync will not be available.'
    );
  }
}

// Create Supabase client with placeholder values if not configured
// In production, this should be properly configured via environment variables
const safeSupabaseUrl = supabaseUrl || 'https://placeholder.example.com';
const safeSupabaseKey = supabaseAnonKey || 'placeholder-key';

// Export configuration status for runtime checks
export const isSupabaseConfiguredForProduction = isSupabaseConfigured;

export const supabase = createClient(safeSupabaseUrl, safeSupabaseKey, {
  auth: {
    storage: ExpoSecureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

type SupabaseClientType = typeof supabase;
let supabaseOverride: SupabaseClientType | null = null;

export const getSupabaseClient = (): SupabaseClientType => supabaseOverride || supabase;

export const setSupabaseClientOverride = (client: SupabaseClientType | null): void => {
  supabaseOverride = client;
};

// Database types
export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          created_at: string;
          display_name: string | null;
          pro_unlocked: boolean;
          pro_unlocked_at: string | null;
          onboarding_completed: boolean;
          avatar_url: string | null;
        };
        Insert: {
          id: string;
          created_at?: string;
          display_name?: string | null;
          pro_unlocked?: boolean;
          pro_unlocked_at?: string | null;
          onboarding_completed?: boolean;
          avatar_url?: string | null;
        };
        Update: {
          id?: string;
          created_at?: string;
          display_name?: string | null;
          pro_unlocked?: boolean;
          pro_unlocked_at?: string | null;
          onboarding_completed?: boolean;
          avatar_url?: string | null;
        };
      };
      counters: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          emoji: string | null;
          color: string | null;
          unit: string;
          enable_streak: boolean;
          sort_index: number;
          total: number;
          last_activity_date: string | null;
          deleted_at: string | null;
          created_at: string;
          updated_at: string;
          gated: boolean | null;
          gate_type: string | null;
          min_interval_minutes: number | null;
          max_per_day: number | null;
          /** Present when migration `20250211100000_core_livra_sync_schema.sql` (or equivalent) is applied. */
          dailyTarget?: number | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          emoji?: string | null;
          color?: string | null;
          unit?: string;
          enable_streak?: boolean;
          sort_index?: number;
          total?: number;
          last_activity_date?: string | null;
          deleted_at?: string | null;
          created_at?: string;
          updated_at?: string;
          gated?: boolean | null;
          gate_type?: string | null;
          min_interval_minutes?: number | null;
          max_per_day?: number | null;
          dailyTarget?: number | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          emoji?: string | null;
          color?: string | null;
          unit?: string;
          enable_streak?: boolean;
          sort_index?: number;
          total?: number;
          last_activity_date?: string | null;
          deleted_at?: string | null;
          created_at?: string;
          updated_at?: string;
          gated?: boolean | null;
          gate_type?: string | null;
          min_interval_minutes?: number | null;
          max_per_day?: number | null;
          dailyTarget?: number | null;
        };
      };
      counter_events: {
        Row: {
          id: string;
          user_id: string;
          counter_id: string;
          event_type: 'increment' | 'reset' | 'decrement';
          amount: number;
          occurred_at: string;
          occurred_local_date: string;
          meta: any;
          deleted_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          counter_id: string;
          event_type: 'increment' | 'reset' | 'decrement';
          amount?: number;
          occurred_at?: string;
          occurred_local_date: string;
          meta?: any;
          deleted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          counter_id?: string;
          event_type?: 'increment' | 'reset' | 'decrement';
          amount?: number;
          occurred_at?: string;
          occurred_local_date?: string;
          meta?: any;
          deleted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      counter_streaks: {
        Row: {
          id: string;
          user_id: string;
          counter_id: string;
          current_streak: number;
          longest_streak: number;
          last_increment_date: string | null;
          deleted_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          counter_id: string;
          current_streak?: number;
          longest_streak?: number;
          last_increment_date?: string | null;
          deleted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          counter_id?: string;
          current_streak?: number;
          longest_streak?: number;
          last_increment_date?: string | null;
          deleted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      counter_badges: {
        Row: {
          id: string;
          user_id: string;
          counter_id: string;
          badge_code: string;
          progress_value: number;
          target_value: number;
          earned_at: string | null;
          last_progressed_at: string | null;
          deleted_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          counter_id: string;
          badge_code: string;
          progress_value?: number;
          target_value: number;
          earned_at?: string | null;
          last_progressed_at?: string | null;
          deleted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          counter_id?: string;
          badge_code?: string;
          progress_value?: number;
          target_value?: number;
          earned_at?: string | null;
          last_progressed_at?: string | null;
          deleted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      mark_notes: {
        Row: {
          id: string;
          mark_id: string;
          user_id: string;
          date: string;        // YYYY-MM-DD
          text: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          mark_id: string;
          user_id: string;
          date: string;
          text: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          mark_id?: string;
          user_id?: string;
          date?: string;
          text?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
    };
  };
};

