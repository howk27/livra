-- IAP subscription lifecycle — expiry, revocation, and a real update_pro_status.
-- STATUS: NOT YET APPLIED — founder to run in the Supabase SQL editor.
--
-- WHY (four confirmed defects this migration closes):
--
--   1. validate-iap-receipt/index.ts calls rpc('update_pro_status', ...) but that
--      function is defined in NO migration. PostgREST answers PGRST202, the Edge
--      Function turns it into HTTP 500, and lib/iap/iap.ts maps a 500 to
--      `transient` — so a *successful* sandbox purchase silently never unlocks.
--      Section C creates the function the code has always assumed existed.
--
--   2. Nothing anywhere ever writes pro_unlocked = false. A refund, a revoke, a
--      cancellation or a plain lapse left the user permanently Pro. Sections A+B
--      give entitlement an expiry date so it lapses on its own, and section C
--      gives the App Store Server Notifications function a way to revoke.
--
--   3. profiles could not even express "expires on" — it had pro_unlocked (bool)
--      and pro_unlocked_at (grant time) and nothing else, and no column tying a
--      row to an Apple subscription. Section A adds the four columns.
--
--   4. Nothing stopped one receipt from unlocking unlimited accounts. Section A
--      adds a UNIQUE index on pro_original_transaction_id and section C rejects
--      any attempt to bind an original_transaction_id already held by a
--      DIFFERENT user (replay guard).
--
-- The layering is deliberate: even if an Apple webhook is missed, dropped, or
-- never configured, section B's expiry check means a lapsed subscription stops
-- granting Pro on its own. The webhook is an optimisation on top of that, never
-- the only thing standing between a refund and free access.

-- ── A. Subscription state columns on public.profiles ─────────────────────────
-- All four are entitlement/billing state: service-role writable ONLY (the guard
-- trigger at the bottom of this section enforces that, same as pro_unlocked).

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS pro_expires_at              timestamptz,
  ADD COLUMN IF NOT EXISTS pro_original_transaction_id text,
  ADD COLUMN IF NOT EXISTS pro_product_id              text,
  ADD COLUMN IF NOT EXISTS pro_status                  text;

COMMENT ON COLUMN public.profiles.pro_expires_at IS
  'Apple expiresDate for the current subscription period. NULL = no expiry known '
  '(legacy rows granted before this migration stay Pro — see livra_is_pro).';
COMMENT ON COLUMN public.profiles.pro_original_transaction_id IS
  'Apple originalTransactionId — the stable id of the subscription across renewals. '
  'UNIQUE: one Apple subscription can entitle exactly one Livra account.';
COMMENT ON COLUMN public.profiles.pro_product_id IS
  'Last known Apple product id (livra_plus_monthly / livra_plus_yearly).';
COMMENT ON COLUMN public.profiles.pro_status IS
  'Lifecycle state: active | grace | expired | refunded | revoked.';

-- CHECK as a guarded DO block so re-running the migration is a no-op.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.profiles'::regclass
      AND conname = 'profiles_pro_status_check'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_pro_status_check
      CHECK (pro_status IS NULL
             OR pro_status IN ('active', 'grace', 'expired', 'refunded', 'revoked'));
  END IF;
END $$;

-- Replay guard, layer 1 (hard, at the storage level): one Apple subscription
-- cannot be bound to two profiles. Partial so the many NULL (free) rows are
-- unaffected. Layer 2 is the explicit check inside update_pro_status, which
-- turns this into a readable error instead of a raw unique violation.
CREATE UNIQUE INDEX IF NOT EXISTS profiles_pro_original_transaction_id_key
  ON public.profiles (pro_original_transaction_id)
  WHERE pro_original_transaction_id IS NOT NULL;

-- Correlating an Apple notification to a user is a lookup by this column.
-- (The unique index above already serves it; kept as a comment for the reader.)

-- ── A (cont.) Extend the privileged-columns guard to the new columns ─────────
-- 20260613_profiles_privileged_columns_guard.sql closed the "a signed-in user can
-- UPDATE their own pro_unlocked to true with the bundled anon key" hole. The four
-- columns added above are exactly the same class of state, and are WORSE if left
-- open: a client could set pro_expires_at to the year 3000, or claim someone
-- else's pro_original_transaction_id. Same pattern, same trigger, same reasons —
-- preserve OLD on a client UPDATE, force safe defaults on a client INSERT.
-- SECURITY DEFINER RPCs (update_pro_status below) run as the function owner, not
-- 'authenticated'/'anon', so they fall through the guard untouched.

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
    NEW.pro_unlocked                := false;
    NEW.pro_unlocked_at             := NULL;
    NEW.ai_uses_count               := 0;
    NEW.pro_expires_at              := NULL;
    NEW.pro_original_transaction_id := NULL;
    NEW.pro_product_id              := NULL;
    NEW.pro_status                  := NULL;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Silently preserve prior values; clients cannot change these columns.
    NEW.pro_unlocked                := OLD.pro_unlocked;
    NEW.pro_unlocked_at             := OLD.pro_unlocked_at;
    NEW.ai_uses_count               := OLD.ai_uses_count;
    NEW.pro_expires_at              := OLD.pro_expires_at;
    NEW.pro_original_transaction_id := OLD.pro_original_transaction_id;
    NEW.pro_product_id              := OLD.pro_product_id;
    NEW.pro_status                  := OLD.pro_status;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_profile_privileged_columns ON public.profiles;
CREATE TRIGGER trg_guard_profile_privileged_columns
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_profile_privileged_columns();

-- ── B. livra_is_pro now EXPIRES ──────────────────────────────────────────────
-- Signature, volatility, SECURITY DEFINER, search_path and GRANTs are identical
-- to 20260613_quantity_caps_marks_goals.sql / 20260720_repair_goals_cap_policy.sql
-- ON PURPOSE: the RESTRICTIVE cap policies on public.marks and public.goals call
-- this function by name, and changing the signature would break them.
--
-- Only the body changes: a row is Pro when it is unlocked AND not past its expiry.
--
-- The `pro_expires_at IS NULL` arm is load-bearing for legacy rows: every profile
-- unlocked before this migration has NULL there, and must keep working. A NULL
-- expiry therefore means "no expiry known", not "expired". Every path that writes
-- an unlock from here on (validate-iap-receipt, apple-server-notifications)
-- supplies a real expiry, so NULL is a shrinking legacy set, not a new hole.
CREATE OR REPLACE FUNCTION public.livra_is_pro(p_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT pro_unlocked
            AND (pro_expires_at IS NULL OR pro_expires_at > now())
       FROM public.profiles
      WHERE id = p_user),
    false);
$$;

GRANT EXECUTE ON FUNCTION public.livra_is_pro(uuid) TO authenticated, anon;

-- ── C. update_pro_status — the RPC the Edge Functions have always assumed ────
-- SECURITY DEFINER so it can write the privileged columns the guard trigger
-- protects (same mechanism consume_free_ai_use relies on in
-- 20260718_atomic_ai_use_consume.sql). EXECUTE is granted to service_role ONLY —
-- unlike the AI-use RPCs, no client role has any business calling this.
--
-- Three write modes, chosen by p_pro_unlocked:
--
--   TRUE  — grant/renew. Sets pro_unlocked, and overwrites pro_expires_at only
--           when p_expires_at is supplied. That NULL-means-keep rule is what makes
--           the grace period expressible: "still entitled, same expiry date as
--           before, status = grace" is (true, NULL, 'grace'). Passing NULL must
--           never be read as "no expiry" here or a grace notification would grant
--           permanent Pro.
--   FALSE — revoke (refund / revoke / expiry). pro_expires_at is pinned to
--           p_expires_at or now(), so the row reads as lapsed on every path.
--   NULL  — record-only. Used by notifications that carry information but must not
--           move entitlement (DID_CHANGE_RENEWAL_STATUS: the user turned auto-renew
--           off, but they keep access until the period they already paid for ends).
--           Only the non-NULL metadata arguments are applied.
--
-- Replay guard: claiming an original_transaction_id that already belongs to a
-- DIFFERENT profile raises. Without it, one receipt unlocks unlimited accounts —
-- restore-purchases on a second account would just take the entitlement over.
CREATE OR REPLACE FUNCTION public.update_pro_status(
  p_user_id                 uuid,
  p_pro_unlocked            boolean     DEFAULT NULL,
  p_original_transaction_id text        DEFAULT NULL,
  p_product_id              text        DEFAULT NULL,
  p_expires_at              timestamptz DEFAULT NULL,
  p_status                  text        DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conflict_user uuid;
  v_row           public.profiles%ROWTYPE;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'update_pro_status: p_user_id is required'
      USING ERRCODE = '22023';
  END IF;

  IF p_status IS NOT NULL
     AND p_status NOT IN ('active', 'grace', 'expired', 'refunded', 'revoked') THEN
    RAISE EXCEPTION 'update_pro_status: invalid status %', p_status
      USING ERRCODE = '22023';
  END IF;

  -- Replay guard (layer 2 — see the UNIQUE index in section A for layer 1).
  IF p_original_transaction_id IS NOT NULL THEN
    SELECT id INTO v_conflict_user
      FROM public.profiles
     WHERE pro_original_transaction_id = p_original_transaction_id
       AND id <> p_user_id
     LIMIT 1;

    IF v_conflict_user IS NOT NULL THEN
      RAISE EXCEPTION
        'update_pro_status: original_transaction_id already bound to another user'
        USING ERRCODE = '23505';
    END IF;
  END IF;

  UPDATE public.profiles
     SET pro_unlocked = COALESCE(p_pro_unlocked, pro_unlocked),

         -- Grant time is stamped once, on the first unlock, and never moved by a
         -- renewal — pro_unlocked_at answers "since when", not "until when".
         pro_unlocked_at = CASE
           WHEN p_pro_unlocked IS TRUE THEN COALESCE(pro_unlocked_at, now())
           ELSE pro_unlocked_at
         END,

         pro_expires_at = CASE
           WHEN p_pro_unlocked IS FALSE THEN COALESCE(p_expires_at, now())
           WHEN p_expires_at IS NOT NULL THEN p_expires_at
           ELSE pro_expires_at   -- NULL expiry = keep what we had (grace period)
         END,

         pro_original_transaction_id =
           COALESCE(p_original_transaction_id, pro_original_transaction_id),
         pro_product_id = COALESCE(p_product_id, pro_product_id),
         pro_status     = COALESCE(p_status, pro_status)
         -- (public.profiles has no updated_at column — see
         --  20250211100000_core_livra_sync_schema.sql — so nothing to bump here.)
   WHERE id = p_user_id
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'update_pro_status: no profile for user %', p_user_id
      USING ERRCODE = 'P0002';
  END IF;

  RETURN jsonb_build_object(
    'user_id',                 v_row.id,
    'pro_unlocked',            v_row.pro_unlocked,
    'pro_expires_at',          v_row.pro_expires_at,
    'pro_status',              v_row.pro_status,
    'pro_product_id',          v_row.pro_product_id,
    'original_transaction_id', v_row.pro_original_transaction_id,
    'is_pro_now',              v_row.pro_unlocked
                                 AND (v_row.pro_expires_at IS NULL
                                      OR v_row.pro_expires_at > now())
  );
END;
$$;

-- Edge Functions use the service key; no client role gets EXECUTE.
REVOKE ALL ON FUNCTION public.update_pro_status(uuid, boolean, text, text, timestamptz, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_pro_status(uuid, boolean, text, text, timestamptz, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_pro_status(uuid, boolean, text, text, timestamptz, text) TO service_role;

-- ── Verify (run after applying) ──────────────────────────────────────────────
-- SELECT column_name FROM information_schema.columns
--  WHERE table_name = 'profiles' AND column_name LIKE 'pro_%';
-- SELECT public.livra_is_pro('00000000-0000-0000-0000-000000000000');  -- false
-- SELECT proname, pg_get_function_identity_arguments(oid)
--   FROM pg_proc WHERE proname = 'update_pro_status';
