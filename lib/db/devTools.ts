import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid';
import { execute, initDatabase, resetDatabaseState } from './index';
import { assertDevToolsAccess } from '../dev/access';
import { logger } from '../dev/logger';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { WEEKLY_REVIEW_SEED_USER_KEY } from '../review/weeklyReview';

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

export const clearAllData = async (): Promise<void> => {
  assertDevToolsAccess('clearAllData');
  await resetDatabaseState();
  logger.log('[DevTools] Database cleared');
};

export const seedHighUsage = async (userIdOverride?: string): Promise<{ userId: string; counterId: string }> => {
  assertDevToolsAccess('seedHighUsage');
  await initDatabase();

  const now = new Date();
  const userId = userIdOverride || uuidv4();
  await AsyncStorage.setItem(WEEKLY_REVIEW_SEED_USER_KEY, userId);
  const counterId = uuidv4();
  const createdAt = new Date(now.getTime() - 45 * 24 * 60 * 60 * 1000).toISOString();

  await insertCounter({
    id: counterId,
    userId,
    name: 'Deep Work',
    emoji: '🧠',
    color: '#0EA5E9',
    unit: 'sessions',
    enableStreak: true,
    sortIndex: 0,
    total: 0,
    lastActivityDate: null,
    createdAt,
    updatedAt: now.toISOString(),
  });

  const daysBack = 30;
  let total = 0;

  for (let dayOffset = daysBack; dayOffset >= 0; dayOffset -= 1) {
    const day = new Date(now.getTime() - dayOffset * 24 * 60 * 60 * 1000);
    const occurredLocalDate = toLocalDate(day);

    const sessions = dayOffset % 6 === 0 ? 0 : dayOffset % 3 === 0 ? 3 : 2;
    for (let i = 0; i < sessions; i += 1) {
      const occurredAt = new Date(day.getTime() + (9 + i * 2) * 60 * 60 * 1000).toISOString();
      await insertEvent({
        id: uuidv4(),
        userId,
        counterId,
        eventType: 'increment',
        amount: 1,
        occurredAt,
        occurredLocalDate,
        createdAt: occurredAt,
        updatedAt: occurredAt,
      });
      total += 1;
    }
  }

  const lastActivityDate = toLocalDate(now);
  await execute('UPDATE lc_counters SET total = ?, last_activity_date = ?, updated_at = ? WHERE id = ?', [
    total,
    lastActivityDate,
    now.toISOString(),
    counterId,
  ]);

  await insertStreak({
    id: uuidv4(),
    userId,
    counterId,
    currentStreak: 5,
    longestStreak: 18,
    lastIncrementDate: lastActivityDate,
    createdAt,
    updatedAt: now.toISOString(),
  });

  logger.log('[DevTools] Seeded high usage scenario', { userId, counterId });
  return { userId, counterId };
};

export const seedBrokenStreak = async (userIdOverride?: string): Promise<{ userId: string; counterId: string }> => {
  assertDevToolsAccess('seedBrokenStreak');
  await initDatabase();

  const now = new Date();
  const userId = userIdOverride || uuidv4();
  await AsyncStorage.setItem(WEEKLY_REVIEW_SEED_USER_KEY, userId);
  const counterId = uuidv4();
  const createdAt = new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000).toISOString();

  await insertCounter({
    id: counterId,
    userId,
    name: 'Morning Run',
    emoji: '🏃',
    color: '#F97316',
    unit: 'sessions',
    enableStreak: true,
    sortIndex: 0,
    total: 4,
    lastActivityDate: toLocalDate(new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000)),
    createdAt,
    updatedAt: now.toISOString(),
  });

  const lastActive = new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000);
  for (let i = 7; i >= 4; i -= 1) {
    const day = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const occurredAt = new Date(day.getTime() + 7 * 60 * 60 * 1000).toISOString();
    await insertEvent({
      id: uuidv4(),
      userId,
      counterId,
      eventType: 'increment',
      amount: 1,
      occurredAt,
      occurredLocalDate: toLocalDate(day),
      createdAt: occurredAt,
      updatedAt: occurredAt,
    });
  }

  await insertStreak({
    id: uuidv4(),
    userId,
    counterId,
    currentStreak: 0,
    longestStreak: 4,
    lastIncrementDate: toLocalDate(lastActive),
    createdAt,
    updatedAt: now.toISOString(),
  });

  logger.log('[DevTools] Seeded broken streak scenario', { userId, counterId });
  return { userId, counterId };
};

export const seedPerfectWeek = async (userIdOverride?: string): Promise<{ userId: string; counterId: string }> => {
  assertDevToolsAccess('seedPerfectWeek');
  await initDatabase();

  const now = new Date();
  const userId = userIdOverride || uuidv4();
  await AsyncStorage.setItem(WEEKLY_REVIEW_SEED_USER_KEY, userId);
  const counterId = uuidv4();
  const createdAt = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString();

  await insertCounter({
    id: counterId,
    userId,
    name: 'Daily Journal',
    emoji: '✍️',
    color: '#6366F1',
    unit: 'days',
    enableStreak: true,
    sortIndex: 0,
    total: 7,
    lastActivityDate: toLocalDate(now),
    createdAt,
    updatedAt: now.toISOString(),
  });

  for (let dayOffset = 6; dayOffset >= 0; dayOffset -= 1) {
    const day = new Date(now.getTime() - dayOffset * 24 * 60 * 60 * 1000);
    const occurredAt = new Date(day.getTime() + 8 * 60 * 60 * 1000).toISOString();
    await insertEvent({
      id: uuidv4(),
      userId,
      counterId,
      eventType: 'increment',
      amount: 1,
      occurredAt,
      occurredLocalDate: toLocalDate(day),
      createdAt: occurredAt,
      updatedAt: occurredAt,
    });
  }

  await insertStreak({
    id: uuidv4(),
    userId,
    counterId,
    currentStreak: 7,
    longestStreak: 7,
    lastIncrementDate: toLocalDate(now),
    createdAt,
    updatedAt: now.toISOString(),
  });

  logger.log('[DevTools] Seeded perfect week scenario', { userId, counterId });
  return { userId, counterId };
};
