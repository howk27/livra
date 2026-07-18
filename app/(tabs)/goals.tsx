import React, { useMemo, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Platform,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { format, parseISO } from 'date-fns';
import { DotsSixVertical, CaretRight } from 'phosphor-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
  type SharedValue,
} from 'react-native-reanimated';
import { fonts, spacing, radius, themedColors, fontSize } from '../../theme/tokens';
import { useEffectiveTheme } from '../../state/uiSlice';
import { LivraHeader } from '../../components/ui/LivraHeader';
import { SpeedDialFAB } from '../../components/ui/SpeedDialFAB';
import { SvgLogo } from '../../components/ui/SvgLogo';
import { Breathing } from '../../components/ui/Breathing';
import { SectionLabel } from '../../components/ui/SectionLabel';
import { GoalTitle } from '../../components/ui/GoalTitle';
import { HistoryRow } from '../../components/goals/HistoryRow';
import { useGoalsStore } from '../../state/goalsSlice';
import { useMarksStore } from '../../state/countersSlice';
import { useEventsStore } from '../../state/eventsSlice';
import { currentWeekDates, computeCompletionsThisWeek } from '../../lib/features';
import { deriveGoalsEmptyKind, getEmptyStateCopy } from '../../lib/moments/emptyState';
import { applyOpacity } from '../../src/components/icons/color';
import type { Goal } from '../../types/goal';

// ── Drag-to-reorder constants ─────────────────────────────────────────────────
const CARD_GAP = spacing.md;
const ACTIVE_SCALE = 1.03;

function clamp(value: number, lower: number, upper: number): number {
  'worklet';
  return Math.max(lower, Math.min(value, upper));
}

// ── Active goal progress card ─────────────────────────────────────────────────

interface ActiveGoalCardProps {
  goal: Goal;
  progress: number;
  threshold: number;
  canComplete: boolean;
  /** M7: the full commitment is in — the card invites the claim. */
  readyToClaim?: boolean;
  /** True when threshold is the creation-time commitment (day-based copy). */
  hasCommitment?: boolean;
  /** Check-ins completed this week across the goal's marks. */
  weeklyDone?: number;
  /** Sum of this week's targets across the goal's marks. */
  weeklyTarget?: number;
  onPress: () => void;
}

function ActiveGoalCard({ goal, progress, threshold, canComplete, readyToClaim = false, hasCommitment = false, weeklyDone = 0, weeklyTarget = 0, onPress }: ActiveGoalCardProps) {
  const theme = useEffectiveTheme();
  const c = themedColors(theme);
  const pct = threshold > 0 ? Math.min(100, (progress / threshold) * 100) : 0;
  const deadlineStr = goal.deadline_date ?? goal.target_date ?? null;

  // Hollow card: hairline accent border + translucent forest wash over the
  // linen ground (FU-5). `c.accent` is forest on light / mint on dark, so the
  // same expressions resolve to a contrast-safe accent in both modes. The
  // dark wash runs slightly denser because the dark ground swallows low alphas.
  const cardWash = applyOpacity(c.forest, theme === 'dark' ? 0.1 : 0.07);
  const cardBorder = applyOpacity(c.accent, 0.55);

  return (
    <TouchableOpacity
      style={[styles.activeCard, { backgroundColor: cardWash, borderColor: cardBorder }]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <View style={styles.activeTopRow}>
        <View style={[styles.activeDot, { backgroundColor: c.accent }]} />
        {!canComplete && <CaretRight size={18} color={c.inkMid} weight="bold" />}
      </View>

      <GoalTitle title={goal.title} size="card" color={c.inkDark} />

      {goal.description ? (
        <Text style={[styles.activeDescription, { color: c.inkMid }]} numberOfLines={2}>
          {goal.description}
        </Text>
      ) : null}

      {/* Progress bar */}
      {threshold > 0 && (
        <View style={styles.progressSection}>
          <View style={[styles.progressTrack, { backgroundColor: applyOpacity(c.accent, 0.16) }]}>
            {/* QC3-E: same `progressGradient` (amber→ember) the goal-detail ring
                uses, so the two progress surfaces read as one family. */}
            <LinearGradient
              colors={c.progressGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[styles.progressFill, { width: `${pct}%` as any }]}
            />
          </View>
          <Text style={[styles.progressLabel, { color: c.inkMid }]}>
            {hasCommitment ? `${progress} / ${threshold} check-in days` : `${progress} / ${threshold} check-ins`}
          </Text>
        </View>
      )}

      {/* This week — the working-toward-it line (QC 2026-07-12) */}
      {weeklyTarget > 0 && (
        <Text style={[styles.weeklyLine, { color: c.accent }]}>
          {weeklyDone >= weeklyTarget
            ? 'This week: all done'
            : `This week: ${weeklyDone} of ${weeklyTarget} check-ins`}
        </Text>
      )}

      {/* Deadline */}
      {deadlineStr ? (
        <Text style={[styles.activeDeadline, { color: c.inkMid }]}>
          Due {format(parseISO(deadlineStr), 'MMM d, yyyy')}
        </Text>
      ) : null}

      {/* Ready to complete / claim (M7: user declares, so claim leads) */}
      {(readyToClaim || canComplete) && (
        <View style={[styles.completeCta, { backgroundColor: applyOpacity(c.accent, 0.12) }]}>
          <Text style={[styles.completeCtaText, { color: c.accent }]}>
            {readyToClaim ? 'All check-ins in. Claim it' : 'Ready to complete'}
          </Text>
          <CaretRight size={14} color={c.accent} weight="bold" />
        </View>
      )}
    </TouchableOpacity>
  );
}

// ── Draggable row ─────────────────────────────────────────────────────────────

interface DraggableRowProps {
  goal: Goal;
  index: number;
  count: number;
  slotHeight: SharedValue<number>;
  positions: SharedValue<Record<string, number>>;
  activeId: SharedValue<string | null>;
  weekly?: { done: number; target: number };
  onMeasure: (height: number) => void;
  onPress: () => void;
  onReorder: () => void;
}

function DraggableRow({
  goal,
  index,
  count,
  slotHeight,
  positions,
  activeId,
  weekly,
  onMeasure,
  onPress,
  onReorder,
}: DraggableRowProps) {
  const theme = useEffectiveTheme();
  const c = themedColors(theme);
  const getGoalProgress = useGoalsStore((s) => s.getGoalProgress);
  const progress = getGoalProgress(goal.id);
  const translateY = useSharedValue(0);
  const isActive = useSharedValue(false);
  const startSlot = useSharedValue(index);

  const triggerHaptic = useCallback(() => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
  }, []);

  const commitReorder = useCallback(() => {
    onReorder();
  }, [onReorder]);

  const pan = Gesture.Pan()
    .activateAfterLongPress(220)
    .onStart(() => {
      isActive.value = true;
      activeId.value = goal.id;
      startSlot.value = positions.value[goal.id] ?? index;
      runOnJS(triggerHaptic)();
    })
    .onUpdate((e) => {
      if (slotHeight.value <= 0) return;
      translateY.value = e.translationY;
      const currentSlot = positions.value[goal.id] ?? index;
      const shift = Math.round(e.translationY / slotHeight.value);
      const targetSlot = clamp(startSlot.value + shift, 0, count - 1);
      if (targetSlot !== currentSlot) {
        const next = { ...positions.value };
        for (const id in next) {
          if (id === goal.id) continue;
          const slot = next[id];
          if (currentSlot < targetSlot && slot > currentSlot && slot <= targetSlot) {
            next[id] = slot - 1;
          } else if (currentSlot > targetSlot && slot < currentSlot && slot >= targetSlot) {
            next[id] = slot + 1;
          }
        }
        next[goal.id] = targetSlot;
        positions.value = next;
      }
    })
    .onEnd(() => {
      const finalSlot = positions.value[goal.id] ?? index;
      translateY.value = withTiming(0, { duration: 220 });
      isActive.value = false;
      activeId.value = null;
      if (finalSlot !== startSlot.value) {
        runOnJS(commitReorder)();
      }
    })
    .onFinalize(() => {
      if (isActive.value) {
        translateY.value = withTiming(0, { duration: 220 });
        isActive.value = false;
        if (activeId.value === goal.id) activeId.value = null;
      }
    });

  const animatedStyle = useAnimatedStyle(() => {
    const slot = positions.value[goal.id] ?? index;
    const dragging = isActive.value;
    const restingOffset = (slot - index) * slotHeight.value;
    const y = dragging
      ? translateY.value
      : withTiming(restingOffset, { duration: 220 });
    return {
      transform: [
        { translateY: y },
        { scale: dragging ? withTiming(ACTIVE_SCALE, { duration: 120 }) : withTiming(1, { duration: 120 }) },
      ],
      zIndex: dragging ? 100 : 1,
      shadowColor: '#1C3830',
      shadowOffset: { width: 0, height: dragging ? 8 : 0 },
      shadowOpacity: withTiming(dragging ? 0.18 : 0, { duration: 120 }),
      shadowRadius: dragging ? 16 : 0,
      elevation: dragging ? 12 : 0,
    };
  });

  const handleLayout = useCallback(
    (e: { nativeEvent: { layout: { height: number } } }) => {
      onMeasure(e.nativeEvent.layout.height);
    },
    [onMeasure],
  );

  return (
    <Animated.View
      style={[styles.draggableRow, animatedStyle]}
      onLayout={index === 0 ? handleLayout : undefined}
    >
      <ActiveGoalCard
        goal={goal}
        progress={progress.progress}
        threshold={progress.threshold}
        canComplete={progress.canComplete}
        readyToClaim={progress.readyToClaim}
        hasCommitment={progress.target !== null}
        weeklyDone={weekly?.done}
        weeklyTarget={weekly?.target}
        onPress={onPress}
      />
      {count > 1 && (
        <GestureDetector gesture={pan}>
          <Animated.View style={styles.dragHandle} hitSlop={spacing.sm}>
            <DotsSixVertical size={22} color={c.inkMuted} weight="regular" />
          </Animated.View>
        </GestureDetector>
      )}
    </Animated.View>
  );
}

// ── Draggable list ────────────────────────────────────────────────────────────

interface DraggableGoalListProps {
  goals: Goal[];
  weeklyByGoal: Map<string, { done: number; target: number }>;
  onPressGoal: (goalId: string) => void;
}

function DraggableGoalList({ goals, weeklyByGoal, onPressGoal }: DraggableGoalListProps) {
  const reorderGoals = useGoalsStore((s) => s.reorderGoals);

  const slotHeight = useSharedValue(0);
  const activeId = useSharedValue<string | null>(null);
  const positions = useSharedValue<Record<string, number>>(
    Object.fromEntries(goals.map((g, i) => [g.id, i])),
  );

  const goalIdsKey = goals.map((g) => g.id).join('|');
  React.useEffect(() => {
    positions.value = Object.fromEntries(goals.map((g, i) => [g.id, i]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goalIdsKey]);

  const handleMeasure = useCallback(
    (height: number) => {
      if (height > 0) slotHeight.value = height + CARD_GAP;
    },
    [slotHeight],
  );

  const handleReorder = useCallback(() => {
    const ordered = [...goals].sort(
      (a, b) => (positions.value[a.id] ?? 0) - (positions.value[b.id] ?? 0),
    );
    void reorderGoals(ordered.map((g) => g.id));
  }, [goals, positions, reorderGoals]);

  return (
    <View style={styles.listWrapper}>
      {goals.map((goal, index) => (
        <DraggableRow
          key={goal.id}
          goal={goal}
          index={index}
          count={goals.length}
          slotHeight={slotHeight}
          positions={positions}
          activeId={activeId}
          weekly={weeklyByGoal.get(goal.id)}
          onMeasure={handleMeasure}
          onPress={() => onPressGoal(goal.id)}
          onReorder={handleReorder}
        />
      ))}
    </View>
  );
}

// ── Goals Screen ──────────────────────────────────────────────────────────────

export default function GoalsScreen() {
  const theme = useEffectiveTheme();
  const c = themedColors(theme);
  const router = useRouter();

  const goals = useGoalsStore((s) => s.goals);
  const isLoading = useGoalsStore((s) => s.isLoading);
  const error = useGoalsStore((s) => s.error);
  const getActiveGoals = useGoalsStore((s) => s.getActiveGoals);
  const getCompletedGoals = useGoalsStore((s) => s.getCompletedGoals);

  const active = useMemo(() => getActiveGoals(), [getActiveGoals, goals]);
  const completedCount = useMemo(() => getCompletedGoals().length, [getCompletedGoals, goals]);

  // Per-goal "this week" aggregate — same computation Focus uses per mark,
  // summed across each goal's linked marks.
  const marks = useMarksStore((s) => s.marks);
  const allEvents = useEventsStore((s) => s.events || []);
  const weeklyByGoal = useMemo(() => {
    const weekDates = currentWeekDates();
    const map = new Map<string, { done: number; target: number }>();
    for (const goal of active) {
      let done = 0;
      let target = 0;
      for (const mark of marks) {
        if (mark.goal_id !== goal.id || mark.deleted_at) continue;
        const markTarget = mark.weekly_target ?? (mark.frequency_kind === 'variable' ? 3 : 7);
        const markEvents = allEvents.filter((e) => e.mark_id === mark.id && !e.deleted_at);
        done += Math.min(computeCompletionsThisWeek(mark, markEvents, weekDates), markTarget);
        target += markTarget;
      }
      map.set(goal.id, { done, target });
    }
    return map;
  }, [active, marks, allEvents]);

  const isEmpty = !isLoading && active.length === 0;

  // M4 (PL-5): brand-new user vs cleared-everything vs finished-everything.
  // Deleted goals leave the store, so soft-deleted marks that kept a goal_id
  // are the trace; completed goals outrank the generic returnedEmpty line.
  const emptyCopy = useMemo(
    () => getEmptyStateCopy('goals', deriveGoalsEmptyKind(goals, marks)),
    [goals, marks],
  );

  const handleAddGoal = useCallback(() => {
    // QC3-A: "+ Goal" routes straight into goal/new (GoalPathSheet deleted; the
    // amber AIHatchButton on that screen is now the only AI door).
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push('/goal/new');
  }, [router]);

  const handleOpenGoal = useCallback(
    (goalId: string) => {
      router.push(`/goal/${goalId}` as any);
    },
    [router],
  );

  const handleViewCompleted = useCallback(() => {
    router.push('/goal/history');
  }, [router]);

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <View style={[styles.screen, { backgroundColor: c.linen }]}>
      {/* Batch 2 (founder): the wordmark and the "+ Goal" CTA are gone — the
          header is the avatar, same grammar as Focus. Creation moves to the
          SpeedDialFAB below, one consistent add-door on both tabs.
          QC-FAIL-5 (founder): the subtitle moves ONTO the avatar row (left text,
          avatar right), so it sits "at the same level as the avatar" instead of
          below the header. */}
      <LivraHeader showAvatar subtitle="Your goals, one at a time." />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Error banner */}
        {error ? (
          <View style={[styles.errorBanner, { backgroundColor: applyOpacity(c.danger, 0.13) }]}>
            <Text style={[styles.errorText, { color: c.danger }]}>{error}</Text>
          </View>
        ) : null}

        {/* Loading */}
        {isLoading && (
          <View style={styles.loadingState}>
            <ActivityIndicator size="small" color={c.accent} />
          </View>
        )}

        {/* Empty state */}
        {isEmpty && (
          <View style={styles.emptyState}>
            <Breathing>
              <View style={{ opacity: 0.35 }}>
                <SvgLogo color={c.inkMuted} width={32} height={16} />
              </View>
            </Breathing>
            <Text style={[styles.emptyTitle, { color: c.inkDark }]}>
              {emptyCopy.title}
            </Text>
            <Text style={[styles.emptySubtitle, { color: c.inkMid }]}>
              {emptyCopy.body}
            </Text>
            <TouchableOpacity
              style={[styles.emptyAddBtn, { backgroundColor: c.forest }]}
              onPress={handleAddGoal}
              activeOpacity={0.85}
            >
              <Text style={[styles.emptyAddBtnText, { color: c.inkInverse }]}>Add a goal</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Active goals — draggable list */}
        {active.length > 0 && (
          <>
            <SectionLabel style={styles.sectionLabel}>ACTIVE</SectionLabel>
            <DraggableGoalList
              goals={active}
              weeklyByGoal={weeklyByGoal}
              onPressGoal={handleOpenGoal}
            />
          </>
        )}

        {/* History — always reachable (free per PRODUCT.md:436), but out of the
            drag list's gravity: a quiet text button anchored bottom right. */}
        <HistoryRow completedCount={completedCount} onPress={handleViewCompleted} />

        <View style={styles.bottomSpacer} />
      </ScrollView>

      {/* Batch 2: the add-door, since the header CTA is gone. */}
      <SpeedDialFAB />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scroll: { flex: 1 },
  // QC-FAIL-5: the subtitle's old 24pt marginBottom moves here as top breathing
  // room, now that the line lives in the header row above.
  content: { flexGrow: 1, paddingTop: spacing.md, paddingBottom: 120 },

  sectionLabel: {
    marginBottom: 12,
    paddingHorizontal: spacing.lg,
  },

  // Active card. No own horizontal margin — the draggableRow wrapper carries the
  // screen gutter (doubling it made goal cards narrower than sibling blocks).
  activeCard: {
    borderRadius: radius.xl,
    borderWidth: 1,
    padding: spacing.lg,
  },
  activeTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  activeDescription: {
    fontFamily: fonts.sans,
    fontSize: fontSize.base,
    marginTop: spacing.xs,
  },
  progressSection: {
    marginTop: spacing.md,
    gap: spacing.xs,
  },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  progressLabel: {
    fontFamily: fonts.sans,
    fontSize: fontSize.sm,
  },
  weeklyLine: {
    fontFamily: fonts.sansMedium,
    fontSize: fontSize.sm,
    marginTop: spacing.sm,
  },
  activeDeadline: {
    fontFamily: fonts.sans,
    fontSize: fontSize.sm,
    marginTop: spacing.sm,
  },
  completeCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  completeCtaText: {
    fontFamily: fonts.sansMedium,
    fontSize: fontSize[13],
  },

  // Draggable list
  listWrapper: { marginTop: spacing.sm },
  draggableRow: {
    marginHorizontal: spacing.lg,
    marginTop: CARD_GAP,
    justifyContent: 'center',
  },
  dragHandle: {
    position: 'absolute',
    right: spacing.md,
    top: 0,
    bottom: 0,
    width: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Error banner
  errorBanner: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  errorText: {
    fontFamily: fonts.sans,
    fontSize: fontSize[13],
  },

  // Loading
  loadingState: {
    paddingVertical: spacing.xxl,
    alignItems: 'center',
  },

  // Empty state
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xxl,
  },
  emptyTitle: {
    fontFamily: fonts.serifSemibold,
    fontSize: fontSize[22],
    textAlign: 'center',
    marginTop: spacing.md,
  },
  // Mentor voice line (PL-5): serifItalic; inkMid for the contrast step serif
  // italics need on light linen (FU-5 precedent).
  emptySubtitle: {
    fontFamily: fonts.serifItalic,
    fontSize: fontSize.lg,
    lineHeight: 22,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  emptyAddBtn: {
    marginTop: spacing.lg,
    borderRadius: radius.full,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  emptyAddBtnText: {
    fontFamily: fonts.sansMedium,
    fontSize: fontSize.md,
  },

  bottomSpacer: { height: spacing.xxl },
});
