-- Add onboarding metadata columns to profiles table.
-- onboarding_completed already exists; these two are new.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onboarding_focus_area text,
  ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz;
