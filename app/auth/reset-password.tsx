import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, { FadeIn, SlideInDown } from 'react-native-reanimated';
import {
  themedColors,
  spacing,
  borderRadius,
  fontSize,
  fontWeight,
  shadow,
  headerControl,
} from '../../theme/tokens';
import { useEffectiveTheme } from '../../state/uiSlice';
import { getSupabaseClient } from '../../lib/supabase';
import { useNotification } from '../../contexts/NotificationContext';

export default function ResetPasswordScreen() {
  const supabase = getSupabaseClient();
  const theme = useEffectiveTheme();
  const c = themedColors(theme);
  const router = useRouter();
  const { showSuccess } = useNotification();

  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const validateEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const handleResetPassword = async () => {
    setError(null);

    if (!email.trim()) {
      setError('Please enter your email');
      return;
    }

    if (!validateEmail(email)) {
      setError('Please enter a valid email address');
      return;
    }

    setLoading(true);

    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: 'livra://auth/reset-password',
      });

      if (resetError) {
        setError(resetError.message);
      } else {
        setSuccess(true);
        showSuccess('Password reset email sent. Check your inbox for instructions.');
        router.back();
      }
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: c.linen }]}>
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
              onPress={() => router.back()}
              style={styles.backButton}
            >
              <Text style={[styles.backButtonText, { color: c.inkMuted }]}>←</Text>
            </TouchableOpacity>
            <Text style={[styles.title, { color: c.inkDark }]}>Reset Password</Text>
            <Text style={[styles.subtitle, { color: c.inkMuted }]}>
              Enter your email address and we'll send you instructions to reset your password.
            </Text>
          </Animated.View>

          {/* Form */}
          <Animated.View
            style={styles.form}
            entering={SlideInDown.duration(400).delay(100)}
          >
            {/* Email Input */}
            <View style={styles.inputContainer}>
              <Text style={[styles.label, { color: c.inkMuted }]}>Email</Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: c.surface,
                    color: c.inkDark,
                    borderColor: error ? c.danger : c.borderLight,
                  },
                ]}
                placeholder="Enter your email"
                placeholderTextColor={c.inkMuted}
                value={email}
                onChangeText={(text) => {
                  setEmail(text);
                  setError(null);
                  setSuccess(false);
                }}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                editable={!loading && !success}
              />
            </View>

            {/* Error Message */}
            {error && (
              <Animated.View
                entering={FadeIn.duration(200)}
                style={styles.errorContainer}
              >
                <Text style={[styles.errorText, { color: c.danger }]}>{error}</Text>
              </Animated.View>
            )}

            {/* Success Message */}
            {success && (
              <Animated.View
                entering={FadeIn.duration(200)}
                style={styles.successContainer}
              >
                <Text style={[styles.successText, { color: c.success }]}>
                  ✓ Password reset email sent successfully!
                </Text>
              </Animated.View>
            )}

            {/* Submit Button */}
            <TouchableOpacity
              style={[
                styles.submitButton,
                { backgroundColor: c.forest },
                (loading || success) && styles.submitButtonDisabled,
                shadow.md,
              ]}
              onPress={handleResetPassword}
              disabled={loading || success}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.submitButtonText}>
                  {success ? 'Email Sent' : 'Send Reset Link'}
                </Text>
              )}
            </TouchableOpacity>

            {/* Back to Sign In */}
            <TouchableOpacity
              onPress={() => router.back()}
              disabled={loading}
              style={styles.backToSignInButton}
            >
              <Text style={[styles.backToSignInText, { color: c.accent }]}>
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
    // QC4-K: converge the back control's distance below the safe-area inset onto
    // the shared headerControl.topGap (was spacing.xl, 32).
    paddingTop: headerControl.topGap,
  },
  header: {
    marginBottom: spacing.xl,
  },
  // QC4-K: 40x40 was under the 44pt iOS HIG minimum.
  backButton: {
    width: headerControl.minTarget,
    height: headerControl.minTarget,
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
  successContainer: {
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  successText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
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
