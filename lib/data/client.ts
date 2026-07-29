// lib/data/client.ts
//
// M9 Phase 1 — the SINGLE Supabase access point for `lib/data/`, plus the one
// authoritative column list per entity.
//
// Why column lists live here and nowhere else: the pull/push drift this project
// paid for twice (the `dailyTarget` pull 400, the six silently-dropped cadence
// columns) came from `hooks/useSync.ts` writing the select list twice with
// different contents. Here each entity has exactly ONE exported list, typed
// against the generated schema via `satisfies`, so a column removed from the DB
// (regenerate `types.ts`) fails `tsc` right here instead of 400-ing at runtime.

import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from '@/lib/supabase';
import type {
  Database,
  GoalRow,
  MarkRow,
  MarkEventRow,
  GoalNoteRow,
  GoalMarkLinkRow,
} from '@/lib/data/types';

/**
 * The one client `lib/data/` talks to. Reuses the app's single configured client
 * (`lib/supabase.ts`) — including its test override via `setSupabaseClientOverride`
 * — re-typed with the accurate generated `Database`. Never construct a second client.
 */
export function dataClient(): SupabaseClient<Database> {
  return getSupabaseClient() as unknown as SupabaseClient<Database>;
}

// ─── Column lists — one per entity, exported, typed against the generated rows ──
//
// `as const satisfies readonly (keyof XRow)[]` gives two guarantees:
//   • a name here that is NOT a real column is a `tsc` error (typo / rename), and
//   • a column removed from the DB (regenerate types) turns its entry here into a
//     `tsc` error — the whole point of generating types.

export const GOAL_COLUMNS = [
  'id',
  'user_id',
  'title',
  'description',
  'icon',
  'color',
  'status',
  'tier',
  'frequency',
  'target_mark_count',
  'current_mark_count',
  'sort_index',
  'deadline_date',
  'completed_at',
  'banked_momentum_days',
  'milestones_fired',
  'created_at',
  'updated_at',
  'deleted_at',
] as const satisfies readonly (keyof GoalRow)[];

// NOTE: `goal_id` is a real column on `marks` but is DELIBERATELY ABSENT — links
// are the truth (Phase 0 / T6), and Phase 5 drops the column. Selecting it here
// is exactly the bug this milestone removes; the Phase 1 guard test pins its
// absence.
export const MARK_COLUMNS = [
  'id',
  'user_id',
  'name',
  'emoji',
  'color',
  'unit',
  'total',
  'sort_index',
  'enable_streak',
  'last_activity_date',
  'maintenance_of',
  'frequency_kind',
  'frequency_min',
  'frequency_recommended',
  'frequency_max',
  'weekly_target',
  'dailyTarget',
  'created_at',
  'updated_at',
  'deleted_at',
] as const satisfies readonly (keyof MarkRow)[];

export const MARK_EVENT_COLUMNS = [
  'id',
  'user_id',
  'mark_id',
  'event_type',
  'amount',
  'occurred_at',
  'occurred_local_date',
  'meta',
  'created_at',
  'updated_at',
  'deleted_at',
] as const satisfies readonly (keyof MarkEventRow)[];

export const GOAL_NOTE_COLUMNS = [
  'id',
  'user_id',
  'goal_id',
  'local_date',
  'text',
  'created_at',
  'updated_at',
] as const satisfies readonly (keyof GoalNoteRow)[];

// Only the columns the link resolution needs; `goal_mark_links` is a join table,
// never returned to the UI as a row.
export const GOAL_MARK_LINK_COLUMNS = [
  'id',
  'goal_id',
  'mark_id',
  'user_id',
  'deleted_at',
] as const satisfies readonly (keyof GoalMarkLinkRow)[];

/** Join a column list into a PostgREST `select()` string. */
export function selectList(columns: readonly string[]): string {
  return columns.join(', ');
}
