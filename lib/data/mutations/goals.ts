// lib/data/mutations/goals.ts
//
// M9 Phase 3 Task 3 — goal writes, and THE ARCHIVE RULE (T2).
//
// EXTENDED BY TASK 6 (2026-07-30) with `editGoal` and `completeGoal`, the last two
// goal writes the store still owned. With these the mutation layer covers every
// goal write there is — create, rename, edit, reorder, complete, archive, and
// link/unlink over in `marks.ts` — which is what lets Step 1 delete the bridges
// rather than merely thin them.
//
// ARCHIVE, NEVER DELETE (D-8/D-9). Nothing here issues a DELETE. Archiving stamps
// `deleted_at` on the goal, on its links, and on any mark those links leave with
// nowhere to belong. Every row is retained; there is no restore UI yet, by ruling.
//
// THE SUBTLE PART IS THE SECOND HALF (Spec §7.2, forced by D-6). Once a mark can
// serve several goals, "delete a goal, hide its marks" stops being well defined. A
// mark disappears only if it has NO REMAINING LIVE LINK TO ANY LIVE GOAL. A mark
// shared with a surviving goal stays. `marksLosingTheirLastLink` is pure so both
// directions can be proven, because a test that checks only the first direction
// passes against a naive cascade — which is exactly the bug.
//
// MEASURED ON PRODUCTION 2026-07-30, and it changed what this module had to do:
// across the 2 already-deleted goals on the account under test, all 6 of their
// links are correctly tombstoned (0 live) — but all 6 of the marks left behind are
// STILL LIVE ROWS with no live link anywhere. So only the first half of the rule
// has ever been applied. Those 6 orphans ARE T2 as the founder sees it, and
// `fetchMarksForUser` still returns them because it filters on `marks.deleted_at`
// alone. Tombstoning the orphan is therefore the half that fixes the bug.

import 'react-native-get-random-values'; // must precede any uuid use
import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { v4 as uuidv4 } from 'uuid';
import { dataClient, GOAL_COLUMNS, selectList } from '@/lib/data/client';
import { queryKeys } from '@/lib/data/queryKeys';
import { toDataError, type DataError } from '@/lib/data/errors';
import { logger } from '@/lib/utils/logger';
import type { GoalRow } from '@/lib/data/types';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Longest title we will send. The column is unbounded text; a screen that loses
 * its keyboard handling should not be able to write a novel. */
const MAX_TITLE_LENGTH = 200;

function invalid(reason: string): DataError {
  logger.error('[data] goal write rejected before send', { reason });
  return { kind: 'unknown', message: 'The change could not be built from that input.' };
}

/**
 * Both goal keys plus every mark view: archiving moves marks too.
 *
 * CHECK-INS BELONG HERE (QC-1061 item 4). Deleting a goal soft-deletes the marks
 * it leaves without a parent, and every check-in figure on screen — weekly
 * progress, the day's count, the streak — is derived from `mark_events` scoped by
 * the surviving marks. Refreshing goals and marks while leaving the check-in
 * queries cached meant the numbers kept counting a mark the user had just
 * deleted, until some unrelated refetch happened to correct them. Exported for
 * the key-set test: the failure was an omission from this list, so the list is
 * the thing worth pinning.
 */
export function invalidateGoalScope(client: QueryClient, userId: string): void {
  void client.invalidateQueries({ queryKey: queryKeys.goals(userId) });
  void client.invalidateQueries({ queryKey: queryKeys.marks(userId) });
  void client.invalidateQueries({ queryKey: queryKeys.marksByGoal(userId) });
  void client.invalidateQueries({ queryKey: queryKeys.checkinsRoot(userId) });
}

// ─── Create ─────────────────────────────────────────────────────────────────

export interface CreateGoalInput {
  userId: string;
  title: string;
  description?: string | null;
  icon?: string | null;
  color?: string | null;
  tier?: string | null;
  frequency?: string | null;
  targetMarkCount?: number | null;
  deadlineDate?: string | null;
  /** Position among active goals. The caller knows the current list; this module
   * does not read to write. */
  sortIndex: number;
  /** Marks to link at creation. Written as LINKS, never as `marks.goal_id`. */
  markIds?: readonly string[];
}

/**
 * Create a goal and its links.
 *
 * THE FREE-TIER CAP IS NOT ENFORCED HERE, deliberately: it lives in RLS and moves
 * to `goal_mark_links` in Phase 5, with its own security pass. A refusal arrives
 * as 42501 or the P0001 sentinel and the Task 1 classifier already has copy for
 * both. A client-side pre-check is UX and belongs in the screen.
 */
export async function createGoal(input: CreateGoalInput): Promise<GoalRow> {
  const title = input.title.trim();
  if (!UUID_RE.test(input.userId)) throw invalid('userId is not a uuid');
  if (title.length === 0) throw invalid('title is empty');
  if (title.length > MAX_TITLE_LENGTH) throw invalid('title is too long');
  for (const markId of input.markIds ?? []) {
    if (!UUID_RE.test(markId)) throw invalid('markId is not a uuid');
  }

  const client = dataClient();
  const goalId = uuidv4();
  const now = new Date().toISOString();

  const { data, error } = await client
    .from('goals')
    .insert({
      id: goalId,
      user_id: input.userId,
      title,
      description: input.description ?? null,
      icon: input.icon ?? null,
      color: input.color ?? null,
      status: 'active',
      tier: input.tier ?? null,
      frequency: input.frequency ?? null,
      target_mark_count: input.targetMarkCount ?? null,
      current_mark_count: 0,
      sort_index: input.sortIndex,
      deadline_date: input.deadlineDate ?? null,
      created_at: now,
      updated_at: now,
    })
    .select(selectList(GOAL_COLUMNS))
    .single();
  if (error) throw toDataError(error);

  const markIds = input.markIds ?? [];
  if (markIds.length > 0) {
    // The link's owner is the goal's owner — the rule the RLS policy uses. A link
    // whose user_id is not auth.uid() is refused, which is how M6-B lost links
    // silently at push time.
    const { error: linkError } = await client.from('goal_mark_links').insert(
      markIds.map((markId) => ({
        id: uuidv4(),
        goal_id: goalId,
        mark_id: markId,
        user_id: input.userId,
        created_at: now,
        updated_at: now,
      })),
    );
    if (linkError) throw toDataError(linkError);
  }

  return (data ?? null) as unknown as GoalRow;
}

// ─── Rename ─────────────────────────────────────────────────────────────────

export async function renameGoal(goalId: string, rawTitle: string): Promise<void> {
  const title = rawTitle.trim();
  if (!UUID_RE.test(goalId)) throw invalid('goalId is not a uuid');
  if (title.length === 0) throw invalid('title is empty');
  if (title.length > MAX_TITLE_LENGTH) throw invalid('title is too long');

  const { error } = await dataClient()
    .from('goals')
    .update({ title, updated_at: new Date().toISOString() })
    .eq('id', goalId)
    .is('deleted_at', null);
  if (error) throw toDataError(error);
}

// ─── Reorder ────────────────────────────────────────────────────────────────

/**
 * Write `sort_index` in the given order. This is the value BOTH Focus and Goals
 * sort by, which is why a reorder that does not reach the server reads as the list
 * snapping back.
 *
 * One request per goal: PostgREST cannot set a different value per row in a single
 * UPDATE, and an upsert would need every column of every row (a partial upsert
 * nulls what it omits) — which on this table means re-sending state a stale client
 * may have wrong. Goal lists are 2 to 5 rows.
 */
export async function reorderGoals(orderedGoalIds: readonly string[]): Promise<void> {
  for (const goalId of orderedGoalIds) {
    if (!UUID_RE.test(goalId)) throw invalid('goalId is not a uuid');
  }
  const client = dataClient();
  const now = new Date().toISOString();

  for (let index = 0; index < orderedGoalIds.length; index += 1) {
    const { error } = await client
      .from('goals')
      .update({ sort_index: index, updated_at: now })
      .eq('id', orderedGoalIds[index])
      .is('deleted_at', null);
    if (error) throw toDataError(error);
  }
}

// ─── Edit (the rest of `updateGoal`) ────────────────────────────────────────
//
// `renameGoal` above owns the title because it is the one field with its own
// affordance on two screens. This owns everything else the goal-detail editor can
// change.
//
// FIELD BY FIELD, NEVER A BLANKET SPREAD — the same rule as `editMark`, for the
// same reason: `{ ...changes }` sends `undefined` for every key the caller omitted,
// and PostgREST writes those as NULL. On this table that silently clears a user's
// deadline or description because they edited an unrelated field.
//
// `target_date` IS DELIBERATELY NOT HERE. It is not a column — the live `goals`
// table has `deadline_date` only. The store carries both and keeps them in sync
// (`goalsSlice.ts:186-188`), a compatibility shim for old callers that dies with
// the store. Writing the real column once is the whole point of this layer.

export interface EditGoalChanges {
  description?: string | null;
  /** The real column. `target_date` is the store's deprecated alias for it. */
  deadlineDate?: string | null;
  /** `jsonb` server-side, `string[]` in the app. */
  milestonesFired?: readonly string[];
  icon?: string | null;
  color?: string | null;
  tier?: string | null;
  frequency?: string | null;
  targetMarkCount?: number | null;
}

export async function editGoal(goalId: string, changes: EditGoalChanges): Promise<void> {
  if (!UUID_RE.test(goalId)) throw invalid('goalId is not a uuid');

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if ('description' in changes) patch.description = changes.description ?? null;
  if ('deadlineDate' in changes) patch.deadline_date = changes.deadlineDate ?? null;
  if ('milestonesFired' in changes) patch.milestones_fired = [...(changes.milestonesFired ?? [])];
  if ('icon' in changes) patch.icon = changes.icon ?? null;
  if ('color' in changes) patch.color = changes.color ?? null;
  if ('tier' in changes) patch.tier = changes.tier ?? null;
  if ('frequency' in changes) patch.frequency = changes.frequency ?? null;
  if ('targetMarkCount' in changes) patch.target_mark_count = changes.targetMarkCount ?? null;

  // Only `updated_at` means the caller passed nothing. Sending that alone would
  // bump the row's timestamp for no reason, which is a real cost once Phase 4
  // resolves conflicts by recency.
  if (Object.keys(patch).length === 1) return;

  const { error } = await dataClient()
    .from('goals')
    .update(patch)
    .eq('id', goalId)
    .is('deleted_at', null);
  if (error) throw toDataError(error);
}

// ─── Complete ───────────────────────────────────────────────────────────────

/**
 * Mark a goal finished.
 *
 * THIS WRITES THE ROW AND NOTHING ELSE — deliberately. The store's `completeGoal`
 * also awards XP, fires analytics, clears the momentum snapshot and converts the
 * goal's marks to maintenance. None of that belongs behind a data mutation: it is
 * app orchestration, it is fire-and-forget, and burying it here would make a failed
 * XP call look like a failed completion. This is the same split Task 2 made when it
 * left badges to the caller.
 *
 * `banked_momentum_days` is an INPUT rather than something this reads, because the
 * value lives in a Zustand store and `lib/data/` does not read Zustand.
 *
 * IDEMPOTENT VIA `.neq('status', 'completed')`: a second call matches no rows, so a
 * Phase 4 replay cannot move `completed_at` forward. That guard is safe because a
 * completed goal cannot un-complete in this product (`app/goal/history.tsx:22`), and
 * it is `neq` rather than `eq('status','active')` so a QUEUED goal can still finish.
 */
export async function completeGoal(
  goalId: string,
  bankedMomentumDays: number,
): Promise<void> {
  if (!UUID_RE.test(goalId)) throw invalid('goalId is not a uuid');
  if (!Number.isFinite(bankedMomentumDays) || bankedMomentumDays < 0) {
    throw invalid('bankedMomentumDays is not a non-negative number');
  }

  const now = new Date().toISOString();
  const { error } = await dataClient()
    .from('goals')
    .update({
      status: 'completed',
      completed_at: now,
      banked_momentum_days: Math.floor(bankedMomentumDays),
      updated_at: now,
    })
    .eq('id', goalId)
    .neq('status', 'completed')
    .is('deleted_at', null);
  if (error) throw toDataError(error);
}

// ─── Expire (M9 Phase 5A Task 6) ────────────────────────────────────────────

/**
 * A passed deadline ends the goal. The store's `checkGoalCompletion` wrote this
 * status flip into SQLite; this is the server row it always should have been.
 *
 * `.eq('status', 'active')` — narrower than completeGoal's `neq` on purpose:
 * only an ACTIVE goal can expire (the store checked the same), so a replay, a
 * completed goal, or a queued goal all match zero rows.
 */
export async function expireGoal(goalId: string): Promise<void> {
  if (!UUID_RE.test(goalId)) throw invalid('goalId is not a uuid');

  const now = new Date().toISOString();
  const { error } = await dataClient()
    .from('goals')
    .update({ status: 'expired', updated_at: now })
    .eq('id', goalId)
    .eq('status', 'active')
    .is('deleted_at', null);
  if (error) throw toDataError(error);
}

/**
 * The check-in credit: one bump of `current_mark_count` per mark per local day
 * (the caller owns the dedupe — it needs the event list, which lives in the
 * query cache, and lib/data does not read caches).
 *
 * READ-MODIFY-WRITE, same fidelity as the store version, which added 1 to its
 * local copy: the caller passes the new count computed from the freshest row it
 * holds. PostgREST cannot express `count = count + 1` without an RPC, and new
 * RPCs are Phase 5B (blocked until the build is live). Single-user data; the
 * races are the ones the store already had.
 */
export async function creditGoalMarkCount(goalId: string, newCount: number): Promise<void> {
  if (!UUID_RE.test(goalId)) throw invalid('goalId is not a uuid');
  if (!Number.isInteger(newCount) || newCount < 0) throw invalid('newCount is not a non-negative integer');

  const { error } = await dataClient()
    .from('goals')
    .update({ current_mark_count: newCount, updated_at: new Date().toISOString() })
    .eq('id', goalId)
    .eq('status', 'active')
    .is('deleted_at', null);
  if (error) throw toDataError(error);
}

// ─── Archive (T2) ───────────────────────────────────────────────────────────

export interface LiveLink {
  goal_id: string;
  mark_id: string;
}

/**
 * THE MANY-TO-MANY REFINEMENT, as a pure function.
 *
 * Given every LIVE link in the account (including the archived goal's own) and the
 * goal about to be archived, return the marks that will be left with no live link
 * to any surviving goal. Those, and only those, are tombstoned.
 *
 * Marks that were never linked to the archived goal are not considered at all — an
 * unlinked "daily habit" mark is a first-class thing in this app (the free-tier
 * ceiling counts it), and sweeping it here would delete something the user never
 * connected to the goal they removed.
 */
export function marksLosingTheirLastLink(
  liveLinks: readonly LiveLink[],
  archivedGoalId: string,
): string[] {
  const onArchivedGoal = new Set<string>();
  const elsewhere = new Set<string>();

  for (const link of liveLinks) {
    if (link.goal_id === archivedGoalId) onArchivedGoal.add(link.mark_id);
    else elsewhere.add(link.mark_id);
  }

  const orphans: string[] = [];
  for (const markId of onArchivedGoal) {
    if (!elsewhere.has(markId)) orphans.push(markId);
  }
  return orphans;
}

/**
 * Archive a goal: its marks (only the ones it was holding up), then its links,
 * then the goal itself.
 *
 * THE ORDER IS THE RECOVERY STORY, not an implementation detail. PostgREST gives
 * no transaction, so any of these calls can be the last one that lands. The goal
 * row goes LAST because the goal is the thing the user taps: every partial state
 * leaves the goal still on screen, so the natural response — tap delete again —
 * completes exactly the work that was missed. Every step is idempotent (each
 * filters on `deleted_at is null`), so the retry is free.
 *
 * Tombstoning marks BEFORE links also avoids ever passing through the shape
 * production is currently stuck in: links dead, orphaned marks alive.
 *
 * NOT ATOMIC, and that is a known gap rather than an oversight. A server-side
 * function would make it one statement; that is a schema change with its own
 * security pass, and it is filed for Phase 5 rather than smuggled in here.
 */
export async function archiveGoal(goalId: string, userId: string): Promise<void> {
  if (!UUID_RE.test(goalId)) throw invalid('goalId is not a uuid');
  if (!UUID_RE.test(userId)) throw invalid('userId is not a uuid');

  const client = dataClient();
  const now = new Date().toISOString();

  // Every live link the user owns, so "linked elsewhere" is answerable without a
  // second round trip per mark. Scoped by RLS to this user already.
  const { data: linkRows, error: linkReadError } = await client
    .from('goal_mark_links')
    .select('goal_id, mark_id')
    .is('deleted_at', null);
  if (linkReadError) throw toDataError(linkReadError);

  const liveLinks = (linkRows ?? []) as unknown as LiveLink[];
  const orphanMarkIds = marksLosingTheirLastLink(liveLinks, goalId);

  if (orphanMarkIds.length > 0) {
    const { error } = await client
      .from('marks')
      .update({ deleted_at: now, updated_at: now })
      .in('id', orphanMarkIds)
      .is('deleted_at', null);
    if (error) throw toDataError(error);
  }

  const { error: linkError } = await client
    .from('goal_mark_links')
    .update({ deleted_at: now, updated_at: now })
    .eq('goal_id', goalId)
    .is('deleted_at', null);
  if (linkError) throw toDataError(linkError);

  const { error: goalError } = await client
    .from('goals')
    .update({ deleted_at: now, updated_at: now })
    .eq('id', goalId)
    .is('deleted_at', null);
  if (goalError) throw toDataError(goalError);
}

// ─── Mutations ──────────────────────────────────────────────────────────────
//
// Goals are a short, deliberately-changed list, so these invalidate precise keys
// rather than patching the cache by hand: the write went to Supabase, so the
// refetch returns the new state. That is the whole difference from Phase 2, where
// the write went to SQLite and a refetch returned the old rows.

export function useCreateGoalMutation() {
  const client = useQueryClient();
  return useMutation<GoalRow, DataError, CreateGoalInput>({
    mutationFn: createGoal,
    onSuccess: (_row, input) => invalidateGoalScope(client, input.userId),
  });
}

export function useRenameGoalMutation(userId: string) {
  const client = useQueryClient();
  return useMutation<void, DataError, { goalId: string; title: string }>({
    mutationFn: ({ goalId, title }) => renameGoal(goalId, title),
    onSuccess: () => invalidateGoalScope(client, userId),
  });
}

export function useReorderGoalsMutation(userId: string) {
  const client = useQueryClient();
  return useMutation<void, DataError, readonly string[], { previous: GoalRow[] | undefined }>({
    mutationFn: reorderGoals,
    // Reorder is a drag: the list must not wait for a round trip to settle, or the
    // rows visibly snap back. Patch the cached order now, reconcile on settle.
    onMutate: (orderedIds) => {
      const key = queryKeys.goals(userId);
      const previous = client.getQueryData<GoalRow[]>(key);
      if (previous) {
        const position = new Map(orderedIds.map((id, index) => [id, index]));
        client.setQueryData<GoalRow[]>(
          key,
          [...previous]
            .map((goal) => ({ ...goal, sort_index: position.get(goal.id) ?? goal.sort_index }))
            .sort((a, b) => a.sort_index - b.sort_index),
        );
      }
      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) client.setQueryData(queryKeys.goals(userId), context.previous);
    },
    onSettled: () => invalidateGoalScope(client, userId),
  });
}

export function useEditGoalMutation(userId: string) {
  const client = useQueryClient();
  return useMutation<void, DataError, { goalId: string; changes: EditGoalChanges }>({
    mutationFn: ({ goalId, changes }) => editGoal(goalId, changes),
    onSuccess: () => invalidateGoalScope(client, userId),
  });
}

/**
 * Completion invalidates MARKS as well as goals, and that is not incidental: the
 * caller converts the goal's marks to maintenance right after this resolves, so a
 * goals-only refresh would leave the marks reads showing the pre-conversion shape.
 */
export function useCompleteGoalMutation(userId: string) {
  const client = useQueryClient();
  return useMutation<void, DataError, { goalId: string; bankedMomentumDays: number }>({
    mutationFn: ({ goalId, bankedMomentumDays }) => completeGoal(goalId, bankedMomentumDays),
    onSuccess: () => invalidateGoalScope(client, userId),
  });
}

export function useArchiveGoalMutation(userId: string) {
  const client = useQueryClient();
  return useMutation<void, DataError, string>({
    mutationFn: (goalId) => archiveGoal(goalId, userId),
    onSuccess: () => invalidateGoalScope(client, userId),
  });
}
