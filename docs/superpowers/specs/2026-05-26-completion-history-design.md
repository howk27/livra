# Completion History Screen — Design Spec
**Date:** 2026-05-26
**Status:** Approved
**Author:** Deivi Sierra / Sierra Link LLC

---

## Overview

A dedicated screen that shows every goal the user has finished, in reverse-chronological order. This is the "visible proof it happened" moment from the product plan — a permanent record that grows as goals are completed. Available to all users (free and paid).

---

## Entry Point

`app/goal/queue.tsx` currently has a `showCompleted` state and an inline collapsible list of completed goals. That inline list is removed. The "COMPLETED (n)" button becomes a navigation action:

```typescript
router.push('/goal/history');
```

The queue screen becomes cleaner — it focuses on active and upcoming goals only.

---

## Route

`app/goal/history.tsx` — registered in `app/(tabs)/_layout.tsx` as a stack screen under the existing goal group.

---

## Screen Layout

**Header**
- Title: `"Done."` (single word, Livra voice)
- Subtitle: `"14 things you actually finished."` (count pluralised: "1 thing" / "N things")

**List**
- Completed goals sorted newest-first by `completed_at`
- Each row:
  - Goal title (prominent)
  - Completion date: `"Finished May 23"` (formatted from `completed_at`)
  - Duration: `"Took 47 days"` (calculated from `created_at → completed_at`)
  - Target delta (only shown if `target_date` was set): a neutral label — `"On time"`, `"3 days early"`, or `"11 days late"` — no guilt framing

**Empty state**
- `"Nothing here yet. Your first completed goal will show up the moment you finish one."`

---

## Data

Reads directly from `useGoalsStore(s => s.getCompletedGoals())`. No new data layer required — completed goals are already persisted in AsyncStorage via `goalsDb.ts` and loaded into the store on app start.

Fields used per goal:

| Field | Use |
|---|---|
| `title` | Display name |
| `completed_at` | Sort order + "Finished" label |
| `created_at` | Duration calculation |
| `target_date?` | Target delta label (omitted if null) |

---

## Pure Helpers — `lib/goalHistory.ts`

All display logic lives here, isolated from the screen component.

```typescript
formatDuration(createdAt: string, completedAt: string): string
// Returns "Same day" | "1 day" | "N days"
// Uses differenceInDays(parseISO(completedAt), parseISO(createdAt))
// Minimum 0 days (same day)

formatTargetDelta(completedAt: string, targetDate: string): string
// Returns "On time" | "N days early" | "N days late"
// delta = differenceInDays(completedDate, targetDate)
//   delta === 0  → "On time"
//   delta < 0   → "${Math.abs(delta)} days early"
//   delta > 0   → "${delta} days late"
// completedAt is an ISO timestamp — extract YYYY-MM-DD before comparing
```

---

## Files

| File | Action |
|---|---|
| `lib/goalHistory.ts` | Create — `formatDuration` + `formatTargetDelta` |
| `tests/unit/goalHistory.test.ts` | Create — unit tests for both helpers |
| `app/goal/history.tsx` | Create — screen component |
| `app/goal/queue.tsx` | Modify — remove inline completed list, change button to navigate |
| `app/(tabs)/_layout.tsx` | Modify — register `/goal/history` Stack.Screen |

---

## Testing

Unit tests for both pure helpers in `tests/unit/goalHistory.test.ts`:

- `formatDuration`: same day, 1 day, 47 days, large values
- `formatTargetDelta`: on time (exact), early, late, same day as target

No snapshot tests. No screen-level tests — the screen has no logic of its own.

---

## What This Is Not

- Not gated behind Livra+ — seeing your completed goals is a core experience
- Not a goal detail screen — tapping a history item does nothing (v1)
- Not editable — completed goals cannot be un-completed or deleted from this screen
