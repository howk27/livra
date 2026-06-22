# Phase 3.2 — Post-completion marks (maintenance mode)

**Date:** 2026-06-22
**Status:** Approved, ready for planning
**Roadmap:** ROADMAP.md Phase 3.2 (the last Phase 3 item)

## Problem

A mark (`lc_counters` row) carries a `goal_id`. The Focus screen
(`app/(tabs)/focus.tsx`) renders marks only under `status === 'active'` goals,
plus "loose" marks (`goal_id == null`). When a goal flips to `status: 'completed'`,
its marks are orphaned: not deleted, not loose (they still have a `goal_id`), and
not under any active goal. They vanish from every surface. The habit silently dies
the instant the goal succeeds — directly contradicting Livra's "habits persist /
keep the practice after the goal" positioning.

## Behavior (approved)

When a goal reaches `status: 'completed'`, **every mark attached to it automatically
continues as a maintenance habit.** No opt-in step, no decision at the celebratory
moment — the habit simply stays alive. The user can later **gently retire** any
maintenance habit they're done with.

- Persistence is the **default**, aligning the product reality with the positioning.
- The retire affordance honors the warm tone: a soft "Retire / let it rest", not a
  destructive "Delete".
- Maintenance habits remain **full habits** (streaks, daily targets, their own
  per-mark reminders) but carry **no goal-pressure**: they do not feed the per-goal
  Momentum engine or the "all goal-marks done" goal-completion celebration.

## Data model — no migration

Marks persist through an AsyncStorage-backed JSON shim (`lib/db/index.ts`; its
header documents this — `CREATE TABLE` / `SELECT * FROM lc_counters` are emulated
over JSON, with no real column constraints). New optional fields round-trip
automatically, exactly as `goal_id` does today and as `banked_momentum_days` did
for goals. **No schema migration is required.**

Add one optional field to `Mark` (`types/index.ts`):

```ts
/** Set when a mark continues past its goal's completion (Phase 3.2).
 *  The id of the goal it graduated from. */
maintenance_of?: string | null;
```

`maintenance_of` both flags the mark as maintenance (drives the section + the
pressure exclusions) and preserves provenance (which goal it graduated from).

## The transformation — in `completeGoal`

`completeGoal` (`state/goalsSlice.ts`) already runs on completion. It calls a new
`countersSlice` action `convertMarksToMaintenance(goalId)` which, for every
non-deleted mark with `goal_id === goalId`:

- sets `maintenance_of = goalId`
- sets `goal_id = null`
- leaves everything else intact (streaks, daily targets, schedule, reminders)

Nulling `goal_id` is what makes the mark render again (no longer tied to an
invisible completed goal) **and** naturally excludes it from the per-goal Momentum
engine and the goal-completion celebration — achieving the "no goal-pressure"
outcome with no special-casing.

Persistence follows the existing `updateMark` precedent in `countersSlice.ts`
(same JSON-shim write path that already persists `goal_id`).

## Surface — Focus screen (`app/(tabs)/focus.tsx`)

A new **"Keeping it going"** section, rendered below active goals and loose marks:

- Shows marks where `maintenance_of != null && !deleted_at`.
- Quieter visual treatment than active-goal marks (it is optional, never a daily demand).
- Fully tappable; logging behaves identically to any other mark.
- Swipe action is **"Retire"** (warm tone, NOT the red "Delete") with a gentle
  confirm; mechanically reuses the existing `deleteCounter` soft-delete (`deleted_at`).
  The standard long-press/delete path remains available too.

## Logic boundary (testable unit)

`lib/maintenanceMarks.ts` — pure, dependency-free helpers, the single source of truth
for the filtering so the Focus render and any pressure computations agree:

- `isMaintenanceMark(mark: Mark): boolean` — `!!mark.maintenance_of && !mark.deleted_at`
- `partitionMarks(marks: Mark[]): { activeByGoal: Mark[]; loose: Mark[]; maintenance: Mark[] }`
  - `maintenance`: `isMaintenanceMark`
  - `loose`: not maintenance, `goal_id == null`
  - `activeByGoal`: not maintenance, `goal_id != null`

## Notifications / streaks

Maintenance marks keep their own per-mark reminders and streaks (they are full
habits). They do not feed goal-Momentum or goal-completion notifications — automatic,
because they no longer carry a `goal_id`.

## Scope boundary

**Completed goals only.** Expired goals (`status: 'expired'`) are a separate,
already-deferred closure path; their marks are out of scope here. Flag as a known
follow-up so the expired-goal orphan is not forgotten.

`goal_mark_links` (many-to-many) is not the Focus display attachment — Focus groups
by the singular `goal_id` field. This spec operates on `goal_id`. Verify during
implementation that no display path depends on `goal_mark_links` for a completed
goal's marks; if it does, treat as out-of-scope follow-up.

## Testing

- `maintenanceMarks` partition/filter helpers — pure, exhaustive cases (maintenance,
  loose, active-by-goal, deleted maintenance excluded).
- `convertMarksToMaintenance(goalId)` — sets `maintenance_of`, nulls `goal_id`,
  preserves streak/target fields, skips already-deleted marks, ignores marks of
  other goals.
- `completeGoal` integration — attached marks become maintenance; loose/other-goal
  marks untouched.
- Focus render — maintenance marks appear in the new section, not under any goal and
  not in loose.
- Retire — soft-deletes (`deleted_at`), removes from the section.
