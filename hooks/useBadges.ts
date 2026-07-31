import { useCallback, useEffect, useMemo, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MarkBadge, BadgeCode, MarkEvent } from '../types';
import { dataClient } from '../lib/data/client';
import { logger } from '../lib/utils/logger';
import { formatDate, daysBetween } from '../lib/date';
import { getAppDate, getAppDateTime } from '../lib/appDate';
import { useAppDateStore, selectAppDateKey } from '../state/appDateSlice';
import { computeStreak } from './useStreaks';

// M9 Phase 5A: badge records live in the server's `mark_badges` table — they
// used to live in the deleted mock DB (`lc_badges`) and reach the server only
// through the deleted sync engine. "Badges stay stored" (spec §4.2): earned is a
// fact, never recomputed, so the rows persist; the evaluation below only ever
// RAISES progress toward a definition and stamps `earned_at` once.
//
// Login history is device-behavioural data with no server home; it moved from
// the mock DB's meta table to AsyncStorage under the same per-user keys. Both
// key families are account-scoped in the sign-out purge.
//
// All persistence here is best-effort: no badge write may ever throw into a
// check-in (callers already .catch, and offline evaluation self-heals — the next
// evaluation recomputes progress from the full event history).

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
  record: MarkBadge | null;
  progress: number;
  earned: boolean;
};

type BadgeMap = Map<string, Map<BadgeCode, MarkBadge>>;

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

const badgeToMap = (records: MarkBadge[]): BadgeMap => {
  const map: BadgeMap = new Map();
  records.forEach((record) => {
    const markId = record.mark_id;
    const perCounter = map.get(markId) ?? new Map<BadgeCode, MarkBadge>();
    perCounter.set(record.badge_code, record);
    map.set(markId, perCounter);
  });
  return map;
};

export const badgeTestUtils = {
  computeConsecutiveWithLogin,
  computeWindowProgress,
  uniqueSortedDates,
};

export const useBadges = (userId?: string) => {
  const appDateKey = useAppDateStore(selectAppDateKey);
  const [badgesByCounter, setBadgesByCounter] = useState<BadgeMap>(new Map());
  const [loading, setLoading] = useState(false);
  const [lastLoginDate, setLastLoginDate] = useState<string | null>(null);
  const [loginHistory, setLoginHistory] = useState<string[]>([]);

  const loginHistorySet = useMemo(() => new Set(loginHistory), [loginHistory]);

  const loadLoginState = useCallback(
    async (uid: string) => {
      const lastLogin = await AsyncStorage.getItem(lastLoginKey(uid));
      const historyRaw = await AsyncStorage.getItem(loginHistoryKey(uid));
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
        const { data, error } = await dataClient()
          .from('mark_badges')
          .select('*')
          .eq('user_id', uid)
          .is('deleted_at', null);
        if (error) throw error;
        setBadgesByCounter(badgeToMap((data ?? []) as unknown as MarkBadge[]));
        await loadLoginState(uid);
      } catch (error) {
        // Offline or transient — keep whatever state we had; badges have no
        // surface that could show a gap, and the next load recovers.
        logger.warn('[Badges] load failed:', error);
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
    ): Promise<MarkBadge> => {
      const perCounter = badgesByCounter.get(markId);
      const existing = perCounter?.get(definition.code) ?? null;
      const nowIso = getAppDateTime().toISOString();
      const lastProgressIso = lastProgressDate ? `${lastProgressDate}T00:00:00.000Z` : null;

      if (!existing) {
        const record: MarkBadge = {
          id: uuidv4(),
          user_id: uid,
          mark_id: markId,
          badge_code: definition.code,
          progress_value: progress,
          target_value: definition.targetValue,
          earned_at: earned ? nowIso : null,
          last_progressed_at: lastProgressIso,
          deleted_at: null,
          created_at: nowIso,
          updated_at: nowIso,
        };

        const { error } = await dataClient().from('mark_badges').insert({
          id: record.id,
          user_id: record.user_id,
          mark_id: record.mark_id,
          badge_code: record.badge_code,
          progress_value: record.progress_value,
          target_value: record.target_value,
          earned_at: record.earned_at,
          last_progressed_at: record.last_progressed_at,
          created_at: record.created_at,
          updated_at: record.updated_at,
        });
        if (error) throw error;

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

      const { error } = await dataClient()
        .from('mark_badges')
        .update({
          progress_value: progress,
          target_value: definition.targetValue,
          earned_at: earnedAt,
          last_progressed_at: lastProgressIso,
          updated_at: nowIso,
        })
        .eq('id', existing.id);
      if (error) throw error;

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
    async (
      markId: string,
      uid: string,
      /**
       * The event list to score. Check-ins live in the React Query cache, so
       * `hooks/useCheckin.ts` passes what it read from there; a caller with no
       * events yet (a just-created mark) omits it and scores an empty history.
       */
      sourceEvents: readonly MarkEvent[] = []
    ): Promise<BadgeProgress[]> => {
      const events = sourceEvents.filter(
        (event) =>
          event.mark_id === markId && event.event_type === 'increment' && !event.deleted_at
      );

      const activityDates = uniqueSortedDates(
        events.map((event) => event.occurred_local_date)
      );

      const streak = computeStreak(events, getAppDate());
      const todayStr = formatDate(getAppDate());

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
    [badgesByCounter, loginHistorySet, updateBadgeRecord, appDateKey]
  );

  const recordDailyLogin = useCallback(
    async (uid: string, date: Date = getAppDate()) => {
      const dateStr = formatDate(date);
      const history = uniqueSortedDates([...loginHistory, dateStr]).filter((d) => {
        const diff = Math.abs(daysBetween(parseDateString(dateStr), parseDateString(d)));
        return diff <= 60;
      });

      await AsyncStorage.setItem(loginHistoryKey(uid), JSON.stringify(history));
      await AsyncStorage.setItem(lastLoginKey(uid), dateStr);

      setLastLoginDate(dateStr);
      setLoginHistory(history);
    },
    [loginHistory]
  );

  const getBadgeRecordsForCounter = useCallback(
    (markId: string): MarkBadge[] => {
      const perCounter = badgesByCounter.get(markId);
      if (!perCounter) return [];
      return BADGE_DEFINITIONS.map((definition) => {
        return perCounter.get(definition.code) ?? null;
      }).filter((record): record is MarkBadge => record !== null);
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
