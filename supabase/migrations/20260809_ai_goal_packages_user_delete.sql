-- APPLIED 2026-08-09 via execute_sql on jhsxeibhxrvqrgkadyfk, and READ BACK from
-- pg_policy before this header was written: ai_goal_packages now carries four
-- policies — ai_packages_delete [d] USING ((SELECT auth.uid()) = user_id),
-- alongside the pre-existing insert [a] / select [r] / update [w].
--
-- NEVER run `supabase db push` on this project: the remote migration history is
-- empty because every migration was applied by hand, so a push replays all of
-- them onto production.
--
-- ── Why ─────────────────────────────────────────────────────────────────────
--
-- public.ai_goal_packages retains the goal text a user typed, verbatim, plus a
-- normalized copy and the generated plan. It had INSERT / SELECT / UPDATE
-- policies and no DELETE, so a user could not erase their own saved goal text.
-- Account deletion removed it (the FK to auth.users is ON DELETE CASCADE,
-- confdeltype 'c', verified live) but there was no way to remove ONE draft short
-- of deleting the whole account, and the privacy policy had to route people to a
-- support email backed by a manual service-role operation.
--
-- Founder decision 2026-08-09: build the real control. This policy is the server
-- half; the client half is deleteSavedAiDrafts() and the Settings action.
--
-- ── This is a DELIBERATE EXCEPTION TO D-8 ───────────────────────────────────
--
-- D-8 forbids hard deletes: every mutation in lib/data/mutations tombstones via
-- deleted_at, and nothing in the app issues a .delete(). That rule exists to stop
-- user history being destroyed by accident.
--
-- Here the rule inverts. The user is asking for their text to be GONE, and a
-- tombstone leaves goal_text sitting in the row — it would satisfy the letter of
-- D-8 while defeating the entire purpose of an erasure control, and would make
-- the privacy policy's deletion sentence a lie. So this is a real DELETE, chosen
-- knowingly rather than by forgetting the convention.
--
-- Scope is narrow on purpose: this table only. It is a CACHE — dropping a row
-- costs the user nothing but a second model call if they ask for the same goal
-- again, and it holds no history any other feature reads. No other table gets a
-- DELETE policy from this change.

create policy ai_packages_delete
  on public.ai_goal_packages
  for delete
  using ((select auth.uid()) = user_id);
