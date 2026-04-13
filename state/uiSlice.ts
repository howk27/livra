import { create } from 'zustand';
import { ThemeMode, AccentColor, SortOption } from '../types';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSupabaseClient } from '../lib/supabase';
import { logger } from '../lib/utils/logger';

/** AsyncStorage key — user has finished onboarding (incl. first-completion step). Legacy: `is_onboarded`. */
export const ONBOARDING_COMPLETED_STORAGE_KEY = 'has_completed_onboarding';
export const ONBOARDING_COMPLETED_LEGACY_KEY = 'is_onboarded';
/** Set when local completion succeeded but profile.onboarding_completed could not be updated (cross-device may lag). */
export const ONBOARDING_REMOTE_PENDING_KEY = 'onboarding_remote_pending';

interface UIState {
  themeMode: ThemeMode;
  accentColor: AccentColor;
  sortBy: SortOption;
  searchQuery: string;
  /** True when user has completed onboarding (same as `hasCompletedOnboarding` in product copy). */
  isOnboarded: boolean;
  uiStateLoaded: boolean; // Track if UI state has been loaded from storage
  
  // Actions
  setThemeMode: (mode: ThemeMode) => Promise<void>;
  setAccentColor: (color: AccentColor) => Promise<void>;
  setSortBy: (sort: SortOption) => void;
  setSearchQuery: (query: string) => void;
  /** Returns false if logged-in cloud update failed (local completion still applied). */
  completeOnboarding: (userId?: string) => Promise<boolean>;
  loadUIState: (userId?: string) => Promise<void>;
  getEffectiveTheme: () => 'light' | 'dark';
}

export const useUIStore = create<UIState>((set, get) => ({
  themeMode: 'system',
  accentColor: 'blue',
  sortBy: 'recent',
  searchQuery: '',
  isOnboarded: false,
  uiStateLoaded: false,

  setThemeMode: async (mode) => {
    set({ themeMode: mode });
    await AsyncStorage.setItem('theme_mode', mode);
  },

  setAccentColor: async (color) => {
    set({ accentColor: color });
    await AsyncStorage.setItem('accent_color', color);
  },

  setSortBy: (sort) => {
    set({ sortBy: sort });
  },

  setSearchQuery: (query) => {
    set({ searchQuery: query });
  },

  completeOnboarding: async (userId?: string) => {
    const supabase = getSupabaseClient();
    const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
    const isSupabaseConfigured = Boolean(supabaseUrl && !supabaseUrl.includes('placeholder'));

    let remoteOk = true;

    if (userId && isSupabaseConfigured) {
      try {
        const { error } = await supabase
          .from('profiles')
          .update({ onboarding_completed: true })
          .eq('id', userId);

        if (error) {
          logger.error('[UIState] profile onboarding_completed update failed:', error);
          remoteOk = false;
        } else {
          await AsyncStorage.removeItem(ONBOARDING_REMOTE_PENDING_KEY);
        }
      } catch (error) {
        logger.error('[UIState] profile onboarding_completed update threw:', error);
        remoteOk = false;
      }
    }

    await AsyncStorage.multiSet([
      [ONBOARDING_COMPLETED_STORAGE_KEY, 'true'],
      [ONBOARDING_COMPLETED_LEGACY_KEY, 'true'],
    ]);
    set({ isOnboarded: true });

    if (userId && isSupabaseConfigured && !remoteOk) {
      await AsyncStorage.setItem(ONBOARDING_REMOTE_PENDING_KEY, '1');
    }

    return remoteOk;
  },

  loadUIState: async (userId?: string) => {
    const supabase = getSupabaseClient();
    const [themeMode, accentColor, completedModern, completedLegacy] = await Promise.all([
      AsyncStorage.getItem('theme_mode'),
      AsyncStorage.getItem('accent_color'),
      AsyncStorage.getItem(ONBOARDING_COMPLETED_STORAGE_KEY),
      AsyncStorage.getItem(ONBOARDING_COMPLETED_LEGACY_KEY),
    ]);

    let isOnboarded = completedModern === 'true' || completedLegacy === 'true';
    
    // If user is logged in, check database for onboarding status (takes precedence)
    if (userId) {
      try {
        // Check if Supabase is configured (not using placeholder)
        const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
        const isSupabaseConfigured = supabaseUrl && !supabaseUrl.includes('placeholder');
        
        if (!isSupabaseConfigured) {
          // Skip database query if Supabase not configured - use local storage only
          logger.log('[UIState] Supabase not configured, using local storage only');
        } else {
          // Add timeout to prevent hanging if Supabase is unavailable
          // Use a more robust timeout pattern that gracefully falls back
          try {
            const queryPromise = supabase
              .from('profiles')
              .select('onboarding_completed')
              .eq('id', userId)
              .single();
            
            // Create a timeout wrapper that resolves with a timeout marker
            const timeoutPromise = new Promise<{ data: null; error: { message: 'timeout' } }>((resolve) => 
              setTimeout(() => resolve({ data: null, error: { message: 'timeout' } }), 5000) // Increased to 5 seconds for slower networks
            );
            
            // Race the query against timeout - if timeout wins, we get timeout marker
            const queryResult = await Promise.race([
              queryPromise.then((result) => Promise.resolve({ data: result.data, error: result.error })),
              timeoutPromise,
            ]) as { data: any; error: any };
            
            if (!queryResult.error || queryResult.error.message !== 'timeout') {
              // Normal query result (success or non-timeout error)
              if (!queryResult.error && queryResult.data?.onboarding_completed) {
                isOnboarded = true;
                await AsyncStorage.multiSet([
                  [ONBOARDING_COMPLETED_STORAGE_KEY, 'true'],
                  [ONBOARDING_COMPLETED_LEGACY_KEY, 'true'],
                ]);
              }
              // If server says onboarding_completed false, keep local flags + isOnboarded (local-first; no silent wipe).
              // If error (e.g., profile doesn't exist yet), fall back to local storage
            } else {
              // Timeout occurred - silently fall back to local storage
              // This is expected behavior on slow networks, not an error
              logger.log('[UIState] Database query timeout, using local storage value');
            }
          } catch (queryError) {
            // Handle any unexpected errors
            logger.warn('[UIState] Error querying onboarding status, using local storage:', queryError);
            // Fall back to local storage value - don't block app initialization
          }
        }
      } catch (error: any) {
        // Only log as error if it's not a timeout (timeout is expected behavior)
        if (error?.message !== 'Database query timeout' && error?.message !== 'timeout') {
          logger.error('Error loading onboarding status from database:', error);
        }
        // Fall back to local storage value - don't block app initialization
      }
    }

    set({
      themeMode: (themeMode as ThemeMode) || 'system',
      accentColor: (accentColor as AccentColor) || 'blue',
      isOnboarded,
      uiStateLoaded: true,
    });
  },

  getEffectiveTheme: () => {
    const { themeMode } = get();
    if (themeMode === 'system') {
      // This will be called from a component context where we can access the hook
      // For now, return light as default
      return 'light';
    }
    return themeMode;
  },
}));

// Helper hook to get effective theme with system preference
export const useEffectiveTheme = (): 'light' | 'dark' => {
  const systemScheme = useColorScheme();
  const themeMode = useUIStore((state) => state.themeMode);

  if (themeMode === 'system') {
    return systemScheme === 'dark' ? 'dark' : 'light';
  }
  return themeMode;
};

