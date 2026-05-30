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
import { spacing, fontSize, fontWeight, borderRadius } from '../../theme/tokens';

export default function CommitmentScreen() {
  const theme = useEffectiveTheme();
  const themeColors = colors[theme];
  const router = useRouter();
  const { goalTitle, setGoalTitle } = useOnboardingStore();
  const [inputError, setInputError] = useState<string | null>(null);

  const handleSkip = () => {
    router.push('/onboarding/focus-area' as any);
  };

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
        {/* Top-right skip link */}
        <View style={styles.topBar}>
          <TouchableOpacity onPress={handleSkip} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} accessibilityRole="button" accessibilityLabel="Skip">
            <Text style={[styles.skipText, { color: themeColors.textSecondary }]}>Skip</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.content}>
          <View style={styles.copyArea}>
            <Text style={[styles.prompt, { color: themeColors.text }]}>
              {"What's one thing you've been putting off?"}
            </Text>
            <Text style={[styles.subtext, { color: themeColors.textSecondary }]}>
              {"That's where we start."}
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
            onChangeText={(text) => {
              setGoalTitle(text);
              if (inputError) setInputError(null);
            }}
            placeholder={"e.g. Finish writing the book"}
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
            style={[styles.ctaButton, { backgroundColor: themeColors.accent.primary }]}
            onPress={handleConfirm}
            activeOpacity={0.82}
            accessibilityRole="button"
            accessibilityLabel="That's it"
          >
            <Text style={styles.ctaButtonText}>{"That's it"}</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const CTA_TEXT_COLOR = '#FFFFFF';

const styles = StyleSheet.create({
  fill: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  skipText: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium,
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.xl,
    justifyContent: 'center',
    gap: spacing.xl,
  },
  copyArea: {
    gap: spacing.md,
  },
  prompt: {
    fontSize: fontSize['2xl'],
    fontWeight: fontWeight.bold,
    lineHeight: fontSize['2xl'] * 1.3,
  },
  subtext: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.normal,
  },
  input: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.normal,
    borderWidth: 1,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    minHeight: 96,
  },
  errorText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.normal,
  },
  ctaButton: {
    width: '100%',
    paddingVertical: spacing.lg,
    borderRadius: borderRadius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  ctaButtonText: {
    color: CTA_TEXT_COLOR,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
  },
});
