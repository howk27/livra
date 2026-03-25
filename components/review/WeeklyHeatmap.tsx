import React, { useEffect, useMemo } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { AppText } from '../Typography';
import { WeeklyReviewDay } from '../../types/WeeklyReview';
import { spacing, borderRadius, fontSize } from '../../theme/tokens';
import { Colors } from '../../theme/colors';

type Props = {
  heatmap: WeeklyReviewDay[];
  themeColors: Colors;
};

export const WeeklyHeatmap = ({ heatmap, themeColors }: Props) => {
  const animatedValues = useMemo(
    () => heatmap.map(() => new Animated.Value(0)),
    [heatmap.length]
  );

  useEffect(() => {
    const animations = animatedValues.map((value, index) =>
      Animated.timing(value, {
        toValue: 1,
        duration: 180,
        delay: index * 40,
        useNativeDriver: true,
      })
    );
    Animated.stagger(40, animations).start();
  }, [animatedValues]);

  return (
    <View style={styles.row}>
      {heatmap.map((day, index) => {
        const intensityColor =
          day.intensity === 0
            ? themeColors.surfaceVariant
            : day.intensity === 1
              ? `${themeColors.accent.primary}33`
              : day.intensity === 2
                ? `${themeColors.accent.primary}66`
                : themeColors.accent.primary;

        return (
          <Animated.View
            key={day.date}
            style={[
              styles.cell,
              {
                opacity: animatedValues[index],
                transform: [
                  {
                    scale: animatedValues[index].interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.92, 1],
                    }),
                  },
                ],
              },
            ]}
          >
            <View style={[styles.square, { backgroundColor: intensityColor }]} />
            <AppText variant="caption" style={[styles.label, { color: themeColors.textSecondary }]}>
              {day.label}
            </AppText>
          </Animated.View>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  cell: {
    alignItems: 'center',
    gap: spacing.xs,
    flex: 1,
  },
  square: {
    width: 24,
    height: 24,
    borderRadius: borderRadius.md,
  },
  label: {
    fontSize: fontSize.xs,
  },
});

