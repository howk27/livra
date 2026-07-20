import { Platform } from 'react-native';
import { getAppDate } from '../appDate';
import { query } from '../db';
import { checkProStatus } from '../iap/iap';
import { useGoalsStore } from '../../state/goalsSlice';
import { useMarksStore } from '../../state/countersSlice';
import { resolveMarkCategory, majorityCategory } from '../markCategoryResolve';
import type { WidgetData, WidgetMarkData } from './widgetTypes';
import { APP_GROUP_ID, WIDGET_DATA_KEY } from './widgetTypes';
import { categoryVisual } from './widgetIcons';

export async function buildWidgetData(): Promise<WidgetData> {
  const goalsState = useGoalsStore.getState();
  const activeGoal = goalsState.getActiveGoal();
  const { marks } = useMarksStore.getState();
  const { effectiveUnlocked: isPro } = await checkProStatus();

  // Ring: progress toward the active goal's unlock threshold. Mirrors the
  // goal-detail ring so the widget reads the same as the in-app view.
  const goalRing = activeGoal
    ? goalsState.getGoalProgress(activeGoal.id)
    : { progress: 0, threshold: 7 };

  const appDate = getAppDate();
  const today = `${appDate.getFullYear()}-${String(appDate.getMonth() + 1).padStart(2, '0')}-${String(appDate.getDate()).padStart(2, '0')}`;

  const todayLogs = await query<{ mark_id: string; count: number }>(
    `SELECT counter_id AS mark_id, COUNT(*) AS count
     FROM lc_events
     WHERE date(created_at) = ?
     GROUP BY counter_id`,
    [today],
  );
  const loggedTodayIds = new Set(todayLogs.map(r => r.mark_id));

  const activeMarks = marks.filter(m => !m.deleted_at);

  // The widget is goal-centric: prefer the active goal's marks, falling back to
  // all active marks when the goal has none (or there is no active goal).
  const goalMarks = activeGoal
    ? activeMarks.filter(m => m.goal_id === activeGoal.id)
    : [];
  const sourceMarks = goalMarks.length > 0 ? goalMarks : activeMarks;

  // Category icon + accent, mirroring the in-app mark tile (never a raw emoji).
  const widgetMarks: WidgetMarkData[] = sourceMarks.slice(0, 6).map(mark => {
    const visual = categoryVisual(resolveMarkCategory({ name: mark.name, emoji: mark.emoji }));
    return {
      id: mark.id,
      name: mark.name,
      icon: visual.icon,
      accent: visual.accent,
      completed: loggedTodayIds.has(mark.id),
    };
  });

  const completedCount = widgetMarks.filter(m => m.completed).length;

  // Goal icon = majority category across the goal's marks (goal-detail hero
  // medallion parity), rendered as the matching SF Symbol + accent.
  const goalVisual = categoryVisual(
    majorityCategory(sourceMarks.map(m => ({ name: m.name, emoji: m.emoji }))),
  );

  return {
    activeGoalTitle: activeGoal?.title ?? null,
    goalIcon: goalVisual.icon,
    goalAccent: goalVisual.accent,
    goalProgress: goalRing.progress,
    goalThreshold: Math.max(1, goalRing.threshold),
    marks: widgetMarks,
    completedCount,
    totalCount: widgetMarks.length,
    lastUpdated: Date.now(),
    isPro,
  };
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
