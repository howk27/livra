import { useEffect, useState } from 'react';
import { Redirect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  useUIStore,
  ONBOARDING_COMPLETED_STORAGE_KEY,
  ONBOARDING_COMPLETED_LEGACY_KEY,
} from '../state/uiSlice';
import { useAuth } from '../hooks/useAuth';
import { logger } from '../lib/utils/logger';
import { LoadingScreen } from '../components/LoadingScreen';

/**
 * Root redirect: auth → onboarding (if `hasCompletedOnboarding` / `isOnboarded` is false) → home.
 * Onboarding completion is **local-first**: `has_completed_onboarding` in AsyncStorage + `isOnboarded`.
 * When the profile query succeeds with `onboarding_completed: true`, keys are synced up.
 * Server “false” does not erase local completion (avoids races / failed profile updates trapping users).
 */
export default function Index() {
  const { isAuthenticated, initialized, loading, user } = useAuth();
  const isOnboarded = useUIStore((state) => state.isOnboarded);
  const uiStateLoaded = useUIStore((state) => state.uiStateLoaded);
  const [timeoutReached, setTimeoutReached] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const timer = setTimeout(async () => {
      if (initialized && !loading && uiStateLoaded) {
        return;
      }

      const { isOnboarded: onboardedAtTimeout } = useUIStore.getState();
      logger.warn('[Index] Loading timeout — proceeding with fallback', {
        initialized,
        loading,
        uiStateLoaded,
        isOnboarded: onboardedAtTimeout,
        hasUser: Boolean(user?.id),
      });

      if (initialized && !loading && !uiStateLoaded && !cancelled) {
        try {
          const [[, modern], [, legacy]] = await AsyncStorage.multiGet([
            ONBOARDING_COMPLETED_STORAGE_KEY,
            ONBOARDING_COMPLETED_LEGACY_KEY,
          ]);
          const localDone = modern === 'true' || legacy === 'true';
          const { isOnboarded: current } = useUIStore.getState();
          if (!cancelled) {
            useUIStore.setState({
              isOnboarded: current || localDone,
              uiStateLoaded: true,
            });
            logger.warn('[Index] Timeout: merged onboarding from AsyncStorage (does not downgrade)', {
              localDone,
              mergedOnboarded: current || localDone,
            });
          }
        } catch (e) {
          logger.error('[Index] Timeout AsyncStorage hydrate failed', e);
          if (!cancelled) {
            useUIStore.setState({ uiStateLoaded: true });
          }
        }
      }

      if (!cancelled) {
        setTimeoutReached(true);
      }
    }, 8000);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [initialized, loading, uiStateLoaded, user?.id]);

  if ((!initialized || loading || !uiStateLoaded) && !timeoutReached) {
    return <LoadingScreen />;
  }

  if (!isAuthenticated) {
    return <Redirect href="/auth/signin" />;
  }

  if (!isOnboarded) {
    return <Redirect href="/onboarding" />;
  }

  return <Redirect href="/(tabs)/home" />;
}
