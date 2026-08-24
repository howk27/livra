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

// ── 2026-08-24: the table stops being only a cache ───────────────────────────
//
// Founder call: real drafts. Until now every row was written confirmed=true at
// goal-CREATE (a cache so re-asking the same goal is free), and Settings called
// them "drafts" while nothing could reopen one. Now "Save for later" on the
// plan review writes confirmed=false, the suggest screen lists those rows, and
// reopening one costs nothing — the same economics as the cache-before-gate
// read the edge function already does. Activating a saved draft goes through
// the normal goal-CREATE path, whose writeGoalPackageCache upsert flips the
// SAME row (unique on goal_text_normalized + user_id) to confirmed=true, so a
// draft leaves the list by becoming a goal, with no second delete path.

import { dataClient } from '@/lib/data/client';
import { toDataError } from '@/lib/data/errors';
import {
  normalizeGoalText,
  validateAIGoalPackage,
  type AIGoalPackage,
} from '@/lib/ai/goalGeneration';

/** A reopenable saved plan: the row, already validated back into a package. */
export interface SavedAiDraft {
  id: string;
  goalText: string;
  createdAt: string;
  pkg: AIGoalPackage;
}

/**
 * Save a generated plan for later without activating it.
 *
 * `ignoreDuplicates` is load-bearing: the unique key (goal_text_normalized,
 * user_id) is shared with the confirmed cache rows, and an upsert that UPDATED
 * on conflict would let "Save for later" flip an already-confirmed row back to
 * confirmed=false — resurrecting a plan the user already turned into a goal as
 * a phantom draft. If the text is already saved (either kind), saving again is
 * a quiet no-op; the plan is already kept.
 */
export async function saveAiDraft(
  userId: string,
  goalText: string,
  pkg: AIGoalPackage,
): Promise<void> {
  const normalized = normalizeGoalText(goalText);
  if (!normalized || !userId) return;
  const { error } = await dataClient()
    .from('ai_goal_packages')
    .upsert(
      {
        user_id: userId,
        goal_text: goalText,
        goal_text_normalized: normalized,
        package_json: pkg as unknown as import('@/lib/data/types').Json,
        confirmed: false,
      },
      { onConflict: 'goal_text_normalized,user_id', ignoreDuplicates: true },
    );
  if (error) throw toDataError(error);
}

/**
 * The user's reopenable drafts: confirmed=false rows only — confirmed rows are
 * the cache of plans already activated, not pending work. Each package_json is
 * re-validated on the way out (same validator the edge function trusts) and an
 * invalid row is DROPPED rather than rendered: a draft that cannot round-trip
 * into the review screen is not a draft, and surfacing it would trade a quiet
 * absence for a crash inside GoalPackageReview.
 */
export async function listSavedAiDrafts(userId: string): Promise<SavedAiDraft[]> {
  const { data, error } = await dataClient()
    .from('ai_goal_packages')
    .select('id, goal_text, created_at, package_json')
    .eq('user_id', userId)
    .eq('confirmed', false)
    .order('created_at', { ascending: false });

  if (error) throw toDataError(error);
  const drafts: SavedAiDraft[] = [];
  for (const row of data ?? []) {
    const pkg = validateAIGoalPackage(row.package_json);
    if (!pkg) continue;
    drafts.push({
      id: row.id,
      goalText: row.goal_text,
      createdAt: row.created_at,
      pkg,
    });
  }
  return drafts;
}

/**
 * Delete ONE saved draft. Same D-8 exception, same reasoning, same module —
 * the guard test allows hard deletes in this file alone, and per-draft erasure
 * is the bulk control scoped down, not a new capability. Scoped by id AND
 * user_id (belt to the RLS braces, like everything here).
 */
export async function deleteSavedAiDraft(userId: string, draftId: string): Promise<void> {
  const { error } = await dataClient()
    .from('ai_goal_packages')
    .delete()
    .eq('id', draftId)
    .eq('user_id', userId);
  if (error) throw toDataError(error);
}

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
