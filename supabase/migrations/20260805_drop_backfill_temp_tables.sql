-- STATUS: APPLIED to production (jhsxeibhxrvqrgkadyfk) 2026-08-05, and VERIFIED
-- by reading information_schema back — not taken on report. Both table names
-- return zero rows from information_schema.tables after the drop.
--
-- WHY THIS EXISTS: schema hygiene before the 2.0 submission.
--
-- Two rollback snapshots outlived the backfills they insured:
--   marks_cadence_backfill_20260727   (7 rows)  — snapshot taken before the
--     2026-07-27 cadence backfill, which has been verified in production and
--     ridden by every build since.
--   marks_goal_id_snapshot_20260728  (46 rows)  — snapshot taken before the
--     goal_mark_links backfill (20260728_goal_mark_links_backfill.sql).
--
-- Both were RLS-enabled with NO policy, so they were unreadable rather than
-- leaking — but they were permanent schema carrying real user rows, and they
-- would have shipped as such in the 2.0 review submission.
--
-- The goal_id snapshot is additionally moot as of today's free-tier ruling:
-- marks.goal_id is legacy by design (lib/data/mutations/marks.ts:5) and links
-- are the truth, so there is no future in which we roll that backfill back.
--
-- Row counts above were read live immediately before the drop.

drop table if exists public.marks_cadence_backfill_20260727;
drop table if exists public.marks_goal_id_snapshot_20260728;
