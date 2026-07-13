/**
 * AIHatchButton — the AI entry CTA, extracted from app/onboarding.tsx (FU-6).
 *
 * Single source for Livra's sole deliberate palette departure: the dusty
 * six-stop gradient + breathing shadow glow that marks "Livra drafts this for
 * you" moments. Consumed by onboarding step 1, GoalPathSheet, and /goal/suggest.
 * Reduced motion: the glow holds at a static 0.35 instead of breathing.
 */
import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, ViewStyle, StyleProp } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { fonts, radius, spacing, themedColors, fontSize } from '../../theme/tokens';
import { useEffectiveTheme } from '../../state/uiSlice';

/** Sole deliberate departure from the forest palette — the AI "magic" CTA earns
 * its own treatment (spec: rainbow, glowing, inviting), dialed down to sit next
 * to Livra's calm tone: dusty, desaturated stops rather than saturated candy hues. */
export const AI_HATCH_GRADIENT = ['#DDA3B4', '#DDBB98', '#DDD298', '#A8C4AC', '#9FBACE', '#B3A7CE'] as const;

interface AIHatchButtonProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function AIHatchButton({ label, onPress, disabled, loading, style }: AIHatchButtonProps) {
  const c = themedColors(useEffectiveTheme());
  const reducedMotion = useReducedMotion();

  // Breathing glow — slow, quiet pulse so the CTA feels inviting without shouting.
  const glow = useSharedValue(0.3);
  React.useEffect(() => {
    if (reducedMotion) {
      glow.value = 0.35;
      return;
    }
    glow.value = withRepeat(
      withSequence(
        withTiming(0.5, { duration: 2200, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.25, { duration: 2200, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      true,
    );
  }, [reducedMotion, glow]);
  const glowStyle = useAnimatedStyle(() => ({ shadowOpacity: glow.value }));

  const inactive = disabled || loading;

  return (
    <Animated.View style={[styles.glowWrap, glowStyle, inactive && { opacity: 0.4 }, style]}>
      <TouchableOpacity
        style={styles.hatch}
        onPress={onPress}
        disabled={inactive}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      >
        <LinearGradient
          colors={AI_HATCH_GRADIENT}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        {loading ? (
          <ActivityIndicator size="small" color={c.inkDark} />
        ) : (
          <Text style={[styles.label, { color: c.inkDark }]}>{label}</Text>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  glowWrap: {
    borderRadius: radius.md,
    shadowColor: '#B3A7CE',
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 10,
    elevation: 4,
  },
  hatch: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  label: {
    fontFamily: fonts.sansMedium,
    fontSize: fontSize.base,
    textShadowColor: 'rgba(255,255,255,0.35)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
});
