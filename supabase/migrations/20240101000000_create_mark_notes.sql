-- Migration: create mark_notes table
-- Run this in your Supabase SQL editor or via the Supabase CLI.
--
-- Table stores one note per (user_id, mark_id, date) tuple.
-- RLS ensures users can only access their own notes.

CREATE TABLE IF NOT EXISTS public.mark_notes (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  mark_id     UUID        NOT NULL,
  user_id     UUID        NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  date        DATE        NOT NULL,
  text        TEXT        NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- One note per mark per day per user
  UNIQUE (mark_id, date, user_id)
);

-- ── Row Level Security ────────────────────────────────────────────────────────
ALTER TABLE public.mark_notes ENABLE ROW LEVEL SECURITY;

-- Users may read, insert, update, and delete only their own rows
CREATE POLICY "Users manage own notes"
  ON public.mark_notes
  FOR ALL
  USING      (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── Indexes ───────────────────────────────────────────────────────────────────
-- Fast look-up by user (used in loadFeatures fetch)
CREATE INDEX IF NOT EXISTS idx_mark_notes_user
  ON public.mark_notes (user_id);

-- Fast look-up by mark + date (used in activity log expansion)
CREATE INDEX IF NOT EXISTS idx_mark_notes_mark_date
  ON public.mark_notes (mark_id, date);

-- ── Auto-update updated_at ────────────────────────────────────────────────────
-- Requires the moddatetime extension (enabled by default in Supabase).
CREATE EXTENSION IF NOT EXISTS moddatetime SCHEMA extensions;

CREATE OR REPLACE TRIGGER handle_mark_notes_updated_at
  BEFORE UPDATE ON public.mark_notes
  FOR EACH ROW
  EXECUTE PROCEDURE moddatetime (updated_at);
