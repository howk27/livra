-- Migration: create goal_notes table (QC3-D — goal-level MULTI-ENTRY journal)
-- STATUS: NOT YET APPLIED — founder must apply at the deploy gate
--   (`npx supabase db push`, or run this in the Supabase SQL editor).
--   Do NOT mark APPLIED until verified live.
--
-- Unlike mark_notes (one row per mark/date), a goal may have MANY journal
-- entries per day. The entry's IDENTITY is a client-generated UUID (the primary
-- key) — there is deliberately NO UNIQUE(goal_id, local_date, user_id). The
-- client sets `id` at creation so an offline entry reconciles to the same row on
-- sync (id-based, never natural-key upsert).
--
-- RLS — who-can-do-what (single FOR ALL policy):
--   * SELECT — only rows where auth.uid() = user_id (a user reads only their own journal).
--   * INSERT — only with user_id = auth.uid() (WITH CHECK; cannot write another user's row).
--   * UPDATE — only own rows, and the new row must still satisfy user_id = auth.uid().
--   * DELETE — only own rows.
--   Service role is NOT involved. anon has no access (no policy grants it).
--   Deleting a goal (or a user) cascades its journal via the FK ON DELETE CASCADE.

CREATE TABLE IF NOT EXISTS public.goal_notes (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),  -- client-generated; the entry's identity
  goal_id     UUID        NOT NULL REFERENCES public.goals (id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  local_date  DATE        NOT NULL,                                -- author's local day, for UI day-grouping (NOT unique)
  text        TEXT        NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
  -- NO UNIQUE(goal_id, local_date, user_id): a goal may have many entries per day.
);

-- ── Row Level Security ────────────────────────────────────────────────────────
ALTER TABLE public.goal_notes ENABLE ROW LEVEL SECURITY;

-- Users may read, insert, update, and delete only their own rows.
CREATE POLICY "Users manage own goal notes"
  ON public.goal_notes
  FOR ALL
  USING      (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── Indexes ───────────────────────────────────────────────────────────────────
-- Fast look-up by user (used in the loadGoalNotes fetch).
CREATE INDEX IF NOT EXISTS idx_goal_notes_user
  ON public.goal_notes (user_id);

-- Fast newest-first look-up by goal (goal-detail preview + full journal).
CREATE INDEX IF NOT EXISTS idx_goal_notes_goal_created
  ON public.goal_notes (goal_id, created_at DESC);

-- ── Auto-update updated_at ────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS moddatetime SCHEMA extensions;

CREATE OR REPLACE TRIGGER handle_goal_notes_updated_at
  BEFORE UPDATE ON public.goal_notes
  FOR EACH ROW
  EXECUTE PROCEDURE moddatetime (updated_at);
