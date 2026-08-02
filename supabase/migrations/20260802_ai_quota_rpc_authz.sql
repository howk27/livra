-- Close the anon-executable hole in the three AI-quota RPCs.
-- STATUS: APPLIED 2026-08-02 — applied live via MCP and verified by reading
--   pg_proc.proacl and the function bodies back. See the verification block at
--   the bottom of this file for the exact queries.
--
-- THE HOLE: all three are SECURITY DEFINER, take a CALLER-SUPPLIED user id, and
-- carry no auth.uid() check. Their ACL was
--   {=X/postgres, anon=X/postgres, authenticated=X/postgres, service_role=X/...}
-- and that leading "=X" is PUBLIC — so one unauthenticated POST to
-- /rest/v1/rpc/refund_free_ai_use with any uuid reset that user's free-AI
-- counter, making the one-free-plan wall bypassable forever (bounded only by
-- claim_ai_generation_slot's 5/hr + 15/day, which is already service_role-only).
-- increment_ai_uses_count and consume_free_ai_use shared the shape: an
-- unauthenticated caller could burn a stranger's free use.
--
-- WHY THIS IS NOT A BLANKET REVOKE (the originally-filed fix was wrong):
-- increment_ai_uses_count IS CALLED FROM THE CLIENT with the user's JWT —
-- lib/goals/createFromAIPackage.ts:163, on goal create, which is where the
-- 2026-07-19 redesign moved the spend so a dismissed plan costs nothing.
-- Revoking it from `authenticated` would silently stop the free use from ever
-- being counted, i.e. hand out UNLIMITED free AI plans — the opposite of the
-- intent. So it keeps its grant and gets an ownership check instead.
--
-- consume_free_ai_use / refund_free_ai_use have ZERO callers anywhere in the
-- repo: the same 2026-07-19 redesign orphaned the atomic reserve/refund path
-- (the edge function now only READS ai_uses_count — supabase/functions/
-- ai-goal-generation/index.ts:301-310). They are kept, not dropped, so the
-- atomic path can be rewired later; service_role is the only role left.
--
-- GUARD SHAPE: raise only when auth.uid() IS NOT NULL AND <> p_user_id.
-- A service_role caller has a NULL auth.uid() and still passes; anon cannot
-- reach the function at all once PUBLIC+anon EXECUTE is gone. Defence in depth:
-- even if a later migration re-grants EXECUTE, the body no longer lets one user
-- target another.

-- 1. increment_ai_uses_count — keep the client grant, add the ownership check.
CREATE OR REPLACE FUNCTION public.increment_ai_uses_count(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  UPDATE profiles SET ai_uses_count = ai_uses_count + 1 WHERE id = p_user_id;
END;
$$;

-- 2. consume_free_ai_use — same guard; grant drops to service_role only.
CREATE OR REPLACE FUNCTION public.consume_free_ai_use(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_consumed boolean;
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  UPDATE public.profiles
     SET ai_uses_count = ai_uses_count + 1
   WHERE id = p_user_id
     AND ai_uses_count < 1
  RETURNING true INTO v_consumed;

  RETURN COALESCE(v_consumed, false);
END;
$$;

-- 3. refund_free_ai_use — the damaging one; same guard, service_role only.
CREATE OR REPLACE FUNCTION public.refund_free_ai_use(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  UPDATE public.profiles
     SET ai_uses_count = GREATEST(ai_uses_count - 1, 0)
   WHERE id = p_user_id;
END;
$$;

-- 4. The grants. CREATE OR REPLACE preserves the existing ACL, so the revokes
--    must run AFTER the bodies above. PUBLIC is revoked explicitly — revoking
--    anon+authenticated alone would have left "=X" (PUBLIC) intact and the hole
--    fully open, which is how the originally-filed fix would have failed.
REVOKE EXECUTE ON FUNCTION public.increment_ai_uses_count(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.consume_free_ai_use(uuid)     FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.refund_free_ai_use(uuid)      FROM PUBLIC, anon, authenticated;

-- increment keeps the client path working; all three keep service_role.
GRANT EXECUTE ON FUNCTION public.increment_ai_uses_count(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.consume_free_ai_use(uuid)     TO service_role;
GRANT EXECUTE ON FUNCTION public.refund_free_ai_use(uuid)      TO service_role;

-- VERIFICATION (run after applying):
--   select proname, proacl::text from pg_proc p
--     join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public'
--      and proname in ('refund_free_ai_use','increment_ai_uses_count','consume_free_ai_use');
--   Expect NO leading "=X/postgres" and no anon on any of the three;
--   authenticated present ONLY on increment_ai_uses_count.
