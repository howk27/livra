-- Phase 1: Add frequency fields to marks table
-- STATUS: APPLIED 2026-06-14 — verified live: marks.weekly_target, frequency_kind,
--   frequency_min/recommended/max all present.
ALTER TABLE marks ADD COLUMN IF NOT EXISTS frequency_min integer;
ALTER TABLE marks ADD COLUMN IF NOT EXISTS frequency_recommended integer;
ALTER TABLE marks ADD COLUMN IF NOT EXISTS frequency_max integer;
ALTER TABLE marks ADD COLUMN IF NOT EXISTS weekly_target integer;
ALTER TABLE marks ADD COLUMN IF NOT EXISTS frequency_kind text;

-- Backfill existing rows with safe defaults.
-- NOTE: schedule_type/schedule_days are client-only (SQLite/AsyncStorage) and do
-- NOT exist on the server marks table, so we cannot derive weekly_target from a
-- schedule here. The client owns the real frequency model and will overwrite these
-- on the next sync; these constants just keep pre-existing rows non-NULL/sane.
UPDATE marks
SET
  weekly_target = 3,
  frequency_recommended = 3,
  frequency_min = 1,
  frequency_max = 7,
  frequency_kind = 'variable'
WHERE weekly_target IS NULL;
