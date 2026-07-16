-- QC2-G (2026-07-14) — Raise the free-tier per-goal mark cap 3 → 5
-- STATUS: APPLIED 2026-07-15 (founder). The 5-cap policy is live; free users
--   can link up to 5 marks per goal.
--
-- Founder decision (QC2 intake): "the free marks-per-goal cap should be raised
-- in order to actually help people." Client source of truth: lib/gating.ts
-- FREE_MARKS_PER_GOAL = 5. This migration keeps the server backstop in sync.
--
-- Reuses the existing helper functions from
-- 20260613_quantity_caps_marks_goals.sql (livra_is_pro,
-- livra_count_other_marks_for_goal) — only the policy threshold changes.

-- ── marks: cap goal-linked marks at 5 per goal for non-Pro ───────────────────
-- RESTRICTIVE so it is AND-ed with the permissive "Users manage own marks"
-- policy. Unlinked marks (goal_id IS NULL) remain uncapped here (client-side).
DROP POLICY IF EXISTS "Free tier: max 3 marks per goal" ON public.marks;
DROP POLICY IF EXISTS "Free tier: max 5 marks per goal" ON public.marks;
CREATE POLICY "Free tier: max 5 marks per goal"
  ON public.marks
  AS RESTRICTIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (
    goal_id IS NULL
    OR public.livra_is_pro(auth.uid())
    OR public.livra_count_other_marks_for_goal(auth.uid(), goal_id, id) < 5
  );
