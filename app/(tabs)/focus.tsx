import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { Lightning } from 'phosphor-react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';

import { fonts, spacing, radius, shadow, themedColors } from '../../theme/tokens';
import { useEffectiveTheme } from '../../state/uiSlice';
import { LivraHeader } from '../../components/ui/LivraHeader';
import { MarkRow } from '../../components/ui/MarkRow';
import { SectionLabel } from '../../components/ui/SectionLabel';
import { SpeedDialFAB } from '../../components/ui/SpeedDialFAB';

import { useCounters } from '../../hooks/useCounters';
import { useAuth } from '../../hooks/useAuth';
import { useSync } from '../../hooks/useSync';
import { useNotifications } from '../../hooks/useNotifications';
import { useEventsStore } from '../../state/eventsSlice';
import { useAppDateStore } from '../../state/appDateSlice';
import { useGoalsStore } from '../../state/goalsSlice';
import { getAppDate } from '../../lib/appDate';
import { formatDate } from '../../lib/date';
import { subDays } from 'date-fns';
import { resolveDailyTarget } from '../../lib/markDailyTarget';
import { logger } from '../../lib/utils/logger';
import { MARK_LIBRARY } from '../../lib/suggestedCounters';

import type { Counter } from '../../types';

export default function FocusScreen() {
  const theme = useEffectiveTheme();
  const c = themedColors(theme);
  const router = useRouter();
  const { user } = useAuth();
  const { counters, loading, incrementCounter } = useCounters();
  const { sync } = useSync();
  const { updateSmartNotifications, permissionGranted } = useNotifications();

  const appDateKey = useAppDateStore((s) => s.debugDateOverride ?? '');
  const todayStr = useMemo(() => formatDate(getAppDate()), [appDateKey]);

  const allEvents = useEventsStore((s) => s.events);

  const uniqueCounters = useMemo(() => {
    const map = new Map<string, Counter>();
    for (const c of counters) {
      const existing = map.get(c.id);
      if (!existing || new Date(c.updated_at) > new Date(existing.updated_at)) {
        map.set(c.id, c);
      }
    }
    return Array.from(map.values());
  }, [counters]);

  const activeCounters = useMemo(
    () => uniqueCounters.filter((c) => !c.deleted_at),
    [uniqueCounters],
  );

  const todayCountsMap = useMemo(() => {
    const map = new Map<string, number>();
    allEvents.forEach((e) => {
      if (e.deleted_at || e.event_type !== 'increment') return;
      if (e.occurred_local_date !== todayStr) return;
      map.set(e.mark_id, (map.get(e.mark_id) ?? 0) + (e.amount ?? 1));
    });
    return map;
  }, [allEvents, todayStr]);

  const getActiveGoal = useGoalsStore((s) => s.getActiveGoal);
  const goals = useGoalsStore((s) => s.goals);
  const activeGoal = useMemo(() => getActiveGoal(), [getActiveGoal, goals]);
  const activeGoalCount = useMemo(
    () => goals.filter((g) => g.status === 'active').length,
    [goals],
  );

  const completedMarksToday = useMemo(() => {
    let n = 0;
    activeCounters.forEach((c) => {
      const todayCount = todayCountsMap.get(c.id) ?? 0;
      if (todayCount >= resolveDailyTarget(c)) n++;
    });
    return n;
  }, [activeCounters, todayCountsMap]);

  const todayTotal = activeCounters.length;

  const overallStreakDays = useMemo(() => {
    let streak = 0;
    const anchor = getAppDate();
    for (let i = 0; i < 365; i++) {
      const dateStr = formatDate(subDays(anchor, i));
      const hasActivity = allEvents.some(
        (e) =>
          e.occurred_local_date === dateStr &&
          !e.deleted_at &&
          e.event_type === 'increment',
      );
      if (hasActivity) streak++;
      else break;
    }
    return streak;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allEvents, appDateKey]);

  const thisWeekCount = useMemo(() => {
    const anchor = getAppDate();
    const dow = anchor.getDay();
    const monday = new Date(anchor);
    monday.setDate(anchor.getDate() - ((dow + 6) % 7));
    monday.setHours(0, 0, 0, 0);
    const dates = new Set(
      Array.from({ length: 7 }, (_, i) => {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        return formatDate(d);
      }),
    );
    let total = 0;
    allEvents.forEach((e) => {
      if (!e.deleted_at && e.event_type === 'increment' && dates.has(e.occurred_local_date)) {
        total += e.amount ?? 1;
      }
    });
    return total;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allEvents, appDateKey]);

  const heroProgress = useMemo(() => {
    if (!activeGoal) return 0;
    if (todayTotal === 0) return 0;
    return completedMarksToday / todayTotal;
  }, [activeGoal, completedMarksToday, todayTotal]);

  const firstName = useMemo(() => {
    const full: string =
      (user?.user_metadata?.full_name as string | undefined) ?? user?.email?.split('@')[0] ?? '';
    return full.split(' ')[0] ?? '';
  }, [user]);

  const greetingText = useMemo(() => {
    if (firstName) return `${firstName}, your journey continues today.`;
    return 'Your journey continues today.';
  }, [firstName]);

  useEffect(() => {
    if (!permissionGranted || counters.length === 0) return;
    updateSmartNotifications(user?.id).catch((e) =>
      logger.error('Error updating notifications:', e),
    );
  }, [counters, permissionGranted, user?.id, updateSmartNotifications]);

  const prevStreakRef = useRef<number | null>(null);
  useEffect(() => {
    if (prevStreakRef.current === null) {
      prevStreakRef.current = overallStreakDays;
      return;
    }
    if (overallStreakDays > prevStreakRef.current && Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    prevStreakRef.current = overallStreakDays;
  }, [overallStreakDays]);

  const handleQuickIncrement = useCallback(
    async (markId: string) => {
      if (!user?.id) return;
      try {
        const counter = counters.find((c) => c.id === markId);
        if (counter) {
          const target = resolveDailyTarget(counter);
          const currentToday = todayCountsMap.get(markId) ?? 0;
          if (currentToday >= target) return;
        }
        await incrementCounter(markId, user.id, 1);
        if (permissionGranted) {
          updateSmartNotifications(user?.id).catch((e) =>
            logger.error('Error updating notifications after increment:', e),
          );
        }
      } catch (error: unknown) {
        logger.error('Error incrementing mark:', error);
      }
    },
    [user?.id, incrementCounter, permissionGranted, updateSmartNotifications, counters, todayCountsMap],
  );

  const visibleMarks = useMemo(() => activeCounters.slice(0, 5), [activeCounters]);

  return (
    <View style={[styles.screen, { backgroundColor: c.linen }]}>
      <LivraHeader centerLogo showAvatar />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Greeting ── */}
        <Text style={[styles.greeting, { color: c.inkDark }]}>{greetingText}</Text>

        {/* ── Compact Progress Banner ── */}
        <View style={[styles.progressBanner, { backgroundColor: c.forest }]}>
          <View>
            <Text style={[styles.bannerFraction, { color: c.inkInverse }]}>
              {completedMarksToday}/{todayTotal}
            </Text>
            <Text style={[styles.bannerFractionLabel, { color: c.inkInverseMuted }]}>marks</Text>
          </View>
          <View style={styles.bannerStreak}>
            <Lightning size={14} color={c.mint} weight="duotone" />
            <Text style={[styles.bannerStreakText, { color: c.inkInverseMuted }]}>
              {overallStreakDays} day streak
            </Text>
          </View>
        </View>

        {/* ── Compact Stat Strip ── */}
        <View style={[styles.statStrip, { borderTopColor: c.borderLight, borderBottomColor: c.borderLight }]}>
          {[
            { value: `${completedMarksToday}/${todayTotal}`, label: 'TODAY' },
            { value: String(overallStreakDays), label: 'STREAK' },
            { value: String(thisWeekCount), label: 'THIS WEEK' },
            { value: String(activeGoalCount), label: 'GOALS' },
          ].map((item, idx, arr) => (
            <View
              key={item.label}
              style={[
                styles.statCell,
                idx < arr.length - 1 && [styles.statCellBorder, { borderRightColor: c.borderLight }],
              ]}
            >
              <Text style={[styles.statValue, { color: c.inkDark }]}>{item.value}</Text>
              <Text style={[styles.statLabel, { color: c.inkMuted }]}>{item.label}</Text>
            </View>
          ))}
        </View>

        {/* ── Your Marks ── */}
        <View style={styles.marksSection}>
          <View style={styles.marksSectionHeader}>
            <SectionLabel>YOUR MARKS</SectionLabel>
            <TouchableOpacity
              onPress={() => router.push('/(tabs)/marks' as any)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={[styles.seeAll, { color: c.forest }]}>See all</Text>
            </TouchableOpacity>
          </View>

          {visibleMarks.length === 0 ? (
            <View style={[styles.emptyMarks, { backgroundColor: c.surface }]}>
              <Text style={[styles.emptyMarksText, { color: c.inkMuted }]}>
                No marks yet — tap + to add your first one.
              </Text>
            </View>
          ) : (
            <View style={[styles.marksList, { backgroundColor: c.surface }]}>
              {visibleMarks.map((mark, idx) => {
                const loggedToday =
                  (todayCountsMap.get(mark.id) ?? 0) >= resolveDailyTarget(mark);
                const libMark = MARK_LIBRARY.find(m => m.emoji === mark.emoji);
                return (
                  <MarkRow
                    key={mark.id}
                    title={mark.name}
                    category={libMark?.category ?? 'custom'}
                    loggedToday={loggedToday}
                    onPress={() => router.push(`/mark/${mark.id}` as any)}
                    onLog={() => handleQuickIncrement(mark.id)}
                    isLast={idx === visibleMarks.length - 1}
                  />
                );
              })}
            </View>
          )}
        </View>

        <View style={styles.bottomSpacer} />
      </ScrollView>

      <SpeedDialFAB />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: spacing.xxl,
  },

  // Greeting
  greeting: {
    fontFamily: fonts.serifItalic,
    fontSize: 22,
    lineHeight: 30,
    marginTop: spacing.lg,
    paddingHorizontal: spacing.lg,
  },

  // Compact progress banner
  progressBanner: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    height: 56,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  bannerFraction: {
    fontFamily: fonts.sansBold,
    fontSize: 20,
    lineHeight: 24,
  },
  bannerFractionLabel: {
    fontFamily: fonts.sans,
    fontSize: 12,
  },
  bannerStreak: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  bannerStreakText: {
    fontFamily: fonts.sansMedium,
    fontSize: 13,
  },
  // Compact stat strip
  statStrip: {
    flexDirection: 'row',
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    height: 44,
    borderTopWidth: 0.5,
    borderBottomWidth: 0.5,
  },
  statCell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statCellBorder: {
    borderRightWidth: 0.5,
  },
  statValue: {
    fontFamily: fonts.sansSemibold,
    fontSize: 16,
  },
  statLabel: {
    fontFamily: fonts.sans,
    fontSize: 10,
    letterSpacing: 0.5,
  },

  // Marks section
  marksSection: {
    marginTop: spacing.xl,
  },
  marksSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  seeAll: {
    fontFamily: fonts.sansMedium,
    fontSize: 12,
  },
  marksList: {
    ...shadow.card,
  },
  emptyMarks: {
    marginHorizontal: spacing.lg,
    borderRadius: radius.lg,
    padding: spacing.lg,
    alignItems: 'center',
    ...shadow.card,
  },
  emptyMarksText: {
    fontFamily: fonts.sans,
    fontSize: 14,
    textAlign: 'center',
  },

  bottomSpacer: {
    height: 160,
  },
});
