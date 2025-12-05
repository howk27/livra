import { useEffect, useState } from 'react';
import { Redirect } from 'expo-router';
import { useUIStore } from '../state/uiSlice';
import { useAuth } from '../hooks/useAuth';
import { query } from '../lib/db';
import { logger } from '../lib/utils/logger';
import { LoadingScreen } from '../components/LoadingScreen';

export default function Index() {
  const { isAuthenticated, initialized, loading, user } = useAuth();
  const isOnboarded = useUIStore((state) => state.isOnboarded);
  const uiStateLoaded = useUIStore((state) => state.uiStateLoaded);
  const [timeoutReached, setTimeoutReached] = useState(false);
  const [checkingCounters, setCheckingCounters] = useState(false);
  const [hasCounters, setHasCounters] = useState<boolean | null>(null);

  // Double-check: If onboarding state says not onboarded, verify by checking for existing counters
  // This prevents users from being sent back to onboarding after refresh if they already have counters
  useEffect(() => {
    const checkExistingCounters = async () => {
      // Only check if:
      // 1. Auth is initialized
      // 2. User is authenticated
      // 3. UI state is loaded
      // 4. Onboarding state says not onboarded (to avoid unnecessary checks)
      // 5. We have a valid user ID
      if (!initialized || loading || !uiStateLoaded || isOnboarded) {
        setCheckingCounters(false);
        return;
      }

      if (!isAuthenticated || !user?.id) {
        setCheckingCounters(false);
        setHasCounters(false);
        return;
      }

      setCheckingCounters(true);
      
      try {
        // Query database directly for existing counters (non-deleted)
        const existingCounters = await query<{ id: string }>(
          'SELECT id FROM lc_counters WHERE user_id = ? AND deleted_at IS NULL LIMIT 1',
          [user.id]
        );

        const hasExistingCounters = existingCounters && existingCounters.length > 0;
        setHasCounters(hasExistingCounters);
        
        // If user has counters but onboarding state says not onboarded, complete onboarding
        if (hasExistingCounters && !isOnboarded) {
          logger.log('[Index] User has counters but onboarding not marked complete - completing onboarding');
          const { completeOnboarding } = useUIStore.getState();
          await completeOnboarding(user.id);
        }
      } catch (error) {
        logger.error('[Index] Error checking for existing counters:', error);
        // On error, assume no counters (safer to show onboarding than skip it incorrectly)
        setHasCounters(false);
      } finally {
        setCheckingCounters(false);
      }
    };

    checkExistingCounters();
  }, [initialized, loading, uiStateLoaded, isAuthenticated, user?.id, isOnboarded]);

  // Add timeout to prevent infinite loading
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!initialized || loading || !uiStateLoaded || checkingCounters) {
        logger.warn('[Index] Loading timeout reached - proceeding anyway');
        setTimeoutReached(true);
      }
    }, 5000); // 5 second timeout

    return () => clearTimeout(timer);
  }, [initialized, loading, uiStateLoaded, checkingCounters]);

  // Wait for auth to initialize AND UI state to load AND counter check to complete (or timeout)
  if ((!initialized || loading || !uiStateLoaded || checkingCounters) && !timeoutReached) {
    return <LoadingScreen />;
  }

  // First check: If not authenticated, redirect to auth (required for production)
  if (!isAuthenticated) {
    return <Redirect href="/auth/signin" />;
  }

  // Second check: If authenticated but not onboarded, show onboarding
  // BUT: If user has counters (hasCounters === true), skip onboarding even if state says not onboarded
  // This handles the case where onboarding state was lost but user already has counters
  // Only show onboarding if:
  // - Not onboarded according to state AND
  // - Either counter check hasn't completed (hasCounters === null) OR user has no counters (hasCounters === false)
  // This prevents showing onboarding if user has counters but state was lost
  if (!isOnboarded) {
    // If counter check completed and user has counters, skip onboarding
    if (hasCounters === true) {
      // Already completed onboarding in the effect above, just redirect to home
      return <Redirect href="/(tabs)/home" />;
    }
    // If counter check is still pending or user has no counters, show onboarding
    // (Note: If timeout was reached and hasCounters is null, we'll show onboarding to be safe)
    return <Redirect href="/onboarding" />;
  }

  // Finally: If authenticated and (onboarded OR has counters), show main app
  return <Redirect href="/(tabs)/home" />;
}

