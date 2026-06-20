// components/ui/GoalMomentum.tsx
// Per-goal Momentum display (spec §5 C+A hybrid): calm "Momentum · N days" with a
// warm glow when on it, neutral when resting, a fresh-start line at zero, and an
// amber cushion gauge ONLY when slipping. No flame, no countdown number.
import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';

import { fonts, fontSize, spacing, themedColors } from '../../theme/tokens';
import { useEffectiveTheme } from '../../state/uiSlice';
import { applyOpacity } from '../../src/components/icons/color';
import { presentMomentum } from '../../lib/momentumPresenter';
import type { MomentumSnapshot } from '../../lib/goalMomentum';

export function GoalMomentum({ snapshot }: { snapshot: MomentumSnapshot | null }) {
  const theme = useEffectiveTheme();
  const c = themedColors(theme);
  const d = presentMomentum(snapshot);

  const fill = useSharedValue(d.cushion ?? 0);
  useEffect(() => {
    fill.value = withTiming(d.cushion ?? 0, { duration: 350 });
  }, [d.cushion, fill]);
  const fillStyle = useAnimatedStyle(() => ({ width: `${Math.max(0, Math.min(1, fill.value)) * 100}%` }));

  const labelColor =
    d.visual === 'glow' ? c.momentumAmber
    : d.visual === 'fresh' ? c.inkMuted
    : c.inkMid;

  return (
    <View style={styles.wrap}>
      <View
        style={[
          styles.labelRow,
          d.visual === 'glow' && { backgroundColor: applyOpacity(c.momentumAmber, theme === 'dark' ? 0.16 : 0.12) },
        ]}
      >
        <Text style={[styles.label, { color: labelColor }]}>{d.label}</Text>
      </View>

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
