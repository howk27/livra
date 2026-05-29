-- Livra Level System — Supabase Migration
-- Apply via: Supabase Dashboard > SQL Editor

-- 1. Add XP columns to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS total_xp integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS current_level integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS goal_completion_cooldown_until timestamptz,
  ADD COLUMN IF NOT EXISTS last_7d_bonus_date date,
  ADD COLUMN IF NOT EXISTS last_30d_bonus_date date;

-- 2. Create xp_events table
CREATE TABLE IF NOT EXISTS public.xp_events (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN (
    'mark_logged', 'full_day_bonus', 'goal_completed', 'consistency_7d', 'consistency_30d'
  )),
  xp_awarded integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_xp_events_user_date
  ON public.xp_events (user_id, created_at DESC);

ALTER TABLE public.xp_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own xp_events"
  ON public.xp_events FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
