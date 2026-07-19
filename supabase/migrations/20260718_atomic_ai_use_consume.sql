-- Atomic free-AI-use consume/refund — closes the TOCTOU race in the
-- ai-goal-generation Edge Function.
--
-- Before: the function read profiles.ai_uses_count, checked `< 1`, then
-- incremented later via increment_ai_uses_count. Concurrent requests all read 0,
-- all passed the gate, and all called OpenAI — a scripted client could get
-- several "free" generations. Low impact (a few sub-cent gpt-4o-mini calls; the
-- profiles guard trigger already blocks any client-side counter tampering), but
-- a real check-then-act race.
--
-- After: the function reserves the use with consume_free_ai_use BEFORE the model
-- call. The UPDATE ... WHERE ai_uses_count < 1 is atomic, so exactly one of N
-- concurrent requests wins. If the generation then fails or comes back
-- low-confidence, the function calls refund_free_ai_use to hand the use back,
-- preserving the "an error never costs you your free generation" behaviour.
--
-- Both are SECURITY DEFINER (run as the function owner, not 'authenticated' /
-- 'anon'), so the profiles privileged-columns guard trigger permits the write —
-- the same pattern the existing increment_ai_uses_count RPC relies on.

-- Reserve one free use iff the user is still under the free limit.
-- Returns true when a use was consumed, false when already exhausted.
CREATE OR REPLACE FUNCTION public.consume_free_ai_use(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_consumed boolean;
BEGIN
  UPDATE public.profiles
     SET ai_uses_count = ai_uses_count + 1
   WHERE id = p_user_id
     AND ai_uses_count < 1
  RETURNING true INTO v_consumed;

  RETURN COALESCE(v_consumed, false);
END;
$$;

-- Hand a reserved use back (floored at 0) when the generation did not produce a
-- usable package, so the user can retry.
CREATE OR REPLACE FUNCTION public.refund_free_ai_use(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
     SET ai_uses_count = GREATEST(ai_uses_count - 1, 0)
   WHERE id = p_user_id;
END;
$$;
