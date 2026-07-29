-- STATUS: APPLIED 2026-07-29 via Supabase MCP against jhsxeibhxrvqrgkadyfk.
-- (Dated 20260728 to match the M9 Phase 0 plan filename; applied the following day.)
--
-- VERIFIED BY READING BACK, not taken on report:
--   · snapshot: marks_total = 46, snapshot_rows = 46, marks_missing_from_snapshot = 0
--   · snapshot RLS: rls_enabled = true, anon_can_read = false, auth_can_read = false
--   · backfill inserted exactly 7 rows (all live/live, user 3fe1a23e)
--   · pairs_still_missing = 0
--   · live_link_on_dead_endpoint = 0, dead_link_on_live_pair = 0
--   · re-run inserted 0 rows (idempotent)
--   · marks.goal_id STILL EXISTS and 25 marks still carry it
--
-- ADDITIVE ONLY. Does NOT drop marks.goal_id and does NOT touch any RLS policy on
-- marks / goals / goal_mark_links -- both would break build 60, which is live at
-- Apple and on the founder's device. The drop and the free-tier cap relocation
-- (from marks INSERT to goal_mark_links INSERT) are M9 Phase 5, after the new
-- build ships.
--
-- APPLIED VIA execute_sql, NOT apply_migration, DELIBERATELY: the remote
-- supabase_migrations.schema_migrations history is empty on this project because
-- every migration has been applied by hand. apply_migration would write a single
-- row into it, producing a partially-populated history that reads as "tracked"
-- when it is not. The `supabase db push` ban stands until one full
-- `migration repair` pass.
--
-- ROLLBACK: public.marks_goal_id_snapshot_20260728 holds every mark's original
-- goal_id. Roll back by TOMBSTONING the created links, never by deleting them --
-- unique(goal_id, mark_id) means a deleted row can be recreated, but a wrongly
-- LIVE row is what causes harm (it resurrects marks into archived goals):
--
--   update public.goal_mark_links l
--   set deleted_at = now(), updated_at = now()
--   where l.created_at >= '2026-07-29'::timestamptz
--     and exists (select 1 from public.marks_goal_id_snapshot_20260728 s
--                 where s.mark_id = l.mark_id and s.goal_id = l.goal_id::text);
--
-- marks.goal_id is untouched by this phase, so a rollback leaves the app's
-- current behaviour exactly as it was before.

-- ---------------------------------------------------------------------------
-- 1. Snapshot every mark's goal_id before touching anything.
--    Precedent: marks_cadence_backfill_20260727 did exactly this, which is why
--    the cadence backfill was reversible.
-- ---------------------------------------------------------------------------

create table if not exists public.marks_goal_id_snapshot_20260728 (
  mark_id     uuid primary key,
  user_id     uuid,
  goal_id     text,
  mark_name   text,
  deleted_at  timestamptz,
  captured_at timestamptz not null default now()
);

insert into public.marks_goal_id_snapshot_20260728 (mark_id, user_id, goal_id, mark_name, deleted_at)
select m.id, m.user_id, m.goal_id, m.name, m.deleted_at
from public.marks m
on conflict (mark_id) do nothing;

-- The snapshot holds every user's mark names. It must not be reachable with the
-- anon key that ships in the app bundle.
alter table public.marks_goal_id_snapshot_20260728 enable row level security;
revoke all on public.marks_goal_id_snapshot_20260728 from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Backfill goal_mark_links from marks.goal_id, idempotently.
--
--    join on g.id::text = m.goal_id casts the UUID to text, never the text to
--    UUID -- marks.goal_id is text and may hold a non-uuid string, and casting
--    the other direction would throw on the whole statement.
--
--    `where not exists` makes this re-runnable and respects the existing
--    unique(goal_id, mark_id) constraint, which counts tombstoned pairs too.
--
--    updated_at = now() is deliberate: it is what makes build 60's next pull
--    fetch these rows.
--
--    THE TOMBSTONE RULE: a link is created ALREADY TOMBSTONED when either
--    endpoint is deleted. Six live marks on this project point at deleted goals;
--    under the target model those marks must have a link that is not live, so
--    the archive rule hides them. Creating them live would resurrect six marks
--    into goals the founder deleted. (On the 2026-07-29 run this branch did not
--    fire -- all 7 inserted pairs were live/live, and the six tombstoned links
--    already existed. It stays in as correctness for re-runs.)
-- ---------------------------------------------------------------------------

insert into public.goal_mark_links (id, goal_id, mark_id, user_id, created_at, updated_at, deleted_at)
select
  gen_random_uuid(),
  g.id,
  m.id,
  m.user_id,
  now(),
  now(),
  case
    when g.deleted_at is not null or m.deleted_at is not null
      then coalesce(g.deleted_at, m.deleted_at)
    else null
  end
from public.marks m
join public.goals g on g.id::text = m.goal_id
where not exists (
  select 1 from public.goal_mark_links l
  where l.goal_id = g.id and l.mark_id = m.id
);

-- ---------------------------------------------------------------------------
-- VERIFY (all four ran 2026-07-29 with the results quoted in the header)
-- ---------------------------------------------------------------------------
--
-- select count(*) as pairs_still_missing
-- from public.marks m
-- join public.goals g on g.id::text = m.goal_id
-- where not exists (select 1 from public.goal_mark_links l
--                   where l.goal_id = g.id and l.mark_id = m.id);
--
-- select
--   count(*) filter (where l.deleted_at is null
--                      and (g.deleted_at is not null or m.deleted_at is not null)) as live_link_on_dead_endpoint,
--   count(*) filter (where l.deleted_at is not null
--                      and g.deleted_at is null and m.deleted_at is null)          as dead_link_on_live_pair
-- from public.goal_mark_links l
-- join public.goals g on g.id = l.goal_id
-- join public.marks m on m.id = l.mark_id;
--
-- -- safety property of the entire phase:
-- select count(*) from information_schema.columns
-- where table_schema='public' and table_name='marks' and column_name='goal_id';  -- must be 1
