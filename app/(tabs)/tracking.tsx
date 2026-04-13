import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { spacing, borderRadius, fontSize, fontWeight } from '../../theme/tokens';
import { useEffectiveTheme } from '../../state/uiSlice';
import { useCounters } from '../../hooks/useCounters';
import { useEventsStore } from '../../state/eventsSlice';
import { applyOpacity } from '@/src/components/icons/color';
import { getAppDate } from '../../lib/appDate';
import { formatDate } from '../../lib/date';
import { useAppDateStore } from '../../state/appDateSlice';
import {
  pickTopMarkForWeek,
  pickStreakHighlightForWeek,
  pickBestDayForWeek,
} from '../../lib/topMarkWeekly';

function toLocalDateStr(d: Date): string {
  return formatDate(d);
}

function getWeekDatesMondayFirst(anchor: Date): string[] {
  const today = anchor;
  const mondayOffset = (today.getDay() + 6) % 7;
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - mondayOffset + i);
    return toLocalDateStr(d);
  });
}

function ordinalDay(n: number): string {
  const j = n % 10;
  const k = n % 100;
  if (j === 1 && k !== 11) return `${n}st`;
  if (j === 2 && k !== 12) return `${n}nd`;
  if (j === 3 && k !== 13) return `${n}rd`;
  return `${n}th`;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const CAL_DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const DAY_LABELS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

/** Returns a 2D array of date strings (or null for empty cells), week rows Mon-Sun. */
function buildMonthCalendar(year: number, month: number): (string | null)[][] {
  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  // Monday-first: Mon=0 … Sun=6
  const startOffset = (firstDay.getDay() + 6) % 7;

  const weeks: (string | null)[][] = [];
  let week: (string | null)[] = Array(startOffset).fill(null);

  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month, d);
    week.push(toLocalDateStr(date));
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
  }
  if (week.length > 0) {
    while (week.length < 7) week.push(null);
    weeks.push(week);
  }
  return weeks;
}

const CELL_SIZE = Math.floor((Dimensions.get('window').width - 32 - 32 - 6 * 6) / 7); // card padding + gaps

export default function TrackingScreen() {
  const theme = useEffectiveTheme();
  const themeColors = colors[theme];
  const isDark = theme === 'dark';
  const appDateKey = useAppDateStore((s) => s.debugDateOverride ?? '');
  const { counters } = useCounters();
  const allEvents = useEventsStore(s => s.events);

  // ── Month navigation ─────────────────────────────────────────────
  const today = useMemo(() => getAppDate(), [appDateKey]);
  const [calYear, setCalYear] = useState(today.getFullYear());
  const [calMonth, setCalMonth] = useState(today.getMonth());

  const isCurrentMonth = calYear === today.getFullYear() && calMonth === today.getMonth();

  /** Keep activity calendar aligned with app “today” when dev date override changes. */
  useEffect(() => {
    const t = getAppDate();
    setCalYear(t.getFullYear());
    setCalMonth(t.getMonth());
  }, [appDateKey]);

  const goToPrevMonth = () => {
    if (calMonth === 0) { setCalYear(y => y - 1); setCalMonth(11); }
    else setCalMonth(m => m - 1);
  };
  const goToNextMonth = () => {
    if (isCurrentMonth) return;
    if (calMonth === 11) { setCalYear(y => y + 1); setCalMonth(0); }
    else setCalMonth(m => m + 1);
  };

  const weekDates = useMemo(() => getWeekDatesMondayFirst(getAppDate()), [appDateKey]);

  const weekEvents = useMemo(
    () =>
      allEvents.filter(
        e =>
          !e.deleted_at &&
          e.event_type === 'increment' &&
          e.occurred_local_date >= weekDates[0] &&
          e.occurred_local_date <= weekDates[6],
      ),
    [allEvents, weekDates],
  );

  const dayTotals = useMemo(() => {
    const map = new Map<string, number>();
    weekEvents.forEach(e => {
      map.set(e.occurred_local_date, (map.get(e.occurred_local_date) ?? 0) + (e.amount ?? 1));
    });
    return map;
  }, [weekEvents]);

  const activeDaysCount = useMemo(
    () => weekDates.filter(d => (dayTotals.get(d) ?? 0) > 0).length,
    [weekDates, dayTotals],
  );

  const todayStr = useMemo(() => toLocalDateStr(getAppDate()), [appDateKey]);

  const topMark = useMemo(() => {
    const picked = pickTopMarkForWeek({
      weekDates,
      todayLocalDate: todayStr,
      weekEvents,
      counters,
    });
    const mark = picked ? counters.find(c => c.id === picked.markId) : undefined;
    return {
      name: picked?.name ?? 'No top mark yet',
      color: mark?.color ?? themeColors.primary,
      subtitle: picked?.subtitle ?? 'Start tracking to unlock',
      flavorLine: picked?.flavorLine ?? '',
    };
  }, [weekEvents, counters, themeColors.primary, weekDates, todayStr]);

  const streakHighlight = useMemo(
    () =>
      pickStreakHighlightForWeek({
        weekDates,
        todayLocalDate: todayStr,
        weekEvents,
        counters,
        allEvents,
      }),
    [weekDates, todayStr, weekEvents, counters, allEvents],
  );

  const bestDay = useMemo(
    () =>
      pickBestDayForWeek({
        weekDates,
        todayLocalDate: todayStr,
        weekEvents,
        counters,
      }),
    [weekDates, todayStr, weekEvents, counters],
  );

  /** All dates that have at least one increment event (any time). */
  const activeDatesAll = useMemo(() => {
    const set = new Set<string>();
    allEvents.forEach(e => {
      if (!e.deleted_at && e.event_type === 'increment') set.add(e.occurred_local_date);
    });
    return set;
  }, [allEvents]);

  /** Calendar weeks for the currently selected month. */
  const calendarWeeks = useMemo(
    () => buildMonthCalendar(calYear, calMonth),
    [calYear, calMonth],
  );

  const bestDayLine = useMemo(() => {
    if (bestDay && bestDay.expectedUnitsDay > 0) {
      return `${bestDay.dayShortLabel} was your standout—carry that energy into next week.`;
    }
    if (activeDaysCount >= 5) return 'Strong week—your rhythm is adding up.';
    if (activeDaysCount >= 3) return 'You are stacking good days; keep the pace.';
    if (activeDaysCount >= 1) return 'One real day of effort still counts—build on it.';
    return 'Pick one mark for today and start a streak you can feel.';
  }, [bestDay, activeDaysCount]);

  const consistencyLine = useMemo(() => {
    const line = topMark.flavorLine.trim();
    if (line) return line;
    return 'Log a few marks this week to see who led the rhythm.';
  }, [topMark.flavorLine]);

  const headline = useMemo(() => {
    if (activeDaysCount >= 5) return 'Your momentum is building.';
    if (activeDaysCount >= 3) return 'Your rhythm is improving.';
    return 'Your next streak starts now.';
  }, [activeDaysCount]);

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: themeColors.background }]} edges={['top']}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: spacing['5xl'] + spacing['4xl'] + spacing.lg },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.weekKicker, { color: themeColors.success }]}>
          WEEK {activeDaysCount}/7 COMPLETE
        </Text>
        <Text style={[styles.headline, { color: themeColors.text }]}>{headline}</Text>
        <Text style={[styles.subline, { color: themeColors.textSecondary }]}>
          You showed up{' '}
          <Text style={[styles.sublineStrong, { color: themeColors.text }]}>{activeDaysCount} out of 7</Text>{' '}
          days. Your effort is shaping a new rhythm.
        </Text>

        <View style={styles.weekRow}>
          {weekDates.map((date, i) => {
            const active = (dayTotals.get(date) ?? 0) > 0;
            const isTodayCell = date === todayStr;
            const dayNum = parseInt(date.slice(8), 10);
            return (
              <View key={date} style={styles.dayCell}>
                <Text style={[styles.dayLabel, { color: themeColors.textTertiary }]}>{DAY_LABELS[i]}</Text>
                <View
                  style={[
                    styles.dayPill,
                    {
                      backgroundColor: active
                        ? applyOpacity(themeColors.success, isDark ? 0.95 : 0.90)
                        : themeColors.surfaceVariant,
                      borderColor: active
                        ? applyOpacity(themeColors.success, isDark ? 1 : 0.95)
                        : applyOpacity(themeColors.border, isDark ? 0.4 : 0.95),
                      ...(isTodayCell
                        ? {
                            borderWidth: 1.5,
                            borderColor: isDark ? themeColors.textSecondary : themeColors.textTertiary,
                          }
                        : {}),
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.dayPillOrdinal,
                      {
                        color: active
                          ? isDark
                            ? themeColors.text
                            : themeColors.surface
                          : themeColors.textSecondary,
                      },
                    ]}
                  >
                    {ordinalDay(dayNum)}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>

        <View style={[styles.card, { backgroundColor: themeColors.surface }]}>
          <Text style={[styles.cardKicker, { color: topMark.color }]}>BEST CONSISTENCY</Text>
          <Text style={[styles.cardTitle, { color: themeColors.text }]}>{topMark.name}</Text>
          <Text style={[styles.cardOneLiner, { color: themeColors.textSecondary }]}>{consistencyLine}</Text>
        </View>

        <View style={[styles.card, { backgroundColor: themeColors.surface }]}>
          <Text style={[styles.cardKicker, { color: themeColors.accent.primary }]}>STREAK HIGHLIGHT</Text>
          <Text style={[styles.cardTitle, { color: themeColors.text }]}>
            {streakHighlight ? streakHighlight.markName : '—'}
          </Text>
        </View>

        <View style={[styles.card, { backgroundColor: themeColors.surface }]}>
          <Text style={[styles.cardKicker, { color: themeColors.textTertiary }]}>BEST DAY & RHYTHM</Text>
          <Text style={[styles.cardOneLinerStrong, { color: themeColors.text }]}>{bestDayLine}</Text>
        </View>

        {/* ── Monthly activity calendar ─────────────────────────── */}
        <View style={[styles.card, styles.activityCard, { backgroundColor: themeColors.surface }]}>
          {/* Header row: kicker + month navigator */}
          <View style={styles.calHeader}>
            <Text style={[styles.cardKicker, { color: themeColors.textTertiary }]}>ACTIVITY</Text>
            <View style={styles.calNav}>
              <TouchableOpacity onPress={goToPrevMonth} style={styles.calNavBtn} hitSlop={8}>
                <Ionicons name="chevron-back" size={18} color={themeColors.textSecondary} />
              </TouchableOpacity>
              <Text style={[styles.calMonthLabel, { color: themeColors.text }]}>
                {MONTH_NAMES[calMonth]} {calYear}
              </Text>
              <TouchableOpacity
                onPress={goToNextMonth}
                style={[styles.calNavBtn, isCurrentMonth && styles.calNavBtnDisabled]}
                hitSlop={8}
                disabled={isCurrentMonth}
              >
                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color={isCurrentMonth ? applyOpacity(themeColors.textSecondary, 0.35) : themeColors.textSecondary}
                />
              </TouchableOpacity>
            </View>
          </View>

          {/* Day-of-week headers */}
          <View style={styles.calDayRow}>
            {CAL_DAY_LABELS.map((lbl, i) => (
              <View key={i} style={[styles.calCell, { width: CELL_SIZE }]}>
                <Text style={[styles.calDayLabel, { color: themeColors.textTertiary }]}>{lbl}</Text>
              </View>
            ))}
          </View>

          {/* Calendar weeks */}
          {calendarWeeks.map((week, wi) => (
            <View key={wi} style={styles.calDayRow}>
              {week.map((dateStr, di) => {
                if (!dateStr) {
                  return <View key={di} style={[styles.calCell, { width: CELL_SIZE }]} />;
                }
                const active = activeDatesAll.has(dateStr);
                const isToday = dateStr === todayStr;
                const isFuture = dateStr > todayStr;
                const dayNum = parseInt(dateStr.slice(8), 10);
                return (
                  <View key={di} style={[styles.calCell, { width: CELL_SIZE }]}>
                    <View
                      style={[
                        styles.calDayCell,
                        { width: CELL_SIZE, height: CELL_SIZE },
                        active && !isFuture && {
                          backgroundColor: applyOpacity(themeColors.success, isDark ? 0.82 : 0.72),
                        },
                        !active && !isFuture && {
                          backgroundColor: applyOpacity(themeColors.border, isDark ? 0.22 : 0.40),
                        },
                        isFuture && { backgroundColor: 'transparent' },
                        isToday && {
                          borderWidth: 1.5,
                          borderColor: isDark ? themeColors.textSecondary : themeColors.textTertiary,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.calDayNum,
                          {
                            color: active && !isFuture
                              ? (isDark ? themeColors.text : themeColors.surface)
                              : isFuture
                                ? applyOpacity(themeColors.textTertiary, 0.35)
                                : themeColors.textTertiary,
                          },
                        ]}
                      >
                        {dayNum}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    gap: spacing.md,
  },
  weekKicker: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    letterSpacing: 2,
    marginTop: spacing.xs,
  },
  headline: {
    fontSize: 38,
    lineHeight: 44,
    fontWeight: fontWeight.bold,
    letterSpacing: -1.0,
  },
  subline: {
    fontSize: fontSize.base,
    lineHeight: 24,
  },
  sublineStrong: {
    fontWeight: fontWeight.bold,
  },
  weekRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
    marginBottom: spacing.xs,
  },
  dayCell: {
    alignItems: 'center',
    gap: spacing.xs,
    flex: 1,
  },
  dayLabel: {
    fontSize: 10,
    fontWeight: fontWeight.semibold,
    letterSpacing: 0.8,
  },
  dayPill: {
    width: '100%',
    maxWidth: 44,
    minHeight: 52,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xs,
  },
  dayPillOrdinal: {
    fontSize: 11,
    fontWeight: fontWeight.bold,
    letterSpacing: -0.2,
  },
  card: {
    borderRadius: borderRadius.card,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  /** Extra space below the calendar + clearance above the tab bar when scrolled to end */
  activityCard: {
    paddingBottom: spacing.xl,
    marginBottom: spacing.md,
  },
  cardKicker: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    letterSpacing: 1.2,
  },
  cardTitle: {
    fontSize: 30,
    lineHeight: 34,
    fontWeight: fontWeight.bold,
    letterSpacing: -0.6,
  },
  cardOneLiner: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    lineHeight: 20,
    marginTop: 2,
  },
  cardOneLinerStrong: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    lineHeight: 22,
    marginTop: 2,
  },
  // ── Monthly calendar styles ──────────────────────────────────────
  calHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  calNav: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  calNavBtn: {
    padding: 4,
  },
  calNavBtnDisabled: {
    opacity: 0.4,
  },
  calMonthLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    minWidth: 110,
    textAlign: 'center',
  },
  calDayRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 4,
  },
  calCell: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  calDayLabel: {
    fontSize: 10,
    fontWeight: fontWeight.semibold,
    letterSpacing: 0.4,
    textAlign: 'center',
  },
  calDayCell: {
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calDayNum: {
    fontSize: 11,
    fontWeight: fontWeight.medium,
    textAlign: 'center',
  },
});
