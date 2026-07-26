-- Migration: goal_notes WITH CHECK must also prove the GOAL is yours
-- STATUS: NOT YET APPLIED. Apply by hand in the SQL editor, like every other
--   migration on this project (`supabase db push` is banned here — the remote
--   schema_migrations history is empty, so a push would replay all 20+).
--   Rewrite this header only after re-reading the live policy, not on intent:
--   the 2026-07-22 drift finding proved these headers lie.
--
-- WHAT IS WRONG (QC3 milestone security note, low severity, no leak)
--   The FOR ALL policy proves the ROW is yours (user_id = auth.uid()) but never
--   proves the GOAL is. So a crafted goal_id inserts a journal entry pointing at
--   someone else's goal — or at a goal that is not yours to annotate.
--
--   It is not a confidentiality bug and never was: SELECT stays user-scoped, so
--   the owner of the referenced goal cannot read the row, and the author can
--   only ever read their own. What it creates is a dangling cross-reference —
--   an entry filed under a goal its author does not own, which the journal will
--   happily count and display against a goal they cannot see.
--
-- WHO CAN DO WHAT, after this change (the enumeration the supabase playbook asks
-- for before writing any policy):
--   * SELECT — unchanged: only rows where auth.uid() = user_id.
--   * INSERT — own rows only, AND goal_id must name a goal you own.
--   * UPDATE — own rows only, and the result must still satisfy both.
--   * DELETE — unchanged: own rows only (USING has no goal clause deliberately,
--     so a user can always delete an entry they somehow already own, including
--     any dangling row written before this migration).
--   * anon — no access. Service role — not involved.
--
-- WHY THE SUBQUERY IS SAFE HERE
--   The EXISTS runs under the caller's own RLS on public.goals, whose policy is
--   `auth.uid() = user_id` (20260602_goals_with_mark_links.sql). A goal the
--   caller does not own is invisible to it, so the EXISTS is false and the write
--   is refused — which is exactly the intent. No SECURITY DEFINER needed.
--
-- EXISTING ROWS ARE NOT TOUCHED. WITH CHECK constrains writes, never reads, so
-- any dangling row already present stays readable and deletable by its author.
-- Find them first if you want to clean up:
--
--   SELECT n.id, n.goal_id, n.user_id
--     FROM public.goal_notes n
--     LEFT JOIN public.goals g ON g.id = n.goal_id AND g.user_id = n.user_id
--    WHERE g.id IS NULL;

DROP POLICY IF EXISTS "Users manage own goal notes" ON public.goal_notes;

CREATE POLICY "Users manage own goal notes"
  ON public.goal_notes
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1
        FROM public.goals g
       WHERE g.id = goal_notes.goal_id
         AND g.user_id = auth.uid()
    )
  );
