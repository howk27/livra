# Free-Tier Coherence & Honesty — Design Spec

**Date:** 2026-06-21
**Branch target:** `docs/product-direction` (implementation on a feature branch)
**Roadmap items closed:** Phase 2.3 (monetization coherence), 2.5 (retention cliff), 2.10 (AI generosity)
**PRODUCT.md stress points resolved:** `:95`, `:208`, `:398`, `:448` (plus positioning reframe at `:367`)

---

## 1. Purpose

Three Phase 2 stress points are the same problem seen from three angles: is the free
tier coherent and honest? This spec reconciles the goal model, the AI draft, and the
post-completion moment so the locked-model table, `lib/gating.ts`, the app copy, and
PRODUCT.md all agree.

The defining product decision: **the free tier now offers two concurrently progressing
goals, not "one active plus one queued."** This retires the `queued` status entirely and
changes a load-bearing piece of PRODUCT.md's positioning, so it is treated as a model
change, not a copy fix.

## 2. Decisions (locked during brainstorming)

1. **Free = 2 concurrent active goals**, both accruing progress from their linked marks.
   **Livra+ = unlimited active goals.** `FREE_GOAL_LIMIT = 2` is retained, re-meaning
   "concurrent active goals."
2. **Retire the `queued` status.** Every non-completed goal is `active`. Existing
   persisted `queued` goals normalize to `active` on fetch (back-compat).
3. **One free AI draft, disclosed up front**, fully editable before it is committed.
4. **Completing the last active goal** yields a calm closure state (what you built) plus a
   quiet invite to start the next goal. No streak to protect, no nag.
5. **The daily-habit cap** (`FREE_HABIT_LIMIT = 3`) is added to the monetization table so
   the doc matches the live gate.
6. **Implementation approach A (hard removal)** of `queued`, not a soft alias.

## 3. Out of scope

- Changing `FREE_MARKS_PER_GOAL` (3 per goal) or `FREE_HABIT_LIMIT` (3) values.
- Reworking Momentum mechanics (the engine already loops active goals plural; no change).
- AI server-side model/prompt changes beyond verifying the free-use count semantics.
- Voice canonicalization (2.6), dash-rule check (2.7), register boundary (2.8),
  anti-reference depth (2.9) — separate phases.

---

## 4. Workstream 1 — Goal model

### 4.1 Type & gating
- `Goal['status']`: `'active' | 'completed' | 'expired'` (drop `'queued'`).
- `lib/gating.ts`: `canAddGoal(isPro, activeGoalCount)` unchanged in signature; callers pass
  the count of non-completed/non-expired goals (all active now). Pro bypasses. No value change.

### 4.2 `state/goalsSlice.ts`
- `createGoal`: status is always `'active'`. `sort_index` = (max active `sort_index`) + 1.
  The limit check (`canAddGoal`) counts active goals; throws `GoalLimitError` when a free
  user is already at 2.
- `completeGoal`: remove the "activate next in queue" step (`:312-316`). Completion marks
  the goal `completed` only; other active goals are untouched and keep progressing.
- `reorderQueue` → **`reorderGoals`**: reorders active goals' `sort_index` for display only.
- `getActiveGoal` (singular) → **`getActiveGoals`** (plural), sorted by `sort_index`.
- Remove `getQueuedGoals`.
- **`fetchGoals` normalization:** map any loaded goal with `status === 'queued'` to
  `'active'` before storing, so existing accounts keep every goal. Persist the normalized
  status on next write (no forced migration write on read).
- `GoalLimitError` message rewritten (see WS2).

### 4.3 `lib/goalLogic.ts`
- Remove `getQueuedGoals` and `nextGoalToActivate` (`:28-30`, the queued-successor helper).
- `getActiveGoal(goals): Goal | undefined` → `getActiveGoals(goals): Goal[]` returns all
  active sorted by `sort_index`. Update every caller of the singular form.
- `getCompletedGoals` / `getExpiredGoals` unchanged.

### 4.4 `components/overlays/GoalCompletionOverlay.tsx`
- Remove the lookup of the next `queued` goal (`:86`). The overlay celebrates the completion
  and returns to the goals list (or the closure state in WS4 when no active goals remain).

### 4.5 Expiry path
- `checkAllGoalExpiry` / expiry handling: when a goal expires it becomes `expired`; no
  auto-activation of a "next" goal (none exists). Confirm no remaining reference to a queued
  successor.

---

## 5. Workstream 2 — Copy, monetization table, positioning (2.3 / 2.3b)

### 5.1 App copy (retire "queue" / "2 active, finish one" framing)
All user-facing copy is dash-free per PRODUCT.md `:262`.

- `GoalLimitError` (`goalsSlice.ts:34`): e.g. "Free keeps you to 2 goals at once. Finish one
  or upgrade to Livra+ for unlimited goals."
- `app/goal/new.tsx:100` and `components/sheets/AddGoalSheet.tsx:156`: same two-goal framing,
  no "queue."
- `AddGoalSheet.tsx:302`: button "Add to queue" → "Add goal."
- `app/paywall.tsx:52`: "unlimited goal queue" → "unlimited active goals."
- `(tabs)/goals.tsx`: drop the separate "Up next (queued, draggable)" section (`:430-435`);
  render one active-goals list; drag reorders display order via `reorderGoals`.
- `app/goal/complete.tsx:209` "Your queue is clear." → handled by WS4.

### 5.2 The `goal/queue` screen and route
- **Decision:** fold `app/goal/queue.tsx` into the Goals tab and remove the dedicated
  `goal/queue` route (`app/_layout.tsx:609`) and the `router.replace('/goal/queue')` hop in
  `goal/complete.tsx:118` (route to the goals list instead). The Goals tab already lists and
  reorders goals; a second screen for the same set is redundant once "queue" is gone.
- Any goal-management actions unique to `goal/queue.tsx` (e.g. delete/reorder affordances)
  that are not already on the Goals tab are migrated there before the screen is removed.

### 5.3 PRODUCT.md edits
- Core vision `:95`: rewrite "one goal is active / progress toward the active goal" to
  reflect up to two concurrent goals on free (unlimited on Livra+), progress accruing toward
  each active goal. Mark the stress-point callout RESOLVED.
- Defensibility / anti-reference `:367`: reframe narrowness as "a couple of goals, a few
  marks each, not a habit grid of everything," preserving depth-over-breadth.
- Locked-model table `:448`: add the daily-habit cap row (free: 3 un-goaled daily-habit
  marks; Livra+: unlimited). Mark the `:448` stress-point callout RESOLVED.

---

## 6. Workstream 3 — AI generosity (2.10)

### 6.1 Upfront disclosure
- In `app/onboarding.tsx`, before the AI generate action, show a plain, dash-free line at
  the point of use, e.g.: "This is your one free AI draft. You can edit everything before you
  save it, and presets are always free."
- The disclosure is visible before the user triggers generation, so the one-time nature is a
  chosen moment, never a wall discovered after the fact.

### 6.2 Editability guarantee
- The existing `aiReviewActive` review step (edit title, timeframe, mark selection; up to 2
  regenerations; no-cost dismiss) is locked as a requirement.
- Add editing of the goal **description** in the review step if not already present.
- The draft is never committed to a goal until the user confirms the review
  (`handleAIReviewConfirm`). Dismiss (`handleAIReviewDismiss`) preserves the typed goal text
  and spends nothing client-side.

### 6.3 Count honesty (verify in planning)
- "One free draft" means one full session: initial draft + up to 2 regenerations + unlimited
  manual edits before save.
- **Planning-time verification:** confirm the server gate (`ai_uses_count` in the
  `ai-goal-generation` Edge Function) does not count each regeneration as a separate spend.
  If it does, that mismatch is fixed so the disclosed promise is true.
- The `free_use_exhausted` message remains, now a confirmation of something already disclosed.

---

## 7. Workstream 4 — Retention cliff: closure + calm invite (2.5)

### 7.1 The moment
- Triggered when the user has **zero active goals and at least one completed goal** (they
  finished everything they had in flight).
- Replaces `goal/complete.tsx:209` "Your queue is clear." and the post-completion routing.

### 7.2 Closure content
- Surface what they built, pulled from existing stores: total goals completed
  (`goalCompletionStore` / completed goals), total marks logged, momentum earned
  (`momentumSlice`). Reuse the now-free history surface (`components/goals/HistoryRow.tsx`,
  `app/goal/history.tsx`).
- Tone: warm, finished, earned. No streak framing, no urgency.

### 7.3 Calm on-ramp
- A single quiet CTA: "Start your next goal when you're ready" (dash-free), routing into the
  goal-creation flow. No second nag, no manufactured reason to return.

### 7.4 Distinct from the cold-empty state
- `(tabs)/goals.tsx` `isEmpty` (`:340`, no goals ever) stays a separate first-run empty
  state. The "you finished everything" closure state is only for users with completion
  history. Both must read correctly.

---

## 8. Documentation closeout (required)

Part of this work, not a follow-up:

- **PRODUCT.md:** stress-point callouts at `:95`, `:208`, `:398`, `:448` updated to
  RESOLVED with a one-line note pointing at this spec; positioning line `:367` reframed.
- **ROADMAP.md:** check off `[x]` items **2.3**, **2.5**, and **2.10** with a short
  done-note (branch + spec path), matching the format used for 2.1 and 2.2.
- **Launch-gate guardrails** (`PRODUCT.md` "Guardrails (check before launch)"): re-verify
  "no part of the add → log → progress → complete loop is blocked for free users" still holds
  under the two-active-goal model.

## 9. Testing (TDD throughout)

- **WS1 (heaviest):** rewrite every `status === 'queued'` test. New/changed:
  `createGoal` always-active + 2-goal limit; `completeGoal` does not activate a successor;
  `reorderGoals` display order; `fetchGoals` normalizes legacy `queued` → `active`;
  `getActiveGoals` plural. Momentum tests confirm both active goals accrue and decay.
- **WS2:** snapshot/string tests for the reconciled copy; a check that no shipped copy says
  "queue"/"queued" for goals; PRODUCT.md table includes the daily-habit row.
- **WS3:** disclosure renders before generation; review edits (incl. description) flow into
  the created goal; dismiss spends nothing; regeneration accounting matches the promise.
- **WS4:** closure state shows for zero-active + completed-history; cold-empty state shows for
  no-goals; counts pulled correctly; CTA routes to goal creation.
- Full suite green, `type-check` clean, `lint` clean on changed files.

## 10. File touch list (anticipated)

- `lib/gating.ts` (comment/count semantics), `state/goalsSlice.ts`, `lib/goalLogic.ts`
- `components/overlays/GoalCompletionOverlay.tsx`, `app/(tabs)/goals.tsx`
- `app/goal/queue.tsx` (removed), `app/_layout.tsx` (route removed), `app/goal/complete.tsx`
- `app/goal/new.tsx`, `components/sheets/AddGoalSheet.tsx`, `app/paywall.tsx`
- `app/onboarding.tsx`
- `PRODUCT.md`, `ROADMAP.md`
- `tests/unit/*` across all four workstreams

## 11. Sequencing

WS1 → WS2 → WS3 → WS4. WS2 and WS4 depend on WS1's model; WS3 is independent and can land in
parallel. Documentation closeout (section 8) lands with the workstream that resolves each
item, with a final pass to tick ROADMAP and re-verify the launch gate.
