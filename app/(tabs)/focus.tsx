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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';

import { fonts, fontSize, spacing, radius, shadow, themedColors } from '../../theme/tokens';
import { useEffectiveTheme, useUIStore } from '../../state/uiSlice';
import { LivraHeader } from '../../components/ui/LivraHeader';
import { MarkRow } from '../../components/ui/MarkRow';
import { Breathing } from '../../components/ui/Breathing';
import { Plus, CaretRight } from 'phosphor-react-native';
import { SectionLabel } from '../../components/ui/SectionLabel';
import { GoalTitle } from '../../components/ui/GoalTitle';
import { SpeedDialFAB } from '../../components/ui/SpeedDialFAB';
import { VoiceLine } from '../../components/ui/VoiceLine';

import { useCounters } from '../../hooks/useCounters';
import { useAuth } from '../../hooks/useAuth';
import { useSync } from '../../hooks/useSync';
import { useEventsStore } from '../../state/eventsSlice';
import { useAppDateStore } from '../../state/appDateSlice';
import { useGoalsStore } from '../../state/goalsSlice';
import { effectivePersonalBest, useMomentumStore } from '../../state/momentumSlice';
import { buildMomentContext } from '../../lib/moments/context';
import {
  dayHashRng,
  previousDayGreetingDefaultId,
  previousDayRestLineId,
  selectMoment,
} from '../../lib/moments/select';
import { deriveFocusEmptyVariant, getEmptyStateCopy } from '../../lib/moments/emptyState';
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
import { partitionMarks } from '../../lib/maintenanceMarks';
import { dayJustCompleted } from '../../lib/motionTriggers';
import {
  currentWeekDates,
  buildGoalLifetimeLogCounts,
  buildWeeklyCountsMap,
  markWeeklyState,
} from '../../lib/features';
import { resolveMarkCategory, resolveMarkIcon } from '../../lib/markCategoryResolve';
import { getCategoryColorForMark } from '../../lib/markCategory';
import { resolveFirstName } from '../../lib/profile/displayName';
import { computeWeek } from '../../lib/consistency';
import { logger } from '../../lib/utils/logger';
import { useNotification } from '../../contexts/NotificationContext';
import { applyOpacity } from '../../src/components/icons/color';

import type { Counter } from '../../types';

const MAX_MARKS_PER_CARD = 4;

export default function FocusScreen() {
  const theme = useEffectiveTheme();
  const c = themedColors(theme);
  const insets = useSafeAreaInsets();
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
  const longestRuns = useMomentumStore((s) => s.longestRuns);

  // PL-2: load the persisted per-goal longest runs once (idempotent).
  useEffect(() => {
    void useMomentumStore.getState().hydrateLongestRuns();
  }, []);

  const [bannerDismissedDate, setBannerDismissedDate] = useState<string | null>(null);
  useEffect(() => {
    void getMomentumBannerDismissedDate().then(setBannerDismissedDate);
  }, [todayStr]);

  const bannerVisible = useMemo(
    () => shouldShowMomentumBanner(momentumSnapshots, bannerDismissedDate, todayStr),
    [momentumSnapshots, bannerDismissedDate, todayStr],
  );

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

  const weeklyCountsMap = useMemo(
    () => buildWeeklyCountsMap(activeCounters, allEvents, weekDates),
    [activeCounters, allEvents, weekDates],
  );

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

  // Phase 3.2: maintenance habits stay full habits but carry no goal-pressure —
  // they're excluded from the daily "all done today" celebration computations.
  const pressureMarks = useMemo(
    () => activeCounters.filter((m) => !m.maintenance_of),
    [activeCounters],
  );

  // ── Grouped marks ─────────────────────────────────────────────────────────

  const marksForGoal = useCallback(
    (goalId: string) => activeCounters.filter((m) => m.goal_id === goalId),
    [activeCounters],
  );

  // loose = no goal and not a maintenance habit; maintenance graduates to its own section.
  const { loose: goallessMarks, maintenance: maintenanceMarks } = useMemo(
    () => partitionMarks(activeCounters),
    [activeCounters],
  );

  // True when nothing is still loggable today: every mark is doneForWeek OR already hit daily target
  const allDoneForDay = useMemo(() => {
    if (pressureMarks.length === 0) return false;
    return pressureMarks.every((m) => {
      const weeklyCount = weeklyCountsMap.get(m.id) ?? 0;
      if (markWeeklyState(m, weeklyCount) === 'doneForWeek') return true;
      return (todayCountsMap.get(m.id) ?? 0) >= resolveDailyTarget(m);
    });
  }, [pressureMarks, weeklyCountsMap, todayCountsMap]);

  // Day-complete celebration: one-shot staggered row pulse + success haptic
  // when everything loggable today transitions to done (spec Moment A).
  const prevAllDoneRef = useRef(allDoneForDay);
  const [celebrateStamp, setCelebrateStamp] = useState<number | null>(null);
  useEffect(() => {
    if (dayJustCompleted(prevAllDoneRef.current, allDoneForDay)) {
      setCelebrateStamp(Date.now());
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      }
    }
    prevAllDoneRef.current = allDoneForDay;
  }, [allDoneForDay]);

  // ── Expander state (per-goal "X more" collapse) ───────────────────────────

  const [expandedGoalIds, setExpandedGoalIds] = useState<Set<string>>(new Set());
  // Batch 2 (founder): Daily habits is OPEN by default; hiding it is a choice
  // the app remembers. Persistent preference, so it lives in the UI slice.
  const dailyHabitsOpen = useUIStore((s) => s.dailyHabitsOpen);
  const setDailyHabitsOpen = useUIStore((s) => s.setDailyHabitsOpen);

  const toggleGoalExpand = useCallback((goalId: string) => {
    setExpandedGoalIds((prev) => {
      const next = new Set(prev);
      if (next.has(goalId)) next.delete(goalId);
      else next.add(goalId);
      return next;
    });
  }, []);

  // ── User info ─────────────────────────────────────────────────────────────

  // Shared derivation (lib/profile/displayName): the engine's deriveFirstName
  // normalizes null the same way it did the old '' fallback.
  const firstName = useMemo(() => resolveFirstName(user?.user_metadata, user?.email), [user]);

  // ── Moment engine context (PL-2: M2 + M3 · PL-3: M1 first week + M6 greeting) ─

  // M1: lifetime log events per active goal (counted across the goal's marks,
  // same events source todayCounts uses). 0 = never logged; 1 = first-ever log.
  // Pure derivation lives in lib/features (buildWeeklyCountsMap pattern).
  const goalLifetimeLogCounts = useMemo(
    () =>
      buildGoalLifetimeLogCounts(
        activeCounters,
        activeGoals.map((g) => g.id),
        allEvents,
      ),
    [activeCounters, activeGoals, allEvents],
  );

  const momentCtx = useMemo(
    () =>
      buildMomentContext({
        goals: activeGoals,
        snapshots: momentumSnapshots,
        weeklyCounts: Object.fromEntries(weeklyCountsMap),
        todayCounts: Object.fromEntries(todayCountsMap),
        dueMarkIds: pressureMarks
          .filter((m) => markWeeklyState(m, weeklyCountsMap.get(m.id) ?? 0) === 'due')
          .map((m) => m.id),
        todayStr,
        firstName,
        personalBestRuns: Object.fromEntries(
          activeGoals.map((g) => [g.id, effectivePersonalBest(longestRuns[g.id], todayStr)]),
        ),
        goalLifetimeLogCounts,
      }),
    [activeGoals, momentumSnapshots, weeklyCountsMap, todayCountsMap, pressureMarks, todayStr, firstName, longestRuns, goalLifetimeLogCounts],
  );

  // M3: when a slipping goal has a stored why, the engine speaks the direct line;
  // otherwise the existing generic banner copy stays. Once/day/goal frequency
  // rides the existing dismissal machinery (bannerVisible), nothing new.
  const bannerLastTemplateRef = useRef<string | undefined>(undefined);
  const bannerText = useMemo(() => {
    if (!bannerVisible) return '';
    const direct = selectMoment('momentumBanner', momentCtx);
    if (direct) return direct.text;
    const copy = getMomentumBannerCopy(bannerLastTemplateRef.current);
    bannerLastTemplateRef.current = copy.template;
    return copy.text;
  }, [bannerVisible, momentCtx, todayStr]);

  // M6 (PL-3): the greeting is a single engine call. Priority lives in the
  // selector (slipping-direct > first-week > celebration > default rotation);
  // the default pool replaced the old static line, so a brand-new user with no
  // goals still gets a greeting. rng is seeded by the day (stable across
  // re-renders, rotates tomorrow) and excludes yesterday's day-seeded pick, so
  // the default rotation is anti-repeating with no persisted state.
  const greetingText = useMemo(() => {
    const lastGreetingId = previousDayGreetingDefaultId(todayStr);
    const moment = selectMoment('greeting', momentCtx, {
      rng: dayHashRng(todayStr),
      lastMomentIds: lastGreetingId ? { greetingDefault: lastGreetingId } : undefined,
    });
    // The greeting surface always resolves from the default pool; '' only if
    // the registry were emptied (Jest walks it, so it cannot ship empty).
    return moment?.text ?? '';
  }, [momentCtx, todayStr]);

  // M4 (PL-5): the empty invitation distinguishes a brand-new user (no marks
  // ever, no logs ever) from one who cleared everything out. uniqueCounters
  // keeps soft-deleted marks; allEvents keeps soft-deleted logs — both are the
  // historical trace the derivation reads.
  const emptyMarksLine = useMemo(
    () => getEmptyStateCopy('focus', deriveFocusEmptyVariant(uniqueCounters, allEvents)).body,
    [uniqueCounters, allEvents],
  );

  // QC2-F: the rest line under a doneForWeek mark speaks in the mentor voice —
  // rest framed as part of the plan, not absence of it. Engine-owned words,
  // greeting-style stateless rotation: day+mark seeded rng (stable within a
  // day), yesterday's base pick excluded. The "Log one more" affordance next
  // to it is untouched; a met weekly target never blocks today's log.
  const restLineTextFor = useCallback(
    (markId: string) => {
      const lastId = previousDayRestLineId(todayStr, markId);
      const moment = selectMoment('restLine', momentCtx, {
        rng: dayHashRng(`${todayStr}:${markId}`),
        lastMomentIds: lastId ? { rest: lastId } : undefined,
        markDoneForWeek: true,
      });
      // Registry-walked, so the pool cannot ship empty; fallback is defensive.
      return moment?.text ?? 'Done for the week.';
    },
    [momentCtx, todayStr],
  );

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
        { text: 'Edit', onPress: () => router.push(`/mark/${markId}/edit` as any) },
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

  // A maintenance habit is retired, not deleted — a gentle ending, not destruction.
  const handleRetireMark = useCallback((markId: string, markName: string) => {
    Alert.alert(
      'Retire this habit?',
      `You've kept "${markName}" going. Ready to let it rest?`,
      [
        { text: 'Keep going', style: 'cancel' },
        {
          text: 'Retire',
          onPress: () => { deleteCounter(markId).catch(() => {}); },
        },
      ],
    );
  }, [deleteCounter]);

  // ── Mark row renderer (shared) ────────────────────────────────────────────

  const renderMarkRow = useCallback(
    (mark: Counter, isLast: boolean, dimmed = false, maintenance = false, celebrateIndex?: number) => {
      const weeklyCount = weeklyCountsMap.get(mark.id) ?? 0;
      const isDoneForWeek = markWeeklyState(mark, weeklyCount) === 'doneForWeek';
      const category = resolveMarkCategory(mark);

      const showRestLine =
        isDoneForWeek &&
        mark.frequency_kind !== 'abstinence' &&
        mark.frequency_kind !== 'fixed';

      return (
        <View key={mark.id}>
          <Swipeable
            renderRightActions={() => (
              <TouchableOpacity
                style={[styles.swipeDelete, { backgroundColor: maintenance ? c.inkMuted : c.danger }]}
                onPress={() =>
                  maintenance
                    ? handleRetireMark(mark.id, mark.name)
                    : handleDeleteMark(mark.id, mark.name)
                }
                activeOpacity={0.85}
              >
                <Text style={styles.swipeDeleteText}>{maintenance ? 'Retire' : 'Delete'}</Text>
              </TouchableOpacity>
            )}
            rightThreshold={80}
          >
            <View style={dimmed || isDoneForWeek ? styles.doneMarkWrap : undefined}>
              <MarkRow
                title={mark.name}
                category={category}
                icon={resolveMarkIcon(mark) ?? undefined}
                accent={getCategoryColorForMark(mark)}
                loggedToday={(todayCountsMap.get(mark.id) ?? 0) > 0}
                done={isDoneForWeek}
                onPress={() => router.push(`/mark/${mark.id}` as any)}
                onLog={() => handleQuickIncrement(mark.id)}
                onLongPress={() => handleMarkLongPress(mark.id, mark.name)}
                isLast={isLast}
                celebrateStamp={!maintenance && celebrateStamp != null ? celebrateStamp : undefined}
                celebrateIndex={celebrateIndex}
              />
            </View>
          </Swipeable>
          {showRestLine && (
            <View style={styles.restLineRow}>
              <Text style={[styles.restLineText, { color: c.inkMuted }]}>
                {restLineTextFor(mark.id)}
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
    [weeklyCountsMap, todayCountsMap, c, handleDeleteMark, handleRetireMark, handleMarkLongPress, handleQuickIncrement, router, celebrateStamp, restLineTextFor],
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
                    <GoalTitle title={goal.title} size="card" color={c.inkDark} style={styles.goalCardTitle} />
                    <CaretRight size={16} color={c.inkMuted} weight="bold" />
                  </TouchableOpacity>

                  {/* Due marks */}
                  {visibleDue.map((mark, idx) =>
                    renderMarkRow(mark, idx === visibleDue.length - 1 && doneMarks.length === 0 && hiddenCount === 0, false, false, idx)
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
                        renderMarkRow(mark, idx === doneMarks.length - 1, true, false, idx)
                      )}
                    </>
                  )}
                </View>
              );
            })}
          </View>
        )}

        {/* ── Daily habits (goal-less marks + maintenance habits from completed
            goals, one section per QC 2026-07-12). Maintenance rows keep their
            Retire swipe and goal-pressure exclusion; only the grouping merged. ── */}
        {(goallessMarks.length > 0 || maintenanceMarks.length > 0) && (
          <View style={styles.dailyHabitsSection}>
            <TouchableOpacity
              style={styles.dailyHabitsHeader}
              onPress={() => { void setDailyHabitsOpen(!dailyHabitsOpen); }}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityState={{ expanded: dailyHabitsOpen }}
            >
              <SectionLabel style={styles.sectionLabel}>DAILY HABITS</SectionLabel>
              <Text style={[styles.dailyHabitsToggle, { color: c.accent }]}>
                {dailyHabitsOpen ? 'Hide' : `Show ${goallessMarks.length + maintenanceMarks.length}`}
              </Text>
            </TouchableOpacity>

            {dailyHabitsOpen && (
              <View style={[styles.marksList, { backgroundColor: c.surface }]}>
                {goallessMarks.map((mark, idx) =>
                  renderMarkRow(mark, maintenanceMarks.length === 0 && idx === goallessMarks.length - 1, false, false, idx)
                )}
                {maintenanceMarks.map((mark, idx) =>
                  renderMarkRow(mark, idx === maintenanceMarks.length - 1, false, true)
                )}
              </View>
            )}
          </View>
        )}

        {/* ── Empty state (no marks at all) ── */}
        {activeCounters.length === 0 && !loading && (
          <View style={[styles.emptyMarks, { backgroundColor: c.surface }]}>
            <Breathing>
              <Plus size={20} color={c.inkMuted} weight="duotone" />
            </Breathing>
            <Text style={[styles.emptyMarksText, { color: c.inkMid }]}>
              {emptyMarksLine}
            </Text>
          </View>
        )}

        <View style={styles.bottomSpacer} />
      </ScrollView>

      <SpeedDialFAB />

      {/* PL-4 (M5): post-log voice line — overlay, never shifts rows.
          Founder bug 2 (2026-07-18): the tab bar is absolute at 64 + inset, so a
          fixed 80pt offset rendered the pill BEHIND it on notched phones. Offset
          from the real tab-bar + FAB zone (same 64 + insets.bottom the FAB uses). */}
      <VoiceLine bottomOffset={64 + insets.bottom + 16 + 56 + spacing.sm} />
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
    paddingTop: spacing.md + spacing.xs,
    paddingBottom: spacing.sm,
  },
  // The goal is the reason this card exists — it anchors the card, above the
  // greeting (xl) and well clear of body text, not one more white-text row.
  // Type lives in <GoalTitle>; this is layout-only (row flex + chevron gap).
  goalCardTitle: {
    flex: 1,
    marginRight: spacing.sm,
  },
  goalCardMeta: {
    fontFamily: fonts.sans,
    fontSize: fontSize.sm,
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
    gap: spacing.sm,
    ...shadow.card,
  },
  // Mentor voice line (PL-5): serifItalic like the greeting; inkMid, not
  // inkMuted — serif italics need the extra contrast step on light linen.
  emptyMarksText: {
    fontFamily: fonts.serifItalic,
    fontSize: fontSize.lg,
    lineHeight: 22,
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
