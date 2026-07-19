import { Platform } from 'react-native';
import { getAppDate } from '../appDate';
import { query } from '../db';
import { checkProStatus } from '../iap/iap';
import { useGoalsStore } from '../../state/goalsSlice';
import { useMarksStore } from '../../state/countersSlice';
import type { WidgetData, WidgetMarkData } from './widgetTypes';
import { APP_GROUP_ID, WIDGET_DATA_KEY } from './widgetTypes';
import { getCategoryColorForMark } from '../markCategory';

export async function buildWidgetData(): Promise<WidgetData> {
  const activeGoal = useGoalsStore.getState().getActiveGoal();
  const { marks } = useMarksStore.getState();
  const { effectiveUnlocked: isPro } = await checkProStatus();

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
    // QC4-M: the widget read `mark.color` raw, so it kept showing the dead
    // pre-QC4-M hex — and carried its own fallback literal, sanctioned by
    // nothing — while the app healed. Same resolver as MarkCard: one color per
    // mark, wherever it is rendered.
    color: getCategoryColorForMark({ name: mark.name, color: mark.color }),
    completed: loggedTodayIds.has(mark.id),
  }));

  const completedCount = widgetMarks.filter(m => m.completed).length;

  return {
    activeGoalTitle: activeGoal?.title ?? null,
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
    // Nudge WidgetKit to rebuild the timeline NOW. Without this the widget only
    // refreshes on its own ≤30-min schedule (getTimeline policy) — and on a
    // fresh install it sits on `.placeholder` until iOS first decides to load
    // it, which reads on-device as "the widget never loads". `reloadWidget`
    // targets the Swift widget `kind` ("LivraWidget") and is a safe no-op when
    // the native module isn't present, so it can never regress the data write.
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
