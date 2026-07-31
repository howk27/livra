import React, { useMemo, useCallback, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Platform,
  RefreshControl,
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
import { fonts, spacing, radius, themedColors, fontSize, motion, dragHandle } from '../../theme/tokens';
import { useEffectiveTheme } from '../../state/uiSlice';
import { LivraHeader } from '../../components/ui/LivraHeader';
import { SpeedDialFAB } from '../../components/ui/SpeedDialFAB';
import { SvgLogo } from '../../components/ui/SvgLogo';
import { Breathing } from '../../components/ui/Breathing';
import { SectionLabel } from '../../components/ui/SectionLabel';
import { Skeleton } from '../../components/ui/Skeleton';
import { GoalTitle } from '../../components/ui/GoalTitle';
import { HistoryRow } from '../../components/goals/HistoryRow';
import { useAuth } from '../../hooks/useAuth';
import { useGoalsStore } from '../../state/goalsSlice';
import { useReorderGoalsMutation } from '@/lib/data/mutations/goals';
import { useGoals } from '@/lib/data/goals';
import { useMarksByGoal } from '@/lib/data/marks';
import { asDataError } from '@/lib/data/errors';
import { caughtErrorCopy, dataErrorCopy } from '@/lib/copy';
import { useUserCheckins } from '@/lib/data/checkins';
import { totalsByMark } from '@/lib/data/derived';
import { currentWeekDates, computeCompletionsThisWeek } from '../../lib/features';
import {
  getActiveGoals,
  getCompletedGoals,
  calculateGoalProgress,
  calculateUnlockThreshold,
  goalCommitmentTarget,
} from '../../lib/goalLogic';
import { deriveGoalsEmptyKind, getEmptyStateCopy } from '../../lib/moments/emptyState';
import { applyOpacity } from '../../src/components/icons/color';
import { useMotion } from '../../hooks/useMotion';
import { GoalCardMedallion } from '../../components/goals/GoalCardMedallion';
import type { Goal } from '../../types/goal';
import type { Mark, MarkEvent, FrequencyKind } from '../../types';
import type { GoalRow, MarkRow, MarkEventRow } from '@/lib/data/types';
import type { TierId, FrequencyId } from '../../lib/goalMarkSuggestions';

// ── Drag-to-reorder constants ─────────────────────────────────────────────────
const CARD_GAP = spacing.md;
const ACTIVE_SCALE = 1.03;
/** Stable empty-marks reference so a goal with no marks keeps prop identity. */
const EMPTY_MARKS: Mark[] = [];

// ── M9 Phase 2: query-layer seam ──────────────────────────────────────────────
// This screen READS from lib/data/ (React Query) but its child components and the
// pure progress/weekly helpers are typed against the old domain models in `types/`.
// The strangler seam is bridged HERE: query rows (GoalRow/MarkRow/MarkEventRow) are
// mapped to the old `Goal`/`Mark`/`MarkEvent` shapes the unchanged children require,
// so rendering stays byte-for-byte identical. Writes are mutations as of Phase 3;
// these adapters die with the seam in Phase 5.

/** Stable empty references so an unresolved query keeps memo identity. */
const EMPTY_GOAL_ROWS: GoalRow[] = [];
const EMPTY_MARKS_BY_GOAL: Record<string, MarkRow[]> = {};
const EMPTY_CHECKIN_ROWS: MarkEventRow[] = [];

type GoalProgress = {
  progress: number;
  threshold: number;
  target: number | null;
  canComplete: boolean;
  readyToClaim: boolean;
};

/** Mirrors the old store's not-found fallback (goalsSlice.getGoalProgress). */
const ZERO_PROGRESS: GoalProgress = {
  progress: 0,
  threshold: 7,
  target: null,
  canComplete: false,
  readyToClaim: false,
};

function toGoal(row: GoalRow, linkedMarkIds: string[]): Goal {
  return {
    id: row.id,
    user_id: row.user_id,
    title: row.title,
    description: row.description ?? undefined,
    icon: row.icon ?? undefined,
    color: row.color ?? undefined,
    sort_index: row.sort_index,
    status: row.status as Goal['status'],
    target_mark_count: row.target_mark_count,
    current_mark_count: row.current_mark_count,
    deadline_date: row.deadline_date,
    // The server dropped `target_date`; the old store kept it in lock-step with
    // `deadline_date`, and ActiveGoalCard reads `deadline_date ?? target_date`, so
    // mirroring it keeps the rendered deadline identical.
    target_date: row.deadline_date,
    completed_at: row.completed_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    milestones_fired: Array.isArray(row.milestones_fired)
      ? (row.milestones_fired as string[])
      : undefined,
    banked_momentum_days: row.banked_momentum_days,
    // Projected from live goal_mark_links (via useMarksByGoal), exactly as the old
    // store projected it on fetch — the link-based read this phase preserves.
    linked_mark_ids: linkedMarkIds,
    tier: (row.tier ?? undefined) as TierId | undefined,
    frequency: (row.frequency ?? undefined) as FrequencyId | undefined,
    deleted_at: row.deleted_at,
  };
}

// `total` is DERIVED from the event log (M9 Phase 4) — the stored `marks.total`
// left the client contract; Phase 3 had already stopped maintaining it.
function toMark(row: MarkRow, totals: ReadonlyMap<string, number>): Mark {
  return {
    id: row.id,
    user_id: row.user_id,
    name: row.name,
    emoji: row.emoji ?? undefined,
    color: row.color ?? undefined,
    unit: (row.unit ?? 'sessions') as Mark['unit'],
    enable_streak: row.enable_streak ?? false,
    sort_index: row.sort_index ?? 0,
    total: totals.get(row.id) ?? 0,
    last_activity_date: row.last_activity_date ?? undefined,
    deleted_at: row.deleted_at,
    created_at: row.created_at ?? '',
    updated_at: row.updated_at ?? '',
    maintenance_of: row.maintenance_of,
    frequency_min: row.frequency_min,
    frequency_recommended: row.frequency_recommended,
    frequency_max: row.frequency_max,
    weekly_target: row.weekly_target,
    dailyTarget: row.dailyTarget,
    frequency_kind: row.frequency_kind as FrequencyKind | null,
  };
}

function toMarkEvent(row: MarkEventRow): MarkEvent {
  return {
    id: row.id,
    user_id: row.user_id,
    mark_id: row.mark_id,
    event_type: row.event_type as MarkEvent['event_type'],
    amount: row.amount ?? 1,
    occurred_at: row.occurred_at,
    occurred_local_date: row.occurred_local_date,
    meta: (row.meta ?? undefined) as Record<string, unknown> | undefined,
    deleted_at: row.deleted_at,
    created_at: row.created_at ?? '',
    updated_at: row.updated_at ?? '',
  };
}

/** Exact reproduction of the old `goalsSlice.getGoalProgress` selector, computed
 *  over query data instead of store state (M9 Phase 2). Same three lib functions,
 *  same arithmetic — the rendered numbers must not move. */
function computeGoalProgress(goal: Goal, events: MarkEvent[], marks: MarkRow[]): GoalProgress {
  const progress = calculateGoalProgress(goal, events, marks);
  const unlock = calculateUnlockThreshold(goal);
  const target = goalCommitmentTarget(goal);
  return {
    progress,
    threshold: target ?? unlock,
    target,
    canComplete: progress >= unlock,
    readyToClaim: target !== null && progress >= target,
  };
}

// ── Active goal progress card ─────────────────────────────────────────────────

interface ActiveGoalCardProps {
  goal: Goal;
  /** The goal's live linked marks — resolves the leading medallion (M7-QC b). */
  marks: Mark[];
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
  /** True when a reorder handle floats over this card and must be cleared. */
  reserveHandleGutter?: boolean;
  onPress: () => void;
}

function ActiveGoalCard({ goal, marks, progress, threshold, canComplete, readyToClaim = false, hasCommitment = false, weeklyDone = 0, weeklyTarget = 0, reserveHandleGutter = false, onPress }: ActiveGoalCardProps) {
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
      style={[
        styles.activeCard,
        reserveHandleGutter && styles.activeCardDraggable,
        { backgroundColor: cardWash, borderColor: cardBorder },
      ]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <View style={styles.activeTopRow}>
        {/* M7-QC (b): a calm leading medallion tinted with the goal's dominant
            mark's own accent, so the list reads as more than text and each goal
            wears the same face it shows on its detail hero. */}
        <GoalCardMedallion marks={marks} testID={`goal-medallion-${goal.id}`} />
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
  marks: Mark[];
  /** Progress for this goal, computed once in the parent from query data (M9 P2). */
  progress: GoalProgress;
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
  marks,
  progress,
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
  const { reduced } = useMotion();
  const translateY = useSharedValue(0);
  const isActive = useSharedValue(false);
  // True from drop until the settle animation lands — keeps the row sourced from
  // the continuous `translateY` across the data reorder so it never jumps (c-2).
  const settling = useSharedValue(false);
  const startSlot = useSharedValue(index);
  // Settle/lift durations collapse to instant under Reduce Motion (motion skill).
  const settleDuration = reduced ? 0 : motion.standard;
  const liftDuration = reduced ? 0 : 120;

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
      // c-1: hysteresis-guarded slot resolution — no Math.round flip-flop at the
      // ±0.5-slot boundary, so the passive row no longer bounces between slots.
      // INLINED on purpose (device crash fix): this runs on the UI/worklet
      // thread, and a cross-file `'worklet'` call (lib/dragReorder.ts
      // resolveDragSlot) is not reliably linked into the worklet runtime under
      // Reanimated 4 / react-native-worklets — it threw a ReferenceError on every
      // drag frame. The math below mirrors resolveDragSlot exactly, which stays as
      // the unit-tested reference (SLOT_HYSTERESIS 0.2 → threshold 0.7).
      let targetSlot = currentSlot;
      if (count > 1) {
        const pos = startSlot.value + e.translationY / slotHeight.value;
        const threshold = 0.7; // 0.5 + SLOT_HYSTERESIS(0.2)
        while (targetSlot < count - 1 && pos > targetSlot + threshold) targetSlot += 1;
        while (targetSlot > 0 && pos < targetSlot - threshold) targetSlot -= 1;
      }
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
      isActive.value = false;
      activeId.value = null;
      if (finalSlot !== index) {
        // c-2: continuous drop. Committing the reorder shifts this row's layout
        // origin from `index` to `finalSlot`; compensate `translateY` by the same
        // amount FIRST (so the row stays exactly under the finger), then settle
        // the compensated value to 0 in one animation. `settling` keeps the row
        // sourced from this continuous value across the commit — no snap.
        settling.value = true;
        translateY.value = translateY.value + (index - finalSlot) * slotHeight.value;
        translateY.value = withTiming(0, { duration: settleDuration }, (finished) => {
          if (finished) settling.value = false;
        });
        runOnJS(commitReorder)();
      } else {
        settling.value = true;
        translateY.value = withTiming(0, { duration: settleDuration }, (finished) => {
          if (finished) settling.value = false;
        });
      }
    })
    .onFinalize(() => {
      // Safety net if the gesture is cancelled without onEnd (e.g. interrupted).
      if (isActive.value) {
        settling.value = true;
        translateY.value = withTiming(0, { duration: settleDuration }, (finished) => {
          if (finished) settling.value = false;
        });
        isActive.value = false;
        if (activeId.value === goal.id) activeId.value = null;
      }
    });

  const animatedStyle = useAnimatedStyle(() => {
    const slot = positions.value[goal.id] ?? index;
    const dragging = isActive.value;
    const anyActive = activeId.value !== null;
    const restingOffset = (slot - index) * slotHeight.value;
    // Source of translateY:
    //  • dragging → follow the finger.
    //  • settling → the continuous compensated drop value (survives the reorder).
    //  • a sibling is dragging → animate this passive row into its previewed slot.
    //  • idle/committed → snap to restingOffset. Snapping here is what kills the
    //    settle bounce: at the reorder frame the origin and restingOffset change
    //    together, and a snap lands the row in place with zero visible travel.
    let y: number;
    if (dragging || settling.value) {
      y = translateY.value;
    } else if (anyActive) {
      y = withTiming(restingOffset, { duration: settleDuration });
    } else {
      y = restingOffset;
    }
    return {
      transform: [
        { translateY: y },
        { scale: dragging ? withTiming(ACTIVE_SCALE, { duration: liftDuration }) : withTiming(1, { duration: liftDuration }) },
      ],
      zIndex: dragging ? 100 : 1,
      shadowColor: '#1C3830',
      shadowOffset: { width: 0, height: dragging ? 8 : 0 },
      shadowOpacity: withTiming(dragging ? 0.18 : 0, { duration: liftDuration }),
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
        marks={marks}
        progress={progress.progress}
        threshold={progress.threshold}
        canComplete={progress.canComplete}
        readyToClaim={progress.readyToClaim}
        hasCommitment={progress.target !== null}
        weeklyDone={weekly?.done}
        weeklyTarget={weekly?.target}
        // Same condition the handle renders on — with one goal there is no
        // handle, so the card keeps its full width.
        reserveHandleGutter={count > 1}
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
  marksByGoal: Map<string, Mark[]>;
  progressByGoal: Map<string, GoalProgress>;
  onPressGoal: (goalId: string) => void;
  /** A failed reorder rolls the order back on its own; this is how the user is
   *  told why the rows moved. */
  onWriteError: (copy: string) => void;
}

function DraggableGoalList({ goals, weeklyByGoal, marksByGoal, progressByGoal, onPressGoal, onWriteError }: DraggableGoalListProps) {
  // M9 Phase 3: reorder is a mutation. It patches the cached order in `onMutate`
  // and rolls back on error, which is what keeps a dragged row from visibly
  // snapping back while a round trip settles.
  const { user } = useAuth();
  const reorderGoals = useReorderGoalsMutation(user?.id ?? '');

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
    reorderGoals
      .mutateAsync(ordered.map((g) => g.id))
      .catch((error: unknown) => onWriteError(caughtErrorCopy(error)));
  }, [goals, positions, reorderGoals, onWriteError]);

  return (
    <View style={styles.listWrapper}>
      {goals.map((goal, index) => (
        <DraggableRow
          key={goal.id}
          goal={goal}
          marks={marksByGoal.get(goal.id) ?? EMPTY_MARKS}
          progress={progressByGoal.get(goal.id) ?? ZERO_PROGRESS}
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

  const { user } = useAuth();

  // M9 Phase 2 — reads come from the query layer; writes (fetchGoals refresh,
  // reorderGoals) still flow through the store.
  const goalsQuery = useGoals();
  const marksByGoalQuery = useMarksByGoal();
  const checkinsQuery = useUserCheckins();
  const fetchGoals = useGoalsStore((s) => s.fetchGoals);

  const goalRows = goalsQuery.data ?? EMPTY_GOAL_ROWS;
  const marksByGoalMap = marksByGoalQuery.data ?? EMPTY_MARKS_BY_GOAL;
  const checkinRows = checkinsQuery.data ?? EMPTY_CHECKIN_ROWS;

  // Adapt query rows to the old domain models the child components + pure helpers
  // expect. linked_mark_ids is projected from the by-goal link map, so progress
  // and ordering resolve THROUGH LINKS exactly as the store did.
  const goals = useMemo<Goal[]>(
    () => goalRows.map((row) => toGoal(row, (marksByGoalMap[row.id] ?? []).map((m) => m.id))),
    [goalRows, marksByGoalMap],
  );

  // The user's live check-ins, adapted to MarkEvent[] for the weekly/progress math
  // (the same array the old eventsSlice exposed).
  const allEvents = useMemo<MarkEvent[]>(() => checkinRows.map(toMarkEvent), [checkinRows]);

  // Every live mark linked to a goal, deduped — the flat list the empty-state and
  // progress helpers read (replaces the old `useMarksStore` marks array).
  const flatMarks = useMemo<MarkRow[]>(() => {
    const byId = new Map<string, MarkRow>();
    for (const list of Object.values(marksByGoalMap)) {
      for (const mark of list) if (!byId.has(mark.id)) byId.set(mark.id, mark);
    }
    return [...byId.values()];
  }, [marksByGoalMap]);

  // Active/completed split via the SAME canonical helpers the store used, so the
  // ordering (sort_index) stays byte-for-byte the order Focus resolves — the
  // 2026-07-20 fix (25d8aa8) that reconciled the two screens stays honoured.
  const active = useMemo(() => getActiveGoals(goals), [goals]);
  const completedCount = useMemo(() => getCompletedGoals(goals).length, [goals]);

  // The gate below (`isLoading && active.length === 0`) shows the skeleton only on
  // an empty first load. The error line is the CLASSIFIED copy (M9 Phase 3, T3) —
  // one source for every data failure in the app, instead of a per-screen string
  // that says "try again" whether the cause was offline, expired or refused.
  const isLoading = goalsQuery.isLoading;
  // M9 Phase 3: the banner carries write failures as well as read failures. A
  // write error wins — it is the thing the user just caused, and it clears on the
  // next successful one.
  const [writeError, setWriteError] = useState<string | null>(null);
  const error = writeError ?? dataErrorCopy(asDataError(goalsQuery.error));

  // Pull to refresh. Held on its own flag rather than `isLoading`: the loading flag
  // drives the skeleton, and showing both at once would replace the list the user
  // is already holding onto with a pair of grey blocks. The store fetch stays (it
  // owns the write model until Phase 3); the query refetches are what actually
  // update this now query-backed screen.
  const [refreshing, setRefreshing] = React.useState(false);
  const { refetch: refetchGoals } = goalsQuery;
  const { refetch: refetchMarks } = marksByGoalQuery;
  const { refetch: refetchCheckins } = checkinsQuery;
  const handleRefresh = useCallback(async () => {
    if (!user) return;
    setRefreshing(true);
    try {
      await Promise.all([
        fetchGoals(user.id),
        refetchGoals(),
        refetchMarks(),
        refetchCheckins(),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [user, fetchGoals, refetchGoals, refetchMarks, refetchCheckins]);

  // Per-goal "this week" aggregate — same computation Focus uses per mark, summed
  // across each goal's linked marks. Marks are grouped THROUGH LINKS (useMarksByGoal),
  // never via `mark.goal_id`.
  const weeklyByGoal = useMemo(() => {
    const weekDates = currentWeekDates();
    const map = new Map<string, { done: number; target: number }>();
    for (const goal of active) {
      let done = 0;
      let target = 0;
      for (const mark of marksByGoalMap[goal.id] ?? []) {
        if (mark.deleted_at) continue;
        const markTarget = mark.weekly_target ?? (mark.frequency_kind === 'variable' ? 3 : 7);
        const markEvents = allEvents.filter((e) => e.mark_id === mark.id && !e.deleted_at);
        done += Math.min(computeCompletionsThisWeek(mark, markEvents, weekDates), markTarget);
        target += markTarget;
      }
      map.set(goal.id, { done, target });
    }
    return map;
  }, [active, marksByGoalMap, allEvents]);

  // M7-QC (b): the goal's live linked marks, so each card resolves its own
  // dominant-mark medallion (same resolution as the goal-detail hero). Grouped
  // through goal_mark_links and adapted to the old Mark shape the medallion expects.
  const marksByGoal = useMemo(() => {
    // Derived all-time totals feed the adapter (Phase 4) — this is what keeps the
    // medallion's dominant-mark pick moving after `marks.total` went read-dead.
    const markTotals = totalsByMark(checkinRows);
    const map = new Map<string, Mark[]>();
    for (const goal of active) {
      map.set(
        goal.id,
        (marksByGoalMap[goal.id] ?? []).map((row) => toMark(row, markTotals)),
      );
    }
    return map;
  }, [active, marksByGoalMap, checkinRows]);

  // Per-goal progress, computed once here (reproduces the retired store selector).
  const progressByGoal = useMemo(() => {
    const map = new Map<string, GoalProgress>();
    for (const goal of active) {
      map.set(goal.id, computeGoalProgress(goal, allEvents, flatMarks));
    }
    return map;
  }, [active, allEvents, flatMarks]);

  const isEmpty = !isLoading && active.length === 0;

  // M4 (PL-5): brand-new user vs cleared-everything vs finished-everything.
  // Completed goals outrank the generic returnedEmpty line.
  const emptyCopy = useMemo(
    () => getEmptyStateCopy('goals', deriveGoalsEmptyKind(goals, flatMarks)),
    [goals, flatMarks],
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
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={c.inkMuted} />
        }
      >
        {/* Error banner */}
        {error ? (
          <View style={[styles.errorBanner, { backgroundColor: applyOpacity(c.danger, 0.13) }]}>
            <Text style={[styles.errorText, { color: c.danger }]}>{error}</Text>
            {/* A failure the user cannot act on is just an accusation. The
                retry re-runs the same load the sync path runs. */}
            {user?.id ? (
              <TouchableOpacity
                onPress={() => {
                  // Error is query-derived now: refetch the query (what clears it),
                  // and keep the store fetch so the write model stays warm.
                  void fetchGoals(user.id);
                  void refetchGoals();
                }}
                disabled={isLoading}
                accessibilityRole="button"
                accessibilityState={{ disabled: isLoading }}
                style={styles.errorRetry}
              >
                <Text style={[styles.errorRetryText, { color: c.danger }]}>Try again</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}

        {/* Loading — two goal-card blocks, so the wait describes the screen
            that arrives rather than spinning in the abstract. */}
        {isLoading && active.length === 0 && (
          <View style={styles.loadingState} accessibilityLabel="Loading your goals">
            <Skeleton height={132} radius={radius.lg} />
            <Skeleton height={132} radius={radius.lg} />
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
              marksByGoal={marksByGoal}
              progressByGoal={progressByGoal}
              onPressGoal={handleOpenGoal}
              onWriteError={setWriteError}
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
    right: dragHandle.inset,
    top: 0,
    bottom: 0,
    width: dragHandle.width,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /* The handle floats over the card's full height, so a card that sits under
     one stops short of it. Without this the progress bar and the "Ready to
     complete" banner ran 36pt underneath the dots (device report 2026-07-25). */
  activeCardDraggable: {
    paddingRight: dragHandle.gutter,
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
  // minHeight, not hitSlop: hitSlop clips at the parent's bounds, and this
  // control sits inside a padded banner.
  errorRetry: {
    minHeight: 44,
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  errorRetryText: {
    fontFamily: fonts.sans,
    fontSize: fontSize[13],
    fontWeight: '600',
    textDecorationLine: 'underline',
  },

  // Loading
  loadingState: {
    // The gutter is carried by each child on this screen (the goal cards get it
    // from draggableRow), never by the scroll container — see the 2026-07-12
    // width bug in design-decisions.md.
    marginHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.md,
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
    fontFamily: fonts.sansSemibold,
    fontSize: fontSize[22],
    textAlign: 'center',
    marginTop: spacing.md,
  },
  // Mentor voice line (PL-5 / MED-A): DM Sans italic; inkMid for the contrast
  // step italics need on light linen (FU-5 precedent).
  emptySubtitle: {
    fontFamily: fonts.sansItalic,
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
