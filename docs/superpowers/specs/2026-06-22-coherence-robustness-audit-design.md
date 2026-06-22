# Phase 3.1 — App-wide coherence + robustness sweep (design)

**Date:** 2026-06-22
**Roadmap item:** Phase 3.1 (active). 3.2 post-completion maintenance marks remains deferred to last.
**Seed:** `docs/superpowers/2026-06-22-business-coherence-audit-kickoff.md`
**Status:** design approved; audit phase next.

## Purpose

Sweep every app surface for two failure classes, produce one prioritized findings report, then
fix bugs and clear contradictions in reviewed batches. Expands the kickoff's business-coherence
scope (per owner) to also cover general engineering robustness — "every case managed gracefully
and properly coded."

## The two lenses

### Lens A — Business coherence
Does the behavior match a product that is glad to let you finish and rest, and return per-goal
rather than per-day? Grounded in `PRODUCT.md` (Competitive Positioning, Not now / not ever, Voice
& Copy, Launch Readiness Check). Flag anything that:

- assumes or pressures **daily** return (streak-panic, "don't lose it", loss-aversion framing);
- treats **completion** as a dead-end rather than a calm off-ramp;
- makes **resting between goals** read as failure, lapse, or punishment;
- promises a continuity (e.g. "habits persist") with **no supporting surface**;
- gates or monetizes against per-goal cadence (paywalled core loop, fake urgency, full-screen
  interruption);
- uses **guilt / fake urgency / streak-loss** copy (banned list, `PRODUCT.md` Launch Readiness).

Sanctioned exception: the **Momentum at-risk nudge** is allowed *only* within its no-guilt
boundary (`PRODUCT.md` Voice & Copy stress point). Flag it only if it crosses into streak-panic.

### Lens B — Robustness
Is every case coded gracefully? Flag:

- missing **empty / loading / error** state (already a `CLAUDE.md` convention — any violation is
  a defect, not a nice-to-have);
- unhandled edge cases: null/undefined data, zero/one/many, deleted or orphaned records, offline
  or sync failure, AsyncStorage / SQLite read failure, race conditions;
- silent failures, swallowed errors, unguarded async, missing input validation.

## Scope (flat, full depth)

All `app/` consumer and supporting screens audited at equal depth:

- **Core loop:** `(tabs)/focus`, `(tabs)/goals`, `goal/new`, `goal/[id]`, `goal/complete`,
  `goal/milestone`, `goal/history`, `mark/new`, `mark/[id]/index`, `mark/[id]/edit`,
  `onboarding`, `paywall`.
- **Supporting:** `(tabs)/settings`, `settings/{profile,notifications,integrations,privacy,about}`,
  `auth/{signin,reset-password,reset-password-complete,signing-out}`.
- **Basic check only** (renders, no crash, no coherence violation in visible copy):
  `diagnostics`, `iap-dashboard`, `legal/{privacy-policy,terms-and-conditions}`, `index`, all
  `_layout.tsx`.

Supporting `lib/`, `services/`, `state/` logic is examined **when a screen finding traces into
it** (e.g. a notification copy finding → `services/behaviorNotifications.ts`).

## Deliverable & flow

1. **Audit phase (read-only):** one report at
   `docs/superpowers/specs/2026-06-22-coherence-robustness-audit-findings.md`. Per surface, a row
   per lens; each finding tagged with **severity** and a recommendation, cited by `file:line`.
   The report is the verification artifact — it proves each surface was checked against both
   rubrics, with the result (including "clean"). Owner reviews/edits this full map before any fix.
2. **Fix phase:** fix **P0 + P1** in reviewed batches grouped by area (e.g. completion/closure,
   marks, notifications, onboarding/paywall). Owner approves each batch. **P2 logged, not fixed.**

## Severity & routing

- **P0** — crash, data loss, or broken core state. Fix this pass.
- **P1** — clear business-model contradiction or a broken/missing empty-loading-error state. Fix
  this pass.
- **P2** — deferrable polish or subjective copy. Logged to a backlog section in the report; not
  fixed this pass.
- **Route to 3.2 (do not fix here):** any finding that is fundamentally *post-completion
  maintenance marks*. 3.1 records the requirement so 3.2's brainstorm inherits it.

## Verification

- Logic / state fixes: **failing test first (TDD)**, then implementation (`CLAUDE.md` convention).
- Pure visual / copy fixes: read + `npm run type-check` + `npm run lint`.
- Full Jest suite (`npm run test`) green after every batch.
- Each fixed surface cross-checked against the `PRODUCT.md` Launch Readiness Check.

## Out of scope

- 3.2 maintenance-marks implementation (only its requirement is captured).
- Unrelated refactoring or redesign not traceable to a P0/P1 finding.
- New features. This is a coherence + correctness sweep, not a product expansion.
