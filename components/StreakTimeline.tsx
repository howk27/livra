/**
 * StreakTimeline — Livra 2.0 Layer 4.
 * Horizontal bar chart of streak history. Every bar grew from a 1.
 */
import React, { useEffect, useRef, useCallback, useState } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withDelay, withTiming, Easing,
} from 'react-native-reanimated';
import { AppText } from './Typography';
import { applyOpacity } from '@/src/components/icons/color';
import { colors } from '../theme/colors';
import { spacing, borderRadius, fontSize, fontWeight } from '../theme/tokens';
import { useEffectiveTheme } from '../state/uiSlice';

export interface StreakRecord {
  startDate: string;
  endDate: string;
  length: number;
  dominantColor?: string;
}

interface StreakTimelineProps {
  streaks: StreakRecord[];
  maxBarHeight?: number;
}

function formatDateRange(start: string, end: string, length: number): string {
  const s = new Date(start + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const e = new Date(end   + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  if (start === end) return `${s}. 1 day.`;
  return `${s}–${e}. ${length} days.`;
}

const BAR_WIDTH = 10;
const BAR_GAP   = 5;

const StreakBar: React.FC<{
  record: StreakRecord;
  maxLen: number;
  maxHeight: number;
  index: number;
  accentColor: string;
  onPress: (r: StreakRecord) => void;
  isSelected: boolean;
}> = ({ record, maxLen, maxHeight, index, accentColor, onPress, isSelected }) => {
  const heightFraction = Math.max(0.04, record.length / Math.max(1, maxLen));
  const targetHeight   = Math.round(heightFraction * maxHeight);

  const barHeight = useSharedValue(0);
  const barScale  = useSharedValue(1);

  useEffect(() => {
    barHeight.value = withDelay(
      index * 30,
      withTiming(targetHeight, { duration: 400, easing: Easing.out(Easing.ease) }),
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePress = useCallback(() => {
    barScale.value = withTiming(1.15, { duration: 100 }, () => {
      barScale.value = withTiming(1.0, { duration: 150 });
    });
    onPress(record);
  }, [record, onPress, barScale]);

  const barStyle = useAnimatedStyle(() => ({
    height:    barHeight.value,
    transform: [{ scale: barScale.value }],
    backgroundColor: isSelected ? accentColor : applyOpacity(accentColor, 0.55),
  }));

  return (
    <TouchableOpacity activeOpacity={0.8} onPress={handlePress} style={[styles.barWrapper, { height: maxHeight }]}>
      <Animated.View style={[styles.bar, barStyle]} />
    </TouchableOpacity>
  );
};

export const StreakTimeline: React.FC<StreakTimelineProps> = ({
  streaks,
  maxBarHeight = 72,
}) => {
  const theme = useEffectiveTheme();
  const themeColors = colors[theme];
  const [selectedStreak, setSelectedStreak] = useState<StreakRecord | null>(null);

  const handlePress = useCallback((r: StreakRecord) => {
    setSelectedStreak(prev => prev?.startDate === r.startDate ? null : r);
  }, []);

  if (streaks.length === 0) return null;

  const maxLen = Math.max(...streaks.map(s => s.length), 1);
  const accentColor = themeColors.accent.primary;

  return (
    <View style={styles.wrapper}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {streaks.map((s, i) => (
          <StreakBar
            key={s.startDate}
            record={s}
            maxLen={maxLen}
            maxHeight={maxBarHeight}
            index={i}
            accentColor={s.dominantColor ?? accentColor}
            onPress={handlePress}
            isSelected={selectedStreak?.startDate === s.startDate}
          />
        ))}
      </ScrollView>

      {selectedStreak && (
        <AppText style={[styles.label, { color: themeColors.textSecondary }]}>
          {formatDateRange(selectedStreak.startDate, selectedStreak.endDate, selectedStreak.length)}
        </AppText>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: { gap: spacing.xs },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    gap: BAR_GAP,
    alignItems: 'flex-end',
  },
  barWrapper: {
    width: BAR_WIDTH,
    justifyContent: 'flex-end',
  },
  bar: {
    width: BAR_WIDTH,
    borderRadius: 3,
    minHeight: 4,
  },
  label: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.xxs,
  },
});
