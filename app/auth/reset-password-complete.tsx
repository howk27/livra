import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import Animated, { FadeIn, SlideInDown } from 'react-native-reanimated';
import { colors } from '../../theme/colors';
import { spacing, borderRadius, fontSize, fontWeight, shadow } from '../../theme/tokens';
import { useEffectiveTheme } from '../../state/uiSlice';
import { getSupabaseClient } from '../../lib/supabase';
import { logger } from '../../lib/utils/logger';

/** `checking` → session probe; `ready` → form; `invalid` → request new email (no defect in naming). */
type RecoveryGate = 'checking' | 'ready' | 'invalid';

export default function ResetPasswordCompleteScreen() {
  const supabase = getSupabaseClient();
  const theme = useEffectiveTheme();
  const themeColors = colors[theme];
  const router = useRouter();
  const params = useLocalSearchParams<{ token?: string; type?: string }>();

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recoveryGate, setRecoveryGate] = useState<RecoveryGate>('checking');

  const validateRecoverySession = useCallback(async (): Promise<boolean> => {
    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) {
        logger.warn('[Password Reset] getSession error on mount:', sessionError.message);
        return false;
      }
      if (!session?.user) {
        return false;
      }
      if (!session.expires_at) {
        return true;
      }
      const expiresAt = session.expires_at * 1000;
      if (Date.now() >= expiresAt) {
        return false;
      }
      return true;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      logger.error('[Password Reset] validateRecoverySession failed:', msg);
      return false;
    }
  }, [supabase]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      let ok = await validateRecoverySession();
      if (cancelled) return;
      if (!ok) {
        // setSession from deep link may complete just after this screen mounts; one bounded retry.
        await new Promise<void>((r) => setTimeout(r, 450));
        if (cancelled) return;
        ok = await validateRecoverySession();
      }
      setRecoveryGate(ok ? 'ready' : 'invalid');
      if (!ok) {
        setError(
          'This reset link is missing, expired, or already used. Request a new password reset email and open the link from your inbox.',
        );
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [params.token, params.type, validateRecoverySession]);

  const recoverySubtitle =
    recoveryGate === 'checking'
      ? 'Verifying your reset link…'
      : recoveryGate === 'invalid'
        ? 'We could not confirm a valid reset session on this device.'
        : 'Choose a new password for your account.';

  const validatePassword = (password: string) => {
    return password.length >= 6;
  };

  const handleResetPassword = async () => {
    setError(null);

    if (recoveryGate !== 'ready') {
      setError('You need a valid reset link. Go back and request a new email.');
      return;
    }

    if (!newPassword.trim()) {
      setError('Please enter a new password');
      return;
    }

    if (!validatePassword(newPassword)) {
      setError('Password must be at least 6 characters');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);

    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError || !session) {
        setRecoveryGate('invalid');
        throw new Error('Your reset session is no longer valid. Please request a new password reset.');
      }

      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateError) {
        if (
          updateError.message.includes('expired') ||
          updateError.message.includes('invalid') ||
          updateError.message.includes('session')
        ) {
          setRecoveryGate('invalid');
          throw new Error('This reset link has expired. Please request a new password reset.');
        }
        throw updateError;
      }

      Alert.alert(
        'Password updated',
        'You can now sign in with your new password.',
        [
          {
            text: 'Sign in',
            onPress: () => {
              router.replace('/auth/signin');
            },
          },
        ],
      );
    } catch (err: unknown) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to reset password. Please try again.';
      logger.error('[Password Reset] Error updating password:', errorMessage);
      setError(errorMessage);

      if (
        errorMessage.includes('expired') ||
        errorMessage.includes('invalid') ||
        errorMessage.includes('no longer valid')
      ) {
        Alert.alert('Reset link invalid', 'Request a new link from the sign-in screen.', [
          {
            text: 'Request new link',
            onPress: () => router.replace('/auth/reset-password'),
          },
          { text: 'Cancel', style: 'cancel' },
        ]);
      }
    } finally {
      setLoading(false);
    }
  };

  const goRequestNew = () => router.replace('/auth/reset-password');

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <View style={styles.content}>
          <Animated.View entering={FadeIn.duration(400)} style={styles.header}>
            <TouchableOpacity
              onPress={() => router.replace('/auth/signin')}
              style={styles.backButton}
            >
              <Text style={[styles.backButtonText, { color: themeColors.textSecondary }]}>←</Text>
            </TouchableOpacity>
            <Text style={[styles.title, { color: themeColors.text }]}>Reset password</Text>
            <Text style={[styles.subtitle, { color: themeColors.textSecondary }]}>{recoverySubtitle}</Text>
          </Animated.View>

          {recoveryGate === 'checking' ? (
            <View style={styles.centerBlock}>
              <ActivityIndicator size="large" color={themeColors.primary} />
              <Text style={[styles.hint, { color: themeColors.textSecondary }]}>
                Checking your reset link…
              </Text>
            </View>
          ) : recoveryGate === 'invalid' ? (
            <Animated.View entering={SlideInDown.duration(400)} style={styles.block}>
              {error ? (
                <Text style={[styles.errorText, { color: themeColors.error }]}>{error}</Text>
              ) : null}
              <TouchableOpacity
                style={[styles.submitButton, { backgroundColor: themeColors.primary }, shadow.md]}
                onPress={goRequestNew}
              >
                <Text style={styles.submitButtonText}>Request a new reset email</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => router.replace('/auth/signin')} style={styles.linkBtn}>
                <Text style={[styles.linkText, { color: themeColors.primary }]}>Back to sign in</Text>
              </TouchableOpacity>
            </Animated.View>
          ) : (
            <Animated.View style={styles.form} entering={SlideInDown.duration(400).delay(100)}>
              <View style={styles.inputContainer}>
                <Text style={[styles.label, { color: themeColors.textSecondary }]}>New password</Text>
                <TextInput
                  style={[
                    styles.input,
                    {
                      backgroundColor: themeColors.surface,
                      color: themeColors.text,
                      borderColor: error ? themeColors.error : themeColors.border,
                    },
                  ]}
                  placeholder="At least 6 characters"
                  placeholderTextColor={themeColors.textTertiary}
                  value={newPassword}
                  onChangeText={(text) => {
                    setNewPassword(text);
                    setError(null);
                  }}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!loading}
                />
              </View>

              <View style={styles.inputContainer}>
                <Text style={[styles.label, { color: themeColors.textSecondary }]}>Confirm password</Text>
                <TextInput
                  style={[
                    styles.input,
                    {
                      backgroundColor: themeColors.surface,
                      color: themeColors.text,
                      borderColor: error ? themeColors.error : themeColors.border,
                    },
                  ]}
                  placeholder="Confirm new password"
                  placeholderTextColor={themeColors.textTertiary}
                  value={confirmPassword}
                  onChangeText={(text) => {
                    setConfirmPassword(text);
                    setError(null);
                  }}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!loading}
                />
              </View>

              {error ? (
                <Animated.View entering={FadeIn.duration(200)} style={styles.errorContainer}>
                  <Text style={[styles.errorText, { color: themeColors.error }]}>{error}</Text>
                </Animated.View>
              ) : null}

              <TouchableOpacity
                style={[
                  styles.submitButton,
                  { backgroundColor: themeColors.primary },
                  loading && styles.submitButtonDisabled,
                  shadow.md,
                ]}
                onPress={handleResetPassword}
                disabled={loading}
                activeOpacity={0.8}
              >
                {loading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.submitButtonText}>Update password</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => router.replace('/auth/signin')}
                disabled={loading}
                style={styles.backToSignInButton}
              >
                <Text style={[styles.backToSignInText, { color: themeColors.primary }]}>
                  ← Back to sign in
                </Text>
              </TouchableOpacity>
            </Animated.View>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
  },
  header: {
    marginBottom: spacing.xl,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  backButtonText: {
    fontSize: fontSize['2xl'],
  },
  title: {
    fontSize: fontSize['3xl'],
    fontWeight: fontWeight.bold,
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontSize: fontSize.base,
    lineHeight: 22,
  },
  form: {
    flex: 1,
  },
  block: {
    gap: spacing.lg,
  },
  centerBlock: {
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.xl,
  },
  hint: {
    fontSize: fontSize.sm,
    textAlign: 'center',
  },
  inputContainer: {
    marginBottom: spacing.md,
  },
  label: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    marginBottom: spacing.xs,
  },
  input: {
    height: 52,
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    fontSize: fontSize.base,
  },
  errorContainer: {
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  errorText: {
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
  submitButton: {
    height: 52,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.md,
    marginBottom: spacing.lg,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  backToSignInButton: {
    alignSelf: 'center',
    paddingVertical: spacing.md,
  },
  backToSignInText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  linkBtn: {
    alignSelf: 'center',
    paddingVertical: spacing.sm,
  },
  linkText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
});
