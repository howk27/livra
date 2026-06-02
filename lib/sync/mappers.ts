/**
 * Type-safe mappers for transforming between local database types and Supabase types.
 *
 * After migration 20260602_rename_counters_to_marks.sql both local (mark_id) and
 * Supabase (mark_id) use the same field name. These functions are retained for
 * call-site compatibility; the to/from Supabase directions are now identity-like
 * for the parent ID field.
 */

import { CounterStreak, MarkBadge, CounterEvent } from '../../types';

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
  return { ...streak, mark_id: streak.mark_id };
}

export function mapBadgeToSupabase(badge: MarkBadge): SupabaseBadge {
  if (!badge.mark_id) {
    throw new Error('Cannot map badge to Supabase: mark_id is required');
  }
  return { ...badge, mark_id: badge.mark_id };
}

export function mapEventToSupabase(event: CounterEvent): SupabaseEvent {
  if (!event.mark_id) {
    throw new Error('Cannot map event to Supabase: mark_id is required');
  }
  return { ...event, mark_id: event.mark_id };
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
