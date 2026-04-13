import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { AppText } from '../Typography';
import { colors } from '../../theme/colors';
import { spacing, borderRadius, fontSize } from '../../theme/tokens';
import { useEffectiveTheme } from '../../state/uiSlice';
import { WeeklyReview } from '../../types/WeeklyReview';

type Props = {
  summary: WeeklyReview;
  onPress: () => void;
  onDismissPrompt?: () => void;
};

export const WeeklyReviewPreviewCard = ({ summary, onPress }: Props) => {
  const theme = useEffectiveTheme();
  const themeColors = colors[theme];

  const summaryLine =
    summary.totalActivity > 0
      ? `${summary.totalActivity} marks this week • ${summary.daysActive} of 7 days active • Best day: ${summary.bestDay.label}`
      : 'Your weekly snapshot starts with your first mark.';

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[
          styles.card,
          {
            backgroundColor: themeColors.surface,
            borderColor: themeColors.border,
          },
        ]}
        onPress={onPress}
        activeOpacity={0.85}
      >
        <AppText variant="headline" style={[styles.title, { color: themeColors.text }]}>
          Weekly snapshot
        </AppText>
        <AppText variant="body" style={[styles.summary, { color: themeColors.textSecondary }]}>
          {summaryLine}
        </AppText>
        <AppText variant="caption" style={[styles.cta, { color: themeColors.text }]}>
          View in Tracking
        </AppText>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  card: {
    borderRadius: borderRadius.card,
    padding: spacing.lg,
    gap: spacing.xs,
    borderWidth: 1,
  },
  title: {
    fontSize: fontSize.base,
  },
  summary: {
    fontSize: fontSize.sm,
  },
  cta: {
    fontSize: fontSize.sm,
    marginTop: spacing.xs,
  },
});
