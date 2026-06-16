# Phase 6 — Monetization Hardening
**Run mode:** AUDIT-ONLY FIRST. No code on the first pass.
**Source of truth:** `livra-product-decisions.md` (Premium Model) + redesign index.

Premium enforcement is almost entirely client-side today. Client gating is a nudge, not a lock — fine for convenience features, **not** fine for the two things that bleed money or hold up the whole paywall: the AI cost path and the provenance of `isProUnlocked`. This phase finds the real exposure before fixing it.

---

## Threat model (keep it proportionate)

- **Soft is acceptable** for client-rendered convenience gates (reordering, CSV, reminders, health, share card). A bypass costs ~$4.99 from a rare user. Do not gold-plate these.
- **Must be server-enforced:**
  1. **AI generation** — real marginal $ cost per call; a leaked key or skipped free-use check = unbounded spend on the founder's account.
  2. **Subscription status** — the value the entire paywall depends on.
- **Habits cap** — a monetization tidiness gap, client-tier. Restore it, but don't mistake it for the main risk.

---

## Task 1 — AUDIT ONLY (read, report, STOP)

**A. Where does Pro status come from?**
- [ ] Trace `isProUnlocked` / `proStatus` to its source. Is it (a) a validated IAP receipt (StoreKit/Play/RevenueCat), (b) a server/Supabase value, or (c) a local AsyncStorage flag? Report the full trust chain — what writes it, what could flip it offline.

**B. How does AI authenticate and meter? (highest priority)**
- [ ] Read `lib/ai/goalGeneration.ts`. Does the request carry an API key present in the client bundle? Where does the request go — directly to the model provider, or through a server/proxy?
- [ ] Is the `ai_uses_count` "1 free ever" check enforced **before the API call on a server**, or only in client code? Could a modified client call the endpoint unmetered?
- [ ] Report whether any secret (API key) is recoverable from the shipped app.

**C. Are the caps client-only?**
- [ ] Mark cap (per-goal), goal cap (2), feature gates — is any of it enforced server-side (Supabase RLS / policies), or purely in the app? Report.

**D. The known gap:**
- [ ] Confirm unlinked (Daily habits) marks are currently uncapped, and where the cap would re-attach.

Write all findings to `AUDIT_LOG.md`. **STOP — do not change code. Bring the report back to scope the execute work, because the AI fix depends on what B reveals.**

---

---

## PROTECTED-FILES EXCEPTION

Authorized for the execute phase:
- `supabase/migrations/` — new migration file for RLS column protection + optional quantity policies (write; user runs `supabase db push`)
- `supabase/functions/` — new Edge Function for the AI proxy
- `lib/ai/goalGeneration.ts` — reroute to the Edge Function, remove the key
- `state/onboardingSlice.ts` / AI review screen — wire the server-enforced free-use gate
- `lib/gating.ts` — restore the habits-bucket cap
- `hooks/useCounters.ts` — habits cap enforcement (already authorized from Phase 5)

Do NOT touch `lib/goalLogic.ts`, `lib/db/`, `hooks/useCounters.ts` beyond the habits cap.

---

## Execute tasks (run in this order — each blocks the next)

### Task 1 — Fix the RLS profile write hole (HIGHEST PRIORITY)

**Audit finding:** `WITH CHECK (auth.uid() = id)` only checks row ownership, not which columns are written. Any signed-in user can `update({ pro_unlocked: true, ai_uses_count: 0 })` with the bundled anon key.

- [ ] New Supabase migration: tighten the `profiles` update policy to a column allowlist. `pro_unlocked` and `ai_uses_count` must NOT be in the client-writable set — they are only writable by service-role (Edge Functions).
  ```sql
  -- Revoke unrestricted update; allow users to update only their own safe columns
  CREATE POLICY "Users update own profile safe columns"
    ON profiles FOR UPDATE
    USING (auth.uid() = id)
    WITH CHECK (
      auth.uid() = id
      -- pro_unlocked and ai_uses_count are NOT in this policy
      -- they are written only via service-role in Edge Functions
    );
  -- Separate service-role policy already handles pro_unlocked via validate-iap-receipt
  ```
  The exact form depends on your Postgres version and whether column-level security or a CHECK constraint is cleaner — the audit will inform the right approach; report before writing if unclear.
- [ ] Write migration, **do not run**. Note: run `supabase db push` to apply.
- [ ] No client code changes needed — the fix is policy-only.
- [ ] Log to `AUDIT_LOG.md`. Commit. **Stop and confirm before Task 2.**

---

### Task 2 — AI server proxy (blocks key exposure + metering gap)

**Audit finding:** `EXPO_PUBLIC_ANTHROPIC_API_KEY` ships in the JS bundle; request goes direct to `api.anthropic.com`; `ai_uses_count` is incremented but never gated.

- [ ] New Supabase Edge Function `functions/ai-goal-generation/index.ts`:
  - Reads `ANTHROPIC_API_KEY` from **Supabase secrets** (never the client bundle).
  - Authenticates the caller via the JWT in `Authorization` header — rejects unauthenticated requests.
  - Enforces free-use gate **server-side**: reads `profiles.ai_uses_count` for the caller; if `>= 1` and not Pro, returns `{ error: 'free_use_exhausted' }`. Uses service-role to read/write `profiles`.
  - On allowed call: forwards to Anthropic, validates the `AIGoalPackage` contract, increments `ai_uses_count` via service-role (not the client-writable path), returns the validated package.
  - Pro users bypass the `ai_uses_count` gate (unlimited repeat use per the Livra+ model).
- [ ] `lib/ai/goalGeneration.ts`: replace the direct Anthropic call with a call to the Edge Function endpoint. Remove `EXPO_PUBLIC_ANTHROPIC_API_KEY` from the client entirely. Handle `free_use_exhausted` → soft gate in the UI; network/timeout errors → manual fallback with goal text preserved.
- [ ] Remove `EXPO_PUBLIC_ANTHROPIC_API_KEY` from `.env` / `eas.json`. Key lives only in Supabase secrets.
- [ ] Tests: free-use exhaustion returns the right error; Pro bypasses; malformed response falls back to manual; typed goal preserved on all failure paths. Type-check, commit.

---

### Task 3 — RLS quantity constraints (server-side cap enforcement)

**Audit finding:** mark cap and goal cap are client-only; direct Supabase inserts bypass them.

- [ ] New migration: RLS policies on `marks` and `goals` tables enforcing the free-tier limits server-side for non-Pro users. Check `profiles.pro_unlocked` via a subquery. Goal policy: max 2 non-completed, non-expired active goals. Mark policy: max 3 marks per `goal_id` (goal-linked); unlinked marks handled in Task 4.
  ```sql
  -- Example shape (tune to your schema):
  CREATE POLICY "Free tier goal cap"
    ON goals FOR INSERT
    WITH CHECK (
      (SELECT pro_unlocked FROM profiles WHERE id = auth.uid())
      OR
      (SELECT COUNT(*) FROM goals
       WHERE user_id = auth.uid()
         AND completed_at IS NULL
         AND expired_at IS NULL) < 2
    );
  ```
- [ ] Write migration, do not run.
- [ ] Client gating in `lib/gating.ts` stays — server policies are defense-in-depth; the client checks avoid round-trips. Both enforce; server wins on conflict.
- [ ] Log to `AUDIT_LOG.md`. Commit.

---

### Task 4 — Restore the Daily-habits cap (client)

**Audit finding:** `createMark` explicitly skips the cap when `goal_id` is null — unlinked marks are uncapped.

- [ ] In `lib/gating.ts`: add `canAddHabitMark(isPro, unlinkedMarkCount)` → `isPro || unlinkedMarkCount < 3`. Count = `marks.filter(m => !m.goal_id && !m.deleted_at).length`.
- [ ] In `hooks/useCounters.ts` (authorized): enforce the habit cap in `createMark` when `!data.goal_id`, same pattern as the per-goal cap.
- [ ] Soft upsell copy: "You've added 3 daily habits. Livra+ lets you add more."
- [ ] Tests: 3 unlinked marks allowed; 4th blocked for free; goal-linked marks in a separate bucket (no cross-contamination); Pro unlimited. Type-check, commit.

---

## Acceptance

- A signed-in free user cannot grant themselves Pro or reset `ai_uses_count` via a direct Supabase call.
- No API key is present in the client bundle or exposed via `EXPO_PUBLIC_*`.
- The "1 free AI generation" rule is enforced server-side; a modified client cannot bypass it.
- Goal cap (2) and mark cap (3/goal + 3/habits) are enforced both client and server; direct inserts are blocked by RLS.
- All migrations written and logged; none run — user runs `supabase db push`.
- Tests green; `AUDIT_LOG.md` updated after each task.

