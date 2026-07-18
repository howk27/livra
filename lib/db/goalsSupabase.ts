/**
 * Supabase persistence layer for goals + goal_mark_links (M6-B).
 *
 * Both tables existed since 20260602 but were DEAD — the client never wrote to
 * them. 20260716 gave them the sync columns (tier, frequency,
 * banked_momentum_days, deleted_at on goals; user_id, updated_at, deleted_at on
 * links) and this module is what finally uses them.
 *
 * CONFLICT TARGETS differ by table, on purpose:
 *   * goals        → `id`. The client uuid is the identity.
 *   * goal_mark_links → `goal_id,mark_id`. The pair is a UNIQUE constraint that
 *     SURVIVES the tombstone, so re-linking an unlinked pair must upsert onto it
 *     (clearing deleted_at); an INSERT would be rejected by the constraint.
 *
 * LAST-WRITE-WINS on the client's `updated_at`: the migration deliberately adds
 * no moddatetime trigger, so the timestamps we send are the ones stored.
 *
 * RLS: `auth.uid() = user_id` on goals; on links BOTH `auth.uid() = user_id` AND
 * ownership of the referenced goal. A link pushed without user_id is rejected.
 */
import { getSupabaseClient } from '../supabase';
import type { Goal, GoalMarkLink } from '../../types/goal';
import { logger } from '../utils/logger';
import { mapGoalToSupabase, mapGoalMarkLinkToSupabase } from '../sync/mappers';

/** Columns pulled for goals. `target_date` does not exist server-side. */
export const GOAL_SELECT =
  'id, user_id, title, description, icon, color, sort_index, status, target_mark_count, ' +
  'current_mark_count, deadline_date, completed_at, milestones_fired, banked_momentum_days, ' +
  'tier, frequency, deleted_at, created_at, updated_at';

export const GOAL_LINK_SELECT =
  'id, goal_id, mark_id, user_id, created_at, updated_at, deleted_at';

/**
 * True when the server refused a goal INSERT because of the RESTRICTIVE
 * "Free tier: max 2 active goals" policy (20260613). Postgres reports an RLS
 * refusal as 42501 / "row-level security"; PostgREST surfaces it as a 403.
 *
 * This policy went live the moment this client started inserting goals. It must
 * read as the existing GoalLimitError paywall, never as a raw sync error.
 */
export function isGoalCapRejection(error: unknown): boolean {
  if (!error) return false;
  const e = error as { code?: string; message?: string; status?: number };
  const message = String(e.message ?? '').toLowerCase();
  return (
    e.code === '42501' ||
    message.includes('row-level security') ||
    message.includes('violates row-level security policy')
  );
}

/**
 * Upsert goals (tombstones included — a tombstone IS the deletion travelling).
 * Returns nothing; the caller owns cursor + cap handling.
 */
export async function pushGoals(goals: Goal[]): Promise<void> {
  if (goals.length === 0) return;
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from('goals')
    .upsert(goals.map(mapGoalToSupabase), { onConflict: 'id' });
  if (error) {
    logger.error('[GoalsSupabase] goal upsert failed:', error.message);
    throw error;
  }
}

/**
 * Upsert links on the (goal_id, mark_id) conflict target.
 *
 * `ignoreDuplicates: false` is load-bearing: a re-link after an unlink hits an
 * existing TOMBSTONED row, and we need the UPDATE branch to clear its
 * deleted_at. Ignoring the duplicate would leave the pair deleted forever.
 */
export async function pushGoalMarkLinks(links: GoalMarkLink[]): Promise<void> {
  if (links.length === 0) return;
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from('goal_mark_links')
    .upsert(links.map(mapGoalMarkLinkToSupabase), {
      onConflict: 'goal_id,mark_id',
      ignoreDuplicates: false,
    });
  if (error) {
    logger.error('[GoalsSupabase] link upsert failed:', error.message);
    throw error;
  }
}

/**
 * Incremental pull for goals. Tombstones are RETURNED, never filtered — that is
 * how a deletion made on another device reaches this one. `sinceIso = null`
 * fetches everything (first sync / reinstall recovery).
 */
export async function fetchGoalsForUser(userId: string, sinceIso: string | null): Promise<Goal[]> {
  const supabase = getSupabaseClient();
  let q = supabase.from('goals').select(GOAL_SELECT).eq('user_id', userId);
  if (sinceIso) q = q.gt('updated_at', sinceIso);
  const { data, error } = await q;
  if (error) {
    logger.error('[GoalsSupabase] goal fetch failed:', error.message);
    throw error;
  }
  return (data ?? []) as unknown as Goal[];
}

/** Incremental pull for links. Tombstones are RETURNED (see fetchGoalsForUser). */
export async function fetchGoalMarkLinksForUser(
  userId: string,
  sinceIso: string | null,
): Promise<GoalMarkLink[]> {
  const supabase = getSupabaseClient();
  let q = supabase.from('goal_mark_links').select(GOAL_LINK_SELECT).eq('user_id', userId);
  if (sinceIso) q = q.gt('updated_at', sinceIso);
  const { data, error } = await q;
  if (error) {
    logger.error('[GoalsSupabase] link fetch failed:', error.message);
    throw error;
  }
  return (data ?? []) as unknown as GoalMarkLink[];
}
