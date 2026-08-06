import { Appearance, Platform } from 'react-native';
import { useUIStore } from '../../state/uiSlice';
import { getSupabaseClient } from '../supabase';
import { checkProStatus } from '../iap/iap';
import {
  getActiveGoals,
  calculateGoalProgress,
  calculateUnlockThreshold,
  goalCommitmentTarget,
} from '../goalLogic';
import { queryClient } from '../data/queryClient';
import { queryKeys } from '../data/queryKeys';
import { fetchGoals } from '../data/goals';
import { fetchMarksByGoal, fetchMarksForUser } from '../data/marks';
import { fetchUserCheckins, mergePendingCheckins, todayLocalDate } from '../data/checkins';
import { pendingOutboxEntries } from '../data/outbox';
import { toGoal, toMarkEvent } from '../data/adapters';
import { resolveMarkFace, resolveGoalFace } from '../markCategoryResolve';
import type { MarkRow, MarkEventRow } from '../data/types';
import type { WidgetData, WidgetMarkData, WidgetGoalData } from './widgetTypes';
import { APP_GROUP_ID, WIDGET_DATA_KEY } from './widgetTypes';

const MAX_GOALS = 4;
const MAX_MARKS_PER_GOAL = 6;

/**
 * The app's effective theme, resolved OUTSIDE a component.
 *
 * `useEffectiveTheme` is a hook and the snapshot is built from background sync,
 * so it cannot be used here; `useUIStore.getState().getEffectiveTheme()` is not
 * an option either — it hardcodes 'light' for system mode (uiSlice.ts:358, a
 * stub with zero callers). `Appearance.getColorScheme()` is the non-hook read of
 * the same system value `useColorScheme` returns, so 'system' resolves the same
 * way the app itself resolves it.
 */
export function currentAppTheme(): 'light' | 'dark' {
  const mode = useUIStore.getState().themeMode;
  if (mode === 'system') {
    return Appearance.getColorScheme() === 'dark' ? 'dark' : 'light';
  }
  return mode;
}

// M9 Phase 5A: the snapshot is built from the query layer — the same goals,
// links and events the screens render — instead of the deleted mock DB and
// Zustand stores. `ensureQueryData` serves the persisted cache when offline and
// fetches when the cache is cold; queued offline check-ins are merged in via
// the outbox (D-3: the widget must agree with the screens).
export async function buildWidgetData(): Promise<WidgetData> {
  const { data } = await getSupabaseClient().auth.getSession();
  const userId = data.session?.user?.id;
  if (!userId) return { goals: [], lastUpdated: Date.now(), isPro: false, theme: currentAppTheme() };

  const { effectiveUnlocked: isPro } = await checkProStatus();

  const [goalRows, marksByGoal, allMarks, serverEvents] = await Promise.all([
    queryClient.ensureQueryData({ queryKey: queryKeys.goals(userId), queryFn: fetchGoals }),
    queryClient.ensureQueryData({
      queryKey: queryKeys.marksByGoal(userId),
      queryFn: fetchMarksByGoal,
    }),
    // ALL live marks, linked or not — the goal-less fallback below must see the
    // marks of a user who has no goals yet (parity with the old store read).
    queryClient.ensureQueryData({
      queryKey: queryKeys.marks(userId),
      queryFn: fetchMarksForUser,
    }),
    queryClient.ensureQueryData({
      queryKey: queryKeys.userCheckins(userId),
      queryFn: fetchUserCheckins,
    }),
  ]);

  const pending = pendingOutboxEntries()
    .filter((e) => e.table === 'mark_events' && e.row.user_id === userId)
    .map((e) => e.row as MarkEventRow);
  const eventRows = mergePendingCheckins(serverEvents, pending) ?? [];
  const events = eventRows.map(toMarkEvent);

  const today = todayLocalDate();
  const loggedTodayIds = new Set(
    eventRows
      .filter(
        (e) => !e.deleted_at && e.event_type === 'increment' && e.occurred_local_date === today,
      )
      .map((e) => e.mark_id),
  );

  // 2026-08-06 parity: a mark's widget face is now resolved by the SAME function
  // the in-app row uses. It used to be `categoryVisual(resolveMarkCategory(...))`
  // — one glyph and one accent per CATEGORY — so 40 of 41 library marks showed a
  // different icon here than in the app, and two marks sharing a category (Water
  // + Calories, both Health) were one identical drop in the widget.
  const toWidgetMark = (mark: MarkRow): WidgetMarkData => {
    const face = resolveMarkFace({
      name: mark.name,
      emoji: mark.emoji ?? undefined,
      color: mark.color ?? undefined,
    });
    return {
      id: mark.id,
      name: mark.name,
      icon: face.icon,
      accent: face.accent,
      completed: loggedTodayIds.has(mark.id),
    };
  };

  const goals = getActiveGoals(
    goalRows.map((row) => toGoal(row, (marksByGoal[row.id] ?? []).map((m) => m.id))),
  )
    // Filter to goals with marks FIRST (preserving sort order), then cap at
    // MAX_GOALS, so a goal with marks beyond the first 4 candidates isn't lost.
    .map((goal) => ({ goal, goalMarks: marksByGoal[goal.id] ?? [] }))
    .filter(({ goalMarks }) => goalMarks.length > 0)
    .slice(0, MAX_GOALS)
    .map(({ goal, goalMarks }): WidgetGoalData => {
      const limitedMarks = goalMarks.slice(0, MAX_MARKS_PER_GOAL);
      // Same arithmetic as the old goalsSlice.getGoalProgress selector.
      const progress = calculateGoalProgress(goal, events, allMarks);
      // Same pair the Goals screen derives (goals.tsx:177 + :481) — the
      // commitment when there is one, the unlock floor otherwise — so the
      // widget's day count reads identically to the goal card's.
      const commitment = goalCommitmentTarget(goal);
      const threshold = commitment ?? calculateUnlockThreshold(goal);
      // The goal's face comes from the goal's OWN WORDS (founder 2026-08-06),
      // the same rule the Goals card and the detail hero now use — not
      // majorityCategory, and not the marks at all unless the text matches
      // nothing.
      const goalVisual = resolveGoalFace({
        title: goal.title,
        description: goal.description,
        marks: limitedMarks.map((m) => ({ name: m.name, emoji: m.emoji ?? undefined })),
      });
      return {
        id: goal.id,
        title: goal.title,
        icon: goalVisual.icon,
        accent: goalVisual.accent,
        progress,
        threshold: Math.max(1, threshold),
        hasCommitment: commitment !== null,
        marks: limitedMarks.map(toWidgetMark),
      };
    });

  // Fallback: no active goal has marks → one "Today" pseudo-goal over all marks,
  // preserving the pre-rework goal-less behavior.
  if (goals.length === 0 && allMarks.length > 0) {
    const fallbackMarks = allMarks.slice(0, MAX_MARKS_PER_GOAL);
    // The "Today" pseudo-goal has no title of its own, so it keeps the
    // category-derived face over its marks.
    const goalVisual = resolveGoalFace({
      title: null,
      marks: fallbackMarks.map((m) => ({ name: m.name, emoji: m.emoji ?? undefined })),
    });
    goals.push({
      id: 'today',
      title: 'Today',
      icon: goalVisual.icon,
      accent: goalVisual.accent,
      progress: 0,
      threshold: 7,
      // A pseudo-goal has no commitment to speak of.
      hasCommitment: false,
      marks: fallbackMarks.map(toWidgetMark),
    });
  }

  return { goals, lastUpdated: Date.now(), isPro, theme: currentAppTheme() };
}

export async function syncWidgetData(): Promise<void> {
  if (Platform.OS !== 'ios') return;
  try {
    const SharedGroupPreferences = require('react-native-shared-group-preferences').default;
    const data = await buildWidgetData();
    await SharedGroupPreferences.setItem(WIDGET_DATA_KEY, JSON.stringify(data), APP_GROUP_ID);
    // Nudge WidgetKit to rebuild the timeline NOW (master wave1 fix c3ab3c1) —
    // without it the widget only refreshes on its ≤30-min schedule and sits on
    // .placeholder after a fresh install. Safe no-op when the native module is
    // absent, so it can never regress the data write above.
    try {
      const { ExtensionStorage } = require('@bacons/apple-targets');
      ExtensionStorage.reloadWidget('LivraWidget');
    } catch {
      // Best-effort reload; the data above was still written.
    }
  } catch {
    // Widget sync is non-critical — never propagate errors
  }
}
