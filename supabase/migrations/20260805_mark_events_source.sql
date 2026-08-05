-- STATUS: NOT YET APPLIED to production (jhsxeibhxrvqrgkadyfk).
-- Apply by hand or via MCP execute_sql — NEVER `supabase db push` (see PROJECT-CONTEXT.md).
-- After applying, read information_schema back and rewrite this header to APPLIED with the date.
--
-- Health auto-sync attribution (spec: docs/superpowers/specs/2026-08-05-health-auto-sync-design.md §2.5).
-- NULL = manual check-in (every existing row); 'health' = written by the auto-sync engine.
-- Nullable text, no default, no backfill: attribution is forward-only like the feature itself.
-- Client code ships before this column exists — the push degrades per-column
-- (missingOptionalColumnFromError), so a column-less server loses only attribution, never the event.

ALTER TABLE public.mark_events ADD COLUMN IF NOT EXISTS source text;

COMMENT ON COLUMN public.mark_events.source IS
  'Check-in origin: NULL = manual tap, ''health'' = Apple Health auto-sync (2026-08-05).';
