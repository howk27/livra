-- Repair (2026-07-20) — restore the repo's upsert-safe goals cap policy
-- STATUS: NOT YET APPLIED — founder to run in the Supabase SQL editor (Livra's
--   project is not reachable from the orchestrator's Supabase MCP account).
--
-- WHY: device report — "new row violates row-level security policy '3 goals max'"
-- during ordinary use. That policy name exists NOWHERE in the repo: the live DB
-- drifted from the code (a hand-added "3 goals max" RESTRICTIVE INSERT policy on
-- public.goals). It is NOT upsert-safe — it counts the row being written — so the
-- client's `upsert(..., { onConflict: 'id' })` re-push of an EXISTING goal
-- (hooks sync / pushGoals) counts that goal against itself and trips the cap.
-- The error surfaces raw because pushGoals re-throws (the sync caller owns cap
-- handling), instead of the clean GoalLimitError paywall.
--
-- The canonical rule (20260613_quantity_caps_marks_goals.sql, and lib/gating.ts
-- FREE_GOAL_LIMIT = 2) is "Free tier: max 2 active goals", written upsert-safe via
-- `id <> p_id` in livra_count_other_active_goals so re-syncing an owned goal never
-- counts itself. Founder call 2026-07-20: keep the free cap at 2; no duplicate
-- goal records were observed, so this policy repair is the whole fix (no client
-- dedup change).
--
-- This migration is idempotent: re-asserts the helpers, removes ANY drifted
-- RESTRICTIVE policy on public.goals (the stray "3 goals max", whatever its exact
-- name — the permissive "Users manage own goals" ownership policy is untouched),
-- and (re)creates the one canonical cap.

-- 1) Canonical helpers (verbatim from 20260613) ──────────────────────────────
CREATE OR REPLACE FUNCTION public.livra_is_pro(p_user uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE((SELECT pro_unlocked FROM public.profiles WHERE id = p_user), false);
$$;

CREATE OR REPLACE FUNCTION public.livra_count_other_active_goals(p_user uuid, p_id uuid)
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT count(*)::int
  FROM public.goals
  WHERE user_id = p_user
    AND status NOT IN ('completed', 'expired')
    AND id <> p_id;   -- self-exclusion = upsert-safe
$$;

GRANT EXECUTE ON FUNCTION public.livra_is_pro(uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.livra_count_other_active_goals(uuid, uuid) TO authenticated, anon;

-- 2) Drop any drifted RESTRICTIVE policy on goals that isn't the canonical one ─
-- Restrictive policies on goals should only ever be the cap; the ownership policy
-- ("Users manage own goals") is PERMISSIVE and is not matched here.
DO $$
DECLARE pol record;
BEGIN
  FOR pol IN
    SELECT polname FROM pg_policy
    WHERE polrelid = 'public.goals'::regclass
      AND polpermissive = false
      AND polname <> 'Free tier: max 2 active goals'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.goals', pol.polname);
  END LOOP;
END $$;

-- 3) (Re)create the single canonical upsert-safe cap ──────────────────────────
DROP POLICY IF EXISTS "Free tier: max 2 active goals" ON public.goals;
CREATE POLICY "Free tier: max 2 active goals"
  ON public.goals
  AS RESTRICTIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.livra_is_pro(auth.uid())
    OR status IN ('completed', 'expired')
    OR public.livra_count_other_active_goals(auth.uid(), id) < 2
  );

-- 4) Verify (optional — run the SELECT after applying): exactly one restrictive
--    INSERT policy named 'Free tier: max 2 active goals' should remain.
-- SELECT polname, polpermissive, polcmd,
--        pg_get_expr(polwithcheck, polrelid)
-- FROM pg_policy WHERE polrelid = 'public.goals'::regclass ORDER BY polname;
