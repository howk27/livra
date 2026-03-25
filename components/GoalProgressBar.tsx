import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, StyleSheet } from 'react-native';
import { useEffectiveTheme } from '../state/uiSlice';
import { colors } from '../theme/colors';
import { getGoalProgress, getGoalLabel } from '../lib/features';
import type { Mark, MarkEvent } from '../types';

interface GoalProgressBarProps {
  mark: Mark;
  events: MarkEvent[];
  color?: string;
  /** compact = bar only (for tile). full = bar + label text (for detail screen) */
  variant?: 'compact' | 'full';
}

export const GoalProgressBar: React.FC<GoalProgressBarProps> = ({
  mark, events, color, variant = 'compact',
}) => {
  const theme = useEffectiveTheme();
  const themeColors = colors[theme];
  const progress = getGoalProgress(events, mark);
  const label = getGoalLabel(events, mark);
  const animWidth = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (progress === null) return;
    Animated.spring(animWidth, {
      toValue: progress,
      useNativeDriver: false,
      tension: 60,
      friction: 8,
    }).start();
  }, [progress]);

  if (progress === null) return null;

  const barColor = color || themeColors.primary;
  const isComplete = progress >= 1;

  return (
    <View style={styles.container}>
      <View style={[styles.track, { backgroundColor: themeColors.border }]}>
        <Animated.View
          style={[
            styles.fill,
            {
              backgroundColor: isComplete ? '#22c55e' : barColor,
              width: animWidth.interpolate({
                inputRange: [0, 1],
                outputRange: ['0%', '100%'],
              }),
            },
          ]}
        />
      </View>
      {variant === 'full' && label && (
        <Text style={[styles.label, { color: themeColors.textSecondary }]}>
          {isComplete ? `✓ Goal reached  ·  ${label}` : label}
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { gap: 4 },
  track: { height: 4, borderRadius: 2, overflow: 'hidden', width: '100%' },
  fill: { height: '100%', borderRadius: 2 },
  label: { fontSize: 11, fontWeight: '500' },
});
