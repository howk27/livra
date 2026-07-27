-- STATUS: NOT YET APPLIED. Apply by hand, then rewrite this header to APPLIED
-- only after reading the verification block at the bottom back from production
-- — not on report. The Supabase MCP still cannot reach jhsxeibhxrvqrgkadyfk.
--
-- ⚠️ THE EDGE FUNCTION MUST BE DEPLOYED IN THE SAME PASS. Order matters and it
-- is not symmetric:
--   1. Apply THIS migration first.  2. Then `supabase functions deploy
--   ai-goal-generation`.
-- Applying the migration alone is inert (nothing calls the function yet).
-- Deploying the function first means every generation calls a function that does
-- not exist, and the handler treats an RPC error as fail-closed — AI generation
-- would be dead for everyone until the migration lands.
--
-- WHY THIS EXISTS: ai-goal-generation has a cache check and an entitlement READ
-- and nothing that bounds calls per user. A non-Pro user at ai_uses_count = 0
-- can call OpenAI without limit as long as they never create a goal (the free
-- use is spent at goal-CREATE, deliberately — 2026-07-19, so a dismissed plan
-- never costs someone their one free goal). A Pro user is unbounded outright.
-- That was a theoretical cost vector with one user. On a public launch it is an
-- OpenAI bill exposed to anyone who downloads the app.
--
-- WHY A TABLE OF EVENTS rather than a counter column: a counter needs a reset
-- job and cannot express "10 in the last hour" without also storing when the
-- window started, which is the same row, worse. Rows are prunable and the
-- window is exact.

-- ─── The event log ───────────────────────────────────────────────────────────

create table if not exists public.ai_generation_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists ai_generation_events_user_time_idx
  on public.ai_generation_events (user_id, created_at desc);

-- RLS floor: this project requires RLS on every new table. There are DELIBERATELY
-- NO POLICIES — with RLS enabled and no policy, anon and authenticated can do
-- nothing at all, which is exactly right: the client never touches this table.
-- service_role bypasses RLS, and it is the only caller.
alter table public.ai_generation_events enable row level security;

revoke all on public.ai_generation_events from anon, authenticated;

-- ─── The claim function ──────────────────────────────────────────────────────
--
-- Counts and inserts in ONE call. Split into a select-then-insert from the edge
-- function, two concurrent requests both read "9 used" and both proceed — the
-- classic check-then-act race, and the thing a rate limit exists to prevent. The
-- transaction-scoped advisory lock serialises per user (per user, NOT globally,
-- so one heavy user cannot stall everyone else's generations).
--
-- THE SLOT IS CLAIMED BEFORE THE MODEL CALL, not after, and that is deliberate:
-- a failed OpenAI call can still have cost tokens, and refunding on error would
-- hand an attacker unlimited retries by simply causing errors. The cost is that
-- a user who hits a genuine network failure burns a slot. With the limits below
-- that is invisible in normal use, and the alternative is not bounded.

create or replace function public.claim_ai_generation_slot(
  p_user          uuid,
  p_hourly_limit  integer default 10,
  p_daily_limit   integer default 30
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hour_count  integer;
  v_day_count   integer;
  v_oldest      timestamptz;
  v_retry_after integer;
begin
  if p_user is null then
    return jsonb_build_object('allowed', false, 'scope', 'invalid');
  end if;

  -- Serialise this user's concurrent claims. Transaction-scoped: released on
  -- commit or rollback, so it can never leak.
  perform pg_advisory_xact_lock(hashtextextended(p_user::text, 0));

  -- Opportunistic prune, this user's rows only. Keeps the table bounded without
  -- a cron job. 25 hours, not 24, so the daily window is never trimmed from
  -- under itself by clock skew.
  delete from public.ai_generation_events
   where user_id = p_user
     and created_at < now() - interval '25 hours';

  select count(*), min(created_at)
    into v_hour_count, v_oldest
    from public.ai_generation_events
   where user_id = p_user
     and created_at > now() - interval '1 hour';

  if v_hour_count >= p_hourly_limit then
    v_retry_after := greatest(
      1,
      ceil(extract(epoch from (v_oldest + interval '1 hour' - now())))::integer
    );
    return jsonb_build_object(
      'allowed', false, 'scope', 'hour',
      'used', v_hour_count, 'limit', p_hourly_limit,
      'retry_after_seconds', v_retry_after
    );
  end if;

  select count(*), min(created_at)
    into v_day_count, v_oldest
    from public.ai_generation_events
   where user_id = p_user
     and created_at > now() - interval '24 hours';

  if v_day_count >= p_daily_limit then
    v_retry_after := greatest(
      1,
      ceil(extract(epoch from (v_oldest + interval '24 hours' - now())))::integer
    );
    return jsonb_build_object(
      'allowed', false, 'scope', 'day',
      'used', v_day_count, 'limit', p_daily_limit,
      'retry_after_seconds', v_retry_after
    );
  end if;

  insert into public.ai_generation_events (user_id) values (p_user);

  return jsonb_build_object(
    'allowed', true,
    'used', v_hour_count + 1, 'limit', p_hourly_limit
  );
end;
$$;

-- Only the edge function may claim a slot. A client that could call this
-- directly could drain its own budget, but more importantly could not be
-- trusted to call it at all — so it is not reachable from the client at all.
revoke all on function public.claim_ai_generation_slot(uuid, integer, integer)
  from public, anon, authenticated;
grant execute on function public.claim_ai_generation_slot(uuid, integer, integer)
  to service_role;

-- ─── VERIFY (read this back before marking the header APPLIED) ───────────────
--
-- Expected: relrowsecurity = true, zero policies, and the function present and
-- owned as SECURITY DEFINER with execute granted to service_role only.
--
-- select relname, relrowsecurity from pg_class
--  where oid = 'public.ai_generation_events'::regclass;
--
-- select count(*) as policy_count from pg_policy
--  where polrelid = 'public.ai_generation_events'::regclass;
--
-- select p.proname, p.prosecdef, pg_get_function_identity_arguments(p.oid) as args
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--  where n.nspname = 'public' and p.proname = 'claim_ai_generation_slot';
--
-- select grantee, privilege_type from information_schema.routine_privileges
--  where routine_schema = 'public' and routine_name = 'claim_ai_generation_slot';
--
-- Smoke test (safe — it inserts one row for a real user id, then removes it):
-- select public.claim_ai_generation_slot('<a real auth.users id>'::uuid, 10, 30);
--   -> expect {"allowed": true, "used": 1, "limit": 10}
-- delete from public.ai_generation_events where user_id = '<that id>'::uuid;
