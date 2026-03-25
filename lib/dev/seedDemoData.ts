import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid';
import { execute, initDatabase } from '../db';
import { assertDevToolsAccess } from './access';
import { logger } from './logger';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { WEEKLY_REVIEW_SEED_USER_KEY } from '../review/weeklyReview';

type SeedOptions = {
  userId?: string;
  now?: Date;
};

const toLocalDate = (date: Date): string => date.toISOString().split('T')[0];

const insertCounter = async (params: {
  id: string;
  userId: string;
  name: string;
  emoji: string;
  color: string;
  unit: 'sessions' | 'days' | 'items';
  enableStreak: boolean;
  sortIndex: number;
  total: number;
  lastActivityDate?: string | null;
  createdAt: string;
  updatedAt: string;
}) => {
  await execute(
    'INSERT INTO lc_counters (id, user_id, name, emoji, color, unit, enable_streak, sort_index, total, created_at, updated_at, gated, gate_type, min_interval_minutes, max_per_day) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [
      params.id,
      params.userId,
      params.name,
      params.emoji,
      params.color,
      params.unit,
      params.enableStreak ? 1 : 0,
      params.sortIndex,
      params.total,
      params.createdAt,
      params.updatedAt,
      0,
      null,
      null,
      null,
    ]
  );
};

const insertEvent = async (params: {
  id: string;
  userId: string;
  counterId: string;
  eventType: 'increment' | 'decrement' | 'reset';
  amount: number;
  occurredAt: string;
  occurredLocalDate: string;
  createdAt: string;
  updatedAt: string;
}) => {
  await execute(
    'INSERT INTO lc_events (id, user_id, counter_id, event_type, amount, occurred_at, occurred_local_date, meta, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [
      params.id,
      params.userId,
      params.counterId,
      params.eventType,
      params.amount,
      params.occurredAt,
      params.occurredLocalDate,
      '{}',
      params.createdAt,
      params.updatedAt,
    ]
  );
};

const insertStreak = async (params: {
  id: string;
  userId: string;
  counterId: string;
  currentStreak: number;
  longestStreak: number;
  lastIncrementDate: string | null;
  createdAt: string;
  updatedAt: string;
}) => {
  await execute(
    'INSERT INTO lc_streaks (id, user_id, counter_id, current_streak, longest_streak, last_increment_date, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [
      params.id,
      params.userId,
      params.counterId,
      params.currentStreak,
      params.longestStreak,
      params.lastIncrementDate,
      params.createdAt,
      params.updatedAt,
    ]
  );
};

export const seedDemoData = async (options: SeedOptions = {}) => {
  assertDevToolsAccess('seedDemoData');
  await initDatabase();

  const now = options.now ?? new Date();
  const userId = options.userId ?? uuidv4();
  await AsyncStorage.setItem(WEEKLY_REVIEW_SEED_USER_KEY, userId);
  const createdAt = new Date(now.getTime() - 1000 * 60 * 60 * 24 * 21).toISOString();

  const counters = [
    { name: 'Meditation', emoji: '🧘', color: '#8B5CF6', unit: 'sessions' as const, enableStreak: true },
    { name: 'Workout', emoji: '🏋️', color: '#EF4444', unit: 'sessions' as const, enableStreak: true },
    { name: 'Reading', emoji: '📚', color: '#10B981', unit: 'sessions' as const, enableStreak: true },
    { name: 'Water', emoji: '💧', color: '#3B82F6', unit: 'items' as const, enableStreak: false },
  ];

  const createdCounters = await Promise.all(
    counters.map(async (counter, index) => {
      const id = uuidv4();
      const updatedAt = now.toISOString();
      await insertCounter({
        id,
        userId,
        name: counter.name,
        emoji: counter.emoji,
        color: counter.color,
        unit: counter.unit,
        enableStreak: counter.enableStreak,
        sortIndex: index,
        total: 0,
        lastActivityDate: null,
        createdAt,
        updatedAt,
      });
      return { id, ...counter };
    })
  );

  // Seed a realistic activity timeline
  const daysBack = 14;
  for (let dayOffset = daysBack; dayOffset >= 0; dayOffset -= 1) {
    const day = new Date(now.getTime() - dayOffset * 24 * 60 * 60 * 1000);
    const occurredAt = new Date(day.getTime() + 9 * 60 * 60 * 1000).toISOString();
    const occurredLocalDate = toLocalDate(day);

    for (const counter of createdCounters) {
      const shouldLog =
        counter.name === 'Meditation' ||
        (counter.name === 'Workout' && dayOffset % 2 === 0) ||
        (counter.name === 'Reading' && dayOffset % 3 !== 0) ||
        (counter.name === 'Water' && dayOffset <= 6);

      if (!shouldLog) continue;

      const amount = counter.name === 'Water' ? 6 : 1;
      await insertEvent({
        id: uuidv4(),
        userId,
        counterId: counter.id,
        eventType: 'increment',
        amount,
        occurredAt,
        occurredLocalDate,
        createdAt: occurredAt,
        updatedAt: occurredAt,
      });
    }
  }

  const lastDay = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const lastActivityDate = toLocalDate(lastDay);

  for (const counter of createdCounters) {
    const total = counter.name === 'Water' ? 42 : counter.name === 'Workout' ? 8 : 11;
    await execute('UPDATE lc_counters SET total = ?, last_activity_date = ?, updated_at = ? WHERE id = ?', [
      total,
      lastActivityDate,
      now.toISOString(),
      counter.id,
    ]);

    if (counter.enableStreak) {
      const currentStreak = counter.name === 'Workout' ? 3 : 7;
      const longestStreak = counter.name === 'Reading' ? 12 : 9;
      await insertStreak({
        id: uuidv4(),
        userId,
        counterId: counter.id,
        currentStreak,
        longestStreak,
        lastIncrementDate: lastActivityDate,
        createdAt,
        updatedAt: now.toISOString(),
      });
    }
  }

  logger.log('[DevTools] Seeded demo data', { userId, counters: createdCounters.length });

  return { userId, counters: createdCounters };
};
