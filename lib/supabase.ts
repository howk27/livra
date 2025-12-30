import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { logger } from './utils/logger';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

// Custom storage adapter for Expo SecureStore
const ExpoSecureStoreAdapter = {
  getItem: async (key: string) => {
    try {
      if (Platform.OS === 'web') {
        return localStorage.getItem(key);
      }
      return await SecureStore.getItemAsync(key);
    } catch (error) {
      logger.error('Error getting item from SecureStore:', error);
      return null;
    }
  },
  setItem: async (key: string, value: string) => {
    try {
      if (Platform.OS === 'web') {
        localStorage.setItem(key, value);
        return;
      }
      await SecureStore.setItemAsync(key, value);
    } catch (error) {
      logger.error('Error setting item in SecureStore:', error);
      // Don't throw - allow app to continue without secure storage
    }
  },
  removeItem: async (key: string) => {
    try {
      if (Platform.OS === 'web') {
        localStorage.removeItem(key);
        return;
      }
      await SecureStore.deleteItemAsync(key);
    } catch (error) {
      logger.error('Error removing item from SecureStore:', error);
      // Don't throw - allow app to continue without secure storage
    }
  },
};

// Validate Supabase configuration for production
const isSupabaseConfigured = supabaseUrl && 
  supabaseAnonKey && 
  !supabaseUrl.includes('placeholder') && 
  supabaseUrl.startsWith('https://');

// Production build validation - fail if Supabase not configured
const isProduction = process.env.EXPO_PUBLIC_ENV === 'production' || !__DEV__;
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
    };
  };
};

