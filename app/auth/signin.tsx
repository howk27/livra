import React, { useState, useEffect, useRef } from 'react';
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
  Keyboard,
  TouchableWithoutFeedback,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, {
  FadeIn,
  FadeOut,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as AppleAuthentication from 'expo-apple-authentication';
import { colors } from '../../theme/colors';
import { spacing, borderRadius, fontSize, fontWeight } from '../../theme/tokens';
import { useEffectiveTheme } from '../../state/uiSlice';
import { getSupabaseClient } from '../../lib/supabase';
import { useSync } from '../../hooks/useSync';
import { useAuth } from '../../hooks/useAuth';
import { useNotifications } from '../../hooks/useNotifications';
import { logger } from '../../lib/utils/logger';
import * as Notifications from 'expo-notifications';
import { getAuthStorageWriteFailed } from '../../lib/auth/authStorageHealth';
import { Logo } from '../../components/Logo';

type AuthMode = 'login' | 'signup';

export default function SignInScreen() {
  const theme = useEffectiveTheme();
  const themeColors = colors[theme];
  const router = useRouter();
  const { user, initialized } = useAuth();
  const { sync } = useSync();
  const supabase = getSupabaseClient();
  const { requestPermissions, permissionGranted } = useNotifications();

  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState(false);
  const [emailError, setEmailError] = useState(false);
  const [sessionExpiredMessage, setSessionExpiredMessage] = useState<string | null>(null);
  const [pendingEmailConfirmation, setPendingEmailConfirmation] = useState(false);
  const [isAppleAvailable, setIsAppleAvailable] = useState(false);
  const [isAppleLoading, setIsAppleLoading] = useState(false);

  const slideOffset = useSharedValue(0);
  const keyboardOffset = useSharedValue(0);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const emailInputRef = useRef<TextInput>(null);
  const passwordInputRef = useRef<TextInput>(null);
  const fullNameInputRef = useRef<TextInput>(null);
  const confirmPasswordInputRef = useRef<TextInput>(null);

  useEffect(() => {
    slideOffset.value = mode === 'signup' ? 1 : 0;
  }, [mode]);

  useEffect(() => {
    if (initialized && user) {
      router.replace('/');
    }
  }, [initialized, user, router]);

  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', () => {
      setIsKeyboardVisible(true);
      keyboardOffset.value = withTiming(-60, { duration: 250 });
    });
    const hideSub = Keyboard.addListener('keyboardDidHide', () => {
      setIsKeyboardVisible(false);
      keyboardOffset.value = withTiming(0, { duration: 250 });
    });
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);

  useEffect(() => {
    const check = async () => {
      const expired = await AsyncStorage.getItem('session_expired');
      if (expired === 'true') {
        setSessionExpiredMessage('Your session has expired. Please sign in again.');
        await AsyncStorage.removeItem('session_expired');
      }
    };
    check();
  }, []);

  useEffect(() => {
    const checkApple = async () => {
      try {
        const available = await AppleAuthentication.isAvailableAsync();
        setIsAppleAvailable(available);
      } catch {
        setIsAppleAvailable(false);
      }
    };
    checkApple();
  }, []);

  const animatedContainerStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: withSpring(slideOffset.value * -20, { damping: 15 }) + keyboardOffset.value },
    ],
  }));

  const dismissKeyboard = () => {
    Keyboard.dismiss();
    emailInputRef.current?.blur();
    passwordInputRef.current?.blur();
    fullNameInputRef.current?.blur();
    confirmPasswordInputRef.current?.blur();
  };

  const validateEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
  const validatePassword = (p: string) => p.length >= 8;

  const handleSubmit = async () => {
    setError(null);
    setPendingEmailConfirmation(false);

    if (!email.trim()) { setError('Please enter your email'); return; }
    if (!validateEmail(email)) { setError('Please enter a valid email address'); return; }
    if (!password.trim()) { setError('Please enter your password'); return; }

    if (mode === 'signup') {
      if (!fullName.trim()) { setError('Please enter your full name'); return; }
      if (!validatePassword(password)) { setError('Password must be at least 8 characters'); return; }
      if (password !== confirmPassword) { setError('Passwords do not match'); return; }
    }

    setLoading(true);

    try {
      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
      if (!supabaseUrl || supabaseUrl.includes('placeholder')) {
        setError('Authentication is not configured. Please contact support.');
        setLoading(false);
        return;
      }

      if (mode === 'login') {
        const { data, error: signInError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

        if (signInError) {
          setPasswordError(false);
          setEmailError(false);
          if (signInError.message.includes('Email not confirmed')) {
            Alert.alert('Email Not Verified', "Please check your email and verify your account before signing in.", [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Resend Verification Email', onPress: async () => {
                try {
                  setLoading(true);
                  await supabase.auth.resend({ type: 'signup', email: email.trim() });
                  Alert.alert('Email Sent', 'A new verification email has been sent. Please check your inbox and spam folder.');
                } catch { Alert.alert('Error', 'Failed to send verification email. Please try again.'); }
                finally { setLoading(false); }
              }},
            ]);
            setLoading(false);
            return;
          } else if (signInError.message.includes('Invalid login credentials')) {
            setPasswordError(true);
            setError('Incorrect password. Please try again.');
            setTimeout(() => { passwordInputRef.current?.focus(); setPassword(''); }, 100);
          } else if (signInError.message.includes('User not found')) {
            setEmailError(true);
            Alert.alert('Account Not Found', 'No account found with this email. Would you like to create one?', [
              { text: 'Cancel', style: 'cancel', onPress: () => setEmailError(false) },
              { text: 'Create Account', onPress: () => { setMode('signup'); setError(null); setEmailError(false); } },
            ]);
          } else {
            setError(signInError.message);
          }
        } else if (data?.user) {
          if (!data.user.email_confirmed_at) {
            Alert.alert('Email Not Verified', "Please check your email and verify your account.", [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Resend Verification Email', onPress: async () => {
                try {
                  setLoading(true);
                  await supabase.auth.resend({ type: 'signup', email: email.trim() });
                  Alert.alert('Email Sent', 'A new verification email has been sent.');
                } catch { Alert.alert('Error', 'Failed to send verification email.'); }
                finally { setLoading(false); }
              }},
            ]);
            setLoading(false);
            return;
          }
          await ensureProfile(supabase, data.user.id, data.user);
          return;
        } else {
          setError('Unable to sign in. Please try again.');
        }
      } else {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { full_name: fullName.trim() } },
        });

        if (signUpError) {
          if (signUpError.message.includes('already registered') || signUpError.message.includes('User already registered')) {
            setError(null);
            try {
              const { data: siData, error: siError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
              if (siError) {
                setError('An account with this email already exists. Please sign in with your password.');
                setTimeout(() => setMode('login'), 2000);
              } else if (siData?.user) {
                await ensureProfile(supabase, siData.user.id, siData.user, fullName.trim());
                return;
              }
            } catch {
              setError('An account with this email already exists. Please sign in instead.');
              setTimeout(() => setMode('login'), 2000);
            }
          } else {
            setError(signUpError.message);
          }
        } else if (data?.user) {
          await ensureProfile(supabase, data.user.id, data.user, fullName.trim());
          if (!data.user.email_confirmed_at) {
            setPendingEmailConfirmation(true);
            setMode('login');
            setPassword(''); setConfirmPassword(''); setFullName('');
          }
        } else {
          setError('Could not create account. Please try again.');
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      const storageFlag = await getAuthStorageWriteFailed();
      if (storageFlag || /securestore|keychain|keystore|user interaction|not available|storage/i.test(msg)) {
        setError('This device could not save your sign-in securely. Check storage space and Keychain settings, then try again.');
      } else {
        setError(msg || 'Something went wrong. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = () => router.push('/auth/reset-password');

  const toggleMode = () => {
    setMode(mode === 'login' ? 'signup' : 'login');
    setError(null);
    setPasswordError(false);
    setEmailError(false);
    setPendingEmailConfirmation(false);
    setPassword(''); setConfirmPassword(''); setFullName('');
  };

  const handleAppleSignIn = async () => {
    setIsAppleLoading(true);
    setError(null);
    try {
      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
      if (!supabaseUrl || supabaseUrl.includes('placeholder')) {
        setError('Authentication is not configured. Please contact support.');
        return;
      }
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (!credential.identityToken) throw new Error('No identity token received from Apple');
      const { data, error: signInError } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: credential.identityToken,
      });
      if (signInError) {
        if (signInError.code === 'provider_disabled' || signInError.message?.includes('not enabled')) {
          setError('Apple Sign-In is not enabled. Please use email and password.');
        } else {
          setError(signInError.message || 'Failed to sign in with Apple. Please try again.');
        }
        return;
      }
      if (data?.user) {
        const appleFullName = credential.fullName
          ? `${credential.fullName.givenName || ''} ${credential.fullName.familyName || ''}`.trim()
          : data.user.user_metadata?.full_name || '';
        await ensureProfile(supabase, data.user.id, data.user, appleFullName);
        try { await sync(); } catch { /* non-blocking */ }
      }
    } catch (err: unknown) {
      const e = err as { code?: string; message?: string };
      if (e.code === 'ERR_REQUEST_CANCELED' || e.code === 'ERR_CANCELED') return;
      const storageFlag = await getAuthStorageWriteFailed();
      if (storageFlag || /securestore|keychain|keystore|storage/i.test(e.message ?? '')) {
        setError('This device could not save your sign-in securely. Check storage and security settings.');
      } else {
        setError(e.message || `Apple Sign-In error: ${e.code || 'unknown'}`);
      }
    } finally {
      setIsAppleLoading(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  const inputBorderColor = (hasError: boolean) =>
    hasError ? themeColors.error : themeColors.border;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        {loading && (
          <View style={[styles.loadingOverlay, { backgroundColor: themeColors.background + 'E6' }]}>
            <ActivityIndicator size="large" color="#FEB729" />
            <Text style={[styles.loadingText, { color: themeColors.text }]}>
              {mode === 'login' ? 'Signing in...' : 'Creating account...'}
            </Text>
          </View>
        )}

        <TouchableWithoutFeedback onPress={dismissKeyboard}>
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.content}>

              {/* Logo + wordmark */}
              <Animated.View entering={FadeIn.duration(400)} style={styles.logoArea}>
                <Logo size={64} color="#FEB729" />
                <Text style={[styles.wordmark, { color: themeColors.text }]}>LIVRA</Text>
              </Animated.View>

              {/* Headline */}
              <Animated.View entering={FadeIn.duration(400).delay(80)} style={styles.headlineArea}>
                <Text style={[styles.headline, { color: themeColors.text }]}>
                  {mode === 'login' ? 'Welcome back.' : 'Create account.'}
                </Text>
                <Text style={[styles.subtext, { color: themeColors.textSecondary }]}>
                  {mode === 'login'
                    ? 'Sign in to sync your data across devices.'
                    : 'Start tracking your progress.'}
                </Text>
              </Animated.View>

              {/* Form */}
              <Animated.View style={[styles.form, animatedContainerStyle]}>

                {/* Full name (signup only) */}
                {mode === 'signup' && (
                  <Animated.View
                    entering={FadeIn.duration(250)}
                    exiting={FadeOut.duration(180)}
                    style={styles.fieldWrap}
                  >
                    <Text style={[styles.label, { color: themeColors.textSecondary }]}>Full name</Text>
                    <TextInput
                      ref={fullNameInputRef}
                      style={[styles.input, {
                        backgroundColor: themeColors.surface,
                        color: themeColors.text,
                        borderColor: themeColors.border,
                      }]}
                      placeholder="Your name"
                      placeholderTextColor={themeColors.textTertiary}
                      value={fullName}
                      onChangeText={t => { setFullName(t); setError(null); }}
                      autoCapitalize="words"
                      autoCorrect={false}
                      editable={!loading}
                      returnKeyType="next"
                      onSubmitEditing={() => emailInputRef.current?.focus()}
                    />
                  </Animated.View>
                )}

                {/* Email */}
                <View style={styles.fieldWrap}>
                  <Text style={[styles.label, { color: themeColors.textSecondary }]}>Email</Text>
                  <TextInput
                    ref={emailInputRef}
                    style={[styles.input, {
                      backgroundColor: themeColors.surface,
                      color: themeColors.text,
                      borderColor: inputBorderColor(emailError),
                    }]}
                    placeholder="you@example.com"
                    placeholderTextColor={themeColors.textTertiary}
                    value={email}
                    onChangeText={t => { setEmail(t); setError(null); setEmailError(false); }}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="email-address"
                    editable={!loading}
                    returnKeyType="next"
                    onSubmitEditing={() => passwordInputRef.current?.focus()}
                  />
                </View>

                {/* Password */}
                <View style={styles.fieldWrap}>
                  <Text style={[styles.label, { color: themeColors.textSecondary }]}>Password</Text>
                  <TextInput
                    ref={passwordInputRef}
                    style={[styles.input, {
                      backgroundColor: themeColors.surface,
                      color: themeColors.text,
                      borderColor: inputBorderColor(passwordError),
                    }]}
                    placeholder={mode === 'signup' ? 'Min. 8 characters' : 'Your password'}
                    placeholderTextColor={themeColors.textTertiary}
                    value={password}
                    onChangeText={t => { setPassword(t); setError(null); setPasswordError(false); }}
                    secureTextEntry
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={!loading}
                    returnKeyType={mode === 'signup' ? 'next' : 'done'}
                    onSubmitEditing={() => {
                      if (mode === 'signup') { confirmPasswordInputRef.current?.focus(); }
                      else { dismissKeyboard(); handleSubmit(); }
                    }}
                  />
                </View>

                {/* Confirm password (signup only) */}
                {mode === 'signup' && (
                  <Animated.View
                    entering={FadeIn.duration(250)}
                    exiting={FadeOut.duration(180)}
                    style={styles.fieldWrap}
                  >
                    <Text style={[styles.label, { color: themeColors.textSecondary }]}>Confirm password</Text>
                    <TextInput
                      ref={confirmPasswordInputRef}
                      style={[styles.input, {
                        backgroundColor: themeColors.surface,
                        color: themeColors.text,
                        borderColor: themeColors.border,
                      }]}
                      placeholder="Repeat password"
                      placeholderTextColor={themeColors.textTertiary}
                      value={confirmPassword}
                      onChangeText={t => { setConfirmPassword(t); setError(null); }}
                      secureTextEntry
                      autoCapitalize="none"
                      autoCorrect={false}
                      editable={!loading}
                      returnKeyType="done"
                      onSubmitEditing={() => { dismissKeyboard(); handleSubmit(); }}
                    />
                  </Animated.View>
                )}

                {/* Messages */}
                {sessionExpiredMessage && (
                  <Animated.View
                    entering={FadeIn.duration(200)}
                    style={[styles.messageBanner, { backgroundColor: themeColors.error + '20' }]}
                  >
                    <Text style={[styles.messageText, { color: themeColors.error }]}>
                      {sessionExpiredMessage}
                    </Text>
                  </Animated.View>
                )}

                {pendingEmailConfirmation && (
                  <Animated.View
                    entering={FadeIn.duration(200)}
                    style={[styles.messageBanner, { backgroundColor: '#FEB72920' }]}
                  >
                    <Text style={[styles.messageText, { color: '#FEB729' }]}>
                      Check your email to verify your account, then sign in to continue.
                    </Text>
                  </Animated.View>
                )}

                {error && (
                  <Animated.View
                    entering={FadeIn.duration(200)}
                    exiting={FadeOut.duration(200)}
                    style={styles.errorWrap}
                  >
                    <Text style={[styles.errorText, { color: themeColors.error }]}>{error}</Text>
                  </Animated.View>
                )}

                {/* Forgot password */}
                {mode === 'login' && (
                  <TouchableOpacity
                    onPress={handleForgotPassword}
                    disabled={loading}
                    style={styles.forgotBtn}
                  >
                    <Text style={[styles.forgotText, { color: themeColors.textSecondary }]}>
                      Forgot password?
                    </Text>
                  </TouchableOpacity>
                )}

                {/* Submit */}
                <TouchableOpacity
                  style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
                  onPress={handleSubmit}
                  disabled={loading || isAppleLoading}
                  activeOpacity={0.85}
                >
                  {loading ? (
                    <ActivityIndicator color="#111111" />
                  ) : (
                    <Text style={styles.submitBtnText}>
                      {mode === 'login' ? 'Sign in' : 'Create account'}
                    </Text>
                  )}
                </TouchableOpacity>

                {/* Divider */}
                {isAppleAvailable && (
                  <View style={styles.divider}>
                    <View style={[styles.dividerLine, { backgroundColor: themeColors.border }]} />
                    <Text style={[styles.dividerText, { color: themeColors.textSecondary }]}>or</Text>
                    <View style={[styles.dividerLine, { backgroundColor: themeColors.border }]} />
                  </View>
                )}

                {/* Apple */}
                {isAppleAvailable && !loading && !isAppleLoading && (
                  <AppleAuthentication.AppleAuthenticationButton
                    buttonType={
                      mode === 'signup'
                        ? AppleAuthentication.AppleAuthenticationButtonType.SIGN_UP
                        : AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN
                    }
                    buttonStyle={
                      theme === 'dark'
                        ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                        : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
                    }
                    cornerRadius={borderRadius.full}
                    style={styles.appleBtn}
                    onPress={handleAppleSignIn}
                  />
                )}

                {/* Toggle mode */}
                <View style={styles.toggleRow}>
                  <Text style={[styles.toggleText, { color: themeColors.textSecondary }]}>
                    {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
                  </Text>
                  <TouchableOpacity onPress={toggleMode} disabled={loading}>
                    <Text style={[styles.toggleLink, { color: '#FEB729' }]}>
                      {mode === 'login' ? 'Start here' : 'Sign in'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </Animated.View>

            </View>
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ── Profile creation helper ────────────────────────────────────────────────────

async function ensureProfile(supabase: any, userId: string, user: any, displayName?: string) {
  try {
    const { data: existing, error: checkErr } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', userId)
      .single();
    if (existing) return;
    if (checkErr?.code !== 'PGRST116') return;

    const name = displayName?.trim() ||
      user?.user_metadata?.full_name ||
      user?.email?.split('@')[0] || '';

    for (let i = 0; i < 3; i++) {
      if (i > 0) await new Promise(r => setTimeout(r, 500 * i));
      const { error: insertErr } = await supabase.from('profiles').insert({
        id: userId,
        display_name: name,
        created_at: new Date().toISOString(),
        onboarding_completed: false,
        pro_unlocked: false,
      });
      if (!insertErr || insertErr.code === '23505') break;
      if (insertErr.code !== '42501') break;
    }
  } catch (e) {
    logger.error('[Auth] ensureProfile error:', e);
  }
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  keyboardView: { flex: 1 },
  scrollContent: { flexGrow: 1 },
  content: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing['3xl'],
    paddingBottom: spacing['3xl'],
  },
  logoArea: {
    alignItems: 'center',
    marginBottom: spacing['3xl'],
    gap: spacing.md,
  },
  wordmark: {
    fontSize: 22,
    fontFamily: 'Satoshi',
    fontWeight: fontWeight.bold,
    letterSpacing: 6,
  },
  headlineArea: {
    marginBottom: spacing['3xl'],
    gap: spacing.sm,
  },
  headline: {
    fontSize: 32,
    fontFamily: 'Satoshi',
    fontWeight: fontWeight.bold,
    letterSpacing: -0.5,
    lineHeight: 38,
  },
  subtext: {
    fontSize: 15,
    fontFamily: 'Inter',
    lineHeight: 22,
  },
  form: { gap: spacing.lg },
  fieldWrap: { gap: spacing.xs },
  label: {
    fontSize: 12,
    fontFamily: 'Inter',
    fontWeight: fontWeight.medium,
    letterSpacing: 0.3,
  },
  input: {
    height: 52,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    fontSize: 15,
    fontFamily: 'Inter',
  },
  messageBanner: {
    padding: spacing.md,
    borderRadius: 12,
  },
  messageText: {
    fontSize: 13,
    fontFamily: 'Inter',
    fontWeight: fontWeight.medium,
    lineHeight: 18,
  },
  errorWrap: { marginTop: -spacing.xs },
  errorText: {
    fontSize: 13,
    fontFamily: 'Inter',
  },
  forgotBtn: { alignSelf: 'flex-end', marginTop: -spacing.sm },
  forgotText: {
    fontSize: 13,
    fontFamily: 'Inter',
  },
  submitBtn: {
    height: 54,
    borderRadius: borderRadius.full,
    backgroundColor: '#FEB729',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xs,
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: {
    color: '#111111',
    fontSize: 16,
    fontFamily: 'Inter',
    fontWeight: fontWeight.semibold,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginVertical: spacing.xs,
  },
  dividerLine: { flex: 1, height: 1 },
  dividerText: {
    fontSize: 12,
    fontFamily: 'Inter',
    fontWeight: fontWeight.medium,
  },
  appleBtn: {
    width: '100%',
    height: 52,
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  toggleText: {
    fontSize: 14,
    fontFamily: 'Inter',
  },
  toggleLink: {
    fontSize: 14,
    fontFamily: 'Inter',
    fontWeight: fontWeight.semibold,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    zIndex: 1000,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.md,
  },
  loadingText: {
    fontSize: 14,
    fontFamily: 'Inter',
    fontWeight: fontWeight.medium,
  },
});
