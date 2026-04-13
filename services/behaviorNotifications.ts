/**
 * Behavior-driven local notifications: low frequency (max 2/day), jittered windows,
 * re-planned on each app foreground — no repeating calendar triggers.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { query } from '../lib/db';
import { formatDate } from '../lib/date';
import { getAppDate } from '../lib/appDate';
import { resolveDailyTarget } from '../lib/markDailyTarget';
import { isMarkActiveOnDate } from '../lib/features';
import { computeStreak } from '../hooks/useStreaks';
import type { Counter, CounterEvent } from '../types';
import { logger } from '../lib/utils/logger';

const ENGAGEMENT_KEY = 'livra_bn_engagement_v1';
const LAST_FOREGROUND_KEY = 'livra_bn_last_foreground_v1';
const BEHAVIOR_NOTIF_PREFIX = 'livra-bn-';

export type BehaviorNotifType = 'momentum' | 'midday' | 'end_of_day' | 'win';

export interface PlannedBehaviorNotification {
  type: BehaviorNotifType;
  fireAt: Date;
  title: string;
  body: string;
}

interface EngagementState {
  /** Calendar day (YYYY-MM-DD) we last rolled daily counters for */
  lastRollDay: string;
  /** We scheduled ≥1 behavior notif on that local calendar day */
  hadScheduleOnDay: Record<string, boolean>;
  /** User opened app via tapping our notification on that day */
  tappedNotifOnDay: Record<string, boolean>;
  /** Consecutive prior days with schedule but no tap (capped at 10) */
  consecutiveNoTapDays: number;
}

const defaultEngagement = (): EngagementState => ({
  lastRollDay: '',
  hadScheduleOnDay: {},
  tappedNotifOnDay: {},
  consecutiveNoTapDays: 0,
});

async function loadEngagement(): Promise<EngagementState> {
  try {
    const raw = await AsyncStorage.getItem(ENGAGEMENT_KEY);
    if (!raw) return defaultEngagement();
    const p = JSON.parse(raw) as EngagementState;
    return {
      ...defaultEngagement(),
      ...p,
      hadScheduleOnDay: p.hadScheduleOnDay ?? {},
      tappedNotifOnDay: p.tappedNotifOnDay ?? {},
    };
  } catch {
    return defaultEngagement();
  }
}

async function saveEngagement(s: EngagementState): Promise<void> {
  try {
    await AsyncStorage.setItem(ENGAGEMENT_KEY, JSON.stringify(s));
  } catch (e) {
    logger.warn('[BehaviorNotif] persist engagement failed', e);
  }
}

/** Call when user taps a behavior notification (opens app from it). */
export async function recordBehaviorNotificationTap(): Promise<void> {
  const today = formatDate(getAppDate());
  const s = await loadEngagement();
  s.tappedNotifOnDay[today] = true;
  s.consecutiveNoTapDays = 0;
  await saveEngagement(s);
}

/** Call on every app foreground (active). */
export async function recordBehaviorAppForeground(): Promise<void> {
  try {
    await AsyncStorage.setItem(LAST_FOREGROUND_KEY, new Date().toISOString());
  } catch {
    /* ignore */
  }
}

export async function getLastBehaviorForegroundMs(): Promise<number | null> {
  try {
    const raw = await AsyncStorage.getItem(LAST_FOREGROUND_KEY);
    if (!raw) return null;
    const t = new Date(raw).getTime();
    return Number.isFinite(t) ? t : null;
  } catch {
    return null;
  }
}

function clampToDayWindow(d: Date, dayStart: Date, windowStart: Date, windowEnd: Date): Date {
  const t = d.getTime();
  const ws = Math.max(windowStart.getTime(), dayStart.getTime());
  const we = windowEnd.getTime();
  return new Date(Math.min(we, Math.max(ws, t)));
}

/** Jitter ±20–40 minutes (random magnitude), then clamp to [lo, hi]. */
function jitterWithinWindow(base: Date, lo: Date, hi: Date): Date {
  const minMag = 20;
  const maxMag = 40;
  const magMin = minMag + Math.random() * (maxMag - minMag);
  const sign = Math.random() < 0.5 ? -1 : 1;
  const ms = sign * magMin * 60 * 1000;
  let t = base.getTime() + ms;
  t = Math.min(hi.getTime(), Math.max(lo.getTime(), t));
  return new Date(t);
}

function startOfLocalDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export interface DayProgressSnapshot {
  todayStr: string;
  activeMarkCount: number;
  completedCount: number;
  incompleteCount: number;
  incompleteNames: string[];
  /** Any streak-enabled mark at risk today (derived, same as notifications analysis) */
  anyStreakAtRisk: boolean;
  maxCurrentStreak: number;
}

export async function computeDayProgress(userId: string): Promise<DayProgressSnapshot | null> {
  const anchor = getAppDate();
  const todayStr = formatDate(anchor);

  const counters = await query<Counter>(
    'SELECT * FROM lc_counters WHERE deleted_at IS NULL AND user_id = ? ORDER BY sort_index',
    [userId],
  );
  if (counters.length === 0) return null;

  const counterIds = counters.map((c) => c.id);
  const placeholders = counterIds.map(() => '?').join(',');
  const eventsQuery =
    counterIds.length > 0
      ? `SELECT id, user_id, counter_id as mark_id, event_type, amount, occurred_at, occurred_local_date, meta, deleted_at, created_at, updated_at FROM lc_events WHERE deleted_at IS NULL AND counter_id IN (${placeholders})`
      : '';
  const allEvents: CounterEvent[] =
    counterIds.length > 0 ? await query<CounterEvent>(eventsQuery, counterIds) : [];

  const activeMarks = counters.filter((c) => isMarkActiveOnDate(c, anchor));
  if (activeMarks.length === 0) {
    return {
      todayStr,
      activeMarkCount: 0,
      completedCount: 0,
      incompleteCount: 0,
      incompleteNames: [],
      anyStreakAtRisk: false,
      maxCurrentStreak: 0,
    };
  }

  let completedCount = 0;
  const incompleteNames: string[] = [];
  let anyStreakAtRisk = false;
  let maxCurrentStreak = 0;

  for (const c of activeMarks) {
    const target = resolveDailyTarget(c);
    const count = allEvents
      .filter(
        (e) =>
          e.mark_id === c.id &&
          !e.deleted_at &&
          e.event_type === 'increment' &&
          e.occurred_local_date === todayStr,
      )
      .reduce((s, e) => s + (e.amount ?? 1), 0);
    if (count >= target) {
      completedCount++;
    } else {
      incompleteNames.push(c.name);
    }

    if (c.enable_streak) {
      const inc = allEvents.filter((e) => e.mark_id === c.id && !e.deleted_at && e.event_type === 'increment');
      const streakData = computeStreak(inc, anchor);
      maxCurrentStreak = Math.max(maxCurrentStreak, streakData.current);
      const hasActivityToday = count > 0;
      if (streakData.current > 0 && streakData.lastDate) {
        const last = new Date(streakData.lastDate + 'T12:00:00');
        const diffDays = Math.round((anchor.getTime() - last.getTime()) / (86400000));
        if (diffDays === 1 && !hasActivityToday) {
          anyStreakAtRisk = true;
        }
      }
    }
  }

  return {
    todayStr,
    activeMarkCount: activeMarks.length,
    completedCount,
    incompleteCount: activeMarks.length - completedCount,
    incompleteNames,
    anyStreakAtRisk,
    maxCurrentStreak,
  };
}

function buildCopy(
  type: BehaviorNotifType,
  p: DayProgressSnapshot,
): { title: string; body: string } {
  const rem = p.incompleteCount;
  const done = p.completedCount;
  const total = p.activeMarkCount;
  const streak = p.maxCurrentStreak;

  switch (type) {
    case 'momentum': {
      const titles = ['Start your day in Livra', 'Room for a quick win', 'Your marks are waiting'];
      const t = titles[Math.floor(Math.random() * titles.length)]!;
      let body: string;
      if (rem === total) {
        body =
          total === 1
            ? `You have 1 mark to log today — one tap starts the streak.`
            : `You have ${total} marks to touch today. Pick the easiest first.`;
      } else {
        body =
          rem === 1
            ? `1 mark still open today — knock it off whenever you have a minute.`
            : `${rem} marks still open — even one completion moves the day forward.`;
      }
      if (streak > 0 && p.anyStreakAtRisk) {
        body += ` Keep your ${streak}-day momentum going.`;
      }
      return { title: t, body };
    }
    case 'midday': {
      const titles = ['Halfway through the day', 'Still time to finish strong', 'Midday check-in'];
      const t = titles[Math.floor(Math.random() * titles.length)]!;
      const ratio = total > 0 ? done / total : 0;
      const body =
        ratio >= 0.5
          ? `You're over halfway (${done}/${total} today). Finish the rest before the day slips away.`
          : `${done} of ${total} done — close the gap this afternoon.`;
      return { title: t, body };
    }
    case 'end_of_day': {
      const titles = ['Save today’s progress', 'Before the day ends', 'Don’t lose the streak'];
      const t = titles[Math.floor(Math.random() * titles.length)]!;
      let body: string;
      if (rem === 1) {
        body = `1 more mark to complete today — quick log keeps everything honest.`;
      } else {
        body = `${rem} marks still open — a few taps now beat starting from zero tomorrow.`;
      }
      if (p.anyStreakAtRisk) {
        body += ` Keep your streak alive.`;
      }
      return { title: t, body };
    }
    case 'win': {
      const allDoneHere = p.completedCount >= p.activeMarkCount;
      const titles = allDoneHere
        ? ['You crushed today', 'Full board — nice', 'That’s how consistency looks']
        : ['Almost a full sweep', 'Strong progress today', 'You’re in the zone'];
      const t = titles[Math.floor(Math.random() * titles.length)]!;
      const body = allDoneHere
        ? total <= 1
          ? `Every mark for today is done. See you tomorrow.`
          : `All ${total} marks complete today. Carry that energy forward.`
        : rem === 1
          ? `1 mark left today — you’re already ${done} of ${total}. Finish the set.`
          : `${done} of ${total} done — close it out and make today a full win.`;
      return { title: t, body };
    }
  }
}

/**
 * Random fire time inside [start,end] local today, at least `minLeadMs` after `now`, with jitter clamped to window.
 */
function pickFireInWindow(
  now: Date,
  dayBase: Date,
  startH: number,
  startM: number,
  endH: number,
  endM: number,
  minLeadMs: number,
): Date | null {
  const winLo = new Date(dayBase);
  winLo.setHours(startH, startM, 0, 0);
  const winHi = new Date(dayBase);
  winHi.setHours(endH, endM, 59, 999);
  const earliest = new Date(Math.max(now.getTime() + minLeadMs, winLo.getTime()));
  if (earliest >= winHi) return null;
  const span = winHi.getTime() - earliest.getTime();
  const raw = new Date(earliest.getTime() + Math.random() * span);
  return jitterWithinWindow(raw, winLo, winHi);
}

async function rollEngagementForNewDay(todayStr: string): Promise<EngagementState> {
  const s = await loadEngagement();
  if (s.lastRollDay === todayStr) return s;

  const yesterday = new Date(getAppDate());
  yesterday.setDate(yesterday.getDate() - 1);
  const yStr = formatDate(yesterday);

  const hadY = !!s.hadScheduleOnDay[yStr];
  const tappedY = !!s.tappedNotifOnDay[yStr];
  if (hadY && !tappedY) {
    s.consecutiveNoTapDays = Math.min(10, s.consecutiveNoTapDays + 1);
  } else if (tappedY) {
    s.consecutiveNoTapDays = 0;
  }

  s.lastRollDay = todayStr;
  await saveEngagement(s);
  return s;
}

function planCandidates(
  now: Date,
  p: DayProgressSnapshot,
  engagement: EngagementState,
  previousForegroundAt: number | null,
): PlannedBehaviorNotification[] {
  const candidates: PlannedBehaviorNotification[] = [];
  if (p.activeMarkCount === 0) return candidates;

  if (engagement.consecutiveNoTapDays >= 3) {
    return [];
  }

  const dayBase = startOfLocalDay(now);
  const hour = now.getHours();
  const minute = now.getMinutes();
  const mins = hour * 60 + minute;

  const allDone = p.completedCount >= p.activeMarkCount && p.activeMarkCount > 0;
  const partial = p.completedCount > 0 && p.completedCount < p.activeMarkCount;
  const strongRatio = p.activeMarkCount > 0 && p.completedCount / p.activeMarkCount >= 0.8;
  const openedRecently =
    previousForegroundAt !== null &&
    now.getTime() - previousForegroundAt < 2 * 60 * 60 * 1000;

  // Win reinforcement
  if (allDone || strongRatio) {
    const fire = pickFireInWindow(now, dayBase, 17, 0, 20, 30, 25 * 60 * 1000);
    if (fire) {
      const { title, body } = buildCopy('win', p);
      candidates.push({ type: 'win', fireAt: fire, title, body });
    }
  }

  if (allDone) {
    return candidates;
  }

  // Momentum: 0–1 completed today, idle 3h+, 9am–8pm (uses previous session foreground, not this open)
  const lastFg = previousForegroundAt;
  const idleOk = lastFg === null || now.getTime() - lastFg >= 3 * 60 * 60 * 1000;
  if (p.completedCount <= 1 && idleOk && !openedRecently && mins >= 9 * 60 && mins < 20 * 60) {
    const fire = pickFireInWindow(now, dayBase, 9, 0, 20, 0, 45 * 60 * 1000);
    if (fire) {
      const { title, body } = buildCopy('momentum', p);
      candidates.push({ type: 'momentum', fireAt: fire, title, body });
    }
  }

  // Midday nudge: partial, 11:30–15:00 window (spec 11–3pm extended slightly for jitter)
  if (partial && mins >= 10 * 60 && mins < 15 * 60) {
    const winLo = new Date(dayBase);
    winLo.setHours(11, 30, 0, 0);
    const winHi = new Date(dayBase);
    winHi.setHours(15, 0, 0, 0);
    const earliest = new Date(Math.max(now.getTime() + 20 * 60 * 1000, winLo.getTime()));
    if (earliest < winHi) {
      const span = winHi.getTime() - earliest.getTime();
      const raw = new Date(earliest.getTime() + Math.random() * span);
      const fire = jitterWithinWindow(raw, winLo, winHi);
      const { title, body } = buildCopy('midday', p);
      candidates.push({ type: 'midday', fireAt: fire, title, body });
    }
  }

  // End-of-day: incomplete, ~last hours (18:00–22:30)
  if (p.incompleteCount > 0 && mins >= 16 * 60) {
    const fire = pickFireInWindow(now, dayBase, 18, 0, 22, 30, 20 * 60 * 1000);
    if (fire) {
      const { title, body } = buildCopy('end_of_day', p);
      candidates.push({ type: 'end_of_day', fireAt: fire, title, body });
    }
  }

  const filtered = openedRecently ? candidates.filter((c) => c.type === 'win') : candidates;
  filtered.sort((a, b) => a.fireAt.getTime() - b.fireAt.getTime());
  return filtered;
}

const MIN_GAP_MS = 3 * 60 * 60 * 1000;
const MAX_PER_DAY = 2;

function pickWithMinGap(sorted: PlannedBehaviorNotification[]): PlannedBehaviorNotification[] {
  const out: PlannedBehaviorNotification[] = [];
  for (const c of sorted) {
    if (out.length >= MAX_PER_DAY) break;
    if (out.length === 0) {
      out.push(c);
      continue;
    }
    const last = out[out.length - 1]!;
    if (c.fireAt.getTime() - last.fireAt.getTime() >= MIN_GAP_MS) {
      out.push(c);
    }
  }
  return out;
}

export async function cancelBehaviorNotifications(): Promise<void> {
  try {
    const pending = await Notifications.getAllScheduledNotificationsAsync();
    for (const n of pending) {
      const id = n.identifier;
      if (id.startsWith(BEHAVIOR_NOTIF_PREFIX)) {
        await Notifications.cancelScheduledNotificationAsync(id);
        continue;
      }
      const t = (n.content.data as Record<string, unknown>)?.type;
      if (typeof t === 'string' && t.startsWith('behavior_')) {
        await Notifications.cancelScheduledNotificationAsync(id);
      }
    }
  } catch (e) {
    logger.warn('[BehaviorNotif] cancel failed', e);
  }
}

export async function scheduleBehaviorNotifications(
  userId: string | undefined,
  previousForegroundAt: number | null = null,
): Promise<string[]> {
  if (!userId) {
    logger.log('[BehaviorNotif] skip — no user');
    return [];
  }

  const { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') {
    logger.log('[BehaviorNotif] skip — no permission');
    return [];
  }

  const now = new Date();
  const todayStr = formatDate(getAppDate());
  const engagement = await rollEngagementForNewDay(todayStr);

  if (engagement.consecutiveNoTapDays >= 3) {
    logger.log('[BehaviorNotif] skip — consecutive no-tap streak');
    await cancelBehaviorNotifications();
    return [];
  }

  const progress = await computeDayProgress(userId);
  if (!progress || progress.activeMarkCount === 0) {
    await cancelBehaviorNotifications();
    return [];
  }

  const candidates = planCandidates(now, progress, engagement, previousForegroundAt);
  const chosen = pickWithMinGap(candidates);

  await cancelBehaviorNotifications();

  const ids: string[] = [];
  let idx = 0;
  for (const plan of chosen) {
    if (plan.fireAt.getTime() <= now.getTime() + 30 * 1000) continue;

    const identifier = `${BEHAVIOR_NOTIF_PREFIX}${todayStr}-${plan.type}-${idx++}`;
    try {
      const id = await Notifications.scheduleNotificationAsync({
        identifier,
        content: {
          title: plan.title,
          body: plan.body,
          data: {
            type: `behavior_${plan.type}`,
            behavior: true,
            planDay: todayStr,
          },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: plan.fireAt,
        },
      });
      if (id) ids.push(id);
    } catch (e) {
      logger.error('[BehaviorNotif] schedule failed', e);
    }
  }

  if (ids.length > 0) {
    const nextEngagement = await loadEngagement();
    nextEngagement.hadScheduleOnDay[todayStr] = true;
    await saveEngagement(nextEngagement);
  }

  logger.log(`[BehaviorNotif] scheduled ${ids.length} for ${todayStr}`, ids);
  return ids;
}

/** Debounced entry from AppState / home — avoids burst cancels. */
let lastRunAt = 0;
const DEBOUNCE_MS = 2500;

export async function runBehaviorNotificationScheduler(userId: string | undefined): Promise<void> {
  const previousFg = await getLastBehaviorForegroundMs();
  const t = Date.now();
  if (t - lastRunAt < DEBOUNCE_MS) {
    await recordBehaviorAppForeground();
    return;
  }
  lastRunAt = t;
  try {
    await scheduleBehaviorNotifications(userId, previousFg);
  } catch (e) {
    logger.error('[BehaviorNotif] scheduler error', e);
  } finally {
    await recordBehaviorAppForeground();
  }
}
