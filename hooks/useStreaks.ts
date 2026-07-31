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
import { getAppDate } from '../lib/appDate';
import { useAppDateStore, selectAppDateKey } from '../state/appDateSlice';
import { deriveStreak, type StreakData } from '../lib/data/derived';

// The streak MATH moved to `lib/data/derived.ts` (M9 Phase 4 Task 1) so the
// derivation lives with the data layer and survives Phase 5's deletion of the old
// system. This module keeps its whole export surface and delegates.
export type { StreakData } from '../lib/data/derived';

export const computeStreak = (events: CounterEvent[], today?: Date): StreakData =>
  deriveStreak(events, today || getAppDate());

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
  const appDateKey = useAppDateStore(selectAppDateKey);
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

