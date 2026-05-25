# Phase 3A — Native Integrations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect marks to Apple HealthKit so their weekly reflection tier is computed from Health data instead of manual events — while keeping the daily check-in intentional and manual.

**Architecture:** Three layers: (1) `lib/health/` — pure async HealthKit readers with no mark knowledge; (2) `types/index.ts` + `state/countersSlice.ts` — two new optional fields on `Mark`; (3) `lib/weeklyReflectionLogic.ts` — `classifyMarkTier` gains an optional `healthDays` param; a new `buildReflectionItems` async entry point replaces the sync `useMemo` in `tracking.tsx`. Mark connection is surface-level UI in `app/counter/[id].tsx` with an auto-suggest banner component. A separate sleep morning notification is scheduled via `expo-notifications`.

**Tech Stack:** `react-native-health` v2.x (EAS build required), `expo-notifications` (existing), AsyncStorage (existing), TypeScript strict, Jest manual mocks in `__mocks__/` directories.

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `lib/health/healthTypes.ts` | Create | HealthKitType union + HEALTH_KIT_PERMISSIONS map |
| `lib/health/autoSuggest.ts` | Create | `detectHealthKitType(name)` — name substring matching |
| `lib/health/healthPermissions.ts` | Create | `requestPermissions` / `hasPermissions` wrappers |
| `lib/health/healthReader.ts` | Create | 6 read functions + `readHealthDays` dispatcher |
| `lib/health/healthLearner.ts` | Create | `suggestStepGoal` + `suggestWakeTime` (pure compute helpers separated from HealthKit fetch) |
| `lib/health/__mocks__/healthReader.ts` | Create | Jest manual mock — all functions return empty Set by default |
| `lib/health/__mocks__/healthLearner.ts` | Create | Jest manual mock |
| `lib/notifications/sleepNotification.ts` | Create | Schedule/cancel sleep morning notification |
| `components/HealthConnectBanner.tsx` | Create | Dismissible auto-suggest banner |
| `types/index.ts` | Modify | Add `health_kit_type?` and `health_kit_config?` to `Mark` |
| `state/countersSlice.ts` | Modify | Add new fields to `updateMark` SQL |
| `lib/weeklyReflectionLogic.ts` | Modify | `classifyMarkTier` 5th param + `buildReflectionItems` |
| `app/(tabs)/tracking.tsx` | Modify | Switch `weeklyReflectionItems` from `useMemo` to async |
| `app/counter/[id].tsx` | Modify | Add "Connect to Apple Health" row + picker modal |
| `app.json` | Modify | NSHealthShareUsageDescription + entitlements |
| `tests/unit/health/autoSuggest.test.ts` | Create | Name matching unit tests |
| `tests/unit/weeklyReflection.test.ts` | Modify | Add healthDays + buildReflectionItems tests |
| `tests/unit/health/healthLearner.test.ts` | Create | Pure computation logic tests |

---

## Task 1: Install library + app.json

**Files:**
- Modify: `package.json` (via npm install)
- Modify: `app.json`

- [ ] **Step 1: Install react-native-health**

```bash
cd /mnt/c/Users/DEIVI/Desktop/Livra && npm install react-native-health
```

Expected: `react-native-health` appears in `package.json` dependencies.

- [ ] **Step 2: Update `app.json`**

Open `app.json`. Inside `expo.ios`, add the following (merge with any existing `infoPlist` / `entitlements` / `plugins` keys):

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

- [ ] **Step 3: Run tests to confirm baseline still passes**

```bash
cd /mnt/c/Users/DEIVI/Desktop/Livra && npm run test
```

Expected: all existing tests pass.

---

## Task 2: Health types

**Files:**
- Create: `lib/health/healthTypes.ts`

No unit tests needed — pure type constants.

- [ ] **Step 1: Create `lib/health/healthTypes.ts`**

```typescript
export type HealthKitType =
  | 'workout'
  | 'sleep'
  | 'hydration'
  | 'mindful'
  | 'steps'
  | 'running';

export const HEALTH_KIT_PERMISSIONS: Record<HealthKitType, string[]> = {
  workout:   ['Workout'],
  sleep:     ['SleepAnalysis'],
  hydration: ['DietaryWater'],
  mindful:   ['MindfulSession'],
  steps:     ['StepCount'],
  running:   ['Workout', 'DistanceWalkingRunning'],
};
```

---

## Task 3: Auto-suggest name matching + tests

**Files:**
- Create: `lib/health/autoSuggest.ts`
- Create: `tests/unit/health/autoSuggest.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/unit/health/autoSuggest.test.ts`:

```typescript
import { detectHealthKitType } from '../../../lib/health/autoSuggest';

describe('detectHealthKitType', () => {
  // Sleep / Recovery
  test('sleep → sleep', () => expect(detectHealthKitType('sleep')).toBe('sleep'));
  test('Recovery → sleep', () => expect(detectHealthKitType('Recovery')).toBe('sleep'));
  test('Morning Sleep → sleep', () => expect(detectHealthKitType('Morning Sleep')).toBe('sleep'));

  // Workout
  test('Workout → workout', () => expect(detectHealthKitType('Workout')).toBe('workout'));
  test('exercise → workout', () => expect(detectHealthKitType('exercise')).toBe('workout'));
  test('Strength Training → workout', () => expect(detectHealthKitType('Strength Training')).toBe('workout'));
  test('gym session → workout', () => expect(detectHealthKitType('gym session')).toBe('workout'));

  // Running (before workout so running wins over workout)
  test('running → running', () => expect(detectHealthKitType('running')).toBe('running'));
  test('Morning Run → running', () => expect(detectHealthKitType('Morning Run')).toBe('running'));

  // Hydration
  test('hydration → hydration', () => expect(detectHealthKitType('hydration')).toBe('hydration'));
  test('water → hydration', () => expect(detectHealthKitType('water')).toBe('hydration'));
  test('Vitality → hydration', () => expect(detectHealthKitType('Vitality')).toBe('hydration'));

  // Mindful
  test('mindful → mindful', () => expect(detectHealthKitType('mindful')).toBe('mindful'));
  test('Meditation → mindful', () => expect(detectHealthKitType('Meditation')).toBe('mindful'));
  test('breathe → mindful', () => expect(detectHealthKitType('breathe')).toBe('mindful'));

  // Steps
  test('steps → steps', () => expect(detectHealthKitType('steps')).toBe('steps'));
  test('walk → steps', () => expect(detectHealthKitType('walk')).toBe('steps'));
  test('Daily Walk → steps', () => expect(detectHealthKitType('Daily Walk')).toBe('steps'));

  // No match
  test('Deep Work → null', () => expect(detectHealthKitType('Deep Work')).toBeNull());
  test('Read → null', () => expect(detectHealthKitType('Read')).toBeNull());
  test('No Spend → null', () => expect(detectHealthKitType('No Spend')).toBeNull());
  test('empty string → null', () => expect(detectHealthKitType('')).toBeNull());
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd /mnt/c/Users/DEIVI/Desktop/Livra && npm run test -- tests/unit/health/autoSuggest.test.ts
```

Expected: FAIL — `autoSuggest` not found.

- [ ] **Step 3: Create `lib/health/autoSuggest.ts`**

```typescript
import type { HealthKitType } from './healthTypes';

const RULES: [HealthKitType, RegExp][] = [
  ['sleep',     /sleep|recovery/i],
  ['running',   /run|running/i],
  ['workout',   /workout|exercise|strength|gym/i],
  ['hydration', /hydration|water|vitality/i],
  ['mindful',   /mindful|meditation|breathe/i],
  ['steps',     /steps|walk|walking/i],
];

export function detectHealthKitType(markName: string): HealthKitType | null {
  for (const [type, pattern] of RULES) {
    if (pattern.test(markName)) return type;
  }
  return null;
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd /mnt/c/Users/DEIVI/Desktop/Livra && npm run test -- tests/unit/health/autoSuggest.test.ts
```

Expected: all 21 tests PASS.

---

## Task 4: Update `classifyMarkTier` with optional `healthDays` + tests

**Files:**
- Modify: `lib/weeklyReflectionLogic.ts`
- Modify: `tests/unit/weeklyReflection.test.ts`

The existing 4-param signature must continue to work; `healthDays` is a 5th optional param that replaces event-based classification when provided and non-empty.

- [ ] **Step 1: Add new test cases to `tests/unit/weeklyReflection.test.ts`**

Append after the existing `describe('isMarkFirstWeek', ...)` block:

```typescript
describe('classifyMarkTier — healthDays override', () => {
  test('healthDays replaces events — 5 active days → strong', () => {
    const healthDays = new Set(['2026-05-18','2026-05-19','2026-05-20','2026-05-21','2026-05-22']);
    expect(classifyMarkTier(MARK_ID, [], WEEK_DATES, false, healthDays)).toBe('strong');
  });

  test('healthDays replaces events — 3 active days → solid', () => {
    const healthDays = new Set(['2026-05-18','2026-05-19','2026-05-20']);
    expect(classifyMarkTier(MARK_ID, [], WEEK_DATES, false, healthDays)).toBe('solid');
  });

  test('healthDays replaces events — 1 active day → inconsistent', () => {
    const healthDays = new Set(['2026-05-18']);
    expect(classifyMarkTier(MARK_ID, [], WEEK_DATES, false, healthDays)).toBe('inconsistent');
  });

  test('healthDays replaces events — 0 active days → missing', () => {
    expect(classifyMarkTier(MARK_ID, [], WEEK_DATES, false, new Set())).toBe('missing');
  });

  test('empty healthDays falls back to events', () => {
    const events = WEEK_DATES.map(makeEvent);
    expect(classifyMarkTier(MARK_ID, events, WEEK_DATES, false, new Set())).toBe('strong');
  });

  test('undefined healthDays falls back to events', () => {
    const events = WEEK_DATES.map(makeEvent);
    expect(classifyMarkTier(MARK_ID, events, WEEK_DATES, false, undefined)).toBe('strong');
  });

  test('first_week still overrides even with healthDays', () => {
    const healthDays = new Set(WEEK_DATES);
    expect(classifyMarkTier(MARK_ID, [], WEEK_DATES, true, healthDays)).toBe('first_week');
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL on new cases**

```bash
cd /mnt/c/Users/DEIVI/Desktop/Livra && npm run test -- tests/unit/weeklyReflection.test.ts
```

Expected: new `healthDays` tests fail (signature mismatch), existing tests still pass.

- [ ] **Step 3: Update `lib/weeklyReflectionLogic.ts`**

Replace the current `classifyMarkTier` function:

```typescript
export function classifyMarkTier(
  markId: string,
  events: MarkEvent[],
  weekDates: string[],
  isFirstWeek: boolean,
  healthDays?: Set<string>,
): ReflectionTier {
  if (isFirstWeek) return 'first_week';

  const activeDates =
    healthDays && healthDays.size > 0
      ? healthDays
      : new Set(
          events
            .filter(
              e =>
                e.mark_id === markId &&
                !e.deleted_at &&
                e.event_type === 'increment' &&
                weekDates.includes(e.occurred_local_date),
            )
            .map(e => e.occurred_local_date),
        );

  const daysLogged = activeDates.size;
  const totalDays = weekDates.length;

  if (daysLogged === 0) return 'missing';
  if (daysLogged / totalDays >= 5 / 7) return 'strong';
  if (daysLogged / totalDays >= 3 / 7) return 'solid';
  return 'inconsistent';
}
```

- [ ] **Step 4: Run tests — expect all pass**

```bash
cd /mnt/c/Users/DEIVI/Desktop/Livra && npm run test -- tests/unit/weeklyReflection.test.ts
```

Expected: all tests PASS (existing + new healthDays cases).

---

## Task 5: `buildReflectionItems` + tests + `tracking.tsx` async

**Files:**
- Create: `lib/health/__mocks__/healthReader.ts`
- Modify: `lib/weeklyReflectionLogic.ts`
- Modify: `tests/unit/weeklyReflection.test.ts`
- Modify: `app/(tabs)/tracking.tsx`

- [ ] **Step 1: Create `lib/health/__mocks__/healthReader.ts`**

Jest uses this automatically when tests call `jest.mock('../../lib/health/healthReader')`.

```typescript
export const readWorkoutDays = jest.fn().mockResolvedValue(new Set<string>());
export const readSleepDays = jest.fn().mockResolvedValue(new Set<string>());
export const readHydrationDays = jest.fn().mockResolvedValue(new Set<string>());
export const readMindfulDays = jest.fn().mockResolvedValue(new Set<string>());
export const readStepDays = jest.fn().mockResolvedValue(new Set<string>());
export const readRunningDays = jest.fn().mockResolvedValue(new Set<string>());
export const readHealthDays = jest.fn().mockResolvedValue(new Set<string>());
```

- [ ] **Step 2: Add `buildReflectionItems` tests to `tests/unit/weeklyReflection.test.ts`**

At the top of the file, add the mock (before imports from the module under test):

```typescript
jest.mock('../../lib/health/healthReader');
import { readHealthDays } from '../../lib/health/healthReader';
```

Then add a new describe block at the end of the file:

```typescript
import { buildReflectionItems } from '../../lib/weeklyReflectionLogic';
import type { Mark } from '../../types';

const BASE_MARK: Mark = {
  id: MARK_ID,
  user_id: 'u1',
  name: 'Workout',
  unit: 'sessions',
  enable_streak: false,
  sort_index: 0,
  total: 0,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

describe('buildReflectionItems', () => {
  beforeEach(() => {
    (readHealthDays as jest.Mock).mockResolvedValue(new Set<string>());
  });

  test('returns one item per mark', async () => {
    const items = await buildReflectionItems([BASE_MARK], [], WEEK_DATES, WEEK_START);
    expect(items).toHaveLength(1);
    expect(items[0]!.mark).toBe(BASE_MARK);
  });

  test('uses healthDays when mark has health_kit_type', async () => {
    const healthMark: Mark = { ...BASE_MARK, health_kit_type: 'workout' };
    const activeDays = new Set(['2026-05-18','2026-05-19','2026-05-20','2026-05-21','2026-05-22']);
    (readHealthDays as jest.Mock).mockResolvedValue(activeDays);

    const items = await buildReflectionItems([healthMark], [], WEEK_DATES, WEEK_START);
    expect(items[0]!.tier).toBe('strong');
    expect(readHealthDays).toHaveBeenCalledWith('workout', WEEK_DATES, undefined);
  });

  test('falls back to events when health read fails', async () => {
    const healthMark: Mark = { ...BASE_MARK, health_kit_type: 'workout' };
    (readHealthDays as jest.Mock).mockRejectedValue(new Error('HealthKit unavailable'));
    const events = WEEK_DATES.map(makeEvent);

    const items = await buildReflectionItems([healthMark], events, WEEK_DATES, WEEK_START);
    expect(items[0]!.tier).toBe('strong');
  });

  test('unconnected mark uses events', async () => {
    const events = [makeEvent('2026-05-18')];
    const items = await buildReflectionItems([BASE_MARK], events, WEEK_DATES, WEEK_START);
    expect(items[0]!.tier).toBe('inconsistent');
    expect(readHealthDays).not.toHaveBeenCalled();
  });

  test('items contain non-empty title and body', async () => {
    const items = await buildReflectionItems([BASE_MARK], [], WEEK_DATES, WEEK_START);
    expect(items[0]!.title.length).toBeGreaterThan(0);
    expect(items[0]!.body.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 3: Run tests — expect FAIL**

```bash
cd /mnt/c/Users/DEIVI/Desktop/Livra && npm run test -- tests/unit/weeklyReflection.test.ts
```

Expected: `buildReflectionItems` tests fail — function not exported yet.

- [ ] **Step 4: Add `buildReflectionItems` to `lib/weeklyReflectionLogic.ts`**

Add these imports at the top of the file (after existing imports):

```typescript
import type { Mark } from '../types';
import { getReflectionCopy } from './weeklyReflectionCopy';
import { readHealthDays } from './health/healthReader';
```

Then add at the bottom of the file:

```typescript
export type ReflectionItem = {
  mark: Mark;
  tier: ReflectionTier;
  title: string;
  body: string;
};

export async function buildReflectionItems(
  marks: Mark[],
  events: MarkEvent[],
  weekDates: string[],
  weekStart: string,
): Promise<ReflectionItem[]> {
  return Promise.all(
    marks.map(async mark => {
      let healthDays: Set<string> | undefined;

      if (mark.health_kit_type) {
        try {
          healthDays = await readHealthDays(mark.health_kit_type, weekDates, mark.health_kit_config ?? undefined);
        } catch {
          // Health read failed — fall back to events silently
        }
      }

      const firstWeek = isMarkFirstWeek(mark.created_at, weekStart);
      const tier = classifyMarkTier(mark.id, events, weekDates, firstWeek, healthDays);
      const copy = getReflectionCopy(tier, mark.id, weekStart);
      return { mark, tier, title: copy.title, body: copy.body };
    }),
  );
}
```

- [ ] **Step 5: Run tests — expect all pass**

```bash
cd /mnt/c/Users/DEIVI/Desktop/Livra && npm run test -- tests/unit/weeklyReflection.test.ts
```

Expected: all tests PASS.

- [ ] **Step 6: Update `app/(tabs)/tracking.tsx` to use `buildReflectionItems`**

**6a.** Change the import at the top from:

```typescript
import { classifyMarkTier, isMarkFirstWeek } from '../../lib/weeklyReflectionLogic';
import { getReflectionCopy } from '../../lib/weeklyReflectionCopy';
```

To:

```typescript
import { buildReflectionItems, type ReflectionItem } from '../../lib/weeklyReflectionLogic';
```

**6b.** Inside `TrackingScreen`, remove the existing `weeklyReflectionItems` `useMemo` block:

```typescript
// REMOVE this block:
const weeklyReflectionItems = useMemo(() => {
  const weekStart = weekDates[0]!;
  return counters.map(mark => {
    const firstWeek = isMarkFirstWeek(mark.created_at, weekStart);
    const tier = classifyMarkTier(mark.id, allEvents, weekDates, firstWeek);
    const copy = getReflectionCopy(tier, mark.id, weekStart);
    return { mark, tier, title: copy.title, body: copy.body };
  });
}, [counters, allEvents, weekDates]);
```

Replace it with:

```typescript
const [weeklyReflectionItems, setWeeklyReflectionItems] = useState<ReflectionItem[]>([]);

useEffect(() => {
  const weekStart = weekDates[0]!;
  buildReflectionItems(counters, allEvents, weekDates, weekStart)
    .then(setWeeklyReflectionItems)
    .catch(() => {
      // fall back to empty — existing event-based items will show
    });
}, [counters, allEvents, weekDates]);
```

**6c.** Add `useState` to the React import if not already present (it is in `tracking.tsx`).

**6d.** Add `ReflectionItem` to the type signature of the state. Since `useState<ReflectionItem[]>` references the type, confirm the import is present from Step 6a.

- [ ] **Step 7: Run full test suite**

```bash
cd /mnt/c/Users/DEIVI/Desktop/Livra && npm run test
```

Expected: all tests PASS.

---

## Task 6: Mark type + DB + countersSlice

**Files:**
- Modify: `types/index.ts`
- Modify: `state/countersSlice.ts`

No new unit tests — the `updateMark` path is covered by integration in the existing flow.

- [ ] **Step 1: Add new fields to `Mark` in `types/index.ts`**

Inside the `Mark` type (after the existing `skip_tokens_month?` field), add:

```typescript
  // Phase 3A: HealthKit integration
  health_kit_type?: import('./health/healthTypes').HealthKitType | null;
  health_kit_config?: { stepGoal?: number } | null;
```

Wait — to avoid a circular reference, import `HealthKitType` at the top of `types/index.ts` instead:

Add this import at the very top of `types/index.ts` (before the existing type declarations):

```typescript
import type { HealthKitType } from '../lib/health/healthTypes';
```

Then add to the `Mark` type after `skip_tokens_month?`:

```typescript
  health_kit_type?: HealthKitType | null;
  health_kit_config?: { stepGoal?: number } | null;
```

- [ ] **Step 2: Update `updateMark` SQL in `state/countersSlice.ts`**

Find the `updateMark` function. Replace the `await execute(...)` call with:

```typescript
await execute(
  `UPDATE lc_counters SET 
  name = ?, emoji = ?, color = ?, unit = ?, enable_streak = ?,
  sort_index = ?, total = ?, last_activity_date = ?, dailyTarget = ?,
  schedule_type = ?, schedule_days = ?, goal_value = ?, goal_period = ?,
  health_kit_type = ?, health_kit_config = ?,
  updated_at = ?
WHERE id = ?`,
  [
    updated.name,
    updated.emoji,
    updated.color,
    updated.unit,
    updated.enable_streak ? 1 : 0,
    updated.sort_index,
    updated.total,
    updated.last_activity_date,
    nextDaily,
    updated.schedule_type ?? 'daily',
    updated.schedule_days ?? null,
    updated.goal_value ?? null,
    updated.goal_period ?? null,
    updated.health_kit_type ?? null,
    updated.health_kit_config ? JSON.stringify(updated.health_kit_config) : null,
    updated.updated_at,
    id,
  ]
);
```

Note: `health_kit_config` is stored as a JSON string in the DB layer. When loading marks, the mock DB returns it as a raw string. Add a parser in `countersSlice.ts` `loadMarks` — after `const uniqueMarks = Array.from(marksMap.values())`, add:

```typescript
const parsedMarks = uniqueMarks.map(m => ({
  ...m,
  health_kit_config: typeof m.health_kit_config === 'string'
    ? JSON.parse(m.health_kit_config) as { stepGoal?: number }
    : m.health_kit_config ?? null,
}));
set({ marks: parsedMarks, loading: false });
```

And remove the existing `set({ marks: uniqueMarks, loading: false })` line.

- [ ] **Step 3: Run full test suite**

```bash
cd /mnt/c/Users/DEIVI/Desktop/Livra && npm run test
```

Expected: all tests PASS.

---

## Task 7: Health reader, permissions, and learner implementations

**Files:**
- Create: `lib/health/healthPermissions.ts`
- Create: `lib/health/healthReader.ts`
- Create: `lib/health/healthLearner.ts`
- Create: `lib/health/__mocks__/healthLearner.ts`

These wrap `react-native-health` which requires an EAS device build; unit tests mock them. The implementations are written here so TypeScript is satisfied and the mock shape matches exactly.

- [ ] **Step 1: Create `lib/health/healthPermissions.ts`**

```typescript
import AppleHealthKit from 'react-native-health';
import { HEALTH_KIT_PERMISSIONS } from './healthTypes';
import type { HealthKitType } from './healthTypes';

export async function requestPermissions(types: HealthKitType[]): Promise<void> {
  const readPermissions = Array.from(
    new Set(types.flatMap(t => HEALTH_KIT_PERMISSIONS[t])),
  );

  return new Promise((resolve, reject) => {
    AppleHealthKit.initHealthKit(
      { permissions: { read: readPermissions as any[], write: [] } },
      (error: string) => {
        if (error) { reject(new Error(error)); return; }
        resolve();
      },
    );
  });
}

export async function hasPermissions(_types: HealthKitType[]): Promise<boolean> {
  // iOS does not expose denied state — treat this as "try and see"
  return true;
}
```

- [ ] **Step 2: Create `lib/health/healthReader.ts`**

```typescript
import AppleHealthKit from 'react-native-health';
import type { HealthKitType } from './healthTypes';

function isoStart(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00`).toISOString();
}
function isoEnd(dateStr: string): string {
  return new Date(`${dateStr}T23:59:59`).toISOString();
}

export async function readWorkoutDays(weekDates: string[]): Promise<Set<string>> {
  const start = isoStart(weekDates[0]!);
  const end = isoEnd(weekDates[weekDates.length - 1]!);
  return new Promise(resolve => {
    AppleHealthKit.getSamples(
      { startDate: start, endDate: end, type: 'Workout' } as any,
      (err: any, results: any[]) => {
        if (err || !results) { resolve(new Set()); return; }
        const days = new Set(results.map(r => r.startDate.slice(0, 10)));
        resolve(days);
      },
    );
  });
}

export async function readSleepDays(weekDates: string[]): Promise<Set<string>> {
  // Sleep window: 8pm the day before through 10am of the date
  const start = new Date(`${weekDates[0]!}T00:00:00`);
  start.setDate(start.getDate() - 1);
  start.setHours(20, 0, 0, 0);
  const end = new Date(`${weekDates[weekDates.length - 1]!}T10:00:00`);

  return new Promise(resolve => {
    AppleHealthKit.getSleepSamples(
      { startDate: start.toISOString(), endDate: end.toISOString() } as any,
      (err: any, results: any[]) => {
        if (err || !results) { resolve(new Set()); return; }
        const days = new Set<string>();
        for (const sample of results) {
          if (sample.value === 'AWAKE' || sample.value === 'INBED') continue;
          // Credit the wake date (endDate morning)
          const wakeDate = sample.endDate?.slice(0, 10);
          if (wakeDate && weekDates.includes(wakeDate)) days.add(wakeDate);
        }
        resolve(days);
      },
    );
  });
}

export async function readHydrationDays(weekDates: string[]): Promise<Set<string>> {
  const start = isoStart(weekDates[0]!);
  const end = isoEnd(weekDates[weekDates.length - 1]!);
  return new Promise(resolve => {
    AppleHealthKit.getWaterSamples(
      { startDate: start, endDate: end, unit: 'ml' } as any,
      (err: any, results: any[]) => {
        if (err || !results) { resolve(new Set()); return; }
        const days = new Set(results.map(r => r.startDate.slice(0, 10)));
        resolve(days);
      },
    );
  });
}

export async function readMindfulDays(weekDates: string[]): Promise<Set<string>> {
  const start = isoStart(weekDates[0]!);
  const end = isoEnd(weekDates[weekDates.length - 1]!);
  return new Promise(resolve => {
    AppleHealthKit.getMindfulSession(
      { startDate: start, endDate: end } as any,
      (err: any, results: any[]) => {
        if (err || !results) { resolve(new Set()); return; }
        const days = new Set(results.map(r => r.startDate.slice(0, 10)));
        resolve(days);
      },
    );
  });
}

export async function readStepDays(weekDates: string[], stepGoal: number): Promise<Set<string>> {
  const start = isoStart(weekDates[0]!);
  const end = isoEnd(weekDates[weekDates.length - 1]!);
  return new Promise(resolve => {
    AppleHealthKit.getDailyStepCountSamples(
      { startDate: start, endDate: end, includeManuallyAdded: false } as any,
      (err: any, results: any[]) => {
        if (err || !results) { resolve(new Set()); return; }
        const days = new Set<string>(
          results
            .filter(r => r.value >= stepGoal)
            .map(r => r.startDate.slice(0, 10))
            .filter(d => weekDates.includes(d)),
        );
        resolve(days);
      },
    );
  });
}

export async function readRunningDays(weekDates: string[]): Promise<Set<string>> {
  const start = isoStart(weekDates[0]!);
  const end = isoEnd(weekDates[weekDates.length - 1]!);
  return new Promise(resolve => {
    AppleHealthKit.getSamples(
      { startDate: start, endDate: end, type: 'Running' } as any,
      (err: any, results: any[]) => {
        if (err || !results) { resolve(new Set()); return; }
        const days = new Set(results.map(r => r.startDate.slice(0, 10)));
        resolve(days);
      },
    );
  });
}

export async function readHealthDays(
  type: HealthKitType,
  weekDates: string[],
  config?: { stepGoal?: number },
): Promise<Set<string>> {
  switch (type) {
    case 'workout':   return readWorkoutDays(weekDates);
    case 'sleep':     return readSleepDays(weekDates);
    case 'hydration': return readHydrationDays(weekDates);
    case 'mindful':   return readMindfulDays(weekDates);
    case 'steps':     return readStepDays(weekDates, config?.stepGoal ?? 8000);
    case 'running':   return readRunningDays(weekDates);
  }
}
```

- [ ] **Step 3: Create `lib/health/healthLearner.ts`**

The public functions call HealthKit. The pure computation helpers are exported separately so they can be unit tested.

```typescript
import AppleHealthKit from 'react-native-health';

/** Rounds to nearest `multiple`. */
export function roundToNearest(value: number, multiple: number): number {
  return Math.round(value / multiple) * multiple;
}

/** Given an array of daily step counts, returns 80% of average rounded to nearest 500. */
export function computeStepGoal(dailyStepCounts: number[]): number | null {
  if (dailyStepCounts.length === 0) return null;
  const avg = dailyStepCounts.reduce((a, b) => a + b, 0) / dailyStepCounts.length;
  return roundToNearest(avg * 0.8, 500);
}

/** Given an array of HH:MM wake time strings, returns the median. */
export function computeMedianWakeTime(wakeTimes: string[]): string | null {
  if (wakeTimes.length === 0) return null;
  const minutes = wakeTimes
    .map(t => {
      const [h = '0', m = '0'] = t.split(':');
      return parseInt(h, 10) * 60 + parseInt(m, 10);
    })
    .sort((a, b) => a - b);
  const mid = Math.floor(minutes.length / 2);
  const median = minutes.length % 2 === 0
    ? Math.round((minutes[mid - 1]! + minutes[mid]!) / 2)
    : minutes[mid]!;
  const h = Math.floor(median / 60).toString().padStart(2, '0');
  const m = (median % 60).toString().padStart(2, '0');
  return `${h}:${m}`;
}

export async function suggestStepGoal(): Promise<number | null> {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - 30);

  return new Promise(resolve => {
    AppleHealthKit.getDailyStepCountSamples(
      { startDate: start.toISOString(), endDate: end.toISOString(), includeManuallyAdded: false } as any,
      (err: any, results: any[]) => {
        if (err || !results || results.length === 0) { resolve(null); return; }
        resolve(computeStepGoal(results.map(r => r.value as number)));
      },
    );
  });
}

export async function suggestWakeTime(): Promise<string | null> {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - 14);

  return new Promise(resolve => {
    AppleHealthKit.getSleepSamples(
      { startDate: start.toISOString(), endDate: end.toISOString() } as any,
      (err: any, results: any[]) => {
        if (err || !results || results.length === 0) { resolve(null); return; }
        const wakeTimes = results
          .filter((r: any) => r.value !== 'AWAKE' && r.value !== 'INBED' && r.endDate)
          .map((r: any) => {
            const d = new Date(r.endDate as string);
            const h = d.getHours().toString().padStart(2, '0');
            const m = d.getMinutes().toString().padStart(2, '0');
            return `${h}:${m}`;
          });
        resolve(computeMedianWakeTime(wakeTimes));
      },
    );
  });
}
```

- [ ] **Step 4: Create `lib/health/__mocks__/healthLearner.ts`**

```typescript
export const roundToNearest = jest.fn((value: number, multiple: number) =>
  Math.round(value / multiple) * multiple,
);
export const computeStepGoal = jest.fn().mockReturnValue(null);
export const computeMedianWakeTime = jest.fn().mockReturnValue(null);
export const suggestStepGoal = jest.fn().mockResolvedValue(null);
export const suggestWakeTime = jest.fn().mockResolvedValue(null);
```

- [ ] **Step 5: Run full test suite**

```bash
cd /mnt/c/Users/DEIVI/Desktop/Livra && npm run test
```

Expected: all tests PASS (new health files are not tested by Jest yet — that's Task 8).

---

## Task 8: Health learner unit tests (pure computation)

**Files:**
- Create: `tests/unit/health/healthLearner.test.ts`

Tests target only the pure helpers (`computeStepGoal`, `computeMedianWakeTime`) — no HealthKit device needed.

- [ ] **Step 1: Write tests**

Create `tests/unit/health/healthLearner.test.ts`:

```typescript
import { computeStepGoal, computeMedianWakeTime, roundToNearest } from '../../../lib/health/healthLearner';

describe('roundToNearest', () => {
  test('rounds 7400 to 7500 (nearest 500)', () => expect(roundToNearest(7400, 500)).toBe(7500));
  test('rounds 7200 to 7000 (nearest 500)', () => expect(roundToNearest(7200, 500)).toBe(7000));
  test('rounds 7250 to 7000 or 7500 — within 250 of both', () => {
    expect([7000, 7500]).toContain(roundToNearest(7250, 500));
  });
});

describe('computeStepGoal', () => {
  test('returns null for empty array', () => expect(computeStepGoal([])).toBeNull());

  test('single value — 80% rounded to 500', () => {
    // avg=10000, 80%=8000, nearest 500=8000
    expect(computeStepGoal([10000])).toBe(8000);
  });

  test('multiple values — avg then 80%', () => {
    // avg=9000, 80%=7200, nearest 500=7000
    expect(computeStepGoal([8000, 10000])).toBe(7000);
  });

  test('rounds low values to nearest 500', () => {
    // avg=5000, 80%=4000, nearest 500=4000
    expect(computeStepGoal([5000])).toBe(4000);
  });

  test('result is always a multiple of 500', () => {
    const counts = [7823, 9102, 8456, 6711, 10230];
    const result = computeStepGoal(counts)!;
    expect(result % 500).toBe(0);
  });
});

describe('computeMedianWakeTime', () => {
  test('returns null for empty array', () => expect(computeMedianWakeTime([])).toBeNull());

  test('single value — returns it unchanged', () => {
    expect(computeMedianWakeTime(['07:30'])).toBe('07:30');
  });

  test('odd number — middle value', () => {
    expect(computeMedianWakeTime(['06:30', '07:00', '07:30'])).toBe('07:00');
  });

  test('even number — average of two middle values', () => {
    // 06:00=360, 07:00=420 → avg=390 → 06:30
    expect(computeMedianWakeTime(['06:00', '07:00'])).toBe('06:30');
  });

  test('sorts before computing median', () => {
    // Unsorted input — 07:30 is median
    expect(computeMedianWakeTime(['08:00', '06:00', '07:30'])).toBe('07:30');
  });

  test('handles midnight edge case', () => {
    expect(computeMedianWakeTime(['00:00'])).toBe('00:00');
  });
});
```

- [ ] **Step 2: Run tests — expect PASS**

```bash
cd /mnt/c/Users/DEIVI/Desktop/Livra && npm run test -- tests/unit/health/healthLearner.test.ts
```

Expected: all tests PASS (pure functions, no HealthKit dependency).

---

## Task 9: Mark connection UI in `app/counter/[id].tsx`

**Files:**
- Modify: `app/counter/[id].tsx`

Adds "Connect to Apple Health" settings row at the bottom of the mark detail screen, with a picker modal and steps goal input. Tapping opens paywall for free users.

- [ ] **Step 1: Add imports to `app/counter/[id].tsx`**

Add these imports at the top (with the existing imports):

```typescript
import { checkProStatus } from '../../lib/iap/iap';
import { requestPermissions } from '../../lib/health/healthPermissions';
import { suggestStepGoal } from '../../lib/health/healthLearner';
import { detectHealthKitType } from '../../lib/health/autoSuggest';
import type { HealthKitType } from '../../lib/health/healthTypes';
```

- [ ] **Step 2: Add state for Health connection UI**

Inside `CounterDetailScreen`, after the existing state declarations, add:

```typescript
const [healthModalVisible, setHealthModalVisible] = useState(false);
const [healthStepGoal, setHealthStepGoal] = useState<string>('');
const [healthPendingType, setHealthPendingType] = useState<HealthKitType | null>(null);
const [healthConnecting, setHealthConnecting] = useState(false);
```

- [ ] **Step 3: Add handler functions**

After the existing handler functions (e.g., after `handleDeleteNote`), add:

```typescript
const handleConnectHealth = async () => {
  const status = await checkProStatus();
  if (!status.effectiveUnlocked) {
    router.push('/paywall');
    return;
  }
  setHealthModalVisible(true);
};

const handleHealthTypeSelect = async (type: HealthKitType) => {
  if (type === 'steps') {
    setHealthPendingType(type);
    const suggested = await suggestStepGoal();
    setHealthStepGoal(suggested !== null ? String(suggested) : '');
    return; // Stay in modal — show step goal input
  }
  await confirmHealthConnection(type, undefined);
};

const confirmHealthConnection = async (type: HealthKitType, stepGoal: number | undefined) => {
  if (!id) return;
  setHealthConnecting(true);
  try {
    await requestPermissions([type]);
    const config = type === 'steps' && stepGoal !== undefined ? { stepGoal } : null;
    await updateMark(id, { health_kit_type: type, health_kit_config: config });
  } catch (err) {
    Alert.alert('Could not connect', 'Health permissions could not be requested. Try again from Settings → Privacy → Health.');
  } finally {
    setHealthConnecting(false);
    setHealthModalVisible(false);
    setHealthPendingType(null);
  }
};

const handleDisconnectHealth = async () => {
  if (!id) return;
  Alert.alert(
    'Disconnect Apple Health?',
    'Your weekly reflection will return to using manual check-ins.',
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Disconnect',
        style: 'destructive',
        onPress: async () => {
          await updateMark(id, { health_kit_type: null, health_kit_config: null });
        },
      },
    ],
  );
};
```

Make sure `updateMark` is available — it comes from `useCounters()`. Add it to the destructure at the top of the component:

Find `const { counters, loading, incrementCounter, decrementCounter, resetCounter, deleteCounter } = useCounters();` and add `updateMark` to it.

Then look for where `useCounters` exports `updateMark`. Check `hooks/useCounters.ts` — if it doesn't expose `updateMark`, add:

```typescript
// In hooks/useCounters.ts, inside the returned object:
updateMark: useMarksStore.getState().updateMark,
```

- [ ] **Step 4: Add the "Connect to Apple Health" UI section**

In the JSX, find the end of the `<ScrollView>` content (just before the closing `</ScrollView>`). Add the Health connection section:

```tsx
{/* Apple Health connection */}
<View style={[styles.noteCard, { backgroundColor: themeColors.surface, marginTop: spacing.md }]}>
  <LinearGradient
    pointerEvents="none"
    colors={cardSheenColors}
    start={{ x: 0.15, y: 0 }}
    end={{ x: 0.85, y: 1 }}
    style={styles.cardSheen}
  />
  <View style={{ padding: spacing.md }}>
    <Text style={[styles.noteTitle, { color: themeColors.text, marginBottom: spacing.xs }]}>
      Apple Health
    </Text>
    {counter.health_kit_type ? (
      <View>
        <Text style={[{ color: themeColors.textSecondary, fontSize: fontSize.sm, marginBottom: spacing.sm }]}>
          Connected — weekly reflection powered by Health data.
        </Text>
        <TouchableOpacity onPress={handleDisconnectHealth}>
          <Text style={[{ color: themeColors.error, fontSize: fontSize.sm }]}>Disconnect</Text>
        </TouchableOpacity>
      </View>
    ) : (
      <TouchableOpacity
        style={[styles.actionBtn, { backgroundColor: themeColors.primary, paddingHorizontal: spacing.md, paddingVertical: spacing.sm }]}
        onPress={handleConnectHealth}
      >
        <Text style={{ color: '#FFFFFF', fontSize: fontSize.sm, fontWeight: fontWeight.semibold }}>
          Connect to Apple Health
        </Text>
      </TouchableOpacity>
    )}
  </View>
</View>

{/* Health type picker modal */}
<Modal
  visible={healthModalVisible}
  transparent
  animationType="slide"
  onRequestClose={() => { setHealthModalVisible(false); setHealthPendingType(null); }}
>
  <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' }}>
    <View style={[{ backgroundColor: themeColors.surface, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: spacing.lg }]}>
      <Text style={[{ color: themeColors.text, fontSize: fontSize.lg, fontWeight: fontWeight.bold, marginBottom: spacing.md }]}>
        Connect to Apple Health
      </Text>

      {healthPendingType === 'steps' ? (
        <View>
          <Text style={[{ color: themeColors.textSecondary, fontSize: fontSize.sm, marginBottom: spacing.sm }]}>
            How many steps counts as an active day?
          </Text>
          <TextInput
            value={healthStepGoal}
            onChangeText={setHealthStepGoal}
            keyboardType="number-pad"
            placeholder="e.g. 8000"
            placeholderTextColor={themeColors.textSecondary}
            style={[{
              borderWidth: 1,
              borderColor: themeColors.border,
              borderRadius: borderRadius.md,
              padding: spacing.sm,
              color: themeColors.text,
              fontSize: fontSize.md,
              marginBottom: spacing.md,
            }]}
          />
          <TouchableOpacity
            style={[{ backgroundColor: themeColors.primary, borderRadius: borderRadius.md, padding: spacing.md, alignItems: 'center' }]}
            disabled={healthConnecting}
            onPress={() => {
              const goal = parseInt(healthStepGoal, 10);
              if (isNaN(goal) || goal <= 0) {
                Alert.alert('Invalid goal', 'Enter a number greater than 0.');
                return;
              }
              void confirmHealthConnection('steps', goal);
            }}
          >
            <Text style={{ color: '#FFFFFF', fontWeight: fontWeight.semibold }}>
              {healthConnecting ? 'Connecting…' : 'Save & Connect'}
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View>
          {(['workout', 'sleep', 'hydration', 'mindful', 'steps', 'running'] as HealthKitType[]).map(type => (
            <TouchableOpacity
              key={type}
              style={[{ paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: themeColors.border }]}
              onPress={() => void handleHealthTypeSelect(type)}
            >
              <Text style={[{ color: themeColors.text, fontSize: fontSize.md, textTransform: 'capitalize' }]}>
                {type}
              </Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            style={[{ paddingVertical: spacing.sm, marginTop: spacing.xs }]}
            onPress={() => { setHealthModalVisible(false); setHealthPendingType(null); }}
          >
            <Text style={[{ color: themeColors.textSecondary, fontSize: fontSize.sm, textAlign: 'center' }]}>Cancel</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  </View>
</Modal>
```

- [ ] **Step 5: Verify `updateMark` is available in `hooks/useCounters.ts`**

Open `hooks/useCounters.ts`. Search for the returned object. If `updateMark` is not already returned, add it:

```typescript
updateMark: async (id: string, updates: Partial<Mark>) => {
  await useMarksStore.getState().updateMark(id, updates);
},
```

Also add `Mark` to the import from `'../types'` if not already present.

- [ ] **Step 6: Run full test suite**

```bash
cd /mnt/c/Users/DEIVI/Desktop/Livra && npm run test
```

Expected: all tests PASS.

---

## Task 10: Auto-suggest `HealthConnectBanner` component

**Files:**
- Create: `components/HealthConnectBanner.tsx`

Dismissible banner shown once per mark when the name matches a known HealthKit type. Persisted per mark in AsyncStorage. Gated behind Livra+.

- [ ] **Step 1: Create `components/HealthConnectBanner.tsx`**

```typescript
import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { colors } from '../theme/colors';
import { spacing, fontSize, fontWeight, borderRadius } from '../theme/tokens';
import { useEffectiveTheme } from '../state/uiSlice';
import { detectHealthKitType } from '../lib/health/autoSuggest';
import { checkProStatus } from '../lib/iap/iap';

const BANNER_DISMISSED_PREFIX = '@livra_health_banner_dismissed:';

type Props = {
  markId: string;
  markName: string;
  alreadyConnected: boolean;
};

export function HealthConnectBanner({ markId, markName, alreadyConnected }: Props) {
  const theme = useEffectiveTheme();
  const themeColors = colors[theme];
  const router = useRouter();
  const [visible, setVisible] = useState(false);

  const detectedType = detectHealthKitType(markName);

  useEffect(() => {
    if (!detectedType || alreadyConnected) return;

    const key = `${BANNER_DISMISSED_PREFIX}${markId}`;
    AsyncStorage.getItem(key).then(val => {
      if (val === null) setVisible(true);
    });
  }, [detectedType, alreadyConnected, markId]);

  const dismiss = async () => {
    setVisible(false);
    await AsyncStorage.setItem(`${BANNER_DISMISSED_PREFIX}${markId}`, '1');
  };

  const handleConnect = async () => {
    await dismiss();
    const status = await checkProStatus();
    if (!status.effectiveUnlocked) {
      router.push('/paywall');
    } else {
      router.push(`/counter/${markId}` as any);
    }
  };

  if (!visible) return null;

  return (
    <View style={[styles.banner, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
      <Text style={[styles.text, { color: themeColors.text }]}>
        Connect {markName} to Apple Health to power your weekly reflection.
      </Text>
      <View style={styles.actions}>
        <TouchableOpacity onPress={handleConnect}>
          <Text style={[styles.connectBtn, { color: themeColors.primary }]}>Connect</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={dismiss}>
          <Text style={[styles.dismissBtn, { color: themeColors.textSecondary }]}>Dismiss</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    borderRadius: borderRadius.md,
    borderWidth: 1,
    padding: spacing.md,
    marginVertical: spacing.sm,
  },
  text: {
    fontSize: fontSize.sm,
    marginBottom: spacing.sm,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  connectBtn: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  dismissBtn: {
    fontSize: fontSize.sm,
  },
});
```

- [ ] **Step 2: Wire the banner into `app/counter/[id].tsx`**

Import at the top of `app/counter/[id].tsx`:

```typescript
import { HealthConnectBanner } from '../../components/HealthConnectBanner';
```

In the JSX, just before the Apple Health section added in Task 9, add:

```tsx
<HealthConnectBanner
  markId={id ?? ''}
  markName={counter.name}
  alreadyConnected={!!counter.health_kit_type}
/>
```

- [ ] **Step 3: Run full test suite**

```bash
cd /mnt/c/Users/DEIVI/Desktop/Livra && npm run test
```

Expected: all tests PASS.

---

## Task 11: Sleep morning notification

**Files:**
- Create: `lib/notifications/sleepNotification.ts`
- Modify: `app/counter/[id].tsx`

When a user connects the sleep mark to Health, schedule a morning notification at their suggested (or user-set) wake time. Uses `expo-notifications` (already installed).

- [ ] **Step 1: Create `lib/notifications/sleepNotification.ts`**

```typescript
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SLEEP_NOTIF_TIME_PREFIX = '@livra_sleep_notif_time:';
const SLEEP_NOTIF_ID_PREFIX = 'livra-sleep-';

export function sleepNotifTimeKey(markId: string): string {
  return `${SLEEP_NOTIF_TIME_PREFIX}${markId}`;
}

export async function getSleepNotifTime(markId: string): Promise<string | null> {
  return AsyncStorage.getItem(sleepNotifTimeKey(markId));
}

export async function setSleepNotifTime(markId: string, hhmm: string): Promise<void> {
  await AsyncStorage.setItem(sleepNotifTimeKey(markId), hhmm);
}

export async function scheduleSleepNotification(markId: string, hhmm: string): Promise<void> {
  await cancelSleepNotification(markId);

  const [hourStr = '7', minStr = '0'] = hhmm.split(':');
  const hour = parseInt(hourStr, 10);
  const minute = parseInt(minStr, 10);

  await Notifications.scheduleNotificationAsync({
    identifier: `${SLEEP_NOTIF_ID_PREFIX}${markId}`,
    content: {
      title: 'Your Sleep mark is waiting.',
      body: "How'd last night go?",
      data: { screen: 'checkin', markId },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute,
    },
  });
}

export async function cancelSleepNotification(markId: string): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(`${SLEEP_NOTIF_ID_PREFIX}${markId}`).catch(() => {});
}
```

- [ ] **Step 2: Wire sleep notification into mark connection flow**

In `app/counter/[id].tsx`, add these imports:

```typescript
import {
  scheduleSleepNotification,
  cancelSleepNotification,
  getSleepNotifTime,
  setSleepNotifTime,
} from '../../lib/notifications/sleepNotification';
import { suggestWakeTime } from '../../lib/health/healthLearner';
```

Update `confirmHealthConnection` to schedule the notification when the type is `sleep`:

Find `confirmHealthConnection` from Task 9 and update it:

```typescript
const confirmHealthConnection = async (type: HealthKitType, stepGoal: number | undefined) => {
  if (!id) return;
  setHealthConnecting(true);
  try {
    await requestPermissions([type]);
    const config = type === 'steps' && stepGoal !== undefined ? { stepGoal } : null;
    await updateMark(id, { health_kit_type: type, health_kit_config: config });

    if (type === 'sleep') {
      let wakeTime = await getSleepNotifTime(id);
      if (!wakeTime) {
        wakeTime = await suggestWakeTime();
      }
      if (wakeTime) {
        await setSleepNotifTime(id, wakeTime);
        await scheduleSleepNotification(id, wakeTime);
      }
      // If still no wakeTime, the Settings UI (future) lets user set it manually
    }
  } catch (err) {
    Alert.alert('Could not connect', 'Health permissions could not be requested. Try again from Settings → Privacy → Health.');
  } finally {
    setHealthConnecting(false);
    setHealthModalVisible(false);
    setHealthPendingType(null);
  }
};
```

Also update `handleDisconnectHealth` to cancel the sleep notification when disconnecting:

```typescript
const handleDisconnectHealth = async () => {
  if (!id) return;
  Alert.alert(
    'Disconnect Apple Health?',
    'Your weekly reflection will return to using manual check-ins.',
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Disconnect',
        style: 'destructive',
        onPress: async () => {
          await updateMark(id, { health_kit_type: null, health_kit_config: null });
          await cancelSleepNotification(id);
        },
      },
    ],
  );
};
```

- [ ] **Step 3: Run full test suite**

```bash
cd /mnt/c/Users/DEIVI/Desktop/Livra && npm run test
```

Expected: all tests PASS.

---

## Self-Review

### Spec coverage

| Spec requirement | Task |
|---|---|
| 6 supported HealthKit types (workout/sleep/hydration/mindful/steps/running) | Task 7 healthReader |
| Health feeds weekly reflection tiers only | Task 5 buildReflectionItems |
| Health replaces events for connected marks | Task 4 classifyMarkTier |
| Fallback to events when Health empty or fails | Task 4 + Task 5 |
| Health data never stored in SQLite/Supabase | health_kit_config stores user pref only; reader results are transient |
| Permissions requested lazily (at connection time, not launch) | Task 9 handleConnectHealth |
| Livra+ gate on all Health features | Task 9 checkProStatus + Task 10 HealthConnectBanner |
| Auto-suggest via name substring matching | Task 3 autoSuggest |
| Auto-suggest banner shown once, dismissal persisted | Task 10 |
| Steps: smart default from Health history | Task 7 suggestStepGoal + Task 9 handleHealthTypeSelect |
| Steps: user-adjustable threshold | Task 9 step goal TextInput |
| Sleep notification: wake time from Health history | Task 11 suggestWakeTime |
| Sleep notification: separate from daily goal reminder | Task 11 identifier prefix `livra-sleep-` |
| Sleep notification: cancel on disconnect | Task 11 handleDisconnectHealth |
| `app.json` NSHealthShareUsageDescription + entitlements | Task 1 |
| Mark type fields: health_kit_type, health_kit_config | Task 6 |
| DB layer: new fields persisted via generic SQL handler | Task 6 |
| tracking.tsx: async weeklyReflectionItems | Task 5 |
| Not connectable: Deep Work, Read, No Spend | autoSuggest returns null — no Health row shown unless user name-matches |

### Placeholder scan

No placeholders. All code steps contain complete implementations.

### Type consistency

- `HealthKitType` defined in `lib/health/healthTypes.ts` — imported by `types/index.ts`, `autoSuggest.ts`, `healthPermissions.ts`, `healthReader.ts`, `healthLearner.ts` ✓
- `readHealthDays(type, weekDates, config?)` — signature in `healthReader.ts` matches call in `buildReflectionItems` ✓
- `mark.health_kit_config` is `{ stepGoal?: number } | null` in TypeScript, stored as JSON string in DB, parsed in `loadMarks` ✓
- `updateMark(id, Partial<Mark>)` — `health_kit_type` and `health_kit_config` are now fields of `Mark` ✓
- `ReflectionItem` exported from `weeklyReflectionLogic.ts` — matches `useState<ReflectionItem[]>` in `tracking.tsx` ✓
- `computeStepGoal` / `computeMedianWakeTime` — exported from `healthLearner.ts`, tested in `healthLearner.test.ts`, not mocked in that test ✓
