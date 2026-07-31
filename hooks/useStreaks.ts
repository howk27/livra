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

// M9 Phase 5A Task 6: `updateStreakInDB` deleted with lib/db. It wrote the
// lc_streaks cache nothing read (useCheckin documented the decision in Phase 3);
// its last caller, useCounters.incrementMark, is gone.

