# Phase 5 — Livra+ Premium Gating Realignment
**Run mode:** AUDIT-ONLY FIRST.
**Depends on:** Phase 3 (Goals tab for the goal cap). Overlaps Phase 4 (AI repeat-use gating lives in Phase 4 — do not duplicate it here).
**Source of truth:** `livra-product-decisions.md` (Premium Model section) + redesign index.

The Livra+ model is fully locked — this is implementation, not decision-making. The redesign **changes existing gates**, so the job is realigning what's already there, not building from scratch (subscription IAP, paywall, `isProUnlocked`/`proStatus` already exist).

---

## PROTECTED-FILES EXCEPTION

Authorized to modify, **for gating logic only**:

- `hooks/useCounters.ts` — change the mark cap from global to per-goal.
- `state/goalsSlice.ts` — active-goal cap (2 free).

No other protected paths. Do not touch `lib/db/`, `lib/goalLogic.ts`, or `supabase/`. Stop and report if a change there seems required.

---

## Hard rules

1. Audit-only first → conflict report in `AUDIT_LOG.md` → STOP.
2. Commit after each task; `npm run type-check` gates progression; tests before shipping a gate.
3. No new packages. Tokens from `theme/` only.
4. **Soft upsell language only — never aggressive.** Free must stay genuinely useful; the core loop is never blocked.

---

## The locked split

**Free tier**
- 2 active goals max
- **3 marks per goal** (NOT a global cap — this is the key change)
- Full goal history and stats — **NOT gated**
- All presets/templates — **NOT gated**
- 1 free AI generation ever (handled in Phase 4)
- On-track / at-risk status
- Individual mark streaks (mark detail only)
- Completion milestone card
- Weekly consistency tracking

**Livra+ unlocks**
- Unlimited goal queue
- Unlimited marks per goal
- AI custom goal + mark creation, repeat use (Phase 4)
- Share card (weekly progress image)
- Custom reminder times per mark
- Health integrations (Apple Health)
- Mark reordering
- CSV export
- Pace projection

**Principle:** never gate history, stats, or presets. Those belong to the user.

---

## Task 1 — AUDIT ONLY

- [ ] `hooks/useCounters.ts` — current `FREE_COUNTER_LIMIT` and where it's enforced (`createMark`). Report exactly how a "global 3 marks" check works today so it can become "3 marks per the goal this mark feeds."
- [ ] `state/goalsSlice.ts` — current goal limit (`GoalLimitError`, `addGoal(..., isPro)`). Report the current free cap (likely 3) so it can drop to 2 active.
- [ ] `app/paywall.tsx` — current `PRO_FEATURES` / `SHIPPED_PREMIUM_FEATURE_TITLES` list and copy. Report the delta vs the locked split.
- [ ] Grep for any current gating of history/stats/presets/charts. Report anything gated that the locked model says must be **free** — these must be un-gated.
- [ ] Locate the feature entry points that need gates added: mark reordering, custom reminder times, health connect, CSV export, share card, pace projection. Report which exist and which are not yet built (note as out-of-scope-if-absent).
- Write findings to `AUDIT_LOG.md`. **STOP.**

---

## Task 2 — Mark cap: global → per-goal

- [ ] In `hooks/useCounters.ts`, change the free-tier check from "total active marks ≥ 3" to "marks feeding *this goal* ≥ 3". A mark with no goal counts against nothing (or against a sensible default — confirm in audit). `isProUnlocked` bypasses.
- [ ] Soft upsell on hit: "You've added 3 marks to this goal. Livra+ lets you add more." — never a wall on the core loop.
- [ ] **Relocate the upsell surface.** Phase 3 removed `marks.tsx`, which held the only `FREE_MARK_LIMIT` lock UI + Livra+ upsell row. Put the per-goal upsell where marks are now added — the `AddMarkSheet` / add-mark flow in the goal context — so the entry point isn't orphaned.
- [ ] Tests: 3-per-goal enforced; 4th blocked for free; Pro unlimited; per-goal isolation (3 on goal A doesn't block goal B). Type-check, commit.

---

## Task 3 — Active goal cap (2 free)

- [ ] In `state/goalsSlice.ts`, set the free active-goal cap to 2 (from current). Pro = unlimited. Surface the cap in the Goals tab + goal creation with soft copy.
- [ ] Tests: 2 active free; 3rd blocked; Pro unlimited; completed goals don't count against the active cap. Type-check, commit.

---

## Task 4 — Feature gates

- [ ] Add `isProUnlocked` gates to (only those that exist per audit): mark reordering, custom reminder times per mark, health connect, CSV export, share card, pace projection. Each gated entry → soft upsell, not a dead button.
- [ ] **Un-gate** anything the audit found wrongly gating history, stats, presets, or charts.
- [ ] Tests for each gate (free blocked w/ upsell, Pro allowed). Type-check, commit.

---

## Task 5 — Paywall realignment

- [ ] Update `PRO_FEATURES` / titles in `app/paywall.tsx` to the locked Livra+ list. Update headline/subhead/CTA copy to match the new positioning. Do not change product IDs or purchase call sites.
- [ ] Type-check, commit.

---

## Acceptance

- Mark cap is per-goal (3), not global; goals are isolated.
- Exactly 2 active goals on free; completed don't count.
- History, stats, presets, charts are reachable by free users everywhere.
- Every Plus feature gates with soft upsell, no dead-end buttons, core loop never blocked.
- Paywall list matches the locked split. Tests green; `AUDIT_LOG.md` updated.