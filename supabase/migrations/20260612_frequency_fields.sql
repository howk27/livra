-- Phase 1: Add frequency fields to marks table
-- Run: supabase db push (manual — do not run automatically)
ALTER TABLE marks ADD COLUMN IF NOT EXISTS frequency_min integer;
ALTER TABLE marks ADD COLUMN IF NOT EXISTS frequency_recommended integer;
ALTER TABLE marks ADD COLUMN IF NOT EXISTS frequency_max integer;
ALTER TABLE marks ADD COLUMN IF NOT EXISTS weekly_target integer;
ALTER TABLE marks ADD COLUMN IF NOT EXISTS frequency_kind text;

-- Backfill: derive weekly_target from schedule_type/schedule_days
UPDATE marks
SET
  weekly_target = CASE
    WHEN schedule_type = 'daily' THEN 7
    WHEN schedule_type IN ('weekly', 'custom') AND schedule_days IS NOT NULL
      THEN GREATEST(1, LEAST(7, jsonb_array_length(schedule_days::jsonb)))
    ELSE 3
  END,
  frequency_recommended = CASE
    WHEN schedule_type = 'daily' THEN 7
    WHEN schedule_type IN ('weekly', 'custom') AND schedule_days IS NOT NULL
      THEN GREATEST(1, LEAST(7, jsonb_array_length(schedule_days::jsonb)))
    ELSE 3
  END,
  frequency_min = 1,
  frequency_max = 7,
  frequency_kind = 'variable'
WHERE weekly_target IS NULL;
