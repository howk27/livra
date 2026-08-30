// CRITICAL: Import react-native-get-random-values FIRST before any uuid imports
import 'react-native-get-random-values';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useFonts } from 'expo-font';
import {
  CormorantGaramond_400Regular_Italic,
  CormorantGaramond_600SemiBold,
  CormorantGaramond_700Bold,
} from '@expo-google-fonts/cormorant-garamond';
import {
  DMSans_400Regular,
  DMSans_400Regular_Italic,
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
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as Linking from 'expo-linking';
import { useUIStore } from '../state/uiSlice';
import { useIdentityStore } from '../state/identitySlice';
import { useEffectiveTheme } from '../state/uiSlice';
import { useAuth } from '../hooks/useAuth';
import { useDayRollover } from '../hooks/useDayRollover';
import { useHealthAutoSync } from '../hooks/useHealthAutoSync';
import { themedColors } from '../theme/tokens';
import { NotificationProvider } from '../contexts/NotificationContext';
import { ConfirmHost, ActionSheetHost } from '../components/ui/overlays';
import { confirm } from '../components/ui/overlays/confirmController';
import {
  readRecoveryTokenIdentity,
  shouldConfirmRecoverySwap,
  recoverySwapConfirmCopy,
} from '../lib/auth/recoveryAccountGuard';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { AuthPersistenceGate } from '../components/AuthPersistenceGate';
import { logger } from '../lib/utils/logger';
import { ExperimentsProvider } from '../providers/ExperimentsProvider';
import { useFeaturesStore } from '../state/featuresSlice';
import { syncWidgetData } from '../lib/widgets/widgetSync';
import { useAppDateStore } from '../state/appDateSlice';
// M9 Phase 5A Task 6: goals/marks reach this file through the query layer only.
import { useGoals, fetchGoals } from '../lib/data/goals';
import { useMarksForUser } from '../lib/data/marks';
import { queryKeys } from '../lib/data/queryKeys';
import { editGoal } from '../lib/data/mutations/goals';
import { toGoal } from '../lib/data/adapters';
import { expireDeadlinedGoals } from '../lib/goals/goalLifecycle';
import {
  evaluateGoalsMomentum,
  readGoalDataSnapshot,
} from '../lib/goals/momentumEvaluation';
import {
  recordBehaviorNotificationTap,
  recordBehaviorAppForeground,
} from '../services/behaviorNotifications';
import { requestLivraLocalNotificationReschedule } from '../services/livraLocalNotificationOwner';
import { getSupabaseClient } from '../lib/supabase';
import { initNetworkOnlineManager } from '../lib/data/connectivity';
import { runCutoverOnce } from '../lib/data/cutover';
import { markRecoveryPending, isRecoveryPending } from '../lib/auth/recoveryPending';
import { startOutbox } from '../lib/data/outbox';
import {
  queryClient,
  asyncStoragePersister,
  QUERY_CACHE_BUSTER,
  QUERY_CACHE_MAX_AGE,
} from '../lib/data/queryClient';
import { getMilestonesToFire, MILESTONE_COPY } from '../lib/goalMilestones';
import { getAppDate } from '../lib/appDate';
import { checkProStatus } from '../lib/iap/iap';
import { reVerifyProOnLaunch } from '../lib/iap/iapReVerify';
import { useGoalCompletionStore } from '../state/goalCompletionStore';
import { GoalCompletionOverlay } from '../components/overlays/GoalCompletionOverlay';
import { initAnalytics, identify, resetAnalytics, screenTrack } from '../lib/analytics/posthog';

SplashScreen.preventAutoHideAsync().catch(() => {});

// M9 — the read layer's QueryClient + persister live in lib/data/queryClient.ts
// (imported at the top) so store actions can reach the same instance for bridges.

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

// M9 Phase 5A Task 6: goals come from the query layer (fetched when the cache
// is cold — the login-time call runs before any screen has mounted the query)
// and the fired keys are stamped on the SERVER row via editGoal, which is what
// `milestones_fired` always was: a goals column.
async function checkAndFireMilestones(userId: string | undefined): Promise<void> {
  if (!userId || milestonesChecking) return;
  milestonesChecking = true;
  try {
    const goals = await queryClient.ensureQueryData({
      queryKey: queryKeys.goals(userId),
      queryFn: fetchGoals,
    });
    const today = getAppDate();
    let anyFired = false;
    for (const row of goals) {
      if (row.status !== 'active') continue;
      const goal = toGoal(row, []); // milestones read dates + fired keys, never links
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
      await editGoal(goal.id, {
        milestonesFired: [...new Set([...(goal.milestones_fired ?? []), ...due])],
      });
      anyFired = true;
    }
    if (anyFired) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.goals(userId) });
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
    DMSans_400Regular_Italic,
    DMSans_500Medium,
    DMSans_600SemiBold,
    DMSans_700Bold,
  });

  // The display preference, read on its own — no auth gate, no network. It is
  // NOT part of loadUIState's job below: that one waits for auth init and does a
  // profile round-trip, and the launch screen cannot wait for either.
  const loadThemeMode = useUIStore((state) => state.loadThemeMode);
  const themeLoaded = useUIStore((state) => state.themeLoaded);
  useEffect(() => {
    loadThemeMode();
  }, [loadThemeMode]);

  useEffect(() => {
    // Hold the native splash until the THEME is known as well as the fonts.
    // Hiding on fonts alone uncovered a LoadingScreen still holding the store's
    // 'system' default, so the first screen of every cold start followed the
    // phone instead of Settings (founder report 2026-08-02). `themeLoaded` is
    // guaranteed to settle — loadThemeMode races a timeout — so this can never
    // strand the app on its launch image.
    if (fontsLoaded && themeLoaded) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded, themeLoaded]);

  // M9 Phase 1 — drive React Query's online state from real device connectivity.
  useEffect(() => initNetworkOnlineManager(), []);

  // M9 Phase 4 — the offline outbox: load the persisted queue and wire its drain
  // triggers (start, reconnect, foreground). The write-success trigger lives in
  // the mutations themselves.
  useEffect(() => startOutbox(queryClient), []);

  // Biometric lock retired with the Privacy & Security screen (QC 2026-07-12).
  // Clear any stored flag so a re-added lock never inherits stale state.
  useEffect(() => {
    AsyncStorage.removeItem('biometric_lock_enabled').catch(() => {});
  }, []);

  const loadUIState = useUIStore((state) => state.loadUIState);
  const loadIdentityState = useIdentityStore((state) => state.loadIdentityState);
  const { user, initialized } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const params = useGlobalSearchParams();
  const appStateRef = useRef(AppState.currentState);
  const previousPathnameRef = useRef<string | undefined>(undefined);

  // Notices that the day ended while the app was open. Everything day-shaped
  // used to advance only on a return from the background.
  useDayRollover();

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
        checkAndFireMilestones(user?.id).catch(() => {});
        void syncWidgetData();
        requestLivraLocalNotificationReschedule(user?.id);
        // M9 Phase 5A Task 6: expiry + momentum run against the query cache
        // (lib/goals). Signed out there is no account data to evaluate.
        if (user?.id) {
          const userId = user.id;
          void expireDeadlinedGoals(queryClient, userId).catch(() => {});
          const snapshot = readGoalDataSnapshot(queryClient, userId);
          void evaluateGoalsMomentum(snapshot.goals, snapshot.marksByGoal, snapshot.events)
            .then(() =>
              import('../services/momentumWarningNotifications').then(({ reconcileMomentumWarnings }) =>
                reconcileMomentumWarnings(userId),
              ),
            )
            .catch(() => {});
        }
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
      // M9 Phase 5A: one-time wipe of old-architecture storage, before anything
      // below can read or recreate it. Static import — a runtime await import()
      // takes the catch branch under Jest and would look wired while never
      // running (this project shipped exactly that).
      // (Task 6: initDatabase / goal-notes load / badge cleanup are gone WITH
      // the local database they initialised.)
      await runCutoverOnce();
      await useAppDateStore.getState().hydrate();
      await useFeaturesStore.getState().loadSkipFeatures();
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

        // T4 trace (founder device, 2026-07-31): the reset email's link is
        // GoTrue /auth/v1/verify?token=…&type=recovery&redirect_to=
        // livra://auth/reset-password — the app receives the CUSTOM SCHEME
        // with the implicit-flow fragment (#access_token=…&refresh_token=…&
        // type=recovery). Linking.parse puts 'auth' in hostname for a scheme
        // URL, so the parsed.path checks alone never matched; the includes()
        // covers scheme AND https shapes, which also retires the old
        // isUniversalLink branch (redundant subset, never the live path).
        const isResetPassword =
          parsed.path === 'auth/reset-password' ||
          parsed.path === '/auth/reset-password' ||
          incomingUrl.includes('auth/reset-password');

        // Widget deep links — handle before the password-reset guard
        const isWidgetHome = incomingUrl === 'livra://home' || incomingUrl.startsWith('livra://home?');
        const isWidgetLogMark = incomingUrl.startsWith('livra://log-mark');

        // T4 security re-check (Critical): these branches route to the tabs and
        // fire on EVERY url event, so without this gate a recovery-session
        // holder could escape the set-password screen by opening livra://home —
        // the exact bypass the leash exists to close. While a reset is
        // pending, every deep link lands back on the set-password screen.
        if ((isWidgetHome || isWidgetLogMark) && (await isRecoveryPending())) {
          router.replace('/auth/reset-password-complete');
          return;
        }

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

        if (!isResetPassword) {
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
          urlFormat: incomingUrl.startsWith('https') ? 'universal' : 'deep',
        });

        if (type === 'recovery' && accessToken && refreshToken && isLikelyAccessToken(accessToken)) {
          const supabase = getSupabaseClient();

          // A recovery link installs whatever account its tokens belong to. If a
          // DIFFERENT account is signed in right now, that is a session swap and
          // the user has to agree to it first (founder ruling 2026-08-08:
          // confirm, do not refuse — resetting a second account on your own
          // device is a real workflow). GoTrue still verifies the tokens at
          // setSession; the decoded claims below only decide whether to ask.
          const { data: existing } = await supabase.auth.getSession();
          const currentUser = existing.session?.user ?? null;
          const incoming = readRecoveryTokenIdentity(accessToken.trim());

          if (shouldConfirmRecoverySwap(currentUser?.id, incoming.userId)) {
            // confirm() resolves false when no host is mounted yet, so a link
            // opened during a cold start refuses the swap rather than performing
            // it silently — the safe direction, and the user can tap again.
            const agreed = await confirm({
              ...recoverySwapConfirmCopy(currentUser?.email, incoming.email),
              destructive: true,
            });
            if (!agreed) {
              logger.warn('[Deep Link] Recovery session swap declined; existing session kept');
              router.replace('/(tabs)/focus' as any);
              return;
            }
          }

          const { error: sessionError } = await supabase.auth.setSession({
            access_token: accessToken.trim(),
            refresh_token: refreshToken.trim(),
          });
          if (sessionError) {
            logger.error('[Deep Link] Recovery setSession failed:', sessionError);
            router.replace('/auth/reset-password');
            return;
          }
          // T4: a recovery session is a FULL session — leash it to the
          // set-password screen (app/index.tsx enforces on every launch)
          // until updateUser({ password }) succeeds. Armed only AFTER
          // setSession, so a failed install never strands the flag.
          await markRecoveryPending();
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
      // spec §2 (Task 4): once-ever identity milestone memory, same bootstrap
      // timing as UI state — device-level, no userId dependency.
      loadIdentityState().catch((error) => {
        logger.error('Error loading identity state:', error);
      });
    }
  }, [initialized, user?.id, loadUIState, loadIdentityState]);

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

  // Login-time milestone check. M9 Phase 5A Task 6: the store hydration this
  // effect used to run is gone with the stores — the queries load themselves.
  // The milestone check keeps the small settle delay and fetches the goals it
  // needs (ensureQueryData inside).
  useEffect(() => {
    if (initialized && user && user.id) {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(user.id)) {
        logger.log('[App] Skipping milestone check - user ID is not a valid UUID:', user.id);
        return;
      }

      const userId = user.id;
      // Small delay to ensure everything is initialized
      const timer = setTimeout(() => {
        checkAndFireMilestones(userId).catch((error) => {
          logger.error('[App] Login-time milestone check failed:', error);
        });
      }, 1000);

      return () => clearTimeout(timer);
    }
  }, [user, initialized]);

  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <PersistQueryClientProvider
          client={queryClient}
          persistOptions={{
            persister: asyncStoragePersister,
            buster: QUERY_CACHE_BUSTER,
            maxAge: QUERY_CACHE_MAX_AGE,
          }}
        >
          <ExperimentsProvider>
            <NotificationProvider>
              <View style={{ flex: 1 }}>
                <RootNavigator />
                <WidgetQuerySync />
                <HealthAutoSyncMount />
                <AuthPersistenceGate />
                <ConfirmHost />
                <ActionSheetHost />
              </View>
            </NotificationProvider>
          </ExperimentsProvider>
        </PersistQueryClientProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}

// M9 Phase 5A Task 6 follow-up: `useMarksForUser`/`useGoals` are React Query
// HOOKS, so they must render INSIDE PersistQueryClientProvider. RootLayout's
// own body sits ABOVE the provider it mounts — calling them there crashed
// EVERY boot with "No QueryClient set" (caught in the web viewer; jest never
// renders RootLayout, so the suite stayed green).
function WidgetQuerySync() {
  const { initialized } = useAuth();
  const marksQuery = useMarksForUser();
  const goalsQuery = useGoals();
  const markCount = marksQuery.data?.length ?? 0;
  // Founder 2026-07-23(b): the widget sat on a COMPLETED goal until the next
  // foreground. This effect's deps only saw the FIRST active goal's title, so
  // completing any other goal (status flip, no mark-count change) never
  // triggered a snapshot rebuild. Watch the whole active set — a joined id
  // string, so the memo stays a cheap string compare — and the completed goal
  // drops out of the snapshot, advancing the widget queue.
  const { activeGoalTitle, activeGoalIdsKey } = useMemo(() => {
    const active = (goalsQuery.data ?? [])
      .filter((g) => g.status === 'active')
      .sort((a, b) => a.sort_index - b.sort_index);
    return {
      activeGoalTitle: active[0]?.title,
      activeGoalIdsKey: active.map((g) => g.id).join(','),
    };
  }, [goalsQuery.data]);

  // The snapshot carries the APP's theme (founder ruling 2026-08-02: the widget
  // follows the app's setting, not the phone's), so a theme change has to rewrite
  // it — otherwise the widget keeps the old scheme until the next data change.
  // Reading the EFFECTIVE theme also covers 'system' flipping under a user who
  // never touched the toggle.
  const widgetTheme = useEffectiveTheme();

  useEffect(() => {
    if (initialized) {
      void syncWidgetData();
    }
  }, [initialized, markCount, activeGoalTitle, activeGoalIdsKey, widgetTheme]);

  return null;
}

// Health auto-sync trigger (health-auto-sync T4, spec §2.2): launch +
// background→active, debounced inside the hook. Mounted HERE and not in
// RootLayout's body for the same reason as WidgetQuerySync above — the hook
// uses React Query hooks, which must render INSIDE PersistQueryClientProvider.
function HealthAutoSyncMount() {
  useHealthAutoSync();
  return null;
}

function RootNavigator() {
  const theme = useEffectiveTheme();
  const goalCompletionShow = useGoalCompletionStore((s) => s.show);

  // Detect newly completed goals and trigger overlay. M9 Phase 5A Task 6: the
  // transition is watched on the goals QUERY — the completing mutation
  // invalidates it, the refetch flips the status, and the overlay fires.
  const goalRows = useGoals().data;
  const showCompletion = useGoalCompletionStore((s) => s.showCompletion);
  const prevGoalStatusRef = React.useRef<Record<string, string>>({});
  useEffect(() => {
    if (!goalRows) return;
    const prev = prevGoalStatusRef.current;
    goalRows.forEach((g) => {
      if (g.status === 'completed' && prev[g.id] && prev[g.id] !== 'completed') {
        showCompletion(toGoal(g, []));
      }
    });
    const next: Record<string, string> = {};
    goalRows.forEach((g) => { next[g.id] = g.status; });
    prevGoalStatusRef.current = next;
  }, [goalRows, showCompletion]);

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
        <Stack.Screen name="goal/new" options={{ presentation: 'modal', title: 'New Goal', headerShown: false }} />
        <Stack.Screen name="goal/suggest" options={{ presentation: 'modal', title: 'Suggest a plan', headerShown: false }} />
        <Stack.Screen name="goal/[id]" options={{ presentation: 'modal', headerShown: false }} />
        <Stack.Screen name="goal/journal/[id]" options={{ presentation: 'modal', headerShown: false }} />
        {/* WR-2: the Weekly Review arrives as a modal, like every other detail
            surface; the review itself computes at render time inside the screen. */}
        <Stack.Screen name="review/index" options={{ presentation: 'modal', headerShown: false }} />
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
      {/* XP deleted in M9 Phase 5A (spec §4.4): surfaces were hidden for beta
          2026-07-11 and xp_events never existed server-side, so a reinstall
          reset everyone to level 1 anyway. */}
      {goalCompletionShow && <GoalCompletionOverlay />}
    </>
  );
}

