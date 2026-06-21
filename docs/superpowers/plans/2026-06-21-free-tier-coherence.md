# Free-Tier Coherence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the free tier offer two concurrently progressing goals (retiring the `queued` status), disclose the one-time AI draft up front with full editability, and give a calm closure state when the last goal completes — then close the matching docs.

**Architecture:** Four workstreams in order. WS1 changes the goal model in `lib/goalLogic.ts` + `state/goalsSlice.ts` (every non-completed goal is `active`; no successor activation). WS2 reconciles UI copy, removes the queue screen, and updates PRODUCT.md/ROADMAP. WS3 adds AI disclosure + editability in onboarding. WS4 adds the closure empty state. Spec: `docs/superpowers/specs/2026-06-21-free-tier-coherence-design.md`.

**Tech Stack:** React Native + Expo (SDK ~54), expo-router ~6, Zustand, TypeScript 5.9 strict, Jest (`jest-expo`). Tests in `tests/unit/*.test.ts(x)`.

## Global Constraints

- **TDD:** every behavior change starts with a failing test. (`CLAUDE.md`: "Always write tests before shipping a feature.")
- **No dashes in user-facing copy:** no em-dash (—), en-dash (–), or hyphen-as-dash. Use a period, a comma, or two short sentences. (`PRODUCT.md:262`)
- **Color tokens only:** never hardcode hex; use `theme/colors` / `theme/tokens`. (`CLAUDE.md`)
- **Zustand slices only** for persistent state; no `useState` for persistent data.
- **Free-tier values unchanged:** `FREE_GOAL_LIMIT = 2`, `FREE_MARKS_PER_GOAL = 3`, `FREE_HABIT_LIMIT = 3`.
- **The free add → log → progress → complete loop must never be gated.** (`PRODUCT.md` launch guardrail)
- Run a single test file with: `npm run test -- <fileNamePattern>`. Full suite: `npm run test`. Also `npm run type-check` and `npm run lint`.

---

## File Structure

| File | Responsibility | WS |
|------|----------------|----|
| `types/goal.ts` | Remove `'queued'` from `GoalStatus`. | 1 |
| `lib/goalLogic.ts` | `getActiveGoal` (first active), add `getActiveGoals`; remove `getQueuedGoals`, `nextGoalToActivate`. | 1 |
| `state/goalsSlice.ts` | createGoal always-active + limit; `reorderGoals`; completion/expiry no successor; `fetchGoals` normalize; getters. | 1 |
| `components/overlays/GoalCompletionOverlay.tsx` | Drop queued lookup. | 1 |
| `app/(tabs)/goals.tsx` | Render all active goals as a draggable list; cold-empty vs finished states. | 2/4 |
| `app/goal/queue.tsx`, `app/_layout.tsx` | Remove the queue screen + route. | 2 |
| `app/goal/new.tsx`, `components/sheets/AddGoalSheet.tsx`, `app/paywall.tsx` | Two-goal copy, no "queue". | 2 |
| `app/onboarding.tsx` | AI disclosure + description editability. | 3 |
| `app/goal/complete.tsx` | Closure state; reroute off `/goal/queue`. | 4 |
| `PRODUCT.md`, `ROADMAP.md` | Stress points RESOLVED; positioning reframe; roadmap ticks. | 2/4 |

---

## WS1 — Goal model

### Task 1: Remove `queued` from the type and selectors

**Files:**
- Modify: `types/goal.ts:3`
- Modify: `lib/goalLogic.ts:6-30`
- Test: `tests/unit/goalLogic.test.ts` (create if absent)

**Interfaces:**
- Produces: `getActiveGoal(goals: Goal[]): Goal | undefined` (first active by `sort_index`); `getActiveGoals(goals: Goal[]): Goal[]` (all active, sorted by `sort_index`). Removes `getQueuedGoals`, `nextGoalToActivate`.

- [ ] **Step 1: Write failing tests**

```ts
// tests/unit/goalLogic.test.ts
import { getActiveGoal, getActiveGoals } from '../../lib/goalLogic';
import type { Goal } from '../../types/goal';

const g = (over: Partial<Goal>): Goal => ({
  id: 'x', user_id: 'u', title: 't', sort_index: 0, status: 'active',
  current_mark_count: 0, created_at: '2026-01-01', updated_at: '2026-01-01', ...over,
});

test('getActiveGoals returns all active sorted by sort_index', () => {
  const goals = [
    g({ id: 'b', sort_index: 1 }),
    g({ id: 'a', sort_index: 0 }),
    g({ id: 'c', status: 'completed' }),
  ];
  expect(getActiveGoals(goals).map((x) => x.id)).toEqual(['a', 'b']);
});

test('getActiveGoal returns the first active by sort_index', () => {
  const goals = [g({ id: 'b', sort_index: 1 }), g({ id: 'a', sort_index: 0 })];
  expect(getActiveGoal(goals)?.id).toBe('a');
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm run test -- goalLogic`
Expected: FAIL (`getActiveGoals` not exported).

- [ ] **Step 3: Edit the type**

In `types/goal.ts:3`:
```ts
export type GoalStatus = 'active' | 'completed' | 'expired' | 'paused';
```

- [ ] **Step 4: Edit `lib/goalLogic.ts`** — replace lines 6-30:

```ts
export function getActiveGoals(goals: Goal[]): Goal[] {
  return goals
    .filter(g => g.status === 'active')
    .sort((a, b) => a.sort_index - b.sort_index);
}

export function getActiveGoal(goals: Goal[]): Goal | undefined {
  return getActiveGoals(goals)[0];
}

export function getCompletedGoals(goals: Goal[]): Goal[] {
  return goals
    .filter(g => g.status === 'completed')
    .sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? ''));
}

export function getExpiredGoals(goals: Goal[]): Goal[] {
  return goals
    .filter(g => g.status === 'expired')
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}
```
(Delete `getQueuedGoals` and `nextGoalToActivate` entirely.)

- [ ] **Step 5: Run to verify pass**

Run: `npm run test -- goalLogic`
Expected: PASS. (`type-check` will still fail in the slice — fixed in Task 2/3. That is expected mid-workstream.)

- [ ] **Step 6: Commit**

```bash
git add types/goal.ts lib/goalLogic.ts tests/unit/goalLogic.test.ts
git commit -m "feat(goals): retire queued status from type + selectors"
```

---

### Task 2: createGoal always-active, reorderGoals, fetch normalization, getters

**Files:**
- Modify: `state/goalsSlice.ts` (imports `:22-23`; `GoalLimitError` `:34`; interface `:49,58-59`; `createGoal` `:90-119`; `reorderQueue` `:218-231`; getters `:352-353`; `fetchGoals` `:80-88`)
- Test: `tests/unit/goalStore.test.ts`, `tests/unit/goals.test.ts`

**Interfaces:**
- Consumes: `getActiveGoal`, `getActiveGoals` from Task 1.
- Produces: store actions `reorderGoals(orderedIds: string[]): Promise<void>`, `getActiveGoals(): Goal[]`; `getActiveGoal()` retained; `getQueuedGoals`/`reorderQueue` removed. `fetchGoals` normalizes legacy `queued` → `active`.

- [ ] **Step 1: Write failing tests**

```ts
// add to tests/unit/goalStore.test.ts
test('createGoal makes every new goal active (no queue)', async () => {
  const s = useGoalsStore.getState();
  await s.createGoal({ userId: 'u', isPro: false, title: 'One' });
  await s.createGoal({ userId: 'u', isPro: false, title: 'Two' });
  const statuses = useGoalsStore.getState().goals.map(g => g.status);
  expect(statuses).toEqual(['active', 'active']);
});

test('free tier blocks a third active goal', async () => {
  const s = useGoalsStore.getState();
  await s.createGoal({ userId: 'u', isPro: false, title: 'One' });
  await s.createGoal({ userId: 'u', isPro: false, title: 'Two' });
  await expect(
    s.createGoal({ userId: 'u', isPro: false, title: 'Three' })
  ).rejects.toThrow(/2 goals/);
});

test('fetchGoals normalizes legacy queued goals to active', async () => {
  // loadGoalsForUser mocked to return a goal with status 'queued'
  await useGoalsStore.getState().fetchGoals('u');
  expect(useGoalsStore.getState().goals.every(g => g.status !== 'queued')).toBe(true);
});
```
(Match the existing mock setup in `goalStore.test.ts` for `loadGoalsForUser` / `upsertGoal`.)

- [ ] **Step 2: Run to verify failure**

Run: `npm run test -- goalStore`
Expected: FAIL.

- [ ] **Step 3: Update imports** (`state/goalsSlice.ts:22-23`)

```ts
  getActiveGoal,
  getActiveGoals,
```
(Remove the `getQueuedGoals` import.)

- [ ] **Step 4: Rewrite `GoalLimitError` message** (`:34`)

```ts
    super('Free keeps you to 2 goals at once. Finish one or upgrade to Livra+ for unlimited goals.');
```

- [ ] **Step 5: Update the interface block**

In `GoalsState` (`:49`): rename `reorderQueue` to `reorderGoals: (orderedIds: string[]) => Promise<void>;`. Remove `getQueuedGoals: () => Goal[];` (`:59`) and add `getActiveGoals: () => Goal[];` next to `getActiveGoal` (`:58`).

- [ ] **Step 6: Normalize in `fetchGoals`** (`:83-84`)

```ts
      const loaded = await loadGoalsForUser(userId);
      const goals = loaded.map(g =>
        (g.status as string) === 'queued' ? { ...g, status: 'active' as const } : g
      );
      set({ goals, isLoading: false });
```

- [ ] **Step 7: Rewrite `createGoal` status + sort_index** (`:95-109`)

```ts
    const activeGoals = current.filter(g => g.status === 'active');
    const maxSortIndex = activeGoals.reduce((m, g) => Math.max(m, g.sort_index), -1);

    const now = new Date().toISOString();
    const goal: Goal = {
      id: uuidv4(),
      user_id: userId,
      title: (data.title ?? '').trim(),
      description: data.description?.trim() || undefined,
      icon: data.icon,
      color: data.color,
      status: 'active',
      sort_index: maxSortIndex + 1,
```
(The limit check at `:92-93` stays: `nonCompleted` now counts active goals only, which is correct.)

- [ ] **Step 8: Replace `reorderQueue` with `reorderGoals`** (`:218-231`)

```ts
  reorderGoals: async (orderedIds) => {
    const now = new Date().toISOString();
    const goals = get().goals;
    const updates: Goal[] = [];

    orderedIds.forEach((id, idx) => {
      const goal = goals.find(g => g.id === id && g.status === 'active');
      if (goal) updates.push({ ...goal, sort_index: idx, updated_at: now });
    });

    await upsertGoals(updates);
    const map = new Map(updates.map(g => [g.id, g]));
    set(s => ({ goals: s.goals.map(g => map.get(g.id) ?? g) }));
  },
```

- [ ] **Step 9: Update getters** (`:352-353`)

```ts
  getActiveGoal: () => getActiveGoal(get().goals),
  getActiveGoals: () => getActiveGoals(get().goals),
```
(Remove the `getQueuedGoals` getter.)

- [ ] **Step 10: Run tests**

Run: `npm run test -- goalStore`
Expected: PASS. (`completeGoal` still references `nextGoalToActivate` — fixed in Task 3; type-check not yet clean.)

- [ ] **Step 11: Commit**

```bash
git add state/goalsSlice.ts tests/unit/goalStore.test.ts
git commit -m "feat(goals): create goals active, add reorderGoals + getActiveGoals, normalize legacy queued"
```

---

### Task 3: Completion and expiry no longer activate a successor

**Files:**
- Modify: `state/goalsSlice.ts` `completeGoal` (`:172-216`) and `checkGoalCompletion` (`:298-328`)
- Test: `tests/unit/goalStore.test.ts`, `tests/unit/goalCompletionBanking.test.ts`

**Interfaces:**
- Consumes: store from Task 2.
- Produces: `completeGoal` marks only the target completed; other active goals untouched.

- [ ] **Step 1: Write failing test**

```ts
test('completing one goal leaves other active goals active (no auto-activation)', async () => {
  const s = useGoalsStore.getState();
  const a = await s.createGoal({ userId: 'u', isPro: false, title: 'A' });
  await s.createGoal({ userId: 'u', isPro: false, title: 'B' });
  await s.completeGoal(a.id);
  const after = useGoalsStore.getState().goals;
  expect(after.find(g => g.id === a.id)?.status).toBe('completed');
  expect(after.filter(g => g.status === 'active')).toHaveLength(1);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm run test -- goalStore`
Expected: FAIL or type error on `nextGoalToActivate`.

- [ ] **Step 3: Simplify `completeGoal`** — replace lines 186-193:

```ts
    const completed: Goal = {
      ...completing,
      status: 'completed',
      completed_at: now,
      updated_at: now,
      banked_momentum_days: bankedDays,
    };
    await upsertGoals([completed]);
```
And replace the `set(...)` block (`:208-214`) with:
```ts
    set(s => ({
      goals: s.goals.map(g => (g.id === completed.id ? completed : g)),
    }));
```
(Delete the `remaining` / `next` / `activated` lines `:186-191` and the `activated` branch in `set`.)

- [ ] **Step 4: Simplify expiry in `checkGoalCompletion`** — replace lines 308-327:

```ts
    if (isDeadlineExpired(goal)) {
      const expired: Goal = { ...goal, status: 'expired', updated_at: now };
      await upsertGoal(expired);
      set(s => ({
        goals: s.goals.map(g => (g.id === goalId ? expired : g)),
      }));
    }
```

- [ ] **Step 5: Run tests**

Run: `npm run test -- goalStore goalCompletionBanking`
Expected: PASS. Then `npm run type-check` — `goalsSlice.ts` should now be clean.

- [ ] **Step 6: Commit**

```bash
git add state/goalsSlice.ts tests/unit/goalStore.test.ts
git commit -m "feat(goals): completion and expiry no longer activate a successor"
```

---

### Task 4: GoalCompletionOverlay drops the queued lookup

**Files:**
- Modify: `components/overlays/GoalCompletionOverlay.tsx:86`
- Test: `tests/unit/goalCompletionOverlayBanked.test.tsx`

- [ ] **Step 1: Read the surrounding usage**

Run: `npm run test -- goalCompletionOverlayBanked` and open `GoalCompletionOverlay.tsx:80-95` to see how the `queued` result is used (a "next goal" label/CTA).

- [ ] **Step 2: Update the component**

Remove the `(g) => g.status === 'queued'` lookup (`:86`). Where the overlay showed a "next up" goal, show nothing (the closure flow in WS4 owns the post-completion moment). If a variable becomes unused, delete it; keep the banked-momentum display intact.

- [ ] **Step 3: Run tests**

Run: `npm run test -- goalCompletionOverlayBanked`
Expected: PASS (update the test if it asserted on a queued "next" label).

- [ ] **Step 4: Commit**

```bash
git add components/overlays/GoalCompletionOverlay.tsx tests/unit/goalCompletionOverlayBanked.test.tsx
git commit -m "feat(goals): drop queued successor from completion overlay"
```

---

### Task 5: Sweep remaining `queued` test references

**Files:**
- Modify: `tests/unit/goals.test.ts`, `tests/unit/goalCapStore.test.ts`, `tests/unit/goalMilestones.test.ts`, `tests/unit/momentumIntegration.test.ts`

- [ ] **Step 1: Find every reference**

Run: `grep -rn "'queued'\|getQueuedGoals\|reorderQueue\|nextGoalToActivate" tests/`

- [ ] **Step 2: Update each**

Replace `status: 'queued'` fixtures with `status: 'active'`; replace `reorderQueue` with `reorderGoals`; remove assertions that a completed goal auto-activates a queued one (assert it stays completed and siblings stay active instead).

- [ ] **Step 3: Run the full suite**

Run: `npm run test`
Expected: PASS. Then `npm run type-check` clean, `npm run lint` clean on changed files.

- [ ] **Step 4: Commit**

```bash
git add tests/
git commit -m "test(goals): update fixtures for active-only goal model"
```

---

## WS2 — Copy, queue screen removal, monetization docs

### Task 6: Goals tab renders all active goals as a draggable list

**Files:**
- Modify: `app/(tabs)/goals.tsx` (`:327-340`, `:418-440`)

**Interfaces:**
- Consumes: `getActiveGoals`, `reorderGoals` from WS1.

- [ ] **Step 1: Update store selectors** (`:327-332`)

```ts
  const getActiveGoals = useGoalsStore((s) => s.getActiveGoals);
  const getCompletedGoals = useGoalsStore((s) => s.getCompletedGoals);

  const active = useMemo(() => getActiveGoals(), [getActiveGoals, goals]);
  const completedCount = useMemo(() => getCompletedGoals().length, [getCompletedGoals, goals]);
```
Remove the `getActiveGoal`/`getQueuedGoals`/`queued` lines.

- [ ] **Step 2: Update `isEmpty`** (`:340`)

```ts
  const isEmpty = !isLoading && active.length === 0;
```

- [ ] **Step 3: Replace the ACTIVE + UP NEXT blocks** (`:418-440`)

Render one section: all active goals, draggable for display order. Reuse the existing `DraggableQueueList` (local to this file) for the active list, renaming it `DraggableGoalList`, and feed it `active`. Wire its reorder callback to `reorderGoals`:

```tsx
        {active.length > 0 && (
          <>
            <SectionLabel style={styles.sectionLabel}>ACTIVE</SectionLabel>
            <DraggableGoalList
              goals={active}
              onPressGoal={handleOpenGoal}
            />
          </>
        )}
```
Update `handleDragEnd` (`:291`) to call `reorderGoals(ordered.map(g => g.id))`. Each card continues to show its own progress via `getGoalProgress(goal.id)` (move the per-goal progress lookup into the list item rather than a single `activeProgress`).

- [ ] **Step 4: Manual check + tests**

Run: `npm run test` and `npm run type-check`. Verify the goals tab compiles and references no `queued`.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/\(tabs\)/goals.tsx
git commit -m "feat(goals): goals tab shows all active goals as one draggable list"
```

---

### Task 7: Remove the queue screen and route

**Files:**
- Delete: `app/goal/queue.tsx`
- Modify: `app/_layout.tsx:609` (remove `goal/queue` Stack.Screen)
- Modify: `app/goal/complete.tsx:118` (reroute)

- [ ] **Step 1: Migrate any unique actions**

Open `app/goal/queue.tsx`. Confirm its goal delete/reorder affordances exist on the Goals tab (delete via goal detail; reorder via Task 6). If a unique action is missing on the tab, add it there first.

- [ ] **Step 2: Delete the screen + route**

Delete `app/goal/queue.tsx`. Remove the `<Stack.Screen name="goal/queue" ... />` line at `app/_layout.tsx:609`.

- [ ] **Step 3: Reroute `complete.tsx`** (`:114-119`)

```ts
  const handleNext = useCallback(() => {
    const hasActive = useGoalsStore.getState().getActiveGoals().length > 0;
    router.replace(hasActive ? ('/(tabs)/focus' as any) : ('/(tabs)/goals' as any));
  }, [router]);
```

- [ ] **Step 4: Verify no dangling references**

Run: `grep -rn "goal/queue" app/ components/`
Expected: no results.

- [ ] **Step 5: Run + commit**

Run: `npm run test && npm run type-check`
```bash
git add app/_layout.tsx app/goal/complete.tsx
git rm app/goal/queue.tsx
git commit -m "feat(goals): remove queue screen and route"
```

---

### Task 8: Reconcile goal-limit copy

**Files:**
- Modify: `app/goal/new.tsx:100`, `components/sheets/AddGoalSheet.tsx:156,302`, `app/paywall.tsx:52`

- [ ] **Step 1: Update each string (dash-free)**

`app/goal/new.tsx:100` and `AddGoalSheet.tsx:156`:
```ts
'Free keeps you to 2 goals at once so you can actually finish them. Livra+ opens unlimited goals.'
```
`AddGoalSheet.tsx:302` button label: `'Add to queue'` → `'Add goal'` (keep the saving label as `'Adding…'`).
`app/paywall.tsx:52`:
```ts
{ icon: Flag, title: 'Unlimited Goals', description: 'Run as many goals at once as you want, past the 2 free.' },
```

- [ ] **Step 2: Confirm no "queue" remains in goal copy**

Run: `grep -rni "queue" app/ components/ | grep -v test`
Expected: only unrelated matches (none about goals).

- [ ] **Step 3: Run + commit**

Run: `npm run test && npm run lint`
```bash
git add app/goal/new.tsx components/sheets/AddGoalSheet.tsx app/paywall.tsx
git commit -m "feat(goals): reconcile goal-limit copy to two-goal model"
```

---

### Task 9: PRODUCT.md + ROADMAP for 2.3

**Files:**
- Modify: `PRODUCT.md` (`:95`, `:367`, `:448`)
- Modify: `ROADMAP.md` (item 2.3)

- [ ] **Step 1: Core vision (`PRODUCT.md:95`)**

Rewrite "one goal is active / progress toward the active goal" to: free users run up to two goals at once, each accruing its own progress; Livra+ unlocks unlimited goals. Update the stress-point callout below it to begin `> **Stress point — RESOLVED (Phase 2.3):**` with a one-line note and `docs/superpowers/specs/2026-06-21-free-tier-coherence-design.md`.

- [ ] **Step 2: Positioning (`PRODUCT.md:367`)**

Reframe the habit-tracker anti-reference line so narrowness reads as "a couple of goals, a few marks each, not a habit grid of everything" (dash-free), preserving depth-over-breadth.

- [ ] **Step 3: Locked-model table (`PRODUCT.md:448`)**

Add a row to the table: daily-habit marks — Free: up to 3 un-goaled daily-habit marks; Livra+: unlimited. Update the `:448` stress-point callout to `RESOLVED (Phase 2.3)`.

- [ ] **Step 4: ROADMAP tick**

In `ROADMAP.md`, change item **2.3** from `- [ ]` to `- [x]` and append a done-note: `DONE (free-tier coherence): two concurrent active goals, queued status retired, habit cap added to table. Plan: docs/superpowers/plans/2026-06-21-free-tier-coherence.md.`

- [ ] **Step 5: Commit**

```bash
git add PRODUCT.md ROADMAP.md
git commit -m "docs(monetization): resolve 2.3 — two-goal model + habit cap in table"
```

---

## WS3 — AI generosity (2.10)

### Task 10: Upfront disclosure before AI generation

**Files:**
- Modify: `app/onboarding.tsx` (AI hatch UI, near `handleAIGenerate` `:127` and its trigger button)
- Test: `tests/unit/onboarding/` (match existing onboarding test pattern)

- [ ] **Step 1: Find the AI generate button**

Run: `grep -n "handleAIGenerate\|AI plan\|Generate\|aiError" app/onboarding.tsx` to locate the button that calls `handleAIGenerate`.

- [ ] **Step 2: Write a failing test**

Render the onboarding AI step and assert the disclosure copy is present before generation:
```ts
expect(screen.getByText(/one free AI draft/i)).toBeTruthy();
```
(Follow the render/setup used by existing files under `tests/unit/onboarding/`.)

- [ ] **Step 3: Add the disclosure line**

Above the generate button, add a dash-free helper line using existing typography + `theme/colors` tokens:
```tsx
<Text style={[styles.aiDisclosure, { color: c.inkMuted }]}>
  This is your one free AI draft. You can edit everything before you save it, and presets are always free.
</Text>
```
Add `aiDisclosure` to the local `StyleSheet.create` (no inline non-dynamic styles).

- [ ] **Step 4: Run test**

Run: `npm run test -- onboarding`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/onboarding.tsx tests/unit/onboarding/
git commit -m "feat(ai): disclose one-time AI draft up front in onboarding"
```

---

### Task 11: Editable description in AI review + verify regen count

**Files:**
- Modify: `app/onboarding.tsx` (AI review block: `reviewTitle`/`reviewWeeks`/`reviewMarks` state `:118-121`, `handleAIReviewConfirm` `:162-181`)
- Modify (if needed): `lib/ai/goalGeneration.ts` / Edge Function notes

- [ ] **Step 1: Add review description state**

```ts
const [reviewDescription, setReviewDescription] = useState('');
```
In `handleAIGenerate` success branch (`:135-142`), set it from the package if the package carries a description (`setReviewDescription(pkg.description ?? '')`); otherwise leave blank.

- [ ] **Step 2: Render an editable description field**

In the AI review UI, add a `TextInput` bound to `reviewDescription`/`setReviewDescription` (tokens for colors, style in `StyleSheet.create`, dash-free placeholder e.g. `"Add a note about this goal (optional)."`).

- [ ] **Step 3: Thread it into the created goal**

In `handleAIReviewConfirm` (`:166-167`), carry the edited description through to the goal creation path (`store.setGoalDescription` if such a setter exists, or include it in the marks/goal payload used downstream). Verify against how `createGoal` receives `description`.

- [ ] **Step 4: Verify regeneration accounting**

Confirm in `lib/ai/goalGeneration.ts` + the `ai-goal-generation` Edge Function whether each regeneration increments `ai_uses_count`. Document the finding in the PR description. If a regeneration spends a separate use (contradicting "one free draft = initial + up to 2 regens"), file the fix in the Edge Function so the disclosed promise holds; otherwise no change.

- [ ] **Step 5: Write/extend a test**

Assert that confirming the AI review with an edited title/description produces a goal carrying those edits (mock `generateGoalPackage`).

- [ ] **Step 6: Run + commit**

Run: `npm run test -- onboarding && npm run type-check`
```bash
git add app/onboarding.tsx lib/ai/goalGeneration.ts tests/unit/onboarding/
git commit -m "feat(ai): editable description in AI review + honest regen accounting"
```

---

## WS4 — Retention cliff closure (2.5)

### Task 12: Closure helper — decide the post-completion state

**Files:**
- Create: `lib/completionState.ts`
- Test: `tests/unit/completionState.test.ts`

**Interfaces:**
- Produces: `resolveCompletionState(goals: Goal[]): 'has-active' | 'all-complete'` — `'all-complete'` when zero active and at least one completed; otherwise `'has-active'`.

- [ ] **Step 1: Write failing tests**

```ts
import { resolveCompletionState } from '../../lib/completionState';
import type { Goal } from '../../types/goal';
const g = (o: Partial<Goal>): Goal => ({ id:'x', user_id:'u', title:'t', sort_index:0, status:'active', current_mark_count:0, created_at:'', updated_at:'', ...o });

test('all-complete when no active and >=1 completed', () => {
  expect(resolveCompletionState([g({ status: 'completed' })])).toBe('all-complete');
});
test('has-active when an active goal remains', () => {
  expect(resolveCompletionState([g({ status: 'active' }), g({ status: 'completed' })])).toBe('has-active');
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm run test -- completionState`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
import type { Goal } from '../types/goal';

export type CompletionState = 'has-active' | 'all-complete';

export function resolveCompletionState(goals: Goal[]): CompletionState {
  const hasActive = goals.some(g => g.status === 'active');
  const hasCompleted = goals.some(g => g.status === 'completed');
  return !hasActive && hasCompleted ? 'all-complete' : 'has-active';
}
```

- [ ] **Step 4: Run + commit**

Run: `npm run test -- completionState`
```bash
git add lib/completionState.ts tests/unit/completionState.test.ts
git commit -m "feat(closure): add resolveCompletionState helper"
```

---

### Task 13: Closure state in the completion screen

**Files:**
- Modify: `app/goal/complete.tsx` (the `WHAT'S NEXT?` block `:199-211`)

**Interfaces:**
- Consumes: `resolveCompletionState`, `getCompletedGoals`, momentum/marks stores.

- [ ] **Step 1: Replace the "Your queue is clear." branch** (`:204-211`)

When `resolveCompletionState(goals) === 'all-complete'`, render a closure block instead of `nextGoal`: a warm line plus what they built. Pull totals from existing stores (`getCompletedGoals().length`; total marks logged from the marks store; banked momentum from completed goals' `banked_momentum_days`). Dash-free copy, tokens for color. Example structure:

```tsx
{closure === 'all-complete' ? (
  <View>
    <Text style={styles.nextTitle}>You finished everything you set out to do.</Text>
    <Text style={[styles.closureStat, { color: c.inkMuted }]}>
      {`${completedCount} goals complete. ${marksLogged} marks logged.`}
    </Text>
  </View>
) : nextGoal ? (
  <Text style={styles.nextTitle}>{nextGoal.title}</Text>
) : null}
```

- [ ] **Step 2: Calm on-ramp CTA**

The existing `Continue` `PillButton` stays; under `all-complete` its `handleNext` already routes to `/(tabs)/goals` (Task 7). Optionally relabel to `'Start your next goal'` only in the all-complete branch. No second nag.

- [ ] **Step 3: Add styles**

Add `closureStat` to `StyleSheet.create` (tokens only). Remove the now-dead "Your queue is clear." string.

- [ ] **Step 4: Run + commit**

Run: `npm run test -- goalComplete && npm run type-check`
```bash
git add app/goal/complete.tsx
git commit -m "feat(closure): calm all-complete state replaces empty-queue message"
```

---

### Task 14: Goals-tab finished-everything vs cold-empty

**Files:**
- Modify: `app/(tabs)/goals.tsx` (`isEmpty` block `:396-414`)

- [ ] **Step 1: Distinguish the two empties**

`isEmpty` (no active goals) now covers both "never had a goal" and "finished everything." Use `completedCount` to branch: when `completedCount > 0`, show a warm "You finished everything. Start your next goal when you're ready." with the add CTA; when `completedCount === 0`, keep the existing "No goals yet." copy.

```tsx
<Text style={[styles.emptyTitle, { color: c.inkDark }]}>
  {completedCount > 0 ? 'You finished everything.' : 'No goals yet.'}
</Text>
<Text style={[styles.emptySubtitle, { color: c.inkMuted }]}>
  {completedCount > 0 ? 'Start your next goal when you are ready.' : 'Add your first goal to begin.'}
</Text>
```

- [ ] **Step 2: Run + commit**

Run: `npm run test && npm run type-check && npm run lint`
```bash
git add app/\(tabs\)/goals.tsx
git commit -m "feat(closure): goals tab distinguishes finished-everything from first-run"
```

---

### Task 15: Doc closeout for 2.5 + 2.10 + launch gate

**Files:**
- Modify: `PRODUCT.md` (`:208`, `:398`, launch guardrails), `ROADMAP.md` (items 2.5, 2.10)

- [ ] **Step 1: Resolve `PRODUCT.md:208`** (retention cliff)

Update the stress-point callout to `RESOLVED (Phase 2.5)` with a one-line note: the all-complete moment shows closure plus a calm invite, no manufactured return. Point at the spec.

- [ ] **Step 2: Resolve `PRODUCT.md:398`** (AI generosity)

Update the callout to `RESOLVED (Phase 2.10)`: one-time nature disclosed at the point of use; the draft is fully editable before it is saved.

- [ ] **Step 3: Re-verify the launch guardrail**

Confirm "no part of the add → log → progress → complete loop is blocked for free users" still holds under two active goals. Note the verification in the callout/commit. Do not check the guardrail box unless the spec owner signs off.

- [ ] **Step 4: ROADMAP ticks**

Set items **2.5** and **2.10** to `- [x]` with done-notes (branch + plan path), matching the 2.1/2.2 format.

- [ ] **Step 5: Final full verification**

Run: `npm run test && npm run type-check && npm run lint`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add PRODUCT.md ROADMAP.md
git commit -m "docs: resolve 2.5 + 2.10 stress points and tick roadmap"
```

---

## Self-Review

**Spec coverage:** WS1 §4 → Tasks 1-5; WS2 §5 → Tasks 6-9; WS3 §6 → Tasks 10-11; WS4 §7 → Tasks 12-14; doc closeout §8 → Tasks 9 + 15. AI count-honesty (§6.3) → Task 11 Step 4. Launch-gate re-verify (§8) → Task 15 Step 3. All covered.

**Placeholder scan:** No "TBD"/"handle edge cases"; each code step carries real code or a concrete grep/edit. Two intentionally investigative steps (Task 7 Step 1 migrate-unique-actions; Task 11 Step 4 regen accounting) are bounded checks with a defined action on each outcome, not deferred work.

**Type consistency:** `getActiveGoals` / `getActiveGoal` / `reorderGoals` / `resolveCompletionState` used consistently across tasks. `GoalStatus` keeps `'paused'` (pre-existing, out of scope); only `'queued'` removed. `CompletionState` union matches between helper and consumer.
