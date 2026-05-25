# Phase 3B — Recalculation Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add optional target dates to goals and surface a "behind pace" banner + notification when mark consistency predicts the user will finish ≥ 7 days late.

**Architecture:** Pure pace logic in `lib/paceEngine.ts` → `hooks/usePaceAlert.ts` reads store state and manages notification scheduling → `components/PaceBanner.tsx` renders the dismissible in-app banner. Notification timing preference (Morning/Midday/Evening) stored in AsyncStorage; max 2 notifications per slump. Goals use AsyncStorage-backed JSON storage (`lib/db/goalsDb.ts`) so adding `target_date` to the `Goal` type is the entire data migration.

**Tech Stack:** date-fns, expo-notifications, @react-native-community/datetimepicker (new install), AsyncStorage, Zustand, TypeScript strict.

**Spec:** `docs/superpowers/specs/2026-05-25-phase3b-recalculation-engine-design.md`

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `types/goal.ts` | Modify | Add `target_date?: string \| null` |
| `state/goalsSlice.ts` | Modify | Add `updateGoalTargetDate` action |
| `lib/paceEngine.ts` | Create | Pure pace math: computePace, computeProjectedMiss, suggestNewTargetDate, isPaceBehind |
| `lib/notifications/paceNotification.ts` | Create | Schedule/cancel pace notifications; window preference helpers |
| `hooks/usePaceAlert.ts` | Create | Hook: reads store, computes pace, manages notification lifecycle |
| `components/PaceBanner.tsx` | Create | Dismissible banner + recalibrate bottom sheet |
| `app/(tabs)/home.tsx` | Modify | Import and render `<PaceBanner />` |
| `app/goal/queue.tsx` | Modify | Add target date row to active goal display |
| `app/(tabs)/settings.tsx` | Modify | Add Notifications section with pace window selector |
| `tests/unit/paceEngine.test.ts` | Create | Unit tests for all pure functions |

---

### Task 1: Install datetimepicker + extend Goal type + `updateGoalTargetDate`

**Files:**
- Install: `@react-native-community/datetimepicker`
- Modify: `types/goal.ts`
- Modify: `state/goalsSlice.ts`

- [ ] **Step 1: Install the date picker package**

```bash
npx expo install @react-native-community/datetimepicker
```

Expected: package added to `package.json` and `node_modules`. Requires EAS build (already required by Phase 3A).

- [ ] **Step 2: Add `target_date` to the Goal type**

Open `types/goal.ts`. Current content:
```typescript
export type GoalStatus = 'active' | 'queued' | 'completed';

export type Goal = {
  id: string;
  user_id: string;
  title: string;
  description?: string;
  status: GoalStatus;
  sort_index: number;
  created_at: string;
  updated_at: string;
  completed_at?: string | null;
};
```

Replace with:
```typescript
export type GoalStatus = 'active' | 'queued' | 'completed';

export type Goal = {
  id: string;
  user_id: string;
  title: string;
  description?: string;
  status: GoalStatus;
  sort_index: number;
  target_date?: string | null; // ISO 'YYYY-MM-DD', optional
  created_at: string;
  updated_at: string;
  completed_at?: string | null;
};
```

- [ ] **Step 3: Add `updateGoalTargetDate` to goalsSlice interface**

Open `state/goalsSlice.ts`. In the `GoalsState` interface (lines 20–36), add the new action after `reorderQueue`:

```typescript
interface GoalsState {
  goals: Goal[];
  loading: boolean;
  loadGoals: (userId: string) => Promise<void>;
  addGoal: (params: {
    title: string;
    description?: string;
    userId: string;
    isPro: boolean;
  }) => Promise<Goal>;
  completeGoal: (id: string) => Promise<void>;
  deleteGoal: (id: string) => Promise<void>;
  reorderQueue: (orderedIds: string[]) => Promise<void>;
  updateGoalTargetDate: (id: string, date: string | null) => Promise<void>;
  getActiveGoal: () => Goal | undefined;
  getQueuedGoals: () => Goal[];
  getCompletedGoals: () => Goal[];
}
```

- [ ] **Step 4: Implement `updateGoalTargetDate` in the store**

In `state/goalsSlice.ts`, inside `create<GoalsState>((set, get) => ({`, add after `reorderQueue`:

```typescript
  updateGoalTargetDate: async (id, date) => {
    const now = new Date().toISOString();
    const goal = get().goals.find(g => g.id === id);
    if (!goal) return;
    const updated: Goal = { ...goal, target_date: date, updated_at: now };
    await upsertGoal(updated);
    set(s => ({ goals: s.goals.map(g => (g.id === id ? updated : g)) }));
  },
```

- [ ] **Step 5: Type-check**

```bash
npm run type-check
```

Expected: no errors related to `Goal` or `goalsSlice`.

- [ ] **Step 6: Commit**

```bash
git add types/goal.ts state/goalsSlice.ts package.json package-lock.json
git commit -m "feat(phase3b): add target_date to Goal + updateGoalTargetDate action"
```

---

### Task 2: `lib/paceEngine.ts` (TDD)

**Files:**
- Create: `tests/unit/paceEngine.test.ts`
- Create: `lib/paceEngine.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/paceEngine.test.ts`:

```typescript
import { computePace, computeProjectedMiss, suggestNewTargetDate, isPaceBehind } from '../../lib/paceEngine';
import type { MarkEvent } from '../../types';
import { format, addDays, subDays } from 'date-fns';

function makeEvent(
  markId: string,
  date: string,
  overrides: Partial<MarkEvent> = {},
): MarkEvent {
  return {
    id: `evt-${markId}-${date}`,
    user_id: 'u1',
    mark_id: markId,
    event_type: 'increment',
    amount: 1,
    occurred_at: `${date}T12:00:00Z`,
    occurred_local_date: date,
    created_at: `${date}T12:00:00Z`,
    updated_at: `${date}T12:00:00Z`,
    ...overrides,
  };
}

const today = format(new Date(), 'yyyy-MM-dd');
const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd');
const oldDate = format(subDays(new Date(), 20), 'yyyy-MM-dd');

describe('computePace', () => {
  it('returns 1 when markCount is 0 (no alert)', () => {
    expect(computePace([], 0, 14)).toBe(1);
  });

  it('returns 1 when daysElapsed is 0 (no alert)', () => {
    expect(computePace([], 2, 0)).toBe(1);
  });

  it('counts distinct mark+date pairs', () => {
    // m1 checked today twice + m2 checked today once = 2 distinct pairs
    const events = [
      makeEvent('m1', today),
      makeEvent('m1', today),
      makeEvent('m2', today),
    ];
    expect(computePace(events, 2, 14)).toBeCloseTo(2 / 28);
  });

  it('excludes events older than 14 days', () => {
    const events = [makeEvent('m1', oldDate)];
    expect(computePace(events, 1, 14)).toBe(0);
  });

  it('caps lookback window at 14 days even if daysElapsed is larger', () => {
    const events = [makeEvent('m1', today), makeEvent('m1', yesterday)];
    expect(computePace(events, 1, 30)).toBeCloseTo(2 / 14);
  });

  it('excludes deleted events', () => {
    const events = [makeEvent('m1', today, { deleted_at: today })];
    expect(computePace(events, 1, 14)).toBe(0);
  });

  it('excludes non-increment events', () => {
    const events = [makeEvent('m1', today, { event_type: 'reset' })];
    expect(computePace(events, 1, 14)).toBe(0);
  });
});

describe('computeProjectedMiss', () => {
  it('returns 0 when pace is 1 (on track)', () => {
    const future = format(addDays(new Date(), 14), 'yyyy-MM-dd');
    expect(computeProjectedMiss(future, 1)).toBe(0);
  });

  it('returns correct miss for pace 0.5 and 14 remaining days', () => {
    const future = format(addDays(new Date(), 14), 'yyyy-MM-dd');
    // projectedDays = ceil(14 / 0.5) = 28; miss = 28 - 14 = 14
    expect(computeProjectedMiss(future, 0.5)).toBe(14);
  });

  it('floors to 30 extra days when pace is 0', () => {
    const future = format(addDays(new Date(), 10), 'yyyy-MM-dd');
    // projectedDays = 10 + 30 = 40; miss = 40 - 10 = 30
    expect(computeProjectedMiss(future, 0)).toBe(30);
  });

  it('returns 0 when target is already in the past', () => {
    const past = format(subDays(new Date(), 5), 'yyyy-MM-dd');
    expect(computeProjectedMiss(past, 0.5)).toBe(0);
  });
});

describe('suggestNewTargetDate', () => {
  it('returns today + projectedDays for pace 0.5 with 14 remaining', () => {
    const future = format(addDays(new Date(), 14), 'yyyy-MM-dd');
    const expected = format(addDays(new Date(), 28), 'yyyy-MM-dd');
    expect(suggestNewTargetDate(future, 0.5)).toBe(expected);
  });

  it('adds remainingDays + 30 when pace is 0', () => {
    const future = format(addDays(new Date(), 10), 'yyyy-MM-dd');
    const expected = format(addDays(new Date(), 40), 'yyyy-MM-dd');
    expect(suggestNewTargetDate(future, 0)).toBe(expected);
  });

  it('returns today + 30 when target is past and pace is 0', () => {
    const past = format(subDays(new Date(), 5), 'yyyy-MM-dd');
    const expected = format(addDays(new Date(), 30), 'yyyy-MM-dd');
    expect(suggestNewTargetDate(past, 0)).toBe(expected);
  });
});

describe('isPaceBehind', () => {
  it('returns false when miss is 0', () => {
    expect(isPaceBehind(0)).toBe(false);
  });

  it('returns false when miss is 6', () => {
    expect(isPaceBehind(6)).toBe(false);
  });

  it('returns true when miss is exactly 7', () => {
    expect(isPaceBehind(7)).toBe(true);
  });

  it('returns true when miss is 14', () => {
    expect(isPaceBehind(14)).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm run test -- tests/unit/paceEngine.test.ts --no-coverage
```

Expected: FAIL — "Cannot find module '../../lib/paceEngine'"

- [ ] **Step 3: Implement `lib/paceEngine.ts`**

Create `lib/paceEngine.ts`:

```typescript
import { differenceInDays, parseISO, addDays, format } from 'date-fns';
import type { MarkEvent } from '../types';

export function computePace(
  events: MarkEvent[],
  markCount: number,
  daysElapsed: number,
): number {
  if (markCount === 0 || daysElapsed === 0) return 1;
  const window = Math.min(daysElapsed, 14);
  const cutoffDate = format(addDays(new Date(), -window), 'yyyy-MM-dd');
  const recent = events.filter(
    e =>
      e.event_type === 'increment' &&
      !e.deleted_at &&
      e.occurred_local_date >= cutoffDate,
  );
  const pairs = new Set(recent.map(e => `${e.mark_id}:${e.occurred_local_date}`));
  return pairs.size / (markCount * window);
}

export function computeProjectedMiss(
  targetDate: string,
  pace: number,
): number {
  const today = format(new Date(), 'yyyy-MM-dd');
  const remainingDays = Math.max(0, differenceInDays(parseISO(targetDate), parseISO(today)));
  if (remainingDays === 0) return 0;
  const projectedDays = pace > 0 ? Math.ceil(remainingDays / pace) : remainingDays + 30;
  return Math.max(0, projectedDays - remainingDays);
}

export function suggestNewTargetDate(
  targetDate: string,
  pace: number,
): string {
  const today = format(new Date(), 'yyyy-MM-dd');
  const remainingDays = Math.max(0, differenceInDays(parseISO(targetDate), parseISO(today)));
  const projectedDays = pace > 0 ? Math.ceil(remainingDays / pace) : remainingDays + 30;
  return format(addDays(new Date(), projectedDays), 'yyyy-MM-dd');
}

export function isPaceBehind(projectedMiss: number): boolean {
  return projectedMiss >= 7;
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npm run test -- tests/unit/paceEngine.test.ts --no-coverage
```

Expected: PASS — all tests green.

- [ ] **Step 5: Commit**

```bash
git add lib/paceEngine.ts tests/unit/paceEngine.test.ts
git commit -m "feat(phase3b): add paceEngine with computePace, computeProjectedMiss, suggestNewTargetDate"
```

---

### Task 3: `lib/notifications/paceNotification.ts`

**Files:**
- Create: `lib/notifications/paceNotification.ts`

Reference: `lib/notifications/sleepNotification.ts` for the expo-notifications pattern.

- [ ] **Step 1: Create `lib/notifications/paceNotification.ts`**

```typescript
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { differenceInDays, parseISO } from 'date-fns';

export type PaceWindow = 'morning' | 'midday' | 'evening';

export type PaceNotifState = {
  firedAt: string | null;
  followUpFiredAt: string | null;
};

const PACE_WINDOW_KEY = '@livra_pace_notification_window';
const PACE_NOTIF_STATE_PREFIX = '@livra_pace_notif_state:';

const WINDOW_RANGES: Record<PaceWindow, { startHour: number; endHour: number }> = {
  morning: { startHour: 7, endHour: 9 },
  midday: { startHour: 11, endHour: 13 },
  evening: { startHour: 18, endHour: 20 },
};

function randomTimeInWindow(win: PaceWindow): { hour: number; minute: number } {
  const { startHour, endHour } = WINDOW_RANGES[win];
  const totalMinutes = (endHour - startHour) * 60;
  const rand = Math.floor(Math.random() * totalMinutes);
  return { hour: startHour + Math.floor(rand / 60), minute: rand % 60 };
}

export async function getPaceNotifWindow(): Promise<PaceWindow> {
  const stored = await AsyncStorage.getItem(PACE_WINDOW_KEY);
  return (stored as PaceWindow) ?? 'morning';
}

export async function setPaceNotifWindow(win: PaceWindow): Promise<void> {
  await AsyncStorage.setItem(PACE_WINDOW_KEY, win);
}

export async function getPaceNotifState(goalId: string): Promise<PaceNotifState> {
  const raw = await AsyncStorage.getItem(`${PACE_NOTIF_STATE_PREFIX}${goalId}`);
  return raw ? (JSON.parse(raw) as PaceNotifState) : { firedAt: null, followUpFiredAt: null };
}

export async function setPaceNotifState(
  goalId: string,
  state: PaceNotifState,
): Promise<void> {
  await AsyncStorage.setItem(
    `${PACE_NOTIF_STATE_PREFIX}${goalId}`,
    JSON.stringify(state),
  );
}

export async function clearPaceNotifState(goalId: string): Promise<void> {
  await AsyncStorage.removeItem(`${PACE_NOTIF_STATE_PREFIX}${goalId}`);
}

export async function schedulePaceNotification(
  goalId: string,
  goalTitle: string,
  projectedMiss: number,
  win: PaceWindow,
  identifier: string,
): Promise<void> {
  const { hour, minute } = randomTimeInWindow(win);
  await Notifications.scheduleNotificationAsync({
    identifier,
    content: {
      title: 'Still fixable.',
      body: `At your current pace, ${goalTitle} finishes about ${projectedMiss} days late.`,
      data: { screen: 'home' },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute,
    },
  });
}

export async function cancelPaceNotifications(goalId: string): Promise<void> {
  await Promise.all([
    Notifications.cancelScheduledNotificationAsync(`livra-pace-${goalId}-1`).catch(() => {}),
    Notifications.cancelScheduledNotificationAsync(`livra-pace-${goalId}-2`).catch(() => {}),
  ]);
  await clearPaceNotifState(goalId);
}

export function daysSince(isoDate: string): number {
  return differenceInDays(new Date(), parseISO(isoDate));
}
```

- [ ] **Step 2: Type-check**

```bash
npm run type-check
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/notifications/paceNotification.ts
git commit -m "feat(phase3b): add paceNotification helpers (schedule, cancel, window preference)"
```

---

### Task 4: `hooks/usePaceAlert.ts`

**Files:**
- Create: `hooks/usePaceAlert.ts`

This hook reads from three Zustand stores, computes pace and projected miss, and manages notification lifecycle.

- [ ] **Step 1: Create `hooks/usePaceAlert.ts`**

```typescript
import { useEffect, useRef } from 'react';
import { differenceInDays, parseISO, format } from 'date-fns';
import { useGoalsStore } from '../state/goalsSlice';
import { useCountersStore } from '../state/countersSlice';
import { useEventsStore } from '../state/eventsSlice';
import {
  computePace,
  computeProjectedMiss,
  suggestNewTargetDate,
  isPaceBehind,
} from '../lib/paceEngine';
import {
  getPaceNotifWindow,
  getPaceNotifState,
  setPaceNotifState,
  cancelPaceNotifications,
  schedulePaceNotification,
  daysSince,
} from '../lib/notifications/paceNotification';

export type PaceAlertResult = {
  isBehind: boolean;
  projectedMiss: number;
  suggestedDate: string | null;
  goalTitle: string;
  goalId: string;
};

export function usePaceAlert(): PaceAlertResult {
  const goals = useGoalsStore(s => s.goals);
  const counters = useCountersStore(s => s.counters);
  const events = useEventsStore(s => s.events);

  const activeGoal = goals.find(g => g.status === 'active');
  const markCount = counters.length;

  const daysElapsed = activeGoal
    ? Math.max(0, differenceInDays(new Date(), parseISO(activeGoal.created_at)))
    : 0;

  // No pace computation or alert if goal is < 7 days old or has no target date
  const hasSufficientHistory = daysElapsed >= 7;
  const hasTargetDate = Boolean(activeGoal?.target_date);

  const pace =
    activeGoal && hasSufficientHistory
      ? computePace(events, markCount, daysElapsed)
      : 1;

  const projectedMiss =
    activeGoal?.target_date && hasSufficientHistory
      ? computeProjectedMiss(activeGoal.target_date, pace)
      : 0;

  const behind =
    hasSufficientHistory && hasTargetDate ? isPaceBehind(projectedMiss) : false;

  const suggestedDate =
    behind && activeGoal?.target_date
      ? suggestNewTargetDate(activeGoal.target_date, pace)
      : null;

  const prevBehindRef = useRef<boolean | null>(null);

  useEffect(() => {
    if (!activeGoal) return;
    const goalId = activeGoal.id;
    const goalTitle = activeGoal.title;
    const today = format(new Date(), 'yyyy-MM-dd');

    async function syncNotifications() {
      if (!behind) {
        // Pace recovered — cancel all notifications and reset state
        if (prevBehindRef.current === true) {
          await cancelPaceNotifications(goalId);
        }
        prevBehindRef.current = false;
        return;
      }

      // behind === true: schedule up to 2 notifications per slump
      const win = await getPaceNotifWindow();
      const state = await getPaceNotifState(goalId);

      if (!state.firedAt) {
        // First notification — fires immediately (scheduled as DAILY at a random time)
        await schedulePaceNotification(
          goalId,
          goalTitle,
          projectedMiss,
          win,
          `livra-pace-${goalId}-1`,
        );
        await setPaceNotifState(goalId, { firedAt: today, followUpFiredAt: null });
      } else if (!state.followUpFiredAt && daysSince(state.firedAt) >= 7) {
        // Follow-up after 7 days of no recovery
        await schedulePaceNotification(
          goalId,
          goalTitle,
          projectedMiss,
          win,
          `livra-pace-${goalId}-2`,
        );
        await setPaceNotifState(goalId, { ...state, followUpFiredAt: today });
      }
      // Both fired — nothing more to schedule

      prevBehindRef.current = true;
    }

    syncNotifications().catch(() => {});
  }, [behind, activeGoal?.id, activeGoal?.title, projectedMiss]);

  return {
    isBehind: behind,
    projectedMiss,
    suggestedDate,
    goalTitle: activeGoal?.title ?? '',
    goalId: activeGoal?.id ?? '',
  };
}
```

- [ ] **Step 2: Type-check**

```bash
npm run type-check
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add hooks/usePaceAlert.ts
git commit -m "feat(phase3b): add usePaceAlert hook with notification lifecycle management"
```

---

### Task 5: `components/PaceBanner.tsx`

**Files:**
- Create: `components/PaceBanner.tsx`

The banner is dismissible (resets daily), shows projected miss copy, and opens a recalibrate bottom sheet modal with a date picker.

- [ ] **Step 1: Create `components/PaceBanner.tsx`**

```tsx
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
  Platform,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { format, parseISO } from 'date-fns';
import { colors } from '../theme/colors';
import { spacing, fontSize, fontWeight, borderRadius } from '../theme/tokens';
import { useEffectiveTheme } from '../state/uiSlice';
import { useGoalsStore } from '../state/goalsSlice';

type Props = {
  isBehind: boolean;
  projectedMiss: number;
  goalTitle: string;
  goalId: string;
  suggestedDate: string | null;
};

function dismissedKey(goalId: string): string {
  const today = format(new Date(), 'yyyy-MM-dd');
  return `@livra_pace_banner_dismissed:${goalId}:${today}`;
}

export function PaceBanner({
  isBehind,
  projectedMiss,
  goalTitle,
  goalId,
  suggestedDate,
}: Props) {
  const theme = useEffectiveTheme();
  const themeColors = colors[theme];
  const updateGoalTargetDate = useGoalsStore(s => s.updateGoalTargetDate);

  const [dismissed, setDismissed] = useState(true); // hidden until async check
  const [modalVisible, setModalVisible] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [pickedDate, setPickedDate] = useState<Date>(
    suggestedDate ? parseISO(suggestedDate) : new Date(),
  );

  useEffect(() => {
    if (!isBehind || !goalId) {
      setDismissed(true);
      return;
    }
    AsyncStorage.getItem(dismissedKey(goalId)).then(val => {
      setDismissed(val === '1');
    });
  }, [isBehind, goalId]);

  if (!isBehind || dismissed) return null;

  const handleDismiss = async () => {
    await AsyncStorage.setItem(dismissedKey(goalId), '1');
    setDismissed(true);
  };

  const handleAccept = async () => {
    if (!suggestedDate) return;
    await updateGoalTargetDate(goalId, suggestedDate);
    setModalVisible(false);
    setDismissed(true);
  };

  const handlePickDate = async (date: Date) => {
    const iso = format(date, 'yyyy-MM-dd');
    await updateGoalTargetDate(goalId, iso);
    setShowDatePicker(false);
    setModalVisible(false);
    setDismissed(true);
  };

  return (
    <>
      <View style={[styles.banner, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
        <View style={styles.bannerContent}>
          <Text style={[styles.bannerText, { color: themeColors.text }]}>
            At this pace,{' '}
            <Text style={{ fontWeight: fontWeight.semibold }}>{goalTitle}</Text>
            {' '}finishes about{' '}
            <Text style={{ fontWeight: fontWeight.semibold }}>{projectedMiss} days late</Text>
            . Still fixable.
          </Text>
          <TouchableOpacity
            style={[styles.recalibrateBtn, { backgroundColor: themeColors.primary }]}
            onPress={() => setModalVisible(true)}
          >
            <Text style={styles.recalibrateBtnText}>Recalibrate</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity onPress={handleDismiss} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={[styles.dismiss, { color: themeColors.textSecondary }]}>×</Text>
        </TouchableOpacity>
      </View>

      <Modal
        visible={modalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => { setModalVisible(false); setShowDatePicker(false); }}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => { setModalVisible(false); setShowDatePicker(false); }}
        >
          <TouchableOpacity
            style={[styles.sheet, { backgroundColor: themeColors.surface }]}
            activeOpacity={1}
          >
            <Text style={[styles.sheetTitle, { color: themeColors.textSecondary }]}>
              Suggested target
            </Text>
            <Text style={[styles.sheetDate, { color: themeColors.text }]}>
              {suggestedDate
                ? format(parseISO(suggestedDate), 'MMMM d, yyyy')
                : 'No suggestion available'}
            </Text>

            {!showDatePicker && (
              <>
                <TouchableOpacity
                  style={[styles.acceptBtn, { backgroundColor: themeColors.primary }]}
                  onPress={handleAccept}
                >
                  <Text style={styles.acceptBtnText}>Yes, update it</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setShowDatePicker(true)}>
                  <Text style={[styles.pickLink, { color: themeColors.textSecondary }]}>
                    Pick a different date
                  </Text>
                </TouchableOpacity>
              </>
            )}

            {showDatePicker && Platform.OS === 'ios' && (
              <>
                <DateTimePicker
                  value={pickedDate}
                  mode="date"
                  display="spinner"
                  minimumDate={new Date()}
                  onChange={(_, date) => { if (date) setPickedDate(date); }}
                  style={{ width: '100%' }}
                />
                <TouchableOpacity
                  style={[styles.acceptBtn, { backgroundColor: themeColors.primary }]}
                  onPress={() => handlePickDate(pickedDate)}
                >
                  <Text style={styles.acceptBtnText}>Set this date</Text>
                </TouchableOpacity>
              </>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
    marginHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  bannerContent: { flex: 1, gap: spacing.sm },
  bannerText: { fontSize: fontSize.sm, lineHeight: 20 },
  recalibrateBtn: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
  },
  recalibrateBtnText: {
    color: '#FFFFFF',
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  dismiss: { fontSize: 22, lineHeight: 24 },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    borderTopLeftRadius: borderRadius.lg,
    borderTopRightRadius: borderRadius.lg,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxl ?? spacing.xl,
    gap: spacing.md,
  },
  sheetTitle: { fontSize: fontSize.sm, fontWeight: fontWeight.medium, textTransform: 'uppercase', letterSpacing: 1 },
  sheetDate: { fontSize: fontSize.xl ?? fontSize.lg, fontWeight: fontWeight.bold },
  acceptBtn: {
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  acceptBtnText: { color: '#FFFFFF', fontSize: fontSize.md, fontWeight: fontWeight.semibold },
  pickLink: { fontSize: fontSize.sm, textAlign: 'center', textDecorationLine: 'underline' },
});
```

- [ ] **Step 2: Type-check**

```bash
npm run type-check
```

Expected: no errors. If `spacing.xxl` doesn't exist in tokens, replace with `spacing.xl` (the fallback `?? spacing.xl` already handles this at runtime, but fix the type if needed).

- [ ] **Step 3: Commit**

```bash
git add components/PaceBanner.tsx
git commit -m "feat(phase3b): add PaceBanner component with recalibrate modal"
```

---

### Task 6: Wire `PaceBanner` into `home.tsx`

**Files:**
- Modify: `app/(tabs)/home.tsx`

- [ ] **Step 1: Add imports at top of `home.tsx`**

After the existing imports (around line 51 where `ActiveGoalBanner` is imported), add:

```typescript
import { PaceBanner } from '../../components/PaceBanner';
import { usePaceAlert } from '../../hooks/usePaceAlert';
```

- [ ] **Step 2: Call `usePaceAlert` inside the component**

Inside `HomeScreen` (the default export), after the other hook calls (around line 79 where `useCounters` is called), add:

```typescript
const paceAlert = usePaceAlert();
```

- [ ] **Step 3: Render `<PaceBanner />` after `<ActiveGoalBanner />`**

Find this block (around line 1125):

```tsx
{/* ── Active goal banner — always visible (not gated on marks) ── */}
{!isEditMode && <ActiveGoalBanner />}
{!isEditMode && <CheckinButton />}
```

Replace with:

```tsx
{/* ── Active goal banner — always visible (not gated on marks) ── */}
{!isEditMode && <ActiveGoalBanner />}
{!isEditMode && (
  <PaceBanner
    isBehind={paceAlert.isBehind}
    projectedMiss={paceAlert.projectedMiss}
    goalTitle={paceAlert.goalTitle}
    goalId={paceAlert.goalId}
    suggestedDate={paceAlert.suggestedDate}
  />
)}
{!isEditMode && <CheckinButton />}
```

- [ ] **Step 4: Type-check**

```bash
npm run type-check
```

Expected: no errors.

- [ ] **Step 5: Run tests**

```bash
npm run test --no-coverage
```

Expected: existing tests still pass (177+).

- [ ] **Step 6: Commit**

```bash
git add app/(tabs)/home.tsx
git commit -m "feat(phase3b): wire PaceBanner into home screen"
```

---

### Task 7: Target date UI in `goal/queue.tsx`

**Files:**
- Modify: `app/goal/queue.tsx`

Add a target date row to the active goal card. Tapping opens a date picker; saving calls `updateGoalTargetDate`.

- [ ] **Step 1: Add imports to `goal/queue.tsx`**

Add to the existing imports:

```typescript
import DateTimePicker from '@react-native-community/datetimepicker';
import { Platform } from 'react-native';
import { format, parseISO } from 'date-fns';
```

And add `Modal` to the React Native imports already at the top.

- [ ] **Step 2: Add state and handler**

Inside `GoalQueueScreen`, after the existing `useState` calls, add:

```typescript
const updateGoalTargetDate = useGoalsStore(s => s.updateGoalTargetDate);
const [showTargetPicker, setShowTargetPicker] = useState(false);
const [targetPickerDate, setTargetPickerDate] = useState(new Date());
```

Add handler:

```typescript
const handleSaveTargetDate = async (date: Date) => {
  if (!active) return;
  await updateGoalTargetDate(active.id, format(date, 'yyyy-MM-dd'));
  setShowTargetPicker(false);
};

const handleOpenTargetPicker = () => {
  if (!active) return;
  const initial = active.target_date ? parseISO(active.target_date) : new Date();
  setTargetPickerDate(initial);
  setShowTargetPicker(true);
};

const handleClearTargetDate = async () => {
  if (!active) return;
  await updateGoalTargetDate(active.id, null);
};
```

- [ ] **Step 3: Add target date row to the active goal card**

Find where the active goal card renders its title and details. In `goal/queue.tsx`, look for where `active.title` is displayed and add the target date row below it. Add this JSX inside the active goal section:

```tsx
{/* Target date row */}
<TouchableOpacity
  style={[styles.targetDateRow, { borderTopColor: themeColors.border }]}
  onPress={handleOpenTargetPicker}
  activeOpacity={0.75}
>
  <Text style={[styles.targetDateLabel, { color: themeColors.textSecondary }]}>
    Target date
  </Text>
  <Text style={[styles.targetDateValue, { color: active?.target_date ? themeColors.text : themeColors.textSecondary }]}>
    {active?.target_date
      ? format(parseISO(active.target_date), 'MMM d, yyyy')
      : 'Not set'}
  </Text>
</TouchableOpacity>
```

Add this `Modal` just before the closing `</SafeAreaView>`:

```tsx
<Modal
  visible={showTargetPicker}
  transparent
  animationType="slide"
  onRequestClose={() => setShowTargetPicker(false)}
>
  <TouchableOpacity
    style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' }}
    activeOpacity={1}
    onPress={() => setShowTargetPicker(false)}
  >
    <TouchableOpacity
      style={{ backgroundColor: themeColors.surface, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: spacing.xl }}
      activeOpacity={1}
    >
      <Text style={{ color: themeColors.textSecondary, fontSize: fontSize.sm, fontWeight: fontWeight.medium, textTransform: 'uppercase', letterSpacing: 1, marginBottom: spacing.md }}>
        Target date
      </Text>
      {Platform.OS === 'ios' && (
        <DateTimePicker
          value={targetPickerDate}
          mode="date"
          display="spinner"
          minimumDate={new Date()}
          onChange={(_, date) => { if (date) setTargetPickerDate(date); }}
          style={{ width: '100%' }}
        />
      )}
      <TouchableOpacity
        style={{ backgroundColor: themeColors.primary, borderRadius: borderRadius.md, paddingVertical: spacing.md, alignItems: 'center', marginTop: spacing.md }}
        onPress={() => handleSaveTargetDate(targetPickerDate)}
      >
        <Text style={{ color: '#FFFFFF', fontSize: fontSize.md, fontWeight: fontWeight.semibold }}>
          Set date
        </Text>
      </TouchableOpacity>
      {active?.target_date && (
        <TouchableOpacity onPress={handleClearTargetDate} style={{ alignItems: 'center', marginTop: spacing.sm }}>
          <Text style={{ color: themeColors.textSecondary, fontSize: fontSize.sm, textDecorationLine: 'underline' }}>
            Clear target date
          </Text>
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  </TouchableOpacity>
</Modal>
```

- [ ] **Step 4: Add styles to `goal/queue.tsx` StyleSheet**

Add to `StyleSheet.create({...})`:

```typescript
targetDateRow: {
  flexDirection: 'row',
  justifyContent: 'space-between',
  alignItems: 'center',
  paddingTop: spacing.sm,
  marginTop: spacing.sm,
  borderTopWidth: StyleSheet.hairlineWidth,
},
targetDateLabel: {
  fontSize: fontSize.sm,
},
targetDateValue: {
  fontSize: fontSize.sm,
  fontWeight: fontWeight.medium,
},
```

- [ ] **Step 5: Type-check**

```bash
npm run type-check
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add app/goal/queue.tsx
git commit -m "feat(phase3b): add target date row and date picker to goal queue screen"
```

---

### Task 8: Settings — Pace notification window

**Files:**
- Modify: `app/(tabs)/settings.tsx`

Add a "Notifications" section between Appearance and Subscription with a pace alert timing selector.

- [ ] **Step 1: Add imports to `settings.tsx`**

Add to the existing imports:

```typescript
import { getPaceNotifWindow, setPaceNotifWindow, PaceWindow } from '../../lib/notifications/paceNotification';
```

- [ ] **Step 2: Add state for pace window**

Inside the settings component, after existing `useState` calls, add:

```typescript
const [paceWindow, setPaceWindowState] = useState<PaceWindow>('morning');

useEffect(() => {
  getPaceNotifWindow().then(win => setPaceWindowState(win));
}, []);

const handlePaceWindowChange = async (win: PaceWindow) => {
  await setPaceNotifWindow(win);
  setPaceWindowState(win);
};
```

- [ ] **Step 3: Add Notifications section JSX**

Find the `{/* Appearance */}` section comment (around line 1483). Insert a new "Notifications" section **before** it:

```tsx
{/* Notifications */}
<View style={styles.section}>
  <AppText variant="caption" style={[styles.sectionKicker, { color: themeColors.textTertiary }]}>
    Notifications
  </AppText>
  <Card
    backgroundColor={themeColors.surface}
    borderColor={themeColors.border}
    borderRadiusKey="card"
  >
    <View style={styles.settingRowTall}>
      <View style={{ flex: 1 }}>
        <AppText variant="body" style={{ color: themeColors.text, fontWeight: fontWeight.semibold }}>
          Pace alerts
        </AppText>
        <AppText variant="caption" style={{ color: themeColors.textSecondary }}>
          When you're running behind on a goal
        </AppText>
      </View>
    </View>
    <View style={{ flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.md, paddingBottom: spacing.md }}>
      {(['morning', 'midday', 'evening'] as PaceWindow[]).map(win => (
        <TouchableOpacity
          key={win}
          style={[
            styles.windowChip,
            {
              backgroundColor: paceWindow === win ? themeColors.primary : themeColors.surfaceVariant,
              borderColor: paceWindow === win ? themeColors.primary : themeColors.border,
            },
          ]}
          onPress={() => handlePaceWindowChange(win)}
          activeOpacity={0.75}
        >
          <AppText
            variant="caption"
            style={{
              color: paceWindow === win ? '#FFFFFF' : themeColors.text,
              fontWeight: fontWeight.medium,
              textTransform: 'capitalize',
            }}
          >
            {win}
          </AppText>
        </TouchableOpacity>
      ))}
    </View>
  </Card>
</View>

{/* Appearance */}
```

- [ ] **Step 4: Add `windowChip` style to StyleSheet**

Find `StyleSheet.create({` in `settings.tsx` and add:

```typescript
windowChip: {
  flex: 1,
  alignItems: 'center',
  paddingVertical: spacing.sm,
  borderRadius: borderRadius.sm,
  borderWidth: 1,
},
```

- [ ] **Step 5: Type-check**

```bash
npm run type-check
```

Expected: no errors.

- [ ] **Step 6: Run all tests**

```bash
npm run test --no-coverage
```

Expected: all existing tests pass + new paceEngine tests pass.

- [ ] **Step 7: Commit**

```bash
git add app/(tabs)/settings.tsx
git commit -m "feat(phase3b): add Notifications section with pace alert window selector to settings"
```

---

## Done

Phase 3B is complete when all 8 tasks are committed. Key behaviors to manually verify on device (EAS development build):

1. Set a target date on an active goal from the queue screen
2. With low check-in history, the PaceBanner appears on home screen with correct projected miss
3. Tapping "Recalibrate" → "Yes, update it" updates the target date and dismisses the banner
4. Tapping "Pick a different date" shows the iOS date spinner
5. Dismissing the banner hides it for the day
6. Settings → Notifications → pace window selector updates preference
7. After 7 days of being behind, a second notification is scheduled (verify via `expo-notifications` debug tools)
