-- APPLIED 2026-07-25 via the Supabase MCP (apply_migration
-- "20260725_maintenance_of_column_and_drop_orphan_update_pro_status"), and the
-- result was verified by querying information_schema and pg_proc afterwards.
-- Recorded here so supabase/migrations stops drifting further from live.
--
-- 1. marks.maintenance_of — provenance of a graduated habit.
-- When a goal completes, its marks keep going as maintenance habits: goal_id is
-- NULLed (so they leave the per-goal Momentum paths) and maintenance_of records
-- where they came from. That column existed ONLY in local SQLite, so a reinstall
-- dropped it — and because graduation had already NULLed goal_id, the habit came
-- back anonymous, with nothing linking it to the goal it was earned from.
-- text, matching marks.goal_id (also text on this database), not uuid.
alter table public.marks add column if not exists maintenance_of text;

comment on column public.marks.maintenance_of is
  'Id of the completed goal this mark graduated from (goal_id is NULL for such marks). Local-only until 2026-07-25.';

-- 2. Drop the orphaned 3-arg update_pro_status.
-- Hand-added, in no migration, zero references in the repo. It survived only
-- because PostgREST resolves overloads by disjoint parameter names. Dead code
-- beside the payments path is a footgun. The 6-arg lifecycle version from
-- 20260721_iap_subscription_lifecycle.sql is the real one and is untouched.
drop function if exists public.update_pro_status(user_id_param uuid, pro_unlocked_param boolean, receipt_id_param text);

-- 3. One-off data repair, run the same day (see .reports/decisions.md 2026-07-25 (d)).
-- Five live marks on one account carried goal_id = NULL while five live links
-- still pointed at the live, active goal — the mirror of the QC1 reinstall bug,
-- which no client repair could reach. Restores goal_id from the surviving link,
-- but ONLY when exactly one live link points at a live ACTIVE goal, so a
-- graduated maintenance mark is never dragged back onto its finished goal.
-- Idempotent: a second run matches nothing.
update public.marks m
set goal_id = l.goal_id::text, updated_at = now()
from public.goal_mark_links l, public.goals g
where l.mark_id = m.id and l.user_id = m.user_id and l.deleted_at is null
  and g.id = l.goal_id and g.deleted_at is null and g.status = 'active'
  and m.goal_id is null and m.deleted_at is null
  and (select count(*) from public.goal_mark_links l2
       join public.goals g2 on g2.id = l2.goal_id and g2.deleted_at is null and g2.status = 'active'
       where l2.mark_id = m.id and l2.deleted_at is null) = 1;
