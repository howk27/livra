# Anti-reference naming & the structural wedge (Phase 2.9)

**Date:** 2026-06-22
**Stress point:** `PRODUCT.md:367` / the "taste moat, not structural" callout at `PRODUCT.md:380`
**Status:** design approved, ready for plan

---

## Problem

PRODUCT.md frames Livra's defensibility as "the discipline of the cut" — the things it
*refuses* to do. The committed stress point pushes back: that reads as **taste**, not a
structural moat. A well-funded warm incumbent could add a "single goal" mode and copy the
look and feel. Two concrete gaps:

1. **Wrong competitive set named.** The anti-references in PRODUCT.md are all *gamified /
   cluttered / corporate* apps. The real competitive lane is the **warm, non-punishing**
   one, which goes unaddressed as the primary frame.
2. **Brand names committed to the repo.** PRODUCT.md and one older spec name competitors by
   brand. Per the product owner, **no competitor brand name belongs in any committed
   artifact** — docs included, because the repo is shared.

## Decisions

### D1 — Differentiation thesis: "designed to release its grip"

The structural wedge is **goal-cadence, not daily-cadence**. Completing a goal ends the
*pressure of active pursuit*, not the relationship with the app. The grip releases; Livra
stays a calm home you return to for your *next* goal, and the habits you built persist.

This is structural, not taste, because it is **incentive-incompatible** for the incumbents:
a business whose revenue depends on daily-active-users cannot celebrate "you don't need us
every day" without punishing its own core metric. A competitor can copy a single-goal
screen; it cannot copy a model that is glad to let you rest.

**Guardrail on the wording:** "release its grip" must never imply the app becomes useless
after completion. Completion lowers intensity; it does not end utility (see D4).

### D2 — Name competitive lanes by behavior, never by brand

Every competitive lane stays in PRODUCT.md, described by **what it does**, not by who makes
it:

| Old (brand) | New (behavioral category) |
| --- | --- |
| "Duolingo-style" | "punishing-streak gamified apps" |
| "Notion / enterprise" | "configurable productivity dashboards" |
| "Finch, Stoic, Daylio, Fabulous" | "warm, non-punishing wellness / mood companions" |

The warm-companion lane is added as the **primary** competitive frame, with how Livra
differs from it (the D1 thesis), not merely an aside about gamified apps.

### D3 — Copy/doc guardrail: documented voice-rule, review-enforced

A new standing rule in PRODUCT.md's **Voice & Copy → Copy formatting** section:

> **No competitor brand names in any committed artifact.** Docs, specs, and shipped copy
> describe competitive lanes by behavior (what they optimize for), never by brand. This
> keeps positioning honest and keeps the repo free of names we would not market at a user.

Enforced by review, **not** by an enumerated test — an enumerated blocklist would
re-commit the very names being removed. (An automated hashed-token check was considered and
rejected as over-machinery for the risk.)

### D4 — Two tracked follow-ups (recorded, not built here)

1. **Post-completion marks ("maintenance mode") — new product/roadmap item.** The D1 thesis
   leans on "habits persist." Today the *data* persists (marks live in `lc_counters` and
   survive `completeGoal` in `state/goalsSlice.ts`), but there is **no first-class UX** for
   continuing a mark once its goal is complete — `app/(tabs)/focus.tsx` renders the home
   around `status === 'active'` goals only. Recorded as a future roadmap item so the
   positioning promise has an honest, tracked path. Not built in this phase.

2. **Business-coherence edge-case sweep — new audit item.** A pass over the app for *other*
   places where actual behavior contradicts the "finish and rest" business model (the
   maintenance-marks gap is one instance). Scheduled to run **after the current Track B
   bundle completes**, so the owner can review edge cases as a batch.

## Scope

**In scope (this phase):**
- PRODUCT.md edits: scrub brand names (D2), add the warm-companion lane as primary frame,
  replace the stress-point callout with the resolved D1 thesis, add the D3 voice-rule.
- Scrub `docs/superpowers/specs/2026-06-17-momentum-design.md:112` ("Finch-adjacent").
- ROADMAP.md: tick 2.9, add the two D4 follow-up items.

**Out of scope (tracked for later):**
- Building post-completion maintenance-marks UX (D4.1).
- The business-coherence audit itself (D4.2).
- Any user-facing copy change or screen work — 2.9 is doc-only.

## Affected files

- `PRODUCT.md` — lines 353, 356, 372, 374, 381, 382 (scrub) + stress-point callout
  (380-384, replace) + Copy-formatting section (add D3 rule).
- `docs/superpowers/specs/2026-06-17-momentum-design.md` — line 112 (scrub).
- `ROADMAP.md` — tick 2.9, add D4.1 + D4.2 items.

## Verification

- `grep -riE 'finch|stoic|daylio|fabulous|duolingo|notion'` over tracked files
  (excluding `node_modules`, `package-lock`, and worktree copies) returns **zero** hits.
- PRODUCT.md stress-point callout at :380 is replaced by a "RESOLVED" note referencing this
  spec, matching the 2.7 pattern.
- ROADMAP.md 2.9 checked; D4.1 and D4.2 present as new items.
- No code changes; full suite, type-check, and lint remain green (doc-only phase).

## Out-of-band note

2.9 carries **no automated test** (the guardrail is a prose rule by D3). This makes 2.9 the
doc-only member of the Track B bundle; the bundle's other members (Phase 1 deferred minors,
Phase 2.4) carry their own TDD coverage.
