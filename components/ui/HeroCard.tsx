import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { IconProps } from 'phosphor-react-native';
import { SectionLabel } from './SectionLabel';
import { fonts, radius, spacing, shadow, themedColors, fontSize } from '../../theme/tokens';
import { useEffectiveTheme } from '../../state/uiSlice';

interface HeroCardProps {
  variant: 'dark' | 'light';
  missionLabel?: string;
  title: string;
  description?: string;
  progress?: number; // 0-1
  progressLabel?: string;
  icon?: React.ComponentType<IconProps>;
  children?: React.ReactNode;
  style?: object;
}

export function HeroCard({
  variant,
  missionLabel = 'CURRENT MISSION',
  title,
  description,
  progress,
  progressLabel,
  icon: Icon,
  children,
  style,
}: HeroCardProps) {
  const theme = useEffectiveTheme();
  const colors = themedColors(theme);
  const isDark = variant === 'dark';
  const bg = isDark ? colors.forest : colors.surface;
  const titleColor = isDark ? colors.inkInverse : colors.inkDark;
  const descColor = isDark ? colors.inkInverseMuted : colors.inkMid;
  const labelColor = isDark ? colors.inkInverseMuted : colors.inkMuted;
  const progressTrackColor = isDark ? 'rgba(200,221,216,0.3)' : colors.borderLight;
  const progressFillColor = isDark ? colors.mint : colors.forest;

  return (
    <View style={[styles.card, { backgroundColor: bg }, style]}>
      <View style={styles.topRow}>
        <SectionLabel color={labelColor}>{missionLabel}</SectionLabel>
        {Icon && (
          <View style={[styles.iconPill, { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : colors.surfaceAlt }]}>
            <Icon size={16} color={isDark ? colors.inkInverse : colors.inkMid} weight="regular" />
          </View>
        )}
      </View>

      <Text style={[styles.title, { color: titleColor }]} numberOfLines={2}>
        {title}
      </Text>

      {description ? (
        <Text style={[styles.description, { color: descColor }]} numberOfLines={2}>
          {description}
        </Text>
      ) : null}

      {typeof progress === 'number' && (
        <View style={styles.progressSection}>
          <View style={styles.progressRow}>
            <SectionLabel color={labelColor}>PROGRESS</SectionLabel>
            {progressLabel && (
              <Text style={[styles.progressPct, { color: titleColor }]}>{progressLabel}</Text>
            )}
          </View>
          <View style={[styles.progressTrack, { backgroundColor: progressTrackColor }]}>
            <View
              style={[
                styles.progressFill,
                { backgroundColor: progressFillColor, width: `${Math.min(100, progress * 100)}%` },
              ]}
            />
          </View>
        </View>
      )}

      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.xl,
    padding: spacing.lg,
    ...shadow.card,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  iconPill: {
    borderRadius: radius.full,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  title: {
    fontFamily: fonts.serif,
    fontSize: fontSize['4xl'],
    lineHeight: 40,
    marginTop: spacing.sm,
  },
  description: {
    fontFamily: fonts.sans,
    fontSize: fontSize.md,
    marginTop: spacing.xs,
  },
  progressSection: {
    marginTop: spacing.lg,
  },
  progressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  progressPct: {
    fontFamily: fonts.sansSemibold,
    fontSize: fontSize.base,
  },
  progressTrack: {
    height: 3,
    borderRadius: 2,
    marginTop: spacing.xs,
    overflow: 'hidden',
  },
  progressFill: {
    height: 3,
    borderRadius: 2,
  },
});
