-- Migration: mark_notes WITH CHECK must also prove the MARK is yours
-- STATUS: APPLIED 2026-07-27 (founder, by hand).
--
-- ⚠️ PROVENANCE: FOUNDER-REPORTED, NOT READ BACK. Stated plainly because this
--   repo has been burned by headers that claimed more than they had. The founder
--   confirmed running it; nobody has read pg_policies back.
--
--   The instruments that served elsewhere today do NOT reach this. The Supabase
--   MCP still cannot see jhsxeibhxrvqrgkadyfk (re-checked 2026-07-27), and the
--   anon REST probe cannot help either: it answers `200 []` for mark_notes both
--   before and after this change, because a WITH CHECK constrains WRITES by an
--   AUTHENTICATED user and anon never gets that far. Confirming the deploy of
--   ai-goal-generation was possible (`supabase functions list` reports a version
--   number); confirming a policy shape is not.
--
--   TO CLOSE THIS PROPERLY, run the one query in the VERIFY block below and
--   paste the with_check back here. It is one line and needs no setup.
--
-- WHAT IS WRONG — the same defect goal_notes was fixed for in
-- 20260727_goal_notes_goal_ownership.sql, found by asking whether that table was
-- the only one of its family. It was not.
--
--   The FOR ALL policy proves the ROW is yours ((select auth.uid()) = user_id)
--   but never proves the MARK is. So a crafted mark_id files a note against
--   someone else's mark, or against a mark that is not yours to annotate.
--
-- It is not a confidentiality bug, for the same reason it was not one on
-- goal_notes: SELECT stays user-scoped, so the owner of the referenced mark
-- cannot read the row and the author only ever reads their own. What it creates
-- is a dangling cross-reference — a note filed under a mark its author does not
-- own, which the activity log will count and display against a mark they cannot
-- see.
--
-- ⚠️ mark_notes IS WEAKER THAN goal_notes WAS, IN A SECOND WAY THIS MIGRATION
-- DELIBERATELY DOES NOT FIX. goal_notes.goal_id has always carried
-- `REFERENCES public.goals (id) ON DELETE CASCADE`, so its dangling rows could
-- at least only point at goals that EXIST. mark_notes.mark_id is a bare
-- `UUID NOT NULL` with no REFERENCES at all (20240101000000_create_mark_notes.sql
-- line 10), so it can also point at nothing whatsoever, and a hard-deleted mark
-- orphans its notes server-side forever.
--
-- Adding that FK is a SEPARATE decision and a separate migration, because
-- `ALTER TABLE ... ADD CONSTRAINT` FAILS OUTRIGHT if even one dangling row
-- exists — which is a data question, not a policy question, and this project
-- does not write to cadence-or-notes data on an assumption. Run the dangling
-- query at the bottom first; if it returns 0, the FK becomes safe and cheap.
-- This migration closes the WRITE path either way, so no NEW dangling row can
-- be created after it lands.
--
-- WHO CAN DO WHAT, after this change (the enumeration the supabase playbook asks
-- for before writing any policy):
--   * SELECT — unchanged: only rows where auth.uid() = user_id.
--   * INSERT — own rows only, AND mark_id must name a mark you own.
--   * UPDATE — own rows only, and the result must still satisfy both.
--   * DELETE — unchanged: own rows only. USING has no mark clause DELIBERATELY,
--     so a user can always delete a note they somehow already own, including any
--     dangling row written before this migration. Same call as goal_notes.
--   * anon — no access. Service role — not involved.
--
-- WHY THE SUBQUERY IS SAFE HERE
--   The EXISTS runs under the caller's own RLS on public.marks, whose policy is
--   user-scoped, so a mark the caller does not own is invisible to it, the
--   EXISTS is false, and the write is refused — exactly the intent. No
--   SECURITY DEFINER needed.
--
--   Soft-deleted marks are deliberately NOT excluded: `deleted_at` is not
--   consulted, because editing or removing a note on a mark you have since
--   deleted is legitimate and must keep working.
--
-- ⚠️ THE `(select auth.uid())` FORM IS LOAD-BEARING — DO NOT SIMPLIFY IT TO A
-- BARE auth.uid(). 20260610_fix_rls_performance.sql wrapped it so Postgres
-- evaluates it ONCE per query as an InitPlan instead of once per row. mark_notes
-- holds one row per mark per day, so it is among the tables that most needs it.
-- (goal_notes never had this form — it was created in 20260715, after that
-- migration — which is why its fix could use the bare call and this one cannot.)
--
-- EXISTING ROWS ARE NOT TOUCHED. WITH CHECK constrains writes, never reads.
--
-- DO NOT run `supabase db push` on this project — remote schema_migrations is
-- empty for every migration, so a push replays all of them onto production.

DROP POLICY IF EXISTS "Users manage own notes" ON public.mark_notes;

CREATE POLICY "Users manage own notes"
  ON public.mark_notes
  FOR ALL
  USING ((select auth.uid()) = user_id)
  WITH CHECK (
    (select auth.uid()) = user_id
    AND EXISTS (
      SELECT 1
        FROM public.marks m
       WHERE m.id = mark_notes.mark_id
         AND m.user_id = (select auth.uid())
    )
  );

-- ─── VERIFY (read this back before marking the header APPLIED) ───────────────
--
-- Expected: exactly ONE policy on mark_notes, named "Users manage own notes",
-- whose with_check carries the EXISTS over marks and whose USING is still the
-- bare owner check.
--
-- select policyname, cmd, qual, with_check
--   from pg_policies
--  where schemaname = 'public' and tablename = 'mark_notes';
--
-- ─── THE SEPARATE FK QUESTION — run this before deciding ─────────────────────
--
-- Dangling notes: rows whose mark_id names no mark of the same owner. Expected 0
-- on a healthy database. If it returns 0, adding
--   ALTER TABLE public.mark_notes
--     ADD CONSTRAINT mark_notes_mark_id_fkey
--     FOREIGN KEY (mark_id) REFERENCES public.marks (id) ON DELETE CASCADE;
-- becomes safe, and closes the orphan path for good. If it returns rows, decide
-- what they are BEFORE deleting anything — they are somebody's journal entries.
--
-- select n.id, n.mark_id, n.user_id, n.date
--   from public.mark_notes n
--   left join public.marks m on m.id = n.mark_id and m.user_id = n.user_id
--  where m.id is null;
