import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  RefreshControl,
} from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';

import { fonts, fontSize, spacing, radius, shadow, themedColors } from '../../theme/tokens';
import { useEffectiveTheme, useUIStore } from '../../state/uiSlice';
import { LivraHeader } from '../../components/ui/LivraHeader';
import { MarkRow } from '../../components/ui/MarkRow';
import { Breathing } from '../../components/ui/Breathing';
import { Skeleton } from '../../components/ui/Skeleton';
import { Plus } from 'phosphor-react-native';
import { SectionLabel } from '../../components/ui/SectionLabel';
import { SpeedDialFAB } from '../../components/ui/SpeedDialFAB';
import { VoiceLine } from '../../components/ui/VoiceLine';
import { confirm, actionSheet } from '../../components/ui/overlays';

import { useArchiveMarkMutation } from '@/lib/data/mutations/marks';
import { useAuth } from '../../hooks/useAuth';
import { useAppDateStore, selectAppDateKey } from '../../state/appDateSlice';
import { useGoalsStore } from '../../state/goalsSlice';
import { useMarksStore } from '../../state/countersSlice';
import { effectivePersonalBest, useMomentumStore } from '../../state/momentumSlice';
import { buildMomentContext } from '../../lib/moments/context';
import {
  dayHashRng,
  previousDayGreetingDefaultId,
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
import { getActiveGoals } from '../../lib/goalLogic';
import { formatDate } from '../../lib/date';
import { resolveDailyTarget } from '../../lib/markDailyTarget';
import { dayJustCompleted } from '../../lib/motionTriggers';
import {
  currentWeekDates,
  buildGoalLifetimeLogCounts,
  buildWeeklyCountsMap,
  markWeeklyState,
} from '../../lib/features';
import { resolveMarkCategory, resolveMarkIcon, resolveMarkAccent } from '../../lib/markCategoryResolve';
import {
  buildNextMoveChips,
  isGoalDoneToday,
  pickSpotlightGoalId,
  pickNextMove,
  remainingThisWeek,
} from '../../lib/focusQueue';
import { isComebackState, endsComebackGap, pickComebackMove, resolveComebackAsk } from '../../lib/comeback';
import { resolveFirstName } from '../../lib/profile/displayName';
import { computeWeek } from '../../lib/consistency';
import { useNotification } from '../../contexts/NotificationContext';
import { applyOpacity } from '../../src/components/icons/color';
import { useWidgetLogSync } from '../../hooks/useWidgetLogSync';
import {
  DoneGoalRow,
  QueuedGoalRow,
  ExpandedGoalCard,
  SpotlightGoalCard,
} from '../../components/focus/GoalCards';

import type { Counter, Mark, MarkEvent, FrequencyKind } from '../../types';
import type { Goal } from '../../types/goal';
// M9 Phase 2 Task 4 — reads come from the query layer; writes stay in the stores.
import { useMarksForUser, useMarksByGoal } from '@/lib/data/marks';
import { useUserCheckins } from '@/lib/data/checkins';
import { useGoals } from '@/lib/data/goals';
import { totalsByMark } from '@/lib/data/derived';
import { asDataError } from '@/lib/data/errors';
import { caughtErrorCopy, dataErrorCopy } from '@/lib/copy';
import { useCheckin } from '../../hooks/useCheckin';
// `MarkRow` here is the components/ui/MarkRow VALUE import; the data-layer row
// type is aliased to avoid the name collision.
import type { GoalRow, MarkRow as MarkRowData, MarkEventRow } from '@/lib/data/types';
import type { TierId, FrequencyId } from '../../lib/goalMarkSuggestions';

// ── Strangler seam (M9 Phase 2 Task 4) ──────────────────────────────────────
// Query rows are adapted to the old domain models so every derivation, the pure
// focusQueue selectors, and the JSX render identically. Adapters mirror goal
// detail / mark detail (Tasks 2–3) verbatim — kept local, deleted with the seam
// in Phase 3. Marks resolve to goals THROUGH goal_mark_links (useMarksByGoal),
// never mark.goal_id. Writes are mutations as of Phase 3; the adapters
// themselves die with the seam in Phase 5.
const EMPTY_MARK_ROWS: MarkRowData[] = [];
const EMPTY_CHECKIN_ROWS: MarkEventRow[] = [];
const EMPTY_GOAL_ROWS: GoalRow[] = [];
const EMPTY_MARKS_BY_GOAL: Record<string, MarkRowData[]> = {};

// `total` is DERIVED from the event log (M9 Phase 4) — the stored `marks.total`
// left the client contract; Phase 3 had already stopped maintaining it.
function toMark(row: MarkRowData, totals: ReadonlyMap<string, number>): Mark {
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
    target_date: row.deadline_date,
    completed_at: row.completed_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    milestones_fired: Array.isArray(row.milestones_fired)
      ? (row.milestones_fired as string[])
      : undefined,
    banked_momentum_days: row.banked_momentum_days,
    linked_mark_ids: linkedMarkIds,
    tier: (row.tier ?? undefined) as TierId | undefined,
    frequency: (row.frequency ?? undefined) as FrequencyId | undefined,
    deleted_at: row.deleted_at,
  };
}

export default function FocusScreen() {
  const theme = useEffectiveTheme();
  const c = themedColors(theme);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ logMarkId?: string }>();
  const { user } = useAuth();
  // Reads come from the query layer (Phase 2); both writes this screen owns are
  // mutations now (Phase 3) — the check-in via `useCheckin`, the removal below.
  // Removing a mark is `archiveMark` — a tombstone on the mark and its
  // links, never a DELETE (D-8). This was `useCounters().deleteCounter`, the last
  // thing this screen wanted from that hook, so the hook is gone from it entirely.
  const archiveMark = useArchiveMarkMutation(user?.id ?? '');
  const { logCheckin } = useCheckin();

  const marksQuery = useMarksForUser();
  const checkinsQuery = useUserCheckins();
  const goalsQuery = useGoals();
  const marksByGoalQuery = useMarksByGoal();

  // `loading` gated the skeleton on marks-loading (old countersSlice.loading).
  // `error` renders the CLASSIFIED line for the failure (M9 Phase 3, T3). It used
  // to render `marksQuery.error.message`, which is the data layer's LOG label —
  // safe, but written for a logger, not for a person reading a Focus screen.
  const loading = marksQuery.isLoading;
  const error = dataErrorCopy(asDataError(marksQuery.error));

  // All-time totals derived from the events this screen already fetches; feeds
  // the adapters in place of the retired stored `marks.total`.
  const markTotals = useMemo(
    () => totalsByMark(checkinsQuery.data ?? EMPTY_CHECKIN_ROWS),
    [checkinsQuery.data],
  );

  const counters = useMemo<Counter[]>(
    () => (marksQuery.data ?? EMPTY_MARK_ROWS).map((row) => toMark(row, markTotals)),
    [marksQuery.data, markTotals],
  );

  // Reconcile logs tapped in the iOS 17+ interactive widget (AppIntent queue).
  useWidgetLogSync(logCheckin, user?.id);
  const { showError } = useNotification();
  const appDateKey = useAppDateStore(selectAppDateKey);
  const todayStr = useMemo(() => formatDate(getAppDate()), [appDateKey]);

  const allEvents = useMemo<MarkEvent[]>(
    () => (checkinsQuery.data ?? EMPTY_CHECKIN_ROWS).map(toMarkEvent),
    [checkinsQuery.data],
  );

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

  // Goals with linked_mark_ids projected from live goal_mark_links (useMarksByGoal),
  // exactly as the old store projected them on fetch — the link-based read this
  // phase preserves.
  const goalRows = goalsQuery.data ?? EMPTY_GOAL_ROWS;
  const marksByGoalRows = marksByGoalQuery.data ?? EMPTY_MARKS_BY_GOAL;
  const goals = useMemo<Goal[]>(
    () =>
      goalRows.map((g) =>
        toGoal(g, (marksByGoalRows[g.id] ?? EMPTY_MARK_ROWS).map((m) => m.id)),
      ),
    [goalRows, marksByGoalRows],
  );
  // Focus lists EVERY active goal, in canonical sort_index order (the
  // Goals-screen drag order). It used to `.slice(0, 2)` — a free-era artifact:
  // free is capped at 2 goals, so the slice was invisible there, but it
  // silently hid a Pro user's 3rd+ goals and reorder only swapped which two
  // showed. Fully-done goals collapse to a compact row below, so the list stays
  // calm without ever dropping a goal.
  const activeGoals = useMemo(() => getActiveGoals(goals), [goals]);

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

  // Pull to refresh. Focus reads from three places, so a refresh has to touch
  // all three or the card can redraw from half-stale state: marks, goals, then
  // the momentum snapshots derived from both. Own flag, not `loading` — that
  // one drives the skeleton, which would blank a list the user is holding.
  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = useCallback(async () => {
    if (!user) return;
    setRefreshing(true);
    try {
      await Promise.all([
        // The query-backed reads the screen renders (T6 verify gesture).
        marksQuery.refetch(),
        checkinsQuery.refetch(),
        goalsQuery.refetch(),
        marksByGoalQuery.refetch(),
        // Momentum snapshots still derive from the stores, so refresh them too.
        useMarksStore.getState().loadMarks(user.id),
        useGoalsStore.getState().fetchGoals(user.id),
      ]);
      await useGoalsStore.getState().evaluateActiveGoalsMomentum();
    } finally {
      setRefreshing(false);
    }
  }, [user, marksQuery, checkinsQuery, goalsQuery, marksByGoalQuery]);

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

  // A goal's marks, resolved THROUGH goal_mark_links (useMarksByGoal), never
  // mark.goal_id — the link-based association the plan's device check confirmed.
  const marksForGoal = useCallback(
    (goalId: string): Counter[] =>
      (marksByGoalRows[goalId] ?? EMPTY_MARK_ROWS).map((row) => toMark(row, markTotals)),
    [marksByGoalRows, markTotals],
  );

  // The set of marks attached to ANY goal, from live links. partitionMarks keyed
  // off the retiring mark.goal_id; links are the truth now (T6).
  const linkedMarkIdSet = useMemo(() => {
    const set = new Set<string>();
    for (const rows of Object.values(marksByGoalRows)) {
      for (const m of rows) set.add(m.id);
    }
    return set;
  }, [marksByGoalRows]);

  // maintenance graduates to its own section (checked first, exactly as
  // partitionMarks did); loose = attached to no goal and not a maintenance habit.
  const maintenanceMarks = useMemo(
    () => activeCounters.filter((m) => m.maintenance_of),
    [activeCounters],
  );
  const goallessMarks = useMemo(
    () => activeCounters.filter((m) => !m.maintenance_of && !linkedMarkIdSet.has(m.id)),
    [activeCounters, linkedMarkIdSet],
  );

  // ── Spotlight queue (founder 2026-07-23) ──────────────────────────────────
  // ONE goal renders expanded — the first in the user's drag order with work
  // left today; the rest sit as compact queued rows until their turn. Same
  // sequential model as the widget. Pure selection lives in lib/focusQueue.ts;
  // auto-advance is view state only (sort_index is never touched).
  const marksByGoalId = useMemo(() => {
    const map = new Map<string, Counter[]>();
    for (const goal of activeGoals) map.set(goal.id, marksForGoal(goal.id));
    return map;
  }, [activeGoals, marksForGoal]);

  const spotlightGoalId = useMemo(
    () =>
      pickSpotlightGoalId(
        activeGoals.map((g) => g.id),
        marksByGoalId,
        weeklyCountsMap,
        todayCountsMap,
      ),
    [activeGoals, marksByGoalId, weeklyCountsMap, todayCountsMap],
  );

  // ── Next Move session overrides (spec §1) ─────────────────────────────────
  // A tap on a chip seats that mark as the hero without touching sort_index;
  // a tap on a queued row hoists that whole goal into the spotlight seat. Both
  // are pure VIEW state — the user's own drag order is never mutated. Neither
  // needs a cleanup effect: overrides whose target has no work left today are
  // ignored at read time (pickNextMove's heroable guard; the
  // effectiveSpotlightGoalId memo), and the spotlight-moving handlers below
  // clear the hero override on every hand-off.
  const [heroOverride, setHeroOverride] = useState<{ goalId: string; markId: string } | null>(null);
  const [spotlightOverride, setSpotlightOverride] = useState<string | null>(null);

  // Effective spotlight: the override wins only while its goal still has work
  // today; otherwise the computed queue order (drag order) decides.
  const effectiveSpotlightGoalId = useMemo(() => {
    if (spotlightOverride) {
      const marks = marksByGoalId.get(spotlightOverride) ?? [];
      if (!isGoalDoneToday(marks, weeklyCountsMap, todayCountsMap)) return spotlightOverride;
    }
    return spotlightGoalId;
  }, [spotlightOverride, spotlightGoalId, marksByGoalId, weeklyCountsMap, todayCountsMap]);

  // Comeback (spec §3): 2+ full quiet days → the Next Move card presents the
  // easiest due mark with a shrunk ask instead of the normal queue pick. The
  // override is ignored in this state — comeback wants the smallest true next
  // step, not whatever was last tapped before the gap.
  const comeback = useMemo(() => isComebackState(allEvents, todayStr), [allEvents, todayStr]);

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

  // spec §3 (Task 7): a comeback gap that ended TODAY (a fresh log landed
  // after 2+ quiet days) should not also get the slipping-goal scold in the
  // same breath — the greeting stays quiet on that branch for the day the
  // gap closes. endsComebackGap reads events with today's rows stripped, so
  // it answers "was there a gap before this log", and logsToday confirms a
  // log actually landed today (not just that the account is old enough).
  const gapEndedToday = useMemo(
    () => endsComebackGap(allEvents, todayStr) && momentCtx.logsToday > 0,
    [allEvents, todayStr, momentCtx.logsToday],
  );

  // Spec §2 says the slipping greeting yields on a comeback DAY, not merely
  // after the comeback log lands: while the card is asking to START BACK
  // SMALL, the greeting must not scold in the same breath. `comeback` covers
  // the pre-log hours; `gapEndedToday` covers the rest of the day.
  const suppressSlippingGreeting = comeback || gapEndedToday;

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
      suppressSlipping: suppressSlippingGreeting,
    });
    // The greeting surface always resolves from the default pool; '' only if
    // the registry were emptied (Jest walks it, so it cannot ship empty).
    return moment?.text ?? '';
  }, [momentCtx, todayStr, suppressSlippingGreeting]);

  // M4 (PL-5): the empty invitation distinguishes a brand-new user (no marks
  // ever, no logs ever) from one who cleared everything out. uniqueCounters
  // keeps soft-deleted marks; allEvents keeps soft-deleted logs — both are the
  // historical trace the derivation reads.
  const emptyMarksLine = useMemo(
    () => getEmptyStateCopy('focus', deriveFocusEmptyVariant(uniqueCounters, allEvents)).body,
    [uniqueCounters, allEvents],
  );

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleQuickIncrement = useCallback(
    async (markId: string) => {
      if (!user?.id) return;
      if (Platform.OS !== 'web') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      }
      try {
        await logCheckin(markId, user.id, 1);
      } catch (error: unknown) {
        // The raw error stayed in the data layer; this is the classified line.
        showError(caughtErrorCopy(error));
      }
    },
    [user?.id, logCheckin, showError],
  );

  // Widget deep-link fallback (iOS 16, or any tap routed through the app):
  // `livra://log-mark?markId=…` lands here with a logMarkId param. Log it once
  // through the real increment path, then clear the param so it can't re-fire
  // on re-render or when the tab regains focus.
  const handledLogMarkRef = useRef<string | null>(null);
  useEffect(() => {
    const logMarkId = typeof params.logMarkId === 'string' ? params.logMarkId : undefined;
    if (!logMarkId) {
      handledLogMarkRef.current = null;
      return;
    }
    if (!user?.id) return;
    if (loading) return;
    if (handledLogMarkRef.current === logMarkId) return;
    if (!activeCounters.some((m) => m.id === logMarkId)) {
      // Unknown mark (deleted, or not yet loaded on a cold start) — drop it.
      handledLogMarkRef.current = logMarkId;
      router.setParams({ logMarkId: undefined });
      return;
    }
    handledLogMarkRef.current = logMarkId;
    void handleQuickIncrement(logMarkId);
    router.setParams({ logMarkId: undefined });
  }, [params.logMarkId, user?.id, loading, activeCounters, handleQuickIncrement, router]);

  const confirmDeleteMark = useCallback(async (markId: string, markName: string) => {
    const ok = await confirm({
      title: 'Remove mark?',
      message: `"${markName}" will be permanently removed.`,
      confirmLabel: 'Remove',
      cancelLabel: 'Keep it',
      destructive: true,
    });
    // The removal is a server write now, so a failure has to be said out loud —
    // the silent `.catch(() => {})` this replaces would have left the mark on
    // screen with no explanation.
    if (ok) archiveMark.mutateAsync(markId).catch((error: unknown) => showError(caughtErrorCopy(error)));
  }, [archiveMark, showError]);

  const handleMarkLongPress = useCallback(async (markId: string, markName: string) => {
    const choice = await actionSheet({
      title: markName,
      actions: [
        { label: 'View details' },
        { label: 'Edit' },
        { label: 'Delete', destructive: true },
      ],
    });
    if (choice === 0) router.push(`/mark/${markId}` as any);
    else if (choice === 1) router.push(`/mark/${markId}/edit` as any);
    else if (choice === 2) void confirmDeleteMark(markId, markName);
  }, [router, confirmDeleteMark]);

  const handleDeleteMark = useCallback((markId: string, markName: string) => {
    void confirmDeleteMark(markId, markName);
  }, [confirmDeleteMark]);

  // A maintenance habit is retired, not deleted — a gentle ending, not destruction.
  const handleRetireMark = useCallback(async (markId: string, markName: string) => {
    const ok = await confirm({
      title: 'Retire this habit?',
      message: `You've kept "${markName}" going. Ready to let it rest?`,
      confirmLabel: 'Retire',
      cancelLabel: 'Keep going',
    });
    if (ok) archiveMark.mutateAsync(markId).catch((error: unknown) => showError(caughtErrorCopy(error)));
  }, [archiveMark, showError]);

  // ── Mark row renderer (shared) ────────────────────────────────────────────

  const renderMarkRow = useCallback(
    (mark: Counter, isLast: boolean, dimmed = false, maintenance = false, celebrateIndex?: number) => {
      const weeklyCount = weeklyCountsMap.get(mark.id) ?? 0;
      const isDoneForWeek = markWeeklyState(mark, weeklyCount) === 'doneForWeek';
      const category = resolveMarkCategory(mark);

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
                accent={resolveMarkAccent(mark)}
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
        </View>
      );
    },
    [weeklyCountsMap, todayCountsMap, c, handleDeleteMark, handleRetireMark, handleMarkLongPress, handleQuickIncrement, router, celebrateStamp],
  );

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <View style={[styles.screen, { backgroundColor: c.linen }]}>
      <LivraHeader centerLogo showAvatar />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={c.inkMuted} />
        }
      >
        {bannerVisible && bannerText !== '' && (
          <MomentumBanner text={bannerText} onDismiss={handleDismissBanner} />
        )}

        {/* ── Greeting ── */}
        <Text style={[styles.greeting, { color: c.inkDark }]}>{greetingText}</Text>

        {/* ── Loading / error states ── */}
        {/* The greeting has already rendered above, so the wait echoes what is
            still missing: the Next Move card and the chip strip under it. */}
        {loading && activeCounters.length === 0 && (
          <View style={styles.loadingState} accessibilityLabel="Loading your next move">
            <Skeleton height={148} radius={radius.xl} />
            <View style={styles.loadingChips}>
              <Skeleton height={18} width={92} radius={radius.full} />
              <Skeleton height={18} width={68} radius={radius.full} />
              <Skeleton height={18} width={80} radius={radius.full} />
            </View>
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

        {/* ── Goal cards (all active goals; fully-done ones collapse) ── */}
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

              // Founder 2026-07-23: when every mark on a goal is done for the
              // week there's nothing to log here, so the goal collapses to a
              // compact done row — keeping the goals with work left prominent.
              // Tap the row to expand it back into the full card (the dimmed
              // done rows); tapping an expanded done goal's header re-collapses it.
              //
              // Founder 2026-07-23(b): the week-only fold never fired in
              // practice — a daily mark (weekly target 7) held its goal open
              // until day 7. So the goal ALSO folds when every remaining due
              // mark has met its DAILY bar today: today's work here is done,
              // and tomorrow the marks come due again and the card unfolds on
              // its own. The compact row says which of the two states it is.
              const allDoneForWeek = dueMarks.length === 0;
              const allDoneToday = isGoalDoneToday(marks, weeklyCountsMap, todayCountsMap);
              if (allDoneToday && !isExpanded) {
                return (
                  <DoneGoalRow
                    key={goal.id}
                    goal={goal}
                    allDoneForWeek={allDoneForWeek}
                    remainingThisWeek={remainingThisWeek(marks, weeklyCountsMap)}
                    onPress={() => toggleGoalExpand(goal.id)}
                    onTitlePress={() => router.push(`/goal/${goal.id}` as any)}
                  />
                );
              }

              // Spotlight queue (spec §1): ONE goal renders expanded as the
              // Next Move card at a time — the effective spotlight (computed
              // queue order, or a tapped queued row's override while it still
              // has work). Stale overrides need no cleanup effect: pickNextMove
              // ignores a hero override with no work left today, the
              // effectiveSpotlightGoalId memo ignores a done spotlight
              // override, and every handler that MOVES the spotlight clears
              // the hero override (spec §1: it clears when the mark is done
              // or the spotlight changes). Every other goal with work left today renders as a
              // compact queued row — title quiet (inkMid), today's due checks
              // as small circles (the sanctioned Focus progress voice: checks,
              // never fractions or bars), down-caret inviting expansion. A tap
              // hoists that goal into the spotlight seat (setSpotlightOverride),
              // replacing whichever goal held it; "Show less" on the card
              // itself clears the override and hands the seat back.
              const isSpotlight = goal.id === effectiveSpotlightGoalId;
              if (!isSpotlight && !allDoneToday) {
                return (
                  <QueuedGoalRow
                    key={goal.id}
                    goal={goal}
                    dueMarks={dueMarks}
                    todayCountsMap={todayCountsMap}
                    onPress={() => {
                      setSpotlightOverride(goal.id);
                      setHeroOverride(null);
                    }}
                    onTitlePress={() => router.push(`/goal/${goal.id}` as any)}
                  />
                );
              }

              // A goal that's fully done today but expanded for review
              // (allDoneToday && isExpanded — the only way to reach here
              // without being the spotlight) keeps its original card shell:
              // header + dimmed done-for-week rows, unchanged.
              if (!isSpotlight) {
                return (
                  <ExpandedGoalCard
                    key={goal.id}
                    goal={goal}
                    dueMarks={dueMarks}
                    doneMarks={doneMarks}
                    renderMarkRow={renderMarkRow}
                    onToggle={() => toggleGoalExpand(goal.id)}
                    onTitlePress={() => router.push(`/goal/${goal.id}` as any)}
                  />
                );
              }

              // ── Spotlight: the Next Move card (spec §1) ───────────────────
              // Comeback ignores the hero override — it wants the smallest
              // true next step, not whatever was last tapped before the gap.
              const hero = comeback
                ? pickComebackMove(dueMarks)
                : pickNextMove(
                    marks,
                    weeklyCountsMap,
                    todayCountsMap,
                    heroOverride?.goalId === goal.id ? heroOverride.markId : null,
                    // The clock gates evening marks out of the morning (a sleep
                    // goal offered Sleep at 9am — device report 2026-07-25).
                    new Date(),
                  );
              // isGoalDoneToday already guards effectiveSpotlightGoalId against
              // ever selecting a goal with no work left today; defensive only.
              if (!hero) return null;

              const { chips, overflowCount } = buildNextMoveChips(
                dueMarks,
                hero,
                todayCountsMap,
              );
              const comebackPresentation = comeback ? { ask: resolveComebackAsk(hero) } : null;

              return (
                <SpotlightGoalCard
                  key={goal.id}
                  goal={goal}
                  hero={hero}
                  chips={chips}
                  overflowCount={overflowCount}
                  comeback={comebackPresentation}
                  hoisted={spotlightOverride === goal.id}
                  onGoalPress={() => router.push(`/goal/${goal.id}` as any)}
                  onMarkIt={() => handleQuickIncrement(hero.id)}
                  onHeroLongPress={() => handleMarkLongPress(hero.id, hero.name)}
                  onChipPress={(markId) => setHeroOverride({ goalId: goal.id, markId })}
                  onOverflowPress={() => router.push(`/goal/${goal.id}` as any)}
                  onRelease={() => {
                    setSpotlightOverride(null);
                    setHeroOverride(null);
                  }}
                />
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
    fontFamily: fonts.sansItalic,
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
  // Mentor voice line (PL-5 / MED-A): DM Sans italic — the app-voice italic cue
  // without Cormorant; inkMid for the contrast step italics need on light linen.
  emptyMarksText: {
    fontFamily: fonts.sansItalic,
    fontSize: fontSize.lg,
    lineHeight: 22,
    textAlign: 'center',
  },

  loadingState: {
    marginHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  loadingChips: {
    flexDirection: 'row',
    gap: spacing.sm,
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
