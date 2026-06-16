import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { themedColors } from '../theme/tokens';
import { spacing, fontSize, borderRadius } from '../theme/tokens';
import { useEffectiveTheme } from '../state/uiSlice';
import { useXP } from '../hooks/useXP';

export function LevelProgressBar() {
  const theme = useEffectiveTheme();
  const c = themedColors(theme);

  const { levelTitle, nextLevelTitle, progressRatio } = useXP();

  const fillWidth = useSharedValue(0);

  useEffect(() => {
    fillWidth.value = withTiming(progressRatio, {
      duration: 600,
      easing: Easing.out(Easing.quad),
    });
  }, [progressRatio]);

  const fillStyle = useAnimatedStyle(() => ({
    width: `${fillWidth.value * 100}%` as any,
  }));

  const rightLabel = nextLevelTitle ?? "You're there.";

  return (
    <View style={styles.container}>
      <View style={styles.labels}>
        <Text style={[styles.label, { color: c.inkMid }]}>{levelTitle}</Text>
        <Text style={[styles.label, { color: c.inkMid }]}>{rightLabel}</Text>
      </View>
      <View style={[styles.track, { backgroundColor: c.borderMid }]}>
        <Animated.View style={[styles.fill, { backgroundColor: '#C47E8A' }, fillStyle]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.xs,
  },
  labels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  label: {
    fontSize: fontSize.sm,
  },
  track: {
    height: 6,
    borderRadius: borderRadius.full,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: borderRadius.full,
  },
});
