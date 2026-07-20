import { Platform } from 'react-native';
import { getAppDate } from '../appDate';
import { query } from '../db';
import { checkProStatus } from '../iap/iap';
import { getActiveGoals } from '../goalLogic';
import { useGoalsStore } from '../../state/goalsSlice';
import { useMarksStore } from '../../state/countersSlice';
import { resolveMarkCategory, majorityCategory } from '../markCategoryResolve';
import type { WidgetData, WidgetMarkData, WidgetGoalData } from './widgetTypes';
import { APP_GROUP_ID, WIDGET_DATA_KEY } from './widgetTypes';
import { categoryVisual } from './widgetIcons';

const MAX_GOALS = 4;
const MAX_MARKS_PER_GOAL = 6;

export async function buildWidgetData(): Promise<WidgetData> {
  const goalsState = useGoalsStore.getState();
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
  const loggedTodayIds = new Set(todayLogs.map((r) => r.mark_id));
  const activeMarks = marks.filter((m) => !m.deleted_at);

  const toWidgetMark = (mark: (typeof activeMarks)[number]): WidgetMarkData => {
    const visual = categoryVisual(resolveMarkCategory({ name: mark.name, emoji: mark.emoji }));
    return {
      id: mark.id,
      name: mark.name,
      icon: visual.icon,
      accent: visual.accent,
      completed: loggedTodayIds.has(mark.id),
    };
  };

  const goals: WidgetGoalData[] = [];
  for (const goal of getActiveGoals(goalsState.goals).slice(0, MAX_GOALS)) {
    const goalMarks = activeMarks.filter((m) => m.goal_id === goal.id).slice(0, MAX_MARKS_PER_GOAL);
    if (goalMarks.length === 0) continue; // nothing loggable — skip
    const ring = goalsState.getGoalProgress(goal.id);
    const goalVisual = categoryVisual(
      majorityCategory(goalMarks.map((m) => ({ name: m.name, emoji: m.emoji }))),
    );
    goals.push({
      id: goal.id,
      title: goal.title,
      icon: goalVisual.icon,
      accent: goalVisual.accent,
      progress: ring.progress,
      threshold: Math.max(1, ring.threshold),
      marks: goalMarks.map(toWidgetMark),
    });
  }

  // Fallback: no active goal has marks → one "Today" pseudo-goal over all marks,
  // preserving the pre-rework goal-less behavior.
  if (goals.length === 0 && activeMarks.length > 0) {
    const fallbackMarks = activeMarks.slice(0, MAX_MARKS_PER_GOAL);
    const goalVisual = categoryVisual(
      majorityCategory(fallbackMarks.map((m) => ({ name: m.name, emoji: m.emoji }))),
    );
    goals.push({
      id: 'today',
      title: 'Today',
      icon: goalVisual.icon,
      accent: goalVisual.accent,
      progress: 0,
      threshold: 7,
      marks: fallbackMarks.map(toWidgetMark),
    });
  }

  return { goals, lastUpdated: Date.now(), isPro };
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
