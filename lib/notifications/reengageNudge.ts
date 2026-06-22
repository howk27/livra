import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLivraRemindersEnabled } from './livraReminderPrefs';
import { hasMomentumWarningPlannedForToday } from './momentumWarningPlan';
import { LIVRA_BEHAVIOR_ID_PREFIX } from './livraScheduledOwnership';
import { useGoalsStore } from '../../state/goalsSlice';
import { useMarksStore } from '../../state/countersSlice';
import { getAppDate } from '../appDate';
import { formatDate } from '../date';
import { logger } from '../utils/logger';

export const REENGAGE_TITLE = 'Your goal is still here.';
export const REENGAGE_BODY = "Whenever you're ready, pick up where you left off. There's no rush.";

export const REENGAGE_IDLE_DAYS = 7;
export const REENGAGE_REPEAT_DAYS = 7;

export interface ReengageInput {
  activeGoalCount: number;
  daysIdle: number;
  lastNudgeDate: string | null; // 'yyyy-MM-dd' or null
  atRiskPlanned: boolean;
  today: string; // 'yyyy-MM-dd'
}
export interface ReengageNudge {
  title: string;
  body: string;
}

function daysBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  const a = new Date(fy, fm - 1, fd).getTime();
  const b = new Date(ty, tm - 1, td).getTime();
  return Math.round((b - a) / 86_400_000);
}

export function planReengageNudge(input: ReengageInput): ReengageNudge | null {
  if (input.activeGoalCount < 1) return null;
  if (input.atRiskPlanned) return null;
  if (input.daysIdle < REENGAGE_IDLE_DAYS) return null;
  if (input.lastNudgeDate && daysBetween(input.lastNudgeDate, input.today) < REENGAGE_REPEAT_DAYS) {
    return null;
  }
  return { title: REENGAGE_TITLE, body: REENGAGE_BODY };
}

const REENGAGE_ID = `${LIVRA_BEHAVIOR_ID_PREFIX}reengage`;
const LAST_NUDGE_KEY = 'livra_reengage_last_v1';

function daysIdleFromMarks(activeMarkDates: (string | null | undefined)[], today: string): number {
  const dates = activeMarkDates.filter((d): d is string => !!d).sort();
  if (dates.length === 0) return Number.MAX_SAFE_INTEGER; // never logged → treat as idle
  const newest = dates[dates.length - 1];
  const [ny, nm, nd] = newest.split('-').map(Number);
  const [ty, tm, td] = today.split('-').map(Number);
  return Math.round((new Date(ty, tm - 1, td).getTime() - new Date(ny, nm - 1, nd).getTime()) / 86_400_000);
}

export async function scheduleReengageNudge(userId: string | undefined): Promise<void> {
  try {
    if (!userId) return;
    if (!(await getLivraRemindersEnabled())) return;
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') return;

    const now = getAppDate();
    const today = formatDate(now);
    const goals = useGoalsStore.getState().getActiveGoals();
    const marks = useMarksStore.getState().marks;

    const activeGoalIds = new Set(goals.map((g) => g.id));
    const activeMarkDates = marks
      .filter((m) => !m.deleted_at && m.goal_id && activeGoalIds.has(m.goal_id))
      .map((m) => m.last_activity_date);

    const daysIdle = daysIdleFromMarks(activeMarkDates, today);
    const atRiskPlanned = hasMomentumWarningPlannedForToday(goals as any, marks as any, today);
    const lastNudgeDate = await AsyncStorage.getItem(LAST_NUDGE_KEY);

    const plan = planReengageNudge({
      activeGoalCount: goals.length,
      daysIdle,
      lastNudgeDate,
      atRiskPlanned,
      today,
    });

    // Always clear a prior re-engage slot so it never lingers when conditions lapse.
    await Notifications.cancelScheduledNotificationAsync(REENGAGE_ID).catch(() => {});
    if (!plan) return;

    const fireAt = new Date(now.getTime() + 60 * 60 * 1000); // ~1 hour out
    await Notifications.scheduleNotificationAsync({
      identifier: REENGAGE_ID,
      content: { title: plan.title, body: plan.body, data: { type: 'reengage', livraOwner: true } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: fireAt },
    });
    await AsyncStorage.setItem(LAST_NUDGE_KEY, today);
  } catch (e) {
    logger.warn('[Reengage] schedule failed', e);
  }
}
