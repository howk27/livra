-- APPLIED 2026-08-08 via execute_sql on jhsxeibhxrvqrgkadyfk, and READ BACK
-- from pg_class / pg_proc / pg_trigger before this header was written:
--   legacy_tables_left = 0, free_counter_fns_left = 0,
--   free_counter_triggers_left = 0, triggers_on_marks = 3 (the timestamp
--   triggers, untouched), active_marks = 40 (unchanged).
--
-- NEVER run `supabase db push` on this project: the remote migration history is
-- empty because every migration here was applied by hand, so a push replays all
-- of them onto production.
--
-- ── What this removes and why ────────────────────────────────────────────────
--
-- Nine tables from the pre-`marks` vocabulary (`counters` and its three
-- children, the five `lc_*` tables). ALL NINE HELD 0 ROWS, re-asserted inside
-- the same transaction as the drops by a DO block that raises and aborts the
-- whole thing if any table is non-empty -- a count taken minutes earlier is not
-- proof at the moment of the drop.
--
-- Dropped WITHOUT cascade, children before parents, so that anything unexpected
-- still referencing them raises instead of being silently taken along. Checked
-- first: zero inbound foreign keys from any kept table, zero views. The only
-- references were inside the doomed set (counters <- counter_badges/events/
-- streaks; lc_counters <- lc_badges/events/streaks).
--
-- ── The trigger had to go FIRST, and it was not merely dead ──────────────────
--
-- `trg_enforce_free_counter_limit_update` on public.marks called
-- `enforce_free_counter_limit_on_update()`, which counted `public.counters`.
-- Dropping the table without the trigger would make every un-archive of a mark
-- fail on a missing relation.
--
-- It was also WRONG, not just inert. It raised at `active_count >= 3`, while the
-- documented and RLS-enforced free tier is 2 goals / 4 marks per goal / 6 per
-- account. Two enforcement layers disagreed about the number AND the table; the
-- only reason no user ever hit the stricter one is that `counters` was empty.
-- It fired on every deleted -> active transition to count nothing.
--
-- The RLS policy "Free tier: max 4 marks per goal and 6 total" (WITH CHECK,
-- calls livra_is_pro) survives and is now the single layer. Verified present
-- after the drops.

do $$
declare n bigint; t text;
begin
  foreach t in array array[
    'counters','counter_events','counter_streaks','counter_badges',
    'lc_counters','lc_events','lc_streaks','lc_badges','lc_meta'
  ] loop
    execute format('select count(*) from public.%I', t) into n;
    if n <> 0 then
      raise exception 'ABORT: public.% holds % rows - not empty, nothing dropped', t, n;
    end if;
  end loop;
end $$;

drop trigger if exists trg_enforce_free_counter_limit_update on public.marks;
drop function if exists public.enforce_free_counter_limit_on_update();

drop table public.counter_badges;
drop table public.counter_events;
drop table public.counter_streaks;
drop table public.counters;
drop table public.lc_badges;
drop table public.lc_events;
drop table public.lc_streaks;
drop table public.lc_counters;
drop table public.lc_meta;
