# Momentum Completion Banking (Phase 1.4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a goal completes, bank its current Momentum day-count into the completed goal record and surface "finished with N days of momentum" in the completion overlay and the share card; the newly-activated queued goal starts fresh at 0.

**Architecture:** Add an optional `banked_momentum_days` field to the `Goal` type (persisted automatically — goals are JSON-serialized in AsyncStorage, no migration). `completeGoal` in `state/goalsSlice.ts` reads the completing goal's cached `MomentumSnapshot.days` from `useMomentumStore`, writes it onto the completed record, and clears that goal's snapshot. A pure formatter in `lib/momentumPresenter.ts` renders the copy (with pluralization and the no-dash rule). Two presentational surfaces read it: `GoalCompletionOverlay` (from the completed goal in `goalCompletionStore`) and `GoalCompletionShareCard` (a new prop fed by `app/goal/complete.tsx`).

**Tech Stack:** React Native + Expo, Zustand, AsyncStorage, TypeScript 5.9 strict, Jest (`jest-expo`), `@testing-library/react-native`.

## Global Constraints

Every task's requirements implicitly include these:

- **Color tokens only** — never hardcode hex. (Exception: `GoalCompletionShareCard.tsx` deliberately uses fixed brand hex constants `CARD_BG`/`CARD_TEXT`/`CARD_MUTED`/`CARD_ACCENT` because it is a theme-independent share image; reuse those existing constants, do not add new hex.)
- **Copy voice** — no dashes (em, en, or hyphen-as-dash) in any user-facing string. Offer/celebration framing, never loss framing. "Momentum is per active goal only" (spec §7.4): a completed goal banks its days; a fresh goal starts at 0 framed as a fresh start, never a loss.
- **Pluralization** — "1 day of momentum" (singular), "N days of momentum" (plural). Never show the line when banked days is 0 or missing.
- **No new persistence layer** — `banked_momentum_days` rides the existing `upsertGoals` JSON write. `normalizeGoal` in `lib/db/goalsDb.ts` must not strip it.
- **Tests** live in `tests/unit/*.test.ts(x)`. Run with `npm run test`.
- **Commit discipline** — `git add` ONLY the files for the current task. NEVER `git add -A` or `git add .` (the repo carries unrelated uncommitted WIP in `app/(tabs)/settings.tsx`, `app/_layout.tsx`, `app/settings/appearance.tsx`, and `.semgrep/` — do not touch or stage those).

---

## File Structure

- `types/goal.ts` (modify) — add `banked_momentum_days?: number | null` to `Goal`.
- `state/goalsSlice.ts` (modify) — `completeGoal` banks days + clears the completed goal's snapshot.
- `lib/momentumPresenter.ts` (modify) — add pure `formatBankedMomentum(days)`.
- `components/overlays/GoalCompletionOverlay.tsx` (modify) — render the banked line under the divider.
- `components/GoalCompletionShareCard.tsx` (modify) — add `bankedMomentumDays?` prop + meta line.
- `app/goal/complete.tsx` (modify) — pass `bankedMomentumDays` from the completed goal into the share card.

---

## Task 1: Bank Momentum days onto the completed goal

**Files:**
- Modify: `types/goal.ts` (add field after `milestones_fired`)
- Modify: `state/goalsSlice.ts` (`completeGoal`, around lines 172-208)
- Test: `tests/unit/goalCompletionBanking.test.ts`

**Interfaces:**
- Consumes: `useMomentumStore` (`state/momentumSlice` — `getState().snapshots[goalId]?.days`, `getState().clearSnapshot(goalId)`); `MomentumSnapshot` (`lib/goalMomentum`).
- Produces: `Goal.banked_momentum_days?: number | null` — the day-count banked at completion; read by Tasks 2 and 3.

**Semantics (LOCKED):** On completion, `banked_momentum_days = Math.max(0, snapshot.days)` where `snapshot` is the completing goal's cached snapshot, or `0` when no snapshot exists. Then clear that goal's snapshot (it is no longer active). The newly-activated queued goal is untouched: it has no snapshot and no banked field, so it starts at 0 by construction (a queued goal never had Momentum evaluated).

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/goalCompletionBanking.test.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useGoalsStore } from '../../state/goalsSlice';
import { useMomentumStore } from '../../state/momentumSlice';
import type { MomentumSnapshot } from '../../lib/goalMomentum';

const USER = 'u-bank';

const snap = (days: number): MomentumSnapshot => ({
  state: 'on_track',
  days,
  cushionRemaining: null,
  slippingMarkId: null,
});

async function reset() {
  await AsyncStorage.clear();
  useGoalsStore.setState({ goals: [], isLoading: false, error: null } as any);
  useMomentumStore.setState({ snapshots: {} } as any);
}
beforeEach(reset);

describe('completeGoal banks Momentum days', () => {
  test('banks the cached snapshot day-count onto the completed goal', async () => {
    const goal = await useGoalsStore.getState().createGoal({ title: 'Run daily', userId: USER, isPro: false });
    useMomentumStore.getState().setSnapshot(goal.id, snap(12));

    await useGoalsStore.getState().completeGoal(goal.id);

    const done = useGoalsStore.getState().goals.find((g) => g.id === goal.id);
    expect(done?.status).toBe('completed');
    expect(done?.banked_momentum_days).toBe(12);
  });

  test('banks 0 when the goal has no cached snapshot', async () => {
    const goal = await useGoalsStore.getState().createGoal({ title: 'No momentum', userId: USER, isPro: false });

    await useGoalsStore.getState().completeGoal(goal.id);

    const done = useGoalsStore.getState().goals.find((g) => g.id === goal.id);
    expect(done?.banked_momentum_days).toBe(0);
  });

  test('clears the completed goal snapshot', async () => {
    const goal = await useGoalsStore.getState().createGoal({ title: 'Clear me', userId: USER, isPro: false });
    useMomentumStore.getState().setSnapshot(goal.id, snap(5));

    await useGoalsStore.getState().completeGoal(goal.id);

    expect(useMomentumStore.getState().snapshots[goal.id]).toBeUndefined();
  });

  test('newly-activated queued goal starts with no banked days', async () => {
    const active = await useGoalsStore.getState().createGoal({ title: 'First', userId: USER, isPro: false });
    const queued = await useGoalsStore.getState().createGoal({ title: 'Second', userId: USER, isPro: false });
    useMomentumStore.getState().setSnapshot(active.id, snap(8));

    await useGoalsStore.getState().completeGoal(active.id);

    const promoted = useGoalsStore.getState().goals.find((g) => g.id === queued.id);
    expect(promoted?.status).toBe('active');
    expect(promoted?.banked_momentum_days ?? undefined).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- goalCompletionBanking`
Expected: FAIL (`banked_momentum_days` is not set / undefined).

- [ ] **Step 3: Add the field to the Goal type**

In `types/goal.ts`, after the `milestones_fired?: string[];` line (line 24), add:
```typescript
  /** Momentum day-count banked at completion (Phase 1.4). Set only on completed goals. */
  banked_momentum_days?: number | null;
```

- [ ] **Step 4: Bank the days in `completeGoal`**

In `state/goalsSlice.ts`, the file already imports `useMomentumStore` (line 18). Change the `completed` construction in `completeGoal` (line 178) from:
```typescript
    const completed: Goal = { ...completing, status: 'completed', completed_at: now, updated_at: now };
```
to:
```typescript
    const bankedDays = Math.max(0, useMomentumStore.getState().snapshots[id]?.days ?? 0);
    const completed: Goal = {
      ...completing,
      status: 'completed',
      completed_at: now,
      updated_at: now,
      banked_momentum_days: bankedDays,
    };
```

Then add the snapshot clear as the LAST statement of `completeGoal`, immediately after the existing
store-update call. Match this exact existing block and append the clear line after it:
```typescript
    set(s => ({
      goals: s.goals.map(g => {
        if (g.id === completed.id) return completed;
        if (activated && g.id === activated.id) return activated;
        return g;
      }),
    }));
    useMomentumStore.getState().clearSnapshot(id);
```
(`id` is the `completeGoal` parameter — already in scope.)

- [ ] **Step 5: Guard the field through `normalizeGoal`**

Confirm `lib/db/goalsDb.ts` `normalizeGoal` spreads `...g` first (it does, line 22) — `banked_momentum_days` is preserved automatically. No edit needed; this step is a read-only verification (open the file, confirm the spread). Do not add the field to `normalizeGoal`'s defaults (it should stay absent on goals that never completed).

- [ ] **Step 6: Run test to verify it passes**

Run: `npm run test -- goalCompletionBanking`
Expected: PASS (4 tests).

- [ ] **Step 7: Type-check and commit**

Run: `npm run type-check`
Expected: no new errors.

```bash
git add types/goal.ts state/goalsSlice.ts tests/unit/goalCompletionBanking.test.ts
git commit -m "feat(momentum): bank Momentum days onto completed goal (Phase 1.4)"
```

---

## Task 2: Pure banked-momentum copy formatter

**Files:**
- Modify: `lib/momentumPresenter.ts` (append `formatBankedMomentum`)
- Test: `tests/unit/bankedMomentumCopy.test.ts`

**Interfaces:**
- Produces: `export function formatBankedMomentum(days: number | null | undefined): string | null` — returns `null` when days is null/undefined/≤0, else `"Finished with 1 day of momentum"` / `"Finished with N days of momentum"`.
- Consumed by: Task 3 (overlay + share card both call it).

**Semantics (LOCKED):** Null for `0`, negative, `null`, or `undefined` (no line shown). Singular at exactly 1. No dashes.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/bankedMomentumCopy.test.ts
import { formatBankedMomentum } from '../../lib/momentumPresenter';

const NO_DASH = /[—–]|(?:^|\s)-(?:\s|$)/;

describe('formatBankedMomentum', () => {
  it('returns null for 0, negative, null, undefined', () => {
    expect(formatBankedMomentum(0)).toBeNull();
    expect(formatBankedMomentum(-3)).toBeNull();
    expect(formatBankedMomentum(null)).toBeNull();
    expect(formatBankedMomentum(undefined)).toBeNull();
  });

  it('singular at 1 day', () => {
    expect(formatBankedMomentum(1)).toBe('Finished with 1 day of momentum');
  });

  it('plural for >1', () => {
    expect(formatBankedMomentum(14)).toBe('Finished with 14 days of momentum');
  });

  it('no dashes in output', () => {
    for (const d of [1, 2, 7, 30, 365]) {
      expect(formatBankedMomentum(d)!).not.toMatch(NO_DASH);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- bankedMomentumCopy`
Expected: FAIL (`formatBankedMomentum` not exported).

- [ ] **Step 3: Implement the formatter**

Append to `lib/momentumPresenter.ts`:
```typescript
/**
 * Celebration line for Momentum banked at goal completion (Phase 1.4).
 * Null when there is nothing to celebrate (0 / missing). No dashes; pluralized.
 */
export function formatBankedMomentum(days: number | null | undefined): string | null {
  if (days == null || days <= 0) return null;
  return `Finished with ${days} ${days === 1 ? 'day' : 'days'} of momentum`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- bankedMomentumCopy`
Expected: PASS (4 tests).

- [ ] **Step 5: Type-check and commit**

Run: `npm run type-check`
Expected: no new errors.

```bash
git add lib/momentumPresenter.ts tests/unit/bankedMomentumCopy.test.ts
git commit -m "feat(momentum): pure banked-momentum completion copy (Phase 1.4)"
```

---

## Task 3: Surface the banked line in the completion overlay

**Files:**
- Modify: `components/overlays/GoalCompletionOverlay.tsx`
- Test: `tests/unit/goalCompletionOverlayBanked.test.tsx`

**Interfaces:**
- Consumes: `completedGoal.banked_momentum_days` (Task 1); `formatBankedMomentum` (Task 2).

**Visual:** A calm line under the existing divider, in the same muted ink as the completion copy, shown only when `formatBankedMomentum` returns non-null. No new color, no dashes.

> **Test harness note (do not skip):** The repo has NO global mocks for reanimated, gesture-handler,
> haptics, or safe-area-context — every component test that mounts them mocks them inline (see
> `tests/unit/goalCompleteShare.test.tsx`). `GoalCompletionOverlay` uses ALL FOUR. The mock header
> below is mandatory, in this order, BEFORE importing the component. Critically, the overlay calls
> `Haptics.notificationAsync(...).catch(...)`, so the haptics mock MUST return a resolved promise
> (`mockResolvedValue(undefined)`) — a bare `jest.fn()` returns `undefined` and `.catch` throws.

- [ ] **Step 1: Write the failing test**

```tsx
// tests/unit/goalCompletionOverlayBanked.test.tsx
import React from 'react';
import { render } from '@testing-library/react-native';

// ── Native-module mocks (must precede the component import) ──────────────────
jest.mock('../../state/uiSlice', () => ({ useEffectiveTheme: () => 'light' }));

jest.mock('expo-haptics', () => ({
  // .catch() is called on the result, so this MUST resolve a promise.
  notificationAsync: jest.fn().mockResolvedValue(undefined),
  NotificationFeedbackType: { Success: 'success' },
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('react-native-gesture-handler', () => {
  const React = require('react');
  const { View } = require('react-native');
  const chain = () => {
    const g: any = {};
    g.onUpdate = () => g;
    g.onEnd = () => g;
    return g;
  };
  return {
    GestureDetector: ({ children }: any) => React.createElement(View, null, children),
    GestureHandlerRootView: ({ children }: any) => React.createElement(View, null, children),
    Gesture: { Pan: () => chain() },
  };
});

jest.mock('react-native-reanimated', () => {
  const React = require('react');
  const { View, Text } = require('react-native');
  const Animated = {
    View: (props: any) => React.createElement(View, props),
    Text: (props: any) => React.createElement(Text, props),
    createAnimatedComponent: (C: any) => C,
  };
  return {
    __esModule: true,
    default: Animated,
    ...Animated,
    useSharedValue: (v: any) => ({ value: v }),
    useAnimatedStyle: () => ({}),
    withSpring: (v: any) => v,
    withTiming: (v: any) => v,
    withDelay: (_: any, v: any) => v,
    runOnJS: (fn: any) => fn,
  };
});

import { GoalCompletionOverlay } from '../../components/overlays/GoalCompletionOverlay';
import { useGoalCompletionStore } from '../../state/goalCompletionStore';
import { useGoalsStore } from '../../state/goalsSlice';
import type { Goal } from '../../types/goal';

const makeGoal = (o: Partial<Goal>): Goal => ({
  id: 'g1', user_id: 'u1', title: 'Run a 5k', status: 'completed', sort_index: 0,
  current_mark_count: 0, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
  ...o,
});

describe('GoalCompletionOverlay banked momentum line', () => {
  beforeEach(() => {
    useGoalsStore.setState({ goals: [] } as any);
  });

  it('shows the banked line when days > 0', () => {
    const goal = makeGoal({ banked_momentum_days: 9 });
    useGoalCompletionStore.setState({ completedGoal: goal, show: true } as any);
    const { getByText } = render(<GoalCompletionOverlay />);
    expect(getByText('Finished with 9 days of momentum')).toBeTruthy();
  });

  it('shows nothing extra when banked is 0', () => {
    const goal = makeGoal({ banked_momentum_days: 0 });
    useGoalCompletionStore.setState({ completedGoal: goal, show: true } as any);
    const { queryByText } = render(<GoalCompletionOverlay />);
    expect(queryByText(/days of momentum/)).toBeNull();
    expect(queryByText(/day of momentum/)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- goalCompletionOverlayBanked`
Expected: FAIL (banked line text not found).

- [ ] **Step 3: Implement**

In `components/overlays/GoalCompletionOverlay.tsx`:

1. Add the import after the `useGoalsStore` import (line 27):
```typescript
import { formatBankedMomentum } from '../../lib/momentumPresenter';
```

2. Compute the line after `completedGoal`/`goals` are read (after line 60). Add inside the component body, before `nextGoal`:
```typescript
  const bankedLine = completedGoal ? formatBankedMomentum(completedGoal.banked_momentum_days) : null;
```

3. Render it directly after the existing completion-copy `AnimatedElement` (the block that ends at line 143, containing "Done. That one's yours forever."). Insert:
```tsx
          {bankedLine && (
            <AnimatedElement delay={925}>
              <Text style={[styles.bankedLine, { color: c.inkMuted }]}>{bankedLine}</Text>
            </AnimatedElement>
          )}
```

4. Add the style to the `StyleSheet.create` block (after the `completionCopy` style, line 202):
```typescript
  bankedLine: {
    fontFamily: fonts.sans,
    fontSize: fontSize[13],
    textAlign: 'center',
    marginTop: spacing.sm,
  },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- goalCompletionOverlayBanked`
Expected: PASS (2 tests).

- [ ] **Step 5: Type-check and commit**

Run: `npm run type-check`
Expected: no new errors.

```bash
git add components/overlays/GoalCompletionOverlay.tsx tests/unit/goalCompletionOverlayBanked.test.tsx
git commit -m "feat(momentum): banked line on completion overlay (Phase 1.4)"
```

---

## Task 4: Add the banked line to the share card

**Files:**
- Modify: `components/GoalCompletionShareCard.tsx` (new optional prop + meta line)
- Modify: `app/goal/complete.tsx` (pass the prop from the completed goal)
- Test: `tests/unit/shareCardBanked.test.tsx`

**Interfaces:**
- Consumes: `formatBankedMomentum` (Task 2); `completedGoal.banked_momentum_days` (Task 1).
- Produces: `GoalCompletionShareCardProps.bankedMomentumDays?: number | null`.

**Visual:** One more `metaText` line in the existing `metaRow`, using the muted card color (`CARD_MUTED`, already defined). Shown only when `formatBankedMomentum` returns non-null.

> **Test harness note:** `GoalCompletionShareCard` is a plain `View`/`Text` component (no reanimated,
> gesture-handler, haptics, or safe-area). It renders under `@testing-library/react-native` with NO
> mocks. Do not add native-module mocks here.

- [ ] **Step 1: Write the failing test**

```tsx
// tests/unit/shareCardBanked.test.tsx
import React from 'react';
import { render } from '@testing-library/react-native';
import { GoalCompletionShareCard } from '../../components/GoalCompletionShareCard';

describe('GoalCompletionShareCard banked momentum', () => {
  const base = {
    goalTitle: 'Run a 5k',
    completedDate: '2026-06-20',
    levelTitle: 'Steady',
    daysTaken: 30,
  };

  it('renders the banked momentum line when days > 0', () => {
    const { getByText } = render(<GoalCompletionShareCard {...base} bankedMomentumDays={9} />);
    expect(getByText('Finished with 9 days of momentum')).toBeTruthy();
  });

  it('omits the line when bankedMomentumDays is 0 or missing', () => {
    const { queryByText } = render(<GoalCompletionShareCard {...base} bankedMomentumDays={0} />);
    expect(queryByText(/of momentum/)).toBeNull();
    const { queryByText: q2 } = render(<GoalCompletionShareCard {...base} />);
    expect(q2(/of momentum/)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- shareCardBanked`
Expected: FAIL (line not rendered / prop unknown).

- [ ] **Step 3: Add the prop + line to the share card**

In `components/GoalCompletionShareCard.tsx`:

1. Add the import after line 3:
```typescript
import { formatBankedMomentum } from '../lib/momentumPresenter';
```

2. Add to `GoalCompletionShareCardProps` (after `targetDateLabel?` on line 28):
```typescript
  bankedMomentumDays?: number | null; // Momentum banked at completion (Phase 1.4)
```

3. Destructure it in the component signature (add after `targetDateLabel,` on line 37):
```typescript
  bankedMomentumDays,
```

4. Compute the line after `const displayDate = ...` (line 40):
```typescript
  const bankedLine = formatBankedMomentum(bankedMomentumDays);
```

5. Add the line inside `metaRow`, after the `targetDateLabel` conditional (after line 70):
```tsx
          {bankedLine != null ? (
            <Text style={styles.metaText}>{bankedLine}</Text>
          ) : null}
```

- [ ] **Step 4: Pass the prop from the completion screen**

In `app/goal/complete.tsx`, the `completedGoal` is already derived (line 51). Pass the field into the off-screen share card (the `<GoalCompletionShareCard ... />` block at lines 211-218). Add this prop after `targetDateLabel={targetDateLabel}`:
```tsx
          bankedMomentumDays={completedGoal?.banked_momentum_days}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test -- shareCardBanked`
Expected: PASS (2 tests).

- [ ] **Step 6: Type-check and commit**

Run: `npm run type-check`
Expected: no new errors.

```bash
git add components/GoalCompletionShareCard.tsx app/goal/complete.tsx tests/unit/shareCardBanked.test.tsx
git commit -m "feat(momentum): banked momentum line on share card (Phase 1.4)"
```

---

## Task 5: Verification gate

**Files:** none (verification only).

- [ ] **Step 1: Full unit suite**

Run: `npm run test`
Expected: all suites green (no regressions; new banking/overlay/share-card/copy tests pass).

- [ ] **Step 2: Type-check**

Run: `npm run type-check`
Expected: no new errors.

- [ ] **Step 3: Lint the changed files**

Run: `npm run lint`
Expected: no new violations on `types/goal.ts`, `state/goalsSlice.ts`, `lib/momentumPresenter.ts`, `components/overlays/GoalCompletionOverlay.tsx`, `components/GoalCompletionShareCard.tsx`, `app/goal/complete.tsx`. (The repo has a known pre-existing `react-hooks` backlog; do not introduce new ones.)

- [ ] **Step 4: Confirm the existing share screen still renders**

Run: `npm run test -- goalCompleteShare`
Expected: existing `goalCompleteShare.test.tsx` still PASS (the new prop is optional; the mock that stubs `GoalCompletionShareCard` is unaffected).

- [ ] **Step 5: Check off 1.4 in ROADMAP.md and close its callout**

Edit `ROADMAP.md` — change the `- [ ] **1.4 — Completion banking**` line to `- [x]` with a DONE note. Stage only `ROADMAP.md`:
```bash
git add ROADMAP.md
git commit -m "docs(momentum): close out Phase 1.4 (completion banking)"
```

---

## Self-Review

**Spec coverage (§7.4):**
- "Momentum banked into its completion record" → Task 1 (`banked_momentum_days` on the completed goal).
- "history, and an optional share-card line" → Task 4 (share card line).
- "folded into the celebration" → Task 3 (overlay line).
- "newly-active queued goal starts at 0, framed as a fresh start, never a loss" → Task 1 (promoted goal untouched; no banked field; verified by test) — no loss copy anywhere.
- "Momentum is per active goal only; abandoned/deleted drops with no guilt" → Task 1 clears the completed goal's snapshot; delete/abandon paths already drop momentum (out of scope, unchanged).

**Placeholder scan:** No TBD/TODO; every code step shows full code; every test shows full assertions.

**Type consistency:** `banked_momentum_days?: number | null` (Task 1) is read by Task 3 (`completedGoal.banked_momentum_days`) and Task 4 (`bankedMomentumDays` prop). `formatBankedMomentum(days: number | null | undefined): string | null` (Task 2) is called identically in Tasks 3 and 4. Names consistent across tasks.

**Out of scope (correctly excluded):** Phase 1.5 settings label; Phase 2.2 share-card free/paid rework (this task only adds one optional line to the existing card, no gating change).
