# Milestone Moments — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fire up to three milestone moments per active goal (at 25/50/75% of target duration or day 7/30/60 for dateless goals), surfaced as an immediate push notification that routes to a brief full-screen moment screen.

**Architecture:** Pure helper `getMilestonesToFire` (tested) in `lib/goalMilestones.ts` → `markMilestonesFired` store action persists fired keys in the `Goal` type → foreground check in `_layout.tsx` fires immediate notification + marks fired → notification tap routes to `app/goal/milestone.tsx`.

**Tech Stack:** React Native, expo-router, expo-notifications, Zustand (`useGoalsStore`), date-fns (`differenceInDays`, `parseISO`), TypeScript strict, Jest.

**Spec:** `docs/superpowers/specs/2026-05-26-milestone-moments-design.md`

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `types/goal.ts` | Modify | Add `milestones_fired?: string[]` field |
| `lib/goalMilestones.ts` | Create | `getMilestonesToFire` pure helper + `MILESTONE_COPY` map |
| `tests/unit/goalMilestones.test.ts` | Create | 14 unit tests for the helper |
| `state/goalsSlice.ts` | Modify | Add `markMilestonesFired(goalId, keys)` store action |
| `app/goal/milestone.tsx` | Create | Moment screen — receives `goalTitle` + `milestoneKey` as params |
| `app/_layout.tsx` | Modify | Register route, module-level notification handler, `checkAndFireMilestones`, foreground check, notification tap routing |

---

## Task 1: Data model + pure helper (TDD)

**Files:**
- Modify: `types/goal.ts`
- Create: `lib/goalMilestones.ts`
- Create: `tests/unit/goalMilestones.test.ts`

- [ ] **Step 1: Add `milestones_fired` to the `Goal` type**

Open `types/goal.ts`. The current content is:

```typescript
export type GoalStatus = 'active' | 'queued' | 'completed';

export type Goal = {
  id: string;
  user_id: string;
  title: string;
  description?: string;
  status: GoalStatus;
  sort_index: number;
  target_date?: string | null;
  created_at: string;
  updated_at: string;
  completed_at?: string | null;
};
```

Add `milestones_fired?: string[];` after `completed_at`:

```typescript
export type GoalStatus = 'active' | 'queued' | 'completed';

export type Goal = {
  id: string;
  user_id: string;
  title: string;
  description?: string;
  status: GoalStatus;
  sort_index: number;
  target_date?: string | null;
  created_at: string;
  updated_at: string;
  completed_at?: string | null;
  milestones_fired?: string[];
};
```

- [ ] **Step 2: Create the failing test file**

Create `tests/unit/goalMilestones.test.ts`:

```typescript
import { getMilestonesToFire } from '../../lib/goalMilestones';
import type { Goal } from '../../types/goal';

const BASE_GOAL: Goal = {
  id: 'g1',
  user_id: 'u1',
  title: 'Test Goal',
  status: 'active',
  sort_index: 0,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

// Adds N days to Jan 1 2026 noon UTC — avoids midnight boundary issues
const daysAfterCreated = (days: number): Date =>
  new Date(new Date('2026-01-01T12:00:00.000Z').getTime() + days * 24 * 60 * 60 * 1000);

describe('getMilestonesToFire — dated goals', () => {
  // target_date is '2026-05-01' = 120 days after created_at
  // 25% = day 30, 50% = day 60, 75% = day 90
  const datedGoal: Goal = { ...BASE_GOAL, target_date: '2026-05-01' };

  it('returns [] before the 25% threshold', () => {
    expect(getMilestonesToFire(datedGoal, daysAfterCreated(29))).toEqual([]);
  });

  it("returns ['25'] at the 25% threshold", () => {
    expect(getMilestonesToFire(datedGoal, daysAfterCreated(30))).toEqual(['25']);
  });

  it('does not re-fire a milestone already in milestones_fired', () => {
    const goal = { ...datedGoal, milestones_fired: ['25'] };
    expect(getMilestonesToFire(goal, daysAfterCreated(30))).toEqual([]);
  });

  it("returns ['50'] at the 50% threshold when '25' already fired", () => {
    const goal = { ...datedGoal, milestones_fired: ['25'] };
    expect(getMilestonesToFire(goal, daysAfterCreated(60))).toEqual(['50']);
  });

  it("returns ['75'] at the 75% threshold when '25' and '50' already fired", () => {
    const goal = { ...datedGoal, milestones_fired: ['25', '50'] };
    expect(getMilestonesToFire(goal, daysAfterCreated(90))).toEqual(['75']);
  });

  it('returns multiple keys when multiple thresholds are crossed simultaneously', () => {
    expect(getMilestonesToFire(datedGoal, daysAfterCreated(90))).toEqual(['25', '50', '75']);
  });

  it('returns [] when target_date equals created_at (zero-length goal)', () => {
    const goal = { ...BASE_GOAL, target_date: '2026-01-01' };
    expect(getMilestonesToFire(goal, daysAfterCreated(1))).toEqual([]);
  });
});

describe('getMilestonesToFire — dateless goals', () => {
  it('returns [] before day 7', () => {
    expect(getMilestonesToFire(BASE_GOAL, daysAfterCreated(6))).toEqual([]);
  });

  it("returns ['7'] at day 7", () => {
    expect(getMilestonesToFire(BASE_GOAL, daysAfterCreated(7))).toEqual(['7']);
  });

  it("returns ['30'] at day 30 when '7' already fired", () => {
    const goal = { ...BASE_GOAL, milestones_fired: ['7'] };
    expect(getMilestonesToFire(goal, daysAfterCreated(30))).toEqual(['30']);
  });

  it("returns ['60'] at day 60 when '7' and '30' already fired", () => {
    const goal = { ...BASE_GOAL, milestones_fired: ['7', '30'] };
    expect(getMilestonesToFire(goal, daysAfterCreated(60))).toEqual(['60']);
  });

  it('returns multiple keys when multiple thresholds are crossed simultaneously', () => {
    expect(getMilestonesToFire(BASE_GOAL, daysAfterCreated(60))).toEqual(['7', '30', '60']);
  });
});

describe('getMilestonesToFire — status guard', () => {
  it('returns [] for queued goals', () => {
    const goal: Goal = { ...BASE_GOAL, status: 'queued' };
    expect(getMilestonesToFire(goal, daysAfterCreated(90))).toEqual([]);
  });

  it('returns [] for completed goals', () => {
    const goal: Goal = { ...BASE_GOAL, status: 'completed', completed_at: '2026-03-01T00:00:00.000Z' };
    expect(getMilestonesToFire(goal, daysAfterCreated(90))).toEqual([]);
  });
});
```

- [ ] **Step 3: Run tests to confirm they fail**

```bash
cd /mnt/c/Users/DEIVI/Desktop/Livra && npm run test -- tests/unit/goalMilestones.test.ts
```

Expected: fails with `Cannot find module '../../lib/goalMilestones'`.

- [ ] **Step 4: Create `lib/goalMilestones.ts`**

```typescript
import { differenceInDays, parseISO } from 'date-fns';
import type { Goal } from '../types/goal';

export const MILESTONE_COPY: Record<string, string> = {
  '25': "A quarter of the way there. Keep going.",
  '50': "Halfway. You're still here.",
  '75': "Almost. Don't stop now.",
  '7':  "One week in. That's something.",
  '30': "A month of showing up. It's working.",
  '60': "Two months. This one's yours now.",
};

const DATED_KEYS = ['25', '50', '75'] as const;
const DATELESS_KEYS = ['7', '30', '60'] as const;

export function getMilestonesToFire(goal: Goal, today: Date): string[] {
  if (goal.status !== 'active') return [];

  const fired = goal.milestones_fired ?? [];
  const due: string[] = [];

  if (goal.target_date) {
    const totalDays = differenceInDays(parseISO(goal.target_date), parseISO(goal.created_at));
    if (totalDays <= 0) return [];
    const elapsedDays = differenceInDays(today, parseISO(goal.created_at));
    const progress = (elapsedDays / totalDays) * 100;

    for (const key of DATED_KEYS) {
      const threshold = parseInt(key, 10);
      if (progress >= threshold && !fired.includes(key)) {
        due.push(key);
      }
    }
  } else {
    const elapsedDays = differenceInDays(today, parseISO(goal.created_at));

    for (const key of DATELESS_KEYS) {
      const threshold = parseInt(key, 10);
      if (elapsedDays >= threshold && !fired.includes(key)) {
        due.push(key);
      }
    }
  }

  return due;
}
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
cd /mnt/c/Users/DEIVI/Desktop/Livra && npm run test -- tests/unit/goalMilestones.test.ts
```

Expected: all 14 tests pass.

- [ ] **Step 6: Run full suite to confirm no regressions**

```bash
cd /mnt/c/Users/DEIVI/Desktop/Livra && npm run test
```

Expected: 231 tests pass (217 existing + 14 new).

- [ ] **Step 7: Commit**

```bash
cd /mnt/c/Users/DEIVI/Desktop/Livra && git add types/goal.ts lib/goalMilestones.ts tests/unit/goalMilestones.test.ts && git commit -m "feat(phase3): add Goal.milestones_fired + getMilestonesToFire helper

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 2: Store action — `markMilestonesFired`

**Files:**
- Modify: `state/goalsSlice.ts`

- [ ] **Step 1: Add `markMilestonesFired` to the `GoalsState` interface**

Open `state/goalsSlice.ts`. Find the `GoalsState` interface (lines 20–37). Add `markMilestonesFired` after `updateGoalTargetDate`:

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
  markMilestonesFired: (goalId: string, keys: string[]) => Promise<void>;
  getActiveGoal: () => Goal | undefined;
  getQueuedGoals: () => Goal[];
  getCompletedGoals: () => Goal[];
}
```

- [ ] **Step 2: Add the implementation**

In the `create<GoalsState>` body, find `updateGoalTargetDate` (the last action before the getters). Add `markMilestonesFired` immediately after it:

```typescript
  updateGoalTargetDate: async (id, date) => {
    const now = new Date().toISOString();
    const goal = get().goals.find(g => g.id === id);
    if (!goal) return;
    const updated: Goal = { ...goal, target_date: date, updated_at: now };
    await upsertGoal(updated);
    set(s => ({ goals: s.goals.map(g => (g.id === id ? updated : g)) }));
  },

  markMilestonesFired: async (goalId, keys) => {
    if (keys.length === 0) return;
    const goal = get().goals.find(g => g.id === goalId);
    if (!goal) return;
    const now = new Date().toISOString();
    const existing = goal.milestones_fired ?? [];
    const updated: Goal = {
      ...goal,
      milestones_fired: [...new Set([...existing, ...keys])],
      updated_at: now,
    };
    await upsertGoal(updated);
    set(s => ({ goals: s.goals.map(g => (g.id === goalId ? updated : g)) }));
  },
```

- [ ] **Step 3: Type-check**

```bash
cd /mnt/c/Users/DEIVI/Desktop/Livra && npm run type-check 2>&1 | grep "goalsSlice\|markMilestones" | head -10
```

Expected: no errors referencing `goalsSlice` or `markMilestones`.

- [ ] **Step 4: Commit**

```bash
cd /mnt/c/Users/DEIVI/Desktop/Livra && git add state/goalsSlice.ts && git commit -m "feat(phase3): add markMilestonesFired store action

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 3: Milestone moment screen + route registration

**Files:**
- Create: `app/goal/milestone.tsx`
- Modify: `app/_layout.tsx`

- [ ] **Step 1: Create `app/goal/milestone.tsx`**

```typescript
import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, TextInput, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withDelay,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { colors } from '../../theme/colors';
import { spacing, fontSize, fontWeight, borderRadius } from '../../theme/tokens';
import { useEffectiveTheme } from '../../state/uiSlice';
import { MILESTONE_COPY } from '../../lib/goalMilestones';

export default function GoalMilestoneScreen() {
  const theme = useEffectiveTheme();
  const themeColors = colors[theme];
  const router = useRouter();
  const { goalTitle, milestoneKey } = useLocalSearchParams<{ goalTitle: string; milestoneKey: string }>();

  const [phase, setPhase] = useState<'moment' | 'reflect'>('moment');
  const [reflection, setReflection] = useState('');

  const scale = useSharedValue(0.88);
  const opacity = useSharedValue(0);
  const subtitleOpacity = useSharedValue(0);

  const titleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  const subtitleStyle = useAnimatedStyle(() => ({
    opacity: subtitleOpacity.value,
  }));

  useEffect(() => {
    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    scale.value = withSpring(1, { damping: 14, stiffness: 90 });
    opacity.value = withTiming(1, { duration: 500 });
    subtitleOpacity.value = withDelay(400, withTiming(1, { duration: 400 }));
  }, [scale, opacity, subtitleOpacity]);

  const copy = MILESTONE_COPY[milestoneKey ?? ''] ?? '';

  const handleKeepGoing = () => {
    router.replace('/(tabs)/home');
  };

  const handleReflectSubmit = () => {
    router.replace('/(tabs)/home');
  };

  if (phase === 'reflect') {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
        <View style={styles.center}>
          <Text style={[styles.reflectPrompt, { color: themeColors.textSecondary }]}>
            What made this one possible?
          </Text>
          <TextInput
            style={[
              styles.reflectInput,
              {
                color: themeColors.text,
                backgroundColor: themeColors.surface,
                borderColor: themeColors.border,
              },
            ]}
            placeholder="Write anything — or skip."
            placeholderTextColor={themeColors.textSecondary}
            value={reflection}
            onChangeText={setReflection}
            multiline
            numberOfLines={4}
            autoFocus
          />
          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: themeColors.primary }]}
            onPress={handleReflectSubmit}
          >
            <Text style={styles.primaryBtnText}>Done</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
      <View style={styles.center}>
        <Animated.View style={[styles.titleBlock, titleStyle]}>
          <Text style={[styles.goalName, { color: themeColors.textSecondary }]}>
            {goalTitle}
          </Text>
          <Text style={[styles.headline, { color: themeColors.text }]}>{copy}</Text>
        </Animated.View>

        <Animated.View style={[styles.actions, subtitleStyle]}>
          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: themeColors.primary }]}
            onPress={handleKeepGoing}
          >
            <Text style={styles.primaryBtnText}>Keep going</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.secondaryBtn, { borderColor: themeColors.border }]}
            onPress={() => setPhase('reflect')}
          >
            <Text style={[styles.secondaryBtnText, { color: themeColors.textSecondary }]}>
              Take a moment
            </Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.lg,
  },
  titleBlock: { alignItems: 'center', gap: spacing.xs },
  goalName: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  headline: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
    lineHeight: 32,
    textAlign: 'center',
  },
  actions: { width: '100%', gap: spacing.sm, marginTop: spacing.md },
  primaryBtn: {
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#FFFFFF', fontSize: fontSize.md, fontWeight: fontWeight.semibold },
  secondaryBtn: {
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    borderWidth: 1,
  },
  secondaryBtnText: { fontSize: fontSize.md },
  reflectPrompt: { fontSize: fontSize.lg, fontWeight: fontWeight.semibold, textAlign: 'center' },
  reflectInput: {
    width: '100%',
    borderWidth: 1,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    fontSize: fontSize.md,
    textAlignVertical: 'top',
    minHeight: 100,
  },
});
```

- [ ] **Step 2: Register the route in `app/_layout.tsx`**

Find the `goal/history` Stack.Screen (the last route registered, around line 386):

```typescript
        <Stack.Screen name="goal/history" options={{ headerShown: false }} />
```

Add the milestone route immediately after it:

```typescript
        <Stack.Screen name="goal/history" options={{ headerShown: false }} />
        <Stack.Screen
          name="goal/milestone"
          options={{
            presentation: 'fullScreenModal',
            headerShown: false,
            gestureEnabled: false,
          }}
        />
```

- [ ] **Step 3: Type-check**

```bash
cd /mnt/c/Users/DEIVI/Desktop/Livra && npm run type-check 2>&1 | grep "goal/milestone\|goalMilestone" | head -10
```

Expected: no errors referencing the new files.

- [ ] **Step 4: Commit**

```bash
cd /mnt/c/Users/DEIVI/Desktop/Livra && git add app/goal/milestone.tsx app/_layout.tsx && git commit -m "feat(phase3): add milestone moment screen and register route

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 4: Foreground check + notification routing

**Files:**
- Modify: `app/_layout.tsx`

This task wires together: when the app foregrounds (or starts fresh with goals loaded), check for due milestones, fire an immediate notification, mark them fired, and route to the moment screen when the user taps the notification.

- [ ] **Step 1: Add imports to `app/_layout.tsx`**

Find the existing import block at the top of `app/_layout.tsx`. Add three new imports after the existing ones:

```typescript
import { getMilestonesToFire, MILESTONE_COPY } from '../lib/goalMilestones';
import { getAppDate } from '../lib/appDate';
```

- [ ] **Step 2: Add the foreground notification handler at module level**

Find this block in `app/_layout.tsx` (around line 37, after the `queryClient` declaration):

```typescript
const queryClient = new QueryClient();
```

Add the notification handler immediately after it. This makes milestone notifications visible even when the app is in the foreground:

```typescript
const queryClient = new QueryClient();

Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const data = notification.request.content.data as Record<string, unknown>;
    return {
      shouldShowAlert: data?.type === 'milestone',
      shouldPlaySound: false,
      shouldSetBadge: false,
    };
  },
});
```

- [ ] **Step 3: Add `checkAndFireMilestones` as a module-level function**

Add this function immediately after the `Notifications.setNotificationHandler` block (before `RootLayout`):

```typescript
async function checkAndFireMilestones(): Promise<void> {
  const { goals, markMilestonesFired } = useGoalsStore.getState();
  const today = getAppDate();
  const activeGoals = goals.filter(g => g.status === 'active');
  for (const goal of activeGoals) {
    const due = getMilestonesToFire(goal, today);
    if (due.length === 0) continue;
    const toNotify = due[due.length - 1];
    await Notifications.scheduleNotificationAsync({
      identifier: `livra-milestone-${goal.id}-${toNotify}`,
      content: {
        title: goal.title,
        body: MILESTONE_COPY[toNotify],
        data: { type: 'milestone', goalTitle: goal.title, milestoneKey: toNotify, livraOwner: true },
      },
      trigger: null,
    });
    await markMilestonesFired(goal.id, due);
  }
}
```

- [ ] **Step 4: Extend the notification response listener**

Find the first `useEffect` in `RootLayout` (around line 64). It currently defines `handleBehaviorResponse` and uses it in `getLastNotificationResponseAsync` and `responseSub`. 

Add `handleMilestoneResponse` right after `handleBehaviorResponse`:

```typescript
    const handleBehaviorResponse = (response: Notifications.NotificationResponse | null) => {
      if (!response) return;
      const data = response.notification.request.content.data as Record<string, unknown>;
      const t = data?.type;
      if (data?.behavior === true || (typeof t === 'string' && t.startsWith('behavior_'))) {
        recordBehaviorNotificationTap().catch(() => {});
      }
    };

    const handleMilestoneResponse = (response: Notifications.NotificationResponse | null) => {
      if (!response) return;
      const data = response.notification.request.content.data as Record<string, unknown>;
      if (
        data?.type === 'milestone' &&
        typeof data.goalTitle === 'string' &&
        typeof data.milestoneKey === 'string'
      ) {
        router.push({
          pathname: '/goal/milestone',
          params: { goalTitle: data.goalTitle, milestoneKey: data.milestoneKey },
        });
      }
    };
```

- [ ] **Step 5: Wire `handleMilestoneResponse` into both notification entry points**

In the same useEffect, find the `getLastNotificationResponseAsync` call and update it:

```typescript
    Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        handleBehaviorResponse(response);
        handleMilestoneResponse(response);
      })
      .catch(() => {});
```

Find the `responseSub` declaration and update it:

```typescript
    const responseSub = Notifications.addNotificationResponseReceivedListener((response) => {
      handleBehaviorResponse(response);
      handleMilestoneResponse(response);
      void recordBehaviorAppForeground();
      if (user?.id) scheduleContextualDailyNotification(user.id).catch(() => {});
    });
```

- [ ] **Step 6: Add milestone check to the foreground handler**

In the same useEffect, find `onAppState`:

```typescript
    const onAppState = (next: AppStateStatus) => {
      const wasBackground =
        appStateRef.current === 'background' || appStateRef.current === 'inactive';
      appStateRef.current = next;
      if (next === 'active' && wasBackground) {
        void recordBehaviorAppForeground();
        if (user?.id) scheduleContextualDailyNotification(user.id).catch(() => {});
      }
    };
```

Add the milestone check:

```typescript
    const onAppState = (next: AppStateStatus) => {
      const wasBackground =
        appStateRef.current === 'background' || appStateRef.current === 'inactive';
      appStateRef.current = next;
      if (next === 'active' && wasBackground) {
        void recordBehaviorAppForeground();
        if (user?.id) scheduleContextualDailyNotification(user.id).catch(() => {});
        checkAndFireMilestones().catch(() => {});
      }
    };
```

- [ ] **Step 7: Add milestone check after goals are loaded on startup**

Find the auto-sync useEffect (the one with `user && user.id`). Find this line inside the `try` block:

```typescript
          await useGoalsStore.getState().loadGoals(user.id);
```

Add the milestone check after it (it's safe — goals are loaded at this point):

```typescript
          await useGoalsStore.getState().loadGoals(user.id);
          checkAndFireMilestones().catch(() => {});
```

- [ ] **Step 8: Type-check**

```bash
cd /mnt/c/Users/DEIVI/Desktop/Livra && npm run type-check 2>&1 | grep -v "node_modules" | grep "error TS" | head -20
```

Expected: no new type errors (existing pre-existing errors in `counter/[id].tsx`, `profile.tsx`, etc. are unrelated and should be unchanged).

- [ ] **Step 9: Run full test suite**

```bash
cd /mnt/c/Users/DEIVI/Desktop/Livra && npm run test
```

Expected: 231 tests pass.

- [ ] **Step 10: Commit**

```bash
cd /mnt/c/Users/DEIVI/Desktop/Livra && git add app/_layout.tsx && git commit -m "feat(phase3): wire milestone foreground check and notification routing

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```
