// lib/data/notes.ts
//
// M9 Phase 1 — READ ONLY. GOAL notes only.
//
// `mark_notes` is dead (Phase 0 measured 3 rows, all support@livralife.com, newest
// 2026-04-12) and is dropped in Phase 5 — there is deliberately no module for it.

import { useMemo, useSyncExternalStore } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { dataClient, GOAL_NOTE_COLUMNS, selectList } from '@/lib/data/client';
import { queryKeys } from '@/lib/data/queryKeys';
import { toDataError } from '@/lib/data/errors';
import { subscribeOutbox, pendingOutboxEntries, pendingGoalNoteRowsIn } from '@/lib/data/outbox';
import type { GoalNoteRow } from '@/lib/data/types';

// Notes are authored deliberately and rarely; treat like goals/marks.
const NOTES_STALE_TIME = 5 * 60 * 1000;

/** All journal entries for a goal, newest first. `goal_notes` has many entries per
 * goal and per day — `local_date` groups them for the UI, it is not a unique key. */
export async function fetchGoalNotes(goalId: string): Promise<GoalNoteRow[]> {
  const { data, error } = await dataClient()
    .from('goal_notes')
    .select(selectList(GOAL_NOTE_COLUMNS))
    .eq('goal_id', goalId)
    // Tombstones are excluded here, exactly as in goals/marks/checkins. This
    // filter and the `deleted_at` column arrived together (2026-07-30); before
    // that, `goal_notes` had no tombstone to hide. A deleted entry that still
    // renders is the one failure mode the new column introduces.
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    // Tiebreak by id so the order is TOTAL. The store this replaces sorted
    // `created_at desc, id desc` client-side; without the second key two entries
    // written in the same millisecond would come back in server-arbitrary order and
    // could swap between renders. (This repo has already seen a whole table share
    // one `created_at` to the microsecond — 2026-07-29.)
    .order('id', { ascending: false });
  if (error) throw toDataError(error);
  return (data ?? []) as unknown as GoalNoteRow[];
}

// ─── The outbox read merge (M9 Phase 4 Task 4) ──────────────────────────────
//
// Same rule as check-ins (lib/data/checkins.ts): pending entries are overlaid at
// READ time, never written into the cache (R4), so a note written offline stays
// in the journal across refetches and restarts until the flush lands it.

/**
 * PURE. Pending notes overlaid on the server list, deduped by id, ordered
 * `created_at desc, id desc` — the fetcher's exact total order, so a merged list
 * is indistinguishable from a fetched one. With nothing pending the server
 * value is returned untouched (same reference, `undefined` included).
 */
export function mergePendingGoalNotes(
  server: GoalNoteRow[] | undefined,
  pending: readonly GoalNoteRow[],
): GoalNoteRow[] | undefined {
  if (pending.length === 0) return server;
  const pendingIds = new Set(pending.map((r) => r.id));
  const merged = [...pending, ...(server ?? []).filter((r) => !pendingIds.has(r.id))];
  merged.sort((a, b) => {
    if (a.created_at !== b.created_at) return a.created_at < b.created_at ? 1 : -1;
    return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
  });
  return merged;
}

export function useGoalNotes(goalId: string) {
  const { user } = useAuth();
  const userId = user?.id ?? '';
  const entries = useSyncExternalStore(subscribeOutbox, pendingOutboxEntries, pendingOutboxEntries);
  // Selection lives in the outbox module (pure over the snapshot) — the T6 guard
  // bans `.goal_id` spellings in this file, and rightly so.
  const pending = useMemo(
    () => pendingGoalNoteRowsIn(entries, userId, goalId),
    [entries, userId, goalId],
  );
  const query = useQuery({
    queryKey: queryKeys.goalNotes(userId, goalId),
    queryFn: () => fetchGoalNotes(goalId),
    enabled: userId !== '' && goalId !== '',
    staleTime: NOTES_STALE_TIME,
  });
  const data = useMemo(() => mergePendingGoalNotes(query.data, pending), [query.data, pending]);
  return { ...query, data };
}
