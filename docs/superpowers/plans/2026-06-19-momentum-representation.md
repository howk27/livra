# Momentum Representation (C+A hybrid on the goal card) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a goal's Momentum visible on the focus screen — a calm "Momentum · N days" line per active goal (warm glow when on it, neutral when resting, fresh-start at zero) with an amber cushion gauge that appears only when slipping.

**Architecture:** A small Zustand cache (`state/momentumSlice.ts`) holds the latest `MomentumSnapshot` per goalId; the already-shipped 1.1 eval triggers (`creditMarkToGoals` on log, `evaluateActiveGoalsMomentum` on foreground) write their computed snapshot through to it, and `focus.tsx` reads it reactively. A pure presenter (`lib/momentumPresenter.ts`) maps a snapshot to a display model (visual state + label + cushion), and a presentational component (`components/ui/GoalMomentum.tsx`) renders it on each goal card. No engine or eval-semantics change beyond the write-through; the component is pure (snapshot in, view out).

**Tech Stack:** TypeScript (strict), Jest (`jest-expo`) + `@testing-library/react-native`, Zustand, `react-native-reanimated` 4.x, `theme/tokens`.

## Global Constraints

- **Per active goal only; un-goaled habits get NO momentum** (spec §2, §7.4). Momentum renders on goal cards only, never on the "Daily habits" (goal-less) section.
- **Hard visual constraints (spec §5):** no flame / loss-aversion iconography; no calendar heatmap or day-dot chain; no numeric countdown ("1 day until reset" is banned — the gauge carries the felt sense). A rest day must never look like a break.
- **Amber/warm for at-risk, never alarm-red.** The cushion gauge uses the new `momentumAmber` token, never `danger`.
- **Color tokens from constants only — never hardcode hex** (CLAUDE.md). The one new color is added to `theme/tokens.ts` for both light and dark.
- **Zustand slices only — never useState for persistent/derived-cache data** (CLAUDE.md). The snapshot cache is a store, not screen `useState`.
- **No dashes in user-facing copy.** The label uses the middle dot `·` (U+00B7), which the spec §10 mandates verbatim ("Momentum · {n} days") and is NOT a dash.
- **Cushion gauge fill = `snapshot.cushionRemaining`** (the engine already computes `(breakGap − gap)/(breakGap − atRiskGap)`, 1 at the at-risk edge, 0 at break). Shown ONLY when `state === 'slipping'` (spec §7.6).
- **Engine + 1.1 eval semantics unchanged** except adding a `setSnapshot` write-through call in the two eval functions.
- **Source spec:** `docs/superpowers/specs/2026-06-17-momentum-design.md` (§5 representation DECIDED, §7.6 cushion gauge DECIDED, §10 copy). Snapshot shape from `lib/goalMomentum.ts`: `MomentumSnapshot { state: 'on_track'|'resting'|'slipping'|'broken'; days: number; cushionRemaining: number | null; slippingMarkId: string | null }`.

---

## File Structure

- Create: `state/momentumSlice.ts` — `useMomentumStore`, the per-goal snapshot cache. One responsibility: hold/update snapshots.
- Create: `lib/momentumPresenter.ts` — pure `presentMomentum(snapshot)` → display model. No I/O, no React.
- Create: `components/ui/GoalMomentum.tsx` — presentational component (snapshot prop in, view out).
- Modify: `state/goalsSlice.ts` — write the computed snapshot through to `useMomentumStore` in `creditMarkToGoals` and `evaluateActiveGoalsMomentum`.
- Modify: `theme/tokens.ts` — add the `momentumAmber` color token (light + dark).
- Modify: `app/(tabs)/focus.tsx` — render `<GoalMomentum>` in each goal card header; populate the store on mount.
- Tests (new): `tests/unit/momentumSlice.test.ts`, `tests/unit/momentumPresenter.test.ts`, `tests/unit/goalMomentumComponent.test.tsx`; extend `tests/unit/momentumIntegration.test.ts`.

---

### Task 1: Momentum snapshot cache (store)

**Files:**
- Create: `state/momentumSlice.ts`
- Test: `tests/unit/momentumSlice.test.ts`

**Interfaces:**
- Produces: `useMomentumStore` with `snapshots: Record<string, MomentumSnapshot>`, `setSnapshot(goalId, snap)`, `clearSnapshot(goalId)`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/momentumSlice.test.ts
import { useMomentumStore } from '../../state/momentumSlice';
import type { MomentumSnapshot } from '../../lib/goalMomentum';

const snap = (over: Partial<MomentumSnapshot> = {}): MomentumSnapshot => ({
  state: 'on_track', days: 5, cushionRemaining: null, slippingMarkId: null, ...over,
});

beforeEach(() => useMomentumStore.setState({ snapshots: {} }));

describe('useMomentumStore', () => {
  it('sets and reads a snapshot by goalId', () => {
    useMomentumStore.getState().setSnapshot('g1', snap({ days: 7 }));
    expect(useMomentumStore.getState().snapshots['g1'].days).toBe(7);
  });
  it('overwrites the snapshot for the same goal', () => {
    useMomentumStore.getState().setSnapshot('g1', snap({ days: 1 }));
    useMomentumStore.getState().setSnapshot('g1', snap({ days: 2 }));
    expect(useMomentumStore.getState().snapshots['g1'].days).toBe(2);
  });
  it('clears a goal snapshot without touching others', () => {
    useMomentumStore.getState().setSnapshot('g1', snap());
    useMomentumStore.getState().setSnapshot('g2', snap());
    useMomentumStore.getState().clearSnapshot('g1');
    expect(useMomentumStore.getState().snapshots['g1']).toBeUndefined();
    expect(useMomentumStore.getState().snapshots['g2']).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/unit/momentumSlice.test.ts`
Expected: FAIL — "Cannot find module '../../state/momentumSlice'".

- [ ] **Step 3: Write minimal implementation**

```ts
// state/momentumSlice.ts
import { create } from 'zustand';
import type { MomentumSnapshot } from '../lib/goalMomentum';

interface MomentumState {
  /** Latest computed Momentum snapshot per goalId (in-memory cache; recomputed on log/foreground/mount). */
  snapshots: Record<string, MomentumSnapshot>;
  setSnapshot: (goalId: string, snap: MomentumSnapshot) => void;
  clearSnapshot: (goalId: string) => void;
}

export const useMomentumStore = create<MomentumState>((set) => ({
  snapshots: {},
  setSnapshot: (goalId, snap) =>
    set((s) => ({ snapshots: { ...s.snapshots, [goalId]: snap } })),
  clearSnapshot: (goalId) =>
    set((s) => {
      const next = { ...s.snapshots };
      delete next[goalId];
      return { snapshots: next };
    }),
}));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/unit/momentumSlice.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add state/momentumSlice.ts tests/unit/momentumSlice.test.ts
git commit -m "feat(momentum): per-goal snapshot cache store"
```

---

### Task 2: Snapshot presenter (pure display model)

**Files:**
- Create: `lib/momentumPresenter.ts`
- Test: `tests/unit/momentumPresenter.test.ts`

**Interfaces:**
- Consumes: `MomentumSnapshot` from `lib/goalMomentum`.
- Produces: `presentMomentum(snap: MomentumSnapshot | null): MomentumDisplay` where `MomentumDisplay = { visual: 'fresh'|'glow'|'neutral'|'gauge'; label: string; cushion: number | null }`. `cushion` is non-null only when `visual === 'gauge'`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/momentumPresenter.test.ts
import { presentMomentum } from '../../lib/momentumPresenter';
import type { MomentumSnapshot } from '../../lib/goalMomentum';

const snap = (over: Partial<MomentumSnapshot>): MomentumSnapshot => ({
  state: 'on_track', days: 5, cushionRemaining: null, slippingMarkId: null, ...over,
});

describe('presentMomentum', () => {
  it('fresh-start for null, zero days, or broken', () => {
    expect(presentMomentum(null)).toEqual({ visual: 'fresh', label: 'Fresh start', cushion: null });
    expect(presentMomentum(snap({ days: 0 }))).toEqual({ visual: 'fresh', label: 'Fresh start', cushion: null });
    expect(presentMomentum(snap({ state: 'broken', days: 0 }))).toEqual({ visual: 'fresh', label: 'Fresh start', cushion: null });
  });
  it('glow when on_track with a running count', () => {
    expect(presentMomentum(snap({ state: 'on_track', days: 12 }))).toEqual({ visual: 'glow', label: 'Momentum · 12 days', cushion: null });
  });
  it('neutral when resting', () => {
    expect(presentMomentum(snap({ state: 'resting', days: 4 }))).toEqual({ visual: 'neutral', label: 'Momentum · 4 days', cushion: null });
  });
  it('gauge with cushion when slipping', () => {
    expect(presentMomentum(snap({ state: 'slipping', days: 6, cushionRemaining: 0.5 }))).toEqual({ visual: 'gauge', label: 'Momentum · 6 days', cushion: 0.5 });
  });
  it('singular day', () => {
    expect(presentMomentum(snap({ state: 'on_track', days: 1 })).label).toBe('Momentum · 1 day');
  });
  it('slipping with null cushion falls back to 0 fill', () => {
    expect(presentMomentum(snap({ state: 'slipping', days: 3, cushionRemaining: null }))).toEqual({ visual: 'gauge', label: 'Momentum · 3 days', cushion: 0 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/unit/momentumPresenter.test.ts`
Expected: FAIL — "Cannot find module '../../lib/momentumPresenter'".

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/momentumPresenter.ts
// Pure mapping from a MomentumSnapshot to what the goal-card UI shows.
// No React, no I/O. The label's separator is the middle dot (U+00B7), not a dash.
import type { MomentumSnapshot } from './goalMomentum';

export type MomentumVisual = 'fresh' | 'glow' | 'neutral' | 'gauge';

export type MomentumDisplay = {
  visual: MomentumVisual;
  label: string;
  /** 0..1 cushion fill; non-null only when visual === 'gauge'. */
  cushion: number | null;
};

export function presentMomentum(snap: MomentumSnapshot | null): MomentumDisplay {
  if (!snap || snap.days <= 0 || snap.state === 'broken') {
    return { visual: 'fresh', label: 'Fresh start', cushion: null };
  }
  const label = `Momentum · ${snap.days} ${snap.days === 1 ? 'day' : 'days'}`;
  if (snap.state === 'slipping') {
    return { visual: 'gauge', label, cushion: snap.cushionRemaining ?? 0 };
  }
  if (snap.state === 'on_track') {
    return { visual: 'glow', label, cushion: null };
  }
  return { visual: 'neutral', label, cushion: null }; // resting
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/unit/momentumPresenter.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/momentumPresenter.ts tests/unit/momentumPresenter.test.ts
git commit -m "feat(momentum): pure snapshot presenter (visual state + label + cushion)"
```

---

### Task 3: Write snapshots through from the eval triggers

**Files:**
- Modify: `state/goalsSlice.ts` (`creditMarkToGoals`; `evaluateActiveGoalsMomentum`)
- Test: `tests/unit/momentumIntegration.test.ts` (extend)

**Interfaces:**
- Consumes: `useMomentumStore.setSnapshot` (Task 1).
- Produces: after `creditMarkToGoals(markId)` or `evaluateActiveGoalsMomentum()`, each evaluated active goal's snapshot is present in `useMomentumStore.getState().snapshots`.

- [ ] **Step 1: Write the failing test**

```ts
// add to tests/unit/momentumIntegration.test.ts
import { useMomentumStore } from '../../state/momentumSlice';

describe('eval triggers write through to the momentum store', () => {
  beforeEach(() => useMomentumStore.setState({ snapshots: {} }));

  test('creditMarkToGoals caches the active goal snapshot', async () => {
    const goal = await useGoalsStore.getState().createGoal({ title: 'Cache me', userId: USER, isPro: false });
    useMarksStore.setState({ marks: [seedMark('m1', TODAY)] } as any);
    await useGoalsStore.getState().linkMarkToGoal(goal.id, 'm1');

    await useGoalsStore.getState().creditMarkToGoals('m1');

    expect(useMomentumStore.getState().snapshots[goal.id]?.state).toBe('on_track');
    expect(useMomentumStore.getState().snapshots[goal.id]?.days).toBe(1);
  });

  test('evaluateActiveGoalsMomentum caches snapshots for active goals only', async () => {
    const active = await useGoalsStore.getState().createGoal({ title: 'A', userId: USER, isPro: false });
    const queued = await useGoalsStore.getState().createGoal({ title: 'Q', userId: USER, isPro: false });
    useMarksStore.setState({ marks: [seedMark('ma', TODAY), seedMark('mq', TODAY)] } as any);
    await useGoalsStore.getState().linkMarkToGoal(active.id, 'ma');
    await useGoalsStore.getState().linkMarkToGoal(queued.id, 'mq');

    await useGoalsStore.getState().evaluateActiveGoalsMomentum();

    expect(useMomentumStore.getState().snapshots[active.id]).toBeDefined();
    expect(useMomentumStore.getState().snapshots[queued.id]).toBeUndefined();
  });
});
```

> `seedMark`, `USER`, `TODAY` already exist at the top of `momentumIntegration.test.ts` (Task 1 of the 1.1 plan). Reuse them.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/unit/momentumIntegration.test.ts`
Expected: FAIL — `snapshots[goal.id]` is `undefined` (nothing writes through yet).

- [ ] **Step 3: Write minimal implementation**

Add the import to `state/goalsSlice.ts` (alongside the existing momentum imports):

```ts
import { useMomentumStore } from './momentumSlice';
```

In `creditMarkToGoals`, change the eval loop so it captures and caches each snapshot. The loop currently is:

```ts
    await Promise.all(
      toUpdate.map((g) => {
        const ids = new Set(g.linked_mark_ids ?? []);
        const goalMarks = allMarks
          .filter((m) => !m.deleted_at && ids.has(m.id))
          .map((m) => ({ id: m.id, weekly_target: m.weekly_target, last_activity_date: m.last_activity_date }));
        return evaluateGoalMomentum(g.id, goalMarks, today);
      }),
    );
```

Replace it with:

```ts
    await Promise.all(
      toUpdate.map(async (g) => {
        const ids = new Set(g.linked_mark_ids ?? []);
        const goalMarks = allMarks
          .filter((m) => !m.deleted_at && ids.has(m.id))
          .map((m) => ({ id: m.id, weekly_target: m.weekly_target, last_activity_date: m.last_activity_date }));
        const snap = await evaluateGoalMomentum(g.id, goalMarks, today);
        useMomentumStore.getState().setSnapshot(g.id, snap);
      }),
    );
```

In `evaluateActiveGoalsMomentum`, the loop currently is:

```ts
    for (const g of active) {
      const ids = new Set(g.linked_mark_ids ?? []);
      const goalMarks = allMarks
        .filter((m) => !m.deleted_at && ids.has(m.id))
        .map((m) => ({ id: m.id, weekly_target: m.weekly_target, last_activity_date: m.last_activity_date }));
      result.set(g.id, await evaluateGoalMomentum(g.id, goalMarks, today));
    }
```

Change the last line of the loop body to capture once and cache:

```ts
    for (const g of active) {
      const ids = new Set(g.linked_mark_ids ?? []);
      const goalMarks = allMarks
        .filter((m) => !m.deleted_at && ids.has(m.id))
        .map((m) => ({ id: m.id, weekly_target: m.weekly_target, last_activity_date: m.last_activity_date }));
      const snap = await evaluateGoalMomentum(g.id, goalMarks, today);
      result.set(g.id, snap);
      useMomentumStore.getState().setSnapshot(g.id, snap);
    }
```

> `momentumSlice` imports only a type from `goalMomentum`, so importing it into `goalsSlice` introduces no cycle. If type-check reports otherwise, lazy-require inside the functions.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/unit/momentumIntegration.test.ts`
Expected: PASS (existing + new describes).

- [ ] **Step 5: Commit**

```bash
git add state/goalsSlice.ts tests/unit/momentumIntegration.test.ts
git commit -m "feat(momentum): cache eval snapshots in the momentum store"
```

---

### Task 4: Add the momentumAmber color token

**Files:**
- Modify: `theme/tokens.ts` (light `colors` + dark `colorsDark` objects)

- [ ] **Step 1: Add the token to both palettes**

In `theme/tokens.ts`, add a `momentumAmber` key next to `danger` in BOTH the light and dark color objects (read the file to find the exact two objects `themedColors` resolves between). Use:
- Light: `momentumAmber: '#C8913F',` (muted honey amber; warm, not alarm-red)
- Dark: `momentumAmber: '#D8A658',` (slightly lighter so it reads on the dark surface)

Add a one-line comment above each: `// Momentum cushion gauge + on-it glow. Warm amber, deliberately NOT danger/alarm-red.`

- [ ] **Step 2: Verify the token resolves**

Run: `npm run type-check`
Expected: clean. (If `themedColors`'s return type is a keyed union, the key must exist in both objects — confirm both were edited.)

- [ ] **Step 3: Commit**

```bash
git add theme/tokens.ts
git commit -m "feat(momentum): add momentumAmber color token (light + dark)"
```

---

### Task 5: GoalMomentum component

**Files:**
- Create: `components/ui/GoalMomentum.tsx`
- Test: `tests/unit/goalMomentumComponent.test.tsx`

**Interfaces:**
- Consumes: `presentMomentum` (Task 2); `MomentumSnapshot` type; `momentumAmber` token (Task 4).
- Produces: `export function GoalMomentum({ snapshot }: { snapshot: MomentumSnapshot | null }): JSX.Element | null`. Pure/presentational. Renders nothing for `fresh` is NOT desired — it renders a quiet "Fresh start" line (so a new goal shows the affordance).

- [ ] **Step 1: Write the failing test**

```tsx
// tests/unit/goalMomentumComponent.test.tsx
import React from 'react';
import { render } from '@testing-library/react-native';

// Mirror the reanimated mock used by tests/unit/goalCompleteShare.test.tsx
jest.mock('react-native-reanimated', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: { View: (p: any) => React.createElement(View, p) },
    View: (p: any) => React.createElement(View, p),
    useSharedValue: (v: any) => ({ value: v }),
    useAnimatedStyle: (fn: any) => fn(),
    withTiming: (v: any) => v,
  };
});

import { GoalMomentum } from '../../components/ui/GoalMomentum';
import type { MomentumSnapshot } from '../../lib/goalMomentum';

const snap = (over: Partial<MomentumSnapshot>): MomentumSnapshot => ({
  state: 'on_track', days: 5, cushionRemaining: null, slippingMarkId: null, ...over,
});

describe('GoalMomentum', () => {
  it('shows Fresh start for a null snapshot', () => {
    const { getByText } = render(<GoalMomentum snapshot={null} />);
    expect(getByText('Fresh start')).toBeTruthy();
  });
  it('shows the day count when on track', () => {
    const { getByText } = render(<GoalMomentum snapshot={snap({ state: 'on_track', days: 12 })} />);
    expect(getByText('Momentum · 12 days')).toBeTruthy();
  });
  it('renders the cushion gauge only when slipping', () => {
    const slipping = render(<GoalMomentum snapshot={snap({ state: 'slipping', days: 6, cushionRemaining: 0.5 })} />);
    expect(slipping.getByTestId('momentum-cushion-gauge')).toBeTruthy();
    const onTrack = render(<GoalMomentum snapshot={snap({ state: 'on_track', days: 6 })} />);
    expect(onTrack.queryByTestId('momentum-cushion-gauge')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/unit/goalMomentumComponent.test.tsx`
Expected: FAIL — "Cannot find module '../../components/ui/GoalMomentum'".

- [ ] **Step 3: Write minimal implementation**

```tsx
// components/ui/GoalMomentum.tsx
// Per-goal Momentum display (spec §5 C+A hybrid): calm "Momentum · N days" with a
// warm glow when on it, neutral when resting, a fresh-start line at zero, and an
// amber cushion gauge ONLY when slipping. No flame, no countdown number.
import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';

import { fonts, fontSize, spacing } from '../../theme/tokens';
import { themedColors } from '../../theme/tokens';
import { useEffectiveTheme } from '../../state/uiSlice';
import { applyOpacity } from '../../src/components/icons/color';
import { presentMomentum } from '../../lib/momentumPresenter';
import type { MomentumSnapshot } from '../../lib/goalMomentum';

export function GoalMomentum({ snapshot }: { snapshot: MomentumSnapshot | null }) {
  const theme = useEffectiveTheme();
  const c = themedColors(theme);
  const d = presentMomentum(snapshot);

  const fill = useSharedValue(d.cushion ?? 0);
  useEffect(() => {
    fill.value = withTiming(d.cushion ?? 0, { duration: 350 });
  }, [d.cushion, fill]);
  const fillStyle = useAnimatedStyle(() => ({ width: `${Math.max(0, Math.min(1, fill.value)) * 100}%` }));

  const labelColor =
    d.visual === 'glow' ? c.momentumAmber
    : d.visual === 'fresh' ? c.inkMuted
    : c.inkMid;

  return (
    <View style={styles.wrap}>
      <View
        style={[
          styles.labelRow,
          d.visual === 'glow' && { backgroundColor: applyOpacity(c.momentumAmber, theme === 'dark' ? 0.16 : 0.12) },
        ]}
      >
        <Text style={[styles.label, { color: labelColor }]}>{d.label}</Text>
      </View>

      {d.visual === 'gauge' && (
        <View
          testID="momentum-cushion-gauge"
          style={[styles.track, { backgroundColor: applyOpacity(c.momentumAmber, theme === 'dark' ? 0.2 : 0.15) }]}
        >
          <Animated.View style={[styles.fill, { backgroundColor: c.momentumAmber }, fillStyle]} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: spacing.xs },
  labelRow: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  label: {
    fontFamily: fonts.sansMedium,
    fontSize: fontSize.sm,
  },
  track: {
    height: 4,
    borderRadius: 2,
    marginTop: spacing.xs,
    overflow: 'hidden',
  },
  fill: {
    height: 4,
    borderRadius: 2,
  },
});
```

> If `themedColors` does not expose `inkMid`, use the nearest existing neutral-ink token in the file (read `theme/tokens.ts` to confirm the key names: `inkDark`, `inkMid`, `inkMuted` are expected). Do not hardcode a hex.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/unit/goalMomentumComponent.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add components/ui/GoalMomentum.tsx tests/unit/goalMomentumComponent.test.tsx
git commit -m "feat(momentum): GoalMomentum component (calm count, glow, amber gauge)"
```

---

### Task 6: Render Momentum on the focus screen

**Files:**
- Modify: `app/(tabs)/focus.tsx`

**Interfaces:**
- Consumes: `useMomentumStore` (Task 1), `GoalMomentum` (Task 5), `useGoalsStore().evaluateActiveGoalsMomentum` (1.1).

- [ ] **Step 1: Add imports**

In `app/(tabs)/focus.tsx`, add:

```ts
import { useMomentumStore } from '../../state/momentumSlice';
import { GoalMomentum } from '../../components/ui/GoalMomentum';
```

- [ ] **Step 2: Subscribe to snapshots and populate on mount**

After the existing `const goals = useGoalsStore((s) => s.goals);` / `activeGoals` block (around `:87-91`), add a single store subscription (not inside any loop):

```ts
  const momentumSnapshots = useMomentumStore((s) => s.snapshots);
```

Add an effect that populates the cache when the screen mounts or the active-goal set changes (foreground already triggers this via `_layout.tsx`; this covers cold mount):

```ts
  useEffect(() => {
    if (activeGoals.length === 0) return;
    void useGoalsStore.getState().evaluateActiveGoalsMomentum();
  }, [activeGoals.length, todayStr]);
```

- [ ] **Step 3: Render the component in the goal card header**

In the goal card header `TouchableOpacity` (around `:405-416`), the title and meta currently render as two `Text` children. Render `<GoalMomentum>` directly under the header block, inside the goal card `<View>` but after the header `TouchableOpacity`. Locate this block:

```tsx
                  <TouchableOpacity
                    onPress={() => router.push(`/goal/${goal.id}` as any)}
                    activeOpacity={0.7}
                    style={styles.goalCardHeader}
                  >
                    <Text style={[styles.goalCardTitle, { color: c.inkDark }]} numberOfLines={1}>
                      {goal.title}
                    </Text>
                    <Text style={[styles.goalCardMeta, { color: c.inkMuted }]}>
                      {marks.length} mark{marks.length !== 1 ? 's' : ''}
                    </Text>
                  </TouchableOpacity>
```

Immediately AFTER the closing `</TouchableOpacity>` (still inside the goal card `<View key={goal.id} ...>`), insert:

```tsx
                  <View style={styles.momentumRow}>
                    <GoalMomentum snapshot={momentumSnapshots[goal.id] ?? null} />
                  </View>
```

- [ ] **Step 4: Add the row style**

In the `StyleSheet.create` block, add to the goal-cards section:

```ts
  momentumRow: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
```

- [ ] **Step 5: Verify build**

Run: `npm run type-check` and `npm run lint -- 'app/(tabs)/focus.tsx'`
Expected: clean (no new type errors; no unused-import or hooks lint errors in focus.tsx). The new `useEffect` must list `[activeGoals.length, todayStr]` exactly; `useEffect` is already imported in this file.

- [ ] **Step 6: Commit**

```bash
git add app/(tabs)/focus.tsx
git commit -m "feat(momentum): show Momentum on each goal card; populate on mount"
```

---

### Task 7: Full verification gate

**Files:** none (verification only)

- [ ] **Step 1: Full suite**

Run: `npm run test`
Expected: PASS, all suites green including `momentumSlice`, `momentumPresenter`, `goalMomentumComponent`, and the extended `momentumIntegration`. No existing suite regressed.

- [ ] **Step 2: Type-check**

Run: `npm run type-check`
Expected: no new errors.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: clean on all files changed in this plan (pre-existing backlog elsewhere acceptable).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore(momentum): representation passes suite, type-check, lint" --allow-empty
```

> Note: `git add -A` here is safe ONLY if no unrelated files are dirty. Before running it, `git status --short` and confirm only this plan's files appear; if unrelated pre-existing changes are present, stage explicitly instead.

---

## Self-review notes (spec §5 / §7.6 coverage)

- "Momentum · N days", calm by default → presenter + component (Tasks 2, 5).
- Warm glow when on it, neutral when resting → `visual: 'glow' | 'neutral'` (Tasks 2, 5).
- Cushion gauge from `cushionRemaining`, ONLY when slipping → Task 5 renders `testID="momentum-cushion-gauge"` only for `visual: 'gauge'`; fill animates via Reanimated.
- No flame / no countdown number / no heatmap → component renders only a label + a thin bar.
- Amber, never alarm-red → `momentumAmber` token (Task 4), never `danger`.
- Per active goal; un-goaled habits get none → rendered only inside goal cards (Task 6); the "Daily habits" section is untouched.
- Fresh start at zero / after break → `visual: 'fresh'`, "Fresh start" (Tasks 2, 5).

## Remaining subsystems (separate plans, per ROADMAP Phase 1)

- **1.3** At-risk in-app banner + 1+1 pre-scheduled local notification (consumes `slipping` + the cache).
- **1.4** Completion banking (bank `days` into the completion record in `completeGoal`).
- **1.5** Label copy in settings/notifications.

## Deferred minors carried from 1.1 final review (fold in when these files are touched)

`evaluateActiveGoalsMomentum` per-goal try/catch (Task 3 touches this function — a reviewer may ask to wrap the loop body); `seedBrokenMomentum` `assertDevToolsAccess` guard; rename `handleBrokenStreak`; `anyStreakAtRisk` JSDoc; orphaned toggle styles in `mark/new.tsx` + `mark/[id]/edit.tsx`.
