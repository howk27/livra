# Momentum Integration (eval wiring + streak-machinery transform) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the (already-built, already-merged) Momentum engine actually run — evaluate it on every linked log and on app foreground, persist per-goal records — then transform the legacy streak machinery so Momentum is the one sanctioned run concept.

**Architecture:** The pure engine (`lib/goalMomentum.ts`) and thin store (`lib/goalMomentumStore.ts`) already exist on this branch (merged from PR #1). This plan adds the **app-layer wiring** the Phase 1.0 decision settled: (1) call `evaluateGoalMomentum` inside `state/goalsSlice.ts → creditMarkToGoals` on every linked log — this is what *starts/continues* a run because it fires the same day as the log; (2) re-evaluate active goals on app foreground via a new `evaluateActiveGoalsMomentum` store method called from `app/_layout.tsx` — this catches `slipping`/`broken` decay when no log happens. A read-only `activeGoalMomentumSnapshot` helper lets `services/behaviorNotifications.ts` derive `anyStreakAtRisk` from real Momentum state instead of per-mark streak heuristics. The remaining tasks are mechanical: remove the user-facing "Enable streak" toggle, stop defaulting `enable_streak: true`, convert the diagnostics seed, and fix the privacy-policy wording.

**Tech Stack:** TypeScript (strict), Jest (`jest-expo`), Zustand, `@react-native-async-storage/async-storage` (auto-mocked in tests), `date-fns` via `lib/date.ts`, expo-router, expo-notifications.

## Global Constraints

- **Naming:** new Momentum code uses the `goalMomentum` prefix; never touch the legacy per-mark `lib/momentum.ts`.
- **Engine is frozen:** do not edit `lib/goalMomentum.ts` or `lib/goalMomentumStore.ts`'s existing exports/semantics. The Phase 1.0 decision is *no engine change*. New helpers may be **added** to `lib/goalMomentumStore.ts` only.
- **Transform, not strip (spec §6):** keep the `enable_streak` DB column, sync, supabase types, seed-data writers, badges, weekly-review, and per-mark streak *display* code intact. They become dormant (gated off) because all new marks default `enable_streak: false`. Existing data is wiped at launch, so no old/new reconciliation is needed.
- **Copy rule (PRODUCT.md):** no dashes (em, en, or hyphen-as-dash) in any user-facing string.
- **`today` is always `yyyyMmDd(new Date())`** at the app boundary; pure engine functions receive it as an explicit `'YYYY-MM-DD'` argument.
- **Per active goal only (spec §2/§7.4):** evaluate goals with `status === 'active'`; never `queued`.
- **Source spec:** `docs/superpowers/specs/2026-06-17-momentum-design.md` (§6 transform list). **Cadence decision:** `docs/superpowers/specs/2026-06-19-momentum-eval-cadence.md`.

---

## File Structure

- Modify: `state/goalsSlice.ts` — wire `evaluateGoalMomentum` into `creditMarkToGoals` (trigger 1); add `evaluateActiveGoalsMomentum` method (trigger 2 source).
- Modify: `lib/goalMomentumStore.ts` — **add** read-only `activeGoalMomentumSnapshot` helper (no new persistence semantics).
- Modify: `app/_layout.tsx` — call `evaluateActiveGoalsMomentum` in the foreground (`AppState 'active'`) handler.
- Modify: `services/behaviorNotifications.ts` — derive `anyStreakAtRisk` in `computeDayProgress` from the active goal's Momentum snapshot.
- Modify: `app/mark/new.tsx`, `app/mark/[id]/edit.tsx`, `hooks/useCounters.ts` — remove the "Enable streak" toggle; default `enable_streak: false`.
- Modify: `app/onboarding.tsx`, `app/goal/new.tsx` — stop defaulting `enable_streak: true`.
- Modify: `app/diagnostics.tsx`, `lib/db/devTools.ts` — convert "Simulate Streak Loss" to a Momentum-broken seed.
- Modify: `app/legal/privacy-policy.tsx` — "streak data" wording.
- Test (new): `tests/unit/momentumIntegration.test.ts` — covers Tasks 1, 2, 3.

---

### Task 1: Evaluate Momentum on every linked log (trigger 1)

**Files:**
- Modify: `state/goalsSlice.ts` (imports near top; `creditMarkToGoals` at `:239-265`)
- Test: `tests/unit/momentumIntegration.test.ts` (new)

**Interfaces:**
- Consumes: `evaluateGoalMomentum(goalId: string, marks: { id: string; weekly_target?: number | null; last_activity_date?: string | null }[], today?: string): Promise<MomentumSnapshot>` and `loadMomentumRecord(goalId: string): Promise<MomentumRecord | null>` from `lib/goalMomentumStore`; `yyyyMmDd` from `lib/date`; `useMarksStore` from `state/countersSlice`.
- Produces: after `creditMarkToGoals(markId)`, every credited `status==='active'` goal has a persisted `MomentumRecord` (started/continued for `today`).

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/momentumIntegration.test.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useGoalsStore } from '../../state/goalsSlice';
import { useMarksStore } from '../../state/countersSlice';
import { loadMomentumRecord } from '../../lib/goalMomentumStore';
import { yyyyMmDd } from '../../lib/date';

const USER = 'u-mom';
const TODAY = yyyyMmDd(new Date());

async function reset() {
  await AsyncStorage.clear();
  useGoalsStore.setState({ goals: [], isLoading: false, error: null });
  useMarksStore.setState({ marks: [] } as any);
}
beforeEach(reset);

// Minimal Mark shape the engine reads (id, weekly_target, last_activity_date).
const seedMark = (id: string, last: string | undefined) =>
  ({ id, user_id: USER, name: id, weekly_target: 7, last_activity_date: last, enable_streak: false }) as any;

describe('creditMarkToGoals starts a Momentum run on log (trigger 1)', () => {
  test('logging a mark on the active goal persists a started record', async () => {
    const goal = await useGoalsStore.getState().createGoal({ title: 'Run daily', userId: USER, isPro: false });
    const markId = 'm1';
    useMarksStore.setState({ marks: [seedMark(markId, TODAY)] } as any);
    await useGoalsStore.getState().linkMarkToGoal(goal.id, markId);

    await useGoalsStore.getState().creditMarkToGoals(markId);

    const rec = await loadMomentumRecord(goal.id);
    expect(rec).toEqual({ goalId: goal.id, startDate: TODAY });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (via subagent, npm is available): `npm run test -- tests/unit/momentumIntegration.test.ts`
Expected: FAIL — `loadMomentumRecord` returns `null` (no record persisted yet; nothing calls `evaluateGoalMomentum`).

- [ ] **Step 3: Write minimal implementation**

Add imports at the top of `state/goalsSlice.ts` (after the existing imports, around `:25`):

```ts
import { evaluateGoalMomentum } from '../lib/goalMomentumStore';
import { yyyyMmDd } from '../lib/date';
import { useMarksStore } from './countersSlice';
```

In `creditMarkToGoals`, insert the Momentum evaluation **after** the `set(...)` that writes credited goals and **before** the completion check. The block currently reads:

```ts
    await upsertGoals(toUpdate);
    const map = new Map(toUpdate.map(g => [g.id, g]));
    set(s => ({ goals: s.goals.map(g => map.get(g.id) ?? g) }));

    // Check completion for each updated goal
    await Promise.all(toUpdate.map(g => get().checkGoalCompletion(g.id)));
```

Insert between the `set(...)` line and the `// Check completion` comment:

```ts
    // Momentum (trigger 1): evaluate each credited active goal on this log.
    // Same-day eval is what *starts* the run (on_track) and continues it.
    const today = yyyyMmDd(new Date());
    const allMarks = useMarksStore.getState().marks;
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

> If `npm run type-check` reports a circular import between `goalsSlice` and `countersSlice`, replace the top-level `useMarksStore` import with a lazy `const { useMarksStore } = require('./countersSlice');` inside `creditMarkToGoals`. (`countersSlice` does not import `goalsSlice`, so a cycle is unlikely.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/unit/momentumIntegration.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add state/goalsSlice.ts tests/unit/momentumIntegration.test.ts
git commit -m "feat(momentum): evaluate on every linked log (trigger 1, starts the run)"
```

---

### Task 2: Evaluate active goals on app foreground (trigger 2)

**Files:**
- Modify: `state/goalsSlice.ts` (`GoalsState` interface near `:58`; implementation in the store object)
- Modify: `app/_layout.tsx` (`onAppState` active block at `:237-243`)
- Test: `tests/unit/momentumIntegration.test.ts`

**Interfaces:**
- Produces: `evaluateActiveGoalsMomentum: () => Promise<Map<string, MomentumSnapshot>>` on `useGoalsStore`. Persists/refreshes a record for every `status==='active'` goal; returns each goal's fresh snapshot. Queued goals are untouched.

- [ ] **Step 1: Write the failing test**

```ts
// add to tests/unit/momentumIntegration.test.ts
describe('evaluateActiveGoalsMomentum (trigger 2)', () => {
  test('evaluates active goals, leaves queued goals untouched', async () => {
    const active = await useGoalsStore.getState().createGoal({ title: 'Active', userId: USER, isPro: false });
    const queued = await useGoalsStore.getState().createGoal({ title: 'Queued', userId: USER, isPro: false });
    // createGoal makes the 1st active and the 2nd queued (free cap).
    useMarksStore.setState({ marks: [seedMark('ma', TODAY), seedMark('mq', TODAY)] } as any);
    await useGoalsStore.getState().linkMarkToGoal(active.id, 'ma');
    await useGoalsStore.getState().linkMarkToGoal(queued.id, 'mq');

    const snaps = await useGoalsStore.getState().evaluateActiveGoalsMomentum();

    expect(snaps.get(active.id)?.state).toBe('on_track');
    expect(snaps.has(queued.id)).toBe(false);
    expect(await loadMomentumRecord(active.id)).toEqual({ goalId: active.id, startDate: TODAY });
    expect(await loadMomentumRecord(queued.id)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/unit/momentumIntegration.test.ts`
Expected: FAIL — `evaluateActiveGoalsMomentum is not a function`.

- [ ] **Step 3: Write minimal implementation**

Add the type import to `state/goalsSlice.ts` (extend the `goalMomentumStore` import or add alongside it):

```ts
import type { MomentumSnapshot } from '../lib/goalMomentum';
```

Add to the `GoalsState` interface (next to `checkAllGoalExpiry` around `:58`):

```ts
  /** Re-evaluates Momentum for every active goal (trigger 2 — decay). Returns each goal's snapshot. Call on app foreground. */
  evaluateActiveGoalsMomentum: () => Promise<Map<string, MomentumSnapshot>>;
```

Add the implementation to the store object (place it next to `checkAllGoalExpiry`):

```ts
  evaluateActiveGoalsMomentum: async () => {
    const today = yyyyMmDd(new Date());
    const active = get().goals.filter((g) => g.status === 'active');
    const allMarks = useMarksStore.getState().marks;
    const result = new Map<string, MomentumSnapshot>();
    for (const g of active) {
      const ids = new Set(g.linked_mark_ids ?? []);
      const goalMarks = allMarks
        .filter((m) => !m.deleted_at && ids.has(m.id))
        .map((m) => ({ id: m.id, weekly_target: m.weekly_target, last_activity_date: m.last_activity_date }));
      result.set(g.id, await evaluateGoalMomentum(g.id, goalMarks, today));
    }
    return result;
  },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/unit/momentumIntegration.test.ts`
Expected: PASS (both Task 1 and Task 2 describes).

- [ ] **Step 5: Wire it into the foreground handler**

In `app/_layout.tsx`, the `onAppState` active block at `:237-243` ends with `useGoalsStore.getState().checkAllGoalExpiry();`. Add directly below it:

```ts
        void useGoalsStore.getState().evaluateActiveGoalsMomentum();
```

(`useGoalsStore` is already imported and used in this block.)

- [ ] **Step 6: Commit**

```bash
git add state/goalsSlice.ts app/_layout.tsx tests/unit/momentumIntegration.test.ts
git commit -m "feat(momentum): re-evaluate active goals on foreground (trigger 2, decay)"
```

---

### Task 3: Read-only active-goal snapshot helper

**Files:**
- Modify: `lib/goalMomentumStore.ts` (add one exported function; do not change existing ones)
- Test: `tests/unit/momentumIntegration.test.ts`

**Interfaces:**
- Produces: `activeGoalMomentumSnapshot(activeGoal: { id: string; linked_mark_ids?: string[] } | null | undefined, allMarks: MarkMomentumInput[], today?: string): Promise<MomentumSnapshot | null>` — filters `allMarks` to the goal's linked marks, loads the persisted record, returns the snapshot. **Read-only** (does not persist). Returns `null` when `activeGoal` is null/undefined.

- [ ] **Step 1: Write the failing test**

```ts
// add to tests/unit/momentumIntegration.test.ts
import { activeGoalMomentumSnapshot, evaluateGoalMomentum } from '../../lib/goalMomentumStore';

describe('activeGoalMomentumSnapshot (read-only)', () => {
  test('returns null when there is no active goal', async () => {
    expect(await activeGoalMomentumSnapshot(null, [], TODAY)).toBeNull();
  });

  test('reflects a slipping mark on the active goal', async () => {
    const goal = { id: 'g-slip', linked_mark_ids: ['m1'] };
    // daily mark (target 7): at-risk gap 2, break gap 3. gap 2 = slipping.
    const twoDaysAgo = yyyyMmDd(new Date(Date.now() - 2 * 86400000));
    const marks = [{ id: 'm1', weekly_target: 7, last_activity_date: twoDaysAgo }];
    const snap = await activeGoalMomentumSnapshot(goal, marks, TODAY);
    expect(snap?.state).toBe('slipping');
    expect(snap?.cushionRemaining).not.toBeNull();
  });

  test('ignores marks not linked to the goal', async () => {
    const goal = { id: 'g-x', linked_mark_ids: ['only-this'] };
    const broken = yyyyMmDd(new Date(Date.now() - 9 * 86400000));
    const marks = [{ id: 'unlinked', weekly_target: 7, last_activity_date: broken }];
    const snap = await activeGoalMomentumSnapshot(goal, marks, TODAY);
    expect(snap?.state).toBe('resting'); // no linked marks => resting, not broken
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/unit/momentumIntegration.test.ts`
Expected: FAIL — `activeGoalMomentumSnapshot is not a function`.

- [ ] **Step 3: Write minimal implementation**

In `lib/goalMomentumStore.ts`, extend the `goalMomentum` import to include `momentumSnapshot` and add the function at the end of the file:

```ts
// extend existing import from './goalMomentum' to also pull in momentumSnapshot:
//   momentumSnapshot,

/** Read-only: the active goal's current Momentum snapshot. Does not persist. */
export async function activeGoalMomentumSnapshot(
  activeGoal: { id: string; linked_mark_ids?: string[] } | null | undefined,
  allMarks: MarkMomentumInput[],
  today: string = yyyyMmDd(new Date()),
): Promise<MomentumSnapshot | null> {
  if (!activeGoal) return null;
  const ids = new Set(activeGoal.linked_mark_ids ?? []);
  const goalMarks = allMarks.filter((m) => ids.has(m.id));
  const record = await loadMomentumRecord(activeGoal.id);
  return momentumSnapshot(goalMarks, record, today);
}
```

(`momentumSnapshot` is already exported from `lib/goalMomentum.ts`; `loadMomentumRecord`, `yyyyMmDd`, `MarkMomentumInput`, and `MomentumSnapshot` are already in scope in this file.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/unit/momentumIntegration.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/goalMomentumStore.ts tests/unit/momentumIntegration.test.ts
git commit -m "feat(momentum): read-only activeGoalMomentumSnapshot helper"
```

---

### Task 4: Repurpose anyStreakAtRisk to read Momentum

**Files:**
- Modify: `services/behaviorNotifications.ts` (`computeDayProgress` at `:138-216`)
- Test: `tests/unit/behaviorMomentumAtRisk.test.ts` (new)

**Interfaces:**
- Consumes: `activeGoalMomentumSnapshot` (Task 3); `useGoalsStore.getActiveGoal()`.
- Produces: `DayProgressSnapshot.anyStreakAtRisk` is now `true` iff the active goal's Momentum `state === 'slipping'` (was: per-mark `computeStreak` heuristic). `maxCurrentStreak` is unchanged.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/behaviorMomentumAtRisk.test.ts
import { deriveAtRiskFromMomentum } from '../../services/behaviorNotifications';

describe('deriveAtRiskFromMomentum', () => {
  it('is true only when the snapshot is slipping', () => {
    expect(deriveAtRiskFromMomentum({ state: 'slipping', days: 4, cushionRemaining: 0.5, slippingMarkId: 'm1' })).toBe(true);
    expect(deriveAtRiskFromMomentum({ state: 'on_track', days: 4, cushionRemaining: null, slippingMarkId: null })).toBe(false);
    expect(deriveAtRiskFromMomentum({ state: 'resting', days: 4, cushionRemaining: null, slippingMarkId: null })).toBe(false);
    expect(deriveAtRiskFromMomentum({ state: 'broken', days: 0, cushionRemaining: null, slippingMarkId: null })).toBe(false);
    expect(deriveAtRiskFromMomentum(null)).toBe(false);
  });
});
```

> This extracts the at-risk rule into a pure, directly-testable function. The `computeDayProgress` change that calls it is a thin wiring change verified by Step 5 (type-check) and the existing notification suites; full SQLite-backed `computeDayProgress` integration is out of scope here (its data path is already covered by Tasks 2 and 3).

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/unit/behaviorMomentumAtRisk.test.ts`
Expected: FAIL — `deriveAtRiskFromMomentum is not a function`.

- [ ] **Step 3: Write minimal implementation**

Add imports near the top of `services/behaviorNotifications.ts`:

```ts
import { activeGoalMomentumSnapshot } from '../lib/goalMomentumStore';
import type { MomentumSnapshot } from '../lib/goalMomentum';
import { useGoalsStore } from '../state/goalsSlice';
```

Add the exported pure helper (place it just above `computeDayProgress`):

```ts
/** At-risk for notifications = the active goal's Momentum is slipping (spec §3). */
export function deriveAtRiskFromMomentum(snap: MomentumSnapshot | null): boolean {
  return snap?.state === 'slipping';
}
```

In `computeDayProgress`, **remove** the in-loop assignment that sets `anyStreakAtRisk` from the streak heuristic (the block at `:197-203`):

```ts
      if (streakData.current > 0 && streakData.lastDate) {
        const last = new Date(streakData.lastDate + 'T12:00:00');
        const diffDays = Math.round((anchor.getTime() - last.getTime()) / (86400000));
        if (diffDays === 1 && !hasActivityToday) {
          anyStreakAtRisk = true;
        }
      }
```

Delete that block (keep the `maxCurrentStreak = Math.max(...)` line above it and the surrounding `if (c.enable_streak)` so `maxCurrentStreak` still computes). Then, **after** the `for` loop and **before** the `return`, derive `anyStreakAtRisk` from Momentum:

```ts
  const activeGoal = useGoalsStore.getState().getActiveGoal();
  const momentumSnap = await activeGoalMomentumSnapshot(
    activeGoal,
    counters.map((c) => ({ id: c.id, weekly_target: c.weekly_target, last_activity_date: c.last_activity_date })),
    todayStr,
  );
  anyStreakAtRisk = deriveAtRiskFromMomentum(momentumSnap);
```

(`computeDayProgress` runs only on app foreground / notification response, so the goals store is hydrated. `anyStreakAtRisk` remains declared with `let ... = false` earlier in the function.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/unit/behaviorMomentumAtRisk.test.ts`
Expected: PASS.

- [ ] **Step 5: Type-check + commit**

Run: `npm run type-check`
Expected: no new errors from `services/behaviorNotifications.ts`.

```bash
git add services/behaviorNotifications.ts tests/unit/behaviorMomentumAtRisk.test.ts
git commit -m "feat(momentum): derive anyStreakAtRisk from Momentum state, not streaks"
```

---

### Task 5: Remove the "Enable streak" toggle; default enable_streak false

**Files:**
- Modify: `app/mark/new.tsx` (`enableStreak` state `:123`; toggle JSX `:602-639`; creation calls `:190`, `:248`)
- Modify: `app/mark/[id]/edit.tsx` (`enableStreak` state `:109`; toggle JSX; creation call `:146`)
- Modify: `hooks/useCounters.ts` (default at `:123`)

**Interfaces:**
- Produces: no user-facing streak toggle; all newly created marks persist `enable_streak: false`. Momentum (goal-level, automatic) replaces the per-mark opt-in.

- [ ] **Step 1: Edit `app/mark/new.tsx`**

Delete the state line at `:123`:
```ts
  const [enableStreak, setEnableStreak] = useState(true);
```
Delete the entire "Enable streak" toggle `<TouchableOpacity>` block at `:602-639` (the one whose label is `Enable streak` / description `Track consecutive days with activity`).
Change the suggested-counter creation field at `:190` from `enable_streak: true,` to `enable_streak: false,`.
Change the manual creation field at `:248` from `enable_streak: enableStreak,` to `enable_streak: false,`.
If `ChartBar` (used only inside the deleted toggle) is now unused, remove it from the phosphor-icons import to keep lint clean.

- [ ] **Step 2: Edit `app/mark/[id]/edit.tsx`**

Delete the state line at `:109`:
```ts
  const [enableStreak, setEnableStreak] = useState(counter?.enable_streak ?? true);
```
Delete the analogous "Enable streak" toggle block in this screen (same label text).
Change the update field at `:146` from `enable_streak: enableStreak,` to `enable_streak: counter?.enable_streak ?? false,` (preserve the mark's stored value; the screen no longer changes it).

- [ ] **Step 3: Edit `hooks/useCounters.ts`**

Change the default at `:123` from:
```ts
        enable_streak: data.enable_streak ?? true,
```
to:
```ts
        enable_streak: data.enable_streak ?? false,
```

- [ ] **Step 4: Verify build is clean**

Run: `npm run type-check` and `npm run lint -- app/mark/new.tsx app/mark/[id]/edit.tsx hooks/useCounters.ts`
Expected: no new type errors; no unused-variable / unused-import lint errors in the three files.

- [ ] **Step 5: Commit**

```bash
git add app/mark/new.tsx app/mark/[id]/edit.tsx hooks/useCounters.ts
git commit -m "feat(momentum): remove Enable-streak toggle, default enable_streak false"
```

---

### Task 6: Stop defaulting enable_streak true in goal-creation paths

**Files:**
- Modify: `app/onboarding.tsx` (`:286`)
- Modify: `app/goal/new.tsx` (`:81`)

- [ ] **Step 1: Edit both files**

In `app/onboarding.tsx:286`, change `enable_streak: true,` to `enable_streak: false,`.
In `app/goal/new.tsx:81`, change `enable_streak: true,` to `enable_streak: false,`.

- [ ] **Step 2: Verify**

Run: `npm run type-check`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add app/onboarding.tsx app/goal/new.tsx
git commit -m "feat(momentum): stop defaulting enable_streak true in onboarding and goal creation"
```

---

### Task 7: Convert the diagnostics "Simulate Streak Loss" into a Momentum-broken seed

**Files:**
- Modify: `lib/db/devTools.ts` (add `seedBrokenMomentum`)
- Modify: `app/diagnostics.tsx` (`handleBrokenStreak` `:187-203`; button label `:553`; import `:20`)
- Test: `tests/unit/momentumIntegration.test.ts`

**Interfaces:**
- Produces: `seedBrokenMomentum(userId?: string): Promise<void>` — persists a broken (`startDate: null`) Momentum record for the active goal so the next snapshot reads `broken`/fresh-start. Dev-only.

- [ ] **Step 1: Write the failing test**

```ts
// add to tests/unit/momentumIntegration.test.ts
import { seedBrokenMomentum } from '../../lib/db/devTools';

describe('seedBrokenMomentum (diagnostics)', () => {
  test('resets the active goal Momentum record to broken', async () => {
    const goal = await useGoalsStore.getState().createGoal({ title: 'Seed', userId: USER, isPro: false });
    useMarksStore.setState({ marks: [seedMark('m1', TODAY)] } as any);
    await useGoalsStore.getState().linkMarkToGoal(goal.id, 'm1');
    await useGoalsStore.getState().creditMarkToGoals('m1'); // start a run
    expect((await loadMomentumRecord(goal.id))?.startDate).toBe(TODAY);

    await seedBrokenMomentum(USER);

    expect(await loadMomentumRecord(goal.id)).toEqual({ goalId: goal.id, startDate: null });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/unit/momentumIntegration.test.ts`
Expected: FAIL — `seedBrokenMomentum is not a function`.

- [ ] **Step 3: Write minimal implementation**

Add to `lib/db/devTools.ts`:

```ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useGoalsStore } from '../../state/goalsSlice';

/** Dev: force the active goal's Momentum to broken (fresh-start) state. */
export async function seedBrokenMomentum(userId?: string): Promise<void> {
  const goals = useGoalsStore.getState().goals;
  const active = goals.find((g) => g.status === 'active' && (!userId || g.user_id === userId));
  if (!active) return;
  await AsyncStorage.setItem(`@livra_momentum_${active.id}`, JSON.stringify({ goalId: active.id, startDate: null }));
}
```

> The storage key `@livra_momentum_<goalId>` matches `keyFor` in `lib/goalMomentumStore.ts`. If `devTools.ts` already imports `AsyncStorage`, do not duplicate the import.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/unit/momentumIntegration.test.ts`
Expected: PASS.

- [ ] **Step 5: Rewire the diagnostics button**

In `app/diagnostics.tsx`:
- Update the import at `:20` to pull `seedBrokenMomentum` instead of (or alongside) `seedBrokenStreak`.
- In `handleBrokenStreak` (`:187-203`), replace `await seedBrokenStreak(user?.id);` with `await seedBrokenMomentum(user?.id);`, and update the user-facing alert strings to Momentum wording, e.g. `Alert.alert('Simulated', 'Broken momentum scenario created.');` and the failure message `'Unable to simulate momentum loss.'` (no dashes).
- Change the button label at `:553` from `Simulate Streak Loss` to `Simulate Momentum Loss`.

- [ ] **Step 6: Verify + commit**

Run: `npm run type-check`
Expected: clean.

```bash
git add lib/db/devTools.ts app/diagnostics.tsx tests/unit/momentumIntegration.test.ts
git commit -m "feat(momentum): diagnostics seeds broken Momentum instead of streak"
```

---

### Task 8: Privacy-policy wording

**Files:**
- Modify: `app/legal/privacy-policy.tsx` (`:68`)

- [ ] **Step 1: Edit the line**

Change `:68` from:
```tsx
              • Habit marks, progress entries, categories, streak data
```
to:
```tsx
              • Habit marks, progress entries, categories, momentum data
```

- [ ] **Step 2: Verify + commit**

Run: `npm run type-check`
Expected: clean.

```bash
git add app/legal/privacy-policy.tsx
git commit -m "docs(momentum): privacy policy says momentum data, not streak data"
```

---

### Task 9: Deferred-minor cleanup + full verification gate

**Files:**
- Modify: `lib/goalMomentum.ts` (JSDoc + `momentumDays` clamp), `tests/unit/goalMomentum.test.ts` (guard test)

- [ ] **Step 1: Add the deferred-minor tests/guards from the engine review**

Add to `tests/unit/goalMomentum.test.ts`:

```ts
describe('cushionFraction guard', () => {
  it('returns 0 when breakGap <= atRiskGap (degenerate cushion)', () => {
    const { cushionFraction } = require('../../lib/goalMomentum');
    expect(cushionFraction(3, 5, 5)).toBe(0);
    expect(cushionFraction(3, 6, 5)).toBe(0);
  });
});

describe('momentumDays future-start clamp', () => {
  it('never returns negative days when startDate is in the future', () => {
    const { momentumDays } = require('../../lib/goalMomentum');
    expect(momentumDays('2026-06-20', '2026-06-10')).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify the clamp test fails, then fix**

Run: `npm run test -- tests/unit/goalMomentum.test.ts`
Expected: the `momentumDays future-start clamp` test FAILS (currently returns a negative number).

In `lib/goalMomentum.ts`, change `momentumDays` to clamp:

```ts
export function momentumDays(startDate: string | null, today: string): number {
  if (!startDate) return 0;
  return Math.max(0, daysBetween(today, startDate) + 1);
}
```

Re-run: `npm run test -- tests/unit/goalMomentum.test.ts` — Expected: PASS (the `cushionFraction` guard already passes given the existing `breakGap <= atRiskGap` guard).

- [ ] **Step 3: Full suite + type-check + lint**

Run: `npm run test`
Expected: PASS, all suites green including `momentumIntegration`, `behaviorMomentumAtRisk`, `goalMomentum`, `goalMomentumStore`. No existing suite regressed.

Run: `npm run type-check`
Expected: no new errors.

Run: `npm run lint`
Expected: clean on all files changed in this plan (pre-existing backlog elsewhere is acceptable).

- [ ] **Step 4: Commit**

```bash
git add lib/goalMomentum.ts tests/unit/goalMomentum.test.ts
git commit -m "chore(momentum): deferred-minor clamp + guard tests; integration passes suite"
```

---

## Remaining subsystems (separate plans, per ROADMAP Phase 1)

These consume the wiring from this plan and are **out of scope** here:
- **1.2 Representation** — C+A hybrid on `app/(tabs)/focus.tsx`, reading `activeGoalMomentumSnapshot` / persisted records.
- **1.3 At-risk banner + 1+1 notification** — in-app banner + pre-scheduled local notifications driven by `state === 'slipping'`; rotating copy pool in `lib/copy.ts`.
- **1.4 Completion banking** — bank `days` into the completion record in `completeGoal` (`state/goalsSlice.ts`).
- **1.5 Label copy** — settings/notification toggle reads "Momentum & at-risk status".

## Notes for the implementer

- Run npm via a subagent if the main session blocks it; tests/lint/type-check are not otherwise gated now that the Semgrep plugin is removed.
- Do not edit the engine's existing exports (`lib/goalMomentum.ts`, `lib/goalMomentumStore.ts`) beyond adding `activeGoalMomentumSnapshot` (Task 3) and the `momentumDays` clamp (Task 9).
- The legacy per-mark streak *display* (`components/MarkCard.tsx`, `deriveStreakForMark`) is intentionally left untouched; with `enable_streak: false` on all new marks it renders nothing. A later cleanup may delete it.
