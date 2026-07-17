/**
 * Type-safe mappers for transforming between local database types and Supabase types.
 *
 * After migration 20260602_rename_counters_to_marks.sql both local (mark_id) and
 * Supabase (mark_id) use the same field name. These functions are retained for
 * call-site compatibility; the to/from Supabase directions are now identity-like
 * for the parent ID field.
 */

import { CounterStreak, MarkBadge, CounterEvent } from '../../types';
import type { Goal, GoalMarkLink } from '../../types/goal';

// Supabase-specific types — column is now mark_id (was counter_id pre-migration)
export type SupabaseStreak = Omit<CounterStreak, 'mark_id'> & {
  mark_id: string;
};

export type SupabaseBadge = Omit<MarkBadge, 'mark_id'> & {
  mark_id: string;
};

export type SupabaseEvent = Omit<CounterEvent, 'mark_id'> & {
  mark_id: string;
};

export function mapStreakToSupabase(streak: CounterStreak): SupabaseStreak {
  if (!streak.mark_id) {
    throw new Error('Cannot map streak to Supabase: mark_id is required');
  }
  const { counter_id: _omit, ...rest } = streak as any;
  return { ...rest, mark_id: streak.mark_id };
}

export function mapBadgeToSupabase(badge: MarkBadge): SupabaseBadge {
  if (!badge.mark_id) {
    throw new Error('Cannot map badge to Supabase: mark_id is required');
  }
  const { counter_id: _omit, ...rest } = badge as any;
  return { ...rest, mark_id: badge.mark_id };
}

export function mapEventToSupabase(event: CounterEvent): SupabaseEvent {
  if (!event.mark_id) {
    throw new Error('Cannot map event to Supabase: mark_id is required');
  }
  const { counter_id: _omit, ...rest } = event as any;
  return { ...rest, mark_id: event.mark_id };
}

export function mapStreakFromSupabase(supabaseStreak: SupabaseStreak): CounterStreak {
  return { ...supabaseStreak, mark_id: supabaseStreak.mark_id };
}

export function mapBadgeFromSupabase(supabaseBadge: SupabaseBadge): MarkBadge {
  return { ...supabaseBadge, mark_id: supabaseBadge.mark_id };
}

export function mapEventFromSupabase(supabaseEvent: SupabaseEvent): CounterEvent {
  return { ...supabaseEvent, mark_id: supabaseEvent.mark_id };
}

// ── Goals + goal_mark_links (M6-B) ───────────────────────────────────────────
// Unlike the mark mappers above, these are NOT identity-like: the client Goal
// carries fields the server does not have, and sending them fails the whole
// upsert with PGRST204 (unknown column).

/** Server shape of public.goals — the 20260716 column contract, exactly. */
export type SupabaseGoal = {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  sort_index: number;
  status: string;
  target_mark_count: number | null;
  current_mark_count: number;
  deadline_date: string | null;
  completed_at: string | null;
  milestones_fired: string[] | null;
  banked_momentum_days: number | null;
  tier: string | null;
  frequency: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type SupabaseGoalMarkLink = {
  id: string;
  goal_id: string;
  mark_id: string;
  user_id: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

/**
 * Drops the two client-only fields explicitly rather than spreading:
 *   * `target_date` — deprecated in favour of deadline_date and NOT a column
 *     (see the migration header); sending it would break every goal push.
 *   * `linked_mark_ids` — a read-time projection of goal_mark_links, not a column.
 * `status` is passed through as-is: the client union is exactly the server CHECK
 * now that 'queued' is gone.
 */
export function mapGoalToSupabase(goal: Goal): SupabaseGoal {
  if (!goal.user_id) {
    throw new Error('Cannot map goal to Supabase: user_id is required');
  }
  return {
    id: goal.id,
    user_id: goal.user_id,
    title: goal.title,
    description: goal.description ?? null,
    icon: goal.icon ?? null,
    color: goal.color ?? null,
    sort_index: goal.sort_index ?? 0,
    status: goal.status,
    target_mark_count: goal.target_mark_count ?? null,
    current_mark_count: goal.current_mark_count ?? 0,
    deadline_date: goal.deadline_date ?? goal.target_date ?? null,
    completed_at: goal.completed_at ?? null,
    milestones_fired: goal.milestones_fired ?? null,
    banked_momentum_days: goal.banked_momentum_days ?? null,
    tier: goal.tier ?? null,
    frequency: goal.frequency ?? null,
    deleted_at: goal.deleted_at ?? null,
    created_at: goal.created_at,
    updated_at: goal.updated_at,
  };
}

/**
 * user_id and updated_at are stamped by the write path, never here — RLS rejects
 * a link without user_id, so a missing one is a bug that must fail loudly rather
 * than be silently dropped by the server.
 */
export function mapGoalMarkLinkToSupabase(link: GoalMarkLink): SupabaseGoalMarkLink {
  if (!link.user_id) {
    throw new Error('Cannot map goal_mark_link to Supabase: user_id is required (RLS rejects it)');
  }
  if (!link.updated_at) {
    throw new Error('Cannot map goal_mark_link to Supabase: updated_at is required (sync cursor)');
  }
  return {
    id: link.id,
    goal_id: link.goal_id,
    mark_id: link.mark_id,
    user_id: link.user_id,
    created_at: link.created_at,
    updated_at: link.updated_at,
    deleted_at: link.deleted_at ?? null,
  };
}

export function mapGoalsToSupabase(goals: Goal[]): SupabaseGoal[] {
  return goals.map(mapGoalToSupabase);
}

export function mapGoalMarkLinksToSupabase(links: GoalMarkLink[]): SupabaseGoalMarkLink[] {
  return links.map(mapGoalMarkLinkToSupabase);
}

export function mapStreaksToSupabase(streaks: CounterStreak[]): SupabaseStreak[] {
  return streaks.map(mapStreakToSupabase);
}

export function mapBadgesToSupabase(badges: MarkBadge[]): SupabaseBadge[] {
  return badges.map(mapBadgeToSupabase);
}

export function mapEventsToSupabase(events: CounterEvent[]): SupabaseEvent[] {
  return events.map(mapEventToSupabase);
}

export function mapStreaksFromSupabase(supabaseStreaks: SupabaseStreak[]): CounterStreak[] {
  return supabaseStreaks.map(mapStreakFromSupabase);
}

export function mapBadgesFromSupabase(supabaseBadges: SupabaseBadge[]): MarkBadge[] {
  return supabaseBadges.map(mapBadgeFromSupabase);
}

export function mapEventsFromSupabase(supabaseEvents: SupabaseEvent[]): CounterEvent[] {
  return supabaseEvents.map(mapEventFromSupabase);
}
