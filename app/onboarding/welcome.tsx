import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useEffectiveTheme } from '../../state/uiSlice';
import { colors } from '../../theme/colors';
import { spacing, fontSize, fontWeight, borderRadius } from '../../theme/tokens';

export default function WelcomeScreen() {
  const theme = useEffectiveTheme();
  const themeColors = colors[theme];
  const router = useRouter();

  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: themeColors.background }]}>
      <View style={styles.content}>
        <View style={styles.logoArea}>
          <Text
            style={[styles.logoText, { color: themeColors.accent.primary }]}
            accessibilityRole="text"
            accessibilityLabel="Livra"
          >
            Livra
          </Text>
        </View>

        <View style={styles.copyArea}>
          <Text style={[styles.headline, { color: themeColors.text }]}>
            {"Most people have a graveyard of abandoned goals."}
          </Text>
          <Text style={[styles.subtext, { color: themeColors.textSecondary }]}>
            {"This is where goals actually get done."}
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.ctaButton, { backgroundColor: themeColors.accent.primary }]}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          onPress={() => router.push('/onboarding/commitment' as any)}
          activeOpacity={0.82}
          accessibilityRole="button"
          accessibilityLabel="Let's start"
        >
          <Text style={styles.ctaButtonText}>{"Let's start"}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const CTA_TEXT_COLOR = '#FFFFFF';

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: {
    flex: 1,
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing['3xl'],
  },
  logoArea: {
    alignItems: 'center',
    paddingTop: spacing['3xl'],
  },
  logoText: {
    fontSize: fontSize['2xl'],
    fontWeight: fontWeight.bold,
    letterSpacing: 1.5,
  },
  copyArea: {
    gap: spacing.lg,
  },
  headline: {
    fontSize: fontSize['2xl'],
    fontWeight: fontWeight.bold,
    lineHeight: fontSize['2xl'] * 1.35,
  },
  subtext: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.normal,
    lineHeight: fontSize.xl * 1.5,
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
