# Phase 2B — Daily Check-in

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the daily check-in flow — a single focused screen tied to the active goal ("Did you work on [Goal] today?") that records a yes/no response and surfaces a check-in button on the home screen.

**Architecture:** Check-ins are stored in AsyncStorage (`@livra_checkins`) as a flat JSON array — one entry per (user_id, goal_id, date). The `checkinsDb.ts` layer handles CRUD; `checkinsSlice.ts` manages state. The home screen adds a `CheckinButton` above the marks grid when an active goal exists. The check-in screen is a full-screen stack modal.

**Tech Stack:** React Native / Expo, TypeScript, Zustand, AsyncStorage, expo-router, Jest.

**Prerequisite:** Phase 2A must be complete — this plan requires `Goal` type, `useGoalsStore`, and `ActiveGoalBanner`.

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `types/checkin.ts` | Create | `DailyCheckin` type |
| `lib/db/checkinsDb.ts` | Create | AsyncStorage CRUD for check-ins |
| `state/checkinsSlice.ts` | Create | Zustand slice: load, add, query |
| `lib/checkinLogic.ts` | Create | Pure: todayCheckin selector, hasCheckedInToday |
| `components/CheckinButton.tsx` | Create | Home screen CTA showing today's check-in state |
| `app/checkin.tsx` | Create | Full-screen check-in modal |
| `tests/unit/checkins.test.ts` | Create | Unit tests for checkinLogic.ts |
| `app/_layout.tsx` | Modify | Register `checkin` stack screen |
| `app/(tabs)/home.tsx` | Modify | Add `CheckinButton` above marks |

---

## Task 1: Type, pure logic, and tests

**Files:**
- Create: `types/checkin.ts`
- Create: `lib/checkinLogic.ts`
- Create: `tests/unit/checkins.test.ts`

- [ ] **Step 1: Create `types/checkin.ts`**

```typescript
export type DailyCheckin = {
  id: string;
  user_id: string;
  goal_id: string;
  date: string;       // YYYY-MM-DD
  showed_up: boolean;
  created_at: string;
};
```

- [ ] **Step 2: Create `lib/checkinLogic.ts`**

```typescript
import type { DailyCheckin } from '../types/checkin';

export function getTodayCheckin(
  checkins: DailyCheckin[],
  goalId: string,
  todayDate: string,
): DailyCheckin | undefined {
  return checkins.find(c => c.goal_id === goalId && c.date === todayDate);
}

export function hasCheckedInToday(
  checkins: DailyCheckin[],
  goalId: string,
  todayDate: string,
): boolean {
  return getTodayCheckin(checkins, goalId, todayDate) !== undefined;
}

export function getCheckinStreak(
  checkins: DailyCheckin[],
  goalId: string,
  todayDate: string,
): number {
  const positives = checkins
    .filter(c => c.goal_id === goalId && c.showed_up)
    .sort((a, b) => b.date.localeCompare(a.date));

  if (positives.length === 0) return 0;

  let streak = 0;
  let cursor = new Date(`${todayDate}T00:00:00`);

  for (const entry of positives) {
    const entryDate = entry.date;
    const cursorStr = cursor.toISOString().slice(0, 10);
    if (entryDate === cursorStr) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    } else if (entryDate < cursorStr) {
      break;
    }
  }

  return streak;
}
```

- [ ] **Step 3: Create `tests/unit/checkins.test.ts`**

```typescript
import {
  getTodayCheckin,
  hasCheckedInToday,
  getCheckinStreak,
} from '../../lib/checkinLogic';
import type { DailyCheckin } from '../../types/checkin';

function makeCheckin(overrides: Partial<DailyCheckin> = {}): DailyCheckin {
  return {
    id: 'c1',
    user_id: 'u1',
    goal_id: 'g1',
    date: '2026-05-25',
    showed_up: true,
    created_at: '2026-05-25T08:00:00Z',
    ...overrides,
  };
}

describe('getTodayCheckin', () => {
  test('returns matching checkin', () => {
    const checkins = [makeCheckin()];
    expect(getTodayCheckin(checkins, 'g1', '2026-05-25')).toEqual(checkins[0]);
  });

  test('returns undefined when no match for date', () => {
    const checkins = [makeCheckin({ date: '2026-05-24' })];
    expect(getTodayCheckin(checkins, 'g1', '2026-05-25')).toBeUndefined();
  });

  test('returns undefined when no match for goal', () => {
    const checkins = [makeCheckin({ goal_id: 'g2' })];
    expect(getTodayCheckin(checkins, 'g1', '2026-05-25')).toBeUndefined();
  });
});

describe('hasCheckedInToday', () => {
  test('true when checkin exists today', () => {
    const checkins = [makeCheckin()];
    expect(hasCheckedInToday(checkins, 'g1', '2026-05-25')).toBe(true);
  });

  test('false when no checkin today', () => {
    expect(hasCheckedInToday([], 'g1', '2026-05-25')).toBe(false);
  });
});

describe('getCheckinStreak', () => {
  test('0 when no checkins', () => {
    expect(getCheckinStreak([], 'g1', '2026-05-25')).toBe(0);
  });

  test('1 for a single checkin today', () => {
    const checkins = [makeCheckin({ date: '2026-05-25' })];
    expect(getCheckinStreak(checkins, 'g1', '2026-05-25')).toBe(1);
  });

  test('counts consecutive days ending today', () => {
    const checkins = [
      makeCheckin({ date: '2026-05-25' }),
      makeCheckin({ date: '2026-05-24', id: 'c2' }),
      makeCheckin({ date: '2026-05-23', id: 'c3' }),
    ];
    expect(getCheckinStreak(checkins, 'g1', '2026-05-25')).toBe(3);
  });

  test('breaks streak on gap', () => {
    const checkins = [
      makeCheckin({ date: '2026-05-25' }),
      // gap: no 2026-05-24
      makeCheckin({ date: '2026-05-23', id: 'c3' }),
    ];
    expect(getCheckinStreak(checkins, 'g1', '2026-05-25')).toBe(1);
  });

  test('only counts showed_up=true entries', () => {
    const checkins = [
      makeCheckin({ date: '2026-05-25', showed_up: false }),
    ];
    expect(getCheckinStreak(checkins, 'g1', '2026-05-25')).toBe(0);
  });
});
```

- [ ] **Step 4: Run tests — expect failures (modules not found)**

```bash
cd /mnt/c/Users/DEIVI/Desktop/Livra && npm run test -- tests/unit/checkins.test.ts
```

Expected: FAIL until `types/checkin.ts` and `lib/checkinLogic.ts` exist. After both are created: all tests PASS.

- [ ] **Step 5: Run tests — expect pass**

```bash
cd /mnt/c/Users/DEIVI/Desktop/Livra && npm run test -- tests/unit/checkins.test.ts
```

Expected: all 10 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add types/checkin.ts lib/checkinLogic.ts tests/unit/checkins.test.ts
git commit -m "$(cat <<'EOF'
feat(phase2b): add DailyCheckin type, pure logic, and unit tests

checkinLogic.ts provides getTodayCheckin, hasCheckedInToday, and
getCheckinStreak for test-isolated business logic.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: AsyncStorage DB layer and Zustand slice

**Files:**
- Create: `lib/db/checkinsDb.ts`
- Create: `state/checkinsSlice.ts`

- [ ] **Step 1: Create `lib/db/checkinsDb.ts`**

```typescript
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { DailyCheckin } from '../../types/checkin';

const CHECKINS_KEY = '@livra_checkins';

async function readAll(): Promise<DailyCheckin[]> {
  try {
    const raw = await AsyncStorage.getItem(CHECKINS_KEY);
    return raw ? (JSON.parse(raw) as DailyCheckin[]) : [];
  } catch {
    return [];
  }
}

async function writeAll(checkins: DailyCheckin[]): Promise<void> {
  await AsyncStorage.setItem(CHECKINS_KEY, JSON.stringify(checkins));
}

export async function loadCheckinsForUser(userId: string): Promise<DailyCheckin[]> {
  const all = await readAll();
  return all.filter(c => c.user_id === userId);
}

export async function upsertCheckin(checkin: DailyCheckin): Promise<void> {
  const all = await readAll();
  const idx = all.findIndex(
    c => c.user_id === checkin.user_id && c.goal_id === checkin.goal_id && c.date === checkin.date,
  );
  if (idx >= 0) {
    all[idx] = checkin;
  } else {
    all.push(checkin);
  }
  await writeAll(all);
}
```

- [ ] **Step 2: Create `state/checkinsSlice.ts`**

```typescript
import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import type { DailyCheckin } from '../types/checkin';
import { loadCheckinsForUser, upsertCheckin } from '../lib/db/checkinsDb';
import { getTodayCheckin, hasCheckedInToday, getCheckinStreak } from '../lib/checkinLogic';
import { formatDate } from '../lib/date';
import { getAppDate } from '../lib/appDate';

interface CheckinsState {
  checkins: DailyCheckin[];
  loading: boolean;
  loadCheckins: (userId: string) => Promise<void>;
  recordCheckin: (userId: string, goalId: string, showedUp: boolean) => Promise<DailyCheckin>;
  getTodayCheckin: (goalId: string) => DailyCheckin | undefined;
  hasCheckedInToday: (goalId: string) => boolean;
  getCheckinStreak: (goalId: string) => number;
}

export const useCheckinsStore = create<CheckinsState>((set, get) => ({
  checkins: [],
  loading: false,

  loadCheckins: async (userId) => {
    set({ loading: true });
    try {
      const checkins = await loadCheckinsForUser(userId);
      set({ checkins, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  recordCheckin: async (userId, goalId, showedUp) => {
    const today = formatDate(getAppDate());
    const existing = getTodayCheckin(get().checkins, goalId, today);
    const now = new Date().toISOString();

    const checkin: DailyCheckin = existing
      ? { ...existing, showed_up: showedUp }
      : { id: uuidv4(), user_id: userId, goal_id: goalId, date: today, showed_up: showedUp, created_at: now };

    await upsertCheckin(checkin);
    set(s => {
      const without = s.checkins.filter(
        c => !(c.user_id === userId && c.goal_id === goalId && c.date === today),
      );
      return { checkins: [...without, checkin] };
    });

    return checkin;
  },

  getTodayCheckin: (goalId) =>
    getTodayCheckin(get().checkins, goalId, formatDate(getAppDate())),

  hasCheckedInToday: (goalId) =>
    hasCheckedInToday(get().checkins, goalId, formatDate(getAppDate())),

  getCheckinStreak: (goalId) =>
    getCheckinStreak(get().checkins, goalId, formatDate(getAppDate())),
}));
```

- [ ] **Step 3: Load checkins on app start in `app/_layout.tsx`**

Find where `useGoalsStore.getState().loadGoals(user.id)` was added in Phase 2A. Add `loadCheckins` after it:

```typescript
import { useCheckinsStore } from '../state/checkinsSlice';

// Inside the auth useEffect, after loadGoals:
await useCheckinsStore.getState().loadCheckins(user.id);
```

- [ ] **Step 4: Run full test suite**

```bash
cd /mnt/c/Users/DEIVI/Desktop/Livra && npm run test
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/db/checkinsDb.ts state/checkinsSlice.ts app/_layout.tsx
git commit -m "$(cat <<'EOF'
feat(phase2b): add check-in AsyncStorage layer and Zustand slice

upsertCheckin deduplicates by (user_id, goal_id, date) so changing
your answer the same day works. Slice auto-loads on auth.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Check-in screen and home button

**Files:**
- Create: `components/CheckinButton.tsx`
- Create: `app/checkin.tsx`
- Modify: `app/_layout.tsx` (register route)
- Modify: `app/(tabs)/home.tsx` (add button)

- [ ] **Step 1: Register the checkin route in `app/_layout.tsx`**

Add to the `<Stack>` in `app/_layout.tsx`:

```tsx
<Stack.Screen
  name="checkin"
  options={{ presentation: 'modal', headerShown: false }}
/>
```

- [ ] **Step 2: Create `app/checkin.tsx`**

```typescript
import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { colors } from '../theme/colors';
import { spacing, fontSize, fontWeight, borderRadius } from '../theme/tokens';
import { useEffectiveTheme } from '../state/uiSlice';
import { useGoalsStore } from '../state/goalsSlice';
import { useCheckinsStore } from '../state/checkinsSlice';
import { useAuth } from '../hooks/useAuth';

export default function CheckinScreen() {
  const theme = useEffectiveTheme();
  const themeColors = colors[theme];
  const router = useRouter();
  const { user } = useAuth();
  const getActiveGoal = useGoalsStore(s => s.getActiveGoal);
  const { recordCheckin, hasCheckedInToday, getCheckinStreak } = useCheckinsStore();
  const [answered, setAnswered] = useState(false);
  const [response, setResponse] = useState<boolean | null>(null);

  const activeGoal = getActiveGoal();
  const goalId = activeGoal?.id ?? '';
  const alreadyCheckedIn = hasCheckedInToday(goalId);
  const streak = getCheckinStreak(goalId);

  const handleAnswer = async (showedUp: boolean) => {
    if (!user?.id || !goalId) return;
    if (Platform.OS !== 'web') {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    await recordCheckin(user.id, goalId, showedUp);
    setResponse(showedUp);
    setAnswered(true);
  };

  if (!activeGoal) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
        <TouchableOpacity style={styles.closeBtn} onPress={() => router.back()}>
          <Text style={[styles.closeText, { color: themeColors.textSecondary }]}>Done</Text>
        </TouchableOpacity>
        <View style={styles.center}>
          <Text style={[styles.noGoalText, { color: themeColors.textSecondary }]}>
            Add a goal first to start checking in.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
      <TouchableOpacity style={styles.closeBtn} onPress={() => router.back()}>
        <Text style={[styles.closeText, { color: themeColors.textSecondary }]}>
          {answered ? 'Done' : 'Skip'}
        </Text>
      </TouchableOpacity>

      <View style={styles.center}>
        {!answered ? (
          <>
            <Text style={[styles.goalContext, { color: themeColors.textSecondary }]}>
              {activeGoal.title}
            </Text>
            <Text style={[styles.question, { color: themeColors.text }]}>
              Did you show up for this today?
            </Text>

            <View style={styles.actions}>
              <TouchableOpacity
                style={[styles.yesBtn, { backgroundColor: themeColors.primary }]}
                onPress={() => handleAnswer(true)}
              >
                <Text style={styles.yesBtnText}>I showed up</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.noBtn, { borderColor: themeColors.border }]}
                onPress={() => handleAnswer(false)}
              >
                <Text style={[styles.noBtnText, { color: themeColors.textSecondary }]}>
                  Not today
                </Text>
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <>
            {response ? (
              <>
                <Text style={[styles.responseTitle, { color: themeColors.text }]}>
                  {streak >= 7 ? `${streak} days.` : streak >= 3 ? 'Keep going.' : 'Logged.'}
                </Text>
                <Text style={[styles.responseSubtitle, { color: themeColors.textSecondary }]}>
                  {streak >= 7
                    ? "That's the work."
                    : streak >= 3
                    ? 'Stack another day.'
                    : 'See you tomorrow.'}
                </Text>
              </>
            ) : (
              <>
                <Text style={[styles.responseTitle, { color: themeColors.text }]}>
                  Noted.
                </Text>
                <Text style={[styles.responseSubtitle, { color: themeColors.textSecondary }]}>
                  Tomorrow is the reset.
                </Text>
              </>
            )}
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  closeBtn: { alignSelf: 'flex-end', padding: spacing.md },
  closeText: { fontSize: fontSize.md },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: spacing.xl },
  goalContext: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.sm,
  },
  question: {
    fontSize: fontSize.xxl ?? 28,
    fontWeight: fontWeight.bold,
    textAlign: 'center',
    lineHeight: 36,
    marginBottom: spacing.xl,
  },
  noGoalText: { fontSize: fontSize.md, textAlign: 'center' },
  actions: { width: '100%', gap: spacing.sm },
  yesBtn: {
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
  },
  yesBtnText: { color: '#fff', fontSize: fontSize.md, fontWeight: fontWeight.semibold },
  noBtn: {
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    borderWidth: 1,
  },
  noBtnText: { fontSize: fontSize.md },
  responseTitle: {
    fontSize: fontSize.xxl ?? 32,
    fontWeight: fontWeight.bold,
    textAlign: 'center',
  },
  responseSubtitle: { fontSize: fontSize.md, textAlign: 'center', marginTop: spacing.sm },
});
```

- [ ] **Step 3: Create `components/CheckinButton.tsx`**

```typescript
import React from 'react';
import { TouchableOpacity, Text, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { spacing, fontSize, fontWeight, borderRadius } from '../theme/tokens';
import { useEffectiveTheme } from '../state/uiSlice';
import { useGoalsStore } from '../state/goalsSlice';
import { useCheckinsStore } from '../state/checkinsSlice';

export function CheckinButton() {
  const theme = useEffectiveTheme();
  const themeColors = colors[theme];
  const router = useRouter();
  const getActiveGoal = useGoalsStore(s => s.getActiveGoal);
  const hasCheckedInToday = useCheckinsStore(s => s.hasCheckedInToday);

  const activeGoal = getActiveGoal();
  if (!activeGoal) return null;

  const done = hasCheckedInToday(activeGoal.id);

  return (
    <TouchableOpacity
      style={[
        styles.btn,
        {
          backgroundColor: done ? themeColors.surface : themeColors.primary,
          borderColor: done ? themeColors.border : themeColors.primary,
        },
      ]}
      onPress={() => router.push('/checkin')}
      activeOpacity={0.8}
    >
      <Ionicons
        name={done ? 'checkmark-circle' : 'radio-button-off'}
        size={18}
        color={done ? themeColors.textSecondary : '#fff'}
      />
      <Text style={[styles.btnText, { color: done ? themeColors.textSecondary : '#fff' }]}>
        {done ? 'Checked in today' : 'Check in'}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full ?? 999,
    borderWidth: 1,
    marginBottom: spacing.sm,
  },
  btnText: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold },
});
```

- [ ] **Step 4: Add `CheckinButton` to `app/(tabs)/home.tsx`**

Add the import:

```typescript
import { CheckinButton } from '../../components/CheckinButton';
```

Place `<CheckinButton />` in the JSX directly below `<ActiveGoalBanner />` (added in Phase 2A):

```tsx
<ActiveGoalBanner />
<CheckinButton />
```

- [ ] **Step 5: Run full test suite**

```bash
cd /mnt/c/Users/DEIVI/Desktop/Livra && npm run test
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add components/CheckinButton.tsx app/checkin.tsx app/_layout.tsx app/(tabs)/home.tsx
git commit -m "$(cat <<'EOF'
feat(phase2b): add daily check-in screen and home button

One tap logs whether you showed up for your active goal today.
CheckinButton shows current state (done/not done) and navigates to
the full-screen checkin modal. Response is stored per (user, goal, date).

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

### Spec coverage

| Spec requirement | Covered by |
|---|---|
| Single focused interaction | `app/checkin.tsx` — one question, two buttons |
| Not a checklist | Full screen, no mark list |
| Tied to active goal | Goal title shown as context above the question |
| One tap | Two buttons: "I showed up" / "Not today" |
| Low friction, human | Warm response copy, no shaming on "Not today" |
| Goal-anchored | Question tied to `activeGoal.title` |

### Placeholder scan
None. All steps contain complete code.

### Type consistency
- `DailyCheckin` in `types/checkin.ts` — used by `checkinsDb.ts`, `checkinsSlice.ts`, `checkinLogic.ts`
- `recordCheckin(userId, goalId, showedUp)` — signature matches usage in `checkin.tsx`
- `hasCheckedInToday(goalId)` — matches slice method signature ✓
- `getCheckinStreak(goalId)` — matches slice method signature ✓
