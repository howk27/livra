-- APPLIED 2026-08-09 via execute_sql on jhsxeibhxrvqrgkadyfk, RETURNING read
-- back and then re-queried: every non-null Steps row now reads 5/7/7,
-- weekly_target 7, variable — 2 rows, one grouping, no stragglers.
--
-- NEVER run `supabase db push` on this project: the remote migration history is
-- empty because every migration was applied by hand, so a push replays all of
-- them onto production.
--
-- ── What this fixes ─────────────────────────────────────────────────────────
--
-- MARK_LIBRARY ships Steps at frequency 5/7/7 (variable). Two production rows
-- predating the current library still carried 1/3/7 with weekly_target 3, so
-- those users' Steps mark asked for 3 days a week where a newly created one
-- asks 7. The library is copied onto a mark AT CREATION and never re-read, which
-- is the same asymmetry Water and Calories had before the 2026-07-27 backfill.
--
-- ── Why this is not overwriting anyone's choice ─────────────────────────────
--
-- On BOTH rows weekly_target (3) equalled frequency_recommended (3) — the
-- untouched default position. A user who had moved the Pace dial would show a
-- weekly_target that differs from recommended, so `weekly_target =
-- frequency_recommended` is in the WHERE clause: the statement is structurally
-- incapable of flattening a deliberate Pace choice. It is also idempotent —
-- re-running it matches nothing, because 5/7/7 no longer satisfies the 1/3/7
-- predicate.
--
-- ── Rollback ────────────────────────────────────────────────────────────────
--
-- No snapshot table: the prior state was two rows with identical values, and a
-- table left behind to hold them is the clutter the 2026-08-08 sweep just
-- removed. The exact before-state, for reconstruction:
--
--   3e84029c-4ee2-4b1f-a395-16ac648a7ca1  user 75c1a14a-944e-45c5-9fe2-47a0e77d60ae
--   96fe3a28-65e6-4e13-9c29-1b14fc4c546c  user 31beae8d-9175-402b-8e37-2087f76a0da7
--   both: frequency_min 1, frequency_recommended 3, frequency_max 7,
--         weekly_target 3, frequency_kind 'variable'
--
-- ── Scope note ──────────────────────────────────────────────────────────────
--
-- Steps stays `variable`, deliberately. The 2026-07-27 cadence rule (a whole-day
-- STATE is every-day and must never be an intensity dial; a discrete SESSION may
-- vary) was applied to Steps and it was weighed and LEFT variable: the library
-- describes it as "days you reach the step target you set", which is an
-- achievement you hit or miss, not a number the day passively produces. Founder
-- closed this as decided 2026-08-09. This migration aligns the RANGE only; it
-- does not reopen the kind.
--
-- The two remaining Steps rows carry NULL cadence and are deliberately NOT
-- touched here — lib/markCadence.ts resolves those from the library at read
-- time, which also covers marks an old client may still sync up.

update public.marks
set frequency_min = 5,
    frequency_recommended = 7,
    frequency_max = 7,
    weekly_target = 7,
    updated_at = now()
where deleted_at is null
  and lower(trim(name)) = 'steps'
  and frequency_kind = 'variable'
  and frequency_min = 1
  and frequency_recommended = 3
  and frequency_max = 7
  and weekly_target = frequency_recommended;
