// components/ui/GoalMomentum.tsx
// Per-goal Momentum display (spec §5 C+A hybrid): calm "Momentum · N days" with a
// warm glow when on it, neutral when resting, a fresh-start line at zero, and an
// amber cushion gauge ONLY when slipping. No flame, no countdown number.
import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { fonts, fontSize, motion, spacing, springs, themedColors } from '../../theme/tokens';
import { useEffectiveTheme } from '../../state/uiSlice';
import { useMotion } from '../../hooks/useMotion';
import { applyOpacity } from '../../src/components/icons/color';
import { presentMomentum } from '../../lib/momentumPresenter';
import { momentumDayIncreased } from '../../lib/motionTriggers';
import type { MomentumSnapshot } from '../../lib/goalMomentum';

export function GoalMomentum({ snapshot }: { snapshot: MomentumSnapshot | null }) {
  const theme = useEffectiveTheme();
  const c = themedColors(theme);
  const { reduced } = useMotion();
  const d = presentMomentum(snapshot);

  const fill = useSharedValue(d.cushion ?? 0);
  useEffect(() => {
    fill.value = withTiming(d.cushion ?? 0, { duration: motion.gentle });
  }, [d.cushion, fill]);
  const fillStyle = useAnimatedStyle(() => ({ width: `${Math.max(0, Math.min(1, fill.value)) * 100}%` }));

  // Growth pulse (endowed progress): only when the day count visibly grows.
  const labelScale = useSharedValue(1);
  const labelOpacity = useSharedValue(d.visual === 'fresh' ? 0 : 1);
  const prevDaysRef = useRef<number | null>(null);

  useEffect(() => {
    const days = snapshot?.days ?? null;
    if (!reduced && momentumDayIncreased(prevDaysRef.current, days)) {
      labelScale.value = withSequence(
        withTiming(1.06, { duration: motion.quick }),
        withSpring(1, springs.playful),
      );
    }
    prevDaysRef.current = days;
  }, [snapshot?.days, reduced, labelScale]);

  // Fresh-start entrance (fresh-start effect): warm fade + settle, no shame.
  useEffect(() => {
    if (d.visual === 'fresh') {
      if (reduced) {
        labelOpacity.value = 1;
        return;
      }
      labelOpacity.value = withTiming(1, { duration: motion.gentle });
      labelScale.value = 0.96;
      labelScale.value = withSpring(1, springs.entrance);
    } else {
      labelOpacity.value = 1;
    }
  }, [d.visual, reduced, labelOpacity, labelScale]);

  const labelAnimStyle = useAnimatedStyle(() => ({
    opacity: labelOpacity.value,
    transform: [{ scale: labelScale.value }],
  }));

  const labelColor =
    d.visual === 'glow' ? c.momentumAmber
    : d.visual === 'fresh' ? c.inkMuted
    : c.inkMid;

  return (
    <View style={styles.wrap}>
      <Animated.View
        testID="momentum-label-animated"
        style={[
          styles.labelRow,
          d.visual === 'glow' && { backgroundColor: applyOpacity(c.momentumAmber, theme === 'dark' ? 0.16 : 0.12) },
          labelAnimStyle,
        ]}
      >
        <Text style={[styles.label, { color: labelColor }]}>{d.label}</Text>
      </Animated.View>

      {d.visual === 'gauge' && (
        <View
          testID="momentum-cushion-gauge"
          style={[styles.track, { backgroundColor: applyOpacity(c.momentumAmber, theme === 'dark' ? 0.2 : 0.15) }]}
        >
          <Animated.View style={[styles.fill, { backgroundColor: c.momentumAmber }, fillStyle]} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: spacing.xs },
  labelRow: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  label: {
    fontFamily: fonts.sansMedium,
    fontSize: fontSize.sm,
  },
  track: {
    height: 4,
    borderRadius: 2,
    marginTop: spacing.xs,
    overflow: 'hidden',
  },
  fill: {
    height: 4,
    borderRadius: 2,
  },
});
