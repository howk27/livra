/**
 * Type-safe mappers for transforming between local database types and Supabase types.
 * 
 * Local database uses: mark_id
 * Supabase database uses: counter_id
 * 
 * These mappers ensure we never accidentally send the wrong field names to Supabase.
 */

import { CounterStreak, MarkBadge, CounterEvent } from '../../types';

// Supabase-specific types that match the database schema
export type SupabaseStreak = Omit<CounterStreak, 'mark_id'> & {
  counter_id: string;
};

export type SupabaseBadge = Omit<MarkBadge, 'mark_id'> & {
  counter_id: string;
};

export type SupabaseEvent = Omit<CounterEvent, 'mark_id'> & {
  counter_id: string;
};

/**
 * Maps a local CounterStreak to Supabase format.
 * Removes mark_id and adds counter_id.
 */
export function mapStreakToSupabase(streak: CounterStreak): SupabaseStreak {
  if (!streak.mark_id) {
    throw new Error('Cannot map streak to Supabase: mark_id is required');
  }

  const { mark_id, ...rest } = streak;
  return {
    ...rest,
    counter_id: mark_id,
  };
}

/**
 * Maps a local MarkBadge to Supabase format.
 * Removes mark_id and adds counter_id.
 */
export function mapBadgeToSupabase(badge: MarkBadge): SupabaseBadge {
  if (!badge.mark_id) {
    throw new Error('Cannot map badge to Supabase: mark_id is required');
  }

  const { mark_id, ...rest } = badge;
  return {
    ...rest,
    counter_id: mark_id,
  };
}

/**
 * Maps a local CounterEvent to Supabase format.
 * Removes mark_id and adds counter_id.
 */
export function mapEventToSupabase(event: CounterEvent): SupabaseEvent {
  if (!event.mark_id) {
    throw new Error('Cannot map event to Supabase: mark_id is required');
  }

  const { mark_id, ...rest } = event;
  return {
    ...rest,
    counter_id: mark_id,
  };
}

/**
 * Maps a Supabase streak response to local format.
 * Removes counter_id and adds mark_id.
 */
export function mapStreakFromSupabase(supabaseStreak: SupabaseStreak): CounterStreak {
  const { counter_id, ...rest } = supabaseStreak;
  return {
    ...rest,
    mark_id: counter_id,
  };
}

/**
 * Maps a Supabase badge response to local format.
 * Removes counter_id and adds mark_id.
 */
export function mapBadgeFromSupabase(supabaseBadge: SupabaseBadge): MarkBadge {
  const { counter_id, ...rest } = supabaseBadge;
  return {
    ...rest,
    mark_id: counter_id,
  };
}

/**
 * Maps a Supabase event response to local format.
 * Removes counter_id and adds mark_id.
 */
export function mapEventFromSupabase(supabaseEvent: SupabaseEvent): CounterEvent {
  const { counter_id, ...rest } = supabaseEvent;
  return {
    ...rest,
    mark_id: counter_id,
  };
}

/**
 * Maps an array of streaks to Supabase format.
 */
export function mapStreaksToSupabase(streaks: CounterStreak[]): SupabaseStreak[] {
  return streaks.map(mapStreakToSupabase);
}

/**
 * Maps an array of badges to Supabase format.
 */
export function mapBadgesToSupabase(badges: MarkBadge[]): SupabaseBadge[] {
  return badges.map(mapBadgeToSupabase);
}

/**
 * Maps an array of events to Supabase format.
 */
export function mapEventsToSupabase(events: CounterEvent[]): SupabaseEvent[] {
  return events.map(mapEventToSupabase);
}

/**
 * Maps an array of Supabase streaks to local format.
 */
export function mapStreaksFromSupabase(supabaseStreaks: SupabaseStreak[]): CounterStreak[] {
  return supabaseStreaks.map(mapStreakFromSupabase);
}

/**
 * Maps an array of Supabase badges to local format.
 */
export function mapBadgesFromSupabase(supabaseBadges: SupabaseBadge[]): MarkBadge[] {
  return supabaseBadges.map(mapBadgeFromSupabase);
}

/**
 * Maps an array of Supabase events to local format.
 */
export function mapEventsFromSupabase(supabaseEvents: SupabaseEvent[]): CounterEvent[] {
  return supabaseEvents.map(mapEventFromSupabase);
}

