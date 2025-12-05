import React, { useState, useEffect } from 'react';
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
import { supabase } from '../../lib/supabase';
import { logger } from '../../lib/utils/logger';

export default function ResetPasswordCompleteScreen() {
  const theme = useEffectiveTheme();
  const themeColors = colors[theme];
  const router = useRouter();
  const params = useLocalSearchParams<{ token?: string; type?: string }>();

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Extract token from URL params or hash
  useEffect(() => {
    // Check if we have token in params (from deep link)
    if (params.token && params.type === 'recovery') {
      logger.log('[Password Reset] Token received from deep link');
      // Token is already in params, ready to use
    } else {
      // Try to get from URL hash (Supabase sends it this way)
      // This will be handled by Supabase auth state change
      logger.log('[Password Reset] No token in params, checking session');
      checkSessionForRecovery();
    }
  }, [params.token, params.type]);

  const checkSessionForRecovery = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        // User is already authenticated, might be from recovery link
        // Check if this is a password recovery session
        logger.log('[Password Reset] Session found, user can update password');
      }
    } catch (err) {
      logger.error('[Password Reset] Error checking session:', err);
    }
  };

  const validatePassword = (password: string) => {
    return password.length >= 6;
  };

  const handleResetPassword = async () => {
    setError(null);

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
      // Check if we have a valid session (Supabase sets this when user clicks email link)
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError || !session) {
        throw new Error('Invalid or expired reset link. Please request a new password reset.');
      }

      // Update password using the recovery session
      // Supabase automatically provides a session when user clicks the recovery link
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateError) {
        // Check if it's an expired/invalid session error
        if (updateError.message.includes('expired') || 
            updateError.message.includes('invalid') ||
            updateError.message.includes('session')) {
          throw new Error('Invalid or expired reset link. Please request a new password reset.');
        }
        throw updateError;
      }

      // Success
      Alert.alert(
        'Password Reset Successful',
        'Your password has been updated successfully. You can now sign in with your new password.',
        [
          {
            text: 'Sign In',
            onPress: () => {
              router.replace('/auth/signin');
            },
          },
        ]
      );
    } catch (err: any) {
      logger.error('[Password Reset] Error updating password:', err);
      const errorMessage = err.message || 'Failed to reset password. The link may have expired.';
      setError(errorMessage);
      
      if (errorMessage.includes('expired') || errorMessage.includes('invalid')) {
        Alert.alert(
          'Link Expired',
          'This password reset link has expired. Please request a new one.',
          [
            {
              text: 'Request New Link',
              onPress: () => router.replace('/auth/reset-password'),
            },
            {
              text: 'Cancel',
              style: 'cancel',
            },
          ]
        );
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <View style={styles.content}>
          {/* Header */}
          <Animated.View
            entering={FadeIn.duration(400)}
            style={styles.header}
          >
            <TouchableOpacity
              onPress={() => router.replace('/auth/signin')}
              style={styles.backButton}
            >
              <Text style={[styles.backButtonText, { color: themeColors.textSecondary }]}>←</Text>
            </TouchableOpacity>
            <Text style={[styles.title, { color: themeColors.text }]}>Reset Password</Text>
            <Text style={[styles.subtitle, { color: themeColors.textSecondary }]}>
              Enter your new password below.
            </Text>
          </Animated.View>

          {/* Form */}
          <Animated.View
            style={styles.form}
            entering={SlideInDown.duration(400).delay(100)}
          >
            {/* New Password Input */}
            <View style={styles.inputContainer}>
              <Text style={[styles.label, { color: themeColors.textSecondary }]}>New Password</Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: themeColors.surface,
                    color: themeColors.text,
                    borderColor: error ? themeColors.error : themeColors.border,
                  },
                ]}
                placeholder="Enter new password (min 6 characters)"
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

            {/* Confirm Password Input */}
            <View style={styles.inputContainer}>
              <Text style={[styles.label, { color: themeColors.textSecondary }]}>Confirm Password</Text>
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

            {/* Error Message */}
            {error && (
              <Animated.View
                entering={FadeIn.duration(200)}
                style={styles.errorContainer}
              >
                <Text style={[styles.errorText, { color: themeColors.error }]}>{error}</Text>
              </Animated.View>
            )}

            {/* Submit Button */}
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
                <Text style={styles.submitButtonText}>Reset Password</Text>
              )}
            </TouchableOpacity>

            {/* Back to Sign In */}
            <TouchableOpacity
              onPress={() => router.replace('/auth/signin')}
              disabled={loading}
              style={styles.backToSignInButton}
            >
              <Text style={[styles.backToSignInText, { color: themeColors.primary }]}>
                ← Back to Sign In
              </Text>
            </TouchableOpacity>
          </Animated.View>
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
});

