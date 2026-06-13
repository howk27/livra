# Phase 4 — Onboarding, Commitment & AI Goal Creation
**Run mode:** AUDIT-ONLY FIRST (the AI flow and safeguards must be reviewed before any code).
**Depends on:** Phase 1 (frequency defaults), Phase 3 (lands on Focus).
**Source of truth:** `livra-product-decisions.md` + redesign index.

This **supersedes the middle of the approved `2026-05-28-onboarding-redesign` spec** — the `focus-area` and `daily-identity` screens are dropped, and the old `commitment.tsx` ("what have you been putting off?") prompt is repurposed (that was really a goal prompt). Reconcile against that existing flow in the audit.

---

## PROTECTED-FILES EXCEPTION

Authorized to modify `state/onboardingSlice.ts` and `completeOnboarding` in `state/uiSlice.ts` (these are the established onboarding write paths). **Not** authorized to touch `hooks/useCounters.ts`, `lib/goalLogic.ts`, `lib/db/`, or `supabase/` beyond a new migration file for AI-template caching (do not run it). Stop and report if more is needed.

---

## Hard rules

1. Audit-only first → conflict report → STOP.
2. Commit after each task; type-check gates progression; tests before shipping logic.
3. No new packages. Tokens from `theme/` only.
4. The free-tier mark cap (3/goal) is enforced; soft upsell language only, never aggressive.

---

## The sequence

| # | Screen | Configures | Skippable |
|---|---|---|---|
| 1 | Welcome | Tone — keep the locked "graveyard of abandoned goals" line | No |
| 2 | Your first goal | Free-text goal **+ AI escape hatch inline** | No |
| 3 | What feels right for now | Commitment → mark count + frequency band | Yes → middle |
| 4 | Your marks | Recommended marks for the goal, frequency as a **stated default** (not editable here); deselect to drop; free cap 3 | Partial |
| — | Land on **Focus** | Goal live with today's marks; optional bridge line | — |

### Commitment mapping (locked)

| Answer | Marks | Frequency |
|---|---|---|
| I'm easing back in | 2 | min |
| I'm ready for a steady rhythm *(default)* | 2 | recommended (3–4×) |
| I want to push myself | 3 | max (5×) |

Each answer hits a distinct position in each mark's range: easing = min, steady = recommended, push = max. "Push myself" is demanding **by design** — one more mark and top of the range, the next level. Steady is the default and the safe landing for skip/no-answer (2 marks, recommended). For anyone who doesn't want max, the Phase 1 "one more this week" bonus and post-setup frequency editing are the outlets — but the option to genuinely push is real.

Library note: tune each variable mark's `recommended` so "steady" lands in the 3–4×/week zone (not a token 2×), and `max` at the stretch (≈5×). Fixed marks (Sleep) ignore commitment entirely.

Copy:
> **What feels right for now?**
> ◦ I'm easing back in.
> ◦ I'm ready for a steady rhythm.
> ◦ I want to push myself.
>
> *You can change this anytime.*

---

## AI goal creation (the escape hatch on Screen 2)

Reworded entry (the magic-y "let Livra set it up" is part of the comprehension risk):
> *Not sure where to start? Describe it and Livra will suggest a goal and a few daily marks — you can edit everything before it's set.*

**Structural safeguard:** the AI path routes through the **same mandatory, editable review screen** as the manual path — never around it. The review screen is where the user learns the marks→goal model (each mark shows its one-line "why this connects").

### Output contract (validate before reaching review)

```ts
type AIGoalPackage = {
  goalTitle: string;              // non-empty, trimmed
  timeframeWeeks: number;         // bounded 1–52
  confidence: 'high' | 'low';     // 'low' → manual fallback with goal text preserved
  marks: Array<{
    name: string;
    icon: string;                 // MUST be in the Phosphor list passed in the prompt
    frequency: number;            // MUST fit that mark's min/max
    why: string;                  // one line, shown on review
  }>;                             // capped to 3 on activate (free tier)
};
```

Anything that doesn't parse/validate → fall back to manual, goal text preserved. This same shape is the cached-template record.

### Safeguards (risk → safeguard)

| Category | Risk | Safeguard |
|---|---|---|
| Comprehension | Taps AI, doesn't get the result | Mandatory editable review; per-mark "why" teaches the model |
| Comprehension | Confirms without reading | Acceptable — package is sane, all adjustable, lands legibly on Focus |
| Input | Empty / <~10 chars | Block "Generate"; inline hint |
| Input | Gibberish | AI returns `confidence:'low'` → "Couldn't make sense of that — try a sentence" → manual |
| Input | Many goals at once | AI scopes to one; "Livra works one goal at a time — start with X?" |
| Input | Unsafe/extreme target | Prompt-level guardrails; AI reframes to a safe target + note |
| Output | More than 3 marks | Activate top 3 by relevance; soft "starting you with these three" |
| Output | Off-model icon/mark | Icons constrained to passed Phosphor list; validate; repair or drop |
| System | Malformed JSON | One silent retry → second failure → manual fallback, goal preserved |
| System | Timeout (~12–15s) | "Couldn't reach setup — let's do it manually," goal + recommended marks preloaded |
| **Cost** | Regeneration spam | **One package per generate (not a gallery); cap regenerations at 2 per goal session** (onboarding AND Livra+) |
| **Cost** | Repeated same goal | Semantic cache hit → no API call |
| Fairness | Failed attempt eats free use | **Free-use decrements only on confirm + activate** |
| Fairness | Abandons mid-review | No free-use spent; nothing half-created; goal persists only on confirm |
| Quality | Bad result caches | Cache only confirmed + activated |

Free-trial logic: 1 free AI generation ever (any user, any entry point); onboarding's first-goal generation is that free one for everyone; second attempt is the soft gate.

---

## Task 1 — AUDIT ONLY

- [ ] Diff the current `app/onboarding/*` flow (welcome, commitment, focus-area, daily-identity, recommendations) against the target sequence. List screens to drop, repurpose, add.
- [ ] Report `state/onboardingSlice.ts` current fields and `completeOnboarding` signature; what changes for `commitment` + AI.
- [ ] Confirm the recommendation engine (`lib/onboarding/markRecommendations.ts`) and how it'd take the commitment mapping (mark count + frequency band).
- [ ] Identify the AI call path, where the free-use counter lives, and the cache table (propose the Supabase migration; do not run it).
- [ ] Confirm Phase 3's Focus route to land on.
- Write to `AUDIT_LOG.md`. **STOP.**

---

## Task 2 — Slice + sequence skeleton

- [ ] Extend `onboardingSlice` with `commitment` ('easing'|'steady'|'push'|null) and any AI-package draft state. Update `completeOnboarding` as the audit dictates.
- [ ] Rebuild the screen stack to the 4-screen sequence; drop `focus-area` + `daily-identity`; repurpose `commitment.tsx` as the new pace screen; goal input + AI escape hatch on Screen 2.
- [ ] Tests for slice transitions; type-check; commit.

---

## Task 3 — Commitment → defaults

- [ ] Map commitment answer to (mark count, frequency band) per the locked table; feed the recommendation engine. No-answer/skip → middle.
- [ ] Marks screen shows frequency as a **stated default**, not an editable control. Deselect allowed; cap 3.
- [ ] Tests; type-check; commit.

---

## Task 4 — AI generation + safeguards

- [ ] Implement the generate → validate → review → confirm flow with the output contract and every safeguard above.
- [ ] Regeneration cap (2), free-use-on-confirm-only, semantic cache check before any API call, manual fallback at every failure point with goal text preserved.
- [ ] Confirmed+activated packages cache to Supabase (write only on confirm).
- [ ] Tests for: cap, free-use accounting, malformed-JSON fallback, >3 marks truncation, off-model icon repair.
- [ ] Type-check; commit.

---

## Acceptance

- 4 screens + welcome; ends on Focus with an active goal and its marks.
- No screen sets a target that needs later correction.
- AI path always routes through the editable review; typed goal never lost.
- Free use burns only on confirm; regenerations capped at 2; cache prevents repeat calls.
- Invalid AI output never reaches activation. Tests green; `AUDIT_LOG.md` updated.
