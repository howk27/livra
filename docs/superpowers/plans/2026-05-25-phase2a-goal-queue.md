# Phase 2A — Goal Queue

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the Goal data model, AsyncStorage-backed persistence, Zustand slice, and goal queue UI so users can create, queue, and activate goals with free-tier gating (max 3 goals).

**Architecture:** Goals are stored as a JSON array in AsyncStorage (`@livra_goals`), not in the SQL mock — the mock is already 1180 lines and goals are simple objects. Pure logic lives in `lib/goalLogic.ts` for unit testability independent of the store. The home screen gains an `ActiveGoalBanner` above the marks grid; goal creation and queue management live in two new stack screens.

**Tech Stack:** React Native / Expo, TypeScript, Zustand, AsyncStorage, Jest (`npm run test`), expo-router stack screens.

**Note:** Mark drag-to-reorder is already implemented (`DraggableGrid` in `home.tsx` edit mode). No reorder work needed.

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `types/goal.ts` | Create | `Goal` type and `GoalStatus` union |
| `lib/goalLogic.ts` | Create | Pure functions: gating, selectors, next-to-activate |
| `lib/db/goalsDb.ts` | Create | AsyncStorage CRUD for goals |
| `state/goalsSlice.ts` | Create | Zustand slice: load, add, complete, delete, reorder |
| `components/ActiveGoalBanner.tsx` | Create | Banner on home showing active goal + queue link |
| `app/goal/new.tsx` | Create | Modal: create a new goal |
| `app/goal/queue.tsx` | Create | Goal queue screen: active + queued + completed |
| `tests/unit/goals.test.ts` | Create | Unit tests for goalLogic.ts |
| `types/index.ts` | Modify | Re-export `Goal` and `GoalStatus` |
| `lib/gating.ts` | Modify | Add `canAddGoal`, `FREE_GOAL_LIMIT`, `FREE_MARK_LIMIT` |
| `app/_layout.tsx` | Modify | Register `goal/new` and `goal/queue` stack screens |
| `app/(tabs)/home.tsx` | Modify | Add `ActiveGoalBanner` above marks grid |

**Do not touch:** `lib/db/index.ts` (SQL mock — goals bypass it), existing mark/counter logic, navigation structure beyond adding two routes.

---

## Task 1: Types and pure logic

**Files:**
- Create: `types/goal.ts`
- Create: `lib/goalLogic.ts`
- Create: `tests/unit/goals.test.ts`
- Modify: `types/index.ts`

- [ ] **Step 1: Create `types/goal.ts`**

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

- [ ] **Step 2: Create `lib/goalLogic.ts`**

```typescript
import type { Goal } from '../types/goal';

export const FREE_GOAL_LIMIT = 3;

export function canAddGoal(isPro: boolean, totalGoalCount: number): boolean {
  return isPro || totalGoalCount < FREE_GOAL_LIMIT;
}

export function getActiveGoal(goals: Goal[]): Goal | undefined {
  return goals.find(g => g.status === 'active');
}

export function getQueuedGoals(goals: Goal[]): Goal[] {
  return goals
    .filter(g => g.status === 'queued')
    .sort((a, b) => a.sort_index - b.sort_index);
}

export function getCompletedGoals(goals: Goal[]): Goal[] {
  return goals
    .filter(g => g.status === 'completed')
    .sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? ''));
}

export function nextGoalToActivate(goals: Goal[]): Goal | undefined {
  return getQueuedGoals(goals)[0];
}
```

- [ ] **Step 3: Create `tests/unit/goals.test.ts` with failing tests**

```typescript
import {
  canAddGoal,
  getActiveGoal,
  getQueuedGoals,
  getCompletedGoals,
  nextGoalToActivate,
  FREE_GOAL_LIMIT,
} from '../../lib/goalLogic';
import type { Goal } from '../../types/goal';

function makeGoal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: 'g1',
    user_id: 'u1',
    title: 'Run a marathon',
    status: 'queued',
    sort_index: 0,
    created_at: '2026-05-25T00:00:00Z',
    updated_at: '2026-05-25T00:00:00Z',
    ...overrides,
  };
}

describe('FREE_GOAL_LIMIT', () => {
  test('is 3', () => {
    expect(FREE_GOAL_LIMIT).toBe(3);
  });
});

describe('canAddGoal', () => {
  test('free user under limit can add', () => {
    expect(canAddGoal(false, 2)).toBe(true);
  });
  test('free user at limit cannot add', () => {
    expect(canAddGoal(false, 3)).toBe(false);
  });
  test('free user over limit cannot add', () => {
    expect(canAddGoal(false, 5)).toBe(false);
  });
  test('pro user can always add', () => {
    expect(canAddGoal(true, 100)).toBe(true);
  });
  test('pro user can add at 0', () => {
    expect(canAddGoal(true, 0)).toBe(true);
  });
});

describe('getActiveGoal', () => {
  test('returns the active goal', () => {
    const goals = [
      makeGoal({ id: '1', status: 'queued' }),
      makeGoal({ id: '2', status: 'active' }),
      makeGoal({ id: '3', status: 'completed' }),
    ];
    expect(getActiveGoal(goals)?.id).toBe('2');
  });

  test('returns undefined when no active goal', () => {
    const goals = [makeGoal({ status: 'queued' })];
    expect(getActiveGoal(goals)).toBeUndefined();
  });

  test('returns undefined for empty list', () => {
    expect(getActiveGoal([])).toBeUndefined();
  });
});

describe('getQueuedGoals', () => {
  test('returns only queued goals', () => {
    const goals = [
      makeGoal({ id: '1', status: 'active' }),
      makeGoal({ id: '2', status: 'queued', sort_index: 1 }),
      makeGoal({ id: '3', status: 'completed' }),
    ];
    const queued = getQueuedGoals(goals);
    expect(queued.length).toBe(1);
    expect(queued[0].id).toBe('2');
  });

  test('sorts by sort_index ascending', () => {
    const goals = [
      makeGoal({ id: 'b', status: 'queued', sort_index: 2 }),
      makeGoal({ id: 'a', status: 'queued', sort_index: 0 }),
      makeGoal({ id: 'c', status: 'queued', sort_index: 1 }),
    ];
    expect(getQueuedGoals(goals).map(g => g.id)).toEqual(['a', 'c', 'b']);
  });
});

describe('getCompletedGoals', () => {
  test('returns only completed goals', () => {
    const goals = [
      makeGoal({ id: '1', status: 'active' }),
      makeGoal({ id: '2', status: 'completed', completed_at: '2026-05-20T00:00:00Z' }),
    ];
    expect(getCompletedGoals(goals).length).toBe(1);
  });

  test('sorts by completed_at descending (most recent first)', () => {
    const goals = [
      makeGoal({ id: 'old', status: 'completed', completed_at: '2026-04-01T00:00:00Z' }),
      makeGoal({ id: 'new', status: 'completed', completed_at: '2026-05-01T00:00:00Z' }),
    ];
    expect(getCompletedGoals(goals)[0].id).toBe('new');
  });
});

describe('nextGoalToActivate', () => {
  test('returns queued goal with lowest sort_index', () => {
    const goals = [
      makeGoal({ id: '1', status: 'queued', sort_index: 2 }),
      makeGoal({ id: '2', status: 'queued', sort_index: 0 }),
    ];
    expect(nextGoalToActivate(goals)?.id).toBe('2');
  });

  test('returns undefined when no queued goals', () => {
    const goals = [makeGoal({ status: 'active' })];
    expect(nextGoalToActivate(goals)).toBeUndefined();
  });

  test('returns undefined for empty list', () => {
    expect(nextGoalToActivate([])).toBeUndefined();
  });
});
```

- [ ] **Step 4: Run tests — expect failures (modules not found)**

```bash
cd /mnt/c/Users/DEIVI/Desktop/Livra && npm run test -- tests/unit/goals.test.ts
```

Expected: FAIL — `Cannot find module '../../lib/goalLogic'` until Step 2 is in place, then `Cannot find module '../../types/goal'` until Step 1 is in place.

If running after Steps 1 and 2: all tests PASS (pure logic, no mocks needed).

- [ ] **Step 5: Add re-exports to `types/index.ts`**

Append to the end of `types/index.ts`:

```typescript
export type { Goal, GoalStatus } from './goal';
```

- [ ] **Step 6: Run tests — expect pass**

```bash
cd /mnt/c/Users/DEIVI/Desktop/Livra && npm run test -- tests/unit/goals.test.ts
```

Expected: all tests PASS.

- [ ] **Step 7: Commit**

```bash
git add types/goal.ts lib/goalLogic.ts tests/unit/goals.test.ts types/index.ts
git commit -m "$(cat <<'EOF'
feat(phase2a): add Goal type, pure goal logic, and unit tests

Defines GoalStatus union and Goal shape. Pure selectors and canAddGoal
gating live in lib/goalLogic.ts for test isolation. FREE_GOAL_LIMIT = 3.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: AsyncStorage DB layer and Zustand slice

**Files:**
- Create: `lib/db/goalsDb.ts`
- Create: `state/goalsSlice.ts`
- Modify: `lib/gating.ts`

- [ ] **Step 1: Create `lib/db/goalsDb.ts`**

```typescript
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Goal } from '../../types/goal';

const GOALS_KEY = '@livra_goals';

async function readAll(): Promise<Goal[]> {
  try {
    const raw = await AsyncStorage.getItem(GOALS_KEY);
    return raw ? (JSON.parse(raw) as Goal[]) : [];
  } catch {
    return [];
  }
}

async function writeAll(goals: Goal[]): Promise<void> {
  await AsyncStorage.setItem(GOALS_KEY, JSON.stringify(goals));
}

export async function loadGoalsForUser(userId: string): Promise<Goal[]> {
  const all = await readAll();
  return all.filter(g => g.user_id === userId);
}

export async function upsertGoal(goal: Goal): Promise<void> {
  const all = await readAll();
  const idx = all.findIndex(g => g.id === goal.id);
  if (idx >= 0) {
    all[idx] = goal;
  } else {
    all.push(goal);
  }
  await writeAll(all);
}

export async function removeGoal(id: string): Promise<void> {
  const all = await readAll();
  await writeAll(all.filter(g => g.id !== id));
}
```

- [ ] **Step 2: Create `state/goalsSlice.ts`**

```typescript
import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import type { Goal } from '../types/goal';
import { loadGoalsForUser, upsertGoal, removeGoal } from '../lib/db/goalsDb';
import {
  canAddGoal,
  getActiveGoal,
  getQueuedGoals,
  getCompletedGoals,
  nextGoalToActivate,
} from '../lib/goalLogic';

export class GoalLimitError extends Error {
  constructor() {
    super('Free plan allows up to 3 goals. Upgrade to Livra+ for unlimited.');
    this.name = 'GoalLimitError';
  }
}

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
  getActiveGoal: () => Goal | undefined;
  getQueuedGoals: () => Goal[];
  getCompletedGoals: () => Goal[];
}

export const useGoalsStore = create<GoalsState>((set, get) => ({
  goals: [],
  loading: false,

  loadGoals: async (userId) => {
    set({ loading: true });
    try {
      const goals = await loadGoalsForUser(userId);
      set({ goals, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  addGoal: async ({ title, description, userId, isPro }) => {
    const current = get().goals.filter(g => g.user_id === userId);
    if (!canAddGoal(isPro, current.length)) {
      throw new GoalLimitError();
    }

    const hasActive = current.some(g => g.status === 'active');
    const maxSortIndex = current
      .filter(g => g.status === 'queued')
      .reduce((m, g) => Math.max(m, g.sort_index), -1);

    const now = new Date().toISOString();
    const goal: Goal = {
      id: uuidv4(),
      user_id: userId,
      title: title.trim(),
      description: description?.trim() || undefined,
      status: hasActive ? 'queued' : 'active',
      sort_index: hasActive ? maxSortIndex + 1 : 0,
      created_at: now,
      updated_at: now,
    };

    await upsertGoal(goal);
    set(s => ({ goals: [...s.goals, goal] }));
    return goal;
  },

  completeGoal: async (id) => {
    const now = new Date().toISOString();
    const goals = get().goals;
    const completing = goals.find(g => g.id === id);
    if (!completing) return;

    const completed: Goal = {
      ...completing,
      status: 'completed',
      completed_at: now,
      updated_at: now,
    };
    await upsertGoal(completed);

    const remaining = goals.filter(g => g.id !== id);
    const next = nextGoalToActivate(remaining);
    let updated = goals.map(g => (g.id === id ? completed : g));

    if (next) {
      const activated: Goal = { ...next, status: 'active', updated_at: now };
      await upsertGoal(activated);
      updated = updated.map(g => (g.id === next.id ? activated : g));
    }

    set({ goals: updated });
  },

  deleteGoal: async (id) => {
    await removeGoal(id);
    set(s => ({ goals: s.goals.filter(g => g.id !== id) }));
  },

  reorderQueue: async (orderedIds) => {
    const now = new Date().toISOString();
    const goals = get().goals;
    const updates: Goal[] = [];

    orderedIds.forEach((id, idx) => {
      const goal = goals.find(g => g.id === id && g.status === 'queued');
      if (goal) {
        updates.push({ ...goal, sort_index: idx, updated_at: now });
      }
    });

    await Promise.all(updates.map(upsertGoal));
    const map = new Map(updates.map(g => [g.id, g]));
    set(s => ({ goals: s.goals.map(g => map.get(g.id) ?? g) }));
  },

  getActiveGoal: () => getActiveGoal(get().goals),
  getQueuedGoals: () => getQueuedGoals(get().goals),
  getCompletedGoals: () => getCompletedGoals(get().goals),
}));
```

- [ ] **Step 3: Update `lib/gating.ts`**

Replace the entire file content with:

```typescript
export const FREE_GOAL_LIMIT = 3;
export const FREE_MARK_LIMIT = 3;

export function canAddGoal(isPro: boolean, totalGoalCount: number): boolean {
  return isPro || totalGoalCount < FREE_GOAL_LIMIT;
}

export function canAddMark(isPro: boolean, totalMarkCount: number): boolean {
  return isPro || totalMarkCount < FREE_MARK_LIMIT;
}
```

- [ ] **Step 4: Run full test suite — no regressions**

```bash
cd /mnt/c/Users/DEIVI/Desktop/Livra && npm run test
```

Expected: same results as before (71 passing, 4 pre-existing failures). Goals unit tests pass. No regressions.

- [ ] **Step 5: Commit**

```bash
git add lib/db/goalsDb.ts state/goalsSlice.ts lib/gating.ts
git commit -m "$(cat <<'EOF'
feat(phase2a): add goals AsyncStorage layer, Zustand slice, and gating

goalsDb.ts persists goals as JSON array in AsyncStorage (bypasses SQL mock).
goalsSlice manages CRUD, completeGoal auto-activates next queued goal.
lib/gating.ts now exports canAddGoal and canAddMark for free-tier enforcement.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Load goals on app start

**Files:**
- Modify: `app/_layout.tsx`

- [ ] **Step 1: Find the auth state listener in `app/_layout.tsx`**

Search for `loadMarks` or `loadCounters` in `app/_layout.tsx`. It's called after auth resolves (inside a `useEffect` watching `user`). Add `loadGoals` next to it.

Find this pattern (exact lines may vary):

```typescript
if (user?.id) {
  await useMarksStore.getState().loadMarks(user.id);
```

Add the goals load immediately after the marks load:

```typescript
if (user?.id) {
  await useMarksStore.getState().loadMarks(user.id);
  await useGoalsStore.getState().loadGoals(user.id);
```

Also add the import at the top of `app/_layout.tsx`:

```typescript
import { useGoalsStore } from '../state/goalsSlice';
```

- [ ] **Step 2: Register goal stack screens in `app/_layout.tsx`**

Find the `<Stack>` component in `app/_layout.tsx`. Add two new `Stack.Screen` entries:

```tsx
<Stack.Screen name="goal/new" options={{ presentation: 'modal', title: 'New Goal', headerShown: false }} />
<Stack.Screen name="goal/queue" options={{ title: 'Goals', headerShown: false }} />
```

- [ ] **Step 3: Create the route files**

Create `app/goal/new.tsx` with this content:

```typescript
import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { colors } from '../../theme/colors';
import { spacing, fontSize, fontWeight, borderRadius } from '../../theme/tokens';
import { useEffectiveTheme } from '../../state/uiSlice';
import { useGoalsStore, GoalLimitError } from '../../state/goalsSlice';
import { useAuth } from '../../hooks/useAuth';
import { checkProStatus } from '../../lib/iap/iap';

export default function NewGoalScreen() {
  const theme = useEffectiveTheme();
  const themeColors = colors[theme];
  const router = useRouter();
  const { user } = useAuth();
  const addGoal = useGoalsStore(s => s.addGoal);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const trimmed = title.trim();
    if (!trimmed || !user?.id) return;
    setSaving(true);
    try {
      const proStatus = await checkProStatus();
      await addGoal({
        title: trimmed,
        description: description.trim() || undefined,
        userId: user.id,
        isPro: proStatus.effectiveUnlocked,
      });
      router.back();
    } catch (err) {
      if (err instanceof GoalLimitError) {
        Alert.alert(
          'Goal limit reached',
          'The free plan supports up to 3 goals. Upgrade to Livra+ for unlimited.',
          [
            { text: 'Not now', style: 'cancel' },
            { text: 'Upgrade', onPress: () => router.push('/paywall') },
          ],
        );
      } else {
        Alert.alert('Error', 'Could not save goal. Please try again.');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
      <KeyboardAvoidingView
        style={styles.inner}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={[styles.cancel, { color: themeColors.textSecondary }]}>Cancel</Text>
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: themeColors.text }]}>New Goal</Text>
          <TouchableOpacity onPress={handleSave} disabled={!title.trim() || saving}>
            <Text
              style={[
                styles.save,
                { color: title.trim() && !saving ? themeColors.primary : themeColors.textSecondary },
              ]}
            >
              {saving ? 'Saving…' : 'Add'}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.form}>
          <Text style={[styles.label, { color: themeColors.textSecondary }]}>Goal</Text>
          <TextInput
            style={[
              styles.input,
              {
                color: themeColors.text,
                backgroundColor: themeColors.surface,
                borderColor: themeColors.border,
              },
            ]}
            placeholder="e.g. Run a marathon"
            placeholderTextColor={themeColors.textSecondary}
            value={title}
            onChangeText={setTitle}
            maxLength={80}
            autoFocus
            returnKeyType="next"
          />

          <Text style={[styles.label, { color: themeColors.textSecondary }]}>
            Why this goal? (optional)
          </Text>
          <TextInput
            style={[
              styles.input,
              styles.descInput,
              {
                color: themeColors.text,
                backgroundColor: themeColors.surface,
                borderColor: themeColors.border,
              },
            ]}
            placeholder="What will finishing this change for you?"
            placeholderTextColor={themeColors.textSecondary}
            value={description}
            onChangeText={setDescription}
            maxLength={200}
            multiline
            numberOfLines={3}
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  inner: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  headerTitle: { fontSize: fontSize.md, fontWeight: fontWeight.semibold },
  cancel: { fontSize: fontSize.md },
  save: { fontSize: fontSize.md, fontWeight: fontWeight.semibold },
  form: { flex: 1, paddingHorizontal: spacing.md, paddingTop: spacing.lg, gap: spacing.xs },
  label: { fontSize: fontSize.sm, fontWeight: fontWeight.medium, marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    fontSize: fontSize.md,
  },
  descInput: { height: 80, textAlignVertical: 'top' },
});
```

Create `app/goal/queue.tsx` with this content:

```typescript
import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { spacing, fontSize, fontWeight, borderRadius } from '../../theme/tokens';
import { useEffectiveTheme } from '../../state/uiSlice';
import { useGoalsStore } from '../../state/goalsSlice';
import type { Goal } from '../../types/goal';

export default function GoalQueueScreen() {
  const theme = useEffectiveTheme();
  const themeColors = colors[theme];
  const router = useRouter();
  const { goals, completeGoal, deleteGoal, getActiveGoal, getQueuedGoals, getCompletedGoals } =
    useGoalsStore();
  const [showCompleted, setShowCompleted] = useState(false);

  const active = getActiveGoal();
  const queued = getQueuedGoals();
  const completed = getCompletedGoals();

  const handleComplete = (goal: Goal) => {
    Alert.alert(
      'Mark goal complete?',
      `"${goal.title}" will move to your history. The next goal in queue becomes active.`,
      [
        { text: 'Not yet', style: 'cancel' },
        {
          text: 'Done — it\'s mine',
          onPress: async () => {
            await completeGoal(goal.id);
            router.push({ pathname: '/goal/complete', params: { goalId: goal.id, goalTitle: goal.title } });
          },
        },
      ],
    );
  };

  const handleDelete = (goal: Goal) => {
    Alert.alert(
      'Remove goal?',
      `"${goal.title}" will be removed from your queue.`,
      [
        { text: 'Keep it', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => deleteGoal(goal.id),
        },
      ],
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={themeColors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: themeColors.text }]}>Goals</Text>
        <TouchableOpacity onPress={() => router.push('/goal/new')}>
          <Ionicons name="add" size={26} color={themeColors.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Active goal */}
        {active ? (
          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: themeColors.textSecondary }]}>
              ACTIVE
            </Text>
            <View style={[styles.card, { backgroundColor: themeColors.surface, borderColor: themeColors.primary }]}>
              <Text style={[styles.goalTitle, { color: themeColors.text }]}>{active.title}</Text>
              {active.description ? (
                <Text style={[styles.goalDesc, { color: themeColors.textSecondary }]}>
                  {active.description}
                </Text>
              ) : null}
              <TouchableOpacity
                style={[styles.completeBtn, { borderColor: themeColors.primary }]}
                onPress={() => handleComplete(active)}
              >
                <Text style={[styles.completeBtnText, { color: themeColors.primary }]}>
                  Mark complete
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={styles.section}>
            <Text style={[styles.emptyText, { color: themeColors.textSecondary }]}>
              No active goal. Add one below.
            </Text>
          </View>
        )}

        {/* Queue */}
        {queued.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: themeColors.textSecondary }]}>
              UP NEXT
            </Text>
            {queued.map(goal => (
              <View
                key={goal.id}
                style={[styles.card, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}
              >
                <Text style={[styles.goalTitle, { color: themeColors.text }]}>{goal.title}</Text>
                {goal.description ? (
                  <Text style={[styles.goalDesc, { color: themeColors.textSecondary }]}>
                    {goal.description}
                  </Text>
                ) : null}
                <TouchableOpacity onPress={() => handleDelete(goal)} style={styles.deleteBtn}>
                  <Ionicons name="trash-outline" size={16} color={themeColors.textSecondary} />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {/* Completed */}
        {completed.length > 0 && (
          <View style={styles.section}>
            <TouchableOpacity
              style={styles.completedToggle}
              onPress={() => setShowCompleted(v => !v)}
            >
              <Text style={[styles.sectionLabel, { color: themeColors.textSecondary }]}>
                COMPLETED ({completed.length})
              </Text>
              <Ionicons
                name={showCompleted ? 'chevron-up' : 'chevron-down'}
                size={14}
                color={themeColors.textSecondary}
              />
            </TouchableOpacity>
            {showCompleted &&
              completed.map(goal => (
                <View
                  key={goal.id}
                  style={[styles.card, { backgroundColor: themeColors.surface, borderColor: themeColors.border, opacity: 0.6 }]}
                >
                  <Text style={[styles.goalTitle, { color: themeColors.text }]}>
                    ✓ {goal.title}
                  </Text>
                </View>
              ))}
          </View>
        )}

        {goals.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={[styles.emptyStateTitle, { color: themeColors.text }]}>
              No goals yet.
            </Text>
            <Text style={[styles.emptyStateMsg, { color: themeColors.textSecondary }]}>
              Add your first goal. One at a time — until it's done.
            </Text>
            <TouchableOpacity
              style={[styles.addBtn, { backgroundColor: themeColors.primary }]}
              onPress={() => router.push('/goal/new')}
            >
              <Text style={styles.addBtnText}>Add a goal</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  headerTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.semibold },
  content: { paddingHorizontal: spacing.md, paddingBottom: spacing.xl },
  section: { marginTop: spacing.lg, gap: spacing.sm },
  sectionLabel: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold, letterSpacing: 1 },
  card: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    gap: spacing.xs,
  },
  goalTitle: { fontSize: fontSize.md, fontWeight: fontWeight.semibold },
  goalDesc: { fontSize: fontSize.sm },
  completeBtn: {
    marginTop: spacing.sm,
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.xs,
    alignItems: 'center',
  },
  completeBtnText: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold },
  deleteBtn: { position: 'absolute', top: spacing.sm, right: spacing.sm },
  completedToggle: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  emptyText: { fontSize: fontSize.md, textAlign: 'center', marginTop: spacing.xl },
  emptyState: { alignItems: 'center', marginTop: spacing.xxl ?? 48, gap: spacing.md },
  emptyStateTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.semibold },
  emptyStateMsg: { fontSize: fontSize.md, textAlign: 'center', maxWidth: 280 },
  addBtn: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: borderRadius.full ?? 999 },
  addBtnText: { color: '#fff', fontWeight: fontWeight.semibold, fontSize: fontSize.md },
});
```

- [ ] **Step 4: Run full test suite**

```bash
cd /mnt/c/Users/DEIVI/Desktop/Livra && npm run test
```

Expected: all tests pass (no regressions).

- [ ] **Step 5: Commit**

```bash
git add app/_layout.tsx app/goal/new.tsx app/goal/queue.tsx
git commit -m "$(cat <<'EOF'
feat(phase2a): add goal/new and goal/queue screens + register routes

Goal creation modal enforces free tier (3 goals max) and shows paywall
alert on GoalLimitError. Queue screen shows active/queued/completed
goals with complete and delete actions.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: ActiveGoalBanner on home screen

**Files:**
- Create: `components/ActiveGoalBanner.tsx`
- Modify: `app/(tabs)/home.tsx`

- [ ] **Step 1: Create `components/ActiveGoalBanner.tsx`**

```typescript
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { spacing, fontSize, fontWeight, borderRadius } from '../theme/tokens';
import { useEffectiveTheme } from '../state/uiSlice';
import { useGoalsStore } from '../state/goalsSlice';

export function ActiveGoalBanner() {
  const theme = useEffectiveTheme();
  const themeColors = colors[theme];
  const router = useRouter();
  const getActiveGoal = useGoalsStore(s => s.getActiveGoal);
  const activeGoal = getActiveGoal();

  if (!activeGoal) {
    return (
      <TouchableOpacity
        style={[styles.emptyBanner, { borderColor: themeColors.border }]}
        onPress={() => router.push('/goal/new')}
      >
        <Text style={[styles.emptyText, { color: themeColors.textSecondary }]}>
          Add a goal to get started →
        </Text>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      style={[styles.banner, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}
      onPress={() => router.push('/goal/queue')}
      activeOpacity={0.75}
    >
      <View style={styles.bannerLeft}>
        <Text style={[styles.bannerLabel, { color: themeColors.textSecondary }]}>Working toward</Text>
        <Text style={[styles.bannerTitle, { color: themeColors.text }]} numberOfLines={1}>
          {activeGoal.title}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={themeColors.textSecondary} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
  },
  bannerLeft: { flex: 1, gap: 2 },
  bannerLabel: { fontSize: fontSize.xs, fontWeight: fontWeight.medium, letterSpacing: 0.5 },
  bannerTitle: { fontSize: fontSize.md, fontWeight: fontWeight.semibold },
  emptyBanner: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  emptyText: { fontSize: fontSize.sm },
});
```

- [ ] **Step 2: Add `ActiveGoalBanner` to `app/(tabs)/home.tsx`**

Find the import section at the top of `app/(tabs)/home.tsx` and add:

```typescript
import { ActiveGoalBanner } from '../../components/ActiveGoalBanner';
```

Then find the JSX where the marks grid begins. It will be somewhere around the `ScrollView` or `SectionList` render, after `HomeHeader` and `WeeklySummaryStrip`. Add `<ActiveGoalBanner />` between `WeeklySummaryStrip` and the marks grid.

The exact location: search for `<WeeklySummaryStrip` in `home.tsx`. Immediately after its closing tag `/>`, add:

```tsx
<ActiveGoalBanner />
```

- [ ] **Step 3: Run full test suite**

```bash
cd /mnt/c/Users/DEIVI/Desktop/Livra && npm run test
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add components/ActiveGoalBanner.tsx app/(tabs)/home.tsx
git commit -m "$(cat <<'EOF'
feat(phase2a): add ActiveGoalBanner to home screen

Shows active goal title above marks grid. Tapping navigates to the
goal queue. Shows "Add a goal" prompt when no goal is set.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

### Spec coverage

| Spec requirement | Covered by |
|---|---|
| Goal queue (3 free / unlimited paid) | Task 1 gating + Task 2 GoalLimitError |
| Only 1 goal active at a time | goalsSlice.addGoal sets status based on hasActive |
| Finishing a goal activates next | goalsSlice.completeGoal + nextGoalToActivate |
| Completion history | getCompletedGoals + queue screen completed section |
| Home shows active goal | Task 4 ActiveGoalBanner |
| No goal_id on marks (architecture rule) | Mark type unchanged — marks remain user-level |
| Mark reorder already implemented | DraggableGrid in home.tsx — no action needed |

### Placeholder scan
None. All steps contain complete code.

### Type consistency
- `Goal` defined in `types/goal.ts`, re-exported from `types/index.ts`
- `GoalLimitError` in `goalsSlice.ts` — used in `goal/new.tsx`
- `nextGoalToActivate` in `goalLogic.ts` — used in `goalsSlice.ts`
- `upsertGoal`, `removeGoal` in `goalsDb.ts` — used in `goalsSlice.ts`
- `activeGoal.title` used in `ActiveGoalBanner` — field exists on `Goal` type ✓
