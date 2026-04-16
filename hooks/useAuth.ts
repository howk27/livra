import { useEffect, useState, useCallback, useRef } from 'react';
import { getSupabaseClient } from '../lib/supabase';
import { Session, User } from '@supabase/supabase-js';
import { logger } from '../lib/utils/logger';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getAuthStorageWriteFailed,
  clearAuthStorageWriteFailed,
  clearAllAuthStorageHealthFlags,
  getAuthStorageRemoveFailed,
  clearAuthStorageRemoveFailed,
} from '../lib/auth/authStorageHealth';

interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
  initialized: boolean;
}

const MAIN_SESSION_TIMEOUT_MS = 8000;
const LATE_SESSION_DRAIN_MS = 2500;
/** If getSession / recovery never settles, stop blocking the app on loading forever (no fake session). */
const AUTH_BOOTSTRAP_FAILSAFE_MS = 25000;

export const useAuth = () => {
  const supabase = getSupabaseClient();
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    session: null,
    loading: true,
    initialized: false,
  });
  const [persistenceWarning, setPersistenceWarning] = useState(false);
  const sessionExpiredRef = useRef(false);

  const isSessionExpired = (session: Session | null): boolean => {
    if (!session?.expires_at) return false;
    const expiresAt = session.expires_at * 1000;
    const now = Date.now();
    const fiveMinutes = 5 * 60 * 1000;
    return expiresAt - now < fiveMinutes;
  };

  const dismissPersistenceWarning = useCallback(async () => {
    await clearAuthStorageWriteFailed();
    setPersistenceWarning(false);
  }, []);

  useEffect(() => {
    if (!authState.user) {
      setPersistenceWarning(false);
      return;
    }
    let cancelled = false;
    void getAuthStorageWriteFailed().then((failed) => {
      if (!cancelled && failed) {
        setPersistenceWarning(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [authState.user?.id]);

  useEffect(() => {
    let mounted = true;

    const initializeAuth = async () => {
      const failsafeTimer = setTimeout(() => {
        if (!mounted) return;
        setAuthState((prev) => {
          if (prev.initialized) return prev;
          logger.warn('[Auth] Bootstrap failsafe: forcing initialized after hard timeout (no session)');
          return { user: null, session: null, loading: false, initialized: true };
        });
      }, AUTH_BOOTSTRAP_FAILSAFE_MS);

      try {
        const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
        const isSupabaseConfigured = supabaseUrl && !supabaseUrl.includes('placeholder');

        if (!isSupabaseConfigured) {
          logger.log('[Auth] Supabase not configured, running in offline mode');
          if (mounted) {
            setAuthState({
              user: null,
              session: null,
              loading: false,
              initialized: true,
            });
          }
          return;
        }

        try {
          const sessionPromise = supabase.auth.getSession();

          const raced = await Promise.race([
            sessionPromise.then((r) => ({ kind: 'ok' as const, r })),
            new Promise<{ kind: 'timeout' }>((resolve) =>
              setTimeout(() => resolve({ kind: 'timeout' }), MAIN_SESSION_TIMEOUT_MS),
            ),
          ]);

          let session: Session | null = null;

          if (raced.kind === 'ok') {
            session = raced.r.data?.session ?? null;
            if (raced.r.error) {
              logger.warn('[Auth] getSession returned error:', raced.r.error.message);
            }
          } else {
            logger.log('[Auth] getSession exceeded timeout; draining or re-reading');
            const late = await Promise.race([
              sessionPromise.then((r) => r.data?.session ?? null),
              new Promise<null>((resolve) => setTimeout(() => resolve(null), LATE_SESSION_DRAIN_MS)),
            ]);
            session = late;
            if (!session) {
              const second = await supabase.auth.getSession();
              session = second.data?.session ?? null;
              if (second.error) {
                logger.warn('[Auth] Follow-up getSession error:', second.error.message);
              }
            }
          }

          // Runs before expiry refresh. Listener must not clear this flag on INITIAL_SESSION (see onAuthStateChange).
          if (await getAuthStorageRemoveFailed()) {
            await clearAuthStorageRemoveFailed();
            await supabase.auth.signOut({ scope: 'local' });
            const recovered = await supabase.auth.getSession();
            session = recovered.data?.session ?? null;
            if (recovered.error) {
              logger.warn('[Auth] Recovery getSession error:', recovered.error.message);
            }
          }

          if (session && isSessionExpired(session)) {
            logger.warn('[Auth] Session expired during initialization, attempting refresh');
            try {
              const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
              if (refreshError || !refreshed.session) {
                logger.warn('[Auth] Refresh failed, signing out expired session');
                await AsyncStorage.setItem('session_expired', 'true');
                await supabase.auth.signOut();
                session = null;
              } else {
                session = refreshed.session;
              }
            } catch (refreshError) {
              logger.error('[Auth] Error refreshing expired session:', refreshError);
              await AsyncStorage.setItem('session_expired', 'true');
              await supabase.auth.signOut();
              session = null;
            }
          }

          if (mounted) {
            setAuthState({
              user: session?.user ?? null,
              session,
              loading: false,
              initialized: true,
            });
          }
          return;
        } catch (sessionError: unknown) {
          logger.warn('[Auth] Error initializing auth session:', sessionError);
          try {
            const storedSession = await supabase.auth.getSession();
            let session = storedSession?.data?.session ?? null;
            if (session && isSessionExpired(session)) {
              logger.warn('[Auth] Stored session is expired during fallback, signing out');
              await AsyncStorage.setItem('session_expired', 'true');
              await supabase.auth.signOut();
              session = null;
            }
            if (session && mounted) {
              setAuthState({
                user: session.user ?? null,
                session,
                loading: false,
                initialized: true,
              });
              return;
            }
          } catch (fallbackError) {
            logger.warn('[Auth] Final fallback getSession failed:', fallbackError);
          }
        }

        if (mounted) {
          setAuthState({
            user: null,
            session: null,
            loading: false,
            initialized: true,
          });
        }
      } catch (error: unknown) {
        if (error instanceof Error && error.message !== 'timeout') {
          logger.error('Error initializing auth:', error);
        }
        if (mounted) {
          setAuthState({
            user: null,
            session: null,
            loading: false,
            initialized: true,
          });
        }
      } finally {
        clearTimeout(failsafeTimer);
      }
    };

    void initializeAuth();

    const checkSessionExpiration = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (session && isSessionExpired(session)) {
          logger.warn('[Auth] Session expired, signing out');
          sessionExpiredRef.current = true;
          await supabase.auth.signOut();
          await AsyncStorage.setItem('session_expired', 'true');
        }
      } catch (error) {
        logger.error('[Auth] Error checking session expiration:', error);
      }
    };

    const expirationInterval = setInterval(checkSessionExpiration, 5 * 60 * 1000);

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      logger.log('[Auth] Auth state changed:', event);

      let nextSession: Session | null = session;

      // Only explicit sign-in clears remove-failed; INITIAL_SESSION must not run before bootstrap orphan recovery.
      if (event === 'SIGNED_IN' && session?.user) {
        await clearAuthStorageRemoveFailed();
      }

      if (event === 'SIGNED_OUT') {
        sessionExpiredRef.current = false;
        await AsyncStorage.removeItem('session_expired');
        await clearAllAuthStorageHealthFlags();
        if (mounted) {
          setPersistenceWarning(false);
        }
      } else if (event === 'TOKEN_REFRESHED') {
        logger.log('[Auth] Token refreshed successfully');
        sessionExpiredRef.current = false;
        await AsyncStorage.removeItem('session_expired');
        if (!nextSession?.user) {
          logger.warn('[Auth] TOKEN_REFRESHED but session is null');
          await supabase.auth.signOut();
          nextSession = null;
        }
      } else if (event === 'USER_UPDATED') {
        logger.log('[Auth] User updated');
      }

      if (nextSession && isSessionExpired(nextSession)) {
        logger.warn('[Auth] Session is expired or expiring soon');
        try {
          const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
          if (refreshError) {
            logger.error('[Auth] Failed to refresh expired session:', refreshError.message);
            sessionExpiredRef.current = true;
            await AsyncStorage.setItem('session_expired', 'true');
            await supabase.auth.signOut();
            nextSession = null;
          } else {
            nextSession = refreshData.session;
            logger.log('[Auth] Session refreshed successfully');
          }
        } catch (refreshError) {
          logger.error('[Auth] Error refreshing session:', refreshError);
          sessionExpiredRef.current = true;
          await AsyncStorage.setItem('session_expired', 'true');
          await supabase.auth.signOut();
          nextSession = null;
        }
      }

      if (mounted) {
        setAuthState({
          user: nextSession?.user ?? null,
          session: nextSession,
          loading: false,
          initialized: true,
        });
      }

      if (nextSession?.user) {
        const failed = await getAuthStorageWriteFailed();
        if (failed && mounted) {
          setPersistenceWarning(true);
        }
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
      clearInterval(expirationInterval);
    };
  }, []);

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      logger.warn('[Auth] signOut failed; trying local scope', {
        messageLen: error.message?.length ?? 0,
      });
      const { error: localError } = await supabase.auth.signOut({ scope: 'local' });
      if (localError) {
        logger.error('[Auth] Local signOut failed:', localError.message);
        throw localError;
      }
    }
    try {
      const { disableLivraLocalNotificationsNow } = await import('../services/livraLocalNotificationOwner');
      await disableLivraLocalNotificationsNow();
    } catch {
      /* ignore */
    }
  }, [supabase]);

  return {
    user: authState.user,
    session: authState.session,
    loading: authState.loading,
    initialized: authState.initialized,
    isAuthenticated: !!authState.user,
    signOut,
    persistenceWarning,
    dismissPersistenceWarning,
  };
};
