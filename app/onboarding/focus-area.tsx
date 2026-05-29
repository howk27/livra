import { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useEffectiveTheme } from '../../state/uiSlice';
import { useOnboardingStore, FocusArea } from '../../state/onboardingSlice';
import { colors } from '../../theme/colors';
import { spacing, fontSize, fontWeight, borderRadius } from '../../theme/tokens';

const FOCUS_OPTIONS: { label: string; value: FocusArea }[] = [
  { label: 'Health', value: 'health' },
  { label: 'Career', value: 'career' },
  { label: 'Creativity', value: 'creativity' },
  { label: 'Learning', value: 'learning' },
  { label: 'Relationships', value: 'relationships' },
  { label: 'Finances', value: 'finances' },
];

export default function FocusAreaScreen() {
  const theme = useEffectiveTheme();
  const themeColors = colors[theme];
  const router = useRouter();
  const { setFocusArea } = useOnboardingStore();
  const [selected, setSelected] = useState<FocusArea | null>(null);

  const handleSkip = () => {
    // Leave focusArea as null in the store — skip does not write
    router.push('/onboarding/daily-identity' as any);
  };

  const handleConfirm = () => {
    if (!selected) return;
    setFocusArea(selected);
    router.push('/onboarding/daily-identity' as any);
  };

  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: themeColors.background }]}>
      {/* Top-right skip link */}
      <View style={styles.topBar}>
        <TouchableOpacity
          onPress={handleSkip}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityRole="button"
          accessibilityLabel="Skip"
        >
          <Text style={[styles.skipText, { color: themeColors.textSecondary }]}>Skip</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.fill}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.copyArea}>
          <Text style={[styles.prompt, { color: themeColors.text }]}>
            {"What area of your life needs the most attention right now?"}
          </Text>
        </View>

        <View style={styles.cardList}>
          {FOCUS_OPTIONS.map((option) => {
            const isSelected = selected === option.value;
            return (
              <TouchableOpacity
                key={option.value}
                style={[
                  styles.card,
                  {
                    backgroundColor: isSelected ? themeColors.primary : themeColors.surface,
                    borderColor: isSelected ? themeColors.accent.primary : themeColors.border,
                    borderWidth: isSelected ? 2 : 1,
                  },
                ]}
                onPress={() => setSelected(isSelected ? null : option.value)}
                activeOpacity={0.78}
                accessibilityRole="radio"
                accessibilityLabel={option.label}
                accessibilityState={{ selected: isSelected }}
              >
                <Text
                  style={[
                    styles.cardLabel,
                    { color: isSelected ? themeColors.accent.primary : themeColors.text },
                  ]}
                >
                  {option.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <TouchableOpacity
          style={[
            styles.ctaButton,
            {
              backgroundColor: selected ? themeColors.accent.primary : themeColors.surfaceVariant,
            },
          ]}
          onPress={handleConfirm}
          disabled={selected === null}
          activeOpacity={0.82}
          accessibilityRole="button"
          accessibilityLabel="That's my focus"
          accessibilityState={{ disabled: selected === null }}
        >
          <Text
            style={[
              styles.ctaButtonText,
              { color: selected ? '#FFFFFF' : themeColors.textTertiary },
            ]}
          >
            {"That's my focus"}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

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
  scrollContent: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing['4xl'],
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
  cardList: {
    gap: spacing.md,
  },
  card: {
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.xl,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  cardLabel: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.semibold,
  },
  ctaButton: {
    width: '100%',
    paddingVertical: spacing.lg,
    borderRadius: borderRadius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    marginTop: spacing.sm,
  },
  ctaButtonText: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
  },
});
