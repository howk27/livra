import React, { useEffect } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { colors } from '../../theme/colors';
import { spacing, fontSize, fontWeight } from '../../theme/tokens';
import { useEffectiveTheme } from '../../state/uiSlice';
import { AppText } from '../../components/Typography';
import { GradientBackground } from '../../components/GradientBackground';
import { useAuth } from '../../hooks/useAuth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '../../lib/utils/logger';

export default function SigningOutScreen() {
  const theme = useEffectiveTheme();
  const themeColors = colors[theme];
  const router = useRouter();
  const { signOut } = useAuth();

  useEffect(() => {
    const performSignOut = async () => {
      try {
        // Small delay to show the loading screen
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Perform sign out
        await signOut();
        
        // Wait a bit more to ensure sign out completes
        await new Promise(resolve => setTimeout(resolve, 300));
        
        // Redirect to sign in screen
        router.replace('/auth/signin');
      } catch (error) {
        logger.error('Error during sign out:', error);
        // Even if there's an error, try to redirect
        router.replace('/auth/signin');
      }
    };

    performSignOut();
  }, [router, signOut]);

  return (
    <GradientBackground>
      <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
        <View style={styles.content}>
          <ActivityIndicator size="large" color={themeColors.primary} />
          <AppText variant="headline" style={[styles.title, { color: themeColors.text }]}>
            Signing out...
          </AppText>
          <AppText variant="body" style={[styles.subtitle, { color: themeColors.textSecondary }]}>
            Please wait while we sign you out
          </AppText>
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
});

