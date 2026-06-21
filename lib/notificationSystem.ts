import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LIVRA_BEHAVIOR_ID_PREFIX } from './notifications/livraScheduledOwnership';
import { getLivraRemindersEnabled } from './notifications/livraReminderPrefs';
import { hasMomentumWarningPlannedForToday } from './notifications/momentumWarningPlan';
import { useGoalsStore } from '../state/goalsSlice';
import { useMarksStore } from '../state/countersSlice';
import { getDailyHeader } from './copy';
import type { HeaderState } from './copy';
import { query } from './db';
import { getAppDate } from './appDate';
import { formatDate } from './date';
import { logger } from './utils/logger';

const REMINDER_HOUR_KEY = 'livra_reminder_hour_v1';
export const NOTIFICATION_REMINDER_HOUR_KEY = REMINDER_HOUR_KEY;

async function getReminderHour(): Promise<number> {
  try {
    const v = await AsyncStorage.getItem(REMINDER_HOUR_KEY);
    if (v !== null) {
      const h = parseInt(v, 10);
      if (!isNaN(h) && h >= 0 && h <= 23) return h;
    }
  } catch {}
  return 20;
}

const MILESTONES = [7, 14, 30];

function startOfWeekMonday(d: Date): Date {
  const date = new Date(d);
  const dow = date.getDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function todayAt(now: Date, hours: number, minutes: number): Date {
  const d = new Date(now);
  d.setHours(hours, minutes, 0, 0);
  return d;
}

function isFuture(date: Date, now: Date): boolean {
  return date.getTime() - now.getTime() > 60_000;
}

async function schedule(identifier: string, title: string, body: string | null, fireAt: Date): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    identifier,
    content: {
      title,
      body: body ?? undefined,
      data: { livraOwner: true, type: 'contextual_daily' },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: fireAt,
    },
  });
}

interface EventRow {
  occurred_local_date: string;
}

interface CounterRow {
  id: string;
}

interface CountTodayRow {
  cnt: number;
}

async function getCompletedTodayCount(userId: string, today: string): Promise<number> {
  const rows = await query<CountTodayRow>(
    `SELECT COUNT(DISTINCT e.counter_id) as cnt
     FROM lc_events e
     JOIN lc_counters c ON e.counter_id = c.id
     WHERE c.user_id = ? AND e.event_type = 'increment' AND e.occurred_local_date = ? AND e.deleted_at IS NULL`,
    [userId, today],
  );
  return rows[0]?.cnt ?? 0;
}

async function getAllLoggedDates(userId: string): Promise<string[]> {
  const rows = await query<EventRow>(
    `SELECT DISTINCT lc_events.occurred_local_date FROM lc_events
     JOIN lc_counters ON lc_counters.id = lc_events.counter_id
     WHERE lc_events.event_type = 'increment'
       AND lc_events.deleted_at IS NULL
       AND lc_counters.user_id = ?`,
    [userId],
  );
  return rows.map((r) => r.occurred_local_date).sort();
}

function computeStreak(sortedDates: string[], today: string): number {
  const unique = Array.from(new Set(sortedDates)).sort().reverse();
  if (unique.length === 0) return 0;

  const parseLocal = (s: string): Date => {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d);
  };

  const todayDate = parseLocal(today);
  let streak = 0;
  let cursor = new Date(todayDate);

  for (const dateStr of unique) {
    const d = parseLocal(dateStr);
    const diffMs = cursor.getTime() - d.getTime();
    const diffDays = Math.round(diffMs / 86_400_000);
    if (diffDays === 0) {
      streak += 1;
      // Re-anchor to local midnight before subtracting to avoid DST drift
      cursor = parseLocal(formatDate(cursor));
      cursor.setDate(cursor.getDate() - 1);
    } else if (diffDays === 1) {
      streak += 1;
      // Re-anchor to local midnight before subtracting to avoid DST drift
      cursor = parseLocal(formatDate(d));
      cursor.setDate(cursor.getDate() - 1);
    } else {
      break;
    }
  }

  return streak;
}

function uniqueDaysInRange(dates: string[], start: string, end: string): number {
  const unique = new Set(dates.filter((d) => d >= start && d <= end));
  return unique.size;
}

async function bestWeekLoggedDays(allDates: string[]): Promise<number> {
  if (allDates.length === 0) return 0;

  const parseLocal = (s: string): Date => {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d);
  };

  const sorted = Array.from(new Set(allDates)).sort();
  const earliest = parseLocal(sorted[0]);
  const latest = parseLocal(sorted[sorted.length - 1]);

  let best = 0;
  const weekStart = startOfWeekMonday(earliest);

  while (weekStart <= latest) {
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);

    const ws = formatDate(weekStart);
    const we = formatDate(weekEnd);
    const count = uniqueDaysInRange(sorted, ws, we);
    if (count > best) best = count;

    weekStart.setDate(weekStart.getDate() + 7);
  }

  return best;
}

export async function scheduleContextualDailyNotification(userId: string): Promise<void> {
  try {
    const enabled = await getLivraRemindersEnabled();
    if (!enabled) return;

    const now = getAppDate();
    const today = formatDate(now);
    const identifier = `${LIVRA_BEHAVIOR_ID_PREFIX}contextual-daily`;

    // At-risk days belong to the momentum warning, not a second routine nudge.
    // Suppress the daily (and clear any previously-scheduled daily slot) so we never
    // double-nudge. This replaces the old blanket cancelAllLivraScheduledNotifications(),
    // which also wiped mark reminders and momentum warnings on every run.
    const goals = useGoalsStore.getState().goals;
    const marks = useMarksStore.getState().marks;
    if (hasMomentumWarningPlannedForToday(goals as any, marks as any, today)) {
      await Notifications.cancelScheduledNotificationAsync(identifier).catch(() => {});
      return;
    }

    const allDates = await getAllLoggedDates(userId);
    const completedToday = await getCompletedTodayCount(userId, today);
    const todayLogged = completedToday > 0;

    const currentStreak = computeStreak(allDates, today);

    // Tier 1 — Streak protector
    if (currentStreak >= 3 && !todayLogged) {
      const fireAt = todayAt(now, 20, 0);
      if (isFuture(fireAt, now)) {
        await schedule(identifier, `Day ${currentStreak} ends at midnight.`, null, fireAt);
        return;
      }
    }

    // Tier 2 — Monday hook
    const dow = now.getDay();
    if (dow === 1) {
      const prevWeekEnd = new Date(startOfWeekMonday(now));
      prevWeekEnd.setDate(prevWeekEnd.getDate() - 1);
      const prevWeekStart = new Date(prevWeekEnd);
      prevWeekStart.setDate(prevWeekStart.getDate() - 6);
      const ws = formatDate(prevWeekStart);
      const we = formatDate(prevWeekEnd);
      const lastWeekDays = uniqueDaysInRange(allDates, ws, we);
      const fireAt = todayAt(now, 8, 0);
      if (isFuture(fireAt, now)) {
        await schedule(identifier, `Last week: ${lastWeekDays}/7. This week starts now.`, null, fireAt);
        return;
      }
    }

    // Tier 3 — Near-miss preview
    if (!todayLogged) {
      const weekStart = startOfWeekMonday(now);
      const ws = formatDate(weekStart);
      const we = today;
      const currentWeekDays = uniqueDaysInRange(allDates, ws, we);
      const best = await bestWeekLoggedDays(allDates);
      if (best > 0 && currentWeekDays + 1 === best && currentWeekDays < best) {
        const fireAt = todayAt(now, 18, 0);
        if (isFuture(fireAt, now)) {
          await schedule(identifier, 'One more today. Best week ever.', null, fireAt);
          return;
        }
      }
    }

    // Tier 4 — Milestone preview
    const nextDay = currentStreak + 1;
    if (MILESTONES.includes(nextDay)) {
      const fireAt = todayAt(now, 9, 0);
      if (isFuture(fireAt, now)) {
        await schedule(identifier, `Tomorrow: day ${nextDay}.`, null, fireAt);
        return;
      }
    }

    // Tier 5 — Default daily reminder
    const counters = await query<CounterRow>(
      `SELECT id FROM lc_counters WHERE user_id = ? AND deleted_at IS NULL`,
      [userId],
    );
    const totalMarks = counters.length;
    const daysSinceLastLog = allDates.length === 0
      ? -1
      : (() => {
          const sorted = [...allDates].sort().reverse();
          const parseLocal = (s: string): Date => {
            const [y, m, d] = s.split('-').map(Number);
            return new Date(y, m - 1, d);
          };
          const last = parseLocal(sorted[0]);
          const todayDate = parseLocal(today);
          return Math.round((todayDate.getTime() - last.getTime()) / 86_400_000);
        })();

    const headerState: HeaderState = {
      completedToday,
      totalMarks,
      streakDays: currentStreak,
      now,
      daysSinceLastLog,
    };
    const header = getDailyHeader(headerState);
    const reminderHour = await getReminderHour();
    const fireAt = todayAt(now, reminderHour, 0);
    if (isFuture(fireAt, now)) {
      await schedule(identifier, header.title, null, fireAt);
    }
  } catch (e) {
    logger.warn('[NotificationSystem] scheduleContextualDailyNotification failed', e);
  }
}
