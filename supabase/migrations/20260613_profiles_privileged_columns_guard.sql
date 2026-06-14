-- Phase 6 · Task 1 — Close the profiles privileged-column write hole.
-- STATUS: APPLIED 2026-06-14 — ran without error; dependency profiles.ai_uses_count
--   is present. (Trigger existence is not REST-verifiable with the anon key.)
--
-- Audit (AUDIT_LOG.md, Phase 6 Task 1 / Gap A): the RLS policy
--   "Users update own profile"  FOR UPDATE USING/ WITH CHECK (auth.uid() = id)
-- checks ROW OWNERSHIP only, never WHICH COLUMNS are written. A signed-in user,
-- using the bundled anon key, can run:
--     supabase.from('profiles').update({ pro_unlocked: true, ai_uses_count: 0 })
-- and grant themselves permanent Pro / reset their AI free-use counter, bypassing
-- receipt validation entirely. pro_unlocked / pro_unlocked_at / ai_uses_count are
-- entitlement/billing state and must be writable ONLY by service-role (Edge
-- Functions: validate-iap-receipt, and the Phase 6 Task 2 AI proxy).
--
-- Approach — trigger guard (chosen over a column-level GRANT allowlist):
--   * Also closes the INSERT vector (a client could otherwise INSERT its own
--     profile row with pro_unlocked = true), which a column UPDATE-grant misses.
--   * Self-maintaining: future "safe" profile columns stay client-writable by
--     default; only the three named privileged columns are protected.
--   * Preserves the existing SECURITY DEFINER rpc increment_ai_uses_count
--     (runs as the function owner, not 'authenticated', so it is allowed).
--   * Zero client code changes — policy/DB-only fix, per the Phase 6 plan.
--
-- Roles: PostgREST switches to 'authenticated' / 'anon' for client requests and
-- 'service_role' for Edge Functions using the service key. We restrict ONLY the
-- two client roles; service_role, postgres, supabase_admin retain full write.
-- The existing RLS UPDATE/INSERT policies are left intact (row-ownership stays).

CREATE OR REPLACE FUNCTION public.guard_profile_privileged_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  -- Only the two PostgREST client roles are restricted. service_role (Edge
  -- Functions), postgres and supabase_admin fall through with full write access.
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- Force privileged columns to their safe defaults on a client insert.
    NEW.pro_unlocked    := false;
    NEW.pro_unlocked_at := NULL;
    NEW.ai_uses_count   := 0;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Silently preserve prior values; clients cannot change these columns.
    NEW.pro_unlocked    := OLD.pro_unlocked;
    NEW.pro_unlocked_at := OLD.pro_unlocked_at;
    NEW.ai_uses_count   := OLD.ai_uses_count;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_profile_privileged_columns ON public.profiles;
CREATE TRIGGER trg_guard_profile_privileged_columns
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_profile_privileged_columns();
