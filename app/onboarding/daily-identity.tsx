import { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useEffectiveTheme } from '../../state/uiSlice';
import { useOnboardingStore } from '../../state/onboardingSlice';
import { colors } from '../../theme/colors';
import { spacing, fontSize, fontWeight, borderRadius } from '../../theme/tokens';

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

export default function DailyIdentityScreen() {
  const theme = useEffectiveTheme();
  const themeColors = colors[theme];
  const router = useRouter();
  const { setIdentitySelections } = useOnboardingStore();
  // Local state for UI — only written to store on confirm / skip
  const [selected, setSelected] = useState<string[]>([]);

  const handleToggle = (option: string) => {
    setSelected((prev) => {
      if (prev.includes(option)) {
        return prev.filter((o) => o !== option);
      }
      if (prev.length >= MAX_SELECTIONS) {
        // Deselect oldest pick (first element) and add new one at end
        return [...prev.slice(1), option];
      }
      return [...prev, option];
    });
  };

  const handleSkip = () => {
    // Do not write to store — identitySelections remains []
    router.push('/onboarding/recommendations' as any);
  };

  const handleConfirm = () => {
    if (selected.length === 0) return;
    setIdentitySelections(selected);
    router.push('/onboarding/recommendations' as any);
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
            {'How do you want to show up every day?'}
          </Text>
          <Text style={[styles.subtext, { color: themeColors.textSecondary }]}>
            {'Pick up to 3. You can always change these.'}
          </Text>
        </View>

        <View style={styles.cardList}>
          {IDENTITY_OPTIONS.map((option) => {
            const isSelected = selected.includes(option);
            return (
              <TouchableOpacity
                key={option}
                style={[
                  styles.card,
                  {
                    backgroundColor: isSelected ? themeColors.primary : themeColors.surface,
                    borderColor: isSelected ? themeColors.accent.primary : themeColors.border,
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
                    { color: isSelected ? themeColors.accent.primary : themeColors.text },
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
            styles.ctaButton,
            {
              backgroundColor:
                selected.length > 0 ? themeColors.accent.primary : themeColors.surfaceVariant,
            },
          ]}
          onPress={handleConfirm}
          disabled={selected.length === 0}
          activeOpacity={0.82}
          accessibilityRole="button"
          accessibilityLabel="These feel right"
          accessibilityState={{ disabled: selected.length === 0 }}
        >
          <Text
            style={[
              styles.ctaButtonText,
              { color: selected.length > 0 ? '#FFFFFF' : themeColors.textTertiary },
            ]}
          >
            {'These feel right'}
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
  subtext: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.normal,
    lineHeight: fontSize.lg * 1.5,
  },
  cardList: {
    gap: spacing.md,
  },
  card: {
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.xl,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  cardLabel: {
    fontSize: fontSize.lg,
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
