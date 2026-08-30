-- supabase/migrations/20260830_goals_program_id.sql
-- Guided Programs (PG-3, spec 2026-08-30 §4): the ONE stored program fact.
-- A program IS a goal; this column names which card the goal follows.
-- Everything else (stage, grades, eased mode, completion) is derived at render.
--
-- STATUS: APPLIED 2026-08-30 via MCP execute_sql (project jhsxeibhxrvqrgkadyfk),
-- NOT `supabase db push` (banned, see PROJECT-CONTEXT.md). Read back from
-- information_schema.columns (text, nullable YES) AND column_privileges
-- (authenticated: INSERT,REFERENCES,SELECT,UPDATE — table-wide grants
-- inherited, dailyTarget precedent 2026-07-26) before this header changed.

ALTER TABLE public.goals ADD COLUMN IF NOT EXISTS program_id text;
