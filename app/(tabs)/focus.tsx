import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';

import { fonts, fontSize, spacing, radius, borderRadius, shadow, themedColors } from '../../theme/tokens';
import { useEffectiveTheme } from '../../state/uiSlice';
import { LivraHeader } from '../../components/ui/LivraHeader';
import { MarkRow } from '../../components/ui/MarkRow';
import { SectionLabel } from '../../components/ui/SectionLabel';
import { SpeedDialFAB } from '../../components/ui/SpeedDialFAB';

import { useCounters } from '../../hooks/useCounters';
import { useAuth } from '../../hooks/useAuth';
import { useSync } from '../../hooks/useSync';
import { useEventsStore } from '../../state/eventsSlice';
import { useAppDateStore } from '../../state/appDateSlice';
import { useGoalsStore } from '../../state/goalsSlice';
import { useMomentumStore } from '../../state/momentumSlice';
import { GoalMomentum } from '../../components/ui/GoalMomentum';
import { MomentumBanner } from '../../components/ui/MomentumBanner';
import { shouldShowMomentumBanner } from '../../lib/momentumPresenter';
import {
  getMomentumBannerDismissedDate,
  setMomentumBannerDismissedDate,
} from '../../lib/momentumBannerDismiss';
import { getMomentumBannerCopy } from '../../lib/copy';
import { getAppDate } from '../../lib/appDate';
import { formatDate } from '../../lib/date';
import { resolveDailyTarget } from '../../lib/markDailyTarget';
import {
  currentWeekDates,
  computeCompletionsThisWeek,
  markWeeklyState,
} from '../../lib/features';
import { computeWeek } from '../../lib/consistency';
import { logger } from '../../lib/utils/logger';
import { useNotification } from '../../contexts/NotificationContext';
import { MARK_LIBRARY } from '../../lib/suggestedCounters';
import { resolveCounterIconType } from '../../src/components/icons/IconResolver';
import { applyOpacity } from '../../src/components/icons/color';

import type { Counter } from '../../types';

const MAX_MARKS_PER_CARD = 4;

export default function FocusScreen() {
  const theme = useEffectiveTheme();
  const c = themedColors(theme);
  const router = useRouter();
  const { user } = useAuth();
  const { counters, loading, error, incrementCounter, deleteCounter } = useCounters();
  const { showError } = useNotification();
  const { sync } = useSync();
  const appDateKey = useAppDateStore((s) => s.debugDateOverride ?? '');
  const todayStr = useMemo(() => formatDate(getAppDate()), [appDateKey]);

  const allEvents = useEventsStore((s) => s.events);

  const uniqueCounters = useMemo(() => {
    const map = new Map<string, Counter>();
    for (const cnt of counters) {
      const existing = map.get(cnt.id);
      if (!existing || new Date(cnt.updated_at) > new Date(existing.updated_at)) {
        map.set(cnt.id, cnt);
      }
    }
    return Array.from(map.values());
  }, [counters]);

  const activeCounters = useMemo(
    () => uniqueCounters.filter((cnt) => !cnt.deleted_at),
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

  const goals = useGoalsStore((s) => s.goals);
  const activeGoals = useMemo(
    () => goals.filter((g) => g.status === 'active').slice(0, 2),
    [goals],
  );

  const momentumSnapshots = useMomentumStore((s) => s.snapshots);

  const [bannerDismissedDate, setBannerDismissedDate] = useState<string | null>(null);
  useEffect(() => {
    void getMomentumBannerDismissedDate().then(setBannerDismissedDate);
  }, [todayStr]);

  const bannerVisible = useMemo(
    () => shouldShowMomentumBanner(momentumSnapshots, bannerDismissedDate, todayStr),
    [momentumSnapshots, bannerDismissedDate, todayStr],
  );

  const bannerLastTemplateRef = useRef<string | undefined>(undefined);
  const bannerText = useMemo(() => {
    if (!bannerVisible) return '';
    const c = getMomentumBannerCopy(bannerLastTemplateRef.current);
    bannerLastTemplateRef.current = c.template;
    return c.text;
  }, [bannerVisible, todayStr]);

  const handleDismissBanner = useCallback(() => {
    setBannerDismissedDate(todayStr);
    void setMomentumBannerDismissedDate(todayStr);
  }, [todayStr]);

  // Stable key over the active-goal id SET, so re-eval fires on a same-count
  // identity swap (archive one active goal, activate another), not just when
  // the count changes. Empty string when there are no active goals.
  const activeGoalIdsKey = useMemo(() => activeGoals.map((g) => g.id).join(','), [activeGoals]);

  useEffect(() => {
    if (!activeGoalIdsKey) return;
    void useGoalsStore.getState().evaluateActiveGoalsMomentum();
  }, [activeGoalIdsKey, todayStr]);

  // ── Weekly state per mark ─────────────────────────────────────────────────

  const weekDates = useMemo(() => currentWeekDates(), [appDateKey]);

  const weeklyCountsMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const mark of activeCounters) {
      const markEvents = allEvents.filter((e) => e.mark_id === mark.id && !e.deleted_at);
      map.set(mark.id, computeCompletionsThisWeek(mark, markEvents, weekDates));
    }
    return map;
  }, [activeCounters, allEvents, weekDates]);

  const consistencyResult = useMemo(() => {
    if (activeCounters.length === 0) return null;
    const completionsByMark: Record<string, number> = {};
    for (const mark of activeCounters) {
      completionsByMark[mark.id] = weeklyCountsMap.get(mark.id) ?? 0;
    }
    return computeWeek(activeCounters, completionsByMark, weekDates);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCounters, weeklyCountsMap, weekDates]);

  // ── Daily progress (for banner) ───────────────────────────────────────────

  const completedMarksToday = useMemo(() => {
    let n = 0;
    activeCounters.forEach((cnt) => {
      if ((todayCountsMap.get(cnt.id) ?? 0) >= resolveDailyTarget(cnt)) n++;
    });
    return n;
  }, [activeCounters, todayCountsMap]);

  const todayTotal = activeCounters.length;

  // ── Grouped marks ─────────────────────────────────────────────────────────

  const marksForGoal = useCallback(
    (goalId: string) => activeCounters.filter((m) => m.goal_id === goalId),
    [activeCounters],
  );

  const goallessMarks = useMemo(
    () => activeCounters.filter((m) => !m.goal_id),
    [activeCounters],
  );

  // True when nothing is still loggable today: every mark is doneForWeek OR already hit daily target
  const allDoneForDay = useMemo(() => {
    if (activeCounters.length === 0) return false;
    return activeCounters.every((m) => {
      const weeklyCount = weeklyCountsMap.get(m.id) ?? 0;
      if (markWeeklyState(m, weeklyCount) === 'doneForWeek') return true;
      return (todayCountsMap.get(m.id) ?? 0) >= resolveDailyTarget(m);
    });
  }, [activeCounters, weeklyCountsMap, todayCountsMap]);

  // ── Expander state (per-goal "X more" collapse) ───────────────────────────

  const [expandedGoalIds, setExpandedGoalIds] = useState<Set<string>>(new Set());
  const [dailyHabitsExpanded, setDailyHabitsExpanded] = useState(false);

  const toggleGoalExpand = useCallback((goalId: string) => {
    setExpandedGoalIds((prev) => {
      const next = new Set(prev);
      if (next.has(goalId)) next.delete(goalId);
      else next.add(goalId);
      return next;
    });
  }, []);

  // ── User info ─────────────────────────────────────────────────────────────

  const firstName = useMemo(() => {
    const full: string =
      (user?.user_metadata?.full_name as string | undefined) ?? user?.email?.split('@')[0] ?? '';
    return full.split(' ')[0] ?? '';
  }, [user]);

  const greetingText = useMemo(() => {
    if (firstName) return `${firstName}, one step is enough.`;
    return 'One step is enough.';
  }, [firstName]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleQuickIncrement = useCallback(
    async (markId: string) => {
      if (!user?.id) return;
      if (Platform.OS !== 'web') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      }
      try {
        await incrementCounter(markId, user.id, 1);
      } catch (error: unknown) {
        logger.error('Error incrementing mark:', error);
        showError('Could not log that. Try again.');
      }
    },
    [user?.id, incrementCounter, showError],
  );

  const handleMarkLongPress = useCallback((markId: string, markName: string) => {
    Alert.alert(
      markName,
      undefined,
      [
        { text: 'View details', onPress: () => router.push(`/mark/${markId}` as any) },
        { text: 'Edit', onPress: () => router.push(`/mark/${markId}` as any) },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Remove mark?',
              `"${markName}" will be permanently removed.`,
              [
                { text: 'Keep it', style: 'cancel' },
                {
                  text: 'Remove',
                  style: 'destructive',
                  onPress: () => { deleteCounter(markId).catch(() => {}); },
                },
              ],
            );
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ],
    );
  }, [router, deleteCounter]);

  const handleDeleteMark = useCallback((markId: string, markName: string) => {
    Alert.alert(
      'Remove mark?',
      `"${markName}" will be permanently removed.`,
      [
        { text: 'Keep it', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => { deleteCounter(markId).catch(() => {}); },
        },
      ],
    );
  }, [deleteCounter]);

  // ── Mark row renderer (shared) ────────────────────────────────────────────

  const renderMarkRow = useCallback(
    (mark: Counter, isLast: boolean, dimmed = false) => {
      const weeklyCount = weeklyCountsMap.get(mark.id) ?? 0;
      const weeklyTarget = mark.weekly_target ?? 3;
      const isDoneForWeek = markWeeklyState(mark, weeklyCount) === 'doneForWeek';
      const libMark = MARK_LIBRARY.find((m) => m.emoji === mark.emoji);
      const category =
        libMark?.category ??
        resolveCounterIconType({ name: mark.name, emoji: mark.emoji ?? '' }) ??
        'custom';

      const showRestLine =
        isDoneForWeek &&
        mark.frequency_kind !== 'abstinence' &&
        mark.frequency_kind !== 'fixed';

      return (
        <View key={mark.id}>
          <Swipeable
            renderRightActions={() => (
              <TouchableOpacity
                style={[styles.swipeDelete, { backgroundColor: c.danger }]}
                onPress={() => handleDeleteMark(mark.id, mark.name)}
                activeOpacity={0.85}
              >
                <Text style={styles.swipeDeleteText}>Delete</Text>
              </TouchableOpacity>
            )}
            rightThreshold={80}
          >
            <View style={dimmed || isDoneForWeek ? styles.doneMarkWrap : undefined}>
              <MarkRow
                title={mark.name}
                category={category}
                loggedToday={isDoneForWeek}
                done={isDoneForWeek}
                onPress={() => router.push(`/mark/${mark.id}` as any)}
                onLog={() => handleQuickIncrement(mark.id)}
                onLongPress={() => handleMarkLongPress(mark.id, mark.name)}
                isLast={isLast}
                showWeeklyCount
                weeklyCount={weeklyCount}
                weeklyTarget={weeklyTarget}
              />
            </View>
          </Swipeable>
          {showRestLine && (
            <View style={styles.restLineRow}>
              <Text style={[styles.restLineText, { color: c.inkMuted }]}>
                {`You've hit your ${mark.weekly_target ?? 3} this week. Rest is part of it — but if you want one more, go for it.`}
              </Text>
              <TouchableOpacity
                style={styles.bonusButton}
                onPress={() => handleQuickIncrement(mark.id)}
                activeOpacity={0.7}
              >
                <Text style={[styles.bonusButtonText, { color: c.accent }]}>Log one more</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      );
    },
    [weeklyCountsMap, c, handleDeleteMark, handleMarkLongPress, handleQuickIncrement, router],
  );

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <View style={[styles.screen, { backgroundColor: c.linen }]}>
      <LivraHeader centerLogo showAvatar />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {bannerVisible && bannerText !== '' && (
          <MomentumBanner text={bannerText} onDismiss={handleDismissBanner} />
        )}

        {/* ── Greeting ── */}
        <Text style={[styles.greeting, { color: c.inkDark }]}>{greetingText}</Text>

        {/* ── Loading / error states ── */}
        {loading && activeCounters.length === 0 && (
          <View style={styles.loadingState}>
            <ActivityIndicator size="small" color={c.accent} />
          </View>
        )}
        {!loading && error && (
          <View style={[styles.errorBanner, { backgroundColor: applyOpacity(c.danger, 0.13) }]}>
            <Text style={[styles.errorBannerText, { color: c.danger }]}>{error}</Text>
          </View>
        )}

        {/* ── Compact Progress Banner ── */}
        <View style={[
          styles.progressBanner,
          {
            backgroundColor: theme === 'dark'
              ? applyOpacity(c.mint, 0.12)
              : applyOpacity(c.forest, 0.1),
            borderWidth: 0.5,
            borderColor: theme === 'dark'
              ? applyOpacity(c.mint, 0.15)
              : applyOpacity(c.forest, 0.15),
          },
        ]}>
          <View style={[
            StyleSheet.absoluteFill,
            {
              borderRadius: borderRadius.card,
              backgroundColor: theme === 'dark'
                ? applyOpacity(c.mint, 0.08)
                : applyOpacity(c.forest, 0.08),
            },
          ]} />
          <View>
            <Text style={[styles.bannerFraction, { color: theme === 'dark' ? c.inkInverse : c.forest }]}>
              {completedMarksToday}/{todayTotal}
            </Text>
            <Text style={[styles.bannerFractionLabel, { color: theme === 'dark' ? c.inkInverseMuted : c.inkMuted }]}>
              marks today
            </Text>
          </View>
        </View>

        {/* ── Forgiveness line ── */}
        {consistencyResult && !consistencyResult.strong && consistencyResult.remaining > 0 && (
          <Text style={[styles.forgivenessLine, { color: c.inkMuted }]}>
            {'Still on track. You need '}
            <Text style={{ color: c.inkDark }}>{consistencyResult.remaining}</Text>
            {` more check-in${consistencyResult.remaining !== 1 ? 's' : ''} this week.`}
          </Text>
        )}

        {/* ── All done for today ── */}
        {allDoneForDay && activeCounters.length > 0 && (
          <View style={[styles.allDoneBanner, { backgroundColor: c.surface }]}>
            <Text style={[styles.allDoneText, { color: c.inkMid }]}>
              {"That's everything for today."}
            </Text>
          </View>
        )}

        {/* ── Goal cards (≤2 active goals with their marks) ── */}
        {activeGoals.length > 0 && (
          <View style={styles.goalCardsSection}>
            <SectionLabel style={styles.sectionLabel}>YOUR GOALS</SectionLabel>
            {activeGoals.map((goal) => {
              const marks = marksForGoal(goal.id);
              if (marks.length === 0) return null;

              const dueMarks = marks.filter(
                (m) => markWeeklyState(m, weeklyCountsMap.get(m.id) ?? 0) === 'due',
              );
              const doneMarks = marks.filter(
                (m) => markWeeklyState(m, weeklyCountsMap.get(m.id) ?? 0) === 'doneForWeek',
              );

              const isExpanded = expandedGoalIds.has(goal.id);
              const visibleDue = isExpanded ? dueMarks : dueMarks.slice(0, MAX_MARKS_PER_CARD);
              const hiddenCount = dueMarks.length - visibleDue.length;

              return (
                <View key={goal.id} style={[styles.goalCard, { backgroundColor: c.surface }]}>
                  <TouchableOpacity
                    onPress={() => router.push(`/goal/${goal.id}` as any)}
                    activeOpacity={0.7}
                    style={styles.goalCardHeader}
                  >
                    <Text style={[styles.goalCardTitle, { color: c.inkDark }]} numberOfLines={1}>
                      {goal.title}
                    </Text>
                    <Text style={[styles.goalCardMeta, { color: c.inkMuted }]}>
                      {marks.length} mark{marks.length !== 1 ? 's' : ''}
                    </Text>
                  </TouchableOpacity>

                  <View style={styles.momentumRow}>
                    <GoalMomentum snapshot={momentumSnapshots[goal.id] ?? null} />
                  </View>

                  {/* Due marks */}
                  {visibleDue.map((mark, idx) =>
                    renderMarkRow(mark, idx === visibleDue.length - 1 && doneMarks.length === 0 && hiddenCount === 0)
                  )}

                  {/* "X more" expander */}
                  {hiddenCount > 0 && (
                    <TouchableOpacity
                      style={styles.expanderRow}
                      onPress={() => toggleGoalExpand(goal.id)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.expanderText, { color: c.accent }]}>
                        {hiddenCount} more mark{hiddenCount !== 1 ? 's' : ''}
                      </Text>
                    </TouchableOpacity>
                  )}

                  {/* Done marks (dimmed) */}
                  {doneMarks.length > 0 && (
                    <>
                      <View style={[styles.doneDivider, { backgroundColor: c.borderLight }]} />
                      {doneMarks.map((mark, idx) =>
                        renderMarkRow(mark, idx === doneMarks.length - 1, true)
                      )}
                    </>
                  )}
                </View>
              );
            })}
          </View>
        )}

        {/* ── Daily habits (goal-less marks, collapsible) ── */}
        {goallessMarks.length > 0 && (
          <View style={styles.dailyHabitsSection}>
            <TouchableOpacity
              style={styles.dailyHabitsHeader}
              onPress={() => setDailyHabitsExpanded((v) => !v)}
              activeOpacity={0.7}
            >
              <SectionLabel style={styles.sectionLabel}>DAILY HABITS</SectionLabel>
              <Text style={[styles.dailyHabitsToggle, { color: c.accent }]}>
                {dailyHabitsExpanded ? 'Hide' : `Show ${goallessMarks.length}`}
              </Text>
            </TouchableOpacity>

            {dailyHabitsExpanded && (
              <View style={[styles.marksList, { backgroundColor: c.surface }]}>
                {goallessMarks.map((mark, idx) =>
                  renderMarkRow(mark, idx === goallessMarks.length - 1)
                )}
              </View>
            )}
          </View>
        )}

        {/* ── Empty state (no marks at all) ── */}
        {activeCounters.length === 0 && !loading && (
          <View style={[styles.emptyMarks, { backgroundColor: c.surface }]}>
            <Text style={[styles.emptyMarksText, { color: c.inkMuted }]}>
              No marks yet — tap + to add your first one.
            </Text>
          </View>
        )}

        <View style={styles.bottomSpacer} />
      </ScrollView>

      <SpeedDialFAB />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: spacing.xxl },

  greeting: {
    fontFamily: fonts.serifItalic,
    fontSize: fontSize.xl,
    lineHeight: 30,
    marginTop: spacing.lg,
    paddingHorizontal: spacing.lg,
  },

  // Progress banner
  progressBanner: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    borderRadius: borderRadius.card,
    overflow: 'hidden',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
  },
  bannerFraction: {
    fontFamily: fonts.serif,
    fontSize: fontSize.display,
    lineHeight: 32,
  },
  bannerFractionLabel: {
    fontFamily: fonts.sans,
    fontSize: fontSize.sm,
  },
  restLineRow: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  restLineText: {
    fontFamily: fonts.sans,
    fontSize: fontSize.sm,
    lineHeight: 17,
    flex: 1,
    marginRight: spacing.sm,
  },
  bonusButton: {
    paddingVertical: 4,
    paddingHorizontal: spacing.sm,
  },
  bonusButtonText: {
    fontFamily: fonts.sansMedium,
    fontSize: fontSize.sm,
  },

  forgivenessLine: {
    fontFamily: fonts.sans,
    fontSize: fontSize.sm,
    lineHeight: 18,
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
  },

  allDoneBanner: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    borderRadius: radius.lg,
    padding: spacing.md,
    alignItems: 'center',
  },
  allDoneText: {
    fontFamily: fonts.serifItalic,
    fontSize: fontSize.md,
    textAlign: 'center',
  },

  // Goal cards section
  goalCardsSection: {
    marginTop: spacing.xl,
  },
  sectionLabel: {
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  goalCard: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    borderRadius: radius.xl,
    overflow: 'hidden',
    ...shadow.card,
  },
  goalCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  goalCardTitle: {
    fontFamily: fonts.serifSemibold,
    fontSize: fontSize.lg,
    flex: 1,
    marginRight: spacing.sm,
  },
  goalCardMeta: {
    fontFamily: fonts.sans,
    fontSize: fontSize.sm,
  },
  momentumRow: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  expanderRow: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  expanderText: {
    fontFamily: fonts.sansMedium,
    fontSize: fontSize.sm,
  },
  doneDivider: {
    height: 0.5,
    marginHorizontal: spacing.lg,
    marginTop: spacing.xs,
  },
  doneMarkWrap: {
    opacity: 0.45,
  },

  // Daily habits
  dailyHabitsSection: {
    marginTop: spacing.xl,
  },
  dailyHabitsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  dailyHabitsToggle: {
    fontFamily: fonts.sansMedium,
    fontSize: fontSize.sm,
  },

  marksList: {
    gap: 6,
    ...shadow.card,
  },

  emptyMarks: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.xl,
    borderRadius: radius.lg,
    padding: spacing.lg,
    alignItems: 'center',
    ...shadow.card,
  },
  emptyMarksText: {
    fontFamily: fonts.sans,
    fontSize: fontSize.base,
    textAlign: 'center',
  },

  loadingState: {
    paddingVertical: spacing.xxl,
    alignItems: 'center',
  },
  errorBanner: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  errorBannerText: {
    fontFamily: fonts.sans,
    fontSize: fontSize.sm,
  },

  swipeDelete: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
    paddingHorizontal: spacing.sm,
  },
  swipeDeleteText: {
    fontFamily: fonts.sansSemibold,
    fontSize: fontSize.sm,
    color: '#FFFFFF',
  },

  bottomSpacer: { height: 160 },
});
