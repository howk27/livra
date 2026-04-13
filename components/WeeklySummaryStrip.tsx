import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useEffectiveTheme } from '../state/uiSlice';
import { colors } from '../theme/colors';
import { spacing, borderRadius, fontWeight } from '../theme/tokens';
import { useEventsStore } from '../state/eventsSlice';
import { getAppDate } from '../lib/appDate';
import { useAppDateStore } from '../state/appDateSlice';

function getWeekDates(anchor: Date): string[] {
  const today = anchor;
  const dayOfWeek = today.getDay();
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((dayOfWeek + 6) % 7));
  monday.setHours(0, 0, 0, 0);
  const dates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    dates.push(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
    );
  }
  return dates;
}

function getWeeklyMessage(activeDays: number): string {
  if (activeDays >= 7) return 'perfect week locked in';
  if (activeDays >= 5) return "don't break the streak";
  if (activeDays >= 3) return 'building momentum';
  if (activeDays >= 1) return 'keep the week alive';
  return 'start strong';
}

interface WeeklySummaryStripProps {
  onPress: () => void;
  /** Marks not yet completed today (0 = all done) */
  incompleteMarksToday?: number;
  /** Any mark has progress but is not complete */
  hasPartialProgressToday?: boolean;
}

export const WeeklySummaryStrip: React.FC<WeeklySummaryStripProps> = ({
  onPress,
  incompleteMarksToday,
  hasPartialProgressToday,
}) => {
  const theme = useEffectiveTheme();
  const themeColors = colors[theme];
  const isDark = theme === 'dark';
  const appDateKey = useAppDateStore((s) => s.debugDateOverride ?? '');
  const allEvents = useEventsStore(s => s.events);

  const activeDays = useMemo(() => {
    const dates = getWeekDates(getAppDate());
    const activeDatesSet = new Set<string>();
    allEvents.forEach(e => {
      if (e.deleted_at) return;
      if (e.event_type !== 'increment') return;
      if (dates.includes(e.occurred_local_date)) {
        activeDatesSet.add(e.occurred_local_date);
      }
    });
    return activeDatesSet.size;
  }, [allEvents, appDateKey]);

  let message = `${activeDays}/7 - ${getWeeklyMessage(activeDays)}`;
  if (
    typeof incompleteMarksToday === 'number' &&
    incompleteMarksToday === 1 &&
    hasPartialProgressToday
  ) {
    message = `${activeDays}/7 - one more to close today`;
  } else if (
    typeof incompleteMarksToday === 'number' &&
    incompleteMarksToday >= 2 &&
    hasPartialProgressToday
  ) {
    message = `${activeDays}/7 - finish today's marks`;
  }
  const ctaAccent = activeDays >= 5 ? themeColors.accent.primary : themeColors.counter.teal;

  return (
    <TouchableOpacity
      style={[
        styles.container,
        {
          backgroundColor: themeColors.surfaceVariant,
          borderColor: isDark ? 'rgba(255,255,255,0.10)' : themeColors.border,
        },
      ]}
      onPress={onPress}
      activeOpacity={0.78}
    >
      <View style={styles.row}>
        <Text style={[styles.title, { color: themeColors.textSecondary }]}>
          <Text style={{ color: ctaAccent, fontWeight: fontWeight.semibold }}>{message.split(' - ')[0]}</Text>
          <Text style={{ color: themeColors.text }}> - {message.split(' - ')[1]}</Text>
        </Text>
        <View style={styles.ctaRow}>
          <Text style={[styles.ctaText, { color: ctaAccent }]}>Review</Text>
          <Ionicons name="chevron-forward-outline" size={14} color={ctaAccent} />
        </View>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    marginTop: spacing.xs,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    minHeight: 44,
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  title: {
    fontSize: 12,
    flex: 1,
    lineHeight: 16,
  },
  ctaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
    paddingLeft: spacing.xs,
  },
  ctaText: {
    fontSize: 12,
    fontWeight: fontWeight.semibold,
    letterSpacing: 0.2,
  },
});
