import React, { useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
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
  type Icon as PhosphorIcon,
} from 'phosphor-react-native';
import { CheckinButton } from './CheckinButton';
import { fonts, radius, spacing, themedColors } from '../../theme/tokens';
import { useEffectiveTheme } from '../../state/uiSlice';

export const CATEGORY_MAP: Record<string, { Icon: PhosphorIcon; accent: string }> = {
  Recovery:      { Icon: Moon,           accent: '#6B8FA6' },
  Fitness:       { Icon: Pulse,          accent: '#A0614A' },
  Health:        { Icon: Drop,           accent: '#4A8C7A' },
  Mindset:       { Icon: Heart,          accent: '#8A6B7B' },
  'Deep Work':   { Icon: Briefcase,      accent: '#4A6A8C' },
  Creative:      { Icon: PencilSimple,   accent: '#7A4A8C' },
  Discipline:    { Icon: Shield,         accent: '#8A7E6B' },
  Relationships: { Icon: Users,          accent: '#9E7B6B' },
  Finance:       { Icon: CurrencyDollar, accent: '#9E8A6B' },
  // Legacy lowercase keys
  sleep:         { Icon: Moon,           accent: '#6B8FA6' },
  workout:       { Icon: Pulse,          accent: '#A0614A' },
  water:         { Icon: Drop,           accent: '#4A8C7A' },
  planning:      { Icon: Calendar,       accent: '#8C7A3A' },
  reading:       { Icon: BookOpen,       accent: '#7A4A8C' },
  work:          { Icon: Briefcase,      accent: '#4A6A8C' },
  custom:        { Icon: CircleIcon,      accent: '#6B7A6B' },
};

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

interface MarkRowProps {
  title: string;
  subtitle?: string;
  category?: string;
  icon?: PhosphorIcon;
  loggedToday?: boolean;
  onPress?: () => void;
  onLog?: () => void;
  isLast?: boolean;
  showWeeklyCount?: boolean;
  weeklyCount?: number;
  weeklyTarget?: number;
}

export function MarkRow({
  title,
  subtitle,
  category,
  icon: iconOverride,
  loggedToday,
  onPress,
  onLog,
  isLast,
  showWeeklyCount,
  weeklyCount = 0,
  weeklyTarget = 7,
}: MarkRowProps) {
  const theme = useEffectiveTheme();
  const c = themedColors(theme);
  const catKey = category ?? 'custom';
  const catData = CATEGORY_MAP[catKey] ?? CATEGORY_MAP.custom;
  const accent = catData.accent;
  const CatIcon = iconOverride ?? catData.Icon;

  const handleLog = useCallback(() => {
    if (!loggedToday && onLog) {
      onLog();
    }
  }, [loggedToday, onLog]);

  return (
    <TouchableOpacity
      style={[styles.row, !isLast && [styles.border, { borderBottomColor: c.borderLight }]]}
      onPress={onPress}
      activeOpacity={onPress ? 0.7 : 1}
    >
      {/* Left accent bar */}
      <View style={[styles.accentBar, { backgroundColor: accent }]} />

      {/* Icon tile */}
      <View
        style={[
          styles.iconTile,
          { backgroundColor: hexToRgba(accent, 0.12) },
        ]}
      >
        <CatIcon size={18} color={accent} weight="duotone" />
      </View>

      {/* Center */}
      <View style={styles.center}>
        <Text style={[styles.title, { color: c.inkDark }]}>{title}</Text>
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

      {/* Right: log circle or weekly count */}
      <View style={styles.right}>
        {showWeeklyCount ? (
          <Text style={[styles.count, { color: c.inkDark }]}>{weeklyCount}</Text>
        ) : (
          <CheckinButton
            checked={loggedToday ?? false}
            onCheckin={handleLog}
            disabled={loggedToday || !onLog}
          />
        )}
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
    fontSize: 15,
  },
  subtitle: {
    fontFamily: fonts.sans,
    fontSize: 12,
    marginTop: 2,
  },
  right: { alignItems: 'flex-end', justifyContent: 'center' },
  count: {
    fontFamily: fonts.sansSemibold,
    fontSize: 16,
  },
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
