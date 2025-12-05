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
import { useRouter } from 'expo-router';
import Animated, {
  FadeIn,
  FadeOut,
  SlideInDown,
  SlideOutDown,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as AppleAuthentication from 'expo-apple-authentication';
import { colors } from '../../theme/colors';
import { spacing, borderRadius, fontSize, fontWeight, shadow } from '../../theme/tokens';
import { useEffectiveTheme } from '../../state/uiSlice';
import { supabase } from '../../lib/supabase';
import { useSync } from '../../hooks/useSync';
import { logger } from '../../lib/utils/logger';

type AuthMode = 'login' | 'signup';

export default function SignInScreen() {
  const theme = useEffectiveTheme();
  const themeColors = colors[theme];
  const router = useRouter();
  const { sync } = useSync();

  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionExpiredMessage, setSessionExpiredMessage] = useState<string | null>(null);
  const [isAppleAvailable, setIsAppleAvailable] = useState(false);
  const [isAppleLoading, setIsAppleLoading] = useState(false);

  const slideOffset = useSharedValue(0);

  useEffect(() => {
    slideOffset.value = mode === 'signup' ? 1 : 0;
  }, [mode]);

  // Check if user was redirected due to expired session
  useEffect(() => {
    const checkExpiredSession = async () => {
      const expired = await AsyncStorage.getItem('session_expired');
      if (expired === 'true') {
        setSessionExpiredMessage('Your session has expired. Please sign in again.');
        // Clear the flag
        await AsyncStorage.removeItem('session_expired');
      }
    };
    checkExpiredSession();
  }, []);

  // Check if Apple Authentication is available
  useEffect(() => {
    const checkAppleAuth = async () => {
      try {
        const available = await AppleAuthentication.isAvailableAsync();
        setIsAppleAvailable(available);
      } catch (error) {
        logger.error('Error checking Apple Authentication availability:', error);
        setIsAppleAvailable(false);
      }
    };
    checkAppleAuth();
  }, []);

  const animatedContainerStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateY: withSpring(slideOffset.value * -20, { damping: 15 }) }],
      opacity: withSpring(mode === 'signup' ? 1 : 1, { damping: 15 }),
    };
  });

  const validateEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const validatePassword = (password: string) => {
    return password.length >= 8;
  };

  const handleSubmit = async () => {
    setError(null);

    // Validation
    if (!email.trim()) {
      setError('Please enter your email');
      return;
    }

    if (!validateEmail(email)) {
      setError('Please enter a valid email address');
      return;
    }

    if (!password.trim()) {
      setError('Please enter your password');
      return;
    }

    if (mode === 'signup') {
      if (!fullName.trim()) {
        setError('Please enter your full name');
        return;
      }

      if (!validatePassword(password)) {
        setError('Password must be at least 8 characters');
        return;
      }

      if (password !== confirmPassword) {
        setError('Passwords do not match');
        return;
      }
    }

    setLoading(true);

    try {
      // Check if Supabase is configured
      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
      if (!supabaseUrl || supabaseUrl.includes('placeholder')) {
        setError('Authentication is not configured. Please contact support.');
        setLoading(false);
        return;
      }

      if (mode === 'login') {
        const { data, error: signInError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password: password,
        });

        if (signInError) {
          // Check if user not found
          if (signInError.message.includes('Invalid login credentials') || 
              signInError.message.includes('Email not confirmed') ||
              signInError.message.includes('User not found')) {
            Alert.alert(
              'Account Not Found',
              'No account found with this email. Would you like to create one?',
              [
                {
                  text: 'Cancel',
                  style: 'cancel',
                },
                {
                  text: 'Create Account',
                  onPress: () => {
                    setMode('signup');
                    setError(null);
                  },
                },
              ]
            );
          } else {
            setError(signInError.message);
          }
        } else if (data?.user) {
          // Check if email is confirmed (required for production)
          if (!data.user.email_confirmed_at) {
            Alert.alert(
              'Email Not Verified',
              'Please check your email and verify your account before signing in. If you didn\'t receive the email, you can request a new one.',
              [
                {
                  text: 'Cancel',
                  style: 'cancel',
                },
                {
                  text: 'Resend Verification Email',
                  style: 'default',
                  onPress: async () => {
                    try {
                      setLoading(true);
                      const { error: resendError } = await supabase.auth.resend({
                        type: 'signup',
                        email: email.trim(),
                      });
                      
                      if (resendError) {
                        Alert.alert(
                          'Error',
                          resendError.message || 'Failed to send verification email. Please try again.'
                        );
                      } else {
                        Alert.alert(
                          'Email Sent',
                          'A new verification email has been sent. Please check your inbox and spam folder.'
                        );
                      }
                    } catch (error: any) {
                      logger.error('Error resending verification email:', error);
                      Alert.alert(
                        'Error',
                        'Failed to send verification email. Please try again.'
                      );
                    } finally {
                      setLoading(false);
                    }
                  },
                },
              ]
            );
            setLoading(false);
            return;
          }
          
          // Successfully signed in - redirect to index which will handle onboarding check
          // Index will check if user is onboarded and redirect accordingly
          router.replace('/');
        }
      } else {
        // Sign up
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password: password,
          options: {
            data: {
              full_name: fullName.trim(),
            },
          },
        });

        if (signUpError) {
          // Handle specific signup errors
          if (signUpError.message.includes('already registered')) {
            setError('An account with this email already exists. Please sign in instead.');
            setTimeout(() => {
              setMode('login');
            }, 2000);
          } else {
            setError(signUpError.message);
          }
        } else if (data?.user) {
          // Account created successfully
          Alert.alert(
            'Account Created Successfully',
            'We\'ve sent a verification email to your inbox. Please check your email and click the verification link before signing in.',
            [
              {
                text: 'OK',
                onPress: () => {
                  setMode('login');
                  setPassword('');
                  setConfirmPassword('');
                  setFullName('');
                  setEmail(''); // Clear email so user can enter it again for login
                },
              },
            ]
          );
        }
      }
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = () => {
    router.push('/auth/reset-password');
  };

  const toggleMode = () => {
    setMode(mode === 'login' ? 'signup' : 'login');
    setError(null);
    setPassword('');
    setConfirmPassword('');
    setFullName('');
  };

  const handleAppleSignIn = async () => {
    setIsAppleLoading(true);
    setError(null);

    try {
      // Check if Supabase is configured
      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
      if (!supabaseUrl || supabaseUrl.includes('placeholder')) {
        setError('Authentication is not configured. Please contact support.');
        setIsAppleLoading(false);
        return;
      }

      // Request Apple authentication credential
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });

      if (!credential.identityToken) {
        throw new Error('No identity token received from Apple');
      }

      // Sign in with Supabase using the Apple identity token
      // Note: Make sure Apple provider is enabled in Supabase Dashboard
      // and the redirect URL is configured: {your-app-scheme}://
      const { data, error: signInError } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: credential.identityToken,
      });

      if (signInError) {
        logger.error('Error signing in with Apple:', signInError);
        
        // Provide more helpful error messages
        if (signInError.message?.includes('provider') || signInError.message?.includes('not enabled')) {
          setError('Apple Sign-In is not configured. Please contact support.');
        } else {
          setError(signInError.message || 'Failed to sign in with Apple. Please try again.');
        }
        setIsAppleLoading(false);
        return;
      }

      if (data?.user) {
        // Successfully signed in - redirect to index which will handle onboarding check
        logger.log('Successfully signed in with Apple:', data.user.email || data.user.id);
        
        // Sync data after successful sign-in
        try {
          await sync();
        } catch (syncError) {
          logger.warn('Error syncing after Apple sign-in:', syncError);
          // Don't block the user if sync fails
        }
        
        router.replace('/');
      }
    } catch (error: any) {
      logger.error('Error during Apple Sign-In:', error);
      
      // Handle user cancellation
      if (error.code === 'ERR_REQUEST_CANCELED' || error.code === 'ERR_CANCELED') {
        // User canceled, don't show error
        setIsAppleLoading(false);
        return;
      }

      setError(error.message || 'Failed to sign in with Apple. Please try again.');
      setIsAppleLoading(false);
    } finally {
      setIsAppleLoading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        {loading && (
          <View style={[styles.loadingOverlay, { backgroundColor: themeColors.background + 'E6' }]}>
            <ActivityIndicator size="large" color={themeColors.primary} />
            <Text style={[styles.loadingText, { color: themeColors.text }]}>
              {mode === 'login' ? 'Signing in...' : 'Creating account...'}
            </Text>
          </View>
        )}
        <View style={styles.content}>
          {/* Header */}
          <Animated.View
            entering={FadeIn.duration(400)}
            style={styles.header}
          >
            <Text style={[styles.title, { color: themeColors.text }]}>
              {mode === 'login' ? 'Welcome Back' : 'Create Account'}
            </Text>
            <Text style={[styles.subtitle, { color: themeColors.textSecondary }]}>
              {mode === 'login'
                ? 'Sign in to sync your data across devices'
                : 'Start tracking your progress'}
            </Text>
          </Animated.View>

          {/* Form */}
          <Animated.View
            style={[styles.form, animatedContainerStyle]}
            entering={SlideInDown.duration(400).delay(100)}
          >
            {/* Full Name Input (Signup only) */}
            {mode === 'signup' && (
              <Animated.View
                entering={FadeIn.duration(300)}
                exiting={FadeOut.duration(200)}
                style={styles.inputContainer}
              >
                <Text style={[styles.label, { color: themeColors.textSecondary }]}>Full Name</Text>
                <TextInput
                  style={[
                    styles.input,
                    {
                      backgroundColor: themeColors.surface,
                      color: themeColors.text,
                      borderColor: error ? themeColors.error : themeColors.border,
                    },
                  ]}
                  placeholder="Enter your full name"
                  placeholderTextColor={themeColors.textTertiary}
                  value={fullName}
                  onChangeText={(text) => {
                    setFullName(text);
                    setError(null);
                  }}
                  autoCapitalize="words"
                  autoCorrect={false}
                  editable={!loading}
                />
              </Animated.View>
            )}

            {/* Email Input */}
            <View style={styles.inputContainer}>
              <Text style={[styles.label, { color: themeColors.textSecondary }]}>Email</Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: themeColors.surface,
                    color: themeColors.text,
                    borderColor: error ? themeColors.error : themeColors.border,
                  },
                ]}
                placeholder="Enter your email"
                placeholderTextColor={themeColors.textTertiary}
                value={email}
                onChangeText={(text) => {
                  setEmail(text);
                  setError(null);
                }}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                editable={!loading}
              />
            </View>

            {/* Password Input */}
            <View style={styles.inputContainer}>
              <Text style={[styles.label, { color: themeColors.textSecondary }]}>Password</Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: themeColors.surface,
                    color: themeColors.text,
                    borderColor: error ? themeColors.error : themeColors.border,
                  },
                ]}
                placeholder="Enter new password(min. 8 characters)"
                placeholderTextColor={themeColors.textTertiary}
                value={password}
                onChangeText={(text) => {
                  setPassword(text);
                  setError(null);
                }}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                editable={!loading}
              />
            </View>

            {/* Confirm Password Input (Signup only) */}
            {mode === 'signup' && (
              <Animated.View
                entering={FadeIn.duration(300)}
                exiting={FadeOut.duration(200)}
                style={styles.inputContainer}
              >
                <Text style={[styles.label, { color: themeColors.textSecondary }]}>
                  Confirm Password
                </Text>
                <TextInput
                  style={[
                    styles.input,
                    {
                      backgroundColor: themeColors.surface,
                      color: themeColors.text,
                      borderColor: error ? themeColors.error : themeColors.border,
                    },
                  ]}
                  placeholder="Enter new password(min. 8 characters)"
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
              </Animated.View>
            )}

            {/* Session Expired Message */}
            {sessionExpiredMessage && (
              <Animated.View
                entering={FadeIn.duration(200)}
                style={[styles.messageContainer, { backgroundColor: themeColors.error + '20' }]}
              >
                <Text style={[styles.messageText, { color: themeColors.error }]}>
                  {sessionExpiredMessage}
                </Text>
              </Animated.View>
            )}

            {/* Error Message */}
            {error && (
              <Animated.View
                entering={FadeIn.duration(200)}
                exiting={FadeOut.duration(200)}
                style={styles.errorContainer}
              >
                <Text style={[styles.errorText, { color: themeColors.error }]}>{error}</Text>
              </Animated.View>
            )}

            {/* Forgot Password (Login only) */}
            {mode === 'login' && (
              <TouchableOpacity
                onPress={handleForgotPassword}
                disabled={loading}
                style={styles.forgotPasswordButton}
              >
                <Text style={[styles.forgotPasswordText, { color: themeColors.primary }]}>
                  Forgot Password?
                </Text>
              </TouchableOpacity>
            )}

            {/* Submit Button */}
            <TouchableOpacity
              style={[
                styles.submitButton,
                { backgroundColor: themeColors.primary },
                loading && styles.submitButtonDisabled,
                shadow.md,
              ]}
              onPress={handleSubmit}
              disabled={loading || isAppleLoading}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.submitButtonText}>
                  {mode === 'login' ? 'Sign In' : 'Create Account'}
                </Text>
              )}
            </TouchableOpacity>

            {/* Divider */}
            {isAppleAvailable && (
              <View style={styles.dividerContainer}>
                <View style={[styles.dividerLine, { backgroundColor: themeColors.border }]} />
                <Text style={[styles.dividerText, { color: themeColors.textSecondary }]}>or</Text>
                <View style={[styles.dividerLine, { backgroundColor: themeColors.border }]} />
              </View>
            )}

            {/* Apple Sign-In Button */}
            {isAppleAvailable && !loading && !isAppleLoading && (
              <AppleAuthentication.AppleAuthenticationButton
                buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
                buttonStyle={
                  theme === 'dark'
                    ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                    : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
                }
                cornerRadius={borderRadius.lg}
                style={styles.appleButton}
                onPress={handleAppleSignIn}
              />
            )}

            {/* Toggle Mode */}
            <View style={styles.toggleContainer}>
              <Text style={[styles.toggleText, { color: themeColors.textSecondary }]}>
                {mode === 'login'
                  ? "Don't have an account? "
                  : 'Already have an account? '}
              </Text>
              <TouchableOpacity onPress={toggleMode} disabled={loading}>
                <Text style={[styles.toggleLink, { color: themeColors.primary }]}>
                  {mode === 'login' ? 'Sign Up' : 'Sign In'}
                </Text>
              </TouchableOpacity>
            </View>

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
    marginBottom: spacing['4xl'],
  },
  title: {
    fontSize: fontSize['3xl'],
    fontWeight: fontWeight.bold,
    marginBottom: spacing.md,
  },
  subtitle: {
    fontSize: fontSize.base,
    lineHeight: 22,
    marginBottom: spacing.xl,
  },
  form: {
    flex: 1,
  },
  inputContainer: {
    marginBottom: spacing.xl,
  },
  label: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    marginBottom: spacing.sm,
  },
  input: {
    height: 52,
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    fontSize: fontSize.base,
  },
  errorContainer: {
    marginTop: spacing.md,
    marginBottom: spacing.md,
  },
  errorText: {
    fontSize: fontSize.sm,
  },
  messageContainer: {
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    marginTop: spacing.md,
    marginBottom: spacing.md,
  },
  messageText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  forgotPasswordButton: {
    alignSelf: 'flex-end',
    marginTop: spacing.md,
    marginBottom: spacing.xl,
  },
  forgotPasswordText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  submitButton: {
    height: 52,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.lg,
    marginBottom: spacing.xl,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  toggleContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing.xl,
    marginBottom: spacing.lg,
  },
  toggleText: {
    fontSize: fontSize.base,
  },
  toggleLink: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: spacing.xl,
    gap: spacing.md,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  appleButton: {
    width: '100%',
    height: 52,
    marginBottom: spacing.xl,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1000,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.md,
  },
  loadingText: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium,
  },
});
