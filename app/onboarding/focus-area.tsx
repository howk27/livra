import { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useEffectiveTheme } from '../../state/uiSlice';
import { useOnboardingStore, FocusArea } from '../../state/onboardingSlice';
import { colors } from '../../theme/colors';
import { spacing, borderRadius, fontWeight } from '../../theme/tokens';

const FOCUS_OPTIONS: { label: string; value: FocusArea }[] = [
  { label: 'Health', value: 'health' },
  { label: 'Career', value: 'career' },
  { label: 'Creativity', value: 'creativity' },
  { label: 'Learning', value: 'learning' },
  { label: 'Relationships', value: 'relationships' },
  { label: 'Finances', value: 'finances' },
];

const DOTS = [0, 1, 2, 3, 4];
const CURRENT = 2;

export default function FocusAreaScreen() {
  const theme = useEffectiveTheme();
  const themeColors = colors[theme];
  const router = useRouter();
  const { setFocusArea } = useOnboardingStore();
  const [selected, setSelected] = useState<FocusArea | null>(null);

  const handleSkip = () => router.push('/onboarding/daily-identity' as any);

  const handleConfirm = () => {
    if (!selected) return;
    setFocusArea(selected);
    router.push('/onboarding/daily-identity' as any);
  };

  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: themeColors.background }]}>
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

      <ScrollView
        style={styles.fill}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.copyArea}>
          <Text style={[styles.prompt, { color: themeColors.text }]}>
            What area of your life needs the most attention right now?
          </Text>
        </View>

        <View style={styles.cardList}>
          {FOCUS_OPTIONS.map(option => {
            const isSelected = selected === option.value;
            return (
              <TouchableOpacity
                key={option.value}
                style={[
                  styles.card,
                  {
                    backgroundColor: isSelected ? '#FEB72915' : themeColors.surface,
                    borderColor: isSelected ? '#FEB729' : themeColors.border,
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
                    { color: isSelected ? '#FEB729' : themeColors.text },
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
            styles.cta,
            { backgroundColor: selected ? '#FEB729' : themeColors.surfaceVariant },
          ]}
          onPress={handleConfirm}
          disabled={!selected}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="That's my focus"
          accessibilityState={{ disabled: !selected }}
        >
          <Text style={[styles.ctaText, { color: selected ? '#111111' : themeColors.textTertiary }]}>
            That's my focus
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
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.sm,
  },
  dots: { flexDirection: 'row', gap: 6 },
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
  scrollContent: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing['4xl'],
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
  cardList: { gap: spacing.sm },
  card: {
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.card,
    alignItems: 'flex-start',
  },
  cardLabel: {
    fontSize: 18,
    fontFamily: 'Satoshi',
    fontWeight: fontWeight.semibold,
  },
  cta: {
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    height: 56,
    marginTop: spacing.sm,
  },
  ctaText: {
    fontSize: 16,
    fontFamily: 'Inter',
    fontWeight: fontWeight.semibold,
  },
});
