// CRITICAL: Import react-native-get-random-values FIRST before any uuid imports
import 'react-native-get-random-values';
import React, { useEffect, useRef, useState } from 'react';
import { useFonts } from 'expo-font';
import {
  CormorantGaramond_400Regular_Italic,
  CormorantGaramond_600SemiBold,
  CormorantGaramond_700Bold,
} from '@expo-google-fonts/cormorant-garamond';
import {
  DMSans_400Regular,
  DMSans_500Medium,
  DMSans_600SemiBold,
  DMSans_700Bold,
} from '@expo-google-fonts/dm-sans';
import * as SplashScreen from 'expo-splash-screen';
import { AppState, AppStateStatus, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Stack, useRouter, usePathname, useGlobalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as Linking from 'expo-linking';
import { initDatabase, cleanupInvalidBadges } from '../lib/db';
import { useUIStore } from '../state/uiSlice';
import { useEffectiveTheme } from '../state/uiSlice';
import { useAuth } from '../hooks/useAuth';
import { useSync } from '../hooks/useSync';
import { themedColors } from '../theme/tokens';
import { NotificationProvider } from '../contexts/NotificationContext';
import { cleanupDuplicateCounters } from '../lib/db/cleanup';
import { parseError } from '../hooks/useSync';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { AuthPersistenceGate } from '../components/AuthPersistenceGate';
import { logger } from '../lib/utils/logger';
import { DevToolsProvider } from '../providers/DevToolsProvider';
import { ExperimentsProvider } from '../providers/ExperimentsProvider';
import { useFeaturesStore } from '../state/featuresSlice';
import { useGoalsStore } from '../state/goalsSlice';
import { useMarksStore } from '../state/countersSlice';
import { syncWidgetData } from '../lib/widgets/widgetSync';
import { useDailyTrackingStore } from '../state/dailyTrackingSlice';
import { useAppDateStore } from '../state/appDateSlice';
import {
  recordBehaviorNotificationTap,
  recordBehaviorAppForeground,
} from '../services/behaviorNotifications';
import { requestLivraLocalNotificationReschedule } from '../services/livraLocalNotificationOwner';
import { getSupabaseClient } from '../lib/supabase';
import { getMilestonesToFire, MILESTONE_COPY } from '../lib/goalMilestones';
import { getAppDate } from '../lib/appDate';
import { checkProStatus } from '../lib/iap/iap';
import { reVerifyProOnLaunch } from '../lib/iap/iapReVerify';
import { useXPStore } from '../state/xpSlice';
import { useGoalCompletionStore } from '../state/goalCompletionStore';
import { GoalCompletionOverlay } from '../components/overlays/GoalCompletionOverlay';
import { initAnalytics, identify, resetAnalytics, screenTrack } from '../lib/analytics/posthog';

SplashScreen.preventAutoHideAsync().catch(() => {});

const queryClient = new QueryClient();

Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const data = notification.request.content.data as Record<string, unknown>;
    const isMilestone = data?.type === 'milestone';
    return {
      shouldShowAlert: isMilestone,
      shouldShowBanner: isMilestone,
      shouldShowList: isMilestone,
      shouldPlaySound: false,
      shouldSetBadge: false,
    };
  },
});

let milestonesChecking = false;

async function checkAndFireMilestones(): Promise<void> {
  if (milestonesChecking) return;
  milestonesChecking = true;
  try {
    const { goals, markMilestonesFired } = useGoalsStore.getState();
    const today = getAppDate();
    const activeGoals = goals.filter(g => g.status === 'active');
    for (const goal of activeGoals) {
      const due = getMilestonesToFire(goal, today);
      if (due.length === 0) continue;
      // Highest-priority (furthest-along) milestone only — avoids notification spam; all due keys are marked fired.
      const toNotify = due[due.length - 1];
      await Notifications.scheduleNotificationAsync({
        identifier: `livra-milestone-${goal.id}-${toNotify}`,
        content: {
          title: goal.title,
          body: MILESTONE_COPY[toNotify],
          data: { type: 'milestone', goalTitle: goal.title, milestoneKey: toNotify, livraOwner: true },
        },
        trigger: null,
      });
      await markMilestonesFired(goal.id, due);
    }
  } finally {
    milestonesChecking = false;
  }
}

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
  const [fontsLoaded] = useFonts({
    CormorantGaramond_400Regular_Italic,
    CormorantGaramond_600SemiBold,
    CormorantGaramond_700Bold,
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_600SemiBold,
    DMSans_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded]);

  // Biometric lock retired with the Privacy & Security screen (QC 2026-07-12).
  // Clear any stored flag so a re-added lock never inherits stale state.
  useEffect(() => {
    AsyncStorage.removeItem('biometric_lock_enabled').catch(() => {});
  }, []);

  const loadUIState = useUIStore((state) => state.loadUIState);
  const { user, initialized } = useAuth();
  const { sync } = useSync();
  const router = useRouter();
  const pathname = usePathname();
  const params = useGlobalSearchParams();
  const appStateRef = useRef(AppState.currentState);
  const previousPathnameRef = useRef<string | undefined>(undefined);

  const markCount = useMarksStore((s) => s.marks.length);
  const activeGoalTitle = useGoalsStore((s) => s.getActiveGoal()?.title);

  useEffect(() => {
    if (initialized) {
      void syncWidgetData();
    }
  }, [initialized, markCount, activeGoalTitle]);

  useEffect(() => {
    if (!initialized) return;

    const handleBehaviorResponse = (response: Notifications.NotificationResponse | null) => {
      if (!response) return;
      const data = response.notification.request.content.data as Record<string, unknown>;
      const t = data?.type;
      if (data?.behavior === true || (typeof t === 'string' && t.startsWith('behavior_'))) {
        recordBehaviorNotificationTap().catch(() => {});
      }
    };

    const handleMilestoneResponse = (response: Notifications.NotificationResponse | null) => {
      if (!response) return;
      const data = response.notification.request.content.data as Record<string, unknown>;
      if (
        data?.type === 'milestone' &&
        typeof data.goalTitle === 'string' &&
        typeof data.milestoneKey === 'string'
      ) {
        router.replace({
          pathname: '/goal/milestone',
          params: { goalTitle: data.goalTitle, milestoneKey: data.milestoneKey },
        });
      }
    };

    Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        handleBehaviorResponse(response);
        handleMilestoneResponse(response);
        void Notifications.clearLastNotificationResponse();
      })
      .catch(() => {});

    const responseSub = Notifications.addNotificationResponseReceivedListener((response) => {
      handleBehaviorResponse(response);
      handleMilestoneResponse(response);
      void recordBehaviorAppForeground();
    });

    const onAppState = (next: AppStateStatus) => {
      const wasBackground =
        appStateRef.current === 'background' || appStateRef.current === 'inactive';
      appStateRef.current = next;
      if (next === 'active' && wasBackground) {
        void recordBehaviorAppForeground();
        checkAndFireMilestones().catch(() => {});
        void syncWidgetData();
        useGoalsStore.getState().checkAllGoalExpiry();
        requestLivraLocalNotificationReschedule(user?.id);
        void useGoalsStore
          .getState()
          .evaluateActiveGoalsMomentum()
          .then(() =>
            import('../services/momentumWarningNotifications').then(({ reconcileMomentumWarnings }) =>
              reconcileMomentumWarnings(user?.id),
            ),
          )
          .catch(() => {});
      }
    };
    const appSub = AppState.addEventListener('change', onAppState);

    return () => {
      responseSub.remove();
      appSub.remove();
    };
  }, [initialized, user?.id]);

  useEffect(() => {
    initAnalytics();
  }, []);

  // Manual screen tracking for Expo Router
  useEffect(() => {
    if (previousPathnameRef.current !== pathname) {
      screenTrack(pathname, { previous_screen: previousPathnameRef.current ?? null, ...params });
      previousPathnameRef.current = pathname;
    }
  }, [pathname, params]);

  // Identify on sign-in, reset on sign-out. Runs once here (not inside useAuth,
  // which is called from multiple screens and would fire this redundantly).
  const prevUserIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!initialized) return;
    const nextId = user?.id ?? null;
    if (nextId === prevUserIdRef.current) return;
    if (nextId) {
      identify(nextId);
    } else if (prevUserIdRef.current) {
      resetAnalytics();
    }
    prevUserIdRef.current = nextId;
  }, [initialized, user?.id]);

  useEffect(() => {
    // Initialize database first, then cleanup invalid badges
    const init = async () => {
      await initDatabase();
      await useAppDateStore.getState().hydrate();
      await useDailyTrackingStore.getState().loadDailyTracking();
      await useFeaturesStore.getState().loadSkipFeatures();
      // Cleanup badges with invalid user_id (like "local-user")
      const removedCount = await cleanupInvalidBadges();
      if (removedCount > 0) {
        logger.log(`[App] Cleaned up ${removedCount} badge(s) with invalid user_id on startup`);
      }
    };
    init();
  }, []);

  // Handle deep links for password reset (async: must call setSession — auth has detectSessionInUrl: false)
  useEffect(() => {
    const qp = (params: Record<string, unknown>, key: string): string | undefined => {
      const v = params[key];
      if (typeof v === 'string') return v;
      if (Array.isArray(v) && typeof v[0] === 'string') return v[0];
      return undefined;
    };

    const parseHashParams = (fullUrl: string): Record<string, string> => {
      const out: Record<string, string> = {};
      const hashIndex = fullUrl.indexOf('#');
      if (hashIndex === -1) return out;
      const hashFragment = fullUrl.substring(hashIndex + 1);
      try {
        hashFragment.split('&').forEach((param) => {
          const eq = param.indexOf('=');
          if (eq <= 0) return;
          const key = param.slice(0, eq);
          const raw = param.slice(eq + 1);
          if (key && raw) {
            out[key] = decodeURIComponent(raw.replace(/\+/g, ' '));
          }
        });
      } catch (hashError) {
        logger.warn('[Deep Link] Failed to parse hash fragment:', hashError);
      }
      return out;
    };

    const handleDeepLink = async (incomingUrl: string) => {
      try {
        if (!incomingUrl || typeof incomingUrl !== 'string' || incomingUrl.trim().length === 0) {
          logger.warn('[Deep Link] Invalid URL received:', incomingUrl);
          return;
        }

        logger.log('[Deep Link] Received URL:', incomingUrl);

        let parsed;
        try {
          parsed = Linking.parse(incomingUrl);
        } catch (parseError) {
          logger.error('[Deep Link] Failed to parse URL:', parseError);
          return;
        }

        const isResetPassword =
          parsed.path === 'auth/reset-password' ||
          parsed.path === '/auth/reset-password' ||
          incomingUrl.includes('/auth/reset-password') ||
          incomingUrl.includes('auth/reset-password');

        const isUniversalLink =
          (incomingUrl.startsWith('https://livralife.com/auth/reset-password') ||
            incomingUrl.startsWith('https://www.livralife.com/auth/reset-password')) &&
          incomingUrl.includes('livralife.com/auth/reset-password');

        // Widget deep links — handle before the password-reset guard
        const isWidgetHome = incomingUrl === 'livra://home' || incomingUrl.startsWith('livra://home?');
        const isWidgetLogMark = incomingUrl.startsWith('livra://log-mark');

        if (isWidgetHome) {
          router.replace('/(tabs)/focus' as any);
          return;
        }

        if (isWidgetLogMark) {
          try {
            const asHttpUrl = incomingUrl.replace('livra://', 'https://livra.app/');
            const url = new URL(asHttpUrl);
            const markId = url.searchParams.get('markId');
            if (markId) {
              router.replace({ pathname: '/(tabs)/focus' as any, params: { logMarkId: markId } });
            } else {
              router.replace('/(tabs)/focus' as any);
            }
          } catch {
            router.replace('/(tabs)/focus' as any);
          }
          return;
        }

        if (!isResetPassword && !isUniversalLink) {
          return;
        }

        const isLikelyAccessToken = (value: string) =>
          value.trim().length > 20 && value.includes('.');

        const queryParams = (parsed.queryParams || {}) as Record<string, unknown>;
        const hashParams = parseHashParams(incomingUrl);

        const accessToken =
          qp(queryParams, 'access_token') ||
          hashParams.access_token ||
          qp(queryParams, 'token') ||
          hashParams.token;

        const refreshToken =
          qp(queryParams, 'refresh_token') || hashParams.refresh_token || '';

        const type =
          qp(queryParams, 'type') || hashParams.type || qp(queryParams, '#type') || '';

        logger.log('[Deep Link] Password reset detected', {
          hasAccessToken: Boolean(accessToken),
          hasRefreshToken: Boolean(refreshToken),
          type,
          urlFormat: isUniversalLink ? 'universal' : 'deep',
        });

        if (type === 'recovery' && accessToken && refreshToken && isLikelyAccessToken(accessToken)) {
          const supabase = getSupabaseClient();
          const { error: sessionError } = await supabase.auth.setSession({
            access_token: accessToken.trim(),
            refresh_token: refreshToken.trim(),
          });
          if (sessionError) {
            logger.error('[Deep Link] Recovery setSession failed:', sessionError);
            router.replace('/auth/reset-password');
            return;
          }
          router.replace('/auth/reset-password-complete');
          return;
        }

        if (type === 'recovery' && accessToken && isLikelyAccessToken(accessToken)) {
          logger.warn('[Deep Link] Recovery link missing refresh_token; request a new reset email');
          router.replace('/auth/reset-password');
          return;
        }

        logger.warn('[Deep Link] No valid recovery tokens in URL; opening reset screen to check session');
        router.replace('/auth/reset-password-complete');
      } catch (error) {
        logger.error('[Deep Link] Error handling deep link:', error);
      }
    };

    const handleInitialURL = async () => {
      const initialUrl = await Linking.getInitialURL();
      if (initialUrl) {
        await handleDeepLink(initialUrl);
      }
    };

    const subscription = Linking.addEventListener('url', (event) => {
      void handleDeepLink(event.url);
    });

    void handleInitialURL();

    return () => {
      subscription.remove();
    };
  }, [initialized, router]);

  // Load UI state after auth initializes (with userId if available)
  // This ensures we check the database for onboarding status on app refresh
  useEffect(() => {
    if (initialized) {
      loadUIState(user?.id).catch((error) => {
        logger.error('Error loading UI state:', error);
      });
    }
  }, [initialized, user?.id, loadUIState]);

  // Silently re-verify subscription receipt once per 24h on launch.
  // Only runs when the user is known to be pro — skips for free users.
  useEffect(() => {
    if (!initialized || !user?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const status = await checkProStatus();
        if (cancelled) return;
        if (status.effectiveUnlocked) {
          await reVerifyProOnLaunch();
        }
      } catch {
        // Fail open — never block app launch
      }
    })();
    return () => { cancelled = true; };
  }, [initialized, user?.id]);

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
          await useGoalsStore.getState().loadGoals(user.id);
          checkAndFireMilestones().catch(() => {});
          await useXPStore.getState().loadXP(user.id);
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
          await useDailyTrackingStore.getState().loadDailyTracking();
          await useFeaturesStore.getState().loadSkipFeatures();
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
          <DevToolsProvider>
            <ExperimentsProvider>
              <NotificationProvider>
                <View style={{ flex: 1 }}>
                  <RootNavigator />
                  <AuthPersistenceGate />
                </View>
              </NotificationProvider>
            </ExperimentsProvider>
          </DevToolsProvider>
        </QueryClientProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}

function RootNavigator() {
  const theme = useEffectiveTheme();
  const goalCompletionShow = useGoalCompletionStore((s) => s.show);

  // Detect newly completed goals and trigger overlay
  const goals = useGoalsStore((s) => s.goals);
  const showCompletion = useGoalCompletionStore((s) => s.showCompletion);
  const prevGoalStatusRef = React.useRef<Record<string, string>>({});
  useEffect(() => {
    const prev = prevGoalStatusRef.current;
    goals.forEach((g) => {
      if (g.status === 'completed' && prev[g.id] && prev[g.id] !== 'completed') {
        showCompletion(g);
      }
    });
    const next: Record<string, string> = {};
    goals.forEach((g) => { next[g.id] = g.status; });
    prevGoalStatusRef.current = next;
  }, [goals, showCompletion]);

  return (
    <>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: themedColors(theme).linen },
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="mark/[id]" options={{ presentation: 'modal' }} />
        <Stack.Screen name="onboarding" options={{ presentation: 'fullScreenModal' }} />
        <Stack.Screen name="paywall" options={{ presentation: 'modal' }} />
        {/* AUTH-3: full-screen + non-dismissible so an unauthenticated (null) session
            cannot swipe the auth modal down to reach the tab navigator underneath.
            The redirect gate lives in app/index.tsx; this closes the swipe bypass. */}
        <Stack.Screen
          name="auth"
          options={{ presentation: 'fullScreenModal', gestureEnabled: false }}
        />
        <Stack.Screen name="iap-dashboard" options={{ presentation: 'modal' }} />
        <Stack.Screen name="goal/new" options={{ presentation: 'modal', title: 'New Goal', headerShown: false }} />
        <Stack.Screen name="goal/[id]" options={{ presentation: 'modal', headerShown: false }} />
        <Stack.Screen
          name="goal/complete"
          options={{
            presentation: 'fullScreenModal',
            headerShown: false,
            gestureEnabled: false,
          }}
        />
        <Stack.Screen name="goal/history" options={{ headerShown: false }} />
        <Stack.Screen name="settings/notifications" options={{ headerShown: false }} />
        <Stack.Screen name="settings/profile" options={{ headerShown: false }} />
        <Stack.Screen name="settings/about" options={{ headerShown: false }} />
        <Stack.Screen name="signin" options={{ headerShown: false }} />
        <Stack.Screen
          name="goal/milestone"
          options={{
            presentation: 'fullScreenModal',
            headerShown: false,
            gestureEnabled: false,
          }}
        />
      </Stack>
      <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
      {/* XP surfaces hidden for beta — accrual still runs (see decisions.md 2026-07-11).
          Re-enable by restoring the LevelUpModal render on pendingLevelUp. */}
      {goalCompletionShow && <GoalCompletionOverlay />}
    </>
  );
}

