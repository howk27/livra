-- APPLIED 2026-07-25 via the Supabase MCP (apply_migration
-- "soft_email_verification"), founder-approved, and verified afterwards:
-- the column exists, on_auth_user_email_changed is on auth.users, the guard
-- function's body carries email_verified_at, and the backfill stamped 6 of 11
-- profiles (exactly the 6 relay accounts).
--
-- Soft email verification: let people in at the door, ask them to prove the
-- inbox afterwards (founder call 2026-07-25, .reports/decisions.md).
--
-- PRIVILEGE NOTE, checked live while applying this: `authenticated` holds
-- COLUMN-level UPDATE on public.profiles for exactly avatar_url, display_name,
-- full_name and onboarding_completed — so a client cannot UPDATE
-- email_verified_at at all, whatever RLS says. The guard trigger below is not
-- redundant to that: `authenticated` does hold table-level INSERT, and the app
-- inserts profile rows (app/auth/signin.tsx) and upserts them
-- (app/settings/profile.tsx), so the INSERT branch is the hole it closes.
--
-- Supabase's "Confirm email" toggle cannot express this: ON refuses the sign-in
-- entirely (email_not_confirmed), OFF auto-confirms at signup, which is why
-- auth.users.email_confirmed_at is meaningless on this project — it is stamped
-- ~50ms after created_at for every account and proves nothing. This column is
-- the app's own signal, and only the verify-email edge function may write it.

-- 1. The column. NULL = not proven.
alter table public.profiles add column if not exists email_verified_at timestamptz;

comment on column public.profiles.email_verified_at is
  'When this account proved it can receive mail at its address (OTP round trip, stamped by the verify-email edge function). NULL = unproven. Apple private-relay addresses are stamped at signup: Apple already proved them. NOT auth.users.email_confirmed_at, which autoconfirm makes meaningless here.';

-- 2. Clients may not write it. The existing guard already pins the pro_* columns
-- for the two PostgREST roles; email_verified_at joins them, because a
-- self-asserted "verified" is not a verification. service_role (the edge
-- function) still falls through with full write access.
create or replace function public.guard_profile_privileged_columns()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
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
    NEW.email_verified_at           := NULL;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Silently preserve prior values; clients cannot change these columns.
    NEW.pro_unlocked                := OLD.pro_unlocked;
    NEW.pro_unlocked_at             := OLD.pro_unlocked_at;
    NEW.ai_uses_count               := OLD.ai_uses_count;
    NEW.pro_expires_at              := OLD.pro_expires_at;
    NEW.pro_original_transaction_id := OLD.pro_original_transaction_id;
    NEW.pro_product_id              := OLD.pro_product_id;
    NEW.pro_status                  := OLD.pro_status;
    NEW.email_verified_at           := OLD.email_verified_at;
  END IF;

  RETURN NEW;
END;
$function$;

-- 3. Apple private-relay addresses start verified. Apple owns the relay and
-- proved the address to issue it; the user cannot receive at it outside Apple's
-- forwarding, so asking them to confirm it is a nag about a thing they cannot
-- act on. handle_new_user is the existing profile-creation path (AFTER INSERT
-- on auth.users), so new Apple accounts land verified with no client involved.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
BEGIN
  INSERT INTO public.profiles (id, display_name, full_name, pro_unlocked, email_verified_at)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', NULL),
    COALESCE(NEW.raw_user_meta_data->>'full_name', NULL),
    FALSE,
    CASE WHEN NEW.email ILIKE '%@privaterelay.appleid.com' THEN now() ELSE NULL END
  );
  RETURN NEW;
END;
$function$;

-- 4. Changing the address discards the proof. Server-side, on auth.users, so it
-- cannot be skipped by whichever client path performed the change (GoTrue owns
-- the email; the app never writes it). A change TO a relay address is verified
-- by the same rule as signup.
create or replace function public.reset_email_verification_on_email_change()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
BEGIN
  IF NEW.email IS DISTINCT FROM OLD.email THEN
    UPDATE public.profiles
    SET email_verified_at =
      CASE WHEN NEW.email ILIKE '%@privaterelay.appleid.com' THEN now() ELSE NULL END
    WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$function$;

drop trigger if exists on_auth_user_email_changed on auth.users;
create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row execute function public.reset_email_verification_on_email_change();

-- 5. Backfill the accounts that already exist. Relay addresses only: everyone
-- else starts unproven and gets the quiet banner, which is the point of the
-- feature. Idempotent.
update public.profiles p
set email_verified_at = now()
from auth.users u
where u.id = p.id
  and p.email_verified_at is null
  and u.email ilike '%@privaterelay.appleid.com';
