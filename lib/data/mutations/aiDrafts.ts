// Erasure for saved AI goal drafts.
//
// `public.ai_goal_packages` retains the goal text a user typed, verbatim, plus a
// normalized copy and the generated plan. Until 2026-08-09 there was no DELETE
// policy on the table, so the only way to erase it was to delete the whole
// account, and the privacy policy had to route people to a support email backed
// by a manual service-role query. This is the client half of the real control;
// the server half is `supabase/migrations/20260809_ai_goal_packages_user_delete.sql`.
//
// ── A DELIBERATE EXCEPTION TO D-8 ────────────────────────────────────────────
//
// D-8 forbids hard deletes and every other mutation in this directory tombstones
// via `deleted_at`. That convention protects user history from accidental loss.
// Here it inverts: the user is asking for their text to be GONE, and a tombstone
// would leave `goal_text` sitting in the row — satisfying the letter of D-8
// while defeating the purpose of an erasure control and making the privacy
// policy's deletion sentence untrue. So this issues a real `.delete()`, once,
// knowingly. It is the only such call in the app; if a second one ever appears,
// that is the thing to question, not this one.
//
// Losing these rows costs the user nothing but a second model call if they ask
// for the same goal again — the table is a cache, and no other feature reads it
// as history.

import { dataClient } from '@/lib/data/client';
import { toDataError } from '@/lib/data/errors';

/**
 * Delete every saved AI draft belonging to the signed-in user.
 *
 * Scoped by `user_id` in the statement AND by the `ai_packages_delete` RLS
 * policy, which is the actual enforcement — the client-side filter is belt to
 * the server's braces, not the security boundary. Passing a foreign id would be
 * refused by Postgres, not merely ignored here.
 *
 * Returns how many rows went, so the caller can tell "erased 3" from "there was
 * nothing to erase" — two outcomes that deserve different words on screen.
 */
export async function deleteSavedAiDrafts(userId: string): Promise<number> {
  const { data, error } = await dataClient()
    .from('ai_goal_packages')
    .delete()
    .eq('user_id', userId)
    .select('id');

  if (error) throw toDataError(error);
  return data?.length ?? 0;
}

/**
 * How many saved AI drafts the user currently has.
 *
 * Read before offering the action so the row can say what erasing would
 * actually do. A control that says "Delete saved drafts" when there are none is
 * a control that teaches the user their tap did nothing.
 */
export async function countSavedAiDrafts(userId: string): Promise<number> {
  const { count, error } = await dataClient()
    .from('ai_goal_packages')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);

  if (error) throw toDataError(error);
  return count ?? 0;
}
