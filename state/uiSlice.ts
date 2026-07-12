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

/**
 * Bumped by `resetOnboardingState` (sign-out, or a brand-new account created on a device
 * that has stale onboarding flags from a previous account). `loadUIState` can run
 * concurrently — e.g. `_layout.tsx` re-triggers it the instant `user?.id` changes on
 * sign-up, racing the same reset — and its own AsyncStorage reads may have already
 * captured the stale "true" before the reset's `multiRemove` lands. Without this guard,
 * whichever call's `set()` lands last wins, and `loadUIState` is the slower one (it does
 * a network round-trip), so it would silently stomp the reset back to stale data.
 */
let onboardingResetToken = 0;

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
  completeOnboarding: (
    userId?: string,
    meta?: { commitment?: string; completedAt?: string }
  ) => Promise<boolean>;
  loadUIState: (userId?: string) => Promise<void>;
  /** Clears local onboarding completion so the next signed-in account (possibly a different one on this device) is re-evaluated from scratch. */
  resetOnboardingState: () => Promise<void>;
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

  completeOnboarding: async (
    userId?: string,
    meta?: { commitment?: string; completedAt?: string }
  ) => {
    const supabase = getSupabaseClient();
    const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
    const isSupabaseConfigured = Boolean(supabaseUrl && !supabaseUrl.includes('placeholder'));

    let remoteOk = true;
    let retryPending = false;

    if (userId && isSupabaseConfigured) {
      try {
        const profileUpdate: Record<string, unknown> = { onboarding_completed: true };
        if (meta?.commitment) profileUpdate.onboarding_focus_area = meta.commitment;
        if (meta?.completedAt) profileUpdate.onboarding_completed_at = meta.completedAt;
        const hasMetadata = Object.keys(profileUpdate).length > 1;

        const { error } = await supabase
          .from('profiles')
          .update(profileUpdate)
          .eq('id', userId);

        if (!error) {
          await AsyncStorage.removeItem(ONBOARDING_REMOTE_PENDING_KEY);
        } else if (hasMetadata) {
          // Column-level grants can deny the metadata columns (42501) while
          // onboarding_completed alone is allowed. The critical flag must land.
          logger.warn(
            '[UIState] full onboarding profile update denied, retrying critical flag only:',
            error
          );
          const { error: flagError } = await supabase
            .from('profiles')
            .update({ onboarding_completed: true })
            .eq('id', userId);
          if (flagError) {
            logger.error('[UIState] onboarding_completed flag update failed:', flagError);
            remoteOk = false;
          }
          retryPending = true;
        } else {
          logger.error('[UIState] profile onboarding_completed update failed:', error);
          remoteOk = false;
          retryPending = true;
        }
      } catch (error) {
        logger.error('[UIState] profile onboarding_completed update threw:', error);
        remoteOk = false;
        retryPending = true;
      }
    }

    await AsyncStorage.multiSet([
      [ONBOARDING_COMPLETED_STORAGE_KEY, 'true'],
      [ONBOARDING_COMPLETED_LEGACY_KEY, 'true'],
    ]);
    set({ isOnboarded: true });

    if (retryPending) {
      await AsyncStorage.setItem(ONBOARDING_REMOTE_PENDING_KEY, '1');
    }

    return remoteOk;
  },

  resetOnboardingState: async () => {
    onboardingResetToken += 1;
    await AsyncStorage.multiRemove([
      ONBOARDING_COMPLETED_STORAGE_KEY,
      ONBOARDING_COMPLETED_LEGACY_KEY,
      ONBOARDING_REMOTE_PENDING_KEY,
    ]);
    set({ isOnboarded: false, uiStateLoaded: false });
  },

  loadUIState: async (userId?: string) => {
    const tokenAtStart = onboardingResetToken;
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
          // A prior completeOnboarding could not sync the profile flag; retry it
          // now so cross-device state self-heals without user action.
          const pendingRetry = await AsyncStorage.getItem(ONBOARDING_REMOTE_PENDING_KEY);
          if (pendingRetry === '1' && isOnboarded) {
            try {
              const { error: retryError } = await supabase
                .from('profiles')
                .update({ onboarding_completed: true })
                .eq('id', userId);
              if (!retryError) {
                await AsyncStorage.removeItem(ONBOARDING_REMOTE_PENDING_KEY);
              }
            } catch (retryError) {
              logger.warn('[UIState] pending onboarding flag retry threw:', retryError);
            }
          }

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

    if (onboardingResetToken !== tokenAtStart) {
      // A reset (sign-out, or a new-account flag purge) landed while this call was
      // in flight. That reset is authoritative — apply everything except the
      // onboarding fields, which stay whatever the reset set them to.
      set({
        themeMode: (themeMode as ThemeMode) || 'system',
        accentColor: (accentColor as AccentColor) || 'blue',
        uiStateLoaded: true,
      });
      return;
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

