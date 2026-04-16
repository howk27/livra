/**
 * Streak source of truth (Livra 2.0):
 * - **Canonical input:** all non-deleted `increment` events for the mark (full history). `computeStreak(events, getAppDate())`.
 * - **UI:** may use the in-memory events store (possibly windowed, e.g. 90 days) — acceptable for interactive screens
 *   if the window covers recent activity; detail views should load enough history or trust lc_streaks until next sync.
 * - **Post-sync:** `recomputeStreaksAfterSyncFromSqlite` loads every increment from `lc_events` in SQLite (no window) then
 *   writes `lc_streaks` — authoritative cache after a successful sync pass.
 * - **lc_streaks / remote streak rows:** denormalized cache for sync; never authoritative over a full event list when available.
 * - **lc_counters.total:** separate denormalized cache; kept consistent with lc_events via `markTotalReconciliation` (increments/decrement paths, undo/delete, pull). Badge progress may read `total` — repair mismatches via diagnostics or sync pull.
 */
import { useMemo } from 'react';
import type { CounterEvent, MarkEvent, CounterStreak } from '../types';
import { formatDate, addDays } from '../lib/date';
import { getAppDate } from '../lib/appDate';
import { useAppDateStore } from '../state/appDateSlice';

export interface StreakData {
  current: number;
  longest: number;
  lastDate?: string;
}

export const computeStreak = (events: CounterEvent[], today?: Date): StreakData => {
  // CRITICAL: Use device local time consistently
  // formatDate uses local timezone (date-fns format uses local time by default)
  const now = today || getAppDate();
  const todayStr = formatDate(now);
  
  // Get unique dates with activity (increment events only)
  // CRITICAL: Ensure all dates are normalized to local timezone strings (yyyy-MM-dd)
  // occurred_local_date should always be in local timezone format
  const activityDates = new Set(
    events
      .filter((e) => {
        if (!e || e.event_type !== 'increment' || e.deleted_at || !e.occurred_local_date) {
          return false;
        }
        // Validate that occurred_local_date is in correct format (yyyy-MM-dd)
        // This ensures timezone consistency
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        return dateRegex.test(e.occurred_local_date);
      })
      .map((e) => {
        // Normalize date string - ensure it's in yyyy-MM-dd format (local timezone)
        const dateStr = e.occurred_local_date!;
        // If already in correct format, use it
        if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
          return dateStr;
        }
        // Otherwise, parse and reformat using local timezone
        try {
          return formatDate(new Date(dateStr));
        } catch {
          return dateStr; // Fallback to original if parsing fails
        }
      })
      .filter((date): date is string => Boolean(date))
  );

  if (activityDates.size === 0) {
    return { current: 0, longest: 0 };
  }

  // Sort dates
  const sortedDates = Array.from(activityDates).sort();
  const lastDate = sortedDates[sortedDates.length - 1];

  // Calculate current streak (counting backwards from today)
  let currentStreak = 0;
  let checkDate = new Date(todayStr);
  
  // Check if there's activity today or yesterday (allow 1-day gap)
  const daysSinceLastActivity = Math.floor(
    (new Date(todayStr).getTime() - new Date(lastDate).getTime()) / (1000 * 60 * 60 * 24)
  );
  
  if (daysSinceLastActivity > 1) {
    // Streak is broken
    currentStreak = 0;
  } else {
    // Count backwards from the last activity date
    // Add safety limit to prevent infinite loops
    checkDate = new Date(lastDate);
    let safetyCounter = 0;
    const MAX_STREAK_DAYS = 1000; // Safety limit
    
    while (activityDates.has(formatDate(checkDate)) && safetyCounter < MAX_STREAK_DAYS) {
      currentStreak++;
      checkDate = addDays(checkDate, -1);
      safetyCounter++;
    }
  }

  // Calculate longest streak
  let longestStreak = 0;
  let tempStreak = 0;
  let prevDate: Date | null = null;

  sortedDates.forEach((dateStr) => {
    const currentDate = new Date(dateStr);
    
    if (!prevDate) {
      tempStreak = 1;
    } else {
      const daysDiff = Math.floor(
        (currentDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24)
      );
      
      if (daysDiff === 1) {
        tempStreak++;
      } else {
        longestStreak = Math.max(longestStreak, tempStreak);
        tempStreak = 1;
      }
    }
    
    prevDate = currentDate;
  });
  
  longestStreak = Math.max(longestStreak, tempStreak);

  return {
    current: currentStreak,
    longest: longestStreak,
    lastDate,
  };
};

/** Canonical streak for a mark from live event history (same “today” as the rest of the app). */
export function deriveStreakForMark(
  markId: string,
  events: readonly MarkEvent[],
  enableStreak: boolean,
): StreakData | null {
  if (!enableStreak) return null;
  const ev = events.filter(
    (e) => e.mark_id === markId && !e.deleted_at && e.event_type === 'increment',
  );
  return computeStreak(ev as CounterEvent[], getAppDate());
}

export const useStreakCalculation = (
  events: CounterEvent[],
  enableStreak: boolean
): StreakData | null => {
  const appDateKey = useAppDateStore((s) => s.debugDateOverride ?? '');
  return useMemo(() => {
    if (!enableStreak) return null;
    return computeStreak(events, getAppDate());
  }, [events, enableStreak, appDateKey]);
};

export const isStreakActive = (streak: StreakData | null): boolean => {
  if (!streak) return false;
  return streak.current > 0;
};

export const getStreakStatus = (
  streak: StreakData | null
): 'active' | 'broken' | 'none' => {
  if (!streak) return 'none';
  if (streak.current > 0) return 'active';
  if (streak.longest > 0) return 'broken';
  return 'none';
};

/** Persist derived streak to DB — cache / sync projection only, not a second definition. */
export const updateStreakInDB = async (
  counterId: string,
  userId: string,
  streakData: StreakData
): Promise<void> => {
  const { execute, queryFirst } = await import('../lib/db');
  
  const { v4: uuidv4 } = await import('uuid');
  
  // Check if streak record exists
  const existing = await queryFirst<CounterStreak>(
    'SELECT * FROM lc_streaks WHERE counter_id = ? AND deleted_at IS NULL',
    [counterId]
  );

  const now = new Date().toISOString();

  if (existing) {
    // Update existing
    await execute(
      `UPDATE lc_streaks SET 
        current_streak = ?, 
        longest_streak = ?, 
        last_increment_date = ?,
        updated_at = ?
      WHERE id = ?`,
      [
        streakData.current,
        Math.max(existing.longest_streak, streakData.longest),
        streakData.lastDate || null,
        now,
        existing.id,
      ]
    );
  } else {
    // Create new
    const id = uuidv4();
    await execute(
      `INSERT INTO lc_streaks (
        id, user_id, counter_id, current_streak, longest_streak,
        last_increment_date, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        userId,
        counterId,
        streakData.current,
        streakData.longest,
        streakData.lastDate || null,
        now,
        now,
      ]
    );
  }
};

