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
 * Conflict resolution is keyed on (mark_id, date, user_id) — matches the
 * UNIQUE (mark_id, date, user_id) constraint. The most recent updated_at wins.
 *
 * IMPORTANT: the local `id` is deliberately NOT sent. ON CONFLICT only
 * arbitrates on the composite index, never on mark_notes_pkey — a
 * client-supplied id that diverged from the server's (fresh uuid for an
 * existing remote row, stale SQLite id after a remote merge, concurrent
 * double-saves) raises 23505 "duplicate key value violates unique constraint
 * mark_notes_pkey". The server owns row ids; the natural key
 * (user_id, mark_id, date) is the row's identity on the client.
 */
export async function supabaseUpsertNote(note: MarkNote): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from('mark_notes')
    .upsert(
      {
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
 * Hard-delete a note from Supabase by its natural key (user_id, mark_id, date).
 * Local and remote `id`s can diverge (see supabaseUpsertNote), so deleting by
 * primary key would silently miss the remote row and let it resurrect on the
 * next merge. RLS guarantees the caller can only delete their own rows.
 */
export async function supabaseDeleteNote(
  note: Pick<MarkNote, 'user_id' | 'mark_id' | 'date'>,
): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from('mark_notes')
    .delete()
    .eq('user_id', note.user_id)
    .eq('mark_id', note.mark_id)
    .eq('date', note.date);
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
