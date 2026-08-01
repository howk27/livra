import { useEffect, useState } from 'react';
import { Redirect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  useUIStore,
  ONBOARDING_COMPLETED_STORAGE_KEY,
  ONBOARDING_COMPLETED_LEGACY_KEY,
} from '../state/uiSlice';
import { useAuth } from '../hooks/useAuth';
import { isRecoveryPending } from '../lib/auth/recoveryPending';
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
  // null = not read yet; the recovery gate below refuses to route past it
  // while unknown, so a relaunch mid-reset cannot slip into the tabs.
  const [recoveryPending, setRecoveryPending] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    isRecoveryPending().then((value) => {
      if (!cancelled) setRecoveryPending(value);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const timer = setTimeout(async () => {
      if (initialized && !loading && uiStateLoaded) {
        return;
      }

      const { isOnboarded: onboardedAtTimeout } = useUIStore.getState();
      logger.warn('[Index] Loading timeout, proceeding with fallback', {
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

  // T4: a session installed by a password-reset link may not reach the app
  // until a new password is set — anyone holding the emailed link IS this
  // session. The leash is armed in _layout's deep-link handler and cleared
  // only by a successful updateUser({ password }).
  if (recoveryPending === null) {
    return <LoadingScreen />;
  }
  if (recoveryPending) {
    return <Redirect href="/auth/reset-password-complete" />;
  }

  if (!isOnboarded) {
    return <Redirect href={"/onboarding" as any} />;
  }

  return <Redirect href={'/(tabs)/focus' as any} />;
}
