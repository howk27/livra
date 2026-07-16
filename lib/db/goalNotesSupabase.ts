/**
 * Supabase persistence layer for goal_notes (QC3-D — goal-level journal).
 *
 * All operations are fire-and-forget-safe: callers may `.catch()` without
 * affecting local SQLite state. RLS on `goal_notes` (auth.uid() = user_id, FOR
 * ALL) ensures users can only read/write their own rows.
 *
 * IDENTITY MODEL (differs from mark_notes): each entry is its own row keyed by a
 * client-generated uuid — the entry's `id`. So, unlike mark_notes, we DO send the
 * client id, and sync is purely id-based:
 *   * add    → INSERT with the explicit client id
 *   * edit   → UPDATE by (id, user_id)
 *   * delete → DELETE by (id, user_id)
 * There is no natural-key (goal_id, date) upsert, so the 23505-on-pkey class of
 * bug that mark_notes had to work around cannot arise here — a goal may have many
 * entries per day, each its own stable row.
 */
import { getSupabaseClient } from '../supabase';
import type { GoalNote } from '../../types';
import { logger } from '../utils/logger';

/** Insert a new journal entry with its client-generated id. */
export async function insertGoalNote(note: GoalNote): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from('goal_notes').insert({
    id: note.id,
    goal_id: note.goal_id,
    user_id: note.user_id,
    local_date: note.local_date,
    text: note.text,
    created_at: note.created_at,
    updated_at: note.updated_at,
  });
  if (error) {
    logger.error('[GoalNotesSupabase] insert failed:', error.message);
    throw error;
  }
}

/** Edit an existing entry, keyed on its id and guarded by user_id. */
export async function updateGoalNote(note: GoalNote): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from('goal_notes')
    .update({
      text: note.text,
      local_date: note.local_date,
      updated_at: note.updated_at,
    })
    .eq('id', note.id)
    .eq('user_id', note.user_id);
  if (error) {
    logger.error('[GoalNotesSupabase] update failed:', error.message);
    throw error;
  }
}

/** Hard-delete one entry by its id, guarded by user_id (RLS also enforces this). */
export async function deleteGoalNote(id: string, userId: string): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from('goal_notes')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);
  if (error) {
    logger.error('[GoalNotesSupabase] delete failed:', error.message);
    throw error;
  }
}

/**
 * Fetch every journal entry for an authenticated user, newest-first.
 * Used during `loadGoalNotes` to merge remote rows with the local SQLite cache.
 */
export async function fetchGoalNotesForUser(userId: string): Promise<GoalNote[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('goal_notes')
    .select('id, goal_id, user_id, local_date, text, created_at, updated_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) {
    logger.error('[GoalNotesSupabase] fetch failed:', error.message);
    throw error;
  }
  return (data as GoalNote[]) ?? [];
}
