import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { AppText } from '../Typography';
import { spacing, borderRadius, fontSize, fontWeight, shadow } from '../../theme/tokens';
import { Colors } from '../../theme/colors';

type Props = {
  weekRange: string;
  totalActivity: number;
  daysActive: number;
  bestDayLabel: string;
  insight: string;
  onShare: () => void;
  themeColors: Colors;
};

export const WeeklyReviewHero = ({
  weekRange,
  totalActivity,
  daysActive,
  bestDayLabel,
  insight,
  onShare,
  themeColors,
}: Props) => {
  const fade = useRef(new Animated.Value(0)).current;
  const slide = useRef(new Animated.Value(12)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.timing(slide, { toValue: 0, duration: 220, useNativeDriver: true }),
    ]).start();
  }, [fade, slide]);

  const themedStyles = getHeroStyles(themeColors);

  return (
    <Animated.View style={{ opacity: fade, transform: [{ translateY: slide }] }}>
      <LinearGradient
        colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.04)']}
        style={themedStyles.gradient}
      >
        <View style={[themedStyles.card]}>
          <View style={themedStyles.header}>
            <View>
              <AppText variant="headline" style={themedStyles.title}>
                Weekly Review
              </AppText>
              <AppText variant="caption" style={themedStyles.subtitle}>
                {weekRange}
              </AppText>
            </View>
            <TouchableOpacity onPress={onShare} style={themedStyles.shareButton}>
              <AppText variant="button" style={themedStyles.shareText}>
                Share
              </AppText>
            </TouchableOpacity>
          </View>

          <View style={themedStyles.metricsRow}>
            <View style={themedStyles.metricBlock}>
              <AppText variant="headline" style={themedStyles.metricValue}>
                {totalActivity}
              </AppText>
              <AppText variant="caption" style={themedStyles.metricLabel}>
                marks this week
              </AppText>
            </View>
            <View style={themedStyles.metricDivider} />
            <View style={themedStyles.metricBlock}>
              <AppText variant="headline" style={themedStyles.metricValue}>
                {daysActive}/7
              </AppText>
              <AppText variant="caption" style={themedStyles.metricLabel}>
                days active
              </AppText>
            </View>
            <View style={themedStyles.metricDivider} />
            <View style={themedStyles.metricBlock}>
              <AppText variant="headline" style={themedStyles.metricValue}>
                {bestDayLabel}
              </AppText>
              <AppText variant="caption" style={themedStyles.metricLabel}>
                best day
              </AppText>
            </View>
          </View>

          <View style={themedStyles.insight}>
            <AppText variant="body" style={themedStyles.insightText}>
              {insight}
            </AppText>
          </View>
        </View>
      </LinearGradient>
    </Animated.View>
  );
};

export const getHeroStyles = (themeColors: Colors) =>
  StyleSheet.create({
    gradient: {
      borderRadius: borderRadius.xl,
      overflow: 'hidden',
    },
    card: {
      backgroundColor: themeColors.surface,
      borderRadius: borderRadius.xl,
      padding: spacing.lg,
      ...shadow.sm,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: spacing.lg,
    },
    title: {
      fontSize: fontSize.xl,
      fontWeight: fontWeight.semibold,
      color: themeColors.text,
    },
    subtitle: {
      color: themeColors.textSecondary,
      marginTop: spacing.xs,
    },
    shareButton: {
      paddingVertical: spacing.xs,
      paddingHorizontal: spacing.md,
      borderRadius: borderRadius.full,
      backgroundColor: themeColors.surfaceVariant,
    },
    shareText: {
      color: themeColors.text,
      fontSize: fontSize.sm,
    },
    metricsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.md,
    },
    metricBlock: {
      flex: 1,
      alignItems: 'flex-start',
    },
    metricValue: {
      fontSize: fontSize['2xl'],
      fontWeight: fontWeight.bold,
      color: themeColors.text,
    },
    metricLabel: {
      marginTop: spacing.xs,
      color: themeColors.textSecondary,
    },
    metricDivider: {
      width: 1,
      height: 34,
      backgroundColor: themeColors.border,
    },
    insight: {
      marginTop: spacing.lg,
      paddingTop: spacing.sm,
      borderTopWidth: 1,
      borderTopColor: themeColors.border,
    },
    insightText: {
      color: themeColors.text,
    },
  });

