/**
 * Tracking screen — Livra 2.0 Layer 4.
 * Calendar heatmap hero + week sentiment header + streak timeline + insight line.
 */
import React, { useMemo, useState } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../../theme/colors';
import { spacing, fontSize, borderRadius, fontWeight } from '../../theme/tokens';
import { useEffectiveTheme } from '../../state/uiSlice';
import { useCounters } from '../../hooks/useCounters';
import { useEventsStore } from '../../state/eventsSlice';
import { GradientBackground } from '../../components/GradientBackground';
import { LoadingScreen } from '../../components/LoadingScreen';
import { AppText } from '../../components/Typography';
import { formatDate } from '../../lib/date';
import { subDays } from 'date-fns';
import { computeStreak } from '../../hooks/useStreaks';
import { getAppDate } from '../../lib/appDate';
import { useAppDateStore } from '../../state/appDateSlice';
import { CalendarHeatmap } from '../../components/CalendarHeatmap';
import { StreakTimeline, type StreakRecord } from '../../components/StreakTimeline';
import { getWeekSentimentHeader } from '../../lib/copy';
import { getWeeklyInsight } from '../../lib/insights';
import { applyOpacity } from '@/src/components/icons/color';

export default function StatsScreen() {
  const theme = useEffectiveTheme();
  const themeColors = colors[theme];
  const isDark = theme === 'dark';
  const appDateKey = useAppDateStore(s => s.debugDateOverride ?? '');
  const { counters, loading } = useCounters();
  const allEvents = useEventsStore(s => s.events);

  const activeCounters = useMemo(() => counters.filter(c => !c.deleted_at), [counters]);
  const today = getAppDate();
  const totalMarks = activeCounters.length;

  // ── Week stats ─────────────────────────────────────────────────────────
  const { weekLoggedDays, isAfterComeback } = useMemo(() => {
    const dow = today.getDay();
    const monday = new Date(today);
    monday.setDate(today.getDate() - ((dow + 6) % 7));
    monday.setHours(0, 0, 0, 0);
    const dates = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday); d.setDate(monday.getDate() + i); return formatDate(d);
    });
    const active = new Set(
      allEvents.filter(e => !e.deleted_at && e.event_type === 'increment' && dates.includes(e.occurred_local_date))
        .map(e => e.occurred_local_date),
    );
    // Coming back after a gap: previous week had 0 but this week already has logs
    const prevWeekDates = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday); d.setDate(monday.getDate() - 7 + i); return formatDate(d);
    });
    const prevActive = new Set(
      allEvents.filter(e => !e.deleted_at && e.event_type === 'increment' && prevWeekDates.includes(e.occurred_local_date))
        .map(e => e.occurred_local_date),
    );
    const isAfterComeback = active.size > 0 && prevActive.size === 0;
    return { weekLoggedDays: active.size, isAfterComeback };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allEvents, appDateKey]);

  // ── Calendar heatmap data ──────────────────────────────────────────────
  const logsByDate = useMemo(() => {
    const map: Record<string, number> = {};
    allEvents.forEach(e => {
      if (e.deleted_at || e.event_type !== 'increment') return;
      const key = e.occurred_local_date;
      map[key] = (map[key] ?? 0) + 1;
    });
    return map;
  }, [allEvents]);

  // ── Streak timeline ────────────────────────────────────────────────────
  const streakRecords = useMemo((): StreakRecord[] => {
    const allDates = [...new Set(
      allEvents.filter(e => !e.deleted_at && e.event_type === 'increment').map(e => e.occurred_local_date),
    )].sort();

    if (allDates.length === 0) return [];

    const records: StreakRecord[] = [];
    let start = allDates[0];
    let end   = allDates[0];

    for (let i = 1; i < allDates.length; i++) {
      const prev = new Date(allDates[i - 1] + 'T00:00:00');
      const curr = new Date(allDates[i]     + 'T00:00:00');
      const gap  = (curr.getTime() - prev.getTime()) / 86400000;
      if (gap === 1) {
        end = allDates[i];
      } else {
        const len = Math.round((new Date(end + 'T00:00:00').getTime() - new Date(start + 'T00:00:00').getTime()) / 86400000) + 1;
        records.push({ startDate: start, endDate: end, length: len });
        start = allDates[i];
        end   = allDates[i];
      }
    }
    const len = Math.round((new Date(end + 'T00:00:00').getTime() - new Date(start + 'T00:00:00').getTime()) / 86400000) + 1;
    records.push({ startDate: start, endDate: end, length: len });

    return records;
  }, [allEvents]);

  // ── Weekly insight ────────────────────────────────────────────────────
  const insightLine = useMemo(() => {
    const logs = allEvents
      .filter(e => !e.deleted_at && e.event_type === 'increment')
      .map(e => ({ mark_id: e.mark_id, occurred_local_date: e.occurred_local_date }));
    const markNames: Record<string, string> = {};
    activeCounters.forEach(c => { markNames[c.id] = c.name; });
    return getWeeklyInsight(logs, markNames);
  }, [allEvents, activeCounters]);

  // ── Best-day stats ────────────────────────────────────────────────────
  const statCards = useMemo(() => {
    const bestStreak = computeStreak(
      allEvents.filter(e => !e.deleted_at && e.event_type === 'increment') as any,
      today,
    );
    const totalLogged = allEvents.filter(e => !e.deleted_at && e.event_type === 'increment').length;

    const dowCounts = new Array(7).fill(0);
    allEvents.forEach(e => {
      if (e.deleted_at || e.event_type !== 'increment') return;
      dowCounts[new Date(e.occurred_local_date + 'T00:00:00').getDay()]++;
    });
    const bestDowIdx = dowCounts.indexOf(Math.max(...dowCounts));
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    return { bestStreak, totalLogged, bestDay: dayNames[bestDowIdx] };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allEvents, appDateKey]);

  const weekSentiment = getWeekSentimentHeader({ weekLoggedDays, isAfterComeback });

  if (loading) return <LoadingScreen />;

  return (
    <GradientBackground>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

          {/* Week sentiment header */}
          <View style={styles.sentimentWrap}>
            <AppText style={[styles.sentimentText, { color: themeColors.text }]}>
              {weekSentiment}
            </AppText>
          </View>

          {/* Calendar heatmap — hero */}
          <View style={styles.section}>
            <AppText style={[styles.sectionLabel, { color: themeColors.textTertiary }]}>YOUR HISTORY</AppText>
            <CalendarHeatmap
              logsByDate={logsByDate}
              totalMarks={totalMarks}
              weeksToShow={16}
            />
          </View>

          {/* Streak timeline */}
          {streakRecords.length > 0 && (
            <View style={styles.section}>
              <AppText style={[styles.sectionLabel, { color: themeColors.textTertiary }]}>STREAK HISTORY</AppText>
              <StreakTimeline streaks={streakRecords} maxBarHeight={72} />
            </View>
          )}

          {/* Insight line */}
          {insightLine ? (
            <View style={[styles.insightWrap, { backgroundColor: isDark ? applyOpacity(themeColors.surface, 0.8) : themeColors.surface, borderColor: applyOpacity(themeColors.border, 0.5) }]}>
              <AppText style={[styles.insightText, { color: themeColors.textSecondary }]}>
                {insightLine}
              </AppText>
            </View>
          ) : null}

          {/* Stat cards */}
          <View style={styles.statRow}>
            <StatCard label="Best streak" value={`${statCards.bestStreak.longest} days`} themeColors={themeColors} isDark={isDark} />
            <StatCard label="Total logged" value={String(statCards.totalLogged)} themeColors={themeColors} isDark={isDark} />
            <StatCard label="Best day" value={statCards.bestDay} themeColors={themeColors} isDark={isDark} />
          </View>

        </ScrollView>
      </SafeAreaView>
    </GradientBackground>
  );
}

// ── StatCard ──────────────────────────────────────────────────────────────

const StatCard: React.FC<{ label: string; value: string; themeColors: any; isDark: boolean }> = ({
  label, value, themeColors, isDark,
}) => (
  <View style={[styles.statCard, { backgroundColor: themeColors.surface, borderColor: applyOpacity(themeColors.border, isDark ? 0.35 : 0.7) }]}>
    <AppText style={[styles.statValue, { color: themeColors.text }]}>{value}</AppText>
    <AppText style={[styles.statLabel, { color: themeColors.textTertiary }]}>{label}</AppText>
  </View>
);

// ── Styles ────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  scroll: { flex: 1 },
  content: { paddingBottom: spacing['4xl'] ?? 64 },
  sentimentWrap: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  sentimentText: {
    fontSize: fontSize['2xl'],
    fontWeight: fontWeight.bold,
    letterSpacing: -0.5,
    lineHeight: 32,
  },
  section: {
    gap: spacing.sm,
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: fontWeight.semibold,
    letterSpacing: 1.2,
    paddingHorizontal: spacing.lg,
  },
  insightWrap: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  insightText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    fontStyle: 'italic',
    lineHeight: 20,
  },
  statRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
  },
  statCard: {
    flex: 1,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: StyleSheet.hairlineWidth,
    gap: spacing.xxs,
  },
  statValue: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    letterSpacing: -0.2,
  },
  statLabel: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
  },
});
