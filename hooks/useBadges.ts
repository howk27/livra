import { useCallback, useEffect, useMemo, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { CounterBadge, BadgeCode } from '../types';
import { query, execute } from '../lib/db';
import { getMetaValue, setMetaValue } from '../lib/db/meta';
import { formatDate, daysBetween } from '../lib/date';
import { useEventsStore } from '../state/eventsSlice';
import { computeStreak } from './useStreaks';

type BadgeDefinition = {
  code: BadgeCode;
  name: string;
  description: string;
  targetValue: number;
  requiresConsecutive?: boolean;
  windowDays?: number;
};

export type BadgeProgress = {
  definition: BadgeDefinition;
  record: CounterBadge | null;
  progress: number;
  earned: boolean;
};

type BadgeMap = Map<string, Map<BadgeCode, CounterBadge>>;

const BADGE_DEFINITIONS: BadgeDefinition[] = [
  {
    code: 'habit_spark',
    name: 'Habit Spark',
    description: 'Log in and record this counter 3 days in a row.',
    targetValue: 3,
    requiresConsecutive: true,
  },
  {
    code: 'momentum_wave',
    name: 'Momentum Wave',
    description: 'Stay on a 7-day streak with daily logins and counter updates.',
    targetValue: 7,
    requiresConsecutive: true,
  },
  {
    code: 'focus_forge',
    name: 'Focus Forge',
    description: 'Complete 25 logged-in days of activity within 30 days for this counter.',
    targetValue: 25,
    windowDays: 30,
  },
];

const loginHistoryKey = (userId: string) => `login_history:${userId}`;
const lastLoginKey = (userId: string) => `last_login_date:${userId}`;

const uniqueSortedDates = (dates: string[]): string[] => {
  const unique = Array.from(new Set(dates));
  return unique.sort();
};

const clamp = (value: number, max: number) => Math.min(value, max);

const parseDateString = (dateStr: string): Date => new Date(`${dateStr}T00:00:00`);

const computeConsecutiveWithLogin = (
  dates: string[],
  loginSet: Set<string>
): { count: number; latestDate: string | null } => {
  if (dates.length === 0 || loginSet.size === 0) {
    return { count: 0, latestDate: null };
  }

  let count = 0;
  let previousDate: Date | null = null;
  let latestDate: string | null = null;

  for (let i = dates.length - 1; i >= 0; i--) {
    const dateStr = dates[i];
    if (!loginSet.has(dateStr)) {
      if (count > 0) break;
      continue;
    }

    const currentDate = parseDateString(dateStr);
    if (!previousDate) {
      count = 1;
      previousDate = currentDate;
      latestDate = dateStr;
      continue;
    }

    const diff = daysBetween(previousDate, currentDate);
    if (diff === 1) {
      count += 1;
      previousDate = currentDate;
    } else if (diff > 1) {
      break;
    }
  }

  return { count, latestDate };
};

const computeWindowProgress = (
  dates: string[],
  loginSet: Set<string>,
  windowDays: number,
  todayStr: string
): { count: number; lastDate: string | null } => {
  if (dates.length === 0) return { count: 0, lastDate: null };

  const today = parseDateString(todayStr);
  let lastDate: string | null = null;
  let count = 0;

  for (let i = dates.length - 1; i >= 0; i--) {
    const dateStr = dates[i];
    if (!loginSet.has(dateStr)) continue;
    const day = parseDateString(dateStr);
    const diff = Math.abs(daysBetween(today, day));
    if (diff <= windowDays - 1) {
      count += 1;
      if (!lastDate) {
        lastDate = dateStr;
      }
    }
  }

  return { count, lastDate };
};

const badgeToMap = (records: CounterBadge[]): BadgeMap => {
  const map: BadgeMap = new Map();
  records.forEach((record) => {
    const perCounter = map.get(record.counter_id) ?? new Map<BadgeCode, CounterBadge>();
    perCounter.set(record.badge_code, record);
    map.set(record.counter_id, perCounter);
  });
  return map;
};

export const badgeTestUtils = {
  computeConsecutiveWithLogin,
  computeWindowProgress,
  uniqueSortedDates,
};

export const useBadges = (userId?: string) => {
  const { getEventsByMark } = useEventsStore();
  const [badgesByCounter, setBadgesByCounter] = useState<BadgeMap>(new Map());
  const [loading, setLoading] = useState(false);
  const [lastLoginDate, setLastLoginDate] = useState<string | null>(null);
  const [loginHistory, setLoginHistory] = useState<string[]>([]);

  const loginHistorySet = useMemo(() => new Set(loginHistory), [loginHistory]);

  const loadLoginState = useCallback(
    async (uid: string) => {
      const lastLogin = await getMetaValue(lastLoginKey(uid));
      const historyRaw = await getMetaValue(loginHistoryKey(uid));
      let history: string[] = [];

      if (historyRaw) {
        try {
          const parsed = JSON.parse(historyRaw);
          if (Array.isArray(parsed)) {
            history = uniqueSortedDates(parsed as string[]);
          }
        } catch {
          history = [];
        }
      }

      setLastLoginDate(lastLogin);
      setLoginHistory(history);
    },
    []
  );

  const loadBadges = useCallback(
    async (uid?: string) => {
      if (!uid) {
        setBadgesByCounter(new Map());
        setLastLoginDate(null);
        setLoginHistory([]);
        return;
      }

      setLoading(true);
      try {
        const rows = await query<CounterBadge>('SELECT * FROM lc_badges WHERE deleted_at IS NULL');
        const filtered = rows.filter((row) => row.user_id === uid);
        setBadgesByCounter(badgeToMap(filtered));
        await loadLoginState(uid);
      } finally {
        setLoading(false);
      }
    },
    [loadLoginState]
  );

  useEffect(() => {
    if (userId) {
      loadBadges(userId);
    } else {
      setBadgesByCounter(new Map());
      setLastLoginDate(null);
      setLoginHistory([]);
    }
  }, [userId, loadBadges]);

  const updateBadgeRecord = useCallback(
    async (
      uid: string,
      markId: string,
      definition: BadgeDefinition,
      progress: number,
      earned: boolean,
      lastProgressDate: string | null
    ): Promise<CounterBadge> => {
      const perCounter = badgesByCounter.get(markId);
      const existing = perCounter?.get(definition.code) ?? null;
      const nowIso = new Date().toISOString();
      const lastProgressIso = lastProgressDate ? `${lastProgressDate}T00:00:00.000Z` : null;

      if (!existing) {
        const record: CounterBadge = {
          id: uuidv4(),
          user_id: uid,
          counter_id: markId, // Database column is still counter_id for compatibility
          badge_code: definition.code,
          progress_value: progress,
          target_value: definition.targetValue,
          earned_at: earned ? nowIso : null,
          last_progressed_at: lastProgressIso,
          deleted_at: null,
          created_at: nowIso,
          updated_at: nowIso,
        };

        await execute(
          `INSERT INTO lc_badges (
            id, user_id, counter_id, badge_code, progress_value, target_value,
            earned_at, last_progressed_at, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            record.id,
            record.user_id,
            record.counter_id,
            record.badge_code,
            record.progress_value,
            record.target_value,
            record.earned_at,
            record.last_progressed_at,
            record.created_at,
            record.updated_at,
          ]
        );

        return record;
      }

      const hasChanges =
        existing.progress_value !== progress ||
        existing.target_value !== definition.targetValue ||
        existing.last_progressed_at !== lastProgressIso ||
        (earned && !existing.earned_at) ||
        (!earned && existing.earned_at !== null);

      if (!hasChanges) {
        return {
          ...existing,
          progress_value: progress,
          target_value: definition.targetValue,
        };
      }

      const earnedAt =
        earned && !existing.earned_at
          ? nowIso
          : !earned
          ? null
          : existing.earned_at;

      await execute(
        `UPDATE lc_badges SET 
          progress_value = ?, target_value = ?, earned_at = ?, last_progressed_at = ?, updated_at = ?
        WHERE id = ?`,
        [
          progress,
          definition.targetValue,
          earnedAt,
          lastProgressIso,
          nowIso,
          existing.id,
        ]
      );

      return {
        ...existing,
        progress_value: progress,
        target_value: definition.targetValue,
        earned_at: earnedAt,
        last_progressed_at: lastProgressIso,
        updated_at: nowIso,
      };
    },
    [badgesByCounter]
  );

  const evaluateMarkBadges = useCallback(
    async (markId: string, uid: string): Promise<BadgeProgress[]> => {
      const events = getEventsByMark(markId).filter(
        (event) => event.event_type === 'increment' && !event.deleted_at
      );

      const activityDates = uniqueSortedDates(
        events.map((event) => event.occurred_local_date)
      );

      const streak = computeStreak(events);
      const todayStr = formatDate(new Date());

      const results: BadgeProgress[] = [];
      const updatedPerCounter = new Map(badgesByCounter.get(markId) ?? new Map());

      for (const definition of BADGE_DEFINITIONS) {
        let progress = 0;
        let lastProgressDate: string | null = null;

        if (definition.requiresConsecutive) {
          const { count: loginConsecutive, latestDate } = computeConsecutiveWithLogin(
            activityDates,
            loginHistorySet
          );
          const streakAligned = streak.current;
          progress = clamp(Math.min(loginConsecutive, streakAligned), definition.targetValue);
          lastProgressDate = progress > 0 ? latestDate : null;
        } else if (definition.windowDays) {
          const { count, lastDate } = computeWindowProgress(
            activityDates,
            loginHistorySet,
            definition.windowDays,
            todayStr
          );
          progress = clamp(count, definition.targetValue);
          lastProgressDate = lastDate;
        }

        const earned = progress >= definition.targetValue;
        const record = await updateBadgeRecord(
          uid,
          markId,
          definition,
          progress,
          earned,
          lastProgressDate
        );

        updatedPerCounter.set(definition.code, record);

        results.push({
          definition,
          record,
          progress,
          earned,
        });
      }

      setBadgesByCounter((prev) => {
        const next = new Map(prev);
        next.set(markId, updatedPerCounter);
        return next;
      });

      return results;
    },
    [badgesByCounter, getEventsByMark, loginHistorySet, updateBadgeRecord]
  );

  const recordDailyLogin = useCallback(
    async (uid: string, date: Date = new Date()) => {
      const dateStr = formatDate(date);
      const history = uniqueSortedDates([...loginHistory, dateStr]).filter((d) => {
        const diff = Math.abs(daysBetween(parseDateString(dateStr), parseDateString(d)));
        return diff <= 60;
      });

      await setMetaValue(loginHistoryKey(uid), JSON.stringify(history));
      await setMetaValue(lastLoginKey(uid), dateStr);

      setLastLoginDate(dateStr);
      setLoginHistory(history);
    },
    [loginHistory]
  );

  const getBadgeRecordsForCounter = useCallback(
    (markId: string): CounterBadge[] => {
      const perCounter = badgesByCounter.get(markId);
      if (!perCounter) return [];
      return BADGE_DEFINITIONS.map((definition) => {
        return perCounter.get(definition.code) ?? null;
      }).filter((record): record is CounterBadge => record !== null);
    },
    [badgesByCounter]
  );

  const getBadgeProgress = useCallback(
    (markId: string): BadgeProgress[] => {
      const perCounter = badgesByCounter.get(markId);
      return BADGE_DEFINITIONS.map((definition) => {
        const record = perCounter?.get(definition.code) ?? null;
        const progress = record?.progress_value ?? 0;
        const earned = !!record?.earned_at && progress >= definition.targetValue;
        return { definition, record, progress, earned };
      });
    },
    [badgesByCounter]
  );

  return {
    loading,
    badgesByCounter,
    definitions: BADGE_DEFINITIONS,
    lastLoginDate,
    loginHistory,
    loadBadges,
    recordDailyLogin,
    evaluateMarkBadges,
    getBadgeRecordsForCounter,
    getBadgeProgress,
  };
};


