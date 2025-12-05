import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { parseISO, format } from 'date-fns';
import { colors } from '../theme/colors';
import { spacing, borderRadius, fontSize } from '../theme/tokens';
import { useEffectiveTheme } from '../state/uiSlice';
import { getLast7Days } from '../lib/date';

interface ChartMiniProps {
  data: { date: string; value: number }[];
  color?: string;
}

export const ChartMini: React.FC<ChartMiniProps> = ({ data, color }) => {
  const theme = useEffectiveTheme();
  const themeColors = colors[theme];
  const barColor = color || themeColors.primary;

  const last7Days = getLast7Days();
  const maxValue = data && data.length > 0 ? Math.max(...data.map((d) => d.value), 1) : 1;

  // Create data map for easy lookup
  const dataMap = new Map(data ? data.map((d) => [d.date, d.value]) : []);

  return (
    <View style={styles.container}>
      <View style={styles.chart}>
        {last7Days.map((date, index) => {
          const value = dataMap.get(date) || 0;
          const height = maxValue > 0 ? (value / maxValue) * 100 : 0;
          const dayLabel = format(parseISO(date), 'EEEEE'); // Single day letter

          return (
            <View key={date} style={styles.barContainer}>
              {/* Value label above bar */}
              {value > 0 && (
                <Text style={[styles.valueLabel, { color: themeColors.textSecondary }]}>
                  {value}
                </Text>
              )}
              {/* Day label above bar */}
              <Text style={[styles.labelAbove, { color: themeColors.textTertiary }]}>
                {dayLabel}
              </Text>
              <View style={styles.barWrapper}>
                <View
                  style={[
                    styles.bar,
                    {
                      height: `${height}%`,
                      backgroundColor: barColor,
                      opacity: height > 0 ? 1 : 0.2,
                    },
                  ]}
                />
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingVertical: spacing.md,
  },
  chart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: 160, // Taller bars per spec
    paddingHorizontal: spacing.sm,
  },
  barContainer: {
    flex: 1,
    alignItems: 'center',
    marginHorizontal: 2,
    justifyContent: 'flex-end',
  },
  // Labels above bars
  valueLabel: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  labelAbove: {
    fontSize: fontSize.xs,
    marginBottom: spacing.xs,
  },
  barWrapper: {
    flex: 1,
    width: '100%',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  bar: {
    width: '80%',
    borderRadius: borderRadius.sm,
    minHeight: 4,
  },
});

