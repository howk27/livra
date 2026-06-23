# Phase 3.1 — Business-coherence edge-case sweep

**Date:** 2026-06-23
**Status:** Approved, ready for planning
**Roadmap:** ROADMAP.md Phase 3.1
**Kickoff:** `docs/superpowers/2026-06-22-business-coherence-audit-kickoff.md`
**Origin:** Phase 2.9 (`docs/superpowers/specs/2026-06-22-anti-reference-naming-design.md`, D4.2)

## Problem

Livra's positioning ("designed to release its grip"; see PRODUCT.md Competitive
Positioning) is only a moat if the product actually behaves that way: built around a
**goal cadence, not a daily cadence**; completion ends the **pressure of active
pursuit**, not the relationship; users **return per goal, not per day**; **habits
persist**. Phase 2.9 caught one place where behavior contradicted this (post-completion
marks, now fixed in 3.2). This sweep finds and resolves the rest before launch.

## Decisions (locked in brainstorm)

1. **Deliverable = audit + fix bundle.** Sweep every surface; fix the clear-cut
   contradictions inline (TDD); spin out the larger/ambiguous ones as new ROADMAP items.
2. **Working style = hybrid.** Produce the full findings list first, then walk the
   surfaces the owner cares about interactively to catch edge cases, then lock the
   fix/defer split.
3. **Ambiguous cases = flag, don't auto-decide.** Record both readings + a
   recommendation; the owner makes the call during the interactive walk. No default lean
   pre-decides them.

## Severity rubric & the fix/defer line

| Severity | Meaning | Default disposition |
|----------|---------|---------------------|
| **S1 Live contradiction** | A surface users see today that pressures daily return, treats completion as a dead-end, or makes resting feel like failure | Fix inline (TDD) if clear-cut; spin out if it needs a design call |
| **S2 Landmine** | Dead/unwired code carrying the old streak-pressure model — invisible now, re-wirable later | Fix inline (delete) |
| **S3 Enforcement gap** | A guardrail exists but doesn't cover where violations actually live | Fix inline (extend the check) + clean the violations it now catches |
| **S4 Ambiguous** | Could read as daily pressure but is also genuinely useful | Flag both readings + recommend; owner decides in the walk |

**Clear-cut = fix inline:** dead-code deletion, dash cleanup, copy swaps with an obvious
calmer equivalent, extending an existing test.
**Spin out as a new ROADMAP item:** anything touching the data model, navigation/flow, or
needing a product decision (e.g. expired-goal closure UX).

## Surfaces swept (rubric applied to each)

For each, ask: *does this behavior match a product glad to let you finish and rest, and
return per-goal rather than per-day?*

- **Notifications / reminders** — `services/behaviorNotifications.ts`,
  `services/notificationService.ts`, `services/notificationsMaster.ts`,
  `services/momentumWarningNotifications.ts`, `lib/notifications/*`.
- **Completion + closure** — goal completion overlay, all-complete closure state (2.5),
  `state/goalsSlice.ts` `completeGoal`, `app/goal/complete.tsx`, `app/goal/milestone.tsx`.
- **Home / focus** — `app/(tabs)/focus.tsx` (greeting, rest line, all-done, forgiveness,
  empty state, the new "Keeping it going" section from 3.2).
- **Goals tab** — empty/first-run vs finished-everything distinction (2.5),
  `app/(tabs)/goals.tsx`.
- **Momentum** — confirm no surface reintroduces daily pressure.
- **Onboarding / paywall** — `app/onboarding.tsx`, `app/paywall.tsx`,
  `components/CommitmentScreen.tsx` — any treadmill / perpetual-daily-use implication.
- **History** — `app/goal/history.tsx`, `components/goals/HistoryRow.tsx` — reads as
  accomplishment, not "nothing active".
- **Repo-wide copy scan** — dashes in user copy + daily-pressure lexicon
  ("don't lose", "come back", "every day", "streak", "don't break", "lapse").

## Seeded findings (from reconnaissance — concrete, not hypothetical)

1. **S2 — Dead streak-era copy.** `getDailyHeader`, `getWeekArc`, `getPostLogMessage`,
   `getWeekSentimentHeader` in `lib/copy.ts` have **zero consumers** (verified across
   `app/ components/ lib/ services/`). They carry the old streak/daily-pressure model:
   "Come back tomorrow.", "Don't let Sunday slip.", "Most people stopped by now.",
   "Still tonight." (with a `brevity = urgency` comment). **Disposition: delete** (and
   their now-unused `HeaderState` / `WeekArcState` / `PostLogState` /
   `WeekSentimentState` types + interfaces if nothing else uses them).
2. **S3 — Dash rule under-enforced.** `tests/unit/copyDashRule.test.ts` only covers
   `lib/copy.ts` + `lib/weeklyReflectionCopy.ts`. **24** files under `app/` + `components/`
   contain em/en dashes in inline copy, e.g. `app/(tabs)/focus.tsx:363` and `:573`,
   `app/(tabs)/settings.tsx:391`, `app/goal/complete.tsx:172`, `app/goal/milestone.tsx:74`,
   `app/goal/[id].tsx:135`, `app/mark/[id]/index.tsx:739`, `components/CommitmentScreen.tsx:269`,
   `app/paywall.tsx` (several). **Disposition:** extend the dash check to inline screen
   copy and clean the real prose violations. **Excluded as legit (not prose):** `'—'`
   empty-value placeholder cells (diagnostics, paywall debug rows, profile email fallback)
   and decorative price separators — the extended check must not false-positive on these.
3. **S4 — `components/CommitmentScreen.tsx:269`** — "Life gets in the way. That's not
   failure — that's just Tuesday. Keep going anyway." Forgiving frame, but "Keep going
   anyway" brushes daily-pressure. **Disposition: flag for the walk** (also carries a dash).
4. **S1 / spin-out — Expired-goal orphans.** Already recorded under 3.2: a goal reaching
   `status: 'expired'` orphans its marks the same way completion did before 3.2.
   **Disposition: spin out** as its own ROADMAP item (closure-path design decision).

**Aligned, no action** (verified in the forgiving post-repositioning voice): Momentum
nudge copy (`MOMENTUM_FIRST/FINAL/COMBINED/BANNER`), `TERMS`, greeting "One step is
enough.", "That's everything for today.", `MASTER_NOTIF_SUBTITLE`
("Gentle nudges only. At most a couple a day, and never guilt.").

## Process

1. Complete the full sweep across the surfaces above → a findings table
   (id, surface, severity, reading(s), recommendation, disposition).
2. **Interactive walk** with the owner on the surfaces they care about; add missed edge
   cases; settle every S4.
3. Lock the fix/defer split.
4. Fix the clear-cut items via TDD; spin out the rest as new unchecked ROADMAP entries.

## Verification

- A per-surface rubric checklist, documented as swept (defines "complete coverage").
- Each inline fix is TDD'd; the dash-rule extension is itself the test for S3.
- Definition of Done: full unit suite green, `type-check` clean, `lint` clean on
  new/changed files, no banned pattern reintroduced.
- Every spun-out item appears as a new unchecked ROADMAP item so nothing is lost.

## Scope boundary

This sweep audits **business-model coherence** (daily-pressure / completion-as-dead-end /
resting-as-failure / promised-continuity-without-surface / cadence-conflicting gating).
It is **not** a general UX, performance, or visual-design audit. Findings outside the
coherence rubric are noted as out-of-scope follow-ups, not fixed here.

## Deliverables

- This spec.
- A findings table (lives in the plan / a findings doc).
- Inline TDD fixes for clear-cut items (dead-copy deletion, dash-rule extension + cleanup).
- New ROADMAP items for every deferred/spun-out finding (incl. expired-goal closure).
