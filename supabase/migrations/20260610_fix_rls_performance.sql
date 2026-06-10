-- Fix RLS performance: replace auth.uid() with (select auth.uid()) so Postgres
-- evaluates the function once per query instead of once per row.
-- Idempotent: drops each policy before recreating it.
-- Handles both pre- and post-rename table names (counters→marks, etc.).

-- ── profiles ──────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users read own profile"   ON public.profiles;
DROP POLICY IF EXISTS "Users insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users update own profile" ON public.profiles;

CREATE POLICY "Users read own profile"
  ON public.profiles FOR SELECT
  USING ((select auth.uid()) = id);

CREATE POLICY "Users insert own profile"
  ON public.profiles FOR INSERT
  WITH CHECK ((select auth.uid()) = id);

CREATE POLICY "Users update own profile"
  ON public.profiles FOR UPDATE
  USING ((select auth.uid()) = id)
  WITH CHECK ((select auth.uid()) = id);

-- ── marks (was: counters) ─────────────────────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'marks') THEN
    DROP POLICY IF EXISTS "Users manage own marks"    ON public.marks;
    DROP POLICY IF EXISTS "Users manage own counters" ON public.marks;
    CREATE POLICY "Users manage own marks"
      ON public.marks FOR ALL
      USING     ((select auth.uid()) = user_id)
      WITH CHECK ((select auth.uid()) = user_id);
  ELSIF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'counters') THEN
    DROP POLICY IF EXISTS "Users manage own counters" ON public.counters;
    CREATE POLICY "Users manage own counters"
      ON public.counters FOR ALL
      USING     ((select auth.uid()) = user_id)
      WITH CHECK ((select auth.uid()) = user_id);
  END IF;
END $$;

-- ── mark_events (was: counter_events) ────────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'mark_events') THEN
    DROP POLICY IF EXISTS "Users manage own mark_events"    ON public.mark_events;
    DROP POLICY IF EXISTS "Users manage own counter_events" ON public.mark_events;
    CREATE POLICY "Users manage own mark_events"
      ON public.mark_events FOR ALL
      USING     ((select auth.uid()) = user_id)
      WITH CHECK ((select auth.uid()) = user_id);
  ELSIF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'counter_events') THEN
    DROP POLICY IF EXISTS "Users manage own counter_events" ON public.counter_events;
    CREATE POLICY "Users manage own counter_events"
      ON public.counter_events FOR ALL
      USING     ((select auth.uid()) = user_id)
      WITH CHECK ((select auth.uid()) = user_id);
  END IF;
END $$;

-- ── mark_streaks (was: counter_streaks) ───────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'mark_streaks') THEN
    DROP POLICY IF EXISTS "Users manage own mark_streaks"    ON public.mark_streaks;
    DROP POLICY IF EXISTS "Users manage own counter_streaks" ON public.mark_streaks;
    CREATE POLICY "Users manage own mark_streaks"
      ON public.mark_streaks FOR ALL
      USING     ((select auth.uid()) = user_id)
      WITH CHECK ((select auth.uid()) = user_id);
  ELSIF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'counter_streaks') THEN
    DROP POLICY IF EXISTS "Users manage own counter_streaks" ON public.counter_streaks;
    CREATE POLICY "Users manage own counter_streaks"
      ON public.counter_streaks FOR ALL
      USING     ((select auth.uid()) = user_id)
      WITH CHECK ((select auth.uid()) = user_id);
  END IF;
END $$;

-- ── mark_badges (was: counter_badges) ────────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'mark_badges') THEN
    DROP POLICY IF EXISTS "Users manage own mark_badges"    ON public.mark_badges;
    DROP POLICY IF EXISTS "Users manage own counter_badges" ON public.mark_badges;
    CREATE POLICY "Users manage own mark_badges"
      ON public.mark_badges FOR ALL
      USING     ((select auth.uid()) = user_id)
      WITH CHECK ((select auth.uid()) = user_id);
  ELSIF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'counter_badges') THEN
    DROP POLICY IF EXISTS "Users manage own counter_badges" ON public.counter_badges;
    CREATE POLICY "Users manage own counter_badges"
      ON public.counter_badges FOR ALL
      USING     ((select auth.uid()) = user_id)
      WITH CHECK ((select auth.uid()) = user_id);
  END IF;
END $$;

-- ── mark_notes ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users manage own notes" ON public.mark_notes;

CREATE POLICY "Users manage own notes"
  ON public.mark_notes FOR ALL
  USING     ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- ── xp_events (optional — table may not yet exist) ────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'xp_events') THEN
    DROP POLICY IF EXISTS "Users manage own xp_events" ON public.xp_events;
    CREATE POLICY "Users manage own xp_events"
      ON public.xp_events FOR ALL
      USING     ((select auth.uid()) = user_id)
      WITH CHECK ((select auth.uid()) = user_id);
  END IF;
END $$;
