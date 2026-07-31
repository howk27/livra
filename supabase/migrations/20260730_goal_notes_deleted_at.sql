-- STATUS: APPLIED to production (jhsxeibhxrvqrgkadyfk) 2026-07-30, and VERIFIED
-- by reading information_schema back — not taken on report. Confirmed after the
-- fact: column_name 'deleted_at', data_type 'timestamp with time zone',
-- is_nullable YES, column_default null, and `authenticated` holds
-- INSERT,REFERENCES,SELECT,UPDATE on it (grants on public.goal_notes are
-- table-wide, so the new column inherited them, exactly as "dailyTarget" did).
--
-- WHY THIS EXISTS: Milestone 9 Phase 3 constraint D-8 is "archive, never
-- hard-delete — no mutation issues a DELETE". Before this, public.goal_notes was
-- id, goal_id, user_id, local_date, text, created_at, updated_at — no tombstone
-- column, so the journal's delete could not be expressed as an archive at all.
-- app/goal/journal/[id].tsx offers deletion today, so Phase 3 Task 6 could not
-- finish wiring that screen without either this column or a recorded exception
-- carving journal entries out of D-8. Founder chose the column, 2026-07-30, so
-- the mutation layer keeps ONE delete shape instead of two.
--
-- WHY IT IS SAFE TO APPLY BEFORE THE NEW BUILD IS LIVE: purely additive. Build 60
-- never selects, writes, or filters on this column, so it cannot see it and
-- cannot break on it. This is the additive-now half of the Phase 5 split — the
-- destructive server work (drop marks.goal_id, relocate the free-tier cap, drop
-- dead tables) still waits until the new build has shipped.
--
-- CONSEQUENCE FOR THE READ PATH, handled in Phase 3 Task 6, not here: every
-- goal-notes read must now filter `deleted_at is null`, the same shape the goals
-- and marks queries already use. A tombstoned note that still renders is the
-- failure mode this column introduces.
--
-- Existing rows stay NULL, which is the correct reading: nothing was deleted.
--
-- DO NOT run `supabase db push` on this project — remote schema_migrations is
-- empty for every migration, so a push replays all of them onto production.
-- This was applied by hand via the MCP, like every other migration here.

alter table public.goal_notes
  add column if not exists deleted_at timestamptz;

-- No new index. The existing idx_goal_notes_goal_created still drives the
-- ordered per-goal read, and the `deleted_at is null` predicate filters a set
-- already narrowed to one goal — a partial index would cost writes to save
-- nothing at this row count.

notify pgrst, 'reload schema';
