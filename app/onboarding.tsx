import React, { useMemo, useState, useCallback } from 'react';
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
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { SvgLogo } from '../components/ui/SvgLogo';
import { LivraWordmark } from '../components/ui/LivraWordmark';
import { PillButton } from '../components/ui/PillButton';
import { SectionLabel } from '../components/ui/SectionLabel';
import { themedColors, fonts, spacing, radius } from '../theme/tokens';
import { useEffectiveTheme } from '../state/uiSlice';
import { getSupabaseClient } from '../lib/supabase';
import { logger } from '../lib/utils/logger';

const HOW_IT_WORKS = [
  {
    num: '1',
    title: 'Set your goals',
    body: 'Add what you want to achieve, in order.',
  },
  {
    num: '2',
    title: 'Log your marks',
    body: 'Small daily actions that build toward each goal.',
  },
  {
    num: '3',
    title: 'Work the queue',
    body: 'One goal at a time. Finish what you start.',
  },
];

// Animated step dot
function StepDots({ step }: { step: number }) {
  const c = themedColors(useEffectiveTheme());
  return (
    <View style={dotStyles.dotsRow}>
      {[0, 1, 2].map((i) => {
        const active = i === step;
        return (
          <View
            key={i}
            style={[
              dotStyles.dot,
              active
                ? [dotStyles.dotActive, { backgroundColor: c.forest }]
                : [dotStyles.dotInactive, { backgroundColor: c.borderMid }],
            ]}
          />
        );
      })}
    </View>
  );
}

const dotStyles = StyleSheet.create({
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
    position: 'absolute',
    bottom: 48,
    left: 0,
    right: 0,
  },
  dot: { height: 6, borderRadius: radius.full },
  dotActive: { width: 20 },
  dotInactive: { width: 6 },
});

export default function OnboardingScreen() {
  const theme = useEffectiveTheme();
  const c = themedColors(theme);
  const styles = useMemo(() => createStyles(c), [c]);
  const router = useRouter();
  const supabase = getSupabaseClient();
  const [step, setStep] = useState(0);

  // Step 2 form state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const advance = useCallback(() => setStep((s) => Math.min(2, s + 1)), []);

  const handleSignUp = async () => {
    if (!email.trim() || !password) {
      Alert.alert('Required', 'Please enter your email and password.');
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
      });
      if (error) throw error;
      router.replace('/(tabs)/focus' as any);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Sign up failed.';
      logger.error('[Onboarding] signUp error:', err);
      Alert.alert('Sign up failed', msg);
    } finally {
      setLoading(false);
    }
  };

  // Step 0 — Welcome
  const renderStep0 = () => (
    <View style={styles.stepCenter}>
      <SvgLogo color={c.forest} width={64} height={32} />
      <View style={{ marginTop: spacing.md }}>
        <LivraWordmark color={c.inkDark} fontSize={42} letterSpacing={10} />
      </View>
      <Text style={styles.tagline}>Build with intention.</Text>
      <Text style={styles.body}>
        {'Track your marks. Work toward your goals.\nOne step at a time.'}
      </Text>
      <PillButton
        label="Get Started"
        onPress={advance}
        style={styles.primaryBtn}
      />
      <TouchableOpacity onPress={() => router.push('/signin' as any)}>
        <Text style={styles.secondaryLink}>I already have an account</Text>
      </TouchableOpacity>
    </View>
  );

  // Step 1 — How it works
  const renderStep1 = () => (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>How Livra works.</Text>
      <View style={styles.featureList}>
        {HOW_IT_WORKS.map((item) => (
          <View key={item.num} style={styles.featureRow}>
            <View style={styles.numCircle}>
              <Text style={styles.numText}>{item.num}</Text>
            </View>
            <View style={styles.featureText}>
              <Text style={styles.featureTitle}>{item.title}</Text>
              <Text style={styles.featureBody}>{item.body}</Text>
            </View>
          </View>
        ))}
      </View>
      <PillButton
        label="Next"
        onPress={advance}
        style={styles.primaryBtn}
      />
    </View>
  );

  // Step 2 — Sign up
  const renderStep2 = () => (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.stepContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.stepTitle}>Let's begin.</Text>
        <Text style={styles.stepSubtitle}>
          Create an account to sync your progress across all your devices.
        </Text>

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
              placeholder="At least 6 characters"
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
        </View>

        <PillButton
          label={loading ? 'Creating account…' : 'Create Account'}
          onPress={handleSignUp}
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

        <TouchableOpacity onPress={() => router.push('/signin' as any)}>
          <Text style={styles.secondaryLink}>
            Already have an account?{' '}
            <Text style={styles.secondaryLinkBold}>Sign in</Text>
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.fill}>
        {step === 0 && renderStep0()}
        {step === 1 && renderStep1()}
        {step === 2 && renderStep2()}
      </View>
      <StepDots step={step} />
    </SafeAreaView>
  );
}

function createStyles(c: ReturnType<typeof themedColors>) {
  return StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: c.linen,
  },
  fill: {
    flex: 1,
  },

  // Step dots
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
    position: 'absolute',
    bottom: 48,
    left: 0,
    right: 0,
  },
  dot: {
    height: 6,
    borderRadius: radius.full,
  },
  dotActive: {
    width: 20,
    backgroundColor: c.forest,
  },
  dotInactive: {
    width: 6,
    backgroundColor: c.borderMid,
  },

  // Step 0 — centered
  stepCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingBottom: 80,
  },
  tagline: {
    fontFamily: fonts.serifItalic,
    fontSize: 26,
    lineHeight: 34,
    color: c.inkDark,
    textAlign: 'center',
    marginTop: spacing.xl,
  },
  body: {
    fontFamily: fonts.sans,
    fontSize: 15,
    lineHeight: 24,
    color: c.inkMid,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  primaryBtn: {
    marginTop: spacing.xxl,
    height: 52,
    width: '100%',
  },
  secondaryLink: {
    fontFamily: fonts.sans,
    fontSize: 14,
    color: c.inkMid,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  secondaryLinkBold: {
    fontFamily: fonts.sansMedium,
    color: c.forest,
  },

  // Step 1 & 2 — top-padded
  stepContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: 100,
  },
  stepTitle: {
    fontFamily: fonts.serif,
    fontSize: 28,
    color: c.inkDark,
    marginTop: spacing.xl,
  },
  stepSubtitle: {
    fontFamily: fonts.sans,
    fontSize: 15,
    color: c.inkMid,
    lineHeight: 22,
    marginTop: spacing.sm,
  },

  // Feature rows
  featureList: {
    marginTop: spacing.xl,
    gap: spacing.lg,
  },
  featureRow: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'flex-start',
  },
  numCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: c.forest,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  numText: {
    fontFamily: fonts.serif,
    fontSize: 20,
    color: c.inkInverse,
  },
  featureText: {
    flex: 1,
    paddingTop: spacing.xs,
  },
  featureTitle: {
    fontFamily: fonts.sansMedium,
    fontSize: 15,
    color: c.inkDark,
  },
  featureBody: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: c.inkMuted,
    marginTop: 2,
  },

  // Fields
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

  // Divider
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

  // Google button
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
  });
}
