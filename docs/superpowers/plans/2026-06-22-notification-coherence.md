# Notification Coherence Rewrite — Implementation Plan (P1-1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the app's daily-nag notification engines with a single gentle re-engagement nudge, keeping only the PRODUCT.md-sanctioned notifications.

**Architecture:** Add a new `reengageNudge.ts` (pure `planReengageNudge` + `scheduleReengageNudge`). Repoint the existing single owner (`livraLocalNotificationOwner`) from `scheduleBehaviorNotifications` to the new scheduler. Surgically strip the nag engine from `behaviorNotifications.ts` while preserving the shared primitives the sanctioned engine and app still use (`pickFireInWindow`, foreground/tap bookkeeping). Delete the parallel `scheduleContextualDailyNotification` engine and its call sites.

**Tech Stack:** React Native 0.81, Expo SDK ~54, expo-notifications, AsyncStorage, Zustand, Jest (`jest-expo`), TypeScript 5.9 strict.

## Global Constraints

- Voice & Copy: no guilt, no fake urgency, no streak-loss language; no em/en dash or spaced hyphen-as-dash in notification copy (`PRODUCT.md`; mirrors `tests/unit/notificationCopy.test.ts`).
- Sanctioned notifications only: Momentum at-risk (`momentumWarningNotifications.ts`), per-mark reminders (`markReminder.ts`), sleep/wake (`sleepNotification.ts`), plus the new re-engagement nudge. No daily-completion or streak-based notifications.
- Re-engage rules (verbatim): trigger `activeGoalCount ≥ 1 && daysIdle ≥ 7`; repeat at most once per 7 days; per-app single notification; suppressed by master-off, missing permission, or an already-planned Momentum at-risk warning (at-risk wins).
- `PRESERVE` (do not delete) from `behaviorNotifications.ts`: `pickFireInWindow`, `recordBehaviorAppForeground`, `getLastBehaviorForegroundMs`, `recordBehaviorNotificationTap`, and the private helpers `pickFireInWindow` depends on (`jitterWithinWindow`, `clampToDayWindow`, `startOfLocalDay`).
- Tests live in `tests/unit/*.test.ts(x)`; run `npm run test`. Full suite green + `type-check` + `lint` non-regressing after each task.
- **Out of scope:** expired-goal UI surfacing (P1-6, held for 3.2); momentum at-risk / per-mark / sleep logic (kept as-is); the batch-1 fixes (`plans/2026-06-22-coherence-robustness-fixes.md`).

---

### Task 1: Re-engagement nudge core (pure logic + copy)

**Files:**
- Create: `lib/notifications/reengageNudge.ts`
- Test: `tests/unit/reengageNudge.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `planReengageNudge(input: ReengageInput): ReengageNudge | null`; `REENGAGE_TITLE`, `REENGAGE_BODY`; types `ReengageInput { activeGoalCount: number; daysIdle: number; lastNudgeDate: string | null; atRiskPlanned: boolean; today: string }` and `ReengageNudge { title: string; body: string }`. Constants `REENGAGE_IDLE_DAYS = 7`, `REENGAGE_REPEAT_DAYS = 7`.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/reengageNudge.test.ts
import { planReengageNudge, REENGAGE_TITLE, REENGAGE_BODY } from '../../lib/notifications/reengageNudge';

const base = { activeGoalCount: 1, daysIdle: 7, lastNudgeDate: null, atRiskPlanned: false, today: '2026-06-22' };

describe('planReengageNudge', () => {
  it('returns the nudge at exactly 7 idle days', () => {
    expect(planReengageNudge(base)).toEqual({ title: REENGAGE_TITLE, body: REENGAGE_BODY });
  });
  it('returns null below the 7-day threshold', () => {
    expect(planReengageNudge({ ...base, daysIdle: 6 })).toBeNull();
  });
  it('returns null with no active goal', () => {
    expect(planReengageNudge({ ...base, activeGoalCount: 0 })).toBeNull();
  });
  it('suppresses when a momentum at-risk warning is planned', () => {
    expect(planReengageNudge({ ...base, atRiskPlanned: true })).toBeNull();
  });
  it('honors the weekly repeat cap', () => {
    expect(planReengageNudge({ ...base, lastNudgeDate: '2026-06-17' })).toBeNull(); // 5 days ago
    expect(planReengageNudge({ ...base, lastNudgeDate: '2026-06-15' })).toEqual({ title: REENGAGE_TITLE, body: REENGAGE_BODY }); // 7 days ago
  });
  it('copy carries no banned tokens or dashes', () => {
    const banned = /\b(lose|losing|lost|streak|miss|hurry|tomorrow|now or never)\b/i;
    for (const s of [REENGAGE_TITLE, REENGAGE_BODY]) {
      expect(s).not.toMatch(banned);
      expect(s).not.toMatch(/[—–]/);
      expect(s).not.toMatch(/ - /);
      expect(s).not.toMatch(/don't|can't lose/i);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- reengageNudge`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the module**

```typescript
// lib/notifications/reengageNudge.ts
export const REENGAGE_TITLE = 'Your goal is still here.';
export const REENGAGE_BODY = "Whenever you're ready, pick up where you left off. There's no rush.";

export const REENGAGE_IDLE_DAYS = 7;
export const REENGAGE_REPEAT_DAYS = 7;

export interface ReengageInput {
  activeGoalCount: number;
  daysIdle: number;
  lastNudgeDate: string | null; // 'yyyy-MM-dd' or null
  atRiskPlanned: boolean;
  today: string; // 'yyyy-MM-dd'
}
export interface ReengageNudge {
  title: string;
  body: string;
}

function daysBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  const a = new Date(fy, fm - 1, fd).getTime();
  const b = new Date(ty, tm - 1, td).getTime();
  return Math.round((b - a) / 86_400_000);
}

export function planReengageNudge(input: ReengageInput): ReengageNudge | null {
  if (input.activeGoalCount < 1) return null;
  if (input.atRiskPlanned) return null;
  if (input.daysIdle < REENGAGE_IDLE_DAYS) return null;
  if (input.lastNudgeDate && daysBetween(input.lastNudgeDate, input.today) < REENGAGE_REPEAT_DAYS) {
    return null;
  }
  return { title: REENGAGE_TITLE, body: REENGAGE_BODY };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- reengageNudge`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/notifications/reengageNudge.ts tests/unit/reengageNudge.test.ts
git commit -m "feat(3.1): re-engagement nudge core logic + guard-safe copy"
```

---

### Task 2: Re-engagement scheduler

**Files:**
- Modify: `lib/notifications/reengageNudge.ts` (add `scheduleReengageNudge`)
- Test: `tests/unit/reengageScheduler.test.ts`

**Interfaces:**
- Consumes: `planReengageNudge` (Task 1); `getLivraRemindersEnabled` (`lib/notifications/livraReminderPrefs.ts`); `hasMomentumWarningPlannedForToday(goals, marks, today)` (`lib/notifications/momentumWarningPlan.ts:50`); `useGoalsStore` (`state/goalsSlice.ts` — `getActiveGoals()`); `useMarksStore` (`state/countersSlice.ts` — `marks` with `last_activity_date`, `goal_id`); `getAppDate`/`formatDate`; `expo-notifications`; `AsyncStorage`; `LIVRA_BEHAVIOR_ID_PREFIX` (`lib/notifications/livraScheduledOwnership.ts`).
- Produces: `scheduleReengageNudge(userId: string | undefined): Promise<void>`.

Context: this is the I/O wrapper. It gathers inputs, applies the master-toggle and permission gates (kept out of the pure function), computes `daysIdle` from the newest `last_activity_date` across marks linked to active goals, reads/writes the persisted `lastReengageNudgeDate`, and schedules a single DATE notification ~1 hour out. It schedules nothing (and cancels any prior re-engage) when `planReengageNudge` returns `null`.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/reengageScheduler.test.ts
jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  scheduleNotificationAsync: jest.fn().mockResolvedValue('id-1'),
  cancelScheduledNotificationAsync: jest.fn().mockResolvedValue(undefined),
  SchedulableTriggerInputTypes: { DATE: 'date' },
}));
jest.mock('../../lib/notifications/livraReminderPrefs', () => ({ getLivraRemindersEnabled: jest.fn().mockResolvedValue(true) }));
jest.mock('../../lib/notifications/momentumWarningPlan', () => ({ hasMomentumWarningPlannedForToday: jest.fn().mockReturnValue(false) }));

import * as Notifications from 'expo-notifications';
import { getLivraRemindersEnabled } from '../../lib/notifications/livraReminderPrefs';
import { useGoalsStore } from '../../state/goalsSlice';
import { useMarksStore } from '../../state/countersSlice';
import { scheduleReengageNudge, REENGAGE_TITLE } from '../../lib/notifications/reengageNudge';
import AsyncStorage from '@react-native-async-storage/async-storage';

const eightDaysAgo = (() => { const d = new Date(); d.setDate(d.getDate() - 8); return d.toISOString().slice(0, 10); })();

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  useGoalsStore.setState({ goals: [{ id: 'g1', status: 'active', linked_mark_ids: ['m1'] } as any] });
  useMarksStore.setState({ marks: [{ id: 'm1', goal_id: 'g1', deleted_at: null, last_activity_date: eightDaysAgo } as any] });
});

describe('scheduleReengageNudge', () => {
  it('schedules the nudge when idle >= 7 days', async () => {
    await scheduleReengageNudge('u1');
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    const arg = (Notifications.scheduleNotificationAsync as jest.Mock).mock.calls[0][0];
    expect(arg.content.title).toBe(REENGAGE_TITLE);
  });

  it('schedules nothing when the master toggle is off', async () => {
    (getLivraRemindersEnabled as jest.Mock).mockResolvedValueOnce(false);
    await scheduleReengageNudge('u1');
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('schedules nothing when not idle long enough', async () => {
    useMarksStore.setState({ marks: [{ id: 'm1', goal_id: 'g1', deleted_at: null, last_activity_date: new Date().toISOString().slice(0, 10) } as any] });
    await scheduleReengageNudge('u1');
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- reengageScheduler`
Expected: FAIL — `scheduleReengageNudge` not exported.

- [ ] **Step 3: Add the scheduler to `lib/notifications/reengageNudge.ts`**

```typescript
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLivraRemindersEnabled } from './livraReminderPrefs';
import { hasMomentumWarningPlannedForToday } from './momentumWarningPlan';
import { LIVRA_BEHAVIOR_ID_PREFIX } from './livraScheduledOwnership';
import { useGoalsStore } from '../../state/goalsSlice';
import { useMarksStore } from '../../state/countersSlice';
import { getAppDate } from '../appDate';
import { formatDate } from '../date';
import { logger } from '../utils/logger';

const REENGAGE_ID = `${LIVRA_BEHAVIOR_ID_PREFIX}reengage`;
const LAST_NUDGE_KEY = 'livra_reengage_last_v1';

function daysIdleFromMarks(activeMarkDates: (string | null | undefined)[], today: string): number {
  const dates = activeMarkDates.filter((d): d is string => !!d).sort();
  if (dates.length === 0) return Number.MAX_SAFE_INTEGER; // never logged → treat as idle
  const newest = dates[dates.length - 1];
  const [ny, nm, nd] = newest.split('-').map(Number);
  const [ty, tm, td] = today.split('-').map(Number);
  return Math.round((new Date(ty, tm - 1, td).getTime() - new Date(ny, nm - 1, nd).getTime()) / 86_400_000);
}

export async function scheduleReengageNudge(userId: string | undefined): Promise<void> {
  try {
    if (!userId) return;
    if (!(await getLivraRemindersEnabled())) return;
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') return;

    const now = getAppDate();
    const today = formatDate(now);
    const goals = useGoalsStore.getState().getActiveGoals();
    const marks = useMarksStore.getState().marks;

    const activeGoalIds = new Set(goals.map((g) => g.id));
    const activeMarkDates = marks
      .filter((m) => !m.deleted_at && m.goal_id && activeGoalIds.has(m.goal_id))
      .map((m) => m.last_activity_date);

    const daysIdle = daysIdleFromMarks(activeMarkDates, today);
    const atRiskPlanned = hasMomentumWarningPlannedForToday(goals as any, marks as any, today);
    const lastNudgeDate = await AsyncStorage.getItem(LAST_NUDGE_KEY);

    const plan = planReengageNudge({
      activeGoalCount: goals.length,
      daysIdle,
      lastNudgeDate,
      atRiskPlanned,
      today,
    });

    // Always clear a prior re-engage slot so it never lingers when conditions lapse.
    await Notifications.cancelScheduledNotificationAsync(REENGAGE_ID).catch(() => {});
    if (!plan) return;

    const fireAt = new Date(now.getTime() + 60 * 60 * 1000); // ~1 hour out
    await Notifications.scheduleNotificationAsync({
      identifier: REENGAGE_ID,
      content: { title: plan.title, body: plan.body, data: { type: 'reengage', livraOwner: true } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: fireAt },
    });
    await AsyncStorage.setItem(LAST_NUDGE_KEY, today);
  } catch (e) {
    logger.warn('[Reengage] schedule failed', e);
  }
}
```

(Place the existing `planReengageNudge`/constants above or below; keep one file.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- reengageScheduler`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/notifications/reengageNudge.ts tests/unit/reengageScheduler.test.ts
git commit -m "feat(3.1): re-engagement nudge scheduler (master/permission/at-risk gated)"
```

---

### Task 3: Repoint the owner; strip the nag engine from behaviorNotifications

**Files:**
- Modify: `services/livraLocalNotificationOwner.ts:13-17,55-57`
- Modify: `services/behaviorNotifications.ts` (remove nag engine, keep primitives)
- Delete: `tests/unit/behaviorNotificationsCopy.test.ts`, `tests/unit/behaviorMomentumAtRisk.test.ts`, `tests/unit/behaviorMomentumAtRiskMultiGoal.test.ts`

**Interfaces:**
- Consumes: `scheduleReengageNudge` (Task 2).
- Produces: `behaviorNotifications.ts` continues to export `pickFireInWindow`, `recordBehaviorAppForeground`, `getLastBehaviorForegroundMs`, `recordBehaviorNotificationTap` (consumed by `momentumWarningNotifications.ts:20`, `livraLocalNotificationOwner.ts`, `app/_layout.tsx`).

Context: the owner is the single coalescing trigger. Repoint its flush to the new nudge; then remove the nag engine while preserving the shared primitives (Global Constraints `PRESERVE` list). The three deleted tests assert the removed nag copy / `computeDayProgress` at-risk path.

- [ ] **Step 1: Repoint the owner flush**

In `services/livraLocalNotificationOwner.ts`, change the import (lines 13-17) to drop `scheduleBehaviorNotifications` and add the nudge, keeping the foreground helpers:

```typescript
import {
  getLastBehaviorForegroundMs,
  recordBehaviorAppForeground,
} from './behaviorNotifications';
import { scheduleReengageNudge } from '../lib/notifications/reengageNudge';
```

Replace the flush body (lines 55-57) — the `previousFg` read is no longer needed by the scheduler:

```typescript
  try {
    await scheduleReengageNudge(userId);
  } catch (e) {
    logger.error('[LivraNotifOwner] schedule failed', e);
  } finally {
    await recordBehaviorAppForeground();
  }
```

- [ ] **Step 2: Strip the nag engine from `behaviorNotifications.ts`**

Remove these exports and their private helpers: `scheduleBehaviorNotifications`, `buildCopy`, `planCandidates`, `pickWithMinGap`, `computeDayProgress`, `deriveAtRiskFromMomentum`, `rollEngagementForNewDay`, `cancelBehaviorNotifications`, the `EngagementState`/`DayProgressSnapshot`/`BehaviorNotifType`/`PlannedBehaviorNotification` types, the engagement persistence (`loadEngagement`/`saveEngagement`, `ENGAGEMENT_KEY`), and `MIN_GAP_MS`/`MAX_PER_DAY`/`BEHAVIOR_NOTIF_PREFIX` if now unused. **Keep:** `pickFireInWindow` and the helpers it calls (`jitterWithinWindow`, `clampToDayWindow`, `startOfLocalDay`), and `recordBehaviorAppForeground`, `getLastBehaviorForegroundMs`, `recordBehaviorNotificationTap` (+ `LAST_FOREGROUND_KEY`). Remove now-unused imports (`query`, `resolveDailyTarget`, `isMarkActiveOnDate`, `computeStreak`, `activeGoalMomentumSnapshot`, `useGoalsStore`, `cancelAllLivraScheduledNotifications`, `cancelLivraScheduledByPrefix`, momentum types).

- [ ] **Step 3: Delete the obsolete nag tests**

```bash
git rm tests/unit/behaviorNotificationsCopy.test.ts tests/unit/behaviorMomentumAtRisk.test.ts tests/unit/behaviorMomentumAtRiskMultiGoal.test.ts
```

- [ ] **Step 4: Verify**

Run: `npm run type-check && npm run lint && npm run test`
Expected: type-check clean (no dangling refs to removed symbols; if any surface, they are in files this plan handles — Task 4/5), lint clean, suite green. `momentumWarningNotifications.ts` still imports `pickFireInWindow` successfully.

- [ ] **Step 5: Commit**

```bash
git add services/livraLocalNotificationOwner.ts services/behaviorNotifications.ts tests/
git commit -m "refactor(3.1): owner schedules re-engage nudge; strip daily-nag engine (keep primitives)"
```

---

### Task 4: Delete the parallel contextual-daily engine + its call sites

**Files:**
- Modify: `lib/notificationSystem.ts` (remove `scheduleContextualDailyNotification:170-283` and now-dead helpers)
- Modify: `hooks/useCounters.ts:15,145,614,633` (remove import + 4 calls)
- Modify: `hooks/useNotifications.ts:9,83` (remove import + call)
- Modify: `app/_layout.tsx:51,230,239` (remove import + 2 foreground calls)
- Delete: `tests/unit/notificationSystemSuppress.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing (pure removal). The re-engage nudge already fires via the owner (Task 3), which is triggered on foreground by the existing owner wiring.

Context: `scheduleContextualDailyNotification` is the second daily/streak engine (raw `computeStreak`, "One more today", "Day N ends at midnight"). Remove it and every direct call. Re-engagement is owner-driven now, not mutation-driven, so the 4 `useCounters` calls simply go away.

- [ ] **Step 1: Remove the call sites**

In `hooks/useCounters.ts`: delete the import (line 15) and the four `void scheduleContextualDailyNotification(...)` calls (≈145 in `createMark`, ≈614 in `updateMark`, ≈633 in `deleteMark`, and the one in `incrementMark`). In `hooks/useNotifications.ts`: delete the import (line 9) and the `await scheduleContextualDailyNotification(userId)` call (≈83). In `app/_layout.tsx`: delete the import (line 51) and both foreground calls (≈230, ≈239).

- [ ] **Step 2: Remove the engine + dead helpers from `lib/notificationSystem.ts`**

Delete `scheduleContextualDailyNotification` (170-283) and the now-unused private helpers it alone used: `computeStreak`, `bestWeekLoggedDays`, `uniqueDaysInRange`, `getAllLoggedDates`, `getCompletedTodayCount`, `getDailyHeader` usage, `MILESTONES`, `startOfWeekMonday`, `todayAt`, `isFuture`, `schedule`, and now-unused imports. Let `type-check` enumerate remaining dead references and remove them. Keep any export still imported elsewhere (verify with `grep -rn "from '.*notificationSystem'"` before removing the file-level exports; if nothing else is imported, the file may end up empty — if so, delete the file and its now-dead imports).

- [ ] **Step 3: Delete the obsolete test**

```bash
git rm tests/unit/notificationSystemSuppress.test.ts
```

- [ ] **Step 4: Verify**

Run: `npm run type-check && npm run lint && npm run test`
Expected: clean + green. No remaining references to `scheduleContextualDailyNotification`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(3.1): delete contextual-daily/streak notification engine + call sites"
```

---

### Task 5: Coherence copy cleanup on Home

**Files:**
- Modify: `app/(tabs)/focus.tsx:217-219` (greeting), `app/(tabs)/focus.tsx:428` (all-done line)
- Test: none (copy; verified by read + type-check + lint)

**Interfaces:** none.

Context: fold in the P2 daily-lean copy this work is adjacent to.

- [ ] **Step 1: Soften the greeting**

Replace `greetingText` (`app/(tabs)/focus.tsx:216-219`):

```tsx
  const greetingText = useMemo(() => {
    if (firstName) return `${firstName}, one step is enough.`;
    return 'One step is enough.';
  }, [firstName]);
```

- [ ] **Step 2: Rest-frame the all-done line**

Replace the line at `app/(tabs)/focus.tsx:428`:

```tsx
              {"That's everything for today."}
```

- [ ] **Step 3: Verify**

Run: `npm run type-check && npm run lint`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add app/(tabs)/focus.tsx
git commit -m "fix(3.1): rest-framed Home copy (drop daily 'see you tomorrow' lean)"
```

---

### Task 6: Regression guard for removed nag patterns

**Files:**
- Test: `tests/unit/notificationCoherenceGuard.test.ts` (create)

**Interfaces:** none.

Context: lock the rewrite so the daily-nag patterns cannot silently return.

- [ ] **Step 1: Write the guard test**

```typescript
// tests/unit/notificationCoherenceGuard.test.ts
import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join } from 'path';

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((e) => {
    const full = join(dir, e);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const ROOT = join(__dirname, '..', '..');
const SRC_DIRS = ['app', 'hooks', 'services', 'lib'].map((d) => join(ROOT, d));

describe('notification coherence guards', () => {
  it('no references to the removed daily engine', () => {
    const offenders: string[] = [];
    for (const dir of SRC_DIRS) for (const f of walk(dir)) {
      if (!/\.(ts|tsx)$/.test(f)) continue;
      if (/scheduleContextualDailyNotification|scheduleBehaviorNotifications/.test(readFileSync(f, 'utf8'))) {
        offenders.push(f);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('no banned daily-nag copy strings remain in source', () => {
    const banned = [/ends at midnight/i, /One more today/i, /Close it out before midnight/i, /starting over tomorrow/i, /You said you'd do this today/i, /See you tomorrow/i];
    const offenders: string[] = [];
    for (const dir of SRC_DIRS) for (const f of walk(dir)) {
      if (!/\.(ts|tsx)$/.test(f)) continue;
      const src = readFileSync(f, 'utf8');
      if (banned.some((re) => re.test(src))) offenders.push(f);
    }
    expect(offenders).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `npm run test -- notificationCoherenceGuard`
Expected: PASS (offenders empty after Tasks 3-5). If it fails, an earlier task missed a removal — fix there.

- [ ] **Step 3: Commit**

```bash
git add tests/unit/notificationCoherenceGuard.test.ts
git commit -m "test(3.1): guard against return of daily-nag notification patterns"
```

---

## Self-Review

**Spec coverage:** target set (Tasks 1-4), re-engage trigger/cadence/scope/suppression (Tasks 1-2), architecture consolidation/owner repoint/call-site removal (Tasks 3-4), copy cleanup (Task 5), testing incl. pure-function + copy guard + deletion guard (Tasks 1,2,6). Expired-goal UI surfacing correctly excluded (held for 3.2).

**Placeholder scan:** all code steps contain full code; deletion steps name exact symbols and rely on `type-check` to surface stragglers (a verification mechanism, not a placeholder).

**Type consistency:** `planReengageNudge(ReengageInput): ReengageNudge | null` and `scheduleReengageNudge(userId)` match between Tasks 1, 2, and 3. `pickFireInWindow` preserved for `momentumWarningNotifications.ts`. Owner import in Task 3 matches the foreground helpers Task 3 preserves.

**Spec deviation (flagged):** the spec's illustrative body "No streak to lose, nothing to catch up on…" contains the literal tokens `streak`/`lose`, which the no-banned-token copy guard (a spec requirement) would reject. The plan uses guard-safe copy with the same intent: *"Whenever you're ready, pick up where you left off. There's no rush."* The spec body line will be updated to match.

## Execution Handoff

After saving, choose execution: subagent-driven (fresh subagent per task, review between) or inline (executing-plans with checkpoints).
