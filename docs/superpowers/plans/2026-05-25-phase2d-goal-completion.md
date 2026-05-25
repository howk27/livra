# Phase 2D — Goal Completion Moment

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the goal completion screen — a brief full-screen moment with a subtle entrance animation, the copy "Done. That one's yours forever.", and two actions (See what's next / Take a moment) — navigated to automatically after marking a goal complete.

**Architecture:** The completion screen is a stack modal (`app/goal/complete.tsx`) receiving `goalTitle` as a route param. It uses `react-native-reanimated` (already in stack) for a scale + opacity entrance. No new data layer needed — the goal is already marked complete in `goalsSlice` before navigation. "Take a moment" shows an inline reflection prompt before navigating home.

**Tech Stack:** React Native / Expo, TypeScript, `react-native-reanimated` 4.x, expo-router, Jest (animation is not testable — only logic paths are tested).

**Prerequisite:** Phase 2A must be complete — this plan requires `useGoalsStore.completeGoal` and the goal queue screen.

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `app/goal/complete.tsx` | Create | Full-screen completion moment with animation |
| `app/_layout.tsx` | Modify | Register `goal/complete` stack screen |
| `app/goal/queue.tsx` | Modify | Navigate to `goal/complete` after confirming completion |

**Do not touch:** `state/goalsSlice.ts` — `completeGoal` is already correct. No data changes needed.

---

## Task 1: Goal completion screen

**Files:**
- Create: `app/goal/complete.tsx`
- Modify: `app/_layout.tsx`
- Modify: `app/goal/queue.tsx`

- [ ] **Step 1: Register route in `app/_layout.tsx`**

Add to the `<Stack>` in `app/_layout.tsx`:

```tsx
<Stack.Screen
  name="goal/complete"
  options={{
    presentation: 'fullScreenModal',
    headerShown: false,
    gestureEnabled: false,
  }}
/>
```

`gestureEnabled: false` prevents the user from swiping away before choosing an action.

- [ ] **Step 2: Create `app/goal/complete.tsx`**

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

export default function GoalCompleteScreen() {
  const theme = useEffectiveTheme();
  const themeColors = colors[theme];
  const router = useRouter();
  const { goalTitle } = useLocalSearchParams<{ goalTitle: string }>();

  const [phase, setPhase] = useState<'moment' | 'reflect'>('moment');
  const [reflection, setReflection] = useState('');

  // Entrance animation
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
  }, []);

  const handleNext = () => {
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
          <Text style={[styles.headline, { color: themeColors.text }]}>Done.</Text>
        </Animated.View>

        <Animated.Text style={[styles.tagline, { color: themeColors.textSecondary }, subtitleStyle]}>
          That one's yours forever.
        </Animated.Text>

        <Animated.View style={[styles.actions, subtitleStyle]}>
          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: themeColors.primary }]}
            onPress={handleNext}
          >
            <Text style={styles.primaryBtnText}>See what's next</Text>
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
  headline: { fontSize: 56, fontWeight: fontWeight.bold, lineHeight: 64 },
  tagline: { fontSize: fontSize.lg, textAlign: 'center' },
  actions: { width: '100%', gap: spacing.sm, marginTop: spacing.md },
  primaryBtn: {
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#fff', fontSize: fontSize.md, fontWeight: fontWeight.semibold },
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

- [ ] **Step 3: Update `app/goal/queue.tsx` to navigate to `goal/complete`**

Find the `handleComplete` function in `app/goal/queue.tsx` (added in Phase 2A). It currently calls `completeGoal` and then navigates. Update the navigation call:

**Old (from Phase 2A plan):**
```typescript
router.push({ pathname: '/goal/complete', params: { goalId: goal.id, goalTitle: goal.title } });
```

Verify this is already the code from Phase 2A — if the Phase 2A implementer added it as written, no change needed. If it was omitted, add it now.

The full `handleComplete` should read:

```typescript
const handleComplete = (goal: Goal) => {
  Alert.alert(
    'Mark goal complete?',
    `"${goal.title}" will move to your history. The next goal in queue becomes active.`,
    [
      { text: 'Not yet', style: 'cancel' },
      {
        text: "Done — it's mine",
        onPress: async () => {
          await completeGoal(goal.id);
          router.push({ pathname: '/goal/complete', params: { goalTitle: goal.title } });
        },
      },
    ],
  );
};
```

- [ ] **Step 4: Run full test suite**

```bash
cd /mnt/c/Users/DEIVI/Desktop/Livra && npm run test
```

Expected: all tests pass. (No new unit tests — the completion screen is primarily animation/UI, not pure logic.)

- [ ] **Step 5: Commit**

```bash
git add app/goal/complete.tsx app/_layout.tsx app/goal/queue.tsx
git commit -m "$(cat <<'EOF'
feat(phase2d): add goal completion moment screen

Full-screen modal with Reanimated scale+opacity entrance animation.
Shows goal title, 'Done. That one\'s yours forever.', and two actions:
'See what\'s next' (goes home) and 'Take a moment' (inline reflection).
gestureEnabled=false prevents accidental dismissal.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

### Spec coverage

| Spec requirement | Covered by |
|---|---|
| Brief full-screen moment | `presentation: 'fullScreenModal'` |
| Subtle animation (not confetti) | Reanimated scale + opacity spring — no particles |
| Goal name displayed prominently | `goalName` text above headline |
| "Done. That one's yours forever." | `headline` + `tagline` text |
| Two actions: See what's next / Take a moment | Both buttons present |
| See what's next → activates next goal | `completeGoal` runs before navigation; `router.replace('/(tabs)/home')` |
| Take a moment → short reflection | Phase: `'reflect'` shows a text input |
| No over-the-top celebration | Single clean animation, no sounds beyond haptic |
| No streak reset language | None in copy |
| No immediate push to rate/share | None present |

### Placeholder scan
None. All steps contain complete code.

### Type consistency
- `goalTitle` passed as route param (string) — `useLocalSearchParams<{ goalTitle: string }>()` ✓
- `completeGoal(goal.id)` — matches `goalsSlice` method signature ✓
- Reanimated: `withSpring`, `withTiming`, `withDelay` — all from `react-native-reanimated` which is in the stack ✓
