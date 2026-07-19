import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
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
} from 'react-native-reanimated';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as AppleAuthentication from 'expo-apple-authentication';
import type { SupabaseClient, AuthUser as User } from '@supabase/supabase-js';
import { spacing, borderRadius, fontWeight, fonts, fontSize, themedColors } from '../../theme/tokens';
import { useEffectiveTheme, useUIStore } from '../../state/uiSlice';
import { getSupabaseClient } from '../../lib/supabase';
import { useSync } from '../../hooks/useSync';
import { useAuth } from '../../hooks/useAuth';
import { useNotifications } from '../../hooks/useNotifications';
import { logger } from '../../lib/utils/logger';
import * as Notifications from 'expo-notifications';
import { getAuthStorageWriteFailed } from '../../lib/auth/authStorageHealth';
import { Logo } from '../../components/Logo';
import { confirm } from '../../components/ui/overlays';
import { capture, identify } from '../../lib/analytics/posthog';
import { ANALYTICS_EVENTS } from '../../lib/analytics/events';

type AuthMode = 'login' | 'signup';

export default function SignInScreen() {
  const theme = useEffectiveTheme();
  const c = themedColors(theme);
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
  const emailInputRef = useRef<TextInput>(null);
  const passwordInputRef = useRef<TextInput>(null);
  const fullNameInputRef = useRef<TextInput>(null);
  const confirmPasswordInputRef = useRef<TextInput>(null);

  useEffect(() => {
    slideOffset.value = withSpring(mode === 'signup' ? 1 : 0, { damping: 15 });
  }, [mode]);

  useEffect(() => {
    if (initialized && user) {
      router.replace('/');
    }
  }, [initialized, user, router]);

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
      { translateY: slideOffset.value * -20 },
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
      if (fullName.trim().length < 2) { setError('Please enter your name (at least 2 characters)'); return; }
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
          if (signInError.message.includes('Invalid login credentials')) {
            setPasswordError(true);
            setError('Incorrect password. Please try again.');
            setTimeout(() => { passwordInputRef.current?.focus(); setPassword(''); }, 100);
          } else if (signInError.message.includes('User not found')) {
            setEmailError(true);
            const create = await confirm({
              title: 'Account not found',
              message: 'No account found with this email. Would you like to create one?',
              confirmLabel: 'Create Account',
              cancelLabel: 'Cancel',
            });
            if (create) { setMode('signup'); setError(null); }
            setEmailError(false);
          } else {
            setError(signInError.message);
          }
        } else if (data?.user) {
          // Email verification is NOT required to sign in. Unverified users are
          // let straight in and nudged to verify via the banner in Settings.
          // (Requires Supabase "Confirm email" enforcement to be off so that a
          // session is issued for unconfirmed accounts.)
          identify(data.user.id, { $set: { auth_provider: 'email' } });
          capture(ANALYTICS_EVENTS.USER_SIGNED_IN, { method: 'email' });
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
          if (data.session) {
            // Session issued → onAuthStateChange + the redirect effect take the
            // user into onboarding. No email verification gate.
            identify(data.user.id, { $set: { auth_provider: 'email' } });
            capture(ANALYTICS_EVENTS.USER_SIGNED_UP, { method: 'email' });
            return;
          }
          // No session means the server still requires email confirmation before
          // issuing one — fall back to the verify-then-sign-in path.
          setPendingEmailConfirmation(true);
          setMode('login');
          setPassword(''); setConfirmPassword(''); setFullName('');
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
        identify(data.user.id, { $set: { auth_provider: 'apple' } });
        capture(ANALYTICS_EVENTS.USER_SIGNED_IN, { method: 'apple' });
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
    hasError ? c.danger : c.borderLight;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: c.linen }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        {loading && (
          <View style={[styles.loadingOverlay, { backgroundColor: c.linen + 'E6' }]}>
            <ActivityIndicator size="large" color={c.accent} />
            <Text style={[styles.loadingText, { color: c.inkDark }]}>
              {mode === 'login' ? 'Signing in...' : 'Creating account...'}
            </Text>
          </View>
        )}

        {/* Fixed header — logo + wordmark stay pinned at top, never scroll */}
        <Animated.View entering={FadeIn.duration(400)} style={styles.header}>
          <Logo size={64} color={theme === 'dark' ? c.inkDark : c.forest} />
          <Text style={[styles.wordmark, { color: c.inkDark }]}>LIVRA</Text>
        </Animated.View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <TouchableWithoutFeedback onPress={dismissKeyboard}>
            <View style={styles.content}>

              {/* Headline */}
              <Animated.View entering={FadeIn.duration(400).delay(80)} style={styles.headlineArea}>
                <Text style={[styles.headline, { color: c.inkDark }]}>
                  {mode === 'login' ? 'Welcome back.' : 'Create account.'}
                </Text>
                <Text style={[styles.subtext, { color: c.inkMid }]}>
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
                    <Text style={[styles.label, { color: c.inkMid }]}>Your name</Text>
                    <TextInput
                      ref={fullNameInputRef}
                      style={[styles.input, {
                        backgroundColor: c.surfaceAlt,
                        color: c.inkDark,
                        borderColor: c.borderLight,
                      }]}
                      placeholder="Your name"
                      placeholderTextColor={c.inkMuted}
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
                  <Text style={[styles.label, { color: c.inkMid }]}>Email</Text>
                  <TextInput
                    ref={emailInputRef}
                    style={[styles.input, {
                      backgroundColor: c.surfaceAlt,
                      color: c.inkDark,
                      borderColor: inputBorderColor(emailError),
                    }]}
                    placeholder="you@example.com"
                    placeholderTextColor={c.inkMuted}
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
                  <Text style={[styles.label, { color: c.inkMid }]}>Password</Text>
                  <TextInput
                    ref={passwordInputRef}
                    style={[styles.input, {
                      backgroundColor: c.surfaceAlt,
                      color: c.inkDark,
                      borderColor: inputBorderColor(passwordError),
                    }]}
                    placeholder={mode === 'signup' ? 'Min. 8 characters' : 'Your password'}
                    placeholderTextColor={c.inkMuted}
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
                    <Text style={[styles.label, { color: c.inkMid }]}>Confirm password</Text>
                    <TextInput
                      ref={confirmPasswordInputRef}
                      style={[styles.input, {
                        backgroundColor: c.surfaceAlt,
                        color: c.inkDark,
                        borderColor: c.borderLight,
                      }]}
                      placeholder="Repeat password"
                      placeholderTextColor={c.inkMuted}
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
                    style={[styles.messageBanner, { backgroundColor: c.danger + '20' }]}
                  >
                    <Text style={[styles.messageText, { color: c.danger }]}>
                      {sessionExpiredMessage}
                    </Text>
                  </Animated.View>
                )}

                {pendingEmailConfirmation && (
                  <Animated.View
                    entering={FadeIn.duration(200)}
                    style={[styles.messageBanner, { backgroundColor: c.forest + '20' }]}
                  >
                    <Text style={[styles.messageText, { color: c.accent }]}>
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
                    <Text style={[styles.errorText, { color: c.danger }]}>{error}</Text>
                  </Animated.View>
                )}

                {/* Forgot password */}
                {mode === 'login' && (
                  <TouchableOpacity
                    onPress={handleForgotPassword}
                    disabled={loading}
                    style={styles.forgotBtn}
                  >
                    <Text style={[styles.forgotText, { color: c.inkMid }]}>
                      Forgot password?
                    </Text>
                  </TouchableOpacity>
                )}

                {/* Submit */}
                <TouchableOpacity
                  style={[styles.submitBtn, { backgroundColor: c.forest }, loading && styles.submitBtnDisabled]}
                  onPress={handleSubmit}
                  disabled={loading || isAppleLoading}
                  activeOpacity={0.85}
                >
                  {loading ? (
                    <ActivityIndicator color={c.inkInverse} />
                  ) : (
                    <Text style={[styles.submitBtnText, { color: c.inkInverse }]}>
                      {mode === 'login' ? 'Sign in' : 'Create account'}
                    </Text>
                  )}
                </TouchableOpacity>

                {/* Divider */}
                {isAppleAvailable && (
                  <View style={styles.divider}>
                    <View style={[styles.dividerLine, { backgroundColor: c.borderLight }]} />
                    <Text style={[styles.dividerText, { color: c.inkMid }]}>or</Text>
                    <View style={[styles.dividerLine, { backgroundColor: c.borderLight }]} />
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
                  <Text style={[styles.toggleText, { color: c.inkMid }]}>
                    {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
                  </Text>
                  <TouchableOpacity onPress={toggleMode} disabled={loading}>
                    <Text style={[styles.toggleLink, { color: c.accent }]}>
                      {mode === 'login' ? 'Start here' : 'Sign in'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </Animated.View>

            </View>
          </TouchableWithoutFeedback>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ── Profile creation helper ────────────────────────────────────────────────────

async function ensureProfile(
  supabase: SupabaseClient,
  userId: string,
  user: User,
  displayName?: string,
) {
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

    let createdNew = false;
    for (let i = 0; i < 3; i++) {
      if (i > 0) await new Promise(r => setTimeout(r, 500 * i));
      const { error: insertErr } = await supabase.from('profiles').insert({
        id: userId,
        display_name: name,
        created_at: new Date().toISOString(),
        onboarding_completed: false,
        pro_unlocked: false,
      });
      if (!insertErr) { createdNew = true; break; }
      if (insertErr.code === '23505') break; // already exists (race) — not a new account
      if (insertErr.code !== '42501') break;
    }

    // AUTH-8: a freshly inserted profile means a brand-new account. Clear any
    // stale local onboarding flags left by a previous user on this device so
    // loadUIState (local-first) does not skip onboarding for the new account.
    // profile.onboarding_completed defaults to false → routes to onboarding.
    //
    // Routed through resetOnboardingState (not a raw AsyncStorage.multiRemove +
    // setState) because _layout.tsx fires its own loadUIState the instant
    // `user?.id` changes on sign-up — that call races this one, reads AsyncStorage
    // independently, and (being the slower, network-bound call) can finish LAST
    // and silently stomp the reset back to a stale `true`. resetOnboardingState
    // bumps a generation token loadUIState checks before applying its result, so
    // a stale concurrent load can never win regardless of completion order.
    if (createdNew) {
      await useUIStore.getState().resetOnboardingState();
    }
  } catch (e) {
    logger.error('[Auth] ensureProfile error:', e);
  }
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  keyboardView: { flex: 1 },
  header: {
    alignItems: 'center',
    paddingTop: spacing['3xl'],
    paddingBottom: spacing.xl,
    gap: spacing.md,
  },
  scroll: { flex: 1 },
  scrollContent: { flexGrow: 1 },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: 48,
  },
  wordmark: {
    fontSize: fontSize.xl,
    // MED-A: brand wordmark off Cormorant (not a goal title/greeting). FLAGGED
    // for founder review alongside LivraWordmark — a logo may warrant a carve-out.
    fontFamily: fonts.sansBold,
    fontWeight: fontWeight.bold,
    letterSpacing: 6,
  },
  headlineArea: {
    marginBottom: spacing['3xl'],
    gap: spacing.sm,
  },
  headline: {
    fontSize: fontSize['3xl'],
    fontFamily: fonts.sansBold,
    fontWeight: fontWeight.bold,
    letterSpacing: -0.5,
    lineHeight: 38,
  },
  subtext: {
    fontSize: fontSize.md,
    fontFamily: fonts.sans,
    lineHeight: 22,
  },
  form: { gap: spacing.lg },
  fieldWrap: { gap: spacing.xs },
  label: {
    fontSize: fontSize.sm,
    fontFamily: fonts.sansMedium,
    letterSpacing: 0.3,
  },
  input: {
    height: 52,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    fontSize: fontSize.md,
    fontFamily: fonts.sans,
  },
  messageBanner: {
    padding: spacing.md,
    borderRadius: 12,
  },
  messageText: {
    fontSize: fontSize.sm,
    fontFamily: fonts.sansMedium,
    lineHeight: 18,
  },
  errorWrap: { marginTop: -spacing.xs },
  errorText: {
    fontSize: fontSize.sm,
    fontFamily: fonts.sans,
  },
  forgotBtn: { alignSelf: 'flex-end', marginTop: -spacing.sm },
  forgotText: {
    fontSize: fontSize.sm,
    fontFamily: fonts.sans,
  },
  submitBtn: {
    height: 54,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xs,
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: {
    fontSize: fontSize.lg,
    fontFamily: fonts.sansSemibold,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginVertical: spacing.xs,
  },
  dividerLine: { flex: 1, height: 1 },
  dividerText: {
    fontSize: fontSize.sm,
    fontFamily: fonts.sansMedium,
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
    fontSize: fontSize.base,
    fontFamily: fonts.sans,
  },
  toggleLink: {
    fontSize: fontSize.base,
    fontFamily: fonts.sansSemibold,
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
    fontSize: fontSize.base,
    fontFamily: fonts.sansMedium,
  },
});
