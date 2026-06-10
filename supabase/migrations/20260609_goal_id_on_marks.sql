-- Add goal_id to counters table.
-- Goals are stored client-side only (AsyncStorage), so no foreign key constraint.
ALTER TABLE counters ADD COLUMN IF NOT EXISTS goal_id text;
