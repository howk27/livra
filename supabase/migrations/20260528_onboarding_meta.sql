-- Add onboarding metadata columns to profiles table.
-- STATUS: APPLIED 2026-06-14 — verified live: profiles.onboarding_focus_area
--   and profiles.onboarding_completed_at present.
-- onboarding_completed already exists; these two are new.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onboarding_focus_area text,
  ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz;
