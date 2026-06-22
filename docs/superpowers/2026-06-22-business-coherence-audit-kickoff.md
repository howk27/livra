# Business-coherence edge-case sweep — brainstorming kickoff (ROADMAP 3.1)

**Date:** 2026-06-22
**Status:** ready to brainstorm in a fresh session (NOT started)
**Roadmap item:** Phase 3.1 (the active next item; 3.2 maintenance-marks is deferred to last)
**Origin:** Phase 2.9 surfaced one instance of the app's behavior contradicting its stated
business model; this sweep finds the rest before any are built.

---

## How to start (new session)

1. Invoke `superpowers:brainstorming` against **this** file as the seed.
2. Brainstorm → produce a design doc in `docs/superpowers/specs/`.
3. Then `superpowers:writing-plans` → a plan in `docs/superpowers/plans/`.
4. Then `superpowers:subagent-driven-development` to execute.

This kickoff is a **problem statement and context pack**, not a design. The brainstorm should
explore and decide; do not treat the candidate list below as conclusions.

---

## The problem

Livra's positioning (locked in Phase 2.9, see the "designed to release its grip" thesis in
`PRODUCT.md` Competitive Positioning) makes a specific promise about how the product behaves:

- It is built around a **goal cadence, not a daily cadence**.
- Completing a goal ends the **pressure of active pursuit**, not the relationship.
- The user **returns for the next goal**, not every day, and **habits persist**.
- The moat is **incentive incompatibility**: Livra is glad to let you rest; a daily-active-users
  business cannot copy that.

A positioning is only a moat if the **product actually behaves that way**. Phase 2.9 already
caught one place where it does not (post-completion marks: the data persists but no surface keeps
the habit alive — now tracked as 3.2). The risk is that other surfaces quietly contradict the
"finish and rest" model: nudges that assume daily return, empty/closure states that read as
abandonment, copy that implies you must keep showing up, gating that punishes resting, etc.

**Goal of 3.1:** systematically sweep the app for behavior that contradicts the business model,
produce a prioritized list of contradictions, and decide which to fix (and how) vs. accept.

## What to audit against (the rubric)

For each surface, ask: *does this behavior match a product that is glad to let you finish and
rest, and return per-goal rather than per-day?* Flag anything that:

- assumes or pressures **daily** return (streak-like nudges, "don't lose it" framing, guilt copy);
- treats **completion** as an end-of-relationship dead-end rather than a calm off-ramp;
- makes **resting between goals** feel like failure, lapse, or punishment;
- leaves a promised continuity (e.g. "habits persist") with **no supporting surface**;
- gates or monetizes in a way that conflicts with the per-goal cadence.

(Cross-check against the banned patterns already in PRODUCT.md: brittle streaks, guilt copy,
paywalled core loop, manufactured urgency.)

## Candidate surfaces to examine (starting list — not exhaustive, not conclusions)

- **Notifications / reminders** — `services/behaviorNotifications.ts`, `lib/notificationSystem.ts`,
  momentum/at-risk nudges, daily reminders. Do any assume daily return or pressure it?
- **Completion + closure** — the goal completion overlay, the all-complete closure state
  (Phase 2.5), `state/goalsSlice.ts` `completeGoal`. Does completion feel like a dignified
  off-ramp end to end, or does anything imply "now what / you are done with us"?
- **Home / focus** (`app/(tabs)/focus.tsx`) — does it have anything to show a user who has
  finished and is resting between goals, or only active-goal states? (This overlaps 3.2.)
- **Goals tab empty/first-run vs finished-everything states** (Phase 2.5 distinction) — still
  coherent? Any "abandonment" read?
- **Momentum** — forgiving by design; double-check no surface reintroduces daily pressure.
- **Onboarding / paywall copy** — does any copy imply perpetual daily use or a treadmill?
- **Stats / history** (`app/goal/history.tsx`, `components/goals/HistoryRow.tsx`) — does the
  record of finished goals read as accomplishment (good) or as "nothing active" (bad)?

## Open questions for the brainstorm

1. Is the deliverable an **audit report** (a prioritized list of contradictions + recommendations,
   each becoming its own roadmap item) or an **audit + fix bundle** in one pass?
2. What is the **bar** for "contradiction worth fixing" vs. acceptable? (Severity rubric.)
3. How is the audit **verified** — manual walkthrough of each surface, a checklist against the
   rubric, or something testable?
4. Does 3.1 explicitly **hand 3.2** (maintenance marks) its requirements, or stay separate?
5. Owner wants to "**check more edge cases**" interactively — how much is collaborative review vs.
   agent-produced findings to react to?

## Pointers

- Positioning / business model: `PRODUCT.md` (Competitive Positioning; the 2.9 RESOLVED thesis).
- The decision record that spawned this: `docs/superpowers/specs/2026-06-22-anti-reference-naming-design.md` (D4).
- The one known instance, deferred to last: ROADMAP 3.2 (post-completion marks).
- Banned patterns / guardrails: `PRODUCT.md` (anti-references, Voice & Copy, Launch Readiness Check).
