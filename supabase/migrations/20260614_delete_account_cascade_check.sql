-- AUTH-1 — Account deletion data-cleanup contract (verification only).
-- STATUS: NOT APPLIED
--
-- The delete-account Edge Function (supabase/functions/delete-account) removes a
-- user by calling auth.admin.deleteUser(userId). It relies on every user-owned
-- table cascading from auth.users so that one delete wipes all associated data.
--
-- This migration does NOT change schema. It asserts that the expected
-- "REFERENCES auth.users(id) ON DELETE CASCADE" foreign keys still exist, so a
-- future schema change that drops a cascade can't silently leave orphaned data
-- behind after account deletion. Applying it is a safety check; it is
-- non-destructive and idempotent. It RAISES EXCEPTION (rolls back) if a cascade
-- is missing.
--
-- Tables that reference auth.users(id) directly (verified present in
-- 20250211100000_core_livra_sync_schema.sql, 20240101000000_create_mark_notes.sql,
-- 20260602_goals_with_mark_links.sql, 20260613_ai_uses.sql):
--   profiles(id), counters(user_id), counter_events(user_id),
--   counter_streaks(user_id), counter_badges(user_id), mark_notes(user_id),
--   goals(user_id), ai_goal_packages(user_id).
-- goal_mark_links cascades transitively via goals(id) ON DELETE CASCADE.

DO $$
DECLARE
  expected text[] := ARRAY[
    'profiles', 'counters', 'counter_events', 'counter_streaks',
    'counter_badges', 'mark_notes', 'goals', 'ai_goal_packages'
  ];
  tbl text;
  has_cascade boolean;
BEGIN
  FOREACH tbl IN ARRAY expected LOOP
    -- Skip tables that don't exist in this environment (e.g. partial schema).
    IF to_regclass('public.' || tbl) IS NULL THEN
      RAISE NOTICE 'delete-account check: table public.% absent, skipping', tbl;
      CONTINUE;
    END IF;

    SELECT EXISTS (
      SELECT 1
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
      JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
      JOIN pg_class fref ON fref.oid = con.confrelid
      JOIN pg_namespace fnsp ON fnsp.oid = fref.relnamespace
      WHERE con.contype = 'f'
        AND con.confdeltype = 'c'             -- ON DELETE CASCADE
        AND nsp.nspname = 'public'
        AND rel.relname = tbl
        AND fnsp.nspname = 'auth'
        AND fref.relname = 'users'
    ) INTO has_cascade;

    IF NOT has_cascade THEN
      RAISE EXCEPTION
        'delete-account contract broken: public.% has no ON DELETE CASCADE FK to auth.users — account deletion would orphan its rows', tbl;
    END IF;
  END LOOP;

  RAISE NOTICE 'delete-account cascade check passed: all user-owned tables cascade from auth.users';
END $$;
