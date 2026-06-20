# Notifications Master Switch + Daily Nudge Guardrail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the four fake notification toggles with one persisted master switch, bring mark reminders under it, and cap Livra-initiated notifications at 2/day with at-risk priority (at-risk days suppress the routine daily reminder).

**Architecture:** Reuse the existing master key `livra_reminders_enabled_v1`. Extract a pure planner helper so the daily scheduler can ask "is today an at-risk day?" and suppress its own notification. Gate mark reminders on the master and add a reconcile. Orchestrate the toggle side effects in a single service function consumed by a thin hook.

**Tech Stack:** React Native + Expo (SDK ~54), expo-notifications, Zustand stores, AsyncStorage, TypeScript (strict), Jest (`jest-expo`).

## Global Constraints

- No user-facing copy uses guilt, fake urgency, or streak-loss language (`PRODUCT.md:298`).
- No user-facing copy uses an em-dash, en-dash, or a hyphen-as-a-dash (`PRODUCT.md:299`).
- Zustand slices only — never `useState` for persistent data (`CLAUDE.md`). Persistent notification prefs live in AsyncStorage helpers (background schedulers read them outside React); React `useState` is allowed only for transient UI hydration mirrors.
- Color tokens from `theme/tokens` only — never hardcode hex.
- Tests before shipping. Tests live in `tests/unit/*.test.ts`.
- Commands: `npm run test`, `npm run type-check`, `npm run lint`.
- Do NOT touch the uncommitted WIP files: `app/(tabs)/settings.tsx`, `app/_layout.tsx`, `app/settings/appearance.tsx`, `.semgrep/`.

---

### Task 1: Pure momentum-warning planning helper

Extract the "which goals warn, and on what day" computation out of the momentum service into a pure module, so the daily scheduler can reuse it without depending on the service (avoids a `lib → services → lib` cycle). Refactor the service to consume it (behavior-preserving).

**Files:**
- Create: `lib/notifications/momentumWarningPlan.ts`
- Create test: `tests/unit/momentumWarningPlan.test.ts`
- Modify: `services/momentumWarningNotifications.ts` (replace inline input-building at lines 62-79)

**Interfaces:**
- Consumes: `momentumWarningDates` and `MarkMomentumInput` from `lib/goalMomentum`; `planMomentumWarnings` and `GoalWarningInput` from `lib/momentumWarningPlanner`.
- Produces:
  - `buildMomentumWarningInputs(goals: PlanGoal[], marks: PlanMark[], today: string): GoalWarningInput[]`
  - `hasMomentumWarningPlannedForToday(goals: PlanGoal[], marks: PlanMark[], today: string): boolean`
  - `interface PlanGoal { id: string; title: string; status: string; linked_mark_ids?: string[] }`
  - `interface PlanMark { id: string; weekly_target?: number; last_activity_date?: string | null; deleted_at?: string | null }`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/momentumWarningPlan.test.ts
import {
  buildMomentumWarningInputs,
  hasMomentumWarningPlannedForToday,
} from '../../lib/notifications/momentumWarningPlan';

const goals = [{ id: 'g1', title: 'Run', status: 'active', linked_mark_ids: ['m1'] }];
// daily mark last logged 06-17 → warning fires on 06-19 (today)
const slipping = [{ id: 'm1', weekly_target: 7, last_activity_date: '2026-06-17', deleted_at: null }];
const fresh = [{ id: 'm1', weekly_target: 7, last_activity_date: null, deleted_at: null }];

describe('momentumWarningPlan', () => {
  it('builds one input for a slipping active goal', () => {
    const inputs = buildMomentumWarningInputs(goals, slipping, '2026-06-19');
    expect(inputs).toHaveLength(1);
    expect(inputs[0].goalId).toBe('g1');
    expect(inputs[0].title).toBe('Run');
  });

  it('ignores non-active goals', () => {
    const completed = [{ id: 'g1', title: 'Run', status: 'completed', linked_mark_ids: ['m1'] }];
    expect(buildMomentumWarningInputs(completed, slipping, '2026-06-19')).toHaveLength(0);
  });

  it('reports a warning planned for today when a goal is slipping', () => {
    expect(hasMomentumWarningPlannedForToday(goals, slipping, '2026-06-19')).toBe(true);
  });

  it('reports no warning when nothing is logged yet', () => {
    expect(hasMomentumWarningPlannedForToday(goals, fresh, '2026-06-19')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- momentumWarningPlan`
Expected: FAIL — cannot find module `../../lib/notifications/momentumWarningPlan`.

- [ ] **Step 3: Write the implementation**

```typescript
// lib/notifications/momentumWarningPlan.ts
// Pure cross-goal momentum-warning planning. No store/IO dependency so both the
// momentum service and the daily scheduler can reuse it without a dependency cycle.
import { momentumWarningDates, type MarkMomentumInput } from '../goalMomentum';
import { planMomentumWarnings, type GoalWarningInput } from '../momentumWarningPlanner';

export interface PlanGoal {
  id: string;
  title: string;
  status: string;
  linked_mark_ids?: string[];
}

export interface PlanMark {
  id: string;
  weekly_target?: number;
  last_activity_date?: string | null;
  deleted_at?: string | null;
}

export function buildMomentumWarningInputs(
  goals: PlanGoal[],
  marks: PlanMark[],
  today: string,
): GoalWarningInput[] {
  const inputs: GoalWarningInput[] = [];
  for (const g of goals) {
    if (g.status !== 'active') continue;
    const ids = new Set(g.linked_mark_ids ?? []);
    const goalMarks: MarkMomentumInput[] = marks
      .filter((m) => !m.deleted_at && ids.has(m.id))
      .map((m) => ({
        id: m.id,
        weekly_target: m.weekly_target as number,
        last_activity_date: m.last_activity_date ?? null,
      }));
    const dates = momentumWarningDates(goalMarks, today);
    if (dates) {
      inputs.push({
        goalId: g.id,
        title: g.title,
        atRiskDate: dates.atRiskDate,
        breakDate: dates.breakDate,
      });
    }
  }
  return inputs;
}

export function hasMomentumWarningPlannedForToday(
  goals: PlanGoal[],
  marks: PlanMark[],
  today: string,
): boolean {
  const planned = planMomentumWarnings(buildMomentumWarningInputs(goals, marks, today), today);
  return planned.some((w) => w.fireDay === today);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- momentumWarningPlan`
Expected: PASS (4 tests).

- [ ] **Step 5: Refactor the service to use the helper (behavior-preserving)**

In `services/momentumWarningNotifications.ts`, replace the inline input-building loop (current lines 62-79) with a call to the helper. The new body of `reconcileMomentumWarnings` from the store reads down to `planned`:

```typescript
  const goals = useGoalsStore.getState().goals;
  const allMarks = useMarksStore.getState().marks;

  const inputs = buildMomentumWarningInputs(goals as any, allMarks as any, today);
  const planned = planMomentumWarnings(inputs, today);
```

Update the imports at the top of the file:
- Add: `import { buildMomentumWarningInputs } from '../lib/notifications/momentumWarningPlan';`
- Remove now-unused imports: the `momentumWarningDates` import and the `MarkMomentumInput` type import (lines 9-10). Keep `planMomentumWarnings` (still used) and `GoalWarningInput` only if still referenced — after this change `GoalWarningInput` is no longer referenced here, so remove it from the import on lines 11-14, leaving `import { planMomentumWarnings } from '../lib/momentumWarningPlanner';`.

- [ ] **Step 6: Run the existing momentum service test to confirm no regression**

Run: `npm run test -- momentumWarningNotifications`
Expected: PASS (5 tests, unchanged behavior).

- [ ] **Step 7: Commit**

```bash
git add lib/notifications/momentumWarningPlan.ts tests/unit/momentumWarningPlan.test.ts services/momentumWarningNotifications.ts
git commit -m "refactor(momentum): extract pure momentum-warning planner helper

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NqsXbHuGVBof15hwPZHf1o"
```

---

### Task 2: Suppress the routine daily on at-risk days

Make `scheduleContextualDailyNotification` skip the daily reminder when a momentum warning is planned for today, and stop it from cancelling sibling notifications (mark reminders / momentum) on every run.

**Files:**
- Modify: `lib/notificationSystem.ts`
- Create test: `tests/unit/notificationSystemSuppress.test.ts`

**Interfaces:**
- Consumes: `hasMomentumWarningPlannedForToday` from `lib/notifications/momentumWarningPlan` (Task 1); `useGoalsStore` from `state/goalsSlice`; `useMarksStore` from `state/countersSlice`.
- Produces: no new exports; changes the runtime behavior of `scheduleContextualDailyNotification`.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/notificationSystemSuppress.test.ts
import * as Notifications from 'expo-notifications';
import { scheduleContextualDailyNotification } from '../../lib/notificationSystem';
import { hasMomentumWarningPlannedForToday } from '../../lib/notifications/momentumWarningPlan';

jest.mock('expo-notifications');
jest.mock('../../lib/notifications/livraReminderPrefs', () => ({
  getLivraRemindersEnabled: jest.fn().mockResolvedValue(true),
}));
jest.mock('../../lib/db', () => ({ query: jest.fn().mockResolvedValue([]) }));
jest.mock('../../lib/notifications/momentumWarningPlan', () => ({
  hasMomentumWarningPlannedForToday: jest.fn(),
}));
jest.mock('../../lib/appDate', () => ({ getAppDate: () => new Date('2026-06-19T10:00:00') }));

describe('scheduleContextualDailyNotification at-risk suppression', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (Notifications.cancelScheduledNotificationAsync as jest.Mock).mockResolvedValue(undefined);
    (Notifications.scheduleNotificationAsync as jest.Mock).mockResolvedValue('id');
  });

  it('suppresses the daily and cancels its own slot when today is at-risk', async () => {
    (hasMomentumWarningPlannedForToday as jest.Mock).mockReturnValue(true);
    await scheduleContextualDailyNotification('u1');
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith(
      'livra-bn-contextual-daily',
    );
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('schedules the daily when today is not at-risk', async () => {
    (hasMomentumWarningPlannedForToday as jest.Mock).mockReturnValue(false);
    await scheduleContextualDailyNotification('u1');
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- notificationSystemSuppress`
Expected: FAIL — suppression branch not implemented; `scheduleNotificationAsync` is called in the at-risk case (and/or the blanket `cancelAllLivraScheduledNotifications` call interferes).

- [ ] **Step 3: Implement suppression and remove the blanket cancel**

In `lib/notificationSystem.ts`:

a) Update imports — remove `cancelAllLivraScheduledNotifications` from the `livraScheduledOwnership` import (keep `LIVRA_BEHAVIOR_ID_PREFIX`), and add:

```typescript
import { LIVRA_BEHAVIOR_ID_PREFIX } from './notifications/livraScheduledOwnership';
import { hasMomentumWarningPlannedForToday } from './notifications/momentumWarningPlan';
import { useGoalsStore } from '../state/goalsSlice';
import { useMarksStore } from '../state/countersSlice';
```

b) Replace the opening of `scheduleContextualDailyNotification` (the current lines 168-175, from `const enabled` through `const identifier = ...`) with:

```typescript
    const enabled = await getLivraRemindersEnabled();
    if (!enabled) return;

    const now = getAppDate();
    const today = formatDate(now);
    const identifier = `${LIVRA_BEHAVIOR_ID_PREFIX}contextual-daily`;

    // At-risk days belong to the momentum warning, not a second routine nudge.
    // Suppress the daily (and clear any previously-scheduled daily slot) so we never
    // double-nudge. This replaces the old blanket cancelAllLivraScheduledNotifications(),
    // which also wiped mark reminders and momentum warnings on every run.
    const goals = useGoalsStore.getState().goals;
    const marks = useMarksStore.getState().marks;
    if (hasMomentumWarningPlannedForToday(goals as any, marks as any, today)) {
      await Notifications.cancelScheduledNotificationAsync(identifier).catch(() => {});
      return;
    }
```

The rest of the function (Tiers 1-5) is unchanged; it already schedules with the stable `identifier`, so expo replaces any prior daily in place — no blanket cancel is needed.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- notificationSystemSuppress`
Expected: PASS (2 tests).

- [ ] **Step 5: Confirm no regression in the broader suite slice**

Run: `npm run test -- notification`
Expected: PASS (existing notification-related suites still green).

- [ ] **Step 6: Commit**

```bash
git add lib/notificationSystem.ts tests/unit/notificationSystemSuppress.test.ts
git commit -m "feat(momentum): suppress routine daily reminder on at-risk days

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NqsXbHuGVBof15hwPZHf1o"
```

---

### Task 3: Gate mark reminders on the master switch

`scheduleMarkReminder` is currently ungated. Add the master guard and a `reconcileMarkReminders` used when the master toggles.

**Files:**
- Modify: `lib/notifications/markReminder.ts`
- Create test: `tests/unit/markReminder.test.ts`

**Interfaces:**
- Consumes: `getLivraRemindersEnabled` from `lib/notifications/livraReminderPrefs`.
- Produces: `reconcileMarkReminders(marks: ReconcileMark[]): Promise<void>` where `interface ReconcileMark { id: string; name: string; deleted_at?: string | null }`. `scheduleMarkReminder` gains a no-op-when-disabled guard (signature unchanged).

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/markReminder.test.ts
import * as Notifications from 'expo-notifications';
import {
  scheduleMarkReminder,
  reconcileMarkReminders,
  setMarkReminderTime,
} from '../../lib/notifications/markReminder';
import { getLivraRemindersEnabled } from '../../lib/notifications/livraReminderPrefs';

jest.mock('expo-notifications');
jest.mock('../../lib/notifications/livraReminderPrefs', () => ({
  getLivraRemindersEnabled: jest.fn(),
}));

describe('markReminder master gating', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (Notifications.scheduleNotificationAsync as jest.Mock).mockResolvedValue('id');
    (Notifications.cancelScheduledNotificationAsync as jest.Mock).mockResolvedValue(undefined);
  });

  it('scheduleMarkReminder no-ops when the master is off', async () => {
    (getLivraRemindersEnabled as jest.Mock).mockResolvedValue(false);
    await scheduleMarkReminder('m1', 'Water', '08:30');
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('scheduleMarkReminder schedules when the master is on', async () => {
    (getLivraRemindersEnabled as jest.Mock).mockResolvedValue(true);
    await scheduleMarkReminder('m1', 'Water', '08:30');
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    const arg = (Notifications.scheduleNotificationAsync as jest.Mock).mock.calls[0][0];
    expect(arg.identifier).toBe('livra-reminder-m1');
    expect(arg.trigger.hour).toBe(8);
    expect(arg.trigger.minute).toBe(30);
  });

  it('reconcileMarkReminders cancels all marks when the master is off', async () => {
    (getLivraRemindersEnabled as jest.Mock).mockResolvedValue(false);
    await reconcileMarkReminders([
      { id: 'm1', name: 'Water' },
      { id: 'm2', name: 'Run' },
    ]);
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('livra-reminder-m1');
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('livra-reminder-m2');
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('reconcileMarkReminders reschedules from stored times when on, skips marks with no time and deleted marks', async () => {
    (getLivraRemindersEnabled as jest.Mock).mockResolvedValue(true);
    await setMarkReminderTime('m1', '09:15');
    await reconcileMarkReminders([
      { id: 'm1', name: 'Water' },
      { id: 'm2', name: 'Run' }, // no stored time → skip
      { id: 'm3', name: 'Gone', deleted_at: '2026-06-01' }, // deleted → skip
    ]);
    const scheduled = (Notifications.scheduleNotificationAsync as jest.Mock).mock.calls.map(
      (c) => c[0].identifier,
    );
    expect(scheduled).toEqual(['livra-reminder-m1']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- markReminder`
Expected: FAIL — `reconcileMarkReminders` is not exported; `scheduleMarkReminder` schedules even when disabled.

- [ ] **Step 3: Implement the guard and reconcile**

In `lib/notifications/markReminder.ts`:

a) Add the import at the top:

```typescript
import { getLivraRemindersEnabled } from './livraReminderPrefs';
```

b) Add the master guard as the first line of `scheduleMarkReminder`:

```typescript
export async function scheduleMarkReminder(markId: string, markName: string, hhmm: string): Promise<void> {
  if (!(await getLivraRemindersEnabled())) return;
  await cancelMarkReminder(markId);
  // ...rest unchanged...
```

c) Append the reconcile function and its type at the end of the file:

```typescript
export interface ReconcileMark {
  id: string;
  name: string;
  deleted_at?: string | null;
}

/** Master-toggle reconcile: cancel every mark reminder when off; reschedule from stored times when on. */
export async function reconcileMarkReminders(marks: ReconcileMark[]): Promise<void> {
  const enabled = await getLivraRemindersEnabled();
  for (const m of marks) {
    if (m.deleted_at) {
      await cancelMarkReminder(m.id);
      continue;
    }
    if (!enabled) {
      await cancelMarkReminder(m.id);
      continue;
    }
    const hhmm = await getMarkReminderTime(m.id);
    if (hhmm) {
      await scheduleMarkReminder(m.id, m.name, hhmm);
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- markReminder`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/notifications/markReminder.ts tests/unit/markReminder.test.ts
git commit -m "feat(notifications): gate mark reminders on the master switch + reconcile

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NqsXbHuGVBof15hwPZHf1o"
```

---

### Task 4: Master-toggle orchestration service

One function applies a master-switch change: persist the pref and reconcile all three notification categories. Lives in `services/` so the dependency direction (services → lib + services) stays clean.

**Files:**
- Create: `services/notificationsMaster.ts`
- Create test: `tests/unit/notificationsMaster.test.ts`

**Interfaces:**
- Consumes: `setLivraRemindersEnabled` (`lib/notifications/livraReminderPrefs`), `updateNotifications` (`services/notificationService`), `reconcileMomentumWarnings` (`services/momentumWarningNotifications`), `reconcileMarkReminders` + `ReconcileMark` (`lib/notifications/markReminder`, Task 3).
- Produces: `applyNotificationsMaster(enabled: boolean, userId: string | undefined, marks: ReconcileMark[]): Promise<void>`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/notificationsMaster.test.ts
import { applyNotificationsMaster } from '../../services/notificationsMaster';
import { setLivraRemindersEnabled } from '../../lib/notifications/livraReminderPrefs';
import { updateNotifications } from '../../services/notificationService';
import { reconcileMomentumWarnings } from '../../services/momentumWarningNotifications';
import { reconcileMarkReminders } from '../../lib/notifications/markReminder';

jest.mock('../../lib/notifications/livraReminderPrefs', () => ({
  setLivraRemindersEnabled: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../services/notificationService', () => ({
  updateNotifications: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../services/momentumWarningNotifications', () => ({
  reconcileMomentumWarnings: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../lib/notifications/markReminder', () => ({
  reconcileMarkReminders: jest.fn().mockResolvedValue(undefined),
}));

describe('applyNotificationsMaster', () => {
  beforeEach(() => jest.clearAllMocks());

  it('persists the pref and reconciles all three categories', async () => {
    const marks = [{ id: 'm1', name: 'Water' }];
    await applyNotificationsMaster(false, 'u1', marks);
    expect(setLivraRemindersEnabled).toHaveBeenCalledWith(false);
    expect(updateNotifications).toHaveBeenCalledWith('u1');
    expect(reconcileMomentumWarnings).toHaveBeenCalledWith('u1');
    expect(reconcileMarkReminders).toHaveBeenCalledWith(marks);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- notificationsMaster`
Expected: FAIL — cannot find module `../../services/notificationsMaster`.

- [ ] **Step 3: Implement the orchestration**

```typescript
// services/notificationsMaster.ts
// Single entry point for a Settings master-switch change: persist the pref, then
// reconcile every notification category so the OS schedule matches the new state.
import { setLivraRemindersEnabled } from '../lib/notifications/livraReminderPrefs';
import { reconcileMarkReminders, type ReconcileMark } from '../lib/notifications/markReminder';
import { updateNotifications } from './notificationService';
import { reconcileMomentumWarnings } from './momentumWarningNotifications';

export async function applyNotificationsMaster(
  enabled: boolean,
  userId: string | undefined,
  marks: ReconcileMark[],
): Promise<void> {
  await setLivraRemindersEnabled(enabled);
  // updateNotifications cancels all Livra schedules when off, reschedules the daily when on.
  await updateNotifications(userId);
  await reconcileMomentumWarnings(userId);
  await reconcileMarkReminders(marks);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- notificationsMaster`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add services/notificationsMaster.ts tests/unit/notificationsMaster.test.ts
git commit -m "feat(notifications): master-toggle orchestration service

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NqsXbHuGVBof15hwPZHf1o"
```

---

### Task 5: Copy constants + hook + single-switch settings screen

Add the master copy strings (testable for the no-dash/no-guilt guardrail), the hydration hook, and rewrite the screen to one switch.

**Files:**
- Create: `lib/notifications/notificationCopy.ts`
- Create: `hooks/useNotificationsMaster.ts`
- Modify (full rewrite): `app/settings/notifications.tsx`
- Create test: `tests/unit/notificationCopy.test.ts`

**Interfaces:**
- Consumes: `getLivraRemindersEnabled` (`lib/notifications/livraReminderPrefs`), `applyNotificationsMaster` (`services/notificationsMaster`, Task 4), `useAuth` (`hooks/useAuth` — returns `{ user }` with `user?.id`), `useMarksStore` (`state/countersSlice`).
- Produces:
  - `MASTER_NOTIF_LABEL: string`, `MASTER_NOTIF_SUBTITLE: string`
  - `useNotificationsMaster(): { enabled: boolean; hydrated: boolean; setEnabled: (v: boolean) => Promise<void> }`

- [ ] **Step 1: Write the failing copy guardrail test**

```typescript
// tests/unit/notificationCopy.test.ts
import { MASTER_NOTIF_LABEL, MASTER_NOTIF_SUBTITLE } from '../../lib/notifications/notificationCopy';

describe('notification master copy guardrails', () => {
  it('has a non-empty label and subtitle', () => {
    expect(MASTER_NOTIF_LABEL.length).toBeGreaterThan(0);
    expect(MASTER_NOTIF_SUBTITLE.length).toBeGreaterThan(0);
  });

  it('uses no em-dash, en-dash, or hyphen-as-a-dash', () => {
    for (const s of [MASTER_NOTIF_LABEL, MASTER_NOTIF_SUBTITLE]) {
      expect(s).not.toMatch(/[—–]/); // em / en dash
      expect(s).not.toMatch(/ - /); // spaced hyphen used as a dash
    }
  });

  it('uses no streak-loss / fake-urgency language', () => {
    const banned = /\b(lose|losing|lost|streak|don't break|hurry|now or never)\b/i;
    expect(MASTER_NOTIF_SUBTITLE).not.toMatch(banned);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- notificationCopy`
Expected: FAIL — cannot find module `../../lib/notifications/notificationCopy`.

- [ ] **Step 3: Create the copy constants**

```typescript
// lib/notifications/notificationCopy.ts
export const MASTER_NOTIF_LABEL = 'Notifications';
export const MASTER_NOTIF_SUBTITLE = 'Gentle nudges only. At most a couple a day, and never guilt.';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- notificationCopy`
Expected: PASS (3 tests).

- [ ] **Step 5: Create the hydration hook**

```typescript
// hooks/useNotificationsMaster.ts
import { useState, useEffect, useCallback } from 'react';
import { getLivraRemindersEnabled } from '../lib/notifications/livraReminderPrefs';
import { applyNotificationsMaster } from '../services/notificationsMaster';
import { useAuth } from './useAuth';
import { useMarksStore } from '../state/countersSlice';
import type { ReconcileMark } from '../lib/notifications/markReminder';

export function useNotificationsMaster() {
  const [enabled, setEnabledState] = useState(true);
  const [hydrated, setHydrated] = useState(false);
  const { user } = useAuth();

  useEffect(() => {
    let active = true;
    getLivraRemindersEnabled().then((v) => {
      if (active) {
        setEnabledState(v);
        setHydrated(true);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const setEnabled = useCallback(
    async (v: boolean) => {
      setEnabledState(v); // optimistic
      const marks = useMarksStore.getState().marks as unknown as ReconcileMark[];
      await applyNotificationsMaster(v, user?.id, marks);
    },
    [user?.id],
  );

  return { enabled, hydrated, setEnabled };
}
```

- [ ] **Step 6: Rewrite the settings screen to a single switch**

Replace the entire contents of `app/settings/notifications.tsx` with:

```tsx
import React from 'react';
import { View, Text, StyleSheet, ScrollView, Switch } from 'react-native';
import { LivraHeader } from '../../components/ui/LivraHeader';
import { fonts, spacing, radius, shadow, themedColors, fontSize } from '../../theme/tokens';
import { useEffectiveTheme } from '../../state/uiSlice';
import { useNotificationsMaster } from '../../hooks/useNotificationsMaster';
import { MASTER_NOTIF_LABEL, MASTER_NOTIF_SUBTITLE } from '../../lib/notifications/notificationCopy';

export default function NotificationsScreen() {
  const c = themedColors(useEffectiveTheme());
  const { enabled, hydrated, setEnabled } = useNotificationsMaster();

  return (
    <View style={[styles.screen, { backgroundColor: c.linen }]}>
      <LivraHeader showBack title="Notifications" />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.intro, { color: c.inkMid }]}>
          Livra never sends guilt. Only momentum.
        </Text>

        <View style={[styles.card, { backgroundColor: c.surface }]}>
          <View style={styles.toggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowLabel, { color: c.inkDark }]}>{MASTER_NOTIF_LABEL}</Text>
              <Text style={[styles.rowSubtitle, { color: c.inkMuted }]}>{MASTER_NOTIF_SUBTITLE}</Text>
            </View>
            <Switch
              value={enabled}
              onValueChange={setEnabled}
              disabled={!hydrated}
              trackColor={{ false: c.borderMid, true: c.forest }}
              thumbColor={c.surface}
            />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: 48,
  },
  intro: {
    fontFamily: fonts.sans,
    fontSize: fontSize.base,
    marginBottom: spacing.lg,
  },
  card: {
    borderRadius: radius.lg,
    ...shadow.card,
    overflow: 'hidden',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  rowLabel: {
    fontFamily: fonts.sansMedium,
    fontSize: fontSize.md,
  },
  rowSubtitle: {
    fontFamily: fonts.sans,
    fontSize: fontSize.sm,
    marginTop: 2,
  },
});
```

- [ ] **Step 7: Type-check the new/modified TS/TSX**

Run: `npm run type-check`
Expected: PASS (no errors). If `useAuth` returns a different shape than `{ user }`, adjust the destructuring in the hook to match the actual export (read `hooks/useAuth.ts` and use its real return type).

- [ ] **Step 8: Commit**

```bash
git add lib/notifications/notificationCopy.ts hooks/useNotificationsMaster.ts app/settings/notifications.tsx tests/unit/notificationCopy.test.ts
git commit -m "feat(notifications): single master switch settings screen + hook

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NqsXbHuGVBof15hwPZHf1o"
```

---

### Task 6: Update ROADMAP and PRODUCT.md

Record the single-switch decision in the docs the spec references.

**Files:**
- Modify: `ROADMAP.md:91-92`
- Modify: `PRODUCT.md` (the §294 stress-point note)

**Interfaces:** none (documentation only).

- [ ] **Step 1: Update ROADMAP item 1.5**

Replace the current lines 91-92:

```markdown
- [ ] **1.5 — Label copy.** Settings/notification toggle reads "Momentum & at-risk status"
  (`PRODUCT.md:294`).
```

with:

```markdown
- [x] **1.5 — Notification master switch + daily guardrail.** Settings/Notifications is a single
  persisted master switch (reuses `livra_reminders_enabled_v1`) governing daily, momentum/at-risk, and
  mark reminders. Livra-initiated notifications are capped at 2/day with at-risk priority: on an at-risk
  day the routine daily reminder is suppressed (`lib/notificationSystem.ts`), so the at-risk nudge stands
  alone; mark reminders are exempt from the cap but obey the master. Spec:
  `docs/superpowers/specs/2026-06-20-momentum-at-risk-toggle-design.md`; plan:
  `docs/superpowers/plans/2026-06-20-notifications-master-switch.md`.
```

- [ ] **Step 2: Update the PRODUCT.md §294 stress-point note**

Find the line in `PRODUCT.md` that reads (around line 294):

```
> plus the 1+1 rotating notification. See
> `docs/superpowers/specs/2026-06-17-momentum-design.md` §3–4. Remaining: the monetization table
> line should read "Momentum & at-risk status" (Phase 1.5, not yet shipped).
```

Replace the "Remaining:" sentence with:

```
> `docs/superpowers/specs/2026-06-17-momentum-design.md` §3–4. Settings exposes a single master
> notification switch (Phase 1.5); at-risk controllability is satisfied by the calm 2/day cap and
> no-guilt copy rather than a dedicated at-risk off-switch. The monetization table line already reads
> "Momentum & at-risk status".
```

(Note: leave the existing `§3–4` en-dash as-is — it is inside a developer doc note, not user-facing copy, and predates this work; the no-dash rule covers user-facing strings.)

- [ ] **Step 3: Commit**

```bash
git add ROADMAP.md PRODUCT.md
git commit -m "docs(momentum): record Phase 1.5 single-switch notification model

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NqsXbHuGVBof15hwPZHf1o"
```

---

### Task 7: Verification gate

**Files:** none (verification only).

- [ ] **Step 1: Full test suite**

Run: `npm run test`
Expected: PASS — all suites green, including the four new suites (`momentumWarningPlan`, `notificationSystemSuppress`, `markReminder`, `notificationsMaster`, `notificationCopy`) and the unchanged `momentumWarningNotifications`.

- [ ] **Step 2: Type-check**

Run: `npm run type-check`
Expected: PASS (no errors).

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: No NEW violations versus the pre-branch baseline. (The repo carries known pre-existing lint problems; confirm the count/identity is unchanged by diffing against `docs/product-direction` if anything appears.)

- [ ] **Step 4: Confirm protected WIP untouched**

Run: `git status --short`
Expected: `app/(tabs)/settings.tsx`, `app/_layout.tsx`, `app/settings/appearance.tsx`, `.semgrep/` still show their original uncommitted state — none staged or modified by this branch.

---

## Notes for the implementer

- **Behavior change to call out in the PR:** master-off now also silences mark reminders (previously they leaked through). This is intended.
- **Why the daily scheduler no longer calls `cancelAllLivraScheduledNotifications`:** that blanket cancel wiped mark reminders and momentum warnings on every run. The daily uses a stable identifier (`livra-bn-contextual-daily`), so expo replaces it in place; the disable/cleanup path lives in `updateNotifications` (`services/notificationService.ts`). Suppression explicitly cancels the daily's own identifier.
- **Caller wiring is unchanged:** existing call sites in `app/_layout.tsx` / `hooks/useCounters.ts` already call both `scheduleContextualDailyNotification` and `reconcileMomentumWarnings`; the suppression is planner-based and order-independent, so no call-site edits are needed (and `app/_layout.tsx` is protected WIP anyway).
```
