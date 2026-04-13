import AsyncStorage from '@react-native-async-storage/async-storage';
import { addDays, format, subDays } from 'date-fns';
import { initDatabase, query } from '../db';
import { env } from '../env';
import { getAppDate } from '../appDate';
import { WeeklyReview, WeeklyReviewDay, WeeklyReviewStreakHighlight } from '../../types/WeeklyReview';

type ReviewEvent = {
  counter_id: string;
  event_type: 'increment' | 'decrement' | 'reset';
  amount: number;
  occurred_local_date: string;
};

type ReviewCounter = {
  id: string;
  name: string;
  emoji?: string | null;
};

type ReviewStreak = {
  counter_id: string;
  current_streak: number;
  last_increment_date?: string | null;
};

type WeeklyHistoryEntry = {
  weekStart: string;
  totalActivity: number;
};

const HISTORY_KEY = 'livra_weekly_review_history';
export const WEEKLY_REVIEW_SEED_USER_KEY = 'livra_weekly_review_seed_user_id';

const toLocalDate = (date: Date): string => format(date, 'yyyy-MM-dd');
export const normalizeLocalDateKey = (value: string): string => {
  if (!value) return value;
  if (value.includes('T')) return value.slice(0, 10);
  if (value.includes(' ')) return value.slice(0, 10);
  return value;
};

const toLabel = (dateStr: string): string => {
  const date = new Date(`${dateStr}T00:00:00`);
  return format(date, 'EEE');
};

export const getWeekRange = (referenceDate: Date = getAppDate()) => {
  const weekEndDate = referenceDate;
  const weekStartDate = subDays(weekEndDate, 6);
  return {
    weekStart: toLocalDate(weekStartDate),
    weekEnd: toLocalDate(weekEndDate),
  };
};

export const buildWeekDates = (weekStart: string): string[] => {
  const start = new Date(`${weekStart}T00:00:00`);
  return Array.from({ length: 7 }, (_, i) => toLocalDate(addDays(start, i)));
};

const computeIntensity = (total: number, max: number): 0 | 1 | 2 | 3 => {
  if (max <= 0 || total <= 0) return 0;
  const ratio = total / max;
  if (ratio < 0.34) return 1;
  if (ratio < 0.67) return 2;
  return 3;
};

const summarizeHistory = (history: WeeklyHistoryEntry[], currentTotal: number): boolean => {
  const recent = history.slice(-4);
  if (recent.length < 3) return false;
  const previousTotals = recent.map(entry => entry.totalActivity);
  return currentTotal > Math.max(...previousTotals);
};

const getInsight = (params: {
  totalActivity: number;
  daysActive: number;
  bestDay: { label: string; total: number; date: string };
  midDay: { label: string; total: number };
  lastTwoTotal: number;
  topCounter?: { name: string; total: number };
  historyIsBest: boolean;
}): string => {
  if (params.totalActivity === 0) {
    return 'A small step today can turn this week around.';
  }

  if (params.historyIsBest) {
    return 'New high: best week in 4 weeks.';
  }

  if (params.lastTwoTotal / params.totalActivity >= 0.5) {
    return 'You finished strong — most of your momentum came in the last two days.';
  }

  if (params.midDay.total === 0 && params.totalActivity > 0) {
    return `Midweek dip: ${params.midDay.label} was quiet, but you picked it back up later.`;
  }

  if (params.topCounter && params.topCounter.total / params.totalActivity >= 0.6) {
    return `Most of your activity came from ${params.topCounter.name} — one habit carried the week.`;
  }

  if (params.daysActive >= 5) {
    return `Consistent rhythm: you showed up on ${params.daysActive} days.`;
  }

  return `Best day: ${params.bestDay.label} led the week.`;
};

export const getEmptyStateCtaTarget = (hasCounters: boolean): string =>
  hasCounters ? '/(tabs)/home' : '/counter/new';

export const computeWeeklyReview = (params: {
  weekStart: string;
  weekEnd: string;
  events: ReviewEvent[];
  counters: ReviewCounter[];
  streaks: ReviewStreak[];
  historyTotals?: WeeklyHistoryEntry[];
}): WeeklyReview => {
  const { weekStart, weekEnd, events, counters, streaks, historyTotals } = params;
  const weekDates = buildWeekDates(weekStart);

  const countersById = new Map<string, ReviewCounter>();
  counters.forEach(counter => {
    countersById.set(counter.id, counter);
  });

  const dayTotals = new Map<string, number>();
  weekDates.forEach(date => dayTotals.set(date, 0));

  const counterTotals = new Map<string, number>();
  events.forEach(event => {
    if (event.event_type !== 'increment') return;
    const normalizedDate = normalizeLocalDateKey(event.occurred_local_date);
    if (!dayTotals.has(normalizedDate)) return;
    const amount = Number(event.amount || 0);
    if (!Number.isFinite(amount) || amount <= 0) return;
    dayTotals.set(normalizedDate, (dayTotals.get(normalizedDate) || 0) + amount);
    counterTotals.set(event.counter_id, (counterTotals.get(event.counter_id) || 0) + amount);
  });

  const totalsArray = weekDates.map(date => ({
    date,
    label: toLabel(date),
    total: dayTotals.get(date) || 0,
  }));

  const totalActivity = totalsArray.reduce((sum, day) => sum + day.total, 0);
  const daysActive = totalsArray.filter(day => day.total > 0).length;

  const bestDay = totalsArray.reduce((best, current) => {
    if (current.total > best.total) return current;
    if (current.total === best.total && current.date > best.date) return current;
    return best;
  }, totalsArray[0]);

  const worstDay = totalsArray.reduce((worst, current) => {
    if (current.total < worst.total) return current;
    if (current.total === worst.total && current.date < worst.date) return current;
    return worst;
  }, totalsArray[0]);

  const topCounters = Array.from(counterTotals.entries())
    .map(([id, total]) => {
      const counter = countersById.get(id);
      return {
        id,
        name: counter?.name || 'Unknown',
        emoji: counter?.emoji,
        total,
      };
    })
    .sort((a, b) => b.total - a.total)
    .slice(0, 3);

  const streaksActive: WeeklyReviewStreakHighlight[] = streaks
    .filter(streak => (streak.current_streak || 0) > 0)
    .map(streak => {
      const counter = countersById.get(streak.counter_id);
      return {
        id: streak.counter_id,
        name: counter?.name || 'Unknown',
        emoji: counter?.emoji,
        currentStreak: streak.current_streak || 0,
        lastIncrementDate: streak.last_increment_date || null,
      };
    })
    .sort((a, b) => b.currentStreak - a.currentStreak);

  const streaksLost: WeeklyReviewStreakHighlight[] = [];

  const maxTotal = Math.max(...totalsArray.map(day => day.total), 0);
  const heatmap: WeeklyReviewDay[] = totalsArray.map(day => ({
    ...day,
    intensity: computeIntensity(day.total, maxTotal),
  }));

  const lastTwoDays = weekDates.slice(-2);
  const lastTwoTotal = totalsArray
    .filter(day => lastTwoDays.includes(day.date))
    .reduce((sum, day) => sum + day.total, 0);
  const midIndex = Math.floor(weekDates.length / 2);
  const midDay = totalsArray[midIndex];
  const historyIsBest = historyTotals ? summarizeHistory(historyTotals, totalActivity) : false;
  const topCounter = topCounters[0];
  const insight = getInsight({
    totalActivity,
    daysActive,
    bestDay,
    midDay,
    lastTwoTotal,
    topCounter,
    historyIsBest,
  });

  return {
    weekStart,
    weekEnd,
    generatedAt: new Date().toISOString(),
    totalActivity,
    daysActive,
    bestDay: { date: bestDay.date, label: bestDay.label, total: bestDay.total },
    worstDay: { date: worstDay.date, label: worstDay.label, total: worstDay.total },
    topCounters,
    streaksActive,
    streaksLost,
    insight,
    heatmap,
  };
};

const loadHistory = async (): Promise<WeeklyHistoryEntry[]> => {
  try {
    const raw = await AsyncStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(entry => entry?.weekStart && typeof entry.totalActivity === 'number');
  } catch {
    return [];
  }
};

const persistHistory = async (history: WeeklyHistoryEntry[]): Promise<void> => {
  try {
    await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch {
    // Best effort
  }
};

const upsertHistory = async (weekStart: string, totalActivity: number): Promise<WeeklyHistoryEntry[]> => {
  const history = await loadHistory();
  const filtered = history.filter(entry => entry.weekStart !== weekStart);
  const updated = [...filtered, { weekStart, totalActivity }].sort((a, b) =>
    a.weekStart.localeCompare(b.weekStart)
  );
  const trimmed = updated.slice(-12);
  await persistHistory(trimmed);
  return trimmed;
};

export const getWeeklyReview = async (
  referenceDate: Date = getAppDate(),
  userId?: string
): Promise<WeeklyReview> => {
  await initDatabase();
  const { weekStart, weekEnd } = getWeekRange(referenceDate);
  const seedUserId = await AsyncStorage.getItem(WEEKLY_REVIEW_SEED_USER_KEY);

  const loadData = async (effectiveUserId?: string) => {
    const eventParams: any[] = [weekStart, weekEnd];
    const userFilter = effectiveUserId ? 'AND user_id = ?' : '';
    if (effectiveUserId) eventParams.push(effectiveUserId);

    const events = await query<ReviewEvent>(
      `SELECT counter_id, event_type, amount, occurred_local_date
       FROM lc_events
       WHERE occurred_local_date >= ? AND occurred_local_date <= ?
       AND event_type = 'increment'
       ${userFilter}`,
      eventParams
    );

    const counterParams: any[] = [];
    const counterFilter = effectiveUserId ? 'AND user_id = ?' : '';
    if (effectiveUserId) counterParams.push(effectiveUserId);

    const counters = await query<ReviewCounter>(
      `SELECT id, name, emoji
       FROM lc_counters
       WHERE deleted_at IS NULL
       ${counterFilter}`,
      counterParams
    );

    const streakParams: any[] = [];
    const streakFilter = effectiveUserId ? 'AND user_id = ?' : '';
    if (effectiveUserId) streakParams.push(effectiveUserId);

    const streaks = await query<ReviewStreak>(
      `SELECT counter_id, current_streak, last_increment_date
       FROM lc_streaks
       WHERE deleted_at IS NULL
       ${streakFilter}`,
      streakParams
    );

    return { events, counters, streaks };
  };

  const primaryUserId = userId || seedUserId || undefined;
  let { events, counters, streaks } = await loadData(primaryUserId);

  if (userId && seedUserId && env.isDev && events.length === 0) {
    ({ events, counters, streaks } = await loadData(seedUserId));
  }

  const history = await loadHistory();
  let review = computeWeeklyReview({
    weekStart,
    weekEnd,
    events: events || [],
    counters: counters || [],
    streaks: streaks || [],
    historyTotals: history,
  });

  if (env.isDev && review.totalActivity === 0) {
    if (userId && seedUserId && seedUserId !== userId) {
      ({ events, counters, streaks } = await loadData(seedUserId));
      review = computeWeeklyReview({
        weekStart,
        weekEnd,
        events: events || [],
        counters: counters || [],
        streaks: streaks || [],
        historyTotals: history,
      });
    }

    if (review.totalActivity === 0) {
      const fallbackUsers = await query<{ user_id: string }>(
        `SELECT DISTINCT user_id FROM lc_events
         WHERE occurred_local_date >= ? AND occurred_local_date <= ?
         AND event_type = 'increment'`,
        [weekStart, weekEnd]
      );
      const fallbackUserId = fallbackUsers?.[0]?.user_id;
      if (fallbackUserId) {
        ({ events, counters, streaks } = await loadData(fallbackUserId));
        review = computeWeeklyReview({
          weekStart,
          weekEnd,
          events: events || [],
          counters: counters || [],
          streaks: streaks || [],
          historyTotals: history,
        });
      }
    }
  }

  await upsertHistory(weekStart, review.totalActivity);

  return review;
};
