# Phase 3A — Native Integrations Design
**Date:** 2026-05-25
**Status:** Approved
**Author:** Deivi Sierra / Sierra Link LLC

---

## Overview

Livra marks gain optional connections to Apple HealthKit. When a mark is connected, its weekly reflection tier is computed from Health data instead of manual events. The daily check-in remains intentional and manual — Health does not auto-log anything. This is a Livra+ (paid) feature.

---

## Core Decisions

| Decision | Choice | Rationale |
|---|---|---|
| What Health data feeds | Weekly reflection tiers only | Preserves intentional daily check-in |
| How marks connect | Auto-suggest for standard marks (Option C), manual picker for custom | Discoverable without being forced |
| When Health data takes over | Replaces event-based classification (Option A) | Clean single source of truth per mark |
| Fallback when Health is empty | Fall back to events | Never penalize for sync failures |
| Health data persistence | Never stored in SQLite or Supabase | Apple App Store guideline compliance |

---

## Supported HealthKit Types

| Mark identity | HealthKit source | Active-day condition |
|---|---|---|
| Workout / Strength / Exercise | `HKWorkoutActivityType` (any workout) | Any workout session recorded |
| Sleep / Recovery | `HKCategoryTypeIdentifierSleepAnalysis` | Any non-Awake sleep in 8pm–10am window |
| Hydration / Vitality | `HKQuantityTypeIdentifierDietaryWater` | Any water intake logged |
| Mindful / Meditation | `HKCategoryTypeIdentifierMindfulSession` | Any mindful session |
| Steps / Walking | `HKQuantityTypeIdentifierStepCount` | Step count ≥ user's threshold (smart default) |
| Running | `HKWorkoutActivityType` filtered to running | Any running workout |

**Not connectable:** Deep Work (no HealthKit equivalent), Read (no HealthKit source), No Spend (financial).

---

## Architecture

### Layer 1 — HealthKit reader (`lib/health/`)

Pure async functions. No mark knowledge. No side effects.

**`lib/health/healthPermissions.ts`**
```typescript
requestPermissions(types: HealthKitType[]): Promise<void>
hasPermissions(types: HealthKitType[]): Promise<boolean>
// Note: iOS does not report denied state — treat empty data as no activity
```

**`lib/health/healthReader.ts`**
```typescript
readWorkoutDays(weekDates: string[]): Promise<Set<string>>
readSleepDays(weekDates: string[]): Promise<Set<string>>
  // Sleep window: 8pm day-1 to 10am day, any non-Awake category value
readHydrationDays(weekDates: string[]): Promise<Set<string>>
readMindfulDays(weekDates: string[]): Promise<Set<string>>
readStepDays(weekDates: string[], stepGoal: number): Promise<Set<string>>
readRunningDays(weekDates: string[]): Promise<Set<string>>
```

**`lib/health/healthLearner.ts`** — reads Health history to suggest smart defaults
```typescript
suggestStepGoal(): Promise<number | null>
  // Read 30-day step history → 80% of average, rounded to nearest 500
  // Returns null if no step data

suggestWakeTime(): Promise<string | null>
  // Read last 14 nights of sleep analysis → median wake time (end of sleep records)
  // Returns HH:MM string (local time) or null if no sleep data
```

**`lib/health/healthTypes.ts`** — constants
```typescript
export type HealthKitType =
  | 'workout' | 'sleep' | 'hydration' | 'mindful' | 'steps' | 'running';

export const HEALTH_KIT_PERMISSIONS: Record<HealthKitType, string[]> = {
  workout: ['Workout'],
  sleep: ['SleepAnalysis'],
  hydration: ['DietaryWater'],
  mindful: ['MindfulSession'],
  steps: ['StepCount'],
  running: ['Workout', 'DistanceWalkingRunning'],
};
```

### Layer 2 — Mark data model

**SQLite migration** (`lib/db/index.ts`): run once on app update, check column existence before adding.
```sql
ALTER TABLE lc_counters ADD COLUMN health_kit_type TEXT;
ALTER TABLE lc_counters ADD COLUMN health_kit_config TEXT; -- JSON: { stepGoal: number } for steps type, null otherwise
```

**Supabase migration**: same two columns added to the `counters` table via SQL migration script.

**TypeScript type** (`types/index.ts` or `types/counter.ts`):
```typescript
health_kit_type?: HealthKitType | null;
health_kit_config?: { stepGoal?: number } | null; // parsed from JSON string in DB
```

**Sync**: `health_kit_type` and `health_kit_config` are included in the existing counter sync. HealthKit *data* (workout sessions, sleep records, etc.) is never stored in SQLite or Supabase.

### Layer 3 — Weekly reflection integration

**Updated `lib/weeklyReflectionLogic.ts`:**
```typescript
export function classifyMarkTier(
  markId: string,
  events: MarkEvent[],
  weekDates: string[],
  isFirstWeek: boolean,
  healthDays?: Set<string>,   // NEW: Health-sourced active dates
): ReflectionTier {
  if (isFirstWeek) return 'first_week';

  const activeDates = healthDays && healthDays.size > 0
    ? healthDays                          // Health replaces events for connected marks
    : new Set(events.filter(...).map(e => e.occurred_local_date));

  // threshold logic unchanged
}
```

**New entry point `buildReflectionItems`** in `lib/weeklyReflectionLogic.ts`:
```typescript
export async function buildReflectionItems(
  marks: Mark[],
  events: MarkEvent[],
  weekDates: string[],
  weekStart: string,
): Promise<ReflectionItem[]> {
  return Promise.all(marks.map(async mark => {
    let healthDays: Set<string> | undefined;

    if (mark.health_kit_type) {
      try {
        healthDays = await readHealthDays(mark.health_kit_type, weekDates, mark.health_kit_config);
      } catch {
        // Health read failed — fall back to events silently
      }
    }

    const firstWeek = isMarkFirstWeek(mark.created_at, weekStart);
    const tier = classifyMarkTier(mark.id, events, weekDates, firstWeek, healthDays);
    const copy = getReflectionCopy(tier, mark.id, weekStart);
    return { mark, tier, title: copy.title, body: copy.body };
  }));
}
```

`tracking.tsx` updates its `weeklyReflectionItems` useMemo to await `buildReflectionItems` (switching from sync to async, using `useEffect` + state or a custom hook).

---

## Mark Connection UI

### Settings surface (every mark)

Every mark settings screen gains a "Connect to Apple Health" row. Tapping it:
1. If not Livra+: show paywall
2. If Livra+: show a picker of supported HealthKit types with descriptions
3. On selection:
   - If Steps: run `suggestStepGoal()` and show a pre-filled number input; user can adjust
   - All types: request permissions for the selected type
   - Save `health_kit_type` (and `health_kit_config` for steps) to the mark

### First-open prompt (auto-suggest)

For marks whose name matches a known Health category (case-insensitive substring match: "workout", "exercise", "strength", "sleep", "recovery", "hydration", "water", "mindful", "meditation", "run", "running", "steps", "walk"), show a dismissible banner once:

> "Connect [Mark name] to Apple Health to power your weekly reflection."

Banner shows once. After dismissal or connection, never shown again (persisted in AsyncStorage per mark ID).

Prompt is gated by Livra+. Non-pro users see the prompt but tapping "Connect" opens the paywall.

### Auto-suggest detection

Name matching uses case-insensitive substring check. Match priority (first match wins):
1. sleep / recovery → `sleep`
2. workout / exercise / strength / gym → `workout`
3. run / running → `running`
4. hydration / water / vitality → `hydration`
5. mindful / meditation / breathe → `mindful`
6. steps / walk / walking → `steps`

---

## Sleep Morning Notification

A scheduled daily local notification for users with the Sleep mark connected to Health.

**Behavior:**
- Fires at user's chosen wake time (default: computed from `suggestWakeTime()`)
- If `suggestWakeTime()` returns null: show a time picker on first connection, no default
- Copy: *"Your Sleep mark is waiting. How'd last night go?"*
- Tapping navigates to the check-in screen with Sleep mark pre-selected (or general check-in if Sleep mark isn't active)
- Livra+ only
- Scheduled via `expo-notifications` (existing infrastructure)
- Independent of the existing daily goal reminder
- User can adjust the time in mark settings or in Settings → Notifications

**Storage:** Wake time preference stored in AsyncStorage under the mark's ID: `@livra_sleep_notif_time:{markId}`.

---

## App Store & Compliance

### `app.json` additions
```json
{
  "expo": {
    "ios": {
      "infoPlist": {
        "NSHealthShareUsageDescription": "Livra reads your workout, sleep, and activity data to power your weekly reflection. Your health data is never stored on our servers."
      },
      "entitlements": {
        "com.apple.developer.healthkit": true,
        "com.apple.developer.healthkit.access": []
      }
    },
    "plugins": [
      ["react-native-health", {
        "NSHealthShareUsageDescription": "Livra reads your workout, sleep, and activity data to power your weekly reflection."
      }]
    ]
  }
}
```

### Declared HealthKit data types (App Store submission)
- HKWorkoutActivityType (read)
- HKCategoryTypeIdentifierSleepAnalysis (read)
- HKQuantityTypeIdentifierDietaryWater (read)
- HKCategoryTypeIdentifierMindfulSession (read)
- HKQuantityTypeIdentifierStepCount (read)
- HKQuantityTypeIdentifierDistanceWalkingRunning (read)

### Rules
- Read-only access. Livra never writes to HealthKit.
- HealthKit data is never stored in SQLite, Supabase, or any external service.
- Permissions requested lazily (at connection time), never at app launch.
- All HealthKit features gated behind Livra+ subscription.

---

## Library

**`react-native-health`** (v2.x)
- Most established RN HealthKit library
- Requires EAS build (not compatible with Expo Go)
- Development requires: `eas build --profile development`

---

## Testing Strategy

HealthKit reader functions are abstracted behind interfaces so they can be mocked in Jest:

```typescript
// lib/health/__mocks__/healthReader.ts
export const readWorkoutDays = jest.fn().mockResolvedValue(new Set<string>());
// etc.
```

Unit tests cover:
- `classifyMarkTier` with `healthDays` parameter (replaces events)
- `classifyMarkTier` fallback when `healthDays` is empty (uses events)
- `buildReflectionItems` with mixed connected/unconnected marks
- `suggestStepGoal` logic (given step history array → expected threshold)
- `suggestWakeTime` logic (given sleep records → expected median time)
- Auto-suggest name matching
- SQLite migration idempotency (column already exists → no-op)

HealthKit integration itself is tested via EAS development build on device.

---

## Out of Scope (Phase 3A)

- Writing to HealthKit
- Real-time / background Health data sync
- Deep Work timer (no HealthKit equivalent)
- Read / No Spend marks (no Health source)
- Android Google Fit integration (iOS only at launch)
- Alarm app integration (iOS doesn't allow programmatic alarm creation)
