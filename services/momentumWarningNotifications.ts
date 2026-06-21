// services/momentumWarningNotifications.ts
// Reconciles the livra-mw- at-risk warning notification set on each Momentum eval.
// Predictive pre-scheduling: dates computed from the last log; past-window nudges skipped.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { logger } from '../lib/utils/logger';
import { getAppDate } from '../lib/appDate';
import { formatDate, parseISO } from '../lib/date';
import { planMomentumWarnings } from '../lib/momentumWarningPlanner';
import { buildMomentumWarningInputs } from '../lib/notifications/momentumWarningPlan';
import {
  getMomentumFirstNudgeCopy,
  getMomentumFinalNudgeCopy,
  getMomentumCombinedCopy,
} from '../lib/copy';
import {
  LIVRA_MOMENTUM_WARNING_ID_PREFIX,
  cancelLivraScheduledByPrefix,
} from '../lib/notifications/livraScheduledOwnership';
import { pickFireInWindow } from './behaviorNotifications';
import { getLivraRemindersEnabled } from '../lib/notifications/livraReminderPrefs';
import { useGoalsStore } from '../state/goalsSlice';
import { useMarksStore } from '../state/countersSlice';

const LAST_TEMPLATES_KEY = 'livra_mw_last_templates_v1';
type LastTemplates = { first?: string; final?: string; combined?: string };

async function loadLastTemplates(): Promise<LastTemplates> {
  try {
    const raw = await AsyncStorage.getItem(LAST_TEMPLATES_KEY);
    return raw ? (JSON.parse(raw) as LastTemplates) : {};
  } catch {
    return {};
  }
}

async function saveLastTemplates(t: LastTemplates): Promise<void> {
  try {
    await AsyncStorage.setItem(LAST_TEMPLATES_KEY, JSON.stringify(t));
  } catch (e) {
    logger.warn('[MomentumWarn] persist templates failed', e);
  }
}

export async function reconcileMomentumWarnings(userId: string | undefined): Promise<void> {
  if (!userId) return;

  if (!(await getLivraRemindersEnabled())) {
    await cancelLivraScheduledByPrefix(LIVRA_MOMENTUM_WARNING_ID_PREFIX);
    return;
  }
  const { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') return;

  const now = getAppDate();
  const today = formatDate(now);

  const goals = useGoalsStore.getState().goals;
  const allMarks = useMarksStore.getState().marks;

  const inputs = buildMomentumWarningInputs(goals as any, allMarks as any, today);
  const planned = planMomentumWarnings(inputs, today);

  // Always cancel the previous set first (recovery / replace / drop).
  await cancelLivraScheduledByPrefix(LIVRA_MOMENTUM_WARNING_ID_PREFIX);
  if (planned.length === 0) return;

  const last = await loadLastTemplates();
  let idx = 0;

  for (const w of planned) {
    const dayBase = parseISO(w.fireDay); // local midnight of the fire day
    const fireAt = pickFireInWindow(now, dayBase, 9, 0, 20, 0, 60 * 1000);
    if (!fireAt) continue; // today but window already passed

    let title: string;
    let body: string;
    if (w.goals.length >= 2) {
      const c = getMomentumCombinedCopy(w.goals[0]!.title, w.goals[1]!.title, last.combined);
      last.combined = c.template;
      title = 'Momentum';
      body = c.text;
    } else {
      const ref = w.goals[0]!;
      if (ref.isFinal) {
        const c = getMomentumFinalNudgeCopy(ref.title, last.final);
        last.final = c.template;
        title = ref.title;
        body = c.text;
      } else {
        const c = getMomentumFirstNudgeCopy(ref.title, last.first);
        last.first = c.template;
        title = ref.title;
        body = c.text;
      }
    }

    const identifier = `${LIVRA_MOMENTUM_WARNING_ID_PREFIX}${w.fireDay}-${idx++}`;
    try {
      await Notifications.scheduleNotificationAsync({
        identifier,
        content: {
          title,
          body,
          data: { type: 'momentum_warning', livraOwner: true, planDay: w.fireDay },
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: fireAt },
      });
    } catch (e) {
      logger.error('[MomentumWarn] schedule failed', e);
    }
  }

  await saveLastTemplates(last);
}
