import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useEffectiveTheme } from '../../state/uiSlice';
import { useOnboardingStore } from '../../state/onboardingSlice';
import { colors } from '../../theme/colors';
import { spacing, borderRadius, fontWeight } from '../../theme/tokens';

const DOTS = [0, 1, 2, 3, 4];
const CURRENT = 1;

export default function CommitmentScreen() {
  const theme = useEffectiveTheme();
  const themeColors = colors[theme];
  const router = useRouter();
  const { goalTitle, setGoalTitle } = useOnboardingStore();
  const [inputError, setInputError] = useState<string | null>(null);

  const handleSkip = () => router.push('/onboarding/focus-area' as any);

  const handleConfirm = () => {
    const trimmed = goalTitle.trim();
    if (trimmed.length < 3) {
      setInputError("Add at least 3 characters — even a rough idea counts.");
      return;
    }
    setInputError(null);
    setGoalTitle(trimmed);
    router.push('/onboarding/focus-area' as any);
  };

  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: themeColors.background }]}>
      <KeyboardAvoidingView
        style={styles.fill}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Top bar */}
        <View style={styles.topBar}>
          <View style={styles.dots}>
            {DOTS.map(i => (
              <View
                key={i}
                style={[
                  styles.dot,
                  {
                    backgroundColor: i === CURRENT ? '#FEB729' : 'transparent',
                    borderColor: i === CURRENT ? '#FEB729' : themeColors.border,
                  },
                ]}
              />
            ))}
          </View>
          <TouchableOpacity
            onPress={handleSkip}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityRole="button"
            accessibilityLabel="Skip"
          >
            <Text style={[styles.skipText, { color: themeColors.textSecondary }]}>Skip</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.content}>
          <View style={styles.copyArea}>
            <Text style={[styles.prompt, { color: themeColors.text }]}>
              What have you been putting off?
            </Text>
            <Text style={[styles.subtext, { color: themeColors.textSecondary }]}>
              That's where we start.
            </Text>
          </View>

          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: themeColors.surface,
                color: themeColors.text,
                borderColor: inputError ? themeColors.error : themeColors.border,
              },
            ]}
            value={goalTitle}
            onChangeText={t => { setGoalTitle(t); if (inputError) setInputError(null); }}
            placeholder="e.g. Finish writing the book"
            placeholderTextColor={themeColors.textTertiary}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
            autoFocus
            returnKeyType="done"
            onSubmitEditing={handleConfirm}
            accessibilityLabel="Goal input"
          />

          {inputError && (
            <Text style={[styles.errorText, { color: themeColors.error }]}>{inputError}</Text>
          )}

          <TouchableOpacity
            style={styles.cta}
            onPress={handleConfirm}
            activeOpacity={0.85}
            accessibilityRole="button"
          >
            <Text style={styles.ctaText}>That's it</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.sm,
  },
  dots: {
    flexDirection: 'row',
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1,
  },
  skipText: {
    fontSize: 14,
    fontFamily: 'Inter',
    fontWeight: fontWeight.medium,
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.xl,
    justifyContent: 'center',
    gap: spacing.xl,
  },
  copyArea: { gap: spacing.md },
  prompt: {
    fontSize: 28,
    fontFamily: 'Satoshi',
    fontWeight: fontWeight.bold,
    lineHeight: 36,
    letterSpacing: -0.3,
  },
  subtext: {
    fontSize: 17,
    fontFamily: 'Inter',
    lineHeight: 24,
  },
  input: {
    fontSize: 18,
    fontFamily: 'Satoshi',
    borderWidth: 1,
    borderRadius: 16,
    padding: spacing.lg,
    minHeight: 96,
    lineHeight: 26,
  },
  errorText: {
    fontSize: 13,
    fontFamily: 'Inter',
    marginTop: -spacing.md,
  },
  cta: {
    backgroundColor: '#FEB729',
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    height: 56,
  },
  ctaText: {
    color: '#111111',
    fontSize: 16,
    fontFamily: 'Inter',
    fontWeight: fontWeight.semibold,
  },
});
