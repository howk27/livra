# Milestone Moments — Design Spec
**Date:** 2026-05-26
**Status:** Approved
**Author:** Deivi Sierra / Sierra Link LLC

---

## Overview

Milestone moments give users acknowledgment during a long goal — not just at the end. Three checkpoints per goal, triggered automatically based on progress. Each checkpoint fires a push notification and, if tapped, opens a brief full-screen moment screen.

Available to all users (free and paid).

---

## Trigger Logic

**Hybrid:** uses target-date percentages when a target date is set; falls back to fixed day counts otherwise.

### Dated goals (target_date is set)

| Milestone key | Condition |
|---|---|
| `'25'` | Progress ≥ 25% of duration from `created_at` to `target_date` |
| `'50'` | Progress ≥ 50% |
| `'75'` | Progress ≥ 75% |

Progress % = `differenceInDays(today, parseISO(created_at)) / differenceInDays(parseISO(target_date), parseISO(created_at)) * 100`

`created_at` is a full ISO timestamp; `target_date` is `YYYY-MM-DD`. Both are parsed with `date-fns parseISO`.

### Dateless goals (no target_date)

| Milestone key | Condition |
|---|---|
| `'7'` | Days since `created_at` ≥ 7 |
| `'30'` | Days since `created_at` ≥ 30 |
| `'60'` | Days since `created_at` ≥ 60 |

### Firing rules

- A milestone only fires once per goal. `milestones_fired` on the goal records which keys have fired.
- Multiple milestones can become due simultaneously (e.g., app not opened for weeks). `getMilestonesToFire` returns all due keys; the caller notifies for only the furthest-along one (75% trumps 25%; day 60 trumps day 7) and marks all due ones as fired. Avoids notification spam.
- Only `active` goals are checked.
- If the goal is completed before a milestone fires, the unfired milestones are silently skipped.
- If the user adds a `target_date` to a previously dateless goal, the dated logic (percentages) applies from that point forward. Previously fired dateless keys (`'7'`, `'30'`, `'60'`) stay in `milestones_fired` but never conflict — the key spaces are disjoint.

---

## Data Model

One new field on `Goal`:

```typescript
milestones_fired?: string[]; // e.g. ['25', '50'] or ['7']
```

Optional (defaults to `[]`). Persisted with the goal in AsyncStorage via `goalsDb.ts`. No new table or storage key.

---

## Copy

### Notification

- **Title:** the goal's `title`
- **Body:** the milestone copy line (see below)

### Milestone copy

| Key | Copy |
|---|---|
| `'25'` | "A quarter of the way there. Keep going." |
| `'50'` | "Halfway. You're still here." |
| `'75'` | "Almost. Don't stop now." |
| `'7'` | "One week in. That's something." |
| `'30'` | "A month of showing up. It's working." |
| `'60'` | "Two months. This one's yours now." |

---

## Milestone Moment Screen — `app/goal/milestone.tsx`

Full-screen modal. Route params: `goalTitle: string`, `milestoneKey: string`.

**Layout** (mirrors `app/goal/complete.tsx`, lighter):
- Goal title in small caps at top
- Milestone copy as headline
- Two actions:
  - **"Keep going"** — dismisses, navigates home
  - **"Take a moment"** — reveals optional text input ("Write anything — or skip."), then navigates home on submit

If the user sees the notification but doesn't tap it, or opens the app without coming from the notification, the milestone screen does not appear. The milestone is already marked fired. No banner fallback.

---

## Check Mechanism

The milestone check runs in `app/_layout.tsx` on app foreground, after goals are loaded. It calls `getMilestonesToFire(goal, today)` for each active goal, fires a local notification for the highest-priority due milestone, and immediately marks all due milestones as fired in the store + AsyncStorage.

Notification tap uses expo-notifications response handler (already wired in `_layout.tsx`) to navigate to `/goal/milestone` with `goalTitle` and `milestoneKey` params.

---

## Pure Helper — `lib/goalMilestones.ts`

```typescript
getMilestonesToFire(goal: Goal, today: Date): string[]
// Returns milestone keys that are due but not yet in goal.milestones_fired
// Returns [] if goal.status !== 'active'
// Ordered: earliest milestone first (25 before 50 before 75; 7 before 30 before 60)
```

All logic is pure and unit-testable with no mocks.

---

## Files

| File | Action |
|---|---|
| `types/goal.ts` | Modify — add `milestones_fired?: string[]` |
| `lib/goalMilestones.ts` | Create — `getMilestonesToFire` pure helper |
| `lib/db/goalsDb.ts` | No change — persists the field automatically |
| `tests/unit/goalMilestones.test.ts` | Create — unit tests for helper |
| `app/goal/milestone.tsx` | Create — moment screen |
| `app/_layout.tsx` | Modify — register route + foreground check + notification tap handler |

---

## Testing

Unit tests for `getMilestonesToFire` in `tests/unit/goalMilestones.test.ts`:

- Dated goal: no milestones at 0%, fires `'25'` at 25%, not again at 26%, fires `'50'` at 50%, fires `'75'` at 75%
- Dateless goal: fires `'7'` at day 7, `'30'` at day 30, `'60'` at day 60
- Already-fired milestones are not returned
- Completed and queued goals return `[]`
- Multiple milestones due simultaneously: returns all due keys (caller decides which to notify)

No screen-level tests — the screen has no logic of its own.

---

## What This Is Not

- Not editable — users cannot manually trigger or dismiss milestones from settings
- Not shown in the history screen — milestones are transient moments, not persistent records
- Not gated behind Livra+ — acknowledgment is a core experience
