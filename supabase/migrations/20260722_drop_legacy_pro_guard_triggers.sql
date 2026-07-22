-- Drop the two legacy pro-entitlement guard triggers on public.profiles.
--
-- WHY: both were hand-applied to the live database and exist in NO migration.
-- 20260721_iap_subscription_lifecycle.sql introduced the canonical guard
-- (trg_guard_profile_privileged_columns) and dropped its predecessor BY NAME —
-- which never touched these two, so all three ran together.
--
-- THE BREAK: both legacy guards gate on a session variable
--
--     current_setting('app.iap_validation', true) = 'true'
--
-- and raise for EVERY caller that hasn't set it — including SECURITY DEFINER
-- functions running as the table owner. update_pro_status is SECURITY DEFINER and
-- never sets that variable, because it was written against the canonical guard's
-- ROLE-based model (current_user NOT IN ('authenticated','anon') → fall through).
-- Triggers fire alphabetically, so check_pro_unlocked_update raised first and every
-- validated App Store purchase died there with:
--
--     P0001: Cannot directly update pro_unlocked to true.
--            Use the validate_iap_receipt Edge Function after successful purchase.
--
-- Apple took the payment; the entitlement write never landed.
--
-- WHY DROPPING IS SAFE: trg_guard_profile_privileged_columns enforces the same
-- rule and strictly more of it. The legacy pair covered pro_unlocked and
-- pro_unlocked_at; the canonical guard also covers ai_uses_count, pro_expires_at,
-- pro_original_transaction_id, pro_product_id and pro_status, and it forces safe
-- defaults on INSERT as well as UPDATE. No client-facing protection is lost.
--
-- WHAT CHANGES: the legacy guards also blocked service_role. After this, a
-- service_role caller can write entitlement columns directly. That is the intended
-- model — Edge Functions ARE the trusted path — and a leaked service_role key is
-- already a total compromise, so this is not the control that was holding the line.

DROP TRIGGER IF EXISTS check_pro_unlocked_update ON public.profiles;
DROP TRIGGER IF EXISTS trg_block_client_pro_changes ON public.profiles;

DROP FUNCTION IF EXISTS public.prevent_direct_pro_unlocked_update();
DROP FUNCTION IF EXISTS public.block_client_pro_changes();

-- NOT DROPPED HERE, deliberately:
--
--   trg_set_pro_unlocked_at / set_pro_unlocked_at — still fires, and now overlaps
--   update_pro_status, which stamps pro_unlocked_at itself via
--   COALESCE(pro_unlocked_at, now()) ("since when", never moved by a renewal).
--   The trigger instead re-stamps now() on any false→true flip, so a user who
--   lapses and re-subscribes gets pro_unlocked_at reset rather than preserved.
--   Harmless for entitlement (nothing reads it for access decisions) and it is a
--   semantic call, not a bug — left alone so this migration changes exactly one
--   thing: the write that was failing.
