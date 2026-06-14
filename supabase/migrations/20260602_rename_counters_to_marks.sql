-- STATUS: APPLIED 2026-06-14 — verified live: marks table present, counters gone.
-- Verified: useSync.ts and mappers.ts updated in Phase 1 Session 2 (commit 0617cca)
-- useSync.ts references: marks, mark_events, mark_streaks, mark_badges (confirmed)
-- mappers.ts uses: mark_id throughout (not counter_id)
-- Apply via: supabase db push  OR  paste into Supabase SQL editor
--
-- IDEMPOTENT: safe to run even if tables are already renamed or if some steps
-- completed in a previous partial run. Each step checks current state before acting.

-- ── Step 1: rename tables ────────────────────────────────────────────────────

DO $$
BEGIN
  -- counters → marks
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'counters')
     AND NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'marks') THEN
    ALTER TABLE public.counters RENAME TO marks;
    RAISE NOTICE 'Renamed counters → marks';
  ELSIF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'marks') THEN
    RAISE NOTICE 'marks already exists, skipping rename';
  END IF;

  -- counter_events → mark_events
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'counter_events')
     AND NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'mark_events') THEN
    ALTER TABLE public.counter_events RENAME TO mark_events;
    RAISE NOTICE 'Renamed counter_events → mark_events';
  ELSIF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'mark_events') THEN
    RAISE NOTICE 'mark_events already exists, skipping rename';
  END IF;

  -- counter_streaks → mark_streaks
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'counter_streaks')
     AND NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'mark_streaks') THEN
    ALTER TABLE public.counter_streaks RENAME TO mark_streaks;
    RAISE NOTICE 'Renamed counter_streaks → mark_streaks';
  ELSIF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'mark_streaks') THEN
    RAISE NOTICE 'mark_streaks already exists, skipping rename';
  END IF;

  -- counter_badges → mark_badges
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'counter_badges')
     AND NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'mark_badges') THEN
    ALTER TABLE public.counter_badges RENAME TO mark_badges;
    RAISE NOTICE 'Renamed counter_badges → mark_badges';
  ELSIF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'mark_badges') THEN
    RAISE NOTICE 'mark_badges already exists, skipping rename';
  END IF;
END $$;

-- ── Step 2: rename FK columns in child tables ─────────────────────────────────

DO $$
BEGIN
  -- mark_events.counter_id → mark_id
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'mark_events' AND column_name = 'counter_id'
  ) THEN
    ALTER TABLE public.mark_events RENAME COLUMN counter_id TO mark_id;
    RAISE NOTICE 'Renamed mark_events.counter_id → mark_id';
  END IF;

  -- mark_streaks.counter_id → mark_id
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'mark_streaks' AND column_name = 'counter_id'
  ) THEN
    ALTER TABLE public.mark_streaks RENAME COLUMN counter_id TO mark_id;
    RAISE NOTICE 'Renamed mark_streaks.counter_id → mark_id';
  END IF;

  -- mark_badges.counter_id → mark_id
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'mark_badges' AND column_name = 'counter_id'
  ) THEN
    ALTER TABLE public.mark_badges RENAME COLUMN counter_id TO mark_id;
    RAISE NOTICE 'Renamed mark_badges.counter_id → mark_id';
  END IF;
END $$;

-- ── Step 3: rename indexes ────────────────────────────────────────────────────

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_counters_user_updated') THEN
    ALTER INDEX public.idx_counters_user_updated RENAME TO idx_marks_user_updated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_counters_user_deleted') THEN
    ALTER INDEX public.idx_counters_user_deleted RENAME TO idx_marks_user_deleted;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_counter_events_user_updated') THEN
    ALTER INDEX public.idx_counter_events_user_updated RENAME TO idx_mark_events_user_updated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_counter_events_counter') THEN
    ALTER INDEX public.idx_counter_events_counter RENAME TO idx_mark_events_mark;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_counter_events_local_date') THEN
    ALTER INDEX public.idx_counter_events_local_date RENAME TO idx_mark_events_local_date;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_counter_streaks_one_active_per_mark') THEN
    ALTER INDEX public.idx_counter_streaks_one_active_per_mark RENAME TO idx_mark_streaks_one_active_per_mark;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_counter_streaks_user_updated') THEN
    ALTER INDEX public.idx_counter_streaks_user_updated RENAME TO idx_mark_streaks_user_updated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_counter_badges_counter_code_active') THEN
    ALTER INDEX public.idx_counter_badges_counter_code_active RENAME TO idx_mark_badges_mark_code_active;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_counter_badges_user_updated') THEN
    ALTER INDEX public.idx_counter_badges_user_updated RENAME TO idx_mark_badges_user_updated;
  END IF;
END $$;

-- ── Step 4: drop old RLS policies, recreate with new names ───────────────────

DROP POLICY IF EXISTS "Users manage own counters" ON public.marks;
DROP POLICY IF EXISTS "Users manage own counter_events" ON public.mark_events;
DROP POLICY IF EXISTS "Users manage own counter_streaks" ON public.mark_streaks;
DROP POLICY IF EXISTS "Users manage own counter_badges" ON public.mark_badges;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'marks') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'marks' AND policyname = 'Users manage own marks'
    ) THEN
      CREATE POLICY "Users manage own marks"
        ON public.marks FOR ALL
        USING (auth.uid() = user_id)
        WITH CHECK (auth.uid() = user_id);
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'mark_events') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'mark_events' AND policyname = 'Users manage own mark_events'
    ) THEN
      CREATE POLICY "Users manage own mark_events"
        ON public.mark_events FOR ALL
        USING (auth.uid() = user_id)
        WITH CHECK (auth.uid() = user_id);
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'mark_streaks') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'mark_streaks' AND policyname = 'Users manage own mark_streaks'
    ) THEN
      CREATE POLICY "Users manage own mark_streaks"
        ON public.mark_streaks FOR ALL
        USING (auth.uid() = user_id)
        WITH CHECK (auth.uid() = user_id);
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'mark_badges') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'mark_badges' AND policyname = 'Users manage own mark_badges'
    ) THEN
      CREATE POLICY "Users manage own mark_badges"
        ON public.mark_badges FOR ALL
        USING (auth.uid() = user_id)
        WITH CHECK (auth.uid() = user_id);
    END IF;
  END IF;
END $$;
