import React, { useMemo, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
  type SharedValue,
} from 'react-native-reanimated';

// ── Design tokens ─────────────────────────────────────────────────────────────
import { fonts, spacing, themedColors } from '../../theme/tokens';
import { useEffectiveTheme } from '../../state/uiSlice';

// ── New UI components ─────────────────────────────────────────────────────────
import { LivraHeader } from '../../components/ui/LivraHeader';
import { LivraWordmark } from '../../components/ui/LivraWordmark';
import { QueueCard } from '../../components/ui/QueueCard';
import { SvgLogo } from '../../components/ui/SvgLogo';
import { SpeedDialFAB } from '../../components/ui/SpeedDialFAB';

// ── Existing data hooks / state — DO NOT MODIFY ───────────────────────────────
import { useGoalsStore } from '../../state/goalsSlice';
import { useAuth } from '../../hooks/useAuth';
import { useIapSubscriptions } from '../../hooks/useIapSubscriptions';
import type { Goal } from '../../types/goal';

// ── Drag-to-reorder constants ─────────────────────────────────────────────────
// Vertical gap between draggable queue cards (matches styles.queueCard marginTop).
const CARD_GAP = spacing.md;
const ACTIVE_SCALE = 1.03;

/**
 * Clamp a value between a lower and upper bound. Used on the UI thread.
 */
function clamp(value: number, lower: number, upper: number): number {
  'worklet';
  return Math.max(lower, Math.min(value, upper));
}

// ── Draggable row ─────────────────────────────────────────────────────────────

interface DraggableRowProps {
  goal: Goal;
  sequenceNumber: number;
  /** Index of this row within the draggable list. */
  index: number;
  /** Total number of draggable rows. */
  count: number;
  /** Shared slot height (card height + gap). 0 until measured. */
  slotHeight: SharedValue<number>;
  /**
   * Live ordering: positions[goalId] = current slot index. Mutating this
   * shared value reflows every other row during a drag.
   */
  positions: SharedValue<Record<string, number>>;
  /** Id of the row currently being dragged, or null. */
  activeId: SharedValue<string | null>;
  onMeasure: (height: number) => void;
  onAdd: () => void;
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
  onAdd,
  onReorder,
}: DraggableRowProps) {
  const theme = useEffectiveTheme();
  const c = themedColors(theme);
  // translateY relative to this row's resting slot position.
  const translateY = useSharedValue(0);
  const isActive = useSharedValue(false);
  // Captures the slot index at the moment the drag started.
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
    // Long-press threshold before the drag activates so vertical scrolling
    // still works on a quick swipe.
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

      // Which slot does the row's center currently overlap?
      const currentSlot = positions.value[goal.id] ?? index;
      const shift = Math.round(e.translationY / slotHeight.value);
      const targetSlot = clamp(startSlot.value + shift, 0, count - 1);

      if (targetSlot !== currentSlot) {
        const next = { ...positions.value };
        // Find whoever currently occupies targetSlot and swap it toward the
        // vacated slot, shifting intermediate rows by one.
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
      // Snap the dragged row into its resting slot.
      translateY.value = withSpring(0, { damping: 20, stiffness: 200 });
      isActive.value = false;
      activeId.value = null;
      if (finalSlot !== startSlot.value) {
        runOnJS(commitReorder)();
      }
    })
    .onFinalize(() => {
      // Safety reset if the gesture is cancelled/interrupted mid-drag.
      if (isActive.value) {
        translateY.value = withSpring(0, { damping: 20, stiffness: 200 });
        isActive.value = false;
        if (activeId.value === goal.id) activeId.value = null;
      }
    });

  const animatedStyle = useAnimatedStyle(() => {
    const slot = positions.value[goal.id] ?? index;
    const dragging = isActive.value;
    // Resting offset = distance from the row's natural index to its live slot.
    const restingOffset = (slot - index) * slotHeight.value;
    const y = dragging ? translateY.value : withSpring(restingOffset, { damping: 22, stiffness: 220 });

    return {
      transform: [
        { translateY: y },
        { scale: dragging ? withTiming(ACTIVE_SCALE, { duration: 120 }) : withTiming(1, { duration: 120 }) },
      ],
      zIndex: dragging ? 100 : 1,
      // Elevated shadow while dragging.
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
      <QueueCard title={goal.title} sequenceNumber={sequenceNumber} onAdd={onAdd} />
      {count > 1 && (
        <GestureDetector gesture={pan}>
          <Animated.View style={styles.dragHandle} hitSlop={spacing.sm}>
            <Ionicons name="reorder-three-outline" size={24} color={c.inkMuted} />
          </Animated.View>
        </GestureDetector>
      )}
    </Animated.View>
  );
}

// ── Draggable list ────────────────────────────────────────────────────────────

interface DraggableQueueListProps {
  /** Ordered list of draggable goals (resting order). */
  goals: Goal[];
  /** Sequence number offset (hero is 1, so first draggable is offset+1). */
  sequenceOffset: number;
  /**
   * Queued goal ids that precede the draggable list and must stay fixed at the
   * front of the order passed to reorderQueue (e.g. the hero when no goal is
   * active). Empty when an active goal occupies the hero slot.
   */
  fixedPrefixIds: string[];
  onAdd: () => void;
}

function DraggableQueueList({
  goals,
  sequenceOffset,
  fixedPrefixIds,
  onAdd,
}: DraggableQueueListProps) {
  const reorderQueue = useGoalsStore((s) => s.reorderQueue);

  const slotHeight = useSharedValue(0);
  const activeId = useSharedValue<string | null>(null);
  const positions = useSharedValue<Record<string, number>>(
    Object.fromEntries(goals.map((g, i) => [g.id, i])),
  );

  // Keep the positions map in sync when the underlying goal list changes
  // (e.g. after a reorder commit or a goal added/removed/completed).
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
    // Build the new draggable order from the live positions map.
    const ordered = [...goals].sort(
      (a, b) => (positions.value[a.id] ?? 0) - (positions.value[b.id] ?? 0),
    );
    const orderedIds = [...fixedPrefixIds, ...ordered.map((g) => g.id)];
    void reorderQueue(orderedIds);
  }, [goals, fixedPrefixIds, positions, reorderQueue]);

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
          onAdd={onAdd}
          onReorder={handleReorder}
        />
      ))}
    </View>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function QueueScreen() {
  const theme = useEffectiveTheme();
  const c = themedColors(theme);
  const router = useRouter();
  const { user } = useAuth();
  const { isProUnlocked } = useIapSubscriptions();

  const goals = useGoalsStore((s) => s.goals);
  const isLoading = useGoalsStore((s) => s.isLoading);

  const active = useMemo(() => goals.find((g) => g.status === 'active'), [goals]);
  const queued = useMemo(
    () => goals.filter((g) => g.status === 'queued').sort((a, b) => a.sort_index - b.sort_index),
    [goals],
  );

  const isEmpty = !active && queued.length === 0;

  const handleAddGoal = useCallback(() => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push({ pathname: '/goal/queue' });
  }, [router]);

  const heroGoal = active ?? queued[0] ?? null;
  // When an active goal occupies the hero, all queued goals are draggable.
  // Otherwise the hero is queued[0] and the rest are draggable.
  const draggableGoals = active ? queued : queued.slice(1);
  // If queued[0] is the hero (no active goal), it must remain first in the
  // order we send to reorderQueue.
  const fixedPrefixIds = active ? [] : queued.slice(0, 1).map((g) => g.id);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <View style={[styles.screen, { backgroundColor: c.linen }]}>
      {/* Header — no centerLogo, no title */}
      <LivraHeader />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Brand wordmark + section title ── */}
        <View style={styles.topBlock}>
          <LivraWordmark fontSize={28} letterSpacing={5} color={c.inkDark} />
          <Text style={[styles.sectionTitle, { color: c.inkDark }]}>Guided Task Progress</Text>
          <Text style={[styles.sectionSubtitle, { color: c.inkMid }]}>Your sequential path to achieving goals.</Text>
        </View>

        {/* ── Empty state ── */}
        {isEmpty && (
          <View style={styles.emptyState}>
            <SvgLogo color={c.inkMuted} width={40} height={20} />
            <Text style={[styles.emptyTitle, { color: c.inkDark }]}>No goals yet.</Text>
            <Text style={[styles.emptySubtitle, { color: c.inkMid }]}>Add your first goal to begin.</Text>
          </View>
        )}

        {/* ── Hero card (first / active goal) ── */}
        {heroGoal && (
          <QueueCard
            isHero
            title={heroGoal.title}
            description={heroGoal.description}
            sequenceNumber={1}
            onAdd={handleAddGoal}
            style={styles.heroCard}
          />
        )}

        {/* ── Draggable queue cards (remaining goals) ── */}
        {draggableGoals.length > 0 && (
          <DraggableQueueList
            goals={draggableGoals}
            sequenceOffset={1}
            fixedPrefixIds={fixedPrefixIds}
            onAdd={handleAddGoal}
          />
        )}

        {/* Bottom padding for FAB + tab bar */}
        <View style={styles.bottomSpacer} />
      </ScrollView>

      <SpeedDialFAB />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingBottom: 120,
  },

  // Top text block
  topBlock: {
    paddingHorizontal: spacing.lg,
    marginTop: spacing.lg,
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    fontFamily: fonts.serif,
    fontSize: 28,
    marginTop: spacing.lg,
  },
  sectionSubtitle: {
    fontFamily: fonts.sans,
    fontSize: 15,
    marginTop: spacing.xs,
  },

  // Hero card
  heroCard: {
    marginHorizontal: spacing.lg,
  },

  // Draggable list
  listWrapper: {
    marginTop: spacing.md,
  },
  draggableRow: {
    marginHorizontal: spacing.lg,
    marginTop: CARD_GAP,
    // Position the drag handle on the right edge of the card.
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

  // Empty state
  emptyState: {
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    gap: spacing.md,
  },
  emptyTitle: {
    fontFamily: fonts.serifSemibold,
    fontSize: 24,
    textAlign: 'center',
    marginTop: spacing.lg,
  },
  emptySubtitle: {
    fontFamily: fonts.sans,
    fontSize: 15,
    textAlign: 'center',
  },
  // Bottom spacer
  bottomSpacer: {
    height: spacing.xxl,
  },
});
