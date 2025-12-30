// CRITICAL: Import react-native-get-random-values FIRST before any uuid imports
import 'react-native-get-random-values';
import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as Linking from 'expo-linking';
import { initDatabase, cleanupInvalidBadges } from '../lib/db';
import { useUIStore } from '../state/uiSlice';
import { useEffectiveTheme } from '../state/uiSlice';
import { useAuth } from '../hooks/useAuth';
import { useSync } from '../hooks/useSync';
import { colors } from '../theme/colors';
import { NotificationProvider } from '../contexts/NotificationContext';
import { cleanupDuplicateCounters } from '../lib/db/cleanup';
import { parseError } from '../hooks/useSync';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { logger } from '../lib/utils/logger';

const queryClient = new QueryClient();

// Global error handlers to catch unhandled promise rejections and errors
if (typeof ErrorUtils !== 'undefined') {
  const originalHandler = ErrorUtils.getGlobalHandler();
  ErrorUtils.setGlobalHandler((error: Error, isFatal?: boolean) => {
    logger.error('Global error handler:', error, isFatal);
    if (originalHandler) {
      originalHandler(error, isFatal);
    }
  });
}

// Catch unhandled promise rejections (web only)
if (typeof window !== 'undefined' && window.addEventListener) {
  window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
    logger.error('Unhandled promise rejection:', event.reason);
  });
}

export default function RootLayout() {
  const loadUIState = useUIStore((state) => state.loadUIState);
  const { user, initialized } = useAuth();
  const { sync } = useSync();
  const router = useRouter();

  useEffect(() => {
    // Initialize database first, then cleanup invalid badges
    const init = async () => {
      await initDatabase();
      // Cleanup badges with invalid user_id (like "local-user")
      const removedCount = await cleanupInvalidBadges();
      if (removedCount > 0) {
        logger.log(`[App] Cleaned up ${removedCount} badge(s) with invalid user_id on startup`);
      }
    };
    init();
  }, []);

  // Handle deep links for password reset
  useEffect(() => {
    // Handle initial URL (app opened from closed state)
    const handleInitialURL = async () => {
      const initialUrl = await Linking.getInitialURL();
      if (initialUrl) {
        handleDeepLink(initialUrl);
      }
    };

    // Handle URLs when app is already open
    const subscription = Linking.addEventListener('url', (event) => {
      handleDeepLink(event.url);
    });

    handleInitialURL();

    return () => {
      subscription.remove();
    };
  }, [initialized]);

  const handleDeepLink = (url: string) => {
    try {
      // Validate URL is a string and not empty
      if (!url || typeof url !== 'string' || url.trim().length === 0) {
        logger.warn('[Deep Link] Invalid URL received:', url);
        return;
      }

      logger.log('[Deep Link] Received URL:', url);
      
      // Parse the URL with error handling
      let parsed;
      try {
        parsed = Linking.parse(url);
      } catch (parseError) {
        logger.error('[Deep Link] Failed to parse URL:', parseError);
        return;
      }

      // Check if it's a password reset link - support multiple URL formats
      const isResetPassword = 
        parsed.path === 'auth/reset-password' || 
        parsed.path === '/auth/reset-password' ||
        url.includes('/auth/reset-password') ||
        url.includes('auth/reset-password');
      
      // Also check for universal links (https://livralife.com/auth/reset-password or https://www.livralife.com/auth/reset-password)
      const isUniversalLink = 
        (url.startsWith('https://livralife.com/auth/reset-password') ||
         url.startsWith('https://www.livralife.com/auth/reset-password')) &&
        (url.includes('livralife.com/auth/reset-password'));
      
      if (isResetPassword || isUniversalLink) {
        const isLikelyToken = (value: any) =>
          typeof value === 'string' &&
          value.trim().length > 20 &&
          // Supabase recovery tokens are JWT-like and contain at least one '.'
          value.includes('.');

        // Extract token and type from URL - handle multiple formats
        // Supabase sends URLs like:
        // - livra://auth/reset-password#access_token=...&type=recovery
        // - livra://auth/reset-password?token=...&type=recovery
        // - https://livralife.com/auth/reset-password?access_token=...&type=recovery
        // - https://livralife.com/auth/reset-password#access_token=...&type=recovery
        
        const queryParams = parsed.queryParams || {};
        const hashParams: Record<string, any> = {};
        
        // Extract hash fragment parameters if present
        const hashIndex = url.indexOf('#');
        if (hashIndex !== -1) {
          const hashFragment = url.substring(hashIndex + 1);
          try {
            // Parse hash fragment (format: key=value&key2=value2)
            hashFragment.split('&').forEach(param => {
              const [key, value] = param.split('=');
              if (key && value) {
                hashParams[key] = decodeURIComponent(value);
              }
            });
          } catch (hashError) {
            logger.warn('[Deep Link] Failed to parse hash fragment:', hashError);
          }
        }
        
        // Try multiple token parameter names and locations
        const token = 
          queryParams.access_token ||
          queryParams.token ||
          hashParams.access_token ||
          hashParams.token ||
          queryParams['#access_token'] ||
          hashParams['#access_token'];
        
        // Try multiple type parameter names and locations
        const type = 
          queryParams.type ||
          hashParams.type ||
          queryParams['#type'] ||
          hashParams['#type'];
        
        logger.log('[Deep Link] Password reset detected', { 
          hasToken: !!token, 
          type,
          urlFormat: isUniversalLink ? 'universal' : 'deep'
        });
        
        // Validate token format (should be a non-empty string)
        if (token && isLikelyToken(token) && type === 'recovery') {
          // Navigate to reset password complete screen with token
          router.push({
            pathname: '/auth/reset-password-complete',
            params: {
              token: token.trim(),
              type: 'recovery',
            },
          });
        } else {
          // If no token in URL, Supabase might have set it in the session
          // Check session and navigate anyway - the screen will handle it
          logger.warn('[Deep Link] No valid token found in URL, navigating to reset screen to check session');
          router.push('/auth/reset-password-complete');
        }
      }
    } catch (error) {
      logger.error('[Deep Link] Error handling deep link:', error);
    }
  };

  // Load UI state after auth initializes (with userId if available)
  // This ensures we check the database for onboarding status on app refresh
  useEffect(() => {
    if (initialized) {
      loadUIState(user?.id).catch((error) => {
        logger.error('Error loading UI state:', error);
      });
    }
  }, [initialized, user?.id, loadUIState]);

  // Auto-sync when user logs in
  useEffect(() => {
    // CRITICAL: Only sync if user is authenticated with a valid UUID
    if (initialized && user && user.id) {
      // Validate that user.id is a valid UUID
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(user.id)) {
        logger.log('[App] Skipping sync - user ID is not a valid UUID:', user.id);
        return;
      }
      
      // Small delay to ensure everything is initialized
      const timer = setTimeout(async () => {
        try {
          // CRITICAL: Load marks from LOCAL DB FIRST before syncing
          // This ensures we have the correct local values before Supabase sync might overwrite them
          // The merge logic will preserve local values if they're higher
          const { useCountersStore } = await import('../state/countersSlice');
          const { useEventsStore } = await import('../state/eventsSlice');
          
          logger.log('[App] Loading marks from local DB before sync...');
          await useCountersStore.getState().loadMarks(user.id);
          useEventsStore.getState().loadEvents(undefined, user.id);
          logger.log('[App] Local marks loaded, now syncing...');
          
          // CRITICAL: Run cleanup before sync to remove any duplicates first
          // This ensures duplicates are removed before syncing new data
          const cleanupResult = await cleanupDuplicateCounters(user.id);
          if (cleanupResult.duplicatesByID + cleanupResult.duplicatesByName > 0) {
            logger.log(`[App] Cleaned up ${cleanupResult.duplicatesByID + cleanupResult.duplicatesByName} duplicate counter(s) on startup`);
          }
          
          await sync();
          
          // Run cleanup again after sync to catch any duplicates introduced during sync
          const postSyncCleanup = await cleanupDuplicateCounters(user.id);
          if (postSyncCleanup.duplicatesByID + postSyncCleanup.duplicatesByName > 0) {
            logger.log(`[App] Cleaned up ${postSyncCleanup.duplicatesByID + postSyncCleanup.duplicatesByName} duplicate counter(s) after sync`);
          }
          
          // Reload counters and events after sync to show synced data
          // CRITICAL: Only reload if sync actually completed successfully
          // The loadMarks function will preserve optimistic updates via recentUpdates tracking
          // Add a small delay to ensure any pending local writes complete first
          await new Promise(resolve => setTimeout(resolve, 500)); // 500ms delay
          logger.log('[App] Reloading marks after sync (merge will preserve local values)...');
          await useCountersStore.getState().loadMarks(user.id);
          useEventsStore.getState().loadEvents(undefined, user.id);
        } catch (error: any) {
          // Parse error to extract clean message (handles HTML responses like Cloudflare errors)
          const parsed = parseError(error);
          
          if (parsed.isNetworkError) {
            // Log a clean warning for network errors
            logger.warn('[App] Network/server error during auto-sync:', parsed.message);
          } else {
            // For other errors, log normally but truncate very long messages
            const truncatedMessage = parsed.message.length > 200 
              ? parsed.message.substring(0, 200) + '...'
              : parsed.message;
            logger.error('[App] Error auto-syncing after login:', truncatedMessage);
          }
          
          // Don't show notification here as it might be too early in the app lifecycle
          // Network errors are expected and will retry automatically on next sync
        }
      }, 1000);

      return () => clearTimeout(timer);
    }
  }, [user, initialized, sync]);

  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <QueryClientProvider client={queryClient}>
          <NotificationProvider>
            <RootNavigator />
          </NotificationProvider>
        </QueryClientProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}

function RootNavigator() {
  const theme = useEffectiveTheme();

  return (
    <>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme === 'dark' ? '#111827' : colors.light.background },
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="counter/[id]" options={{ presentation: 'modal' }} />
        <Stack.Screen name="onboarding" options={{ presentation: 'fullScreenModal' }} />
        <Stack.Screen name="paywall" options={{ presentation: 'modal' }} />
        <Stack.Screen name="auth" options={{ presentation: 'modal' }} />
        <Stack.Screen name="iap-dashboard" options={{ presentation: 'modal' }} />
      </Stack>
      <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
    </>
  );
}

