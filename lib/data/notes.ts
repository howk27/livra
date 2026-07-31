// lib/data/notes.ts
//
// M9 Phase 1 — READ ONLY. GOAL notes only.
//
// `mark_notes` is dead (Phase 0 measured 3 rows, all support@livralife.com, newest
// 2026-04-12) and is dropped in Phase 5 — there is deliberately no module for it.

import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { dataClient, GOAL_NOTE_COLUMNS, selectList } from '@/lib/data/client';
import { queryKeys } from '@/lib/data/queryKeys';
import { toDataError } from '@/lib/data/errors';
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

export function useGoalNotes(goalId: string) {
  const { user } = useAuth();
  const userId = user?.id ?? '';
  return useQuery({
    queryKey: queryKeys.goalNotes(userId, goalId),
    queryFn: () => fetchGoalNotes(goalId),
    enabled: userId !== '' && goalId !== '',
    staleTime: NOTES_STALE_TIME,
  });
}
