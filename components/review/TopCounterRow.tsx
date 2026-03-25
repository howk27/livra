import React from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText } from '../Typography';
import { spacing, borderRadius, fontSize, fontWeight } from '../../theme/tokens';
import { Colors } from '../../theme/colors';
import { WeeklyReviewCounterSummary } from '../../types/WeeklyReview';

type Props = {
  counter: WeeklyReviewCounterSummary;
  rank: number;
  maxTotal: number;
  themeColors: Colors;
};

export const TopCounterRow = ({ counter, rank, maxTotal, themeColors }: Props) => {
  const width = maxTotal > 0 ? Math.max(0.15, counter.total / maxTotal) : 0;
  return (
    <View style={[styles.row, { backgroundColor: themeColors.surface }]}>
      <View style={styles.left}>
        <View style={[styles.rank, { backgroundColor: themeColors.surfaceVariant }]}>
          <AppText variant="caption" style={[styles.rankText, { color: themeColors.text }]}>
            #{rank}
          </AppText>
        </View>
        <AppText variant="body" style={[styles.label, { color: themeColors.text }]}>
          {counter.emoji ? `${counter.emoji} ` : ''}{counter.name}
        </AppText>
      </View>
      <View style={styles.right}>
        <View style={[styles.barTrack, { backgroundColor: themeColors.surfaceVariant }]}>
          <View
            style={[
              styles.barFill,
              {
                backgroundColor: themeColors.accent.primary,
                width: `${Math.round(width * 100)}%`,
              },
            ]}
          />
        </View>
        <AppText variant="caption" style={[styles.value, { color: themeColors.textSecondary }]}>
          {counter.total}
        </AppText>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    borderRadius: borderRadius.md,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  right: {
    alignItems: 'flex-end',
    gap: spacing.xs,
    width: 120,
  },
  rank: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
  },
  rankText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
  },
  label: {
    fontSize: fontSize.base,
    flex: 1,
  },
  barTrack: {
    width: '100%',
    height: 6,
    borderRadius: borderRadius.full,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: borderRadius.full,
  },
  value: {
    fontSize: fontSize.xs,
  },
});

