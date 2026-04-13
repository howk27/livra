-- Livra: core tables used by hooks/useSync.ts and client types (lib/supabase.ts).
-- Apply via Supabase CLI or SQL editor. If tables already exist in production, use diff/review
-- against this file rather than blind re-run (this uses IF NOT EXISTS where safe).
--
-- Still verify manually: production RLS policies, triggers, and any columns not referenced
-- by the client (e.g. legacy gating columns on counters).

-- ── profiles ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  display_name text,
  pro_unlocked boolean NOT NULL DEFAULT false,
  pro_unlocked_at timestamptz,
  onboarding_completed boolean NOT NULL DEFAULT false,
  avatar_url text
);

CREATE INDEX IF NOT EXISTS idx_profiles_id ON public.profiles (id);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own profile" ON public.profiles;
CREATE POLICY "Users read own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users insert own profile" ON public.profiles;
CREATE POLICY "Users insert own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users update own profile" ON public.profiles;
CREATE POLICY "Users update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- ── counters (marks) ─────────────────────────────────────────────────────────
-- Client upserts with onConflict 'id' and sends camelCase dailyTarget (see useSync.ts).
CREATE TABLE IF NOT EXISTS public.counters (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  name text NOT NULL,
  emoji text,
  color text,
  unit text NOT NULL DEFAULT 'sessions',
  enable_streak boolean NOT NULL DEFAULT true,
  sort_index integer NOT NULL DEFAULT 0,
  total integer NOT NULL DEFAULT 0,
  last_activity_date timestamptz,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  gated boolean,
  gate_type text,
  min_interval_minutes integer,
  max_per_day integer,
  "dailyTarget" integer
);

CREATE INDEX IF NOT EXISTS idx_counters_user_updated ON public.counters (user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_counters_user_deleted ON public.counters (user_id) WHERE deleted_at IS NULL;

ALTER TABLE public.counters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own counters" ON public.counters;
CREATE POLICY "Users manage own counters"
  ON public.counters FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── counter_events (canonical activity log; id PK = client uuid) ─────────────
CREATE TABLE IF NOT EXISTS public.counter_events (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  counter_id uuid NOT NULL REFERENCES public.counters (id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('increment', 'reset', 'decrement')),
  amount integer NOT NULL DEFAULT 1,
  occurred_at timestamptz NOT NULL,
  occurred_local_date date NOT NULL,
  meta jsonb DEFAULT '{}'::jsonb,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_counter_events_user_updated ON public.counter_events (user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_counter_events_counter ON public.counter_events (counter_id);
CREATE INDEX IF NOT EXISTS idx_counter_events_local_date ON public.counter_events (user_id, occurred_local_date);

ALTER TABLE public.counter_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own counter_events" ON public.counter_events;
CREATE POLICY "Users manage own counter_events"
  ON public.counter_events FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── counter_streaks (derived cache; client upserts on id or counter_id) ─────
CREATE TABLE IF NOT EXISTS public.counter_streaks (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  counter_id uuid NOT NULL REFERENCES public.counters (id) ON DELETE CASCADE,
  current_streak integer NOT NULL DEFAULT 0,
  longest_streak integer NOT NULL DEFAULT 0,
  last_increment_date timestamptz,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_counter_streaks_one_active_per_mark
  ON public.counter_streaks (counter_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_counter_streaks_user_updated ON public.counter_streaks (user_id, updated_at DESC);

ALTER TABLE public.counter_streaks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own counter_streaks" ON public.counter_streaks;
CREATE POLICY "Users manage own counter_streaks"
  ON public.counter_streaks FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── counter_badges ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.counter_badges (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  counter_id uuid NOT NULL REFERENCES public.counters (id) ON DELETE CASCADE,
  badge_code text NOT NULL,
  progress_value integer NOT NULL DEFAULT 0,
  target_value integer NOT NULL,
  earned_at timestamptz,
  last_progressed_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_counter_badges_counter_code_active
  ON public.counter_badges (counter_id, badge_code)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_counter_badges_user_updated ON public.counter_badges (user_id, updated_at DESC);

ALTER TABLE public.counter_badges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own counter_badges" ON public.counter_badges;
CREATE POLICY "Users manage own counter_badges"
  ON public.counter_badges FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── mark_notes FK (optional integrity; table created in 20240101000000) ───────
-- Manual: if mark_notes exists and all rows reference valid counters, enable:
-- ALTER TABLE public.mark_notes
--   ADD CONSTRAINT mark_notes_mark_id_fkey
--   FOREIGN KEY (mark_id) REFERENCES public.counters (id) ON DELETE CASCADE;
-- Soft-deleted counters still exist as rows, so FK is compatible with deleted_at.
