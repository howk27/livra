import { Platform } from 'react-native';
import { getAppDate } from '../appDate';
import { query } from '../db';
import { checkProStatus } from '../iap/iap';
import { useGoalsStore } from '../../state/goalsSlice';
import { useMarksStore } from '../../state/countersSlice';
import type { WidgetData, WidgetMarkData } from './widgetTypes';
import { APP_GROUP_ID, WIDGET_DATA_KEY } from './widgetTypes';

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

  const widgetMarks: WidgetMarkData[] = activeMarks.slice(0, 6).map(mark => ({
    id: mark.id,
    name: mark.name,
    icon: mark.emoji ?? '',
    color: mark.color ?? '#C47E8A',
    completed: loggedTodayIds.has(mark.id),
  }));

  const completedCount = widgetMarks.filter(m => m.completed).length;

  return {
    activeGoalTitle: activeGoal?.title ?? null,
    goalIcon: activeGoal?.icon ?? '',
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
  } catch {
    // Widget sync is non-critical — never propagate errors
  }
}
