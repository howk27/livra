import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useEffectiveTheme } from '../../state/uiSlice';
import { colors } from '../../theme/colors';
import { spacing, borderRadius, fontWeight } from '../../theme/tokens';
import { Logo } from '../../components/Logo';

const DOTS = [0, 1, 2, 3, 4];
const CURRENT = 0;

export default function WelcomeScreen() {
  const theme = useEffectiveTheme();
  const themeColors = colors[theme];
  const router = useRouter();

  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: themeColors.background }]}>
      {/* Progress dots */}
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

      <View style={styles.content}>
        {/* Logo */}
        <View style={styles.logoArea}>
          <Logo size={52} color="#FEB729" />
        </View>

        {/* Copy */}
        <View style={styles.copyArea}>
          <Text style={[styles.headline, { color: themeColors.text }]}>
            Most people have a graveyard of abandoned goals.
          </Text>
          <Text style={[styles.subtext, { color: themeColors.textSecondary }]}>
            This is where goals actually get done.
          </Text>
        </View>

        {/* CTA */}
        <TouchableOpacity
          style={styles.cta}
          onPress={() => router.push('/onboarding/commitment' as any)}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Let's start"
        >
          <Text style={styles.ctaText}>Let's start</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    paddingTop: spacing.xl,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1,
  },
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
  copyArea: {
    gap: spacing.lg,
  },
  headline: {
    fontSize: 30,
    fontFamily: 'Satoshi',
    fontWeight: fontWeight.bold,
    lineHeight: 38,
    letterSpacing: -0.5,
  },
  subtext: {
    fontSize: 18,
    fontFamily: 'Inter',
    lineHeight: 26,
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
