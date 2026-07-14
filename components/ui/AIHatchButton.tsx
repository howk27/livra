/**
 * AIHatchButton — the AI entry CTA, extracted from app/onboarding.tsx (FU-6).
 *
 * VD-5 "Ember hatch": the AI voice speaks in ember (theme/tokens `ember`),
 * the semantic spark accent — hollow, never a fill. 1px ember border over a
 * low-alpha ember wash, ember ✦ + label. A slow breathe (3.6s cycle)
 * oscillates the border/wash opacity 0.6 → 1.0 so the CTA feels alive
 * without shouting. Consumed by onboarding step 1, GoalPathSheet, /goal/suggest.
 * Reduced motion (hooks/useReducedMotion, the app's single source): static at
 * rest, full opacity. Disabled/loading: lower alpha, no breathe.
 * Contrast note: ember on light linen is 2.37:1 — the label is therefore
 * locked at ≥16px medium weight per the design-memory restriction.
 */
import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, ViewStyle, StyleProp } from 'react-native';
import Animated, {
  cancelAnimation,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { applyOpacity } from '../../src/components/icons/color';
import { fonts, radius, spacing, themedColors, fontSize } from '../../theme/tokens';
import { useEffectiveTheme } from '../../state/uiSlice';

const HALF_CYCLE_MS = 1800;

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
  const inactive = disabled || loading;

  // Breathe — slow border/wash opacity oscillation. Static at rest (full
  // opacity) under Reduce Motion, and while disabled or loading.
  const breathe = useSharedValue(1);
  React.useEffect(() => {
    if (reducedMotion || inactive) {
      cancelAnimation(breathe);
      breathe.value = 1;
      return;
    }
    breathe.value = withRepeat(
      withSequence(
        withTiming(0.6, { duration: HALF_CYCLE_MS, easing: Easing.inOut(Easing.sin) }),
        withTiming(1, { duration: HALF_CYCLE_MS, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
    );
    return () => cancelAnimation(breathe);
  }, [reducedMotion, inactive, breathe]);
  const frameStyle = useAnimatedStyle(() => ({ opacity: breathe.value }));

  return (
    <TouchableOpacity
      style={[styles.hatch, inactive && styles.inactive, style]}
      onPress={onPress}
      disabled={inactive}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          styles.frame,
          { borderColor: c.ember, backgroundColor: applyOpacity(c.ember, 0.1) },
          frameStyle,
        ]}
      />
      {loading ? (
        <ActivityIndicator size="small" color={c.ember} />
      ) : (
        <Text style={[styles.label, { color: c.ember }]}>{label}</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  hatch: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  // Border + wash live on their own layer so the breathe never dims the label.
  frame: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderWidth: 1,
    borderRadius: radius.md,
  },
  inactive: {
    opacity: 0.4,
  },
  label: {
    fontFamily: fonts.sansMedium,
    // Contrast floor: ember text on light bg must be >=16px medium+ (VD-1).
    fontSize: fontSize.lg,
  },
});
