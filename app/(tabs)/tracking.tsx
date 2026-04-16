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
import type { BestDayResult } from '../../lib/topMarkWeekly';

function hashPickIndex(seed: string, modulo: number): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % modulo;
}

function pickConsistencyEncouragement(score: number | null, seed: string): string {
  const h = hashPickIndex(seed, 2);
  if (score == null || Number.isNaN(score)) {
    return h === 0 ? 'Start small — one day at a time.' : 'This is your reset week.';
  }
  if (score >= 0.7) {
    return h === 0
      ? "You're showing up consistently. That's momentum."
      : 'This is how habits lock in.';
  }
  if (score >= 0.4) {
    return h === 0
      ? "You're building rhythm — keep it going."
      : 'A few more days like this and it sticks.';
  }
  return h === 0 ? 'This is your reset week.' : 'Start small — one day at a time.';
}

function streakMotivationLine(days: number, seed: string): string {
  if (days <= 0) return '';
  const h = hashPickIndex(seed, 2);
  if (days >= 7) {
    return h === 0 ? `${days} days — this is real now` : `${days} days — you're in the groove`;
  }
  if (days >= 3) {
    return h === 0 ? `${days} day streak — don't break it` : `${days} days strong — keep the chain`;
  }
  if (days === 1) {
    return h === 0 ? '1 day — every streak starts here' : 'Day one logged. Stack another.';
  }
  return h === 0 ? `${days} day streak — add today` : `${days} days — protect the run`;
}

const SHORT_WEEKDAY_TO_LONG: Record<string, string> = {
  MON: 'Monday',
  TUE: 'Tuesday',
  WED: 'Wednesday',
  THU: 'Thursday',
  FRI: 'Friday',
  SAT: 'Saturday',
  SUN: 'Sunday',
};

function pickBestDayShortLine(best: BestDayResult | null, seed: string): string {
  if (!best || best.expectedUnitsDay <= 0) {
    const h = hashPickIndex(seed, 2);
    return h === 0 ? 'Hit your targets to find your strongest day.' : 'Log a full day on schedule to spot your peak.';
  }
  const day = SHORT_WEEKDAY_TO_LONG[best.dayShortLabel] ?? best.dayShortLabel;
  const h = hashPickIndex(`${seed}\0${best.dateStr}`, 2);
  return h === 0 ? `${day} was strong — repeat that` : `You showed up on ${day}. Do it again.`;
}

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
    const score = picked?.stats?.consistencyScore;
    return {
      name: picked?.name ?? 'No top mark yet',
      color: mark?.color ?? themeColors.primary,
      subtitle: picked?.subtitle ?? 'Start tracking to unlock',
      flavorLine: picked?.flavorLine ?? '',
      consistencyScore: typeof score === 'number' && !Number.isNaN(score) ? score : null,
      markId: picked?.markId ?? null,
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

  const consistencyEncouragement = useMemo(
    () =>
      pickConsistencyEncouragement(
        topMark.consistencyScore,
        `${weekDates[0] ?? ''}\0${topMark.markId ?? 'none'}`,
      ),
    [topMark.consistencyScore, topMark.markId, weekDates],
  );

  const streakLine = useMemo(() => {
    if (!streakHighlight || streakHighlight.currentStreakDays <= 0) return '';
    return streakMotivationLine(
      streakHighlight.currentStreakDays,
      `${weekDates[0] ?? ''}\0${streakHighlight.markId}`,
    );
  }, [streakHighlight, weekDates]);

  const bestDayLine = useMemo(
    () => pickBestDayShortLine(bestDay, `${weekDates[0] ?? ''}\0bestday`),
    [bestDay, weekDates],
  );

  /** Semantic accents: green / warm orange / subtle blue (per card). */
  const streakWarm = themeColors.counter.orange;
  const bestDayAccent = themeColors.counter.blue;

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
                    {dayNum}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>

        <View
          style={[
            styles.card,
            styles.cardHero,
            {
              backgroundColor: themeColors.surface,
              borderLeftWidth: 3,
              borderLeftColor: themeColors.success,
            },
          ]}
        >
          <View style={styles.cardHeaderRow}>
            <View style={[styles.iconBadgeHero, { backgroundColor: applyOpacity(themeColors.success, isDark ? 0.22 : 0.14) }]}>
              <Ionicons name="sync-outline" size={20} color={themeColors.success} />
            </View>
            <Text style={[styles.cardKickerHero, { color: themeColors.success }]}>BEST CONSISTENCY</Text>
          </View>
          <Text style={[styles.heroTitle, { color: themeColors.text }]}>{topMark.name}</Text>
          <Text style={[styles.heroSupport, { color: themeColors.textSecondary }]}>{consistencyEncouragement}</Text>
        </View>

        <View
          style={[
            styles.card,
            styles.cardSecondary,
            {
              backgroundColor: themeColors.surface,
              borderLeftWidth: 3,
              borderLeftColor: streakWarm,
            },
          ]}
        >
          <View style={styles.cardHeaderRow}>
            <View style={[styles.iconBadgeSecondary, { backgroundColor: applyOpacity(streakWarm, isDark ? 0.2 : 0.12) }]}>
              <Ionicons name="flame-outline" size={16} color={streakWarm} />
            </View>
            <Text style={[styles.cardKickerSecondary, { color: streakWarm }]}>STREAK HIGHLIGHT</Text>
          </View>
          {streakHighlight ? (
            streakLine ? (
              <>
                <Text style={[styles.secondaryMainValue, { color: themeColors.text }]}>{streakLine}</Text>
                <Text style={[styles.secondarySupport, { color: themeColors.textSecondary }]}>
                  {streakHighlight.markName}
                </Text>
              </>
            ) : (
              <Text style={[styles.secondaryMainValue, { color: themeColors.text }]}>
                {streakHighlight.markName}
              </Text>
            )
          ) : (
            <Text style={[styles.secondaryMainValueMuted, { color: themeColors.textSecondary }]}>
              Enable streak on a mark to see your run.
            </Text>
          )}
        </View>

        <View
          style={[
            styles.card,
            styles.cardSecondary,
            {
              backgroundColor: themeColors.surface,
              borderLeftWidth: 3,
              borderLeftColor: bestDayAccent,
            },
          ]}
        >
          <View style={styles.cardHeaderRow}>
            <View style={[styles.iconBadgeSecondary, { backgroundColor: applyOpacity(bestDayAccent, isDark ? 0.2 : 0.12) }]}>
              <Ionicons name="flash-outline" size={16} color={bestDayAccent} />
            </View>
            <Text style={[styles.cardKickerSecondary, { color: bestDayAccent }]}>BEST DAY & RHYTHM</Text>
          </View>
          <Text style={[styles.secondaryMainValue, { color: themeColors.text }]}>{bestDayLine}</Text>
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
    fontSize: 12,
    fontWeight: fontWeight.bold,
    letterSpacing: -0.3,
  },
  card: {
    borderRadius: borderRadius.card,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  cardHero: {
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  cardSecondary: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    gap: spacing.xs,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  iconBadgeHero: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBadgeSecondary: {
    width: 28,
    height: 28,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardKickerHero: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    letterSpacing: 1.4,
    flex: 1,
  },
  cardKickerSecondary: {
    fontSize: 10,
    fontWeight: fontWeight.bold,
    letterSpacing: 1.1,
    flex: 1,
  },
  heroTitle: {
    fontSize: 34,
    lineHeight: 40,
    fontWeight: fontWeight.bold,
    letterSpacing: -0.8,
  },
  heroSupport: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    lineHeight: 21,
  },
  secondaryMainValue: {
    fontSize: fontSize.xl,
    lineHeight: 26,
    fontWeight: fontWeight.bold,
    letterSpacing: -0.4,
    marginTop: 2,
  },
  secondaryMainValueMuted: {
    fontSize: fontSize.base,
    lineHeight: 22,
    fontWeight: fontWeight.medium,
    marginTop: 2,
  },
  secondarySupport: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    lineHeight: 19,
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
