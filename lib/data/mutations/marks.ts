// lib/data/mutations/marks.ts
//
// M9 Phase 3 Task 4 — mark writes, and LINKING AS A FIRST-CLASS CAPABILITY (D-6).
//
// A NEW MARK NEVER WRITES `marks.goal_id`. Leaving it NULL is correct and
// intended: links are the single truth (Phase 0 / T6), and Phase 5 drops the
// column. Anything still reading it is already wrong.
//
// THE FULL CADENCE SET TRAVELS ON CREATE. Cadence is the data family this project
// has broken most often — `app/goal/new.tsx` once passed none and the store fell
// back to a flat 3, so a mark the library calls daily came out asking for 3
// (fixed in 38a5b96, wired through in 186e8ec). All seven fields are carried
// explicitly here so a caller that forgets one gets a `tsc` error, not a silent 3.
//
// `total` IS DELIBERATELY NOT WRITTEN — not even a zero on create. The column
// defaults to 0 server-side (read live 2026-07-30), Phase 4 derives it from the
// event log, and Task 2's guard fails this whole directory if the identifier
// appears in code here at all.

import 'react-native-get-random-values'; // must precede any uuid use
import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { v4 as uuidv4 } from 'uuid';
import { dataClient, MARK_COLUMNS, selectList } from '@/lib/data/client';
import { queryKeys } from '@/lib/data/queryKeys';
import { toDataError, type DataError } from '@/lib/data/errors';
import { logger } from '@/lib/utils/logger';
import type { MarkRow } from '@/lib/data/types';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_NAME_LENGTH = 120;

function invalid(reason: string): DataError {
  logger.error('[data] mark write rejected before send', { reason });
  return { kind: 'unknown', message: 'The change could not be built from that input.' };
}

function invalidateMarkScope(client: QueryClient, userId: string): void {
  void client.invalidateQueries({ queryKey: queryKeys.marks(userId) });
  void client.invalidateQueries({ queryKey: queryKeys.marksByGoal(userId) });
  void client.invalidateQueries({ queryKey: queryKeys.goals(userId) });
}

/**
 * The whole cadence contract, in one place. Every field is REQUIRED at the type
 * level even though each is nullable in the column: a caller that omits one has
 * almost certainly forgotten it rather than meant null, and this is the family
 * where forgetting has cost this project the most.
 */
export interface MarkCadence {
  frequency_kind: 'variable' | 'fixed' | 'abstinence' | null;
  frequency_min: number | null;
  frequency_recommended: number | null;
  frequency_max: number | null;
  weekly_target: number | null;
  dailyTarget: number | null;
  maintenance_of: string | null;
}

export interface CreateMarkInput {
  userId: string;
  name: string;
  emoji?: string | null;
  color?: string | null;
  unit?: 'sessions' | 'days' | 'items' | null;
  enableStreak?: boolean | null;
  sortIndex: number;
  cadence: MarkCadence;
  /** Link the new mark to this goal. A LINK is written; `goal_id` is not. */
  goalId?: string | null;
}

// ─── Create ─────────────────────────────────────────────────────────────────

/**
 * Create a mark, and link it to a goal when one is given.
 *
 * FREE-TIER BEHAVIOUR, MEASURED NOT ASSUMED — see the note on `linkMarkToGoal`.
 * The account ceiling of 6 still binds on this INSERT. The per-goal cap of 4 does
 * not, because it keys on the `goal_id` this function correctly leaves NULL.
 */
export async function createMark(input: CreateMarkInput): Promise<MarkRow> {
  const name = input.name.trim();
  if (!UUID_RE.test(input.userId)) throw invalid('userId is not a uuid');
  if (name.length === 0) throw invalid('name is empty');
  if (name.length > MAX_NAME_LENGTH) throw invalid('name is too long');
  if (input.goalId != null && !UUID_RE.test(input.goalId)) throw invalid('goalId is not a uuid');

  const client = dataClient();
  const markId = uuidv4();
  const now = new Date().toISOString();

  const { data, error } = await client
    .from('marks')
    .insert({
      id: markId,
      user_id: input.userId,
      name,
      emoji: input.emoji ?? null,
      color: input.color ?? null,
      unit: input.unit ?? 'sessions',
      enable_streak: input.enableStreak ?? false,
      sort_index: input.sortIndex,
      // `goal_id` is ABSENT on purpose (Step 3). Links are the truth.
      ...input.cadence,
      created_at: now,
      updated_at: now,
    })
    .select(selectList(MARK_COLUMNS))
    .single();
  if (error) throw toDataError(error);

  if (input.goalId != null) {
    await linkMarkToGoal({ goalId: input.goalId, markId, userId: input.userId });
  }

  return (data ?? null) as unknown as MarkRow;
}

// ─── Edit ───────────────────────────────────────────────────────────────────

export interface EditMarkChanges {
  name?: string;
  emoji?: string | null;
  color?: string | null;
  unit?: 'sessions' | 'days' | 'items';
  enableStreak?: boolean;
  cadence?: Partial<MarkCadence>;
}

export async function editMark(markId: string, changes: EditMarkChanges): Promise<void> {
  if (!UUID_RE.test(markId)) throw invalid('markId is not a uuid');

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (changes.name !== undefined) {
    const name = changes.name.trim();
    if (name.length === 0) throw invalid('name is empty');
    if (name.length > MAX_NAME_LENGTH) throw invalid('name is too long');
    patch.name = name;
  }
  if (changes.emoji !== undefined) patch.emoji = changes.emoji;
  if (changes.color !== undefined) patch.color = changes.color;
  if (changes.unit !== undefined) patch.unit = changes.unit;
  if (changes.enableStreak !== undefined) patch.enable_streak = changes.enableStreak;
  // Cadence is spread field by field so an absent key stays absent: a blanket
  // spread of a partial would send `undefined` keys and, on some paths, null out
  // a range the user never touched.
  for (const [key, value] of Object.entries(changes.cadence ?? {})) {
    if (value !== undefined) patch[key] = value;
  }

  const { error } = await dataClient()
    .from('marks')
    .update(patch)
    .eq('id', markId)
    .is('deleted_at', null);
  if (error) throw toDataError(error);
}

// ─── Archive ────────────────────────────────────────────────────────────────

/**
 * Archive a mark: its links first, then the mark itself.
 *
 * SAME PRINCIPLE AS `archiveGoal` — the row the user acts on is written LAST, so
 * every partial failure leaves that row on screen and a second tap finishes the
 * job. Here the partial state is a mark detached from its goals, which is visible
 * and retryable; the reverse order would hide the mark while leaving live links
 * behind, which is invisible and therefore unfixable by the user.
 *
 * Not atomic, for the same reason and with the same Phase 5 RPC note.
 */
export async function archiveMark(markId: string): Promise<void> {
  if (!UUID_RE.test(markId)) throw invalid('markId is not a uuid');

  const client = dataClient();
  const now = new Date().toISOString();

  const { error: linkError } = await client
    .from('goal_mark_links')
    .update({ deleted_at: now, updated_at: now })
    .eq('mark_id', markId)
    .is('deleted_at', null);
  if (linkError) throw toDataError(linkError);

  const { error } = await client
    .from('marks')
    .update({ deleted_at: now, updated_at: now })
    .eq('id', markId)
    .is('deleted_at', null);
  if (error) throw toDataError(error);
}

// ─── Maintenance conversion (M9 Phase 5A Task 6) ────────────────────────────

/**
 * When a goal ends (completed or expired), its habits carry on as maintenance
 * marks: stamp `maintenance_of` on every mark still LINKED to the goal.
 *
 * The store version keyed on `marks.goal_id` and nulled it; that column is
 * retired (and the store's copy was emptied by the cutover wipe, which made the
 * old conversion a silent no-op). Links resolve the membership here, and they
 * are deliberately left alive: they are the record of which marks served the
 * goal, and every active-goal surface filters by goal STATUS, not by link
 * existence. All habit fields (streaks, targets, reminders) are untouched.
 */
export async function convertGoalMarksToMaintenance(goalId: string): Promise<void> {
  if (!UUID_RE.test(goalId)) throw invalid('goalId is not a uuid');

  const client = dataClient();
  const { data: links, error: linkError } = await client
    .from('goal_mark_links')
    .select('mark_id')
    .eq('goal_id', goalId)
    .is('deleted_at', null);
  if (linkError) throw toDataError(linkError);

  const markIds = (links ?? []).map((row) => (row as { mark_id: string }).mark_id);
  if (markIds.length === 0) return;

  const { error } = await client
    .from('marks')
    .update({ maintenance_of: goalId, updated_at: new Date().toISOString() })
    .in('id', markIds)
    .is('deleted_at', null);
  if (error) throw toDataError(error);
}

// ─── Link / unlink (D-6) ────────────────────────────────────────────────────

export interface LinkInput {
  goalId: string;
  markId: string;
  userId: string;
}

/**
 * Link a mark to a goal. A mark may now serve SEVERAL goals (D-6).
 *
 * IDEMPOTENT BY REVIVE-THEN-INSERT, not by upsert. `goal_mark_links` carries
 * UNIQUE (goal_id, mark_id) — verified live 2026-07-30,
 * `goal_mark_links_goal_id_mark_id_key` — so a second insert raises 23505. An
 * upsert on that constraint would have been shorter and wrong twice over: with
 * `ignoreDuplicates` a previously-UNLINKED pair stays tombstoned and re-linking
 * silently does nothing, and without it the conflict row's PRIMARY KEY would be
 * overwritten with a freshly generated uuid. So: try to revive the existing pair,
 * and insert only if there was none. Re-linking an active pair is a no-op; the
 * second round trip happens only on a genuinely new link.
 *
 * 🔴 FREE-TIER MEASUREMENT, RECORDED FOR PHASE 5, NOT FIXED HERE (Step 4).
 * Read live from `pg_policies` on 2026-07-30:
 *
 *   RESTRICTIVE INSERT on `marks`:
 *     deleted_at IS NOT NULL
 *     OR livra_is_pro(auth.uid())
 *     OR ( (goal_id IS NULL OR livra_count_other_marks_for_goal(...) < 4)
 *          AND livra_count_other_active_marks(...) < 6 )
 *
 * Three consequences, all measured rather than reasoned:
 *   1. `livra_count_other_marks_for_goal` counts `marks WHERE goal_id = ...`. Once
 *      new marks leave `goal_id` NULL, that branch short-circuits TRUE and **the
 *      4-marks-per-goal cap stops binding entirely.**
 *   2. `livra_count_other_active_marks` has no goal dependency, so **the
 *      6-per-account ceiling still binds.** A free user can therefore put all 6
 *      marks on one goal instead of 4 — the ceiling holds, the shape does not.
 *   3. `goal_mark_links` has NO cap policy at all, only ownership. **Linking an
 *      existing mark to a second goal is completely uncounted**, which is exactly
 *      what the phase plan predicted might be true.
 *
 * Phase 5 relocates the cap onto `goal_mark_links` INSERT, with its own security
 * pass. Doing it here would break build 60, which is still live.
 */
export async function linkMarkToGoal(input: LinkInput): Promise<void> {
  const { goalId, markId, userId } = input;
  if (!UUID_RE.test(goalId)) throw invalid('goalId is not a uuid');
  if (!UUID_RE.test(markId)) throw invalid('markId is not a uuid');
  if (!UUID_RE.test(userId)) throw invalid('userId is not a uuid');

  const client = dataClient();
  const now = new Date().toISOString();

  const { data: revived, error: reviveError } = await client
    .from('goal_mark_links')
    .update({ deleted_at: null, updated_at: now })
    .eq('goal_id', goalId)
    .eq('mark_id', markId)
    .select('id');
  if (reviveError) throw toDataError(reviveError);
  if ((revived ?? []).length > 0) return;

  const { error } = await client.from('goal_mark_links').insert({
    id: uuidv4(),
    goal_id: goalId,
    mark_id: markId,
    // The link's owner is the goal's owner — the rule the RLS policy uses. A link
    // whose user_id is not auth.uid() is refused, which is how M6-B lost links.
    user_id: userId,
    created_at: now,
    updated_at: now,
  });
  if (error) throw toDataError(error);
}

/**
 * Unlink a mark from one goal.
 *
 * DELIBERATELY DOES NOT CASCADE to the mark, even when this was its last link.
 * The archive rule (§7.2) is about what happens when a GOAL is archived; unlinking
 * is the user saying "this mark no longer serves this goal", and the answer to
 * that is a standalone mark, not a deleted one. Unlinked marks are first class
 * here — the free-tier ceiling counts them.
 */
export async function unlinkMarkFromGoal(goalId: string, markId: string): Promise<void> {
  if (!UUID_RE.test(goalId)) throw invalid('goalId is not a uuid');
  if (!UUID_RE.test(markId)) throw invalid('markId is not a uuid');

  const now = new Date().toISOString();
  const { error } = await dataClient()
    .from('goal_mark_links')
    .update({ deleted_at: now, updated_at: now })
    .eq('goal_id', goalId)
    .eq('mark_id', markId)
    .is('deleted_at', null);
  if (error) throw toDataError(error);
}

// ─── Mutations ──────────────────────────────────────────────────────────────

export function useCreateMarkMutation() {
  const client = useQueryClient();
  return useMutation<MarkRow, DataError, CreateMarkInput>({
    mutationFn: createMark,
    onSuccess: (_row, input) => invalidateMarkScope(client, input.userId),
  });
}

export function useEditMarkMutation(userId: string) {
  const client = useQueryClient();
  return useMutation<void, DataError, { markId: string; changes: EditMarkChanges }>({
    mutationFn: ({ markId, changes }) => editMark(markId, changes),
    onSuccess: (_v, { markId }) => {
      void client.invalidateQueries({ queryKey: queryKeys.mark(userId, markId) });
      invalidateMarkScope(client, userId);
    },
  });
}

export function useArchiveMarkMutation(userId: string) {
  const client = useQueryClient();
  return useMutation<void, DataError, string>({
    mutationFn: archiveMark,
    onSuccess: () => invalidateMarkScope(client, userId),
  });
}

export function useLinkMarkMutation(userId: string) {
  const client = useQueryClient();
  return useMutation<void, DataError, LinkInput>({
    mutationFn: linkMarkToGoal,
    onSuccess: () => invalidateMarkScope(client, userId),
  });
}

export function useUnlinkMarkMutation(userId: string) {
  const client = useQueryClient();
  return useMutation<void, DataError, { goalId: string; markId: string }>({
    mutationFn: ({ goalId, markId }) => unlinkMarkFromGoal(goalId, markId),
    onSuccess: () => invalidateMarkScope(client, userId),
  });
}
