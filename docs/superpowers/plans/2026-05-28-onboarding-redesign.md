# Onboarding Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single-file `app/onboarding.tsx` with a 5-screen folder-based stack flow that learns the user's focus area and identity, recommends marks, creates their first goal, and completes onboarding in one commit moment on Screen 5.

**Architecture:** A new `app/onboarding/` folder with a Stack `_layout.tsx` and one file per screen. Transient Zustand state (`state/onboardingSlice.ts`) threads answers forward between screens without persistence. A pure helper (`lib/onboarding/markRecommendations.ts`) maps user selections to mark templates. The final screen creates marks + goal and calls the extended `completeOnboarding` which now writes `onboarding_focus_area` and `onboarding_completed_at` to Supabase.

**Tech Stack:** Expo Router (file-based Stack), React Native + Reanimated 4, Zustand (transient slice), Supabase (`profiles` table), `useMarks` / `useGoalsStore`, Jest + jest-expo for unit tests.

---

## File Map

| Status | Path | Responsibility |
|---|---|---|
| Create | `app/onboarding/_layout.tsx` | Stack navigator, no header, fullScreenModal presentation |
| Create | `app/onboarding/welcome.tsx` | Screen 1 — headline + single CTA |
| Create | `app/onboarding/commitment.tsx` | Screen 2 — goal title text input |
| Create | `app/onboarding/focus-area.tsx` | Screen 3 — single-select focus area cards |
| Create | `app/onboarding/daily-identity.tsx` | Screen 4 — multi-select identity cards (up to 3) |
| Create | `app/onboarding/recommendations.tsx` | Screen 5 — mark recommendations + first goal + "Start Livra" |
| Create | `state/onboardingSlice.ts` | Transient Zustand slice (no persistence) |
| Create | `lib/onboarding/markRecommendations.ts` | Pure function: selections + focusArea → MarkTemplate[] |
| Create | `tests/unit/onboarding/markRecommendations.test.ts` | Unit tests for recommendation logic |
| Create | `tests/unit/onboarding/onboardingSlice.test.ts` | Unit tests for slice actions |
| Modify | `state/uiSlice.ts` | Extend `completeOnboarding` to accept `meta` param |
| Modify | `app/index.tsx` | Change redirect from `/onboarding` to `/onboarding/welcome` |
| Modify | `app/_layout.tsx` | Change `Stack.Screen name="onboarding"` — already present, no change needed (folder replaces file transparently) |
| Delete | `app/onboarding.tsx` | Old single-file onboarding — deleted at end |

---

## Task 1: Supabase migration SQL

**Files:**
- Create: `supabase/migrations/20260528_onboarding_meta.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- Add onboarding metadata columns to profiles table.
-- onboarding_completed already exists; these two are new.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onboarding_focus_area text,
  ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz;
```

- [ ] **Step 2: Run migration in Supabase dashboard**

Open the Supabase dashboard SQL editor and run the migration. Verify the columns appear in `Table Editor > profiles`.

No local SQLite changes are needed — these columns are write-once on completion and never read back for product logic.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260528_onboarding_meta.sql
git commit -m "feat(onboarding): add onboarding_focus_area + onboarding_completed_at columns to profiles"
```

---

## Task 2: `state/onboardingSlice.ts` — transient Zustand slice

**Files:**
- Create: `state/onboardingSlice.ts`
- Create: `tests/unit/onboarding/onboardingSlice.test.ts`

- [ ] **Step 1: Create the tests directory and write failing tests**

```bash
mkdir -p /mnt/c/Users/DEIVI/Desktop/Livra/tests/unit/onboarding
```

Create `tests/unit/onboarding/onboardingSlice.test.ts`:

```ts
import { useOnboardingStore } from '../../../state/onboardingSlice';

// Reset store between tests
beforeEach(() => {
  useOnboardingStore.setState({
    goalTitle: '',
    focusArea: null,
    identitySelections: [],
  });
});

describe('useOnboardingStore', () => {
  test('initial state has empty goalTitle, null focusArea, empty identitySelections', () => {
    const state = useOnboardingStore.getState();
    expect(state.goalTitle).toBe('');
    expect(state.focusArea).toBeNull();
    expect(state.identitySelections).toEqual([]);
  });

  test('setGoalTitle updates goalTitle', () => {
    useOnboardingStore.getState().setGoalTitle('Run a marathon');
    expect(useOnboardingStore.getState().goalTitle).toBe('Run a marathon');
  });

  test('setFocusArea updates focusArea', () => {
    useOnboardingStore.getState().setFocusArea('health');
    expect(useOnboardingStore.getState().focusArea).toBe('health');
  });

  test('setFocusArea accepts null', () => {
    useOnboardingStore.getState().setFocusArea('career');
    useOnboardingStore.getState().setFocusArea(null);
    expect(useOnboardingStore.getState().focusArea).toBeNull();
  });

  test('setIdentitySelections replaces the array', () => {
    useOnboardingStore.getState().setIdentitySelections(['Sleep better', 'Move my body']);
    expect(useOnboardingStore.getState().identitySelections).toEqual(['Sleep better', 'Move my body']);
  });

  test('reset returns all fields to initial values', () => {
    const store = useOnboardingStore.getState();
    store.setGoalTitle('Something');
    store.setFocusArea('career');
    store.setIdentitySelections(['Read consistently']);
    store.reset();
    const after = useOnboardingStore.getState();
    expect(after.goalTitle).toBe('');
    expect(after.focusArea).toBeNull();
    expect(after.identitySelections).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests — verify FAIL**

```bash
cd /mnt/c/Users/DEIVI/Desktop/Livra && npm run test -- tests/unit/onboarding/onboardingSlice.test.ts --no-coverage
```

Expected: FAIL — `Cannot find module '../../../state/onboardingSlice'`

- [ ] **Step 3: Create `state/onboardingSlice.ts`**

```ts
import { create } from 'zustand';

export type FocusArea =
  | 'health'
  | 'career'
  | 'creativity'
  | 'learning'
  | 'relationships'
  | 'finances';

interface OnboardingState {
  goalTitle: string;
  focusArea: FocusArea | null;
  identitySelections: string[];
  setGoalTitle: (title: string) => void;
  setFocusArea: (area: FocusArea | null) => void;
  setIdentitySelections: (selections: string[]) => void;
  reset: () => void;
}

const initialState = {
  goalTitle: '',
  focusArea: null as FocusArea | null,
  identitySelections: [] as string[],
};

export const useOnboardingStore = create<OnboardingState>((set) => ({
  ...initialState,
  setGoalTitle: (title) => set({ goalTitle: title }),
  setFocusArea: (area) => set({ focusArea: area }),
  setIdentitySelections: (selections) => set({ identitySelections: selections }),
  reset: () => set({ ...initialState }),
}));
```

- [ ] **Step 4: Run tests — verify PASS**

```bash
cd /mnt/c/Users/DEIVI/Desktop/Livra && npm run test -- tests/unit/onboarding/onboardingSlice.test.ts --no-coverage
```

Expected: PASS — 6 tests passing.

- [ ] **Step 5: Commit**

```bash
git add state/onboardingSlice.ts tests/unit/onboarding/onboardingSlice.test.ts
git commit -m "feat(onboarding): add transient onboardingSlice (goalTitle, focusArea, identitySelections)"
```

---

## Task 3: `lib/onboarding/markRecommendations.ts` — pure recommendation function

**Files:**
- Create: `lib/onboarding/markRecommendations.ts`
- Create: `tests/unit/onboarding/markRecommendations.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/unit/onboarding/markRecommendations.test.ts`:

```ts
import { getRecommendedMarks, MARK_TEMPLATES } from '../../../lib/onboarding/markRecommendations';

describe('MARK_TEMPLATES', () => {
  test('has 8 entries', () => {
    expect(Object.keys(MARK_TEMPLATES)).toHaveLength(8);
  });

  test('each entry has required fields', () => {
    for (const [, template] of Object.entries(MARK_TEMPLATES)) {
      expect(template).toHaveProperty('name');
      expect(template).toHaveProperty('identity_label');
      expect(template).toHaveProperty('icon');
      expect(template).toHaveProperty('default_color');
      expect(template).toHaveProperty('health_kit_type');
    }
  });
});

describe('getRecommendedMarks', () => {
  test('returns empty array when selections is empty', () => {
    expect(getRecommendedMarks([], null)).toEqual([]);
    expect(getRecommendedMarks([], 'health')).toEqual([]);
  });

  test('returns all templates when selections is 3 or fewer', () => {
    const result = getRecommendedMarks(['Sleep better', 'Move my body'], null);
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('Sleep');
    expect(result[1].name).toBe('Workout');
  });

  test('returns exactly 3 when selections is more than 3, focusArea null — first 3 in selection order', () => {
    const result = getRecommendedMarks(
      ['Sleep better', 'Move my body', 'Drink more water', 'Read consistently'],
      null,
    );
    expect(result).toHaveLength(3);
    expect(result[0].name).toBe('Sleep');
    expect(result[1].name).toBe('Workout');
    expect(result[2].name).toBe('Water');
  });

  test('health focus area prioritizes Sleep, Workout, Water when all selected', () => {
    const result = getRecommendedMarks(
      ['Read consistently', 'Plan my days', 'Sleep better', 'Move my body', 'Drink more water'],
      'health',
    );
    expect(result).toHaveLength(3);
    const names = result.map(r => r.name);
    expect(names).toContain('Sleep');
    expect(names).toContain('Workout');
    expect(names).toContain('Water');
  });

  test('career focus area prioritizes Focus, Planning, Practice', () => {
    const result = getRecommendedMarks(
      ['Sleep better', 'Move my body', 'Practice focus', 'Plan my days', 'Build a skill'],
      'career',
    );
    expect(result).toHaveLength(3);
    const names = result.map(r => r.name);
    expect(names).toContain('Focus');
    expect(names).toContain('Planning');
    expect(names).toContain('Practice');
  });

  test('creativity focus area prioritizes Practice, Focus, Sleep', () => {
    const result = getRecommendedMarks(
      ['Drink more water', 'Read consistently', 'Practice focus', 'Sleep better', 'Build a skill'],
      'creativity',
    );
    expect(result).toHaveLength(3);
    const names = result.map(r => r.name);
    expect(names).toContain('Practice');
    expect(names).toContain('Focus');
    expect(names).toContain('Sleep');
  });

  test('learning focus area prioritizes Reading, Practice, Focus', () => {
    const result = getRecommendedMarks(
      ['Sleep better', 'Move my body', 'Read consistently', 'Practice focus', 'Build a skill'],
      'learning',
    );
    expect(result).toHaveLength(3);
    const names = result.map(r => r.name);
    expect(names).toContain('Reading');
    expect(names).toContain('Practice');
    expect(names).toContain('Focus');
  });

  test('relationships focus area uses selection order (no override)', () => {
    const result = getRecommendedMarks(
      ['Sleep better', 'Move my body', 'Drink more water', 'Read consistently'],
      'relationships',
    );
    expect(result).toHaveLength(3);
    expect(result[0].name).toBe('Sleep');
    expect(result[1].name).toBe('Workout');
    expect(result[2].name).toBe('Water');
  });

  test('finances focus area prioritizes Finance, Planning', () => {
    const result = getRecommendedMarks(
      ['Sleep better', 'Move my body', 'Track my finances', 'Plan my days'],
      'finances',
    );
    expect(result).toHaveLength(3);
    const names = result.map(r => r.name);
    expect(names).toContain('Finance');
    expect(names).toContain('Planning');
  });

  test('marks not in priority list fall back to selection order for ties', () => {
    // Only 3 selected — all returned regardless of focusArea
    const result = getRecommendedMarks(['Sleep better', 'Move my body', 'Drink more water'], 'career');
    expect(result).toHaveLength(3);
  });

  test('returns correct identity_label for Sleep', () => {
    const result = getRecommendedMarks(['Sleep better'], null);
    expect(result[0].identity_label).toBe('Recovery');
  });

  test('returns correct icon for Workout', () => {
    const result = getRecommendedMarks(['Move my body'], null);
    expect(result[0].icon).toBe('💪');
  });

  test('returns correct default_color for Water', () => {
    const result = getRecommendedMarks(['Drink more water'], null);
    expect(result[0].default_color).toBe('#6B9E8A');
  });

  test('health_kit_type is sleep for Sleep mark', () => {
    const result = getRecommendedMarks(['Sleep better'], null);
    expect(result[0].health_kit_type).toBe('sleep');
  });

  test('health_kit_type is null for Water mark', () => {
    const result = getRecommendedMarks(['Drink more water'], null);
    expect(result[0].health_kit_type).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests — verify FAIL**

```bash
cd /mnt/c/Users/DEIVI/Desktop/Livra && npm run test -- tests/unit/onboarding/markRecommendations.test.ts --no-coverage
```

Expected: FAIL — `Cannot find module '../../../lib/onboarding/markRecommendations'`

- [ ] **Step 3: Create the library file**

```bash
mkdir -p /mnt/c/Users/DEIVI/Desktop/Livra/lib/onboarding
```

Create `lib/onboarding/markRecommendations.ts`:

```ts
import type { FocusArea } from '../../state/onboardingSlice';

export interface MarkTemplate {
  name: string;
  identity_label: string;
  icon: string;
  default_color: string;
  health_kit_type: string | null;
}

// Keyed by Screen 4 option label
export const MARK_TEMPLATES: Record<string, MarkTemplate> = {
  'Sleep better': {
    name: 'Sleep',
    identity_label: 'Recovery',
    icon: '🌙',
    default_color: '#7B9EA6',
    health_kit_type: 'sleep',
  },
  'Move my body': {
    name: 'Workout',
    identity_label: 'Strength',
    icon: '💪',
    default_color: '#8A7E6B',
    health_kit_type: 'workout',
  },
  'Drink more water': {
    name: 'Water',
    identity_label: 'Vitality',
    icon: '💧',
    default_color: '#6B9E8A',
    health_kit_type: null,
  },
  'Read consistently': {
    name: 'Reading',
    identity_label: 'Growth',
    icon: '📚',
    default_color: '#8A6B7B',
    health_kit_type: null,
  },
  'Plan my days': {
    name: 'Planning',
    identity_label: 'Clarity',
    icon: '🗓️',
    default_color: '#9E8A6B',
    health_kit_type: null,
  },
  'Practice focus': {
    name: 'Focus',
    identity_label: 'Focus',
    icon: '🎯',
    default_color: '#8A9E8A',
    health_kit_type: null,
  },
  'Build a skill': {
    name: 'Practice',
    identity_label: 'Mastery',
    icon: '⚡',
    default_color: '#7B6B9E',
    health_kit_type: null,
  },
  'Track my finances': {
    name: 'Finance',
    identity_label: 'Discipline',
    icon: '💰',
    default_color: '#9E7B6B',
    health_kit_type: null,
  },
};

// Focus area priority: mark names in descending priority order.
// 'relationships' is omitted — no override; falls back to selection order.
const FOCUS_AREA_PRIORITY: Partial<Record<FocusArea, string[]>> = {
  health: ['Sleep', 'Workout', 'Water'],
  career: ['Focus', 'Planning', 'Practice'],
  creativity: ['Practice', 'Focus', 'Sleep'],
  learning: ['Reading', 'Practice', 'Focus'],
  finances: ['Finance', 'Planning'],
};

/**
 * Returns 2–3 recommended MarkTemplates based on Screen 4 selections and the user's focus area.
 *
 * Rules:
 * - Empty selections → []
 * - ≤3 selections → return all in selection order
 * - >3 selections → score by focus area priority list position and return top 3.
 *   Ties broken by original selection order. focusArea null → first 3 in selection order.
 */
export function getRecommendedMarks(
  selections: string[],
  focusArea: FocusArea | null,
): MarkTemplate[] {
  if (selections.length === 0) return [];

  const templates = selections
    .map((label) => MARK_TEMPLATES[label])
    .filter((t): t is MarkTemplate => Boolean(t));

  if (templates.length <= 3) return templates;

  // Need to reduce to 3 using priority scoring
  const priorityList = focusArea ? (FOCUS_AREA_PRIORITY[focusArea] ?? []) : [];

  const scored = templates.map((template, selectionIndex) => {
    const priorityIndex = priorityList.indexOf(template.name);
    // Lower priorityScore = higher priority. Not in list = pushed after all listed marks.
    const priorityScore = priorityIndex === -1 ? priorityList.length : priorityIndex;
    return { template, priorityScore, selectionIndex };
  });

  scored.sort((a, b) => {
    if (a.priorityScore !== b.priorityScore) return a.priorityScore - b.priorityScore;
    return a.selectionIndex - b.selectionIndex;
  });

  return scored.slice(0, 3).map((s) => s.template);
}
```

- [ ] **Step 4: Run tests — verify PASS**

```bash
cd /mnt/c/Users/DEIVI/Desktop/Livra && npm run test -- tests/unit/onboarding/markRecommendations.test.ts --no-coverage
```

Expected: PASS — all tests green.

- [ ] **Step 5: Commit**

```bash
git add lib/onboarding/markRecommendations.ts tests/unit/onboarding/markRecommendations.test.ts
git commit -m "feat(onboarding): add markRecommendations pure function with focus area priority matrix"
```

---

## Task 4: Extend `completeOnboarding` in `state/uiSlice.ts`

**Files:**
- Modify: `state/uiSlice.ts` (lines 29 and 60–97)

The current signature is `completeOnboarding: (userId?: string) => Promise<boolean>`. We extend it to accept an optional `meta` object and write the new columns when provided.

- [ ] **Step 1: Update the interface type in `state/uiSlice.ts`**

Find this line (line 29):
```ts
  /** Returns false if logged-in cloud update failed (local completion still applied). */
  completeOnboarding: (userId?: string) => Promise<boolean>;
```

Replace with:
```ts
  /** Returns false if logged-in cloud update failed (local completion still applied). */
  completeOnboarding: (
    userId?: string,
    meta?: { focusArea?: string; completedAt?: string }
  ) => Promise<boolean>;
```

- [ ] **Step 2: Update the implementation in `state/uiSlice.ts`**

Find the implementation (line 60):
```ts
  completeOnboarding: async (userId?: string) => {
```

Replace with:
```ts
  completeOnboarding: async (
    userId?: string,
    meta?: { focusArea?: string; completedAt?: string }
  ) => {
```

Then find the Supabase update inside `completeOnboarding` (lines 69–71):
```ts
        const { error } = await supabase
          .from('profiles')
          .update({ onboarding_completed: true })
          .eq('id', userId);
```

Replace with:
```ts
        const profileUpdate: Record<string, unknown> = { onboarding_completed: true };
        if (meta?.focusArea) profileUpdate.onboarding_focus_area = meta.focusArea;
        if (meta?.completedAt) profileUpdate.onboarding_completed_at = meta.completedAt;

        const { error } = await supabase
          .from('profiles')
          .update(profileUpdate)
          .eq('id', userId);
```

- [ ] **Step 3: Verify TypeScript compiles cleanly**

```bash
cd /mnt/c/Users/DEIVI/Desktop/Livra && npm run type-check 2>&1 | head -30
```

Expected: no new errors relating to `uiSlice.ts` or `completeOnboarding`.

- [ ] **Step 4: Commit**

```bash
git add state/uiSlice.ts
git commit -m "feat(onboarding): extend completeOnboarding to write focusArea + completedAt to profiles"
```

---

## Task 5: `app/onboarding/_layout.tsx` — Stack navigator

**Files:**
- Create: `app/onboarding/_layout.tsx`

The existing `app/_layout.tsx` already registers `<Stack.Screen name="onboarding" options={{ presentation: 'fullScreenModal' }} />`. When the `app/onboarding/` folder replaces `app/onboarding.tsx`, Expo Router automatically routes through the folder's `_layout.tsx`. No change needed in `app/_layout.tsx`.

- [ ] **Step 1: Create the onboarding folder and `_layout.tsx`**

```bash
mkdir -p /mnt/c/Users/DEIVI/Desktop/Livra/app/onboarding
```

Create `app/onboarding/_layout.tsx`:

```tsx
import { Stack } from 'expo-router';
import { useEffectiveTheme } from '../../state/uiSlice';
import { colors } from '../../theme/colors';

export default function OnboardingLayout() {
  const theme = useEffectiveTheme();

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors[theme].background },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="welcome" />
      <Stack.Screen name="commitment" />
      <Stack.Screen name="focus-area" />
      <Stack.Screen name="daily-identity" />
      <Stack.Screen name="recommendations" options={{ gestureEnabled: false }} />
    </Stack>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles cleanly**

```bash
cd /mnt/c/Users/DEIVI/Desktop/Livra && npm run type-check 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/onboarding/_layout.tsx
git commit -m "feat(onboarding): add onboarding stack layout (5-screen folder-based flow)"
```

---

## Task 6: `app/onboarding/welcome.tsx` — Screen 1

**Files:**
- Create: `app/onboarding/welcome.tsx`

No back button. No skip. Single CTA navigates to `commitment`.

- [ ] **Step 1: Create `app/onboarding/welcome.tsx`**

```tsx
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useEffectiveTheme } from '../../state/uiSlice';
import { colors } from '../../theme/colors';
import { spacing, fontSize, fontWeight, borderRadius } from '../../theme/tokens';

export default function WelcomeScreen() {
  const theme = useEffectiveTheme();
  const themeColors = colors[theme];
  const router = useRouter();

  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: themeColors.background }]}>
      <View style={styles.content}>
        <View style={styles.logoArea}>
          <Text style={[styles.logoText, { color: themeColors.accent.primary }]}>Livra</Text>
        </View>

        <View style={styles.copyArea}>
          <Text style={[styles.headline, { color: themeColors.text }]}>
            {"Most people have a graveyard of abandoned goals."}
          </Text>
          <Text style={[styles.subtext, { color: themeColors.textSecondary }]}>
            {"This is where goals actually get done."}
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.ctaButton, { backgroundColor: themeColors.accent.primary }]}
          onPress={() => router.push('/onboarding/commitment')}
          activeOpacity={0.82}
        >
          <Text style={styles.ctaButtonText}>{"Let's start"}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: {
    flex: 1,
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing['3xl'],
  },
  logoArea: {
    alignItems: 'center',
    paddingTop: spacing['3xl'],
  },
  logoText: {
    fontSize: fontSize['2xl'],
    fontWeight: fontWeight.bold,
    letterSpacing: 1.5,
  },
  copyArea: {
    gap: spacing.lg,
  },
  headline: {
    fontSize: fontSize['2xl'],
    fontWeight: fontWeight.bold,
    lineHeight: fontSize['2xl'] * 1.35,
  },
  subtext: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.normal,
    lineHeight: fontSize.xl * 1.5,
  },
  ctaButton: {
    width: '100%',
    paddingVertical: spacing.lg,
    borderRadius: borderRadius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  ctaButtonText: {
    color: '#FFFFFF',
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
  },
});
```

- [ ] **Step 2: Verify TypeScript compiles cleanly**

```bash
cd /mnt/c/Users/DEIVI/Desktop/Livra && npm run type-check 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/onboarding/welcome.tsx
git commit -m "feat(onboarding): add welcome screen (Screen 1)"
```

---

## Task 7: `app/onboarding/commitment.tsx` — Screen 2

**Files:**
- Create: `app/onboarding/commitment.tsx`

Has back button (default Stack behavior). Skip link (top-right) navigates to `focus-area` with `goalTitle` left as-is (empty). Validates ≥3 chars on button tap only.

- [ ] **Step 1: Create `app/onboarding/commitment.tsx`**

```tsx
import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useEffectiveTheme } from '../../state/uiSlice';
import { useOnboardingStore } from '../../state/onboardingSlice';
import { colors } from '../../theme/colors';
import { spacing, fontSize, fontWeight, borderRadius } from '../../theme/tokens';

export default function CommitmentScreen() {
  const theme = useEffectiveTheme();
  const themeColors = colors[theme];
  const router = useRouter();
  const { goalTitle, setGoalTitle } = useOnboardingStore();
  const [inputError, setInputError] = useState<string | null>(null);

  const handleSkip = () => {
    router.push('/onboarding/focus-area');
  };

  const handleConfirm = () => {
    const trimmed = goalTitle.trim();
    if (trimmed.length < 3) {
      setInputError("Add at least 3 characters — even a rough idea counts.");
      return;
    }
    setInputError(null);
    setGoalTitle(trimmed);
    router.push('/onboarding/focus-area');
  };

  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: themeColors.background }]}>
      <KeyboardAvoidingView
        style={styles.fill}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Top-right skip link */}
        <View style={styles.topBar}>
          <TouchableOpacity onPress={handleSkip} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Text style={[styles.skipText, { color: themeColors.textSecondary }]}>Skip</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.content}>
          <View style={styles.copyArea}>
            <Text style={[styles.prompt, { color: themeColors.text }]}>
              {"What's one thing you've been putting off?"}
            </Text>
            <Text style={[styles.subtext, { color: themeColors.textSecondary }]}>
              {"That's where we start."}
            </Text>
          </View>

          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: themeColors.surface,
                color: themeColors.text,
                borderColor: inputError ? themeColors.error : themeColors.border,
              },
            ]}
            value={goalTitle}
            onChangeText={(text) => {
              setGoalTitle(text);
              if (inputError) setInputError(null);
            }}
            placeholder={"e.g. Finish writing the book"}
            placeholderTextColor={themeColors.textTertiary}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
            autoFocus
            returnKeyType="done"
          />

          {inputError !== null && (
            <Text style={[styles.errorText, { color: themeColors.error }]}>{inputError}</Text>
          )}

          <TouchableOpacity
            style={[styles.ctaButton, { backgroundColor: themeColors.accent.primary }]}
            onPress={handleConfirm}
            activeOpacity={0.82}
          >
            <Text style={styles.ctaButtonText}>{"That's it"}</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  skipText: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium,
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.xl,
    justifyContent: 'center',
    gap: spacing.xl,
  },
  copyArea: {
    gap: spacing.md,
  },
  prompt: {
    fontSize: fontSize['2xl'],
    fontWeight: fontWeight.bold,
    lineHeight: fontSize['2xl'] * 1.3,
  },
  subtext: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.normal,
  },
  input: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.normal,
    borderWidth: 1,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    minHeight: 96,
  },
  errorText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.normal,
  },
  ctaButton: {
    width: '100%',
    paddingVertical: spacing.lg,
    borderRadius: borderRadius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  ctaButtonText: {
    color: '#FFFFFF',
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
  },
});
```

- [ ] **Step 2: Verify TypeScript compiles cleanly**

```bash
cd /mnt/c/Users/DEIVI/Desktop/Livra && npm run type-check 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/onboarding/commitment.tsx
git commit -m "feat(onboarding): add commitment screen (Screen 2) with goal title input"
```

---

## Task 8: `app/onboarding/focus-area.tsx` — Screen 3

**Files:**
- Create: `app/onboarding/focus-area.tsx`

Single select. Button enabled only when a card is selected. Skip link navigates forward with `focusArea` left null.

- [ ] **Step 1: Create `app/onboarding/focus-area.tsx`**

```tsx
import { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useEffectiveTheme } from '../../state/uiSlice';
import { useOnboardingStore, FocusArea } from '../../state/onboardingSlice';
import { colors } from '../../theme/colors';
import { spacing, fontSize, fontWeight, borderRadius } from '../../theme/tokens';

const FOCUS_OPTIONS: { label: string; value: FocusArea }[] = [
  { label: 'Health', value: 'health' },
  { label: 'Career', value: 'career' },
  { label: 'Creativity', value: 'creativity' },
  { label: 'Learning', value: 'learning' },
  { label: 'Relationships', value: 'relationships' },
  { label: 'Finances', value: 'finances' },
];

export default function FocusAreaScreen() {
  const theme = useEffectiveTheme();
  const themeColors = colors[theme];
  const router = useRouter();
  const { setFocusArea } = useOnboardingStore();
  const [selected, setSelected] = useState<FocusArea | null>(null);

  const handleSkip = () => {
    // Leave focusArea as null in the store — skip does not write
    router.push('/onboarding/daily-identity');
  };

  const handleConfirm = () => {
    setFocusArea(selected);
    router.push('/onboarding/daily-identity');
  };

  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: themeColors.background }]}>
      {/* Top-right skip link */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={handleSkip} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={[styles.skipText, { color: themeColors.textSecondary }]}>Skip</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.fill}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.copyArea}>
          <Text style={[styles.prompt, { color: themeColors.text }]}>
            {"What area of your life needs the most attention right now?"}
          </Text>
        </View>

        <View style={styles.cardList}>
          {FOCUS_OPTIONS.map((option) => {
            const isSelected = selected === option.value;
            return (
              <TouchableOpacity
                key={option.value}
                style={[
                  styles.card,
                  {
                    backgroundColor: isSelected ? themeColors.primary : themeColors.surface,
                    borderColor: isSelected ? themeColors.accent.primary : themeColors.border,
                    borderWidth: isSelected ? 2 : 1,
                  },
                ]}
                onPress={() => setSelected(isSelected ? null : option.value)}
                activeOpacity={0.78}
              >
                <Text
                  style={[
                    styles.cardLabel,
                    { color: isSelected ? themeColors.accent.primary : themeColors.text },
                  ]}
                >
                  {option.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <TouchableOpacity
          style={[
            styles.ctaButton,
            {
              backgroundColor:
                selected ? themeColors.accent.primary : themeColors.surfaceVariant,
            },
          ]}
          onPress={handleConfirm}
          disabled={selected === null}
          activeOpacity={0.82}
        >
          <Text
            style={[
              styles.ctaButtonText,
              { color: selected ? '#FFFFFF' : themeColors.textTertiary },
            ]}
          >
            {"That's my focus"}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  skipText: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium,
  },
  scrollContent: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing['4xl'],
    gap: spacing.xl,
  },
  copyArea: {
    gap: spacing.md,
  },
  prompt: {
    fontSize: fontSize['2xl'],
    fontWeight: fontWeight.bold,
    lineHeight: fontSize['2xl'] * 1.3,
  },
  cardList: {
    gap: spacing.md,
  },
  card: {
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.xl,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  cardLabel: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.semibold,
  },
  ctaButton: {
    width: '100%',
    paddingVertical: spacing.lg,
    borderRadius: borderRadius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    marginTop: spacing.sm,
  },
  ctaButtonText: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
  },
});
```

- [ ] **Step 2: Verify TypeScript compiles cleanly**

```bash
cd /mnt/c/Users/DEIVI/Desktop/Livra && npm run type-check 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/onboarding/focus-area.tsx
git commit -m "feat(onboarding): add focus-area screen (Screen 3) with single-select cards"
```

---

## Task 9: `app/onboarding/daily-identity.tsx` — Screen 4

**Files:**
- Create: `app/onboarding/daily-identity.tsx`

Multi-select, up to 3. Selecting a 4th deselects the oldest pick (the first element in the selections array). Button enabled when ≥1 selected. Skip navigates to `recommendations` with empty selections.

- [ ] **Step 1: Create `app/onboarding/daily-identity.tsx`**

```tsx
import { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useEffectiveTheme } from '../../state/uiSlice';
import { useOnboardingStore } from '../../state/onboardingSlice';
import { colors } from '../../theme/colors';
import { spacing, fontSize, fontWeight, borderRadius } from '../../theme/tokens';

const IDENTITY_OPTIONS = [
  'Sleep better',
  'Move my body',
  'Drink more water',
  'Read consistently',
  'Plan my days',
  'Practice focus',
  'Build a skill',
  'Track my finances',
];

const MAX_SELECTIONS = 3;

export default function DailyIdentityScreen() {
  const theme = useEffectiveTheme();
  const themeColors = colors[theme];
  const router = useRouter();
  const { setIdentitySelections } = useOnboardingStore();
  // Local state for UI — only written to store on confirm / skip
  const [selected, setSelected] = useState<string[]>([]);

  const handleToggle = (option: string) => {
    setSelected((prev) => {
      if (prev.includes(option)) {
        return prev.filter((o) => o !== option);
      }
      if (prev.length >= MAX_SELECTIONS) {
        // Deselect oldest pick (first element) and add new one at end
        return [...prev.slice(1), option];
      }
      return [...prev, option];
    });
  };

  const handleSkip = () => {
    // Do not write to store — identitySelections remains []
    router.push('/onboarding/recommendations');
  };

  const handleConfirm = () => {
    setIdentitySelections(selected);
    router.push('/onboarding/recommendations');
  };

  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: themeColors.background }]}>
      {/* Top-right skip link */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={handleSkip} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={[styles.skipText, { color: themeColors.textSecondary }]}>Skip</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.fill}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.copyArea}>
          <Text style={[styles.prompt, { color: themeColors.text }]}>
            {"How do you want to show up every day?"}
          </Text>
          <Text style={[styles.subtext, { color: themeColors.textSecondary }]}>
            {"Pick up to 3. You can always change these."}
          </Text>
        </View>

        <View style={styles.cardList}>
          {IDENTITY_OPTIONS.map((option) => {
            const isSelected = selected.includes(option);
            return (
              <TouchableOpacity
                key={option}
                style={[
                  styles.card,
                  {
                    backgroundColor: isSelected ? themeColors.primary : themeColors.surface,
                    borderColor: isSelected ? themeColors.accent.primary : themeColors.border,
                    borderWidth: isSelected ? 2 : 1,
                  },
                ]}
                onPress={() => handleToggle(option)}
                activeOpacity={0.78}
              >
                <Text
                  style={[
                    styles.cardLabel,
                    { color: isSelected ? themeColors.accent.primary : themeColors.text },
                  ]}
                >
                  {option}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <TouchableOpacity
          style={[
            styles.ctaButton,
            {
              backgroundColor:
                selected.length > 0 ? themeColors.accent.primary : themeColors.surfaceVariant,
            },
          ]}
          onPress={handleConfirm}
          disabled={selected.length === 0}
          activeOpacity={0.82}
        >
          <Text
            style={[
              styles.ctaButtonText,
              { color: selected.length > 0 ? '#FFFFFF' : themeColors.textTertiary },
            ]}
          >
            {"These feel right"}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  skipText: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium,
  },
  scrollContent: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing['4xl'],
    gap: spacing.xl,
  },
  copyArea: {
    gap: spacing.md,
  },
  prompt: {
    fontSize: fontSize['2xl'],
    fontWeight: fontWeight.bold,
    lineHeight: fontSize['2xl'] * 1.3,
  },
  subtext: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.normal,
    lineHeight: fontSize.lg * 1.5,
  },
  cardList: {
    gap: spacing.md,
  },
  card: {
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.xl,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  cardLabel: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
  },
  ctaButton: {
    width: '100%',
    paddingVertical: spacing.lg,
    borderRadius: borderRadius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    marginTop: spacing.sm,
  },
  ctaButtonText: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
  },
});
```

- [ ] **Step 2: Verify TypeScript compiles cleanly**

```bash
cd /mnt/c/Users/DEIVI/Desktop/Livra && npm run type-check 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/onboarding/daily-identity.tsx
git commit -m "feat(onboarding): add daily-identity screen (Screen 4) with up-to-3 multi-select"
```

---

## Task 10: `app/onboarding/recommendations.tsx` — Screen 5

**Files:**
- Create: `app/onboarding/recommendations.tsx`

No back button (Stack back is disabled via `gestureEnabled: false` in the layout). No skip. Full commitment screen. Creates marks, creates goal if non-empty, calls `completeOnboarding` with meta, resets slice, navigates home.

**Key behaviors:**
- Recommended mark cards are deselectable (user controls which marks get created)
- Empty selections is valid — no marks created, button remains enabled
- Empty goal field is valid — no goal created, navigates home
- Loading state on button during async operations
- Error → retry toast, no navigation until success
- Mark creation skips silently on `DuplicateMarkError`

- [ ] **Step 1: Create `app/onboarding/recommendations.tsx`**

```tsx
import { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useEffectiveTheme, useUIStore } from '../../state/uiSlice';
import { useOnboardingStore } from '../../state/onboardingSlice';
import { useNotification } from '../../contexts/NotificationContext';
import { useAuth } from '../../hooks/useAuth';
import { useGoalsStore } from '../../state/goalsSlice';
import { useMarksStore } from '../../state/countersSlice';
import { DuplicateMarkError, DuplicateCounterError } from '../../state/countersSlice';
import { getRecommendedMarks, MarkTemplate } from '../../lib/onboarding/markRecommendations';
import { colors } from '../../theme/colors';
import { spacing, fontSize, fontWeight, borderRadius } from '../../theme/tokens';
import { logger } from '../../lib/utils/logger';
import { v4 as uuidv4 } from 'uuid';
import { useIapSubscriptions } from '../../hooks/useIapSubscriptions';

export default function RecommendationsScreen() {
  const theme = useEffectiveTheme();
  const themeColors = colors[theme];
  const router = useRouter();
  const { user } = useAuth();
  const { showError } = useNotification();
  const { completeOnboarding } = useUIStore();
  const { goalTitle, focusArea, identitySelections, reset: resetOnboarding } = useOnboardingStore();
  const addGoal = useGoalsStore((s) => s.addGoal);
  const addMark = useMarksStore((s) => s.addMark);
  const { isProUnlocked } = useIapSubscriptions();

  const recommendedMarks = getRecommendedMarks(identitySelections, focusArea);

  // Local deselectable set — starts as all recommended marks selected
  const [selectedMarkNames, setSelectedMarkNames] = useState<Set<string>>(
    () => new Set(recommendedMarks.map((m) => m.name)),
  );
  const [goalInput, setGoalInput] = useState(goalTitle);
  const [loading, setLoading] = useState(false);

  const toggleMark = useCallback((markName: string) => {
    setSelectedMarkNames((prev) => {
      const next = new Set(prev);
      if (next.has(markName)) {
        next.delete(markName);
      } else {
        next.add(markName);
      }
      return next;
    });
  }, []);

  const handleStartLivra = async () => {
    if (loading || !user?.id) return;
    setLoading(true);

    try {
      // Step 1: Create selected marks (skip duplicates silently)
      const marksToCreate = recommendedMarks.filter((m) => selectedMarkNames.has(m.name));
      const existingMarks = useMarksStore.getState().marks;

      for (const template of marksToCreate) {
        const alreadyExists = existingMarks.some(
          (m) => m.name.toLowerCase() === template.name.toLowerCase() && !m.deleted_at,
        );
        if (alreadyExists) continue;

        try {
          await addMark({
            id: uuidv4(),
            name: template.name,
            emoji: template.icon,
            color: template.default_color,
            unit: 'sessions',
            enable_streak: true,
            sort_index: existingMarks.filter((m) => !m.deleted_at).length,
            user_id: user.id,
            total: 0,
            dailyTarget: 1,
            schedule_type: 'daily',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
        } catch (err) {
          if (err instanceof DuplicateMarkError || err instanceof DuplicateCounterError) {
            // Expected — skip silently
          } else {
            logger.error('[Onboarding] Mark creation failed:', err);
            throw err;
          }
        }
      }

      // Step 2: Create goal if input is non-empty (≥3 chars)
      const trimmedGoal = goalInput.trim();
      if (trimmedGoal.length >= 3) {
        await addGoal({
          title: trimmedGoal,
          userId: user.id,
          isPro: isProUnlocked,
        });
      }

      // Step 3: Complete onboarding with meta
      const now = new Date().toISOString();
      await completeOnboarding(user.id, {
        focusArea: focusArea ?? undefined,
        completedAt: now,
      });

      // Step 4: Reset transient slice
      resetOnboarding();

      // Step 5: Navigate home
      router.replace('/(tabs)/home');
    } catch (err) {
      logger.error('[Onboarding] handleStartLivra failed:', err);
      showError('Something went wrong. Tap to try again.');
    } finally {
      setLoading(false);
    }
  };

  const hasRecommendations = recommendedMarks.length > 0;

  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: themeColors.background }]}>
      <ScrollView
        style={styles.fill}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Part A — Mark recommendations */}
        <Text style={[styles.sectionHeader, { color: themeColors.text }]}>
          {"Here's what we'd suggest for you."}
        </Text>

        {hasRecommendations ? (
          <View style={styles.markList}>
            {recommendedMarks.map((template) => {
              const isSelected = selectedMarkNames.has(template.name);
              return (
                <TouchableOpacity
                  key={template.name}
                  style={[
                    styles.markCard,
                    {
                      backgroundColor: themeColors.surface,
                      borderColor: isSelected ? template.default_color : themeColors.border,
                      borderWidth: isSelected ? 2 : 1,
                    },
                  ]}
                  onPress={() => toggleMark(template.name)}
                  activeOpacity={0.78}
                >
                  <Text style={styles.markIcon}>{template.icon}</Text>
                  <View style={styles.markCopy}>
                    <Text style={[styles.markName, { color: themeColors.text }]}>
                      {template.name}
                    </Text>
                    <Text style={[styles.markIdentity, { color: themeColors.textSecondary }]}>
                      {template.identity_label}
                    </Text>
                  </View>
                  {!isSelected && (
                    <View style={[styles.deselectedDot, { backgroundColor: themeColors.border }]} />
                  )}
                  {isSelected && (
                    <View style={[styles.selectedDot, { backgroundColor: template.default_color }]} />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        ) : (
          <Text style={[styles.fallbackText, { color: themeColors.textSecondary }]}>
            {"You can add marks anytime from home."}
          </Text>
        )}

        {/* Divider */}
        <View style={[styles.divider, { backgroundColor: themeColors.border }]} />

        {/* Part B — First goal */}
        <Text style={[styles.goalLabel, { color: themeColors.textSecondary }]}>
          {"Your first goal"}
        </Text>
        <TextInput
          style={[
            styles.goalInput,
            {
              backgroundColor: themeColors.surface,
              color: themeColors.text,
              borderColor: themeColors.border,
            },
          ]}
          value={goalInput}
          onChangeText={setGoalInput}
          placeholder={"What's one thing you want to finish?"}
          placeholderTextColor={themeColors.textTertiary}
          multiline
          numberOfLines={2}
          textAlignVertical="top"
        />

        {/* CTA */}
        <TouchableOpacity
          style={[styles.ctaButton, { backgroundColor: themeColors.accent.primary }]}
          onPress={handleStartLivra}
          disabled={loading}
          activeOpacity={0.82}
        >
          {loading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.ctaButtonText}>{"Start Livra"}</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  scrollContent: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing['3xl'],
    paddingBottom: spacing['4xl'],
    gap: spacing.xl,
  },
  sectionHeader: {
    fontSize: fontSize['2xl'],
    fontWeight: fontWeight.bold,
    lineHeight: fontSize['2xl'] * 1.3,
  },
  markList: {
    gap: spacing.md,
  },
  markCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    gap: spacing.md,
  },
  markIcon: {
    fontSize: 28,
    width: 36,
    textAlign: 'center',
  },
  markCopy: {
    flex: 1,
    gap: 2,
  },
  markName: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
  },
  markIdentity: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.normal,
  },
  deselectedDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  selectedDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  fallbackText: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.normal,
    lineHeight: fontSize.base * 1.6,
  },
  divider: {
    height: 1,
    width: '100%',
  },
  goalLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  goalInput: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.normal,
    borderWidth: 1,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    minHeight: 80,
  },
  ctaButton: {
    width: '100%',
    paddingVertical: spacing.lg,
    borderRadius: borderRadius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  ctaButtonText: {
    color: '#FFFFFF',
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
  },
});
```

- [ ] **Step 2: Verify TypeScript compiles cleanly**

```bash
cd /mnt/c/Users/DEIVI/Desktop/Livra && npm run type-check 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/onboarding/recommendations.tsx
git commit -m "feat(onboarding): add recommendations screen (Screen 5) — marks, goal, Start Livra"
```

---

## Task 11: Integration — redirect, stack registration, delete old file

**Files:**
- Modify: `app/index.tsx` (line 88)
- Modify: `app/_layout.tsx` (Stack.Screen for onboarding — verify `presentation` option is correct)
- Delete: `app/onboarding.tsx`

### Step 1: Update redirect in `app/index.tsx`

- [ ] **Update the onboarding redirect**

Find line 88 in `app/index.tsx`:
```tsx
    return <Redirect href="/onboarding" />;
```

Replace with:
```tsx
    return <Redirect href="/onboarding/welcome" />;
```

### Step 2: Verify Stack registration in `app/_layout.tsx`

- [ ] **Confirm the existing Stack.Screen is correct for a folder**

The current line in `app/_layout.tsx` (line ~460) reads:
```tsx
<Stack.Screen name="onboarding" options={{ presentation: 'fullScreenModal' }} />
```

This registration is correct as-is. Expo Router maps `name="onboarding"` to the `app/onboarding/` folder's `_layout.tsx` when the folder exists. No change needed.

### Step 3: Run the full test suite

- [ ] **Run all tests — verify no regressions**

```bash
cd /mnt/c/Users/DEIVI/Desktop/Livra && npm run test --no-coverage 2>&1 | tail -20
```

Expected: All previously-passing tests continue to pass. New onboarding tests all pass.

### Step 4: TypeScript full check

- [ ] **Run type-check**

```bash
cd /mnt/c/Users/DEIVI/Desktop/Livra && npm run type-check 2>&1 | head -40
```

Expected: no errors.

### Step 5: Delete the old onboarding file

- [ ] **Delete `app/onboarding.tsx`**

```bash
rm /mnt/c/Users/DEIVI/Desktop/Livra/app/onboarding.tsx
```

- [ ] **Verify the file is gone and no other file imports it**

```bash
grep -r "from.*app/onboarding\"" /mnt/c/Users/DEIVI/Desktop/Livra/app /mnt/c/Users/DEIVI/Desktop/Livra/state /mnt/c/Users/DEIVI/Desktop/Livra/hooks 2>/dev/null
```

Expected: no output.

- [ ] **Run type-check again after deletion**

```bash
cd /mnt/c/Users/DEIVI/Desktop/Livra && npm run type-check 2>&1 | head -20
```

Expected: no errors.

### Step 6: Commit integration changes

```bash
git add app/index.tsx
git rm app/onboarding.tsx
git commit -m "feat(onboarding): wire up 5-screen flow — update redirect, remove old onboarding.tsx"
```

---

## Self-Review Checklist

**Spec coverage:**
- [x] 5 screens implemented (welcome, commitment, focus-area, daily-identity, recommendations)
- [x] Back/skip rules: welcome has neither; commitment/focus-area/daily-identity have skip top-right; recommendations has no back (gestureEnabled: false), no skip
- [x] `goalTitle` validation: ≥3 chars, enforced on tap only, not while typing
- [x] Focus-area single select; button enabled only when selected
- [x] Daily-identity multi-select ≤3; oldest deselected on 4th pick; button enabled ≥1
- [x] Recommendations: shows 2–3 mark cards when identitySelections non-empty; fallback line when empty
- [x] Mark cards on recommendations screen are deselectable by user
- [x] Goal input pre-filled from `goalTitle` slice; placeholder shown when empty
- [x] "Start Livra" always enabled (zero marks + empty goal is valid)
- [x] Mark creation skips silently on `DuplicateMarkError`
- [x] Goal creation skipped if input empty (< 3 chars)
- [x] `completeOnboarding` called with `userId` and `meta: { focusArea, completedAt }`
- [x] `onboardingSlice.reset()` called after completion
- [x] Navigation to `/(tabs)/home` via `router.replace`
- [x] Error → retry toast, no navigation until success
- [x] Loading state on "Start Livra" button during async ops
- [x] Mark `default_color` values from spec passed directly as data values (not theme tokens)
- [x] Supabase columns `onboarding_focus_area` and `onboarding_completed_at` added
- [x] `app/index.tsx` redirect updated to `/onboarding/welcome`
- [x] `app/onboarding.tsx` deleted at end
- [x] `app/onboarding/_layout.tsx` registered as folder; existing `Stack.Screen name="onboarding"` in root layout handles it

**Type consistency:**
- `FocusArea` type exported from `state/onboardingSlice.ts` and imported in `focus-area.tsx` and `lib/onboarding/markRecommendations.ts`
- `useOnboardingStore` fields `goalTitle`, `focusArea`, `identitySelections` consistent across all screens
- `MarkTemplate` interface exported from `lib/onboarding/markRecommendations.ts` and used in `recommendations.tsx`
- `getRecommendedMarks(selections: string[], focusArea: FocusArea | null)` signature consistent between library and test file
- `addMark` called directly from `useMarksStore` in recommendations screen (not via `useMarks` hook, which carries badge evaluation and sync side-effects — during onboarding those are not needed and would require a full hook setup; `useMarksStore.getState().addMark` is the appropriate path for the batch creation context, consistent with how the old `onboarding.tsx` called `createCounter` with `skipSync: true`)

**Note on mark creation in recommendations.tsx:** The screen calls `useMarksStore((s) => s.addMark)` directly (bypassing `useMarks().createMark`) for two reasons: (1) `createMark` in `useCounters.ts` enforces the free-plan mark limit and requires badge evaluation hooks, both inappropriate during initial onboarding setup; (2) the old `onboarding.tsx` used `skipSync: true` for the same reason. The `addMark` in `countersSlice` writes to SQLite; sync will pick up the marks on the next app foreground cycle.
