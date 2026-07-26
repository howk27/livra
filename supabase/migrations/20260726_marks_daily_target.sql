-- STATUS: APPLIED to production (jhsxeibhxrvqrgkadyfk) 2026-07-26, and VERIFIED
-- by reading information_schema back — not taken on report. Confirmed after the
-- fact: column_name 'dailyTarget', data_type integer, is_nullable YES, and
-- `authenticated` holds INSERT,REFERENCES,SELECT,UPDATE on it (the grants on
-- public.marks are table-wide, so the new column inherited them).
--
-- WHY THIS EXISTS: drift repair, not a new feature.
-- 20250211100000_core_livra_sync_schema.sql line 61 already declares
--   "dailyTarget" integer
-- but production never had the column. The client asked for it on every marks
-- pull, Postgres answered 42703 `column marks.dailyTarget does not exist`, and
-- the pull's all-or-nothing fallback then dropped the six cadence columns that
-- DO exist (frequency_min/recommended/max, weekly_target, frequency_kind,
-- maintenance_of). So one absent column cost the device its whole cadence model
-- on every single sync. Found in the live API log 2026-07-26; the read-path fix
-- is 4c1aaf9, this is the schema half.
--
-- WHY THE COLUMN RATHER THAN DELETING THE PROMISE: dailyTarget is real user
-- configuration — how many taps close a day (lib/markDailyTarget.ts, default 1).
-- Device-only meant a reinstall silently reset every custom target to 1, which
-- is the same defect the 2026-07-22 pass fixed for the frequency columns by
-- putting them on the server. Founder decision, 2026-07-26.
--
-- NOTE THE QUOTING: the column is camelCase, so it is "dailyTarget" everywhere.
-- Unquoted, Postgres folds it to dailytarget and the client's select misses it.
--
-- DO NOT run `supabase db push` on this project — remote schema_migrations is
-- empty for every migration, so a push replays all of them onto production.
-- This was applied by hand via the MCP, like every other migration here.

alter table public.marks
  add column if not exists "dailyTarget" integer;

-- Existing rows stay NULL on purpose. mergeCounter's preservedDaily keeps the
-- local value when the remote one is null or non-positive, so the device's real
-- targets survive the first pull and then push themselves up.
