# Phase 3B — Recalculation Engine Design
**Date:** 2026-05-25
**Status:** Approved
**Author:** Deivi Sierra / Sierra Link LLC

---

## Overview

Goals can have an optional target completion date. The recalculation engine monitors mark consistency against that date and surfaces a "behind pace" alert when the user is unlikely to hit it at their current rate. The alert appears as a home screen banner plus a daily notification. The user can recalibrate (accept a suggested new date or pick one manually).

---

## Core Decisions

| Decision | Choice | Rationale |
|---|---|---|
| When target date is set | Optional, post-creation | No friction at goal creation |
| Pace definition | Aggregate mark completions / (markCount × daysElapsed) | Per-mark granularity is noise; one number is actionable |
| Lookback window | 14 days | Enough signal; not punitive for one bad week |
| Minimum age before alert | 7 days | Avoid firing on brand-new goals |
| Alert threshold | pace < 0.5 (< 50% of possible check-ins completed) | Mid-point; below this the gap is meaningful |
| Alert surfaces | In-app banner + daily notification | Banner = persistent visibility; notification = re-engagement |
| Recalibrate action | App suggests new date; user accepts or picks manually | Removes cognitive load, fits Livra voice |
| Notification time | 9am daily (fixed, v1) | Simple; no user config needed at launch |

---

## Data Model

### `types/goal.ts`
```typescript
export type Goal = {
  id: string;
  user_id: string;
  title: string;
  description?: string;
  status: 'active' | 'queued' | 'completed';
  sort_index: number;
  target_date?: string | null; // ISO 'YYYY-MM-DD', optional
  created_at: string;
  updated_at: string;
  completed_at?: string | null;
};
```

### SQLite migration (`lib/db/index.ts`)
```sql
ALTER TABLE lc_goals ADD COLUMN target_date TEXT;
```
Run once on app update; check column existence before adding (idempotent).

### Supabase migration
Same column added to `goals` table via SQL migration script.

### `state/goalsSlice.ts`
- Include `target_date` in `addGoal`, `updateGoal`, `loadGoals` SQL
- Add action: `updateGoalTargetDate(id: string, date: string): Promise<void>`

---

## Pace Engine

### `lib/paceEngine.ts` — pure functions, no side effects

```typescript
/**
 * Returns a 0–1 completion ratio.
 * daysElapsed is capped at 14 internally.
 */
export function computePace(
  events: MarkEvent[],
  markCount: number,
  daysElapsed: number,
): number

/**
 * Projects a new target date based on current pace.
 * pace=0 floors to today + 30 days.
 */
export function suggestNewTargetDate(
  targetDate: string, // current ISO date
  pace: number,
): string // ISO date

export function isPaceBehind(pace: number): boolean // pace < 0.5
```

**`computePace` logic:**
- window = min(daysElapsed, 14)
- Filter events to last `window` days, count distinct (markId, date) pairs
- pace = count / (markCount × window)
- Returns 1.0 if markCount is 0 or window is 0 (no alert)

**`suggestNewTargetDate` logic:**
- remainingDays = diff(targetDate, today) in days, min 0
- projectedDays = ceil(remainingDays / pace)
- return today + projectedDays days

---

## Hook

### `hooks/usePaceAlert.ts`

Reads active goal, counters (marks), and events from store. Computes:
```typescript
export function usePaceAlert(): {
  isBehind: boolean;
  suggestedDate: string | null; // null if no target_date or goal < 7 days old
  goalTitle: string;
  goalId: string;
}
```

- No alert if goal has no `target_date`
- No alert if goal is < 7 days old
- Schedules/cancels `paceNotification` reactively when `isBehind` changes

---

## UI — Home Screen Banner

### `components/PaceBanner.tsx`

Props: `{ isBehind, goalTitle, goalId, suggestedDate }`

- Hidden when not behind
- Dismiss stored in AsyncStorage: `@livra_pace_banner_dismissed:{goalId}:{YYYY-MM-DD}` — resets daily
- Copy: *"You're running behind on [goal title]. Still doable."*
- **Recalibrate** button → bottom sheet modal
- **×** → dismiss for today

**Recalibrate modal:**
- Shows current target date and suggested new date
- **Accept** → calls `updateGoalTargetDate(goalId, suggestedDate)`, closes modal
- **Pick a date** → native date picker, then same update call

Rendered in `app/(tabs)/home.tsx` above the mark list, below the active goal header.

---

## Notifications

### `lib/notifications/paceNotification.ts`

```typescript
export async function schedulePaceNotification(
  goalId: string,
  goalTitle: string,
): Promise<void>

export async function cancelPaceNotification(goalId: string): Promise<void>
```

- Identifier: `livra-pace-{goalId}`
- DAILY trigger at 09:00
- Copy: *"At your current pace, you're running behind on [goal title]. Still doable."*
- Tapping opens the app to the home screen (banner handles recalibrate CTA)
- `cancelPaceNotification` called when pace recovers or target date is updated

---

## Goal Settings UI

The goal detail/settings screen gains a **Target date** row:
- Displays current target date or "Not set"
- Tapping opens a native date picker
- Saving calls `updateGoalTargetDate`

---

## Out of Scope (Phase 3B)

- Per-mark pace breakdown
- User-configurable alert threshold
- User-configurable notification time (v1 fixed at 9am)
- Android (iOS only at launch)
- Progress % displayed on goal card
