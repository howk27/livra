/**
 * WeeklySummaryStrip — Livra 2.0
 * Week arc copy from lib/copy.ts. Tappable → tracking screen.
 */
import React, { useMemo } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useEffectiveTheme } from '../state/uiSlice';
import { colors } from '../theme/colors';
import { spacing, borderRadius, fontWeight, fontSize } from '../theme/tokens';
import { useEventsStore } from '../state/eventsSlice';
import { getAppDate } from '../lib/appDate';
import { useAppDateStore } from '../state/appDateSlice';
import { formatDate } from '../lib/date';
import { subDays } from 'date-fns';
import { getWeekArc } from '../lib/copy';
import { AppText } from './Typography';

function getWeekDates(anchor: Date): string[] {
  const dayOfWeek = anchor.getDay();
  const monday = new Date(anchor);
  monday.setDate(anchor.getDate() - ((dayOfWeek + 6) % 7));
  monday.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return formatDate(d);
  });
}

interface WeeklySummaryStripProps {
  onPress: () => void;
  incompleteMarksToday?: number;
  hasPartialProgressToday?: boolean;
}

export const WeeklySummaryStrip: React.FC<WeeklySummaryStripProps> = ({ onPress }) => {
  const theme = useEffectiveTheme();
  const themeColors = colors[theme];
  const isDark = theme === 'dark';
  const appDateKey = useAppDateStore((s) => s.debugDateOverride ?? '');
  const allEvents = useEventsStore(s => s.events);
  const now = getAppDate();

  const { weekLoggedDays, isPerfectWeekSoFar } = useMemo(() => {
    const dates = getWeekDates(now);
    const todayIndex = ((now.getDay() + 6) % 7); // Mon=0
    const activeDatesSet = new Set<string>();
    allEvents.forEach(e => {
      if (e.deleted_at || e.event_type !== 'increment') return;
      if (dates.includes(e.occurred_local_date)) activeDatesSet.add(e.occurred_local_date);
    });
    const weekLoggedDays = activeDatesSet.size;
    // Perfect so far: every day from Mon up to today has activity
    const daysToCheck = dates.slice(0, todayIndex + 1);
    const isPerfectWeekSoFar = daysToCheck.length > 0 && daysToCheck.every(d => activeDatesSet.has(d));
    return { weekLoggedDays, isPerfectWeekSoFar };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allEvents, appDateKey]);

  const message = getWeekArc({ now, weekLoggedDays, isPerfectWeekSoFar });
  const accentColor = weekLoggedDays >= 5 ? themeColors.accent.primary : themeColors.textTertiary;

  return (
    <TouchableOpacity
      style={[
        styles.container,
        {
          backgroundColor: 'transparent',
          borderColor: isDark ? 'rgba(255,255,255,0.08)' : applyOpacity(themeColors.border, 0.5),
        },
      ]}
      onPress={onPress}
      activeOpacity={0.70}
    >
      <View style={styles.row}>
        <AppText style={[styles.message, { color: themeColors.textSecondary }]}>
          {message}
        </AppText>
        <Ionicons name="chevron-forward-outline" size={13} color={accentColor} />
      </View>
    </TouchableOpacity>
  );
};

function applyOpacity(hex: string, opacity: number): string {
  const alpha = Math.round(opacity * 255).toString(16).padStart(2, '0');
  return hex.replace('#', '#') + alpha;
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    marginTop: spacing.xxs,
    borderRadius: borderRadius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    minHeight: 36,
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  message: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
    letterSpacing: 0.1,
    flex: 1,
  },
});
