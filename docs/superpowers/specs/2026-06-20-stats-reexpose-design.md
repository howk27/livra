# Phase 2.1 — Stats / history surface re-expose (design)

**Date:** 2026-06-20
**Branch (build):** `feat/stats-reexpose` off `docs/product-direction`
**Closes:** `PRODUCT.md:436` stress point — "history & stats free, never gated" is the one
free-tier promise the user cannot reach in-app.
**Roadmap item:** Phase 2.1.

---

## Problem (verified against the codebase, not the roadmap)

The roadmap describes 2.1 as *"unhide + reroute the hidden `stats` tab."* That framing is
**stale**. Verification found:

- **There is no hidden stats tab.** `app/(tabs)/stats.tsx` was *deleted* in commit `2f53510`
  ("remove ... dead components, and archived/duplicate screens"). The current tabs are `focus`,
  `goals`, `settings`. Nothing is hidden — the file is gone.
- **The deleted screen must not be resurrected.** It was the old Livra 2.0 "Tracking" screen,
  built on exactly the machinery Phase 1 removed: the deleted `theme/colors` palette,
  `useCounters`, `computeStreak` / `StreakTimeline`, and consistency-week streaks. Restoring it
  would reintroduce broken imports **and** the brittle-streak pattern that is now a banned
  guardrail (Momentum is the model).
- **A history surface already exists and is already correct.** `app/goal/history.tsx`:
  - is **free** — a plain Stack screen with no `isPro` gate;
  - already handles **empty** (`count === 0` → "Nothing here yet. Your first completed goal will
    show up the moment you finish one.") and **loading** (via the store);
  - already shows lightweight **per-goal stats** on each card: "Finished {date} · Took {duration}
    · {N days early/late}".

So "history & stats free, never gated" is satisfied on **free** and on **content**. It fails on
exactly one axis: **reachable in-app**.

- The only in-app entry to `goal/history.tsx` from a tab is `app/(tabs)/goals.tsx:441–456`, and
  that entire block is gated behind `completedCount > 0`. A user who has not yet completed a goal
  — every new user, and exactly the state a launch reviewer checks — sees **no link at all**.
  (`goal/queue.tsx:276` also pushes to it, but the queue is itself a deeper surface.)

**This is the precise guardrail failure.** 2.1 is therefore a *visibility fix*, not a build.

## Goal

Make the free history/stats surface **always reachable in-app** so the `PRODUCT.md:436` promise
is demonstrably true, including for a brand-new account with zero completed goals.

Intent level (decided): **minimal — satisfy the guardrail.** Surfacing (decided): **a persistent
link within the Goals screen.** Empty behavior (decided): **always show, tappable, neutral label;
the history screen owns the empty state.**

## Design

### 1. New presentational component — `components/goals/HistoryRow.tsx`

A small, isolated, presentational unit (mirrors the extracted `GoalMomentum` /
`MomentumBanner` components and their tests).

- **Props:** `{ completedCount: number; onPress: () => void }`.
- **Always renders** a single tappable row: neutral primary label **"History"** with a
  trailing `CaretRight`.
- **Secondary hint (muted):**
  - `completedCount > 0` → **"{completedCount} finished"**
  - `completedCount === 0` → **"Nothing finished yet"**
- Pure of stores/navigation — caller supplies `onPress`. Styling via `themedColors` /
  `spacing` / `fontSize` tokens only (no hardcoded hex, no inline styles except dynamic color).

### 2. `app/(tabs)/goals.tsx`

- Replace the gated block at `441–456` (the `completedCount > 0 && (...)` `COMPLETED`
  SectionLabel + `completedRow`) with an **always-rendered**:
  `<HistoryRow completedCount={completedCount} onPress={handleViewCompleted} />`.
- `completedCount`, `handleViewCompleted`, and the `/goal/history` route already exist and are
  unchanged.
- Remove the now-unused `completedRow` / `completedLabel` styles and the conditional
  `COMPLETED` `SectionLabel` usage if they become orphaned.

### 3. `app/goal/history.tsx`

**Unchanged.** Already free, already empty/loading-safe, already carries per-goal stats.

## Copy

Must contain no em-dash, en-dash, or hyphen-as-dash in user-facing strings (`PRODUCT.md:262`).
The `·` middot separators already in `history.tsx` are not dashes and stay.

| Location | String |
|---|---|
| Row label | `History` |
| Hint, count > 0 | `{N} finished` |
| Hint, count = 0 | `Nothing finished yet` |

## Tests (TDD — RED before GREEN)

`tests/unit/historyRow.test.tsx` using `@testing-library/react-native` (precedent:
`goalMomentumComponent.test.tsx`, `momentumBannerComponent.test.tsx`):

1. Renders the label **"History"** when `completedCount === 0` (the regression that caused the
   guardrail failure — the row must exist with zero completions).
2. Renders **"Nothing finished yet"** at 0 and **"3 finished"** at 3.
3. Tapping the row calls `onPress`.

The always-visible behavior is the core new contract; testing the isolated component is
sufficient and avoids mounting the full `goals.tsx` store graph.

## Definition of Done

- [ ] `HistoryRow` renders unconditionally; covered by tests written first.
- [ ] `goals.tsx` shows the history entry for a zero-completion account.
- [ ] Full unit suite green; `type-check` clean; `lint` clean on new/changed files.
- [ ] No banned pattern: no streaks, no dashes in copy, no Pro gate on history.
- [ ] `PRODUCT.md:436` stress-point callout updated/removed (surface now reachable).
- [ ] `ROADMAP.md` 2.1 checked off **and** its stale "unhide the hidden stats tab" wording
  corrected to describe the real change (always-visible Goals entry to `goal/history`).

## Out of scope (YAGNI)

- A 4th bottom tab.
- Aggregate stat numbers, charts, calendar heatmaps.
- Reviving the deleted `(tabs)/stats.tsx` Tracking screen.
- Surfacing Momentum data on the history screen.
