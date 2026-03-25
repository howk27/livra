import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid';
import { format } from 'date-fns';
import { assertDevToolsAccess } from './access';
import {
  getWeekRange,
  buildWeekDates,
  computeWeeklyReview,
  WEEKLY_REVIEW_SEED_USER_KEY,
} from '../review/weeklyReview';
import { initDatabase, query, queryFirst, execute } from '../db';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSupabaseClient } from '../supabase';
import { logger } from './logger';

export type WeeklyReviewSeedScenario =
  | 'balanced'
  | 'perfect'
  | 'midweekDip'
  | 'strongFinish'
  | 'chaotic';

type CounterRow = {
  id: string;
  name: string;
  emoji?: string | null;
};

const DEMO_USER_ID = '4b41d63b-4b7b-42ba-9e7d-1e2df7e18c5b';

const COUNTER_SEEDS: Array<{ name: string; emoji: string; color: string; unit: 'sessions' | 'items' | 'days' }> = [
  { name: 'Meditation', emoji: '🧘', color: '#8B5CF6', unit: 'sessions' },
  { name: 'Workout', emoji: '🏋️', color: '#EF4444', unit: 'sessions' },
  { name: 'Reading', emoji: '📚', color: '#10B981', unit: 'sessions' },
  { name: 'Water', emoji: '💧', color: '#3B82F6', unit: 'items' },
  { name: 'Stretching', emoji: '🧎', color: '#F59E0B', unit: 'sessions' },
];

const scenarioSeed: Record<WeeklyReviewSeedScenario, number> = {
  balanced: 42,
  perfect: 77,
  midweekDip: 101,
  strongFinish: 202,
  chaotic: 303,
};

const scenarioTotals: Record<WeeklyReviewSeedScenario, number[]> = {
  balanced: [3, 4, 2, 5, 4, 3, 2],
  perfect: [4, 4, 4, 4, 4, 4, 4],
  midweekDip: [4, 3, 0, 0, 2, 3, 4],
  strongFinish: [1, 1, 2, 2, 4, 5, 6],
  chaotic: [],
};

const mulberry32 = (seed: number) => {
  let t = seed;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), t | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
};

const toLocalDate = (dateStr: string) => format(new Date(`${dateStr}T12:00:00`), 'yyyy-MM-dd');
const isValidUUID = (value?: string | null): boolean =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

const resolveUserId = async (): Promise<string> => {
  try {
    const supabase = getSupabaseClient();
    const { data } = await supabase.auth.getUser();
    if (isValidUUID(data?.user?.id)) {
      return data.user.id;
    }
  } catch {
    // ignore
  }
  return DEMO_USER_ID;
};

const ensureCounters = async (userId: string): Promise<CounterRow[]> => {
  const existing = await query<CounterRow>(
    `SELECT id, name, emoji
     FROM lc_counters
     WHERE deleted_at IS NULL AND user_id = ?
     ORDER BY name ASC`,
    [userId]
  );

  const validExisting = existing.filter((counter) => isValidUUID(counter.id));
  if (validExisting.length >= 3) {
    return validExisting.slice(0, 6);
  }

  const needed = Math.max(3 - validExisting.length, 0);
  const toCreate = COUNTER_SEEDS.slice(0, needed);
  const now = new Date().toISOString();

  for (const seed of toCreate) {
    const id = uuidv4();
    await execute(
      `INSERT INTO lc_counters (id, user_id, name, emoji, color, unit, enable_streak, sort_index, total, created_at, updated_at, gated, gate_type, min_interval_minutes, max_per_day)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        userId,
        seed.name,
        seed.emoji,
        seed.color,
        seed.unit,
        1,
        0,
        0,
        now,
        now,
        0,
        null,
        null,
        null,
      ]
    );
  }

  const updated = await query<CounterRow>(
    `SELECT id, name, emoji
     FROM lc_counters
     WHERE deleted_at IS NULL AND user_id = ?
     ORDER BY name ASC`,
    [userId]
  );

  return updated.filter((counter) => isValidUUID(counter.id)).slice(0, 6);
};

const generateDailyTotals = (scenario: WeeklyReviewSeedScenario): number[] => {
  if (scenario !== 'chaotic') return scenarioTotals[scenario];
  const rng = mulberry32(scenarioSeed[scenario]);
  return Array.from({ length: 7 }, () => Math.floor(rng() * 7));
};

const allocateCounts = (
  scenario: WeeklyReviewSeedScenario,
  dayIndex: number,
  total: number,
  counterCount: number
): number[] => {
  if (total <= 0) return Array(counterCount).fill(0);
  const rng = mulberry32(scenarioSeed[scenario] + dayIndex * 97);
  const counts = Array(counterCount).fill(0);

  // Keep streak-like behavior for first two counters
  counts[0] = 1;
  counts[1] = total > 1 ? 1 : 0;

  let remaining = total - counts[0] - counts[1];
  const quietIndex = Math.min(counterCount - 1, 4);

  while (remaining > 0) {
    const idx = Math.floor(rng() * counterCount);
    if (idx === quietIndex && dayIndex % 3 !== 0) {
      continue;
    }
    counts[idx] += 1;
    remaining -= 1;
  }

  return counts;
};

const upsertStreak = async (counterId: string, userId: string, currentStreak: number, lastIncrementDate: string | null) => {
  const existing = await queryFirst<{ id: string }>(
    `SELECT id FROM lc_streaks WHERE counter_id = ? AND user_id = ?`,
    [counterId, userId]
  );
  const now = new Date().toISOString();
  if (existing?.id) {
    await execute(
      `UPDATE lc_streaks
       SET current_streak = ?, longest_streak = ?, last_increment_date = ?, updated_at = ?
       WHERE id = ?`,
      [currentStreak, Math.max(currentStreak, 7), lastIncrementDate, now, existing.id]
    );
    return;
  }

  await execute(
    `INSERT INTO lc_streaks (id, user_id, counter_id, current_streak, longest_streak, last_increment_date, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [uuidv4(), userId, counterId, currentStreak, Math.max(currentStreak, 7), lastIncrementDate, now, now]
  );
};

export const getWeeklyReviewSeedRange = (referenceDate: Date = new Date()) => {
  const { weekStart, weekEnd } = getWeekRange(referenceDate);
  return { weekStart, weekEnd, dates: buildWeekDates(weekStart) };
};

export const seedWeeklyReviewDemo = async (
  scenario: WeeklyReviewSeedScenario,
  userIdOverride?: string
): Promise<{
  eventsWritten: number;
  weekStart: string;
  weekEnd: string;
  totalActivity: number;
  windowEvents: number;
}> => {
  assertDevToolsAccess('seedWeeklyReviewDemo');
  await initDatabase();

  const candidateUserId = userIdOverride || (await resolveUserId());
  const userId = isValidUUID(candidateUserId) ? candidateUserId : DEMO_USER_ID;
  await AsyncStorage.setItem(WEEKLY_REVIEW_SEED_USER_KEY, userId);
  const counters = await ensureCounters(userId);
  const { weekStart, weekEnd, dates } = getWeeklyReviewSeedRange(new Date());
  const localDates = dates.map(toLocalDate);
  const totals = generateDailyTotals(scenario);

  const perCounterTotals = new Map<string, number>();
  const perCounterDayTotals = new Map<string, number[]>();
  counters.forEach(counter => {
    perCounterTotals.set(counter.id, 0);
    perCounterDayTotals.set(counter.id, Array(7).fill(0));
  });

  let eventsWritten = 0;

  for (let i = 0; i < localDates.length; i += 1) {
    const total = totals[i] ?? 0;
    const counts = allocateCounts(scenario, i, total, counters.length);
    const occurredAt = new Date(`${localDates[i]}T12:00:00`).toISOString();

    for (let c = 0; c < counters.length; c += 1) {
      const amount = counts[c];
      if (amount <= 0) continue;
      const counter = counters[c];
      await execute(
        `INSERT INTO lc_events (id, user_id, counter_id, event_type, amount, occurred_at, occurred_local_date, meta, created_at, updated_at)
         VALUES (?, ?, ?, 'increment', ?, ?, ?, ?, ?, ?)`,
        [
          uuidv4(),
          userId,
          counter.id,
          amount,
          occurredAt,
          localDates[i],
          '{}',
          occurredAt,
          occurredAt,
        ]
      );
      eventsWritten += 1;

      perCounterTotals.set(counter.id, (perCounterTotals.get(counter.id) || 0) + amount);
      const dayTotals = perCounterDayTotals.get(counter.id) || [];
      dayTotals[i] += amount;
      perCounterDayTotals.set(counter.id, dayTotals);
    }
  }

  for (const counter of counters) {
    const total = perCounterTotals.get(counter.id) || 0;
    const dayTotals = perCounterDayTotals.get(counter.id) || [];
    const lastActiveIndex = [...dayTotals].reverse().findIndex(value => value > 0);
    const lastIndex = lastActiveIndex === -1 ? -1 : dayTotals.length - 1 - lastActiveIndex;
    const lastIncrementDate = lastIndex >= 0 ? localDates[lastIndex] : null;

    let currentStreak = 0;
    for (let i = dayTotals.length - 1; i >= 0; i -= 1) {
      if (dayTotals[i] > 0) {
        currentStreak += 1;
      } else {
        break;
      }
    }

    await execute(
      `UPDATE lc_counters
       SET total = ?, last_activity_date = ?, updated_at = ?
       WHERE id = ?`,
      [total, lastIncrementDate, new Date().toISOString(), counter.id]
    );

    await upsertStreak(counter.id, userId, currentStreak, lastIncrementDate);
  }

  const review = computeWeeklyReview({
    weekStart,
    weekEnd,
    events: localDates.flatMap((date, index) =>
      counters.map((counter, counterIndex) => ({
        counter_id: counter.id,
        event_type: 'increment' as const,
        amount: (perCounterDayTotals.get(counter.id) || [])[index] || 0,
        occurred_local_date: date,
      }))
    ),
    counters,
    streaks: [],
  });

  const windowCountRows = await query<{ count: number }>(
    `SELECT COUNT(*) as count FROM lc_events
     WHERE occurred_local_date >= ? AND occurred_local_date <= ?
     AND event_type = 'increment'
     AND user_id = ?`,
    [weekStart, weekEnd, userId]
  );

  const windowEvents = windowCountRows?.[0]?.count ?? 0;

  logger.log('[WeeklyReviewDemo] Seeded scenario', {
    scenario,
    userId,
    counters: counters.length,
    eventsWritten,
    weekStart,
    weekEnd,
    totalActivity: review.totalActivity,
    windowEvents,
  });

  return {
    eventsWritten,
    weekStart,
    weekEnd,
    totalActivity: review.totalActivity,
    windowEvents,
  };
};
