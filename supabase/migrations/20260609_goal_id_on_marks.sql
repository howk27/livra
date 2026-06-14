-- Add goal_id to marks table.
-- STATUS: APPLIED 2026-06-14 — verified live: marks.goal_id present.
-- (The counters table was renamed to marks in 20260602_rename_counters_to_marks.sql,
--  which is applied on the server, so this must target marks — not counters.)
-- Goals are stored client-side only (AsyncStorage), so no foreign key constraint.
ALTER TABLE marks ADD COLUMN IF NOT EXISTS goal_id text;
