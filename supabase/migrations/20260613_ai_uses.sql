-- Phase 4b: AI goal generation — usage counter + package cache
-- STATUS: NOT APPLIED — run via: supabase db push
--
-- Prerequisites: profiles table exists (20260528_onboarding_meta.sql applied).

-- 1. Add ai_uses_count to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS ai_uses_count integer NOT NULL DEFAULT 0;

-- 2. Atomic increment RPC (avoids read-modify-write races)
CREATE OR REPLACE FUNCTION public.increment_ai_uses_count(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE profiles SET ai_uses_count = ai_uses_count + 1 WHERE id = p_user_id;
END;
$$;

-- 3. ai_goal_packages cache table
CREATE TABLE IF NOT EXISTS public.ai_goal_packages (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Original text for display / audit
  goal_text             text NOT NULL,
  -- Normalized (lowercased, stop-words stripped, sorted) for semantic dedup
  goal_text_normalized  text NOT NULL,
  -- Full AIGoalPackage JSON — see lib/ai/goalGeneration.ts type
  package_json          jsonb NOT NULL,
  -- Only confirmed+activated packages are served as cache hits
  confirmed             boolean NOT NULL DEFAULT false,
  created_at            timestamptz NOT NULL DEFAULT now()
);

-- Unique per user + normalized text so upsert on confirm works cleanly
CREATE UNIQUE INDEX IF NOT EXISTS ai_goal_packages_norm_user_uidx
  ON public.ai_goal_packages (goal_text_normalized, user_id);

-- Fast lookup index for cache checks
CREATE INDEX IF NOT EXISTS ai_goal_packages_norm_idx
  ON public.ai_goal_packages (goal_text_normalized)
  WHERE confirmed = true;

-- RLS
ALTER TABLE public.ai_goal_packages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_packages_select" ON public.ai_goal_packages
  FOR SELECT USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "ai_packages_insert" ON public.ai_goal_packages
  FOR INSERT WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "ai_packages_update" ON public.ai_goal_packages
  FOR UPDATE USING ((SELECT auth.uid()) = user_id);
