-- Rename Supabase tables from counter-prefixed names to mark-prefixed names.
-- IMPORTANT: Run this in a single transaction. Requires updating client sync code
-- (hooks/useSync.ts) to point to the new table names before deploying.
-- The client code currently references: counters, counter_events, counter_streaks, counter_badges.
-- After migration, those must become: marks, mark_events, mark_streaks, mark_badges.

begin;

-- Drop policies before rename (they will be recreated with new names below)
drop policy if exists "Users manage own counters" on public.counters;
drop policy if exists "Users manage own counter_events" on public.counter_events;
drop policy if exists "Users manage own counter_streaks" on public.counter_streaks;
drop policy if exists "Users manage own counter_badges" on public.counter_badges;

-- Rename tables
alter table public.counters rename to marks;
alter table public.counter_events rename to mark_events;
alter table public.counter_streaks rename to mark_streaks;
alter table public.counter_badges rename to mark_badges;

-- Rename FK columns in child tables
alter table public.mark_events rename column counter_id to mark_id;
alter table public.mark_streaks rename column counter_id to mark_id;
alter table public.mark_badges rename column counter_id to mark_id;

-- Rename indexes
alter index if exists idx_counters_user_updated rename to idx_marks_user_updated;
alter index if exists idx_counters_user_deleted rename to idx_marks_user_deleted;
alter index if exists idx_counter_events_user_updated rename to idx_mark_events_user_updated;
alter index if exists idx_counter_events_counter rename to idx_mark_events_mark;
alter index if exists idx_counter_events_local_date rename to idx_mark_events_local_date;
alter index if exists idx_counter_streaks_one_active_per_mark rename to idx_mark_streaks_one_active_per_mark;
alter index if exists idx_counter_streaks_user_updated rename to idx_mark_streaks_user_updated;
alter index if exists idx_counter_badges_counter_code_active rename to idx_mark_badges_mark_code_active;
alter index if exists idx_counter_badges_user_updated rename to idx_mark_badges_user_updated;

-- Recreate RLS policies with new table names
create policy "Users manage own marks"
  on public.marks for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users manage own mark_events"
  on public.mark_events for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users manage own mark_streaks"
  on public.mark_streaks for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users manage own mark_badges"
  on public.mark_badges for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Update goal_mark_links FK to point to new marks table (if goals table already exists)
-- This is a no-op if goals table doesn't exist yet; run 20260602_goals_with_mark_links.sql first.

commit;
