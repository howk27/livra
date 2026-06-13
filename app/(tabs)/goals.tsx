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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { format, parseISO } from 'date-fns';
import { DotsSixVertical, CaretRight } from 'phosphor-react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
  type SharedValue,
} from 'react-native-reanimated';
import { fonts, spacing, radius, themedColors } from '../../theme/tokens';
import { useEffectiveTheme } from '../../state/uiSlice';
import { LivraWordmark } from '../../components/ui/LivraWordmark';
import { QueueCard } from '../../components/ui/QueueCard';
import { SvgLogo } from '../../components/ui/SvgLogo';
import { SectionLabel } from '../../components/ui/SectionLabel';
import { useGoalsStore } from '../../state/goalsSlice';
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
  onPress: () => void;
}

function ActiveGoalCard({ goal, progress, threshold, canComplete, onPress }: ActiveGoalCardProps) {
  const theme = useEffectiveTheme();
  const c = themedColors(theme);
  const pct = threshold > 0 ? Math.min(100, (progress / threshold) * 100) : 0;
  const deadlineStr = goal.deadline_date ?? goal.target_date ?? null;

  return (
    <TouchableOpacity
      style={[styles.activeCard, { backgroundColor: c.forest }]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <View style={styles.activeTopRow}>
        <View style={[styles.activeBadge, { backgroundColor: c.mint + '33' }]}>
          <View style={[styles.activeDot, { backgroundColor: c.mint }]} />
          <Text style={[styles.activeBadgeText, { color: c.inkInverseMuted }]}>ACTIVE</Text>
        </View>
        <CaretRight size={18} color={c.inkInverseMuted} weight="bold" />
      </View>

      <Text style={[styles.activeTitle, { color: c.inkInverse }]} numberOfLines={2}>
        {goal.title}
      </Text>

      {goal.description ? (
        <Text style={[styles.activeDescription, { color: c.inkInverseMuted }]} numberOfLines={2}>
          {goal.description}
        </Text>
      ) : null}

      {/* Progress bar */}
      {threshold > 0 && (
        <View style={styles.progressSection}>
          <View style={[styles.progressTrack, { backgroundColor: c.inkInverse + '22' }]}>
            <View
              style={[
                styles.progressFill,
                { backgroundColor: c.mint, width: `${pct}%` as any },
              ]}
            />
          </View>
          <Text style={[styles.progressLabel, { color: c.inkInverseMuted }]}>
            {progress} / {threshold} check-ins
          </Text>
        </View>
      )}

      {/* Deadline */}
      {deadlineStr ? (
        <Text style={[styles.activeDeadline, { color: c.inkInverseMuted }]}>
          Due {format(parseISO(deadlineStr), 'MMM d, yyyy')}
        </Text>
      ) : null}

      {/* Ready to complete */}
      {canComplete && (
        <View style={[styles.completeCta, { backgroundColor: c.inkInverse + '15' }]}>
          <Text style={[styles.completeCtaText, { color: c.inkInverse }]}>
            Ready to complete
          </Text>
          <CaretRight size={14} color={c.inkInverse} weight="bold" />
        </View>
      )}
    </TouchableOpacity>
  );
}

// ── Draggable row ─────────────────────────────────────────────────────────────

interface DraggableRowProps {
  goal: Goal;
  sequenceNumber: number;
  index: number;
  count: number;
  slotHeight: SharedValue<number>;
  positions: SharedValue<Record<string, number>>;
  activeId: SharedValue<string | null>;
  onMeasure: (height: number) => void;
  onPress: () => void;
  onReorder: () => void;
}

function DraggableRow({
  goal,
  sequenceNumber,
  index,
  count,
  slotHeight,
  positions,
  activeId,
  onMeasure,
  onPress,
  onReorder,
}: DraggableRowProps) {
  const theme = useEffectiveTheme();
  const c = themedColors(theme);
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
      translateY.value = withSpring(0, { damping: 20, stiffness: 200 });
      isActive.value = false;
      activeId.value = null;
      if (finalSlot !== startSlot.value) {
        runOnJS(commitReorder)();
      }
    })
    .onFinalize(() => {
      if (isActive.value) {
        translateY.value = withSpring(0, { damping: 20, stiffness: 200 });
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
      : withSpring(restingOffset, { damping: 22, stiffness: 220 });
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
      <TouchableOpacity onPress={onPress} activeOpacity={0.8}>
        <QueueCard title={goal.title} sequenceNumber={sequenceNumber} />
      </TouchableOpacity>
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

interface DraggableQueueListProps {
  goals: Goal[];
  sequenceOffset: number;
  onPressGoal: (goalId: string) => void;
}

function DraggableQueueList({ goals, sequenceOffset, onPressGoal }: DraggableQueueListProps) {
  const reorderQueue = useGoalsStore((s) => s.reorderQueue);

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
    void reorderQueue(ordered.map((g) => g.id));
  }, [goals, positions, reorderQueue]);

  return (
    <View style={styles.listWrapper}>
      {goals.map((goal, index) => (
        <DraggableRow
          key={goal.id}
          goal={goal}
          index={index}
          count={goals.length}
          sequenceNumber={sequenceOffset + index + 1}
          slotHeight={slotHeight}
          positions={positions}
          activeId={activeId}
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
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const goals = useGoalsStore((s) => s.goals);
  const isLoading = useGoalsStore((s) => s.isLoading);
  const error = useGoalsStore((s) => s.error);
  const getGoalProgress = useGoalsStore((s) => s.getGoalProgress);
  const getActiveGoal = useGoalsStore((s) => s.getActiveGoal);
  const getQueuedGoals = useGoalsStore((s) => s.getQueuedGoals);
  const getCompletedGoals = useGoalsStore((s) => s.getCompletedGoals);

  const active = useMemo(() => getActiveGoal(), [getActiveGoal, goals]);
  const queued = useMemo(() => getQueuedGoals(), [getQueuedGoals, goals]);
  const completedCount = useMemo(() => getCompletedGoals().length, [getCompletedGoals, goals]);

  const activeProgress = useMemo(
    () => (active ? getGoalProgress(active.id) : null),
    [active, getGoalProgress],
  );

  const isEmpty = !isLoading && !active && queued.length === 0;

  const handleAddGoal = useCallback(() => {
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
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={[styles.topBlock, { paddingTop: insets.top + 8 }]}>
          <View style={styles.topRow}>
            <LivraWordmark fontSize={28} letterSpacing={5} color={c.inkDark} />
            <TouchableOpacity
              style={[styles.addBtn, { backgroundColor: c.forest }]}
              onPress={handleAddGoal}
              activeOpacity={0.85}
            >
              <Text style={[styles.addBtnText, { color: c.inkInverse }]}>+ Goal</Text>
            </TouchableOpacity>
          </View>
          <Text style={[styles.subtitle, { color: c.inkMuted }]}>Your goals, one at a time.</Text>
        </View>

        {/* Error banner */}
        {error ? (
          <View style={[styles.errorBanner, { backgroundColor: c.danger + '22' }]}>
            <Text style={[styles.errorText, { color: c.danger }]}>{error}</Text>
          </View>
        ) : null}

        {/* Loading */}
        {isLoading && (
          <View style={styles.loadingState}>
            <ActivityIndicator size="small" color={c.forest} />
          </View>
        )}

        {/* Empty state */}
        {isEmpty && (
          <View style={styles.emptyState}>
            <View style={{ opacity: 0.35 }}>
              <SvgLogo color={c.inkMuted} width={32} height={16} />
            </View>
            <Text style={[styles.emptyTitle, { color: c.inkDark }]}>No goals yet.</Text>
            <Text style={[styles.emptySubtitle, { color: c.inkMuted }]}>
              Add your first goal to begin.
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

        {/* Active goal */}
        {active && activeProgress && (
          <>
            <SectionLabel style={styles.sectionLabel}>ACTIVE</SectionLabel>
            <ActiveGoalCard
              goal={active}
              progress={activeProgress.progress}
              threshold={activeProgress.threshold}
              canComplete={activeProgress.canComplete}
              onPress={() => handleOpenGoal(active.id)}
            />
          </>
        )}

        {/* Up next (queued, draggable) */}
        {queued.length > 0 && (
          <>
            <SectionLabel style={styles.sectionLabel}>UP NEXT</SectionLabel>
            <DraggableQueueList
              goals={queued}
              sequenceOffset={active ? 1 : 0}
              onPressGoal={handleOpenGoal}
            />
          </>
        )}

        {/* Completed */}
        {completedCount > 0 && (
          <>
            <SectionLabel style={styles.sectionLabel}>COMPLETED</SectionLabel>
            <TouchableOpacity
              style={[styles.completedRow, { backgroundColor: c.surface }]}
              onPress={handleViewCompleted}
              activeOpacity={0.8}
            >
              <Text style={[styles.completedLabel, { color: c.inkMid }]}>
                {completedCount} goal{completedCount !== 1 ? 's' : ''} completed
              </Text>
              <CaretRight size={16} color={c.inkMuted} weight="regular" />
            </TouchableOpacity>
          </>
        )}

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scroll: { flex: 1 },
  content: { flexGrow: 1, paddingBottom: 120 },

  topBlock: { paddingHorizontal: spacing.lg },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  subtitle: {
    fontFamily: fonts.serifItalic,
    fontSize: 16,
    marginTop: 4,
    marginBottom: 24,
  },
  addBtn: {
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  addBtnText: {
    fontFamily: fonts.sansMedium,
    fontSize: 13,
  },

  sectionLabel: {
    marginBottom: 12,
    paddingHorizontal: spacing.lg,
  },

  // Active card
  activeCard: {
    marginHorizontal: spacing.lg,
    borderRadius: radius.xl,
    padding: spacing.lg,
  },
  activeTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  activeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  activeBadgeText: {
    fontFamily: fonts.sansMedium,
    fontSize: 10,
    letterSpacing: 0.8,
  },
  activeTitle: {
    fontFamily: fonts.serif,
    fontSize: 28,
    lineHeight: 34,
  },
  activeDescription: {
    fontFamily: fonts.sans,
    fontSize: 14,
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
    fontSize: 12,
  },
  activeDeadline: {
    fontFamily: fonts.sans,
    fontSize: 12,
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
    fontSize: 13,
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

  // Completed row
  completedRow: {
    marginHorizontal: spacing.lg,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  completedLabel: {
    fontFamily: fonts.sans,
    fontSize: 14,
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
    fontSize: 13,
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
    fontSize: 22,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  emptySubtitle: {
    fontFamily: fonts.sans,
    fontSize: 14,
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
    fontSize: 15,
  },

  bottomSpacer: { height: spacing.xxl },
});
