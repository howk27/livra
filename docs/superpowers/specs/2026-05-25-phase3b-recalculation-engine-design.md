# Phase 3B — Recalculation Engine Design
**Date:** 2026-05-25
**Status:** Draft — pending review
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
| Alert threshold | Projected miss ≥ 7 days at current pace | Actionable gap; ignores minor slippage |
| Alert surfaces | In-app banner + pace notification (max 2 per slump) | Banner = persistent visibility; notification = re-engagement |
| Recalibrate action | App suggests new date; user accepts or picks manually | Removes cognitive load, fits Livra voice |
| Notification frequency | Once on first drop below threshold; once again if not recovered after 7 days | Avoids nagging; max 2 per slump |
| Notification timing | User-configurable window (Morning/Midday/Evening); random time within window | Flexibility without overwhelming options |

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

/**
 * Returns how many days late the user will finish at current pace.
 * Returns 0 if on track or ahead.
 */
export function computeProjectedMiss(
  targetDate: string,
  pace: number,
): number // days late (0 = on track)

export function isPaceBehind(projectedMiss: number): boolean // projectedMiss >= 7
```

**`computePace` logic:**
- window = min(daysElapsed, 14)
- Filter events to last `window` days, count distinct (markId, date) pairs
- pace = count / (markCount × window)
- Returns 1.0 if markCount is 0 or window is 0 (no alert)

**`computeProjectedMiss` logic:**
- remainingDays = diff(targetDate, today) in days, min 0
- projectedDays = ceil(remainingDays / pace) (pace=0 → today + 30 as floor)
- miss = projectedDays − remainingDays, min 0

**`suggestNewTargetDate` logic:**
- remainingDays = diff(targetDate, today) in days, min 0
- projectedDays = ceil(remainingDays / pace) (pace=0 → today + 30 as floor)
- return today + projectedDays days

---

## Hook

### `hooks/usePaceAlert.ts`

Reads active goal, counters (marks), and events from store. Computes:
```typescript
export function usePaceAlert(): {
  isBehind: boolean;
  projectedMiss: number; // days late at current pace
  suggestedDate: string | null; // null if no target_date or goal < 7 days old
  goalTitle: string;
  goalId: string;
}
```

- No alert if goal has no `target_date`
- No alert if goal is < 7 days old
- Schedules pace notification on first `isBehind` transition; schedules follow-up if still behind after 7 days; cancels when pace recovers or target date is updated
- Tracks notification state in AsyncStorage: `@livra_pace_notif_state:{goalId}` — stores `{ firedAt: ISO date | null, followUpFiredAt: ISO date | null }`

---

## UI — Home Screen Banner

### `components/PaceBanner.tsx`

Props: `{ isBehind, goalTitle, goalId, suggestedDate }`

- Hidden when not behind
- Dismiss stored in AsyncStorage: `@livra_pace_banner_dismissed:{goalId}:{YYYY-MM-DD}` — resets daily
- Copy: *"At this pace, [goal title] finishes about [N] days late. Still fixable."*
- **Recalibrate** button → bottom sheet modal
- **×** → dismiss for today

**Recalibrate modal (single bottom sheet):**
- Primary action: **"Yes, update it"** → calls `updateGoalTargetDate(goalId, suggestedDate)`, closes modal
- Secondary: small text link below — **"Pick a different date"** → opens native date picker, then same update call

Rendered in `app/(tabs)/home.tsx` above the mark list, below the active goal header.

---

## Notifications

### `lib/notifications/paceNotification.ts`

```typescript
export async function schedulePaceNotification(
  goalId: string,
  goalTitle: string,
  projectedMiss: number,
  window: 'morning' | 'midday' | 'evening',
): Promise<void>

export async function cancelPaceNotification(goalId: string): Promise<void>
```

**Frequency:**
- Fires once when pace first drops below threshold (projected miss ≥ 7 days)
- Fires a second time (follow-up) if pace hasn't recovered after 7 days
- Maximum 2 notifications per goal per slump; resets when pace recovers or target date is updated

**Timing:**
- User-configurable window stored in AsyncStorage: `@livra_pace_notification_window`
  - `morning` → random time between 7:00–9:00am (default)
  - `midday` → random time between 11:00am–1:00pm
  - `evening` → random time between 6:00–8:00pm
- Random minute within window selected at schedule time

**Identifiers:** `livra-pace-{goalId}-1` (first), `livra-pace-{goalId}-2` (follow-up)

**Copy:** *"At your current pace, [goal title] finishes about [N] days late. Still fixable."*

Tapping opens the app to the home screen (banner handles recalibrate CTA).

**Settings surface:** Settings → Notifications gains a **"Pace alerts"** row with three options (Morning / Midday / Evening).

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
- Android (iOS only at launch)
- Progress % displayed on goal card
