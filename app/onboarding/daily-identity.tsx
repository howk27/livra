import { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useEffectiveTheme } from '../../state/uiSlice';
import { useOnboardingStore } from '../../state/onboardingSlice';
import { colors } from '../../theme/colors';
import { spacing, borderRadius, fontWeight } from '../../theme/tokens';

const IDENTITY_OPTIONS = [
  'Sleep better',
  'Move my body',
  'Drink more water',
  'Read consistently',
  'Plan my days',
  'Practice focus',
  'Build a skill',
  'Track my finances',
];

const MAX_SELECTIONS = 3;
const DOTS = [0, 1, 2, 3, 4];
const CURRENT = 3;

export default function DailyIdentityScreen() {
  const theme = useEffectiveTheme();
  const themeColors = colors[theme];
  const router = useRouter();
  const { setIdentitySelections } = useOnboardingStore();
  const [selected, setSelected] = useState<string[]>([]);

  const handleToggle = (option: string) => {
    setSelected(prev => {
      if (prev.includes(option)) return prev.filter(o => o !== option);
      if (prev.length >= MAX_SELECTIONS) return [...prev.slice(1), option];
      return [...prev, option];
    });
  };

  const handleSkip = () => router.push('/onboarding/recommendations' as any);

  const handleConfirm = () => {
    if (selected.length === 0) return;
    setIdentitySelections(selected);
    router.push('/onboarding/recommendations' as any);
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
            How do you want to show up every day?
          </Text>
          <Text style={[styles.subtext, { color: themeColors.textSecondary }]}>
            Pick up to 3. You can always change these.
          </Text>
        </View>

        <View style={styles.cardList}>
          {IDENTITY_OPTIONS.map(option => {
            const isSelected = selected.includes(option);
            return (
              <TouchableOpacity
                key={option}
                style={[
                  styles.card,
                  {
                    backgroundColor: isSelected ? '#FEB72915' : themeColors.surface,
                    borderColor: isSelected ? '#FEB729' : themeColors.border,
                    borderWidth: isSelected ? 2 : 1,
                  },
                ]}
                onPress={() => handleToggle(option)}
                activeOpacity={0.78}
                accessibilityRole="checkbox"
                accessibilityLabel={option}
                accessibilityState={{ checked: isSelected }}
              >
                <Text
                  style={[
                    styles.cardLabel,
                    { color: isSelected ? '#FEB729' : themeColors.text },
                  ]}
                >
                  {option}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <TouchableOpacity
          style={[
            styles.cta,
            { backgroundColor: selected.length > 0 ? '#FEB729' : themeColors.surfaceVariant },
          ]}
          onPress={handleConfirm}
          disabled={selected.length === 0}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="These feel right"
          accessibilityState={{ disabled: selected.length === 0 }}
        >
          <Text
            style={[
              styles.ctaText,
              { color: selected.length > 0 ? '#111111' : themeColors.textTertiary },
            ]}
          >
            These feel right
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
  subtext: {
    fontSize: 16,
    fontFamily: 'Inter',
    lineHeight: 24,
  },
  cardList: { gap: spacing.sm },
  card: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.card,
    alignItems: 'flex-start',
  },
  cardLabel: {
    fontSize: 17,
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
