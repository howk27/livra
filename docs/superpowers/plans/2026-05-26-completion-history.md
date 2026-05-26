# Completion History Screen — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dedicated completion history screen that shows every finished goal in reverse-chronological order, replacing the inline toggle in the queue screen.

**Architecture:** Pure helpers in `lib/goalHistory.ts` (tested) → screen reads directly from the existing Zustand goals store → route registered in root `_layout.tsx` → queue screen button navigates to history instead of toggling an inline list.

**Tech Stack:** React Native, expo-router, Zustand (`useGoalsStore`), date-fns (`differenceInDays`, `parseISO`, `format`), TypeScript strict, Jest.

**Spec:** `docs/superpowers/specs/2026-05-26-completion-history-design.md`

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `lib/goalHistory.ts` | Create | `formatDuration` + `formatTargetDelta` pure helpers |
| `tests/unit/goalHistory.test.ts` | Create | Unit tests for both helpers |
| `app/goal/history.tsx` | Create | History screen — reads store, renders list |
| `app/_layout.tsx` | Modify | Register `goal/history` Stack.Screen |
| `app/goal/queue.tsx` | Modify | Remove inline completed list, navigate to history |

---

## Task 1: Pure helpers + tests (TDD)

**Files:**
- Create: `lib/goalHistory.ts`
- Create: `tests/unit/goalHistory.test.ts`

- [ ] **Step 1: Create the failing test file**

Create `tests/unit/goalHistory.test.ts` with the following content:

```typescript
import { formatDuration, formatTargetDelta } from '../../lib/goalHistory';

describe('formatDuration', () => {
  it('returns "Same day" when completed_at is on the same day as created_at', () => {
    expect(formatDuration('2026-01-10T09:00:00.000Z', '2026-01-10T18:00:00.000Z')).toBe('Same day');
  });

  it('returns "Same day" when differenceInDays is 0', () => {
    expect(formatDuration('2026-01-10T00:00:00.000Z', '2026-01-10T23:59:59.000Z')).toBe('Same day');
  });

  it('returns "1 day" for a one-day difference', () => {
    expect(formatDuration('2026-01-10T00:00:00.000Z', '2026-01-11T00:00:00.000Z')).toBe('1 day');
  });

  it('returns "N days" for multi-day differences', () => {
    expect(formatDuration('2026-01-01T00:00:00.000Z', '2026-02-17T00:00:00.000Z')).toBe('47 days');
  });

  it('handles large values', () => {
    expect(formatDuration('2025-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')).toBe('365 days');
  });
});

describe('formatTargetDelta', () => {
  it('returns "On time" when completed on the target date', () => {
    expect(formatTargetDelta('2026-03-15T14:00:00.000Z', '2026-03-15')).toBe('On time');
  });

  it('returns "1 day early" for singular', () => {
    expect(formatTargetDelta('2026-03-14T14:00:00.000Z', '2026-03-15')).toBe('1 day early');
  });

  it('returns "N days early" for plural', () => {
    expect(formatTargetDelta('2026-03-10T14:00:00.000Z', '2026-03-15')).toBe('5 days early');
  });

  it('returns "1 day late" for singular', () => {
    expect(formatTargetDelta('2026-03-16T14:00:00.000Z', '2026-03-15')).toBe('1 day late');
  });

  it('returns "N days late" for plural', () => {
    expect(formatTargetDelta('2026-03-25T14:00:00.000Z', '2026-03-15')).toBe('10 days late');
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /mnt/c/Users/DEIVI/Desktop/Livra && npm run test -- tests/unit/goalHistory.test.ts
```

Expected: test suite fails — `Cannot find module '../../lib/goalHistory'`.

- [ ] **Step 3: Create `lib/goalHistory.ts`**

```typescript
import { differenceInDays, parseISO } from 'date-fns';

export function formatDuration(createdAt: string, completedAt: string): string {
  const days = differenceInDays(parseISO(completedAt), parseISO(createdAt));
  if (days <= 0) return 'Same day';
  if (days === 1) return '1 day';
  return `${days} days`;
}

export function formatTargetDelta(completedAt: string, targetDate: string): string {
  const completedDate = completedAt.slice(0, 10);
  const delta = differenceInDays(parseISO(completedDate), parseISO(targetDate));
  if (delta === 0) return 'On time';
  const abs = Math.abs(delta);
  const unit = abs === 1 ? 'day' : 'days';
  return delta < 0 ? `${abs} ${unit} early` : `${abs} ${unit} late`;
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd /mnt/c/Users/DEIVI/Desktop/Livra && npm run test -- tests/unit/goalHistory.test.ts
```

Expected: all 10 tests pass.

- [ ] **Step 5: Run full suite to confirm no regressions**

```bash
cd /mnt/c/Users/DEIVI/Desktop/Livra && npm run test
```

Expected: all 217 tests pass (207 existing + 10 new).

- [ ] **Step 6: Commit**

```bash
cd /mnt/c/Users/DEIVI/Desktop/Livra && git add lib/goalHistory.ts tests/unit/goalHistory.test.ts && git commit -m "feat(phase3): add goalHistory helpers — formatDuration + formatTargetDelta

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 2: History screen + route registration

**Files:**
- Create: `app/goal/history.tsx`
- Modify: `app/_layout.tsx`

- [ ] **Step 1: Create `app/goal/history.tsx`**

```typescript
import React from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { format, parseISO } from 'date-fns';
import { colors } from '../../theme/colors';
import { spacing, fontSize, fontWeight, borderRadius } from '../../theme/tokens';
import { useEffectiveTheme } from '../../state/uiSlice';
import { useGoalsStore } from '../../state/goalsSlice';
import { formatDuration, formatTargetDelta } from '../../lib/goalHistory';

export default function GoalHistoryScreen() {
  const theme = useEffectiveTheme();
  const themeColors = colors[theme];
  const router = useRouter();
  const getCompletedGoals = useGoalsStore(s => s.getCompletedGoals);
  const completed = getCompletedGoals().sort((a, b) =>
    (b.completed_at ?? '').localeCompare(a.completed_at ?? ''),
  );

  const count = completed.length;
  const subtitle =
    count === 0 ? '' : count === 1 ? '1 thing you actually finished.' : `${count} things you actually finished.`;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="chevron-back" size={24} color={themeColors.text} />
        </TouchableOpacity>
        <View style={styles.headerTextWrap}>
          <Text style={[styles.headerTitle, { color: themeColors.text }]}>Done.</Text>
          {subtitle ? (
            <Text style={[styles.headerSubtitle, { color: themeColors.textSecondary }]}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        <View style={styles.headerSpacer} />
      </View>

      {count === 0 ? (
        <View style={styles.emptyState}>
          <Text style={[styles.emptyText, { color: themeColors.textSecondary }]}>
            Nothing here yet. Your first completed goal will show up the moment you finish one.
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {completed.map(goal => (
            <View
              key={goal.id}
              style={[
                styles.card,
                { backgroundColor: themeColors.surface, borderColor: themeColors.border },
              ]}
            >
              <Text style={[styles.goalTitle, { color: themeColors.text }]}>{goal.title}</Text>
              <View style={styles.meta}>
                {goal.completed_at ? (
                  <Text style={[styles.metaText, { color: themeColors.textSecondary }]}>
                    {'Finished ' + format(parseISO(goal.completed_at), 'MMM d, yyyy')}
                  </Text>
                ) : null}
                {goal.completed_at ? (
                  <Text style={[styles.metaText, { color: themeColors.textSecondary }]}>
                    {'  ·  Took ' + formatDuration(goal.created_at, goal.completed_at)}
                  </Text>
                ) : null}
                {goal.completed_at && goal.target_date ? (
                  <Text style={[styles.metaText, { color: themeColors.textSecondary }]}>
                    {'  ·  ' + formatTargetDelta(goal.completed_at, goal.target_date)}
                  </Text>
                ) : null}
              </View>
            </View>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  headerTextWrap: { flex: 1 },
  headerSpacer: { width: 24 },
  headerTitle: { fontSize: fontSize['2xl'], fontWeight: fontWeight.bold, lineHeight: 32 },
  headerSubtitle: { fontSize: fontSize.sm, marginTop: spacing.xxs },
  emptyState: { flex: 1, justifyContent: 'center', paddingHorizontal: spacing.xl },
  emptyText: { fontSize: fontSize.md, textAlign: 'center', lineHeight: 22 },
  list: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
    gap: spacing.sm,
  },
  card: {
    borderWidth: 1,
    borderRadius: borderRadius.card,
    padding: spacing.md,
    gap: spacing.xs,
  },
  goalTitle: { fontSize: fontSize.md, fontWeight: fontWeight.semibold },
  meta: { flexDirection: 'row', flexWrap: 'wrap' },
  metaText: { fontSize: fontSize.sm },
});
```

- [ ] **Step 2: Register the route in `app/_layout.tsx`**

Open `app/_layout.tsx`. Find the block that registers `goal/complete`:

```typescript
        <Stack.Screen
          name="goal/complete"
          options={{
            presentation: 'fullScreenModal',
            headerShown: false,
            gestureEnabled: false,
          }}
        />
```

Add the history route immediately after it (before the closing `</Stack>`):

```typescript
        <Stack.Screen
          name="goal/complete"
          options={{
            presentation: 'fullScreenModal',
            headerShown: false,
            gestureEnabled: false,
          }}
        />
        <Stack.Screen name="goal/history" options={{ headerShown: false }} />
```

- [ ] **Step 3: Type-check**

```bash
cd /mnt/c/Users/DEIVI/Desktop/Livra && npm run type-check 2>&1 | grep "goal/history\|goalHistory" | head -20
```

Expected: no errors referencing `goal/history` or `goalHistory`.

- [ ] **Step 4: Commit**

```bash
cd /mnt/c/Users/DEIVI/Desktop/Livra && git add app/goal/history.tsx app/_layout.tsx && git commit -m "feat(phase3): add goal history screen and register route

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 3: Update queue screen + final verification

**Files:**
- Modify: `app/goal/queue.tsx`

The queue screen currently has:
1. `const [showCompleted, setShowCompleted] = useState(false);` — remove this state
2. A `completed` useMemo — keep it (needed for the count in the button label)
3. A section that toggles an inline list — replace with a navigation button
4. `{showCompleted && completed.map(...)}` block — remove this

- [ ] **Step 1: Remove `showCompleted` state from `app/goal/queue.tsx`**

Find and remove this line (it is the only `useState` call involving `showCompleted`):

```typescript
  const [showCompleted, setShowCompleted] = useState(false);
```

- [ ] **Step 2: Replace the completed toggle section**

Find this block (inside the returned JSX):

```typescript
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
```

Replace it with:

```typescript
        {completed.length > 0 && (
          <View style={styles.section}>
            <TouchableOpacity
              style={styles.completedToggle}
              onPress={() => router.push('/goal/history')}
            >
              <Text style={[styles.sectionLabel, { color: themeColors.textSecondary }]}>
                COMPLETED ({completed.length})
              </Text>
              <Ionicons name="chevron-forward" size={14} color={themeColors.textSecondary} />
            </TouchableOpacity>
          </View>
        )}
```

- [ ] **Step 3: Type-check**

```bash
cd /mnt/c/Users/DEIVI/Desktop/Livra && npm run type-check 2>&1 | grep "queue" | head -20
```

Expected: no errors. If you see `showCompleted` referenced somewhere, search the file for any remaining references and remove them.

- [ ] **Step 4: Run full test suite**

```bash
cd /mnt/c/Users/DEIVI/Desktop/Livra && npm run test
```

Expected: all 217 tests pass.

- [ ] **Step 5: Commit**

```bash
cd /mnt/c/Users/DEIVI/Desktop/Livra && git add app/goal/queue.tsx && git commit -m "feat(phase3): replace queue inline completed list with history navigation

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```
