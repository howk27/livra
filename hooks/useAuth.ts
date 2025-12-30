import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { Session, User } from '@supabase/supabase-js';
import { logger } from '../lib/utils/logger';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
  initialized: boolean;
}

export const useAuth = () => {
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    session: null,
    loading: true,
    initialized: false,
  });
  const sessionExpiredRef = useRef(false);

  // Check if session is expired (buffered) using expires_at
  const isSessionExpired = (session: Session | null): boolean => {
    if (!session?.expires_at) return false;
    const expiresAt = session.expires_at * 1000; // ms
    const now = Date.now();
    const fiveMinutes = 5 * 60 * 1000;
    return expiresAt - now < fiveMinutes;
  };

  // Initialize auth state and set up listener
  useEffect(() => {
    let mounted = true;

    // Get initial session with timeout to prevent hanging
    const initializeAuth = async () => {
      try {
        // Check if Supabase is configured (not using placeholder)
        const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
        const isSupabaseConfigured = supabaseUrl && !supabaseUrl.includes('placeholder');
        
        if (!isSupabaseConfigured) {
          // Skip Supabase if not configured - work in offline mode
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
        
        // Add timeout to prevent hanging if Supabase is unavailable
        // Use a more robust timeout pattern that gracefully falls back to stored session
        try {
          const sessionPromise = supabase.auth.getSession();
          
          // Create a timeout wrapper that resolves with null instead of rejecting
          const timeoutPromise = new Promise<null>((resolve) => 
            setTimeout(() => resolve(null), 5000) // 5 seconds for slower networks
          );
          
          // Race the session check against timeout
          let result: { data: { session: Session | null }; error: any } | null = null;
          
          try {
            result = await Promise.race([
              sessionPromise
                .then((result) => ({ data: result.data, error: result.error }))
                .catch((error: any) => ({ data: { session: null }, error })),
              timeoutPromise.then(() => ({ data: { session: null }, error: { message: 'timeout' } })),
            ]) as { data: { session: Session | null }; error: any };
          } catch (raceError) {
            // If Promise.race itself fails, continue with fallback
            logger.warn('[Auth] Session check race failed:', raceError);
          }
          
          let session: Session | null = null;
          
          if (result?.error?.message === 'timeout') {
            // Network timeout occurred - try to read session from storage as fallback
            // This allows us to use the cached session even if network is slow/unavailable
            logger.log('[Auth] Session check timeout, attempting to use cached session from storage');
            
            try {
              // Call getSession() again with a very short timeout - this should return cached session quickly
              const cachedSessionPromise = supabase.auth.getSession();
              const quickTimeout = new Promise<{ data: { session: Session | null }; error: any }>((resolve) =>
                setTimeout(() => resolve({ data: { session: null }, error: { message: 'timeout' } }), 500)
              );
              
              const cachedResult = await Promise.race([cachedSessionPromise, quickTimeout]) as any;
              
              if (cachedResult?.data?.session) {
                session = cachedResult.data.session;
                logger.log('[Auth] Using cached session from storage (network validation timed out)');
              } else {
                logger.log('[Auth] No cached session found in storage');
              }
            } catch (fallbackError) {
              // If fallback also fails, proceed with no session
              logger.warn('[Auth] Could not read cached session:', fallbackError);
            }
          } else {
            // No timeout - use session from result
            session = result?.data?.session ?? null;
          }
          
          if (result?.error && result.error.message !== 'timeout') {
            // Only log non-timeout errors
            logger.warn('[Auth] Error getting session:', result.error);
          }

          // If we got a session, ensure it isn't expired; otherwise refresh/sign out
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
          
          // Set auth state with session (even if null)
          if (mounted) {
            setAuthState({
              user: session?.user ?? null,
              session: session,
              loading: false,
              initialized: true,
            });
          }
          return; // Exit early if we got a result (success, timeout with cache, or no session)
        } catch (sessionError: any) {
          // Handle unexpected errors
          logger.warn('[Auth] Error initializing auth session:', sessionError);
          // Fall through to try getting session directly from storage one more time
          try {
            const storedSession = await supabase.auth.getSession();
            let session = storedSession?.data?.session ?? null;
            // If stored session is expired, clear it
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
            // Final fallback - proceed with no user
            logger.warn('[Auth] Final fallback to get session also failed:', fallbackError);
          }
        }

        // If we reach here, something went wrong - proceed in offline mode
        if (mounted) {
          setAuthState({
            user: null,
            session: null,
            loading: false,
            initialized: true,
          });
        }
      } catch (error: any) {
        // Only log as error if it's not a timeout (timeout is expected behavior)
        if (error?.message !== 'Auth initialization timeout' && error?.message !== 'timeout') {
          logger.error('Error initializing auth:', error);
        }
        // Proceed with no user if auth fails (offline mode)
        if (mounted) {
          setAuthState({
            user: null,
            session: null,
            loading: false,
            initialized: true,
          });
        }
      }
    };

    initializeAuth();

    // Check session expiration periodically
    const checkSessionExpiration = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session && isSessionExpired(session)) {
          logger.warn('[Auth] Session expired, signing out');
          sessionExpiredRef.current = true;
          // Sign out the user
          await supabase.auth.signOut();
          // Store expired session flag for UI messaging
          await AsyncStorage.setItem('session_expired', 'true');
        }
      } catch (error) {
        logger.error('[Auth] Error checking session expiration:', error);
      }
    };

    // Set up periodic expiration check (every 5 minutes)
    const expirationInterval = setInterval(checkSessionExpiration, 5 * 60 * 1000);

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      logger.log('Auth state changed:', event, session?.user?.email);
      
      // Handle specific events
      if (event === 'SIGNED_OUT') {
        sessionExpiredRef.current = false;
        await AsyncStorage.removeItem('session_expired');
      } else if (event === 'TOKEN_REFRESHED') {
        logger.log('[Auth] Token refreshed successfully');
        sessionExpiredRef.current = false;
        await AsyncStorage.removeItem('session_expired');
        
        // CRITICAL: Explicitly handle token refresh success
        // Update auth state with refreshed session
        if (session && session.user) {
          if (mounted) {
            setAuthState({
              user: session.user,
              session: session,
              loading: false,
              initialized: true,
            });
          }
        } else {
          logger.warn('[Auth] TOKEN_REFRESHED event received but session is null');
          // If token refresh resulted in no session, sign out
          await supabase.auth.signOut();
        }
      } else if (event === 'USER_UPDATED') {
        logger.log('[Auth] User updated');
      }

      // Check if session is expired when we get a new session
      if (session && isSessionExpired(session)) {
        logger.warn('[Auth] Session is expired or expiring soon');
        // Attempt to refresh the token
        try {
          const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
          if (refreshError) {
            logger.error('[Auth] Failed to refresh expired session:', refreshError);
            sessionExpiredRef.current = true;
            await AsyncStorage.setItem('session_expired', 'true');
            // Sign out if refresh fails
            await supabase.auth.signOut();
            session = null;
          } else {
            session = refreshData.session;
            logger.log('[Auth] Session refreshed successfully');
          }
        } catch (refreshError) {
          logger.error('[Auth] Error refreshing session:', refreshError);
          sessionExpiredRef.current = true;
          await AsyncStorage.setItem('session_expired', 'true');
          await supabase.auth.signOut();
          session = null;
        }
      }
      
      if (mounted) {
        setAuthState({
          user: session?.user ?? null,
          session: session,
          loading: false,
          initialized: true,
        });
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
      logger.error('Error signing out:', error);
      throw error;
    }
    // State will be updated via the auth state change listener
  }, []);

  return {
    user: authState.user,
    session: authState.session,
    loading: authState.loading,
    initialized: authState.initialized,
    isAuthenticated: !!authState.user,
    signOut,
  };
};
