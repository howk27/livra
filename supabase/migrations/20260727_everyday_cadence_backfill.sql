-- STATUS: NOT YET APPLIED. Run STEP 1 first and read its output before running
-- STEP 2. Rewrite this header to APPLIED only after STEP 3 has been read back
-- from production — not on report. (The Supabase MCP still cannot reach
-- jhsxeibhxrvqrgkadyfk, so the founder runs this by hand and pastes the output.)
--
-- WHY THIS EXISTS: the library half of this decision shipped in the same commit
-- (lib/suggestedCounters.ts). The library is copied onto a mark AT CREATION, so
-- fixing it only reaches marks made from now on — every mark that already
-- exists keeps its stored range, and the Settings Pace control will keep pulling
-- it below its own standard. Founder decision 2026-07-27, having been told the
-- risk: "Library + backfill every existing mark."
--
-- THE RULE BEING BACKFILLED: a mark that measures a WHOLE-DAY STATE — you either
-- held the standard today or you did not — is every-day by nature and must not
-- be an intensity dial. Water was the first case (59fb080, "people are going to
-- dehydrate"); auditing all 41 library marks found four more with the identical
-- shape. Session-shaped marks (Workout, Run, Meditation…) are untouched, and so
-- are Steps and Skincare, which were weighed and deliberately left variable.
--
-- ⚠️ THIS WRITES TO CADENCE DATA — the column family with this project's worst
-- regression history (2026-07-22, 2026-07-26 twice). Hence: a dry run that must
-- be read first, a WHERE clause narrow enough to name its own blast radius, and
-- a rollback that restores the exact prior values rather than a guess.
--
-- MATCHING ON name: public.marks carries no library id — the 21-column sync
-- contract is id, user_id, name, emoji, color, unit, enable_streak, sort_index,
-- total, last_activity_date, deleted_at, created_at, updated_at, goal_id,
-- "dailyTarget", frequency_min, frequency_recommended, frequency_max,
-- weekly_target, frequency_kind, maintenance_of. So name is the only handle.
-- A user who renamed their Water mark is missed; that is the honest cost and it
-- fails SAFE (their mark keeps working, it just keeps its old range).
--
-- DO NOT run `supabase db push` on this project — remote schema_migrations is
-- empty for every migration, so a push replays all of them onto production.

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 1 — DRY RUN. Read this before running anything else.
-- Shows exactly which rows STEP 2 would touch and what they hold today.
-- If the count is wildly larger than expected, STOP and say so.
-- ─────────────────────────────────────────────────────────────────────────────

select
  m.id,
  m.name,
  m.frequency_kind      as kind_now,
  m.frequency_min       as min_now,
  m.frequency_recommended as rec_now,
  m.frequency_max       as max_now,
  m.weekly_target       as weekly_now
from public.marks m
where m.deleted_at is null
  and lower(trim(m.name)) in ('water', 'nutrition', 'calories', 'cut caffeine', 'screen time')
  and (m.frequency_kind is distinct from 'fixed'
       or m.frequency_min is distinct from 7
       or m.frequency_recommended is distinct from 7
       or m.frequency_max is distinct from 7
       or m.weekly_target is distinct from 7)
order by m.name, m.id;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 2 — THE BACKFILL. Only after STEP 1 has been read.
--
-- Snapshots every row it changes into a plain table FIRST, so the rollback at
-- the bottom restores real prior values instead of assuming what they were.
-- The snapshot table is deliberately left behind after the migration; drop it
-- by hand once the next build has been device-verified.
--
-- Wrapped in a transaction: either every row moves or none does. A partial
-- backfill across the cadence columns is the exact state that has bitten this
-- project before.
-- ─────────────────────────────────────────────────────────────────────────────

begin;

create table if not exists public.marks_cadence_backfill_20260727 (
  mark_id uuid primary key,
  name text,
  frequency_kind text,
  frequency_min integer,
  frequency_recommended integer,
  frequency_max integer,
  weekly_target integer,
  captured_at timestamptz not null default now()
);

insert into public.marks_cadence_backfill_20260727
  (mark_id, name, frequency_kind, frequency_min, frequency_recommended, frequency_max, weekly_target)
select
  m.id, m.name, m.frequency_kind, m.frequency_min,
  m.frequency_recommended, m.frequency_max, m.weekly_target
from public.marks m
where m.deleted_at is null
  and lower(trim(m.name)) in ('water', 'nutrition', 'calories', 'cut caffeine', 'screen time')
  and (m.frequency_kind is distinct from 'fixed'
       or m.frequency_min is distinct from 7
       or m.frequency_recommended is distinct from 7
       or m.frequency_max is distinct from 7
       or m.weekly_target is distinct from 7)
on conflict (mark_id) do nothing;

-- updated_at is bumped ON PURPOSE: the sync pull is change-driven, so a row
-- rewritten server-side without a new updated_at would never reach the device.
update public.marks m
set frequency_kind        = 'fixed',
    frequency_min         = 7,
    frequency_recommended = 7,
    frequency_max         = 7,
    weekly_target         = 7,
    updated_at            = now()
where m.deleted_at is null
  and lower(trim(m.name)) in ('water', 'nutrition', 'calories', 'cut caffeine', 'screen time')
  and (m.frequency_kind is distinct from 'fixed'
       or m.frequency_min is distinct from 7
       or m.frequency_recommended is distinct from 7
       or m.frequency_max is distinct from 7
       or m.weekly_target is distinct from 7);

commit;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 3 — VERIFY. Paste this output back. Expected: every row reads
-- fixed / 7 / 7 / 7 / 7, and rows_still_wrong is 0.
-- ─────────────────────────────────────────────────────────────────────────────

select
  m.name,
  m.frequency_kind,
  m.frequency_min,
  m.frequency_recommended,
  m.frequency_max,
  m.weekly_target,
  count(*) as rows
from public.marks m
where m.deleted_at is null
  and lower(trim(m.name)) in ('water', 'nutrition', 'calories', 'cut caffeine', 'screen time')
group by 1, 2, 3, 4, 5, 6
order by 1;

select count(*) as rows_still_wrong
from public.marks m
where m.deleted_at is null
  and lower(trim(m.name)) in ('water', 'nutrition', 'calories', 'cut caffeine', 'screen time')
  and (m.frequency_kind is distinct from 'fixed'
       or m.frequency_min is distinct from 7
       or m.frequency_recommended is distinct from 7
       or m.frequency_max is distinct from 7
       or m.weekly_target is distinct from 7);

select count(*) as rows_snapshotted from public.marks_cadence_backfill_20260727;

-- ─────────────────────────────────────────────────────────────────────────────
-- ROLLBACK — only if STEP 3 comes back wrong. Restores the exact prior values.
-- ─────────────────────────────────────────────────────────────────────────────
--
-- begin;
-- update public.marks m
-- set frequency_kind        = b.frequency_kind,
--     frequency_min         = b.frequency_min,
--     frequency_recommended = b.frequency_recommended,
--     frequency_max         = b.frequency_max,
--     weekly_target         = b.weekly_target,
--     updated_at            = now()
-- from public.marks_cadence_backfill_20260727 b
-- where m.id = b.mark_id;
-- commit;
