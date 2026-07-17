-- M6-A (2026-07-16) — Make public.goals and public.goal_mark_links syncable
-- STATUS: PENDING — not yet applied. Founder applies (deploy is a hard human gate).
--
-- WHY: goals + goal_mark_links exist (20260602, applied + verified live) but are
-- DEAD TABLES — the client (lib/db/goalsDb.ts) is AsyncStorage-only and has never
-- written to them. A reinstall loses every goal while marks come back. Milestone 6
-- makes goals sync; many-to-many marks is blocked on this landing first.
--
-- public.goals (20260602) predates the app it now has to store. This migration
-- closes the drift against the live client type (types/goal.ts) and gives both
-- tables the columns the sync layer needs (cursor + tombstone), following the
-- pattern already established by public.marks (20250211100000): a client-supplied
-- updated_at, a nullable deleted_at tombstone, and a (user_id, updated_at DESC)
-- index for incremental pull.
--
-- SAFETY: both tables are EMPTY (nothing has ever written to them), so the
-- corrective changes below — including narrowing the status CHECK — cannot lose
-- data. They are nonetheless written as if the tables were populated: every new
-- column is added nullable-or-defaulted, every value is backfilled before a
-- constraint tightens around it, and no column or row is ever dropped.
--
-- NOT IN SCOPE: the free-tier server backstop on public.marks INSERT
-- (20260714_raise_marks_per_goal_cap_to_5.sql) is untouched. marks.goal_id
-- remains the truth it reads. Many-to-many moves it later; moving it now would
-- delete the backstop rather than relocate it (see docs/intake-many-to-many-marks.md).

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. goals — columns missing against types/goal.ts
-- ─────────────────────────────────────────────────────────────────────────────

-- Commitment tier chosen at goal creation. TierId union in lib/goalMarkSuggestions.ts
-- (TIERS). Nullable: the client type marks it optional, and goalsDb.normalizeGoal
-- defaults a missing value to 'building' on read. CHECK mirrors the union so a
-- direct PostgREST insert cannot introduce a tier the client cannot render.
ALTER TABLE public.goals ADD COLUMN IF NOT EXISTS tier text;
ALTER TABLE public.goals DROP CONSTRAINT IF EXISTS goals_tier_check;
ALTER TABLE public.goals ADD CONSTRAINT goals_tier_check
  CHECK (tier IS NULL OR tier IN ('starting', 'building', 'leveling', 'all-in'));

-- Check-in frequency chosen at goal creation. FrequencyId union (FREQUENCIES).
-- Nullable for the same reason as tier (normalizeGoal defaults to 'steady').
ALTER TABLE public.goals ADD COLUMN IF NOT EXISTS frequency text;
ALTER TABLE public.goals DROP CONSTRAINT IF EXISTS goals_frequency_check;
ALTER TABLE public.goals ADD CONSTRAINT goals_frequency_check
  CHECK (frequency IS NULL OR frequency IN ('light', 'steady', 'pushing'));

-- Momentum day-count banked at completion (Phase 1.4). Nullable: set only on
-- completed goals; NULL means "never completed", which is NOT the same as 0.
ALTER TABLE public.goals ADD COLUMN IF NOT EXISTS banked_momentum_days integer;

-- Tombstone. Goals are hard-deleted today (lib/db/goalsDb.ts:67 removeGoal splices
-- the array), so a deletion on device A can never propagate to device B — the pull
-- would simply re-materialise the goal. Marks already soft-delete via deleted_at
-- (20250211100000); goals now match that pattern exactly.
ALTER TABLE public.goals ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- target_date is deliberately NOT added: deprecated client-side in favour of
-- deadline_date (types/goal.ts:19-20), which the server already has.

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. goals.status — remove 'queued', default to a value the client understands
-- ─────────────────────────────────────────────────────────────────────────────
-- DECISION: drop 'queued' and default to 'active'.
-- 20260602 defaults status to 'queued', but the client's GoalStatus union is
-- 'active' | 'completed' | 'expired' | 'paused' (types/goal.ts:3) — 'queued' is a
-- value no client code can produce, parse, or render. Keeping it would mean a row
-- inserted without an explicit status arrives on device as an unhandled status,
-- and every client status mapper would need a dead branch forever. The table is
-- EMPTY, so there is no 'queued' data to preserve and no migration cost to pay.
-- The UPDATE below is therefore a no-op today; it is written so this migration is
-- still correct (and non-destructive) if rows exist by the time it is applied.

UPDATE public.goals SET status = 'active' WHERE status = 'queued';

ALTER TABLE public.goals DROP CONSTRAINT IF EXISTS goals_status_check;
ALTER TABLE public.goals ADD CONSTRAINT goals_status_check
  CHECK (status IN ('active', 'completed', 'expired', 'paused'));

ALTER TABLE public.goals ALTER COLUMN status SET DEFAULT 'active';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. goals — indexes for the sync layer
-- ─────────────────────────────────────────────────────────────────────────────
-- idx_goals_user_updated (user_id, updated_at DESC) from 20260602 still serves the
-- cursor pull as-is, and deleted_at does NOT belong in it: an incremental pull must
-- RETURN tombstones (that is how the deletion reaches the other device), so it
-- filters deleted_at only when materialising, never in the cursor predicate.
-- Restated here idempotently so a fresh DB gets it in one place.
CREATE INDEX IF NOT EXISTS idx_goals_user_updated
  ON public.goals (user_id, updated_at DESC);

-- idx_goals_user_active from 20260602 is predicated on status IN ('active','queued'),
-- which is now stale on both sides: 'queued' is gone, and 'paused' goals count as
-- active for the free-tier cap. Re-created to match what actually reads it —
-- livra_count_other_active_goals() below — including the tombstone filter.
DROP INDEX IF EXISTS public.idx_goals_user_active;
CREATE INDEX IF NOT EXISTS idx_goals_user_active
  ON public.goals (user_id)
  WHERE status NOT IN ('completed', 'expired') AND deleted_at IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. goal_mark_links — cursor + tombstone + denormalised user_id
-- ─────────────────────────────────────────────────────────────────────────────
-- DECISION: give links a real tombstone, do NOT reconcile wholesale.
-- Wholesale per-user reconcile on pull is tempting (links are small,
-- unique(goal_id, mark_id) makes it safe) but it is wrong on the WRITE side, not
-- the read side: without a tombstone, an unlink on device A is indistinguishable
-- from a link device A has not pushed yet. Wholesale reconcile would either
-- resurrect unlinked marks or silently drop links created offline — and the whole
-- point of this milestone is that a link is durable user intent. A tombstone also
-- keeps links symmetric with goals and marks, so the other builder writes ONE pull
-- shape three times instead of two shapes.
--
-- user_id is denormalised onto the link so the pull is the same
-- (user_id, updated_at DESC) cursor as everything else. Without it, pulling a
-- user's links means joining through goals on every request (goals!inner(user_id)),
-- which no other table in this schema does.
--
-- CLIENT-SIDE COST (for the builder who owns lib/db/goalsDb.ts + types/goal.ts):
--   * GoalMarkLink gains user_id, created_at, updated_at, deleted_at.
--   * addGoalMarkLink must stamp user_id + updated_at.
--   * removeGoalMarkLink (goalsDb.ts:106) must SET deleted_at, not filter the row
--     out of the array — and every link reader must filter !deleted_at. Same change
--     removeGoal (goalsDb.ts:67) needs for goals.
--   * Re-linking a previously unlinked pair must UPDATE the tombstoned row
--     (deleted_at = NULL), not INSERT — unique(goal_id, mark_id) still holds and
--     will reject the insert. Upsert on the (goal_id, mark_id) conflict target.

ALTER TABLE public.goal_mark_links ADD COLUMN IF NOT EXISTS updated_at timestamptz;
UPDATE public.goal_mark_links SET updated_at = COALESCE(created_at, now())
  WHERE updated_at IS NULL;
ALTER TABLE public.goal_mark_links ALTER COLUMN updated_at SET DEFAULT now();
ALTER TABLE public.goal_mark_links ALTER COLUMN updated_at SET NOT NULL;

ALTER TABLE public.goal_mark_links ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- Added nullable, backfilled from the owning goal, then tightened — correct even
-- if rows existed. The subquery is the same ownership rule the RLS policy uses.
ALTER TABLE public.goal_mark_links ADD COLUMN IF NOT EXISTS user_id uuid
  REFERENCES auth.users (id) ON DELETE CASCADE;
UPDATE public.goal_mark_links l
  SET user_id = g.user_id
  FROM public.goals g
  WHERE g.id = l.goal_id AND l.user_id IS NULL;
ALTER TABLE public.goal_mark_links ALTER COLUMN user_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_goal_mark_links_user_updated
  ON public.goal_mark_links (user_id, updated_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. RLS
-- ─────────────────────────────────────────────────────────────────────────────
-- Who-can-do-what — public.goals (unchanged from 20260602; re-asserted so it is
-- verifiably intact over the new columns — a FOR ALL policy covers every column,
-- so tier/frequency/banked_momentum_days/deleted_at are already inside it):
--   * SELECT — own rows only (auth.uid() = user_id).
--   * INSERT — own rows only, AND-ed with the RESTRICTIVE free-tier goal cap below.
--   * UPDATE — own rows only; the new row must still be own (soft-delete is an
--     UPDATE, so it stays inside this policy — no DELETE grant is needed for it).
--   * DELETE — own rows only (kept for account deletion; the client soft-deletes).
--   * anon: no access. service_role: bypasses RLS (Edge Functions unaffected).
ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own goals" ON public.goals;
CREATE POLICY "Users manage own goals"
  ON public.goals FOR ALL
  USING      (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Who-can-do-what — public.goal_mark_links:
--   * Ownership is STILL the owning goal's user_id (the 20260602 rule, unweakened).
--   * user_id on the link must ALSO equal auth.uid(). This is strictly stronger
--     than 20260602: it additionally forbids inserting a link stamped with someone
--     else's user_id. Without it a user could poison another user's cursor pull
--     with a row that is theirs by goal but not by label.
--   * anon: no access. service_role: bypasses RLS.
ALTER TABLE public.goal_mark_links ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own goal_mark_links" ON public.goal_mark_links;
CREATE POLICY "Users manage own goal_mark_links"
  ON public.goal_mark_links FOR ALL
  USING (
    auth.uid() = user_id
    AND auth.uid() = (SELECT g.user_id FROM public.goals g WHERE g.id = goal_id)
  )
  WITH CHECK (
    auth.uid() = user_id
    AND auth.uid() = (SELECT g.user_id FROM public.goals g WHERE g.id = goal_id)
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Free-tier goal cap — the gap that goals-actually-syncing opens
-- ─────────────────────────────────────────────────────────────────────────────
-- The RESTRICTIVE policy "Free tier: max 2 active goals" on public.goals INSERT
-- already exists (20260613_quantity_caps_marks_goals.sql:105). Its own header says
-- it is "effectively dormant (no client inserts goals)... written now so the cap is
-- enforced the moment goals sync." THIS MIGRATION IS THAT MOMENT — the policy goes
-- live, and it must be correct before it does.
--
-- The bug the tombstone introduces: livra_count_other_active_goals() counts
-- status NOT IN ('completed','expired') with no knowledge of deleted_at, which did
-- not exist when it was written. A soft-deleted goal keeps status='active'
-- forever, so a free user who deletes a goal never gets the cap slot back — the
-- 3rd insert is rejected by RLS with nothing on screen to explain it. That is a
-- deletion-shaped paywall, and it ships the instant goals sync.
--
-- Fixed by CREATE OR REPLACE at the SAME signature, so the existing policy binds to
-- the corrected body with no policy rewrite and no window where the cap is absent.
-- The cap VALUE (2) and the policy itself are unchanged — this only teaches the
-- counter that a tombstoned goal is not an active goal.
CREATE OR REPLACE FUNCTION public.livra_count_other_active_goals(
  p_user uuid,
  p_id uuid
)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::int
  FROM public.goals
  WHERE user_id = p_user
    AND status NOT IN ('completed', 'expired')
    AND deleted_at IS NULL
    AND id <> p_id;
$$;

GRANT EXECUTE ON FUNCTION public.livra_count_other_active_goals(uuid, uuid) TO authenticated, anon;
