/**
 * Livra behavior notification primitives: foreground/tap bookkeeping and window-picking utility.
 * The nag scheduling engine (scheduleBehaviorNotifications et al.) was removed in refactor 3.1.
 * `pickFireInWindow` is still consumed by momentumWarningNotifications.ts.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { formatDate } from '../lib/date';
import { getAppDate } from '../lib/appDate';
import { logger } from '../lib/utils/logger';

const ENGAGEMENT_KEY = 'livra_bn_engagement_v1';
export const LAST_FOREGROUND_KEY = 'livra_bn_last_foreground_v1';

interface EngagementTapState {
  tappedNotifOnDay: Record<string, boolean>;
}

const defaultTapState = (): EngagementTapState => ({
  tappedNotifOnDay: {},
});

async function loadTapState(): Promise<EngagementTapState> {
  try {
    const raw = await AsyncStorage.getItem(ENGAGEMENT_KEY);
    if (!raw) return defaultTapState();
    const p = JSON.parse(raw) as Partial<EngagementTapState>;
    return {
      tappedNotifOnDay: p.tappedNotifOnDay ?? {},
    };
  } catch {
    return defaultTapState();
  }
}

async function saveTapState(s: EngagementTapState): Promise<void> {
  try {
    // Merge with existing stored object to avoid clobbering other keys written by legacy code
    const raw = await AsyncStorage.getItem(ENGAGEMENT_KEY);
    const existing = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    await AsyncStorage.setItem(ENGAGEMENT_KEY, JSON.stringify({ ...existing, ...s }));
  } catch (e) {
    logger.warn('[BehaviorNotif] persist tap state failed', e);
  }
}

/** Call when user taps a behavior notification (opens app from it). */
export async function recordBehaviorNotificationTap(): Promise<void> {
  const today = formatDate(getAppDate());
  const s = await loadTapState();
  s.tappedNotifOnDay[today] = true;
  await saveTapState(s);
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

/**
 * Random fire time inside [start,end] local today, at least `minLeadMs` after `now`, with jitter clamped to window.
 */
export function pickFireInWindow(
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

