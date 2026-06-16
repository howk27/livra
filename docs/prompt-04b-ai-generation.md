# Phase 4b — AI Goal Generation
**Run mode:** Execute (covered by the Phase 4 audit — read `AUDIT_LOG.md`).
**Depends on:** Phase 4a (the onboarding sequence + the stubbed AI hatch + `aiPackageDraft`/`aiRegenerationsUsed` slice fields).
**Source of truth:** `livra-product-decisions.md` (AI Goal Creation section) + redesign index.

This is **greenfield** — the audit confirmed no AI path, no free-use counter, and no cache table exist. Build them.

---

## PROTECTED-FILES EXCEPTION

Authorized: new `lib/ai/goalGeneration.ts`; a new `profiles.ai_uses_count` column and a new `ai_goal_packages` table via Supabase migration (write the migration, **do not run it** — user runs `supabase db push`); the AI-draft fields in `onboardingSlice` from 4a. **Not** authorized: `hooks/useCounters.ts`, `lib/goalLogic.ts`, `lib/db/` beyond what 4a established. Stop and report if more is needed.

---

## Hard rules

1. Commit after each task; type-check gates; tests before shipping logic.
2. **No new packages** — use `fetch`.
3. Free cap (3 marks/goal) enforced on activate; soft upsell only.

---

## Principles

- **Nothing the AI returns is auto-activated.** Review-and-confirm is mandatory and editable.
- **The typed goal text is never lost** at any failure point.
- **Free use decrements only on a confirmed, activated generation.**
- **Every failure falls back to manual** with the goal preserved — no dead ends.
- **The AI path routes through the same review screen as the manual path** — that review (with each mark's one-line "why") is where a first-timer learns the marks→goal model.

Reworded escape-hatch copy (un-stub the 4a placeholder):
> *Not sure where to start? Describe it and Livra will suggest a goal and a few daily marks — you can edit everything before it's set.*

---

## Output contract (validate before reaching review)

```ts
type AIGoalPackage = {
  goalTitle: string;              // non-empty, trimmed
  timeframeWeeks: number;         // bounded 1–52
  confidence: 'high' | 'low';     // 'low' → manual fallback, goal text preserved
  marks: Array<{
    name: string;
    icon: string;                 // MUST be in the Phosphor list passed in the prompt
    frequency: number;            // MUST fit that mark's min/max
    why: string;                  // one line, shown on review
  }>;                             // capped to 3 on activate (free tier)
};
```

Anything that doesn't parse/validate → manual fallback, goal text preserved. This shape is also the `ai_goal_packages` cache record.

---

## Safeguards (risk → safeguard)

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
| **Cost** | Regeneration spam | **One package per generate (not a gallery); cap regenerations at 2 per session** via `aiRegenerationsUsed` |
| **Cost** | Repeated same goal | Semantic cache hit (`ai_goal_packages`) → no API call |
| Fairness | Failed attempt eats free use | **`ai_uses_count` decrements only on confirm + activate** |
| Fairness | Abandons mid-review | No free-use spent; nothing half-created; goal persists only on confirm |
| Quality | Bad result caches | Cache only confirmed + activated |

Free-trial logic: 1 free AI generation ever (any user, any entry point); onboarding's first-goal generation is that free one for everyone; second attempt is the soft gate. The same 2-regen cap applies to the Livra+ goal-creation screen post-onboarding.

---

## Task 1 — Generation core

- [ ] `lib/ai/goalGeneration.ts` using `fetch` (no package). Builds the prompt (passes the Phosphor icon list + each candidate mark's min/max), calls the model, parses to `AIGoalPackage`, validates against the contract. One silent retry on malformed JSON, then manual fallback.
- [ ] Supabase migration: `profiles.ai_uses_count` integer; `ai_goal_packages` table (the `AIGoalPackage` shape + a `confirmed` boolean). Write it; do not run it.
- [ ] Tests for validation: off-model icon repair/drop, >3 marks truncation, out-of-range frequency, malformed JSON → fallback. Type-check; commit.

---

## Task 2 — Free-use, cache, regen cap

- [ ] Semantic cache check against `ai_goal_packages` **before** any API call; serve cached on high-confidence match.
- [ ] `ai_uses_count` decrements only on confirm+activate; second attempt → soft gate.
- [ ] Regeneration cap of 2 per session via `aiRegenerationsUsed`; after that, "Edit these or set it up yourself."
- [ ] Cache write only on confirm+activate (`confirmed = true`).
- [ ] Tests: free-use accounting (failed/abandoned attempts don't decrement), cache-before-call, regen cap. Type-check; commit.

---

## Task 3 — Wire the hatch + review

- [ ] Un-stub the Screen 2 hatch: generate → validate → **editable review screen** (goal title, timeframe, marks with "why") → confirm → fills the 4a `aiPackageDraft` → flows into the marks step or straight to persist.
- [ ] Manual fallback at every failure point with the typed goal preserved.
- [ ] Tests: review is mandatory and editable; abandon spends no free use; confirm fills the draft. Type-check; commit.

---

## Acceptance

- AI path always routes through the editable review; typed goal never lost.
- Free use burns only on confirm; regenerations capped at 2; cache prevents repeat calls.
- Invalid AI output never reaches activation. Migrations written, not run. Tests green; `AUDIT_LOG.md` updated.
