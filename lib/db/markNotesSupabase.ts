/**
 * Supabase persistence layer for mark notes.
 *
 * All operations are fire-and-forget-safe: callers may `.catch()` without
 * affecting local SQLite state. RLS on the `mark_notes` table ensures users
 * can only read/write their own rows.
 */
import { getSupabaseClient } from '../supabase';
import type { MarkNote } from '../../types';
import { logger } from '../utils/logger';

/**
 * Upsert a single note to Supabase.
 * Conflict resolution is keyed on (user_id, mark_id, date) — must match the
 * UNIQUE (mark_id, date, user_id) constraint. The most recent updated_at wins.
 */
export async function supabaseUpsertNote(note: MarkNote): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from('mark_notes')
    .upsert(
      {
        id: note.id,
        mark_id: note.mark_id,
        user_id: note.user_id,
        date: note.date,
        text: note.text,
        created_at: note.created_at,
        updated_at: note.updated_at,
      },
      { onConflict: 'mark_id,date,user_id' },
    );
  if (error) {
    logger.error('[NotesSupabase] upsert failed:', error.message);
    throw error;
  }
}

/**
 * Hard-delete a note from Supabase by primary key.
 * Supabase RLS guarantees the caller can only delete their own rows.
 */
export async function supabaseDeleteNote(noteId: string): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from('mark_notes')
    .delete()
    .eq('id', noteId);
  if (error) {
    logger.error('[NotesSupabase] delete failed:', error.message);
    throw error;
  }
}

/**
 * Fetch all notes for an authenticated user.
 * Used during `loadDailyTracking` to merge remote rows with the local SQLite cache.
 */
export async function supabaseFetchNotesForUser(userId: string): Promise<MarkNote[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('mark_notes')
    .select('id, mark_id, user_id, date, text, created_at, updated_at')
    .eq('user_id', userId)
    .order('date', { ascending: false });
  if (error) {
    logger.error('[NotesSupabase] fetch failed:', error.message);
    throw error;
  }
  return (data as MarkNote[]) ?? [];
}
