-- Phase 6 Task 3 — Server-side free-tier quantity caps (defense-in-depth)
-- STATUS: NOT APPLIED — run via: supabase db push (user runs after all Phase 6 migrations written)
--
-- Audit finding (AUDIT_LOG.md, Phase 6): the goal cap (2 active) and per-goal mark
-- cap (3) are enforced ONLY in client code (lib/gating.ts). A direct PostgREST
-- insert with a valid JWT bypasses them. Client gating stays as the primary UX;
-- these RLS policies are the server backstop for non-Pro users.
--
-- Prerequisites:
--   * public.profiles (pro_unlocked boolean)            — 20250211100000_core_livra_sync_schema.sql
--   * public.counters→marks (id uuid, goal_id text)     — rename + 20260609_goal_id_on_marks.sql
--   * public.goals (id uuid, status text)               — 20260602_goals_with_mark_links.sql
--
-- IMPORTANT: goals only began syncing to Supabase alongside this change. Until the
-- client goal-sync path is live, the goals policy is effectively dormant (no client
-- inserts goals). It is written now so the cap is enforced the moment goals sync.

-- ── Free-tier limits (keep in sync with lib/gating.ts) ───────────────────────
--   FREE_GOAL_LIMIT      = 2  (active = status NOT IN ('completed','expired'))
--   FREE_MARKS_PER_GOAL  = 3  (goal-linked marks only; unlinked handled in Task 4 / client)

-- ── Helper functions ─────────────────────────────────────────────────────────
-- All SECURITY DEFINER + fixed search_path so the count subqueries run with RLS
-- bypassed (owner context). This is required: an RLS policy expression that reads
-- the SAME table it guards would otherwise recurse / be filtered by its own policy.
-- service_role already bypasses RLS, so Edge Functions are unaffected either way.

CREATE OR REPLACE FUNCTION public.livra_is_pro(p_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT pro_unlocked FROM public.profiles WHERE id = p_user), false);
$$;

-- Active (non-deleted) marks linked to a goal, EXCLUDING a specific mark id.
-- Excluding self makes the cap upsert-safe: re-pushing an existing mark (which is
-- already one of the 3) counts the OTHER marks, so it is never falsely blocked.
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

-- Active goals (status NOT IN completed/expired), EXCLUDING a specific goal id.
CREATE OR REPLACE FUNCTION public.livra_count_other_active_goals(
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
  FROM public.goals
  WHERE user_id = p_user
    AND status NOT IN ('completed', 'expired')
    AND id <> p_id;
$$;

GRANT EXECUTE ON FUNCTION public.livra_is_pro(uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.livra_count_other_marks_for_goal(uuid, text, uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.livra_count_other_active_goals(uuid, uuid) TO authenticated, anon;

-- ── marks: cap goal-linked marks at 3 per goal for non-Pro ───────────────────
-- RESTRICTIVE so it is AND-ed with the permissive "Users manage own marks" FOR ALL
-- policy (a second PERMISSIVE policy would be OR-ed in and defeat the cap).
-- Unlinked marks (goal_id IS NULL) are not capped here — handled client-side in Task 4.
DROP POLICY IF EXISTS "Free tier: max 3 marks per goal" ON public.marks;
CREATE POLICY "Free tier: max 3 marks per goal"
  ON public.marks
  AS RESTRICTIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (
    goal_id IS NULL
    OR public.livra_is_pro(auth.uid())
    OR public.livra_count_other_marks_for_goal(auth.uid(), goal_id, id) < 3
  );

-- ── goals: cap active goals at 2 for non-Pro ─────────────────────────────────
-- Only active (non-completed/non-expired) goals count toward the cap; completing or
-- expiring a goal never trips it. RESTRICTIVE for the same OR-vs-AND reason as marks.
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
