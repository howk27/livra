import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { LivraHeader } from '../components/ui/LivraHeader';
import { PillButton } from '../components/ui/PillButton';
import { SectionLabel } from '../components/ui/SectionLabel';
import { themedColors, fonts, spacing, radius } from '../theme/tokens';
import { useEffectiveTheme } from '../state/uiSlice';
import { getSupabaseClient } from '../lib/supabase';
import { logger } from '../lib/utils/logger';

export default function SignInScreen() {
  const theme = useEffectiveTheme();
  const c = themedColors(theme);
  const styles = useMemo(() => createStyles(c), [c]);
  const router = useRouter();
  const supabase = getSupabaseClient();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSignIn = async () => {
    if (!email.trim() || !password) {
      Alert.alert('Required', 'Please enter your email and password.');
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      if (error) throw error;
      router.replace('/(tabs)/focus' as any);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Sign in failed.';
      logger.error('[SignIn] signIn error:', err);
      Alert.alert('Sign in failed', msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen}>
      <LivraHeader showBack centerLogo />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.title}>Welcome back.</Text>

          <View style={styles.fieldBlock}>
            <SectionLabel>EMAIL</SectionLabel>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="you@example.com"
              placeholderTextColor={c.inkMuted}
            />
          </View>

          <View style={styles.fieldBlock}>
            <SectionLabel>PASSWORD</SectionLabel>
            <View style={styles.passwordWrap}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                placeholder="Your password"
                placeholderTextColor={c.inkMuted}
              />
              <TouchableOpacity
                style={styles.eyeBtn}
                onPress={() => setShowPassword((v) => !v)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Feather
                  name={showPassword ? 'eye-off' : 'eye'}
                  size={18}
                  color={c.inkMuted}
                />
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              onPress={() => router.push('/auth/reset-password' as any)}
              style={styles.forgotWrap}
            >
              <Text style={styles.forgotText}>Forgot password?</Text>
            </TouchableOpacity>
          </View>

          <PillButton
            label={loading ? 'Signing in…' : 'Sign In'}
            onPress={handleSignIn}
            disabled={loading}
            style={styles.primaryBtn}
          />

          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Google placeholder */}
          <TouchableOpacity style={styles.googleBtn} activeOpacity={0.8}>
            <View style={styles.googleLogo}>
              <Text style={styles.googleLogoText}>G</Text>
            </View>
            <Text style={styles.googleBtnText}>Continue with Google</Text>
            {/* DESIGN TODO: replace G placeholder with real Google logo asset */}
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.push('/onboarding' as any)}>
            <Text style={styles.secondaryLink}>
              Don't have an account?{' '}
              <Text style={styles.secondaryLinkBold}>Get started</Text>
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function createStyles(c: ReturnType<typeof themedColors>) {
  return StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: c.linen,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  title: {
    fontFamily: fonts.serif,
    fontSize: 28,
    color: c.inkDark,
    marginTop: spacing.xl,
  },
  fieldBlock: {
    marginTop: spacing.xl,
    gap: spacing.xs,
  },
  input: {
    height: 48,
    backgroundColor: c.surfaceAlt,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    fontFamily: fonts.sans,
    fontSize: 15,
    color: c.inkDark,
    borderWidth: 1,
    borderColor: c.borderLight,
  },
  passwordWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  eyeBtn: {
    position: 'absolute',
    right: spacing.md,
  },
  forgotWrap: {
    alignSelf: 'flex-end',
    marginTop: spacing.sm,
  },
  forgotText: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: c.forest,
    textAlign: 'right',
  },
  primaryBtn: {
    marginTop: spacing.xl,
    height: 52,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.lg,
    gap: spacing.md,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: c.borderLight,
  },
  dividerText: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: c.inkMuted,
  },
  googleBtn: {
    height: 52,
    borderRadius: radius.full,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.borderMid,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },
  googleLogo: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#4285F4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  googleLogoText: {
    fontFamily: fonts.sansMedium,
    fontSize: 12,
    color: c.inkInverse,
  },
  googleBtnText: {
    fontFamily: fonts.sansMedium,
    fontSize: 15,
    color: c.inkDark,
  },
  secondaryLink: {
    fontFamily: fonts.sans,
    fontSize: 14,
    color: c.inkMid,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  secondaryLinkBold: {
    fontFamily: fonts.sansMedium,
    color: c.forest,
  },
  });
}
