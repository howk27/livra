import React, { useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import {
  Moon,
  Pulse,
  Drop,
  Heart,
  Briefcase,
  PencilSimple,
  Shield,
  Users,
  CurrencyDollar,
  CircleIcon,
  Calendar,
  BookOpen,
  EnvelopeSimple,
  type Icon as PhosphorIcon,
} from 'phosphor-react-native';
import { CheckinButton } from './CheckinButton';
import { fonts, motion, radius, spacing, themedColors, categoryAccents, fontSize } from '../../theme/tokens';
import { applyOpacity } from '@/src/components/icons/color';
import { useEffectiveTheme } from '../../state/uiSlice';
import { useMotion } from '../../hooks/useMotion';

export const CATEGORY_MAP: Record<string, { Icon: PhosphorIcon; accent: string }> = {
  Recovery:      { Icon: Moon,           accent: categoryAccents.recovery },
  Fitness:       { Icon: Pulse,          accent: categoryAccents.fitness },
  Health:        { Icon: Drop,           accent: categoryAccents.health },
  Mindset:       { Icon: Heart,          accent: categoryAccents.mindset },
  'Deep Work':   { Icon: Briefcase,      accent: categoryAccents.deepWork },
  Creative:      { Icon: PencilSimple,   accent: categoryAccents.creative },
  Discipline:    { Icon: Shield,         accent: categoryAccents.discipline },
  Relationships: { Icon: Users,          accent: categoryAccents.relationships },
  Finance:       { Icon: CurrencyDollar, accent: categoryAccents.finance },
  email:         { Icon: EnvelopeSimple, accent: categoryAccents.email },
  // Legacy lowercase keys
  sleep:         { Icon: Moon,           accent: categoryAccents.recovery },
  workout:       { Icon: Pulse,          accent: categoryAccents.fitness },
  water:         { Icon: Drop,           accent: categoryAccents.health },
  planning:      { Icon: Calendar,       accent: categoryAccents.planning },
  reading:       { Icon: BookOpen,       accent: categoryAccents.creative },
  work:          { Icon: Briefcase,      accent: categoryAccents.deepWork },
  custom:        { Icon: CircleIcon,     accent: categoryAccents.custom },
};

interface MarkRowProps {
  title: string;
  subtitle?: string;
  category?: string;
  /** Per-mark library icon (QC2-A); falls back to the category icon. */
  icon?: PhosphorIcon | React.ComponentType<any>;
  loggedToday?: boolean;
  done?: boolean;
  onPress?: () => void;
  onLog?: () => void;
  isLast?: boolean;
  showWeeklyCount?: boolean;
  weeklyCount?: number;
  weeklyTarget?: number;
  onLongPress?: () => void;
  testID?: string;
  /** Changes each time the whole day completes; triggers the one-shot row pulse. */
  celebrateStamp?: number;
  /** Row position for the staggered day-complete pulse. */
  celebrateIndex?: number;
}

export function MarkRow({
  title,
  subtitle,
  category,
  icon: iconOverride,
  loggedToday,
  done,
  onPress,
  onLog,
  isLast,
  showWeeklyCount,
  weeklyCount = 0,
  weeklyTarget = 7,
  onLongPress,
  testID,
  celebrateStamp,
  celebrateIndex,
}: MarkRowProps) {
  const theme = useEffectiveTheme();
  const c = themedColors(theme);
  const { reduced } = useMotion();
  const catKey = category ?? 'custom';
  const catData = CATEGORY_MAP[catKey] ?? CATEGORY_MAP.custom;
  const accent = catData.accent;
  const CatIcon = iconOverride ?? catData.Icon;

  const celebrateOpacity = useSharedValue(0);
  useEffect(() => {
    if (!celebrateStamp || reduced) return;
    const delay = (celebrateIndex ?? 0) * 60;
    celebrateOpacity.value = withDelay(
      delay,
      withSequence(
        withTiming(0.1, { duration: motion.standard }),
        withTiming(0, { duration: motion.gentle }),
      ),
    );
  }, [celebrateStamp, celebrateIndex, reduced, celebrateOpacity]);

  const celebrateStyle = useAnimatedStyle(() => ({ opacity: celebrateOpacity.value }));

  const handleLog = useCallback(() => {
    if (!loggedToday && onLog) {
      onLog();
    }
  }, [loggedToday, onLog]);

  return (
    <TouchableOpacity
      testID={testID}
      style={[styles.row, !isLast && [styles.border, { borderBottomColor: c.borderLight }]]}
      onPress={onPress}
      onLongPress={onLongPress}
      activeOpacity={onPress ? 0.7 : 1}
      accessibilityState={done ? { checked: true } : undefined}
    >
      {/* Day-complete celebration pulse */}
      {celebrateStamp ? (
        <Animated.View
          testID="markrow-celebrate-overlay"
          pointerEvents="none"
          style={[
            { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: accent },
            celebrateStyle,
          ]}
        />
      ) : null}

      {/* Left accent bar */}
      <View style={[styles.accentBar, { backgroundColor: accent }]} />

      {/* Icon tile */}
      <View
        style={[
          styles.iconTile,
          { backgroundColor: applyOpacity(accent, 0.12) },
        ]}
      >
        <CatIcon size={18} color={accent} weight="duotone" />
      </View>

      {/* Center */}
      <View style={styles.center}>
        <Text style={[styles.title, { color: c.inkDark }, done && styles.titleDone]}>{title}</Text>
        {subtitle ? <Text style={[styles.subtitle, { color: c.inkMuted }]}>{subtitle}</Text> : null}
        {showWeeklyCount && weeklyTarget > 0 && (
          <View style={styles.progressTrackWrap}>
            <View style={[styles.progressTrack, { backgroundColor: c.borderLight }]}>
              <View
                style={[
                  styles.progressFill,
                  { backgroundColor: c.forest, width: `${Math.min(100, (weeklyCount / weeklyTarget) * 100)}%` },
                ]}
              />
            </View>
          </View>
        )}
      </View>

      {/* Right: one-tap check-in. Weekly progress lives in the bar under the
          title, so the count needs no numeric duplicate here. Checked/disabled
          follow loggedToday only — a met weekly target must not block today's log. */}
      <View style={styles.right}>
        <CheckinButton
          checked={loggedToday ?? false}
          onCheckin={handleLog}
          disabled={loggedToday || !onLog}
          accent={accent}
          testID={testID ? `${testID}-checkin` : undefined}
        />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  border: {
    borderBottomWidth: 1,
  },
  accentBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    borderTopRightRadius: 2,
    borderBottomRightRadius: 2,
  },
  iconTile: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: { flex: 1 },
  title: {
    fontFamily: fonts.sansMedium,
    fontSize: fontSize.md,
  },
  titleDone: {
    textDecorationLine: 'line-through',
  },
  subtitle: {
    fontFamily: fonts.sans,
    fontSize: fontSize.sm,
    marginTop: 2,
  },
  right: { alignItems: 'flex-end', justifyContent: 'center' },
  progressTrackWrap: { marginTop: spacing.xs },
  progressTrack: {
    height: 2,
    borderRadius: 1,
    overflow: 'hidden',
    width: '100%',
  },
  progressFill: {
    height: 2,
    borderRadius: 1,
  },
});
