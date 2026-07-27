-- STATUS: APPLIED 2026-07-27 (founder, by hand).
--
-- ⚠️ PROVENANCE, STATED PLAINLY BECAUSE THIS PROJECT HAS BEEN BURNED BY HEADERS
-- THAT OVERSTATED THEMSELVES. This header was reconciled on 2026-07-27, AFTER
-- the fact, on two pieces of evidence:
--   1. the founder confirmed running STEP 2 when asked directly;
--   2. the 2026-07-27 session handoff records STEP 3's output — "all four
--      policies confirmed surviving" — which only exists if STEP 2 ran.
-- What did NOT happen: no orchestrator read pg_proc/pg_trigger back itself. The
-- Supabase MCP cannot reach jhsxeibhxrvqrgkadyfk, and a trigger is invisible to
-- the anon REST probe that serves for tables. If you want this closed to the
-- standard the rest of this repo holds, re-run STEP 3 and say so here.
--
-- The header sat at NOT YET APPLIED for a full session while state.json
-- described the drop as done. Reconciled rather than left to rot, because the
-- next person to read this file would have had to re-derive the contradiction.
--
-- WHY: the free tier is enforced TWICE and the two layers disagree about both
-- the number and the table.
--
--   enforce_free_counter_limit   BEFORE INSERT trigger, raises at 3 rows,
--                                counts public.counters
--   RLS on public.marks/goals    2 goals / 4 marks per goal / 6 per account
--
-- Founder decision 2026-07-27: THE RLS NUMBERS ARE THE REAL FREE TIER. They are
-- what the paywall copy promises (lib/gating.ts FREE_GOAL_LIMIT = 2,
-- FREE_MARKS_PER_GOAL = 4, FREE_MARK_CEILING = 6), they count public.marks —
-- the table the client actually writes — and public.counters is vestigial: the
-- app has not written to it since 20260602_rename_counters_to_marks.sql.
--
-- One layer is deleted rather than reconciled, because two layers that agree
-- today are two layers that can disagree tomorrow, and this pair already did.
--
-- WHY IT WAS INVISIBLE FOR SO LONG: both layers short-circuit for a Pro account,
-- and every account that has ever tested this app is Pro. On a public launch,
-- free users are the majority and they meet the stricter layer on day one — and
-- 3 is not a number any copy in the app mentions. The same stale 3 was found
-- hardcoded in the sync failure message this session (fixed, 05ff651).
--
-- DO NOT run `supabase db push` on this project — remote schema_migrations is
-- empty for every migration, so a push replays all of them onto production.

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 1 — READ FIRST. Which tables actually carry this trigger?
--
-- The trigger appears in NO migration in this repo, so its attachment is only
-- knowable from production. Run this and keep the output: it is the only record
-- of what STEP 2 removes, and the restore block at the bottom cannot be written
-- correctly without it.
-- ─────────────────────────────────────────────────────────────────────────────

select
  t.tgname                  as trigger_name,
  n.nspname                 as schema,
  c.relname                 as on_table,
  t.tgenabled               as enabled,   -- O = enabled, D = disabled
  pg_get_triggerdef(t.oid)  as definition
from pg_trigger t
join pg_class c     on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
join pg_proc p      on p.oid = t.tgfoid
where not t.tgisinternal
  and p.proname = 'enforce_free_counter_limit';

-- Also worth having in the same output: the full body being retired.
select pg_get_functiondef(p.oid) as function_body
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'enforce_free_counter_limit';

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 2 — DROP IT. Only after STEP 1's output is saved.
--
-- `drop function ... cascade` removes the function AND every trigger bound to
-- it in one statement, which is what we want here precisely BECAUSE the set of
-- bound triggers is not knowable from this repo. cascade is normally a thing to
-- distrust; here it is the only formulation that cannot miss one.
--
-- The RLS layer is untouched and keeps enforcing 2 / 4 / 6.
-- ─────────────────────────────────────────────────────────────────────────────

drop function if exists public.enforce_free_counter_limit() cascade;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 3 — VERIFY. Expected: both counts 0, and the marks/goals policies still
-- present and unchanged.
-- ─────────────────────────────────────────────────────────────────────────────

select count(*) as function_still_present
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'enforce_free_counter_limit';

select count(*) as triggers_still_present
from pg_trigger t
join pg_proc p on p.oid = t.tgfoid
where not t.tgisinternal and p.proname = 'enforce_free_counter_limit';

-- The layer that MUST survive. If this comes back empty, STOP: the cascade
-- reached further than intended and the free tier is now unenforced server-side.
select tablename, policyname, cmd
from pg_policies
where schemaname = 'public' and tablename in ('marks', 'goals')
order by tablename, policyname;

-- ─────────────────────────────────────────────────────────────────────────────
-- SEPARATE QUESTION, DELIBERATELY NOT ANSWERED HERE: public.counters itself.
--
-- It still exists in production even though 20260602_rename_counters_to_marks.sql
-- is a pure RENAME whose header claims "counters gone" — something re-created
-- it, most likely a by-hand re-run of 20250211100000_core_livra_sync_schema.sql.
-- Once this trigger is gone, nothing reads it at all.
--
-- TWO THINGS CONFIRMED 2026-07-27, which narrow this but do not close it:
--
--   * NO CLIENT READS IT. `.from('counters')` appears ZERO times in the repo.
--     Every one of the ~40 files matching /counters/ is the LOCAL SQLite table
--     name for marks (hooks/useCounters.ts, lib/db/index.ts) — a naming
--     collision that makes this look far more alive in a grep than it is. With
--     the trigger dropped, the server-side reader count is now zero.
--
--   * IT IS STILL ON THE API SURFACE. An anon REST probe of
--     /rest/v1/counters answers HTTP 200 [] — granted to anon, then emptied by
--     RLS. Contrast ai_generation_events, which answers 42501 because its
--     migration revokes the grants outright. So counters is not leaking (RLS
--     returns nothing), but it is a vestigial table PostgREST still publishes,
--     and it will keep showing up in schema introspection and in any future
--     audit as though it mattered.
--
-- STILL UNANSWERED, and still needs SQL: its ROW COUNT. anon cannot see it —
-- [] here means "RLS gave you nothing", not "the table is empty". That number is
-- the whole decision: 0 → drop it in its own migration; > 0 → it holds data
-- nobody has looked at, and that is a conversation before it is a DROP.
--
-- Dropping a table that might hold real rows is NOT something to fold into this
-- migration. Run query 1 of .reports/server-qc-diagnostic-2026-07-26.sql first:
--   • row_count = 0  → vestigial, safe to drop in its own migration, later
--   • row_count > 0  → it holds data nobody has looked at; decide what it is
--                      before deleting anything
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── RESTORE, if STEP 3 comes back wrong ─────────────────────────────────────
-- There is no generic rollback for a dropped function: paste back the
-- `function_body` and the `definition` rows STEP 1 printed. That is why STEP 1
-- is not optional.
