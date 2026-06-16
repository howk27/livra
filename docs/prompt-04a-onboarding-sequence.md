# Phase 4a — Onboarding Sequence
**Run mode:** Execute (the Phase 4 audit is done — read `AUDIT_LOG.md`).
**Depends on:** Phase 1 (frequency defaults), Phase 3 (lands on Focus).
**Source of truth:** `livra-product-decisions.md` + redesign index. Supersedes the middle of the `2026-05-28-onboarding-redesign` spec.

This phase builds the onboarding sequence and fixes two pre-existing bugs the audit found. **No AI** — the AI escape hatch is stubbed/hidden here and built in Phase 4b.

---

## PROTECTED-FILES EXCEPTION

Authorized: `state/onboardingSlice.ts` and `completeOnboarding` in `state/uiSlice.ts`. **Not** authorized: `hooks/useCounters.ts`, `lib/goalLogic.ts`, `lib/db/`, `supabase/`. Do **not** modify `components/CommitmentScreen.tsx` — it still serves `app/goal/new.tsx`; the onboarding pace screen is separate and new. Stop and report if more is needed.

---

## Hard rules

1. Commit after each task; `npm run type-check` gates progression; tests before shipping logic.
2. No new packages. Tokens from `theme/` only.
3. Free-tier mark cap (3/goal) enforced; soft upsell only.

---

## The sequence (auth = Option B: every user has an account, signup late)

| # | Screen | Configures | Skippable |
|---|---|---|---|
| 1 | Welcome | Tone — keep the locked "graveyard of abandoned goals" line | No |
| 2 | Your first goal | Free-text goal **+ AI escape hatch (STUBBED/HIDDEN in 4a)** | No |
| 3 | What feels right for now | Commitment → mark count + frequency | Yes → middle |
| 4 | Your marks | Recommended marks, frequency as a **stated default** (not editable here); deselect to drop; free cap 3 | Partial |
| 5 | **Sign up** | The app's existing Supabase auth UI, positioned here (value-first) | No |
| — | **Persist + land on Focus** | On signup success: `completeOnboarding` + `createGoal` + `addMark` with the new `userId`, then `router.replace` to Focus | — |

**Identity flow:** Screens 2–4 collect goal + commitment + selected marks into the **slice as a draft** (no `userId` yet). Signup (Screen 5) produces the `userId`; only then do `createGoal`/`addMark` fire from the draft. Nothing persists to Supabase before signup.

### Commitment mapping (locked)

| Answer | Marks | Frequency |
|---|---|---|
| I'm easing back in | 2 | min |
| I'm ready for a steady rhythm *(default)* | 2 | recommended |
| I want to push myself | 3 | max |

Copy:
> **What feels right for now?**
> ◦ I'm easing back in.
> ◦ I'm ready for a steady rhythm.
> ◦ I want to push myself.
>
> *You can change this anytime.*

No-answer/skip → middle. **"Steady = the mark's own recommended position" — do NOT clamp daily-friendly marks (water/steps/sleep recommend 5–7 correctly). Only verify genuinely sub-daily marks (workout/study) sit at 3–4.** Goal duration: manual goals default to the mid tier (~10 weeks), adjustable later.

---

## Task 2 — Slice wiring + field changes (fixes dead code)

- [ ] **`onboardingSlice` is currently dead — the screen uses local `useState`.** Make the slice the single source of truth for the sequence; remove the local state.
- [ ] Drop the phantom `focusArea`/`identitySelections` fields (never had screens). Add `commitment: 'easing'|'steady'|'push'|null`, `aiPackageDraft: AIGoalPackage|null` (typed, unused until 4b), `aiRegenerationsUsed: number` (reserved for 4b).
- [ ] Reuse the existing `focusArea` DB column for the commitment value in the `completeOnboarding` call site (column name stays; semantics change).
- [ ] Tests for slice transitions; type-check; commit.

---

## Task 3 — Screen sequence + pace + marks

- [ ] Rebuild the stack to the 5-screen sequence above. Drop the old "How Livra works" step; repurpose the goal-title step as Screen 2 with a **stubbed/hidden** AI hatch (placeholder, wired in 4b).
- [ ] New **pace screen** (Screen 3) — separate component, NOT `CommitmentScreen`. Maps the answer to (mark count, frequency position) per the locked table; feeds `getMarksForGoal`.
- [ ] **Marks screen** (Screen 4): recommended marks for the goal, frequency shown as a stated default (not editable here), deselect allowed, cap 3 free.
- [ ] Tests; type-check; commit.

---

## Task 4 — Auth placement + persist (fixes the completeOnboarding gap)

- [ ] Position the existing signup UI as Screen 5 (after marks). Do not rebuild auth — reuse the app's Supabase auth.
- [ ] On signup success: fire `completeOnboarding` (which MUST set `profiles.onboarding_completed` — currently never called, breaking cross-device), then `createGoal` + `addMark` from the slice draft with the new `userId`, then `router.replace` to Focus.
- [ ] Confirm onboarding's final route targets the Phase 3 Focus route.
- [ ] Tests: draft persists only after signup; `onboarding_completed` is set; goal+marks created with the userId. Type-check; commit.

---

## Acceptance

- 5 screens; ends on Focus with an active goal + its marks, created against the signed-up `userId`.
- `onboardingSlice` is live (no dead local state); `completeOnboarding` actually fires and sets `onboarding_completed`.
- No screen sets a target that needs later correction; daily-friendly marks aren't clamped.
- AI hatch is present but inert (built in 4b). Tests green; `AUDIT_LOG.md` updated.
