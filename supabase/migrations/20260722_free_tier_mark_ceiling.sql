-- Free-tier mark caps (2026-07-22) — per-goal 4 AND account-wide ceiling 6
-- STATUS: NOT YET APPLIED — the founder runs this in the Supabase SQL editor.
--   No agent has access to the live database. Until it is applied, the client
--   (lib/gating.ts) is STRICTER than the server, which is the safe direction:
--   the server still runs the June policy "Free tier: max 3 marks per goal".
--
-- FOUNDER DECISION (2026-07-22 product intake), replacing every earlier cap:
--   • active goals            2   (unchanged — public.goals policy, untouched here)
--   • marks per goal          4   (down from the repo's 5; live DB still says 3)
--   • marks per ACCOUNT       6   (new) counting goal-linked AND unlinked marks
--                                 TOGETHER. The separate "daily habit" bucket is
--                                 retired: a standalone habit is a mark.
--   Both apply, whichever binds first. The old effective maximum was 13
--   (2 goals × 5 + 3 habits); free was under-limited on device.
--
-- SUPERSEDES 20260714_raise_marks_per_goal_cap_to_5.sql. That migration's header
-- claims it was applied, but the live database disagrees: production still runs
-- the June "Free tier: max 3 marks per goal" policy (founder-verified 2026-07-22).
-- It must NOT be applied now — 5 is no longer the cap. This file drops that
-- policy by name too, so applying them out of order still lands here.
--
-- UPSERT SAFETY IS THE WHOLE GAME. A cap policy that counts the row being
-- written has broken this project twice (see 20260720_repair_goals_cap_policy.sql):
-- the client re-pushes existing rows with upsert(..., { onConflict: 'id' }), the
-- row counts itself against its own cap, and pushMarks re-throws a raw RLS error.
-- Both counting helpers below take the row's id and exclude it (`id <> p_id`).
--
-- livra_is_pro is called BY NAME and deliberately NOT redefined here: it gained
-- expiry handling in 20260721_iap_subscription_lifecycle.sql, and this file must
-- not clobber that body or its signature (these RESTRICTIVE policies depend on it).
--
-- Prerequisites: public.marks (id uuid, user_id uuid, goal_id text, deleted_at
-- timestamptz), public.profiles, public.livra_is_pro(uuid).

-- ── 1) Counting helpers (SECURITY DEFINER so the subquery is not filtered by ──
-- the very policy it feeds; STABLE + fixed search_path, matching 20260613).

-- Active goal-linked marks for one goal, EXCLUDING the row being written.
CREATE OR REPLACE FUNCTION public.livra_count_other_marks_for_goal(
  p_user uuid,
  p_goal text,
  p_id uuid
)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::int
  FROM public.marks
  WHERE user_id = p_user
    AND goal_id = p_goal
    AND deleted_at IS NULL
    AND id <> p_id;
$$;

-- Every active mark on the account (goal-linked AND unlinked), EXCLUDING the row
-- being written. This is the ceiling's bucket: goal_id is deliberately ignored.
CREATE OR REPLACE FUNCTION public.livra_count_other_active_marks(
  p_user uuid,
  p_id uuid
)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::int
  FROM public.marks
  WHERE user_id = p_user
    AND deleted_at IS NULL
    AND id <> p_id;
$$;

GRANT EXECUTE ON FUNCTION public.livra_count_other_marks_for_goal(uuid, text, uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.livra_count_other_active_marks(uuid, uuid) TO authenticated, anon;

-- ── 2) Remove every drifted/superseded RESTRICTIVE policy on public.marks ─────
-- Named drops first (documentation of what we know exists), then a sweep for any
-- hand-added policy the dashboard picked up. The PERMISSIVE ownership policy
-- ("Users manage own marks") is not restrictive and is never touched.
DROP POLICY IF EXISTS "Free tier: max 3 marks per goal" ON public.marks;
DROP POLICY IF EXISTS "Free tier: max 5 marks per goal" ON public.marks;

DO $$
DECLARE pol record;
BEGIN
  FOR pol IN
    SELECT polname FROM pg_policy
    WHERE polrelid = 'public.marks'::regclass
      AND polpermissive = false
      AND polname <> 'Free tier: max 4 marks per goal and 6 total'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.marks', pol.polname);
  END LOOP;
END $$;

-- ── 3) The one canonical cap ─────────────────────────────────────────────────
-- RESTRICTIVE so it is AND-ed with the permissive ownership policy (a second
-- PERMISSIVE policy would be OR-ed in and defeat the cap).
--
-- Read the WITH CHECK top to bottom:
--   a soft-deleted row (a tombstone being synced) is never capped;
--   Pro is never capped;
--   otherwise the per-goal cap (skipped for unlinked marks) AND the account
--   ceiling (applied to every mark) must both hold.
-- Mirrors lib/gating.ts canAddMarkToGoal + canAddMark exactly.
DROP POLICY IF EXISTS "Free tier: max 4 marks per goal and 6 total" ON public.marks;
CREATE POLICY "Free tier: max 4 marks per goal and 6 total"
  ON public.marks
  AS RESTRICTIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (
    deleted_at IS NOT NULL
    OR public.livra_is_pro(auth.uid())
    OR (
      (
        goal_id IS NULL
        OR public.livra_count_other_marks_for_goal(auth.uid(), goal_id, id) < 4
      )
      AND public.livra_count_other_active_marks(auth.uid(), id) < 6
    )
  );

-- ── 4) Verification (founder: run after applying) ────────────────────────────
-- Expect EXACTLY ONE restrictive row, named
-- 'Free tier: max 4 marks per goal and 6 total', cmd 'a' (INSERT), whose
-- expression contains "< 4" and "< 6". Any other restrictive row on marks is
-- drift and means step 2 did not run.
--
-- SELECT polname,
--        polpermissive,          -- must be false for the cap
--        polcmd,                 -- 'a' = INSERT
--        pg_get_expr(polwithcheck, polrelid) AS with_check
-- FROM pg_policy
-- WHERE polrelid = 'public.marks'::regclass
-- ORDER BY polpermissive, polname;
--
-- And confirm both helpers exist and are callable:
-- SELECT proname, pg_get_function_identity_arguments(oid), prosecdef
-- FROM pg_proc
-- WHERE proname IN ('livra_is_pro',
--                   'livra_count_other_marks_for_goal',
--                   'livra_count_other_active_marks')
-- ORDER BY proname;
