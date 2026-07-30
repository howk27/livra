// lib/data/mutations/notes.ts
//
// M9 Phase 3 Task 5 — goal notes. APPEND, never upsert.
//
// `goal_notes` has NO uniqueness rule beyond its primary key. Verified live
// 2026-07-30: the only indexes are `goal_notes_pkey` (id), `idx_goal_notes_user`
// and `idx_goal_notes_goal_created` — there is nothing unique on
// (goal_id, local_date). The migration says so in words too: "a goal may have many
// entries per day."
//
// THAT ABSENCE IS LOAD-BEARING, not incidental. It is why the Phase 4 outbox holds
// ONE entry class with no conflict handling anywhere (Spec R6): a goal note is an
// append, structurally identical to a check-in. `mark_notes` — the one note table
// that DID carry UNIQUE (mark_id, date, user_id), and would therefore have needed
// edit-conflict resolution — is dead and is dropped in Phase 5. Deleting the dead
// table removed the conflict case instead of handling it.
//
// So: writing a second note on the same goal on the same day MUST produce a second
// row. An upsert keyed on the day would silently overwrite what the user wrote this
// morning, and the guard below exists to make that unshippable.

import 'react-native-get-random-values'; // must precede any uuid use
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { v4 as uuidv4 } from 'uuid';
import { dataClient, GOAL_NOTE_COLUMNS, selectList } from '@/lib/data/client';
import { queryKeys } from '@/lib/data/queryKeys';
import { toDataError, type DataError } from '@/lib/data/errors';
import { logger } from '@/lib/utils/logger';
import type { GoalNoteRow } from '@/lib/data/types';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LOCAL_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** A journal entry is prose, not an essay. Long enough not to be felt. */
const MAX_NOTE_LENGTH = 5000;

function invalid(reason: string): DataError {
  logger.error('[data] goal note write rejected before send', { reason });
  return { kind: 'unknown', message: 'The note could not be built from that input.' };
}

export interface AppendGoalNoteInput {
  goalId: string;
  userId: string;
  /** yyyy-MM-dd. GROUPS entries in the UI; it is NOT a key. */
  localDate: string;
  text: string;
}

/**
 * Append one journal entry. Always an INSERT — never an upsert, never keyed on
 * the day. The id is client-generated for the same reason check-ins are: it makes
 * a Phase 4 double-flush structurally impossible.
 */
export async function appendGoalNote(input: AppendGoalNoteInput): Promise<GoalNoteRow> {
  const text = input.text.trim();
  if (!UUID_RE.test(input.goalId)) throw invalid('goalId is not a uuid');
  if (!UUID_RE.test(input.userId)) throw invalid('userId is not a uuid');
  if (!LOCAL_DATE_RE.test(input.localDate)) throw invalid('localDate is not yyyy-MM-dd');
  if (text.length === 0) throw invalid('text is empty');
  if (text.length > MAX_NOTE_LENGTH) throw invalid('text is too long');

  const now = new Date().toISOString();
  const { data, error } = await dataClient()
    .from('goal_notes')
    .insert({
      id: uuidv4(),
      goal_id: input.goalId,
      user_id: input.userId,
      local_date: input.localDate,
      text,
      created_at: now,
      updated_at: now,
    })
    .select(selectList(GOAL_NOTE_COLUMNS))
    .single();
  if (error) throw toDataError(error);
  return (data ?? null) as unknown as GoalNoteRow;
}

/**
 * Edit one entry's text, addressed BY ITS OWN ID.
 *
 * Addressing by id rather than by (goal, day) is what keeps this an edit of one
 * row instead of an accidental collapse of every entry written that day — the
 * same failure the append guard protects against, from the other direction.
 */
export async function editGoalNote(noteId: string, rawText: string): Promise<void> {
  const text = rawText.trim();
  if (!UUID_RE.test(noteId)) throw invalid('noteId is not a uuid');
  if (text.length === 0) throw invalid('text is empty');
  if (text.length > MAX_NOTE_LENGTH) throw invalid('text is too long');

  const { error } = await dataClient()
    .from('goal_notes')
    .update({ text, updated_at: new Date().toISOString() })
    .eq('id', noteId);
  if (error) throw toDataError(error);
}

// 🔴 DELETE IS DELIBERATELY ABSENT, and it is a decision owed rather than an
// omission. This phase's standing constraint is "archive, never hard-delete — no
// mutation issues a DELETE" (D-8), but `goal_notes` HAS NO `deleted_at` COLUMN
// (verified live 2026-07-30: id, goal_id, user_id, local_date, text, created_at,
// updated_at). So honouring the constraint for notes needs one of:
//   (a) ADD COLUMN deleted_at — additive, build-60 safe, could ship in Phase 5; or
//   (b) an explicit exception: journal entries are hard-deleted because a user
//       who deletes a private diary entry means it.
// The journal screen offers deletion today (`app/goal/journal/[id].tsx`), so this
// must be settled before Task 6 can finish wiring that screen. Writing a DELETE
// into a phase that forbids them is not a call to make quietly.

export function useAppendGoalNoteMutation() {
  const client = useQueryClient();
  return useMutation<GoalNoteRow, DataError, AppendGoalNoteInput>({
    mutationFn: appendGoalNote,
    onSuccess: (_row, input) => {
      void client.invalidateQueries({
        queryKey: queryKeys.goalNotes(input.userId, input.goalId),
      });
    },
  });
}

export function useEditGoalNoteMutation(userId: string) {
  const client = useQueryClient();
  return useMutation<void, DataError, { noteId: string; goalId: string; text: string }>({
    mutationFn: ({ noteId, text }) => editGoalNote(noteId, text),
    onSuccess: (_v, { goalId }) => {
      void client.invalidateQueries({ queryKey: queryKeys.goalNotes(userId, goalId) });
    },
  });
}
