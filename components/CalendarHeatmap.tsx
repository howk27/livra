/**
 * CalendarHeatmap — Livra 2.0 Layer 4 hero treatment.
 * Staggered column-by-column reveal on mount. Tap-to-tooltip per day.
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { View, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, withDelay, Easing,
} from 'react-native-reanimated';
import { AppText } from './Typography';
import { applyOpacity } from '@/src/components/icons/color';
import { colors } from '../theme/colors';
import { spacing, borderRadius, fontSize, fontWeight } from '../theme/tokens';
import { useEffectiveTheme } from '../state/uiSlice';
import { formatDate } from '../lib/date';
import { subDays } from 'date-fns';
import { getAppDate } from '../lib/appDate';

interface DayData {
  date: string;
  logCount: number;  // number of marks logged
  totalMarks: number;
}

interface CalendarHeatmapProps {
  /** Map of date string → number of marks logged that day */
  logsByDate: Record<string, number>;
  totalMarks: number;
  /** How many weeks to show (default 16) */
  weeksToShow?: number;
}

const DAY_SIZE = 14;
const DAY_GAP  = 3;

function formatTooltipDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export const CalendarHeatmap: React.FC<CalendarHeatmapProps> = ({
  logsByDate,
  totalMarks,
  weeksToShow = 16,
}) => {
  const theme = useEffectiveTheme();
  const themeColors = colors[theme];
  const isDark = theme === 'dark';
  const [selectedDay, setSelectedDay] = useState<DayData | null>(null);

  // Build column-by-column grid (Mon-Sun, oldest left → newest right)
  const today = getAppDate();
  const todayDow = (today.getDay() + 6) % 7; // Mon=0
  const totalDays = weeksToShow * 7;
  const startDate = subDays(today, totalDays - 1 + (6 - todayDow));

  const columns: DayData[][] = [];
  for (let w = 0; w < weeksToShow; w++) {
    const col: DayData[] = [];
    for (let d = 0; d < 7; d++) {
      const date = subDays(today, (weeksToShow - 1 - w) * 7 + (6 - todayDow) - d + (6 - todayDow));
      // Recalc cleanly: day offset from startDate
      const offset = w * 7 + d;
      const dayDate = new Date(startDate);
      dayDate.setDate(startDate.getDate() + offset);
      const dateStr = formatDate(dayDate);
      col.push({ date: dateStr, logCount: logsByDate[dateStr] ?? 0, totalMarks });
    }
    columns.push(col);
  }

  // Per-column opacity animation (staggered reveal)
  const colOpacities = useRef(columns.map(() => useSharedValue(0)));
  useEffect(() => {
    columns.forEach((_, i) => {
      colOpacities.current[i].value = withDelay(
        i * 30,
        withTiming(1, { duration: 250, easing: Easing.out(Easing.ease) }),
      );
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getDayColor = (day: DayData): string => {
    if (day.logCount === 0) return isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.06)';
    const ratio = Math.min(1, day.logCount / Math.max(1, day.totalMarks));
    if (ratio >= 1) return isDark ? applyOpacity(themeColors.accent.primary, 0.85) : themeColors.accent.primary;
    return isDark ? applyOpacity(themeColors.accent.primary, 0.40) : applyOpacity(themeColors.accent.primary, 0.45);
  };

  const handleDayPress = useCallback((day: DayData) => {
    setSelectedDay(prev => prev?.date === day.date ? null : day);
  }, []);

  return (
    <View style={styles.wrapper}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {columns.map((col, w) => {
          const animStyle = useAnimatedStyle(() => ({ opacity: colOpacities.current[w].value }));
          return (
            <Animated.View key={w} style={[styles.column, animStyle]}>
              {col.map((day) => {
                const isSelected = selectedDay?.date === day.date;
                const isToday    = day.date === formatDate(today);
                return (
                  <TouchableOpacity
                    key={day.date}
                    activeOpacity={0.7}
                    onPress={() => handleDayPress(day)}
                    style={[
                      styles.day,
                      {
                        backgroundColor: getDayColor(day),
                        borderWidth: isToday || isSelected ? 1 : 0,
                        borderColor: isSelected
                          ? themeColors.accent.primary
                          : isToday
                            ? applyOpacity(themeColors.textSecondary, 0.50)
                            : 'transparent',
                      },
                    ]}
                  />
                );
              })}
            </Animated.View>
          );
        })}
      </ScrollView>

      {/* Tooltip */}
      {selectedDay && (
        <View style={[styles.tooltip, { backgroundColor: themeColors.surface, borderColor: applyOpacity(themeColors.border, 0.7) }]}>
          <AppText style={[styles.tooltipDate, { color: themeColors.text }]}>
            {formatTooltipDate(selectedDay.date)}
          </AppText>
          <AppText style={[styles.tooltipSub, { color: themeColors.textSecondary }]}>
            {selectedDay.logCount === 0
              ? 'No marks logged'
              : `${selectedDay.logCount}/${selectedDay.totalMarks} marks`}
          </AppText>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: { gap: spacing.xs },
  scroll: { flexGrow: 0 },
  scrollContent: { paddingHorizontal: spacing.lg, gap: DAY_GAP },
  column: { gap: DAY_GAP },
  day: { width: DAY_SIZE, height: DAY_SIZE, borderRadius: 3 },
  tooltip: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.xs,
    padding: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: StyleSheet.hairlineWidth,
    alignSelf: 'flex-start',
  },
  tooltipDate: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold },
  tooltipSub: { fontSize: fontSize.xs, marginTop: 2 },
});
