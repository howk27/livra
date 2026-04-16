import React, { useEffect, useState, useRef } from 'react';
import { View, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { colors } from '../../theme/colors';
import { spacing, fontSize, fontWeight } from '../../theme/tokens';
import { useEffectiveTheme } from '../../state/uiSlice';
import { AppText } from '../../components/Typography';
import { GradientBackground } from '../../components/GradientBackground';
import { useAuth } from '../../hooks/useAuth';
import { logger } from '../../lib/utils/logger';

export default function SigningOutScreen() {
  const theme = useEffectiveTheme();
  const themeColors = colors[theme];
  const router = useRouter();
  const { signOut, user, initialized, loading } = useAuth();
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const attemptedRef = useRef(false);

  // If already signed out, leave immediately (no fake delays).
  useEffect(() => {
    if (!initialized || loading) return;
    if (!user) {
      router.replace('/auth/signin');
    }
  }, [initialized, loading, user, router]);

  // Single sign-out attempt tied to real auth API; navigation is driven by `user` becoming null.
  useEffect(() => {
    if (!initialized || loading || !user || attemptedRef.current) {
      return;
    }
    attemptedRef.current = true;
    setSignOutError(null);
    void signOut().catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Could not sign out';
      logger.error('[SigningOut] signOut failed:', msg);
      setSignOutError(
        'We could not reach the server to sign out. Check your connection, or try again to clear this device.',
      );
      attemptedRef.current = false;
    });
  }, [initialized, loading, user, signOut]);

  const handleRetry = () => {
    if (!user) {
      router.replace('/auth/signin');
      return;
    }
    setSignOutError(null);
    void signOut().catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Could not sign out';
      logger.error('[SigningOut] Retry signOut failed:', msg);
      setSignOutError(
        'We could not reach the server to sign out. Check your connection, or try again to clear this device.',
      );
    });
  };

  return (
    <GradientBackground>
      <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
        <View style={styles.content}>
          <ActivityIndicator size="large" color={themeColors.primary} />
          <AppText variant="headline" style={[styles.title, { color: themeColors.text }]}>
            {signOutError ? 'Sign-out pending' : 'Signing out…'}
          </AppText>
          <AppText variant="body" style={[styles.subtitle, { color: themeColors.textSecondary }]}>
            {signOutError ??
              'Finishing on this device. If you stay here, your session is being cleared.'}
          </AppText>
          {signOutError ? (
            <TouchableOpacity
              style={[styles.retry, { backgroundColor: themeColors.primary }]}
              onPress={handleRetry}
              activeOpacity={0.85}
            >
              <AppText variant="button" style={{ color: themeColors.text }}>
                Try again
              </AppText>
            </TouchableOpacity>
          ) : null}
        </View>
      </SafeAreaView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.lg,
    paddingHorizontal: spacing.xl,
  },
  title: {
    fontSize: fontSize['2xl'],
    fontWeight: fontWeight.bold,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: fontSize.base,
    textAlign: 'center',
  },
  retry: {
    marginTop: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: 12,
  },
});
