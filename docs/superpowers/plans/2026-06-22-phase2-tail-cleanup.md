# Phase 2 Tail Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the remaining Phase 1 deferred minors plus Phase 2.4 (opacity done-state a11y) and Phase 2.9 (anti-reference naming) so Phase 2 is complete and launch-gate ready.

**Architecture:** Three independent groups bundled onto one branch (`feat/phase2-tail-cleanup`): (A) small robustness/security fixes to dev-tools and momentum evaluation, (B) a reusable non-opacity "done"/state cue applied across three surfaces, (C) doc-only positioning edits per the 2.9 spec. No shared state between groups; tasks are independently reviewable.

**Tech Stack:** React Native 0.81 + Expo SDK ~54, Zustand, `@testing-library/react-native`, Jest (`jest-expo`), TypeScript 5.9 strict.

## Global Constraints

- **TDD:** every new behavior gets a failing test first (CLAUDE.md). Doc-only Task 7 is verified by grep instead.
- **Color tokens only** from `theme/colors` / `theme/tokens` — never hardcode hex (CLAUDE.md).
- **No inline styles** except dynamic values; otherwise `StyleSheet.create` (CLAUDE.md).
- **No competitor brand names** in any committed artifact — docs, specs, or copy (2.9 spec D3). Forbidden tokens: the four warm-companion brands, the gamified brand, and the productivity-tool brand currently in PRODUCT.md.
- **No dashes in user-facing copy** (em-dash, en-dash, hyphen-as-dash) — existing 2.7 rule.
- **Green gates:** full unit suite passes, `npm run type-check` clean, `npm run lint` clean on changed files.
- Branch base: `feat/phase2-tail-cleanup` (already created off `docs/product-direction`; the 2.9 spec is already committed there).

---

### Task 1: Guard `seedBrokenMomentum` with `assertDevToolsAccess`

Every sibling seeder in `lib/db/devTools.ts` (`seedHighUsage`, `seedBrokenStreak`, `seedPerfectWeek`, `clearAllData`) calls `assertDevToolsAccess(...)` as its first line. `seedBrokenMomentum` does not, so it can run in a production build. Add the guard.

**Files:**
- Modify: `lib/db/devTools.ts:294-299`
- Test: `tests/unit/seedBrokenMomentumAccess.test.ts` (create)

**Interfaces:**
- Consumes: `assertDevToolsAccess(feature: string): void` from `lib/dev/access.ts` (throws when `env.isDev` is false).
- Produces: `seedBrokenMomentum(userId?: string): Promise<void>` now rejects outside dev builds before touching any store or storage.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/seedBrokenMomentumAccess.test.ts
jest.mock('../../lib/env', () => ({ env: { isDev: false } }));

import { seedBrokenMomentum } from '../../lib/db/devTools';

describe('seedBrokenMomentum dev-tools guard', () => {
  it('rejects when not a development build', async () => {
    await expect(seedBrokenMomentum()).rejects.toThrow(
      /"seedBrokenMomentum" is disabled outside development builds/
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/unit/seedBrokenMomentumAccess.test.ts -v`
Expected: FAIL — the function resolves (no throw) because the guard is missing.

- [ ] **Step 3: Add the guard**

In `lib/db/devTools.ts`, make the guard the first statement of `seedBrokenMomentum`:

```typescript
export async function seedBrokenMomentum(userId?: string): Promise<void> {
  assertDevToolsAccess('seedBrokenMomentum');
  const goals = useGoalsStore.getState().goals;
  const active = goals.find((g) => g.status === 'active' && (!userId || g.user_id === userId));
  if (!active) return;
  await AsyncStorage.setItem(`@livra_momentum_${active.id}`, JSON.stringify({ goalId: active.id, startDate: null }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/unit/seedBrokenMomentumAccess.test.ts -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/unit/seedBrokenMomentumAccess.test.ts lib/db/devTools.ts
git commit -m "fix(devtools): guard seedBrokenMomentum with assertDevToolsAccess"
```

---

### Task 2: Isolate per-goal failures in `evaluateActiveGoalsMomentum`

`evaluateActiveGoalsMomentum` (`state/goalsSlice.ts:353`) loops over active goals and `await`s `evaluateGoalMomentum` for each. If one goal throws, the whole evaluation aborts and the remaining goals get no snapshot. Wrap the per-goal body so one failure is skipped and the rest continue.

**Files:**
- Modify: `state/goalsSlice.ts:353-368`
- Test: `tests/unit/goalsMomentumEvalIsolation.test.ts` (create)

**Interfaces:**
- Consumes: `evaluateGoalMomentum(goalId, goalMarks, today): Promise<MomentumSnapshot>` from `lib/goalMomentumStore` (already imported in the slice).
- Produces: `evaluateActiveGoalsMomentum(): Promise<Map<string, MomentumSnapshot>>` — returns snapshots for every goal that evaluated successfully; a throwing goal is absent from the map and does not block others.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/goalsMomentumEvalIsolation.test.ts
const mockEvaluate = jest.fn();
jest.mock('../../lib/goalMomentumStore', () => ({
  evaluateGoalMomentum: (...args: unknown[]) => mockEvaluate(...args),
}));

import { useGoalsStore } from '../../state/goalsSlice';
import { useCountersStore } from '../../state/countersSlice';
import { useMomentumStore } from '../../state/momentumSlice';

describe('evaluateActiveGoalsMomentum failure isolation', () => {
  beforeEach(() => {
    mockEvaluate.mockReset();
    useCountersStore.setState({ marks: [] });
    useMomentumStore.setState({ snapshots: {} });
    useGoalsStore.setState({
      goals: [
        { id: 'g1', status: 'active', linked_mark_ids: [] } as any,
        { id: 'g2', status: 'active', linked_mark_ids: [] } as any,
      ],
    });
  });

  it('keeps evaluating other goals when one throws', async () => {
    const okSnap = { state: 'building', days: 4, cushionRemaining: 2, slippingMarkId: null };
    mockEvaluate.mockImplementation((goalId: string) =>
      goalId === 'g1' ? Promise.reject(new Error('boom')) : Promise.resolve(okSnap)
    );

    const result = await useGoalsStore.getState().evaluateActiveGoalsMomentum();

    expect(result.has('g1')).toBe(false);
    expect(result.get('g2')).toEqual(okSnap);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/unit/goalsMomentumEvalIsolation.test.ts -v`
Expected: FAIL — the rejected `g1` propagates and `evaluateActiveGoalsMomentum` rejects, so `result` is never assigned.

- [ ] **Step 3: Add the per-goal try/catch**

Replace the loop body in `state/goalsSlice.ts`:

```typescript
  evaluateActiveGoalsMomentum: async () => {
    const today = yyyyMmDd(new Date());
    const active = get().goals.filter((g) => g.status === 'active');
    const allMarks = useMarksStore.getState().marks;
    const result = new Map<string, MomentumSnapshot>();
    for (const g of active) {
      try {
        const ids = new Set(g.linked_mark_ids ?? []);
        const goalMarks = allMarks
          .filter((m) => !m.deleted_at && ids.has(m.id))
          .map((m) => ({ id: m.id, weekly_target: m.weekly_target, last_activity_date: m.last_activity_date }));
        const snap = await evaluateGoalMomentum(g.id, goalMarks, today);
        result.set(g.id, snap);
        useMomentumStore.getState().setSnapshot(g.id, snap);
      } catch (err) {
        console.warn(`[Momentum] evaluation failed for goal ${g.id}:`, err);
      }
    }
    return result;
  },
```

(Keep the existing `useMarksStore`/`useMomentumStore` import names already used in the slice — `useMarksStore` is the slice's alias for the marks store.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/unit/goalsMomentumEvalIsolation.test.ts -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/unit/goalsMomentumEvalIsolation.test.ts state/goalsSlice.ts
git commit -m "fix(momentum): isolate per-goal failures in evaluateActiveGoalsMomentum"
```

---

### Task 3: Rename `handleBrokenStreak` to `handleBrokenMomentum` and add JSDoc

The diagnostics handler still carries the pre-Momentum name `handleBrokenStreak` even though it seeds broken *momentum* (`app/diagnostics.tsx:187, 550`). Rename it for clarity and add a JSDoc line to the repurposed `anyStreakAtRisk` consumer so its Momentum meaning is documented. This is a rename/refactor with no behavior change; verified by type-check and lint.

**Files:**
- Modify: `app/diagnostics.tsx:187` (declaration) and `:550` (onPress reference)
- Modify: `services/behaviorNotifications.ts` (JSDoc above the `anyStreakAtRisk` field at `:140`)

**Interfaces:**
- No exported signatures change. `handleBrokenStreak` is a local `const` in the diagnostics component.

- [ ] **Step 1: Rename the handler declaration**

In `app/diagnostics.tsx`, change line 187:

```typescript
  const handleBrokenMomentum = async () => {
```

- [ ] **Step 2: Update the onPress reference**

In `app/diagnostics.tsx`, change the `onPress={handleBrokenStreak}` at line 550:

```typescript
                onPress={handleBrokenMomentum}
```

- [ ] **Step 3: Add JSDoc to the at-risk field**

In `services/behaviorNotifications.ts`, add a doc comment directly above the `anyStreakAtRisk: boolean;` field (line 140):

```typescript
  /** True when any active goal's Momentum is slipping (legacy field name; reads Momentum, not a streak). */
  anyStreakAtRisk: boolean;
```

- [ ] **Step 4: Verify no stale references remain**

Run: `grep -rn "handleBrokenStreak" app/ components/ services/ lib/`
Expected: no output.

- [ ] **Step 5: Type-check and lint**

Run: `npx tsc --noEmit && npx eslint app/diagnostics.tsx services/behaviorNotifications.ts`
Expected: both exit 0, no output from eslint.

- [ ] **Step 6: Commit**

```bash
git add app/diagnostics.tsx services/behaviorNotifications.ts
git commit -m "refactor(diagnostics): rename handleBrokenStreak to handleBrokenMomentum + JSDoc"
```

---

### Task 4: Add a non-opacity "done" cue to `MarkRow` and wire `focus.tsx` (2.4)

On `app/(tabs)/focus.tsx`, done-for-week marks render through `MarkRow` with `showWeeklyCount`, which makes the right side show the weekly count number **instead of** the CheckinButton check (`MarkRow.tsx:128-134`). The only "done" signal is the wrapping `doneMarkWrap` opacity of 0.45 (`focus.tsx:671-673`) — state by opacity alone, the exact bug PRODUCT.md:494 forbids. Add a `done` prop to `MarkRow` that strikes through the title and sets `accessibilityState`, then pass it from `focus.tsx`. The opacity dim stays as a secondary enhancement.

**Files:**
- Modify: `components/ui/MarkRow.tsx` (props interface ~`:50`, component signature ~`:65`, title `Text` ~`:109`, container `TouchableOpacity` ~`:90`, `styles.title` ~`:169`)
- Modify: `app/(tabs)/focus.tsx` (the `MarkRow` call in `renderMarkRow`, ~`:332-341`)
- Test: `tests/unit/markRow.test.tsx` (create)

**Interfaces:**
- Produces: `MarkRow` accepts a new optional prop `done?: boolean`. When `true`, the title renders with `textDecorationLine: 'line-through'` and the row exposes `accessibilityState={{ checked: true }}`.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/markRow.test.tsx
import React from 'react';
import { render } from '@testing-library/react-native';
import { MarkRow } from '../../components/ui/MarkRow';

jest.mock('../../state/uiSlice', () => ({ useEffectiveTheme: () => 'light' }));

describe('MarkRow done cue', () => {
  it('strikes through the title and marks the row checked when done', () => {
    const { getByText, getByA11yState } = render(
      <MarkRow title="Read" category="custom" done showWeeklyCount weeklyCount={3} weeklyTarget={3} />
    );
    const title = getByText('Read');
    const flat = Array.isArray(title.props.style)
      ? Object.assign({}, ...title.props.style.flat())
      : title.props.style;
    expect(flat.textDecorationLine).toBe('line-through');
    expect(getByA11yState({ checked: true })).toBeTruthy();
  });

  it('does not strike through the title when not done', () => {
    const { getByText } = render(
      <MarkRow title="Read" category="custom" showWeeklyCount weeklyCount={1} weeklyTarget={3} />
    );
    const title = getByText('Read');
    const flat = Array.isArray(title.props.style)
      ? Object.assign({}, ...title.props.style.flat())
      : title.props.style;
    expect(flat.textDecorationLine).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/unit/markRow.test.tsx -v`
Expected: FAIL — `done` is not a prop, no strikethrough, no `accessibilityState`.

- [ ] **Step 3: Add the `done` prop to the interface**

In `components/ui/MarkRow.tsx`, add to the props interface (near `loggedToday?: boolean;` at line 50):

```typescript
  done?: boolean;
```

- [ ] **Step 4: Destructure and apply it**

Add `done` to the destructured params (near `loggedToday,` at line 65):

```typescript
  done,
```

Set `accessibilityState` on the container `TouchableOpacity` (the one opening at line ~90):

```tsx
    <TouchableOpacity
      style={[styles.row, !isLast && [styles.border, { borderBottomColor: c.borderLight }]]}
      onPress={onPress}
      onLongPress={onLongPress}
      activeOpacity={onPress ? 0.7 : 1}
      accessibilityState={done ? { checked: true } : undefined}
    >
```

Apply the strikethrough to the title `Text` (line ~109):

```tsx
        <Text style={[styles.title, { color: c.inkDark }, done && styles.titleDone]}>{title}</Text>
```

Add the `titleDone` style to the `StyleSheet.create` block (next to `title` at line 169):

```typescript
  titleDone: {
    textDecorationLine: 'line-through',
  },
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest tests/unit/markRow.test.tsx -v`
Expected: PASS

- [ ] **Step 6: Wire `focus.tsx` to pass `done`**

In `app/(tabs)/focus.tsx`, add `done={isDoneForWeek}` to the `MarkRow` call inside `renderMarkRow` (alongside `loggedToday={isDoneForWeek}` at line ~333):

```tsx
              <MarkRow
                title={mark.name}
                category={category}
                loggedToday={isDoneForWeek}
                done={isDoneForWeek}
                onPress={() => router.push(`/mark/${mark.id}` as any)}
                onLog={() => handleQuickIncrement(mark.id)}
                onLongPress={() => handleMarkLongPress(mark.id, mark.name)}
                isLast={isLast}
                showWeeklyCount
                weeklyCount={weeklyCount}
                weeklyTarget={weeklyTarget}
              />
```

- [ ] **Step 7: Run full suite slice + type-check**

Run: `npx jest tests/unit/markRow.test.tsx && npx tsc --noEmit`
Expected: tests PASS, tsc exits 0.

- [ ] **Step 8: Commit**

```bash
git add tests/unit/markRow.test.tsx components/ui/MarkRow.tsx "app/(tabs)/focus.tsx"
git commit -m "fix(a11y): non-opacity done cue on MarkRow + focus.tsx (2.4)"
```

---

### Task 5: Replace opacity-only disabled cue in `MarkFrequencyPicker` (2.4)

`MarkFrequencyPicker` disables chips with `chipDisabled` opacity 0.45 and `chipTextDisabled` opacity 0.6 (`:145-153`). It already sets `accessibilityState={{ selected, disabled }}` (`:105`), so screen readers are covered, but sighted users get state-by-opacity. Give disabled chips a non-opacity visual: muted text color and muted border from tokens, dropping the text opacity.

**Files:**
- Modify: `components/ui/MarkFrequencyPicker.tsx` (`chipTextDisabled` style `:151-153`, and the disabled-chip style composition `:97` / `:113`)
- Test: `tests/unit/markFrequencyPicker.test.ts` (extend existing)

**Interfaces:**
- No prop changes. Disabled chips render with a muted color cue instead of opacity alone; `accessibilityState.disabled` remains.

- [ ] **Step 1: Read the existing test file**

Run: `sed -n '1,40p' tests/unit/markFrequencyPicker.test.ts`
Note the import style and how it renders the picker (theme mock, props).

- [ ] **Step 2: Write the failing test**

Append a test asserting a disabled chip uses a muted *color* (not opacity). Match the existing file's render helper; the assertion:

```typescript
it('signals disabled chips with a muted color, not opacity alone', () => {
  const { getByText } = render(
    <MarkFrequencyPicker mark={baseMark} onChange={() => {}} disabled />
  );
  const chipText = getByText('2'); // a frequency chip label rendered by the picker
  const flat = Array.isArray(chipText.props.style)
    ? Object.assign({}, ...chipText.props.style.flat())
    : chipText.props.style;
  expect(flat.opacity).toBeUndefined();
  expect(typeof flat.color).toBe('string');
});
```

(If the existing file already defines `baseMark`/render helpers, reuse them rather than redefining.)

- [ ] **Step 3: Run test to verify it fails**

Run: `npx jest tests/unit/markFrequencyPicker.test.ts -v`
Expected: FAIL — `chipTextDisabled` currently sets `opacity: 0.6` and no color.

- [ ] **Step 4: Replace the opacity cue with a color cue**

In `components/ui/MarkFrequencyPicker.tsx`, remove the opacity-based `chipTextDisabled` style entirely (delete the `chipTextDisabled: { opacity: 0.6 }` block and its `disabled && styles.chipTextDisabled` usage). The disabled cue becomes a muted *color* plus a dashed border, not opacity.

Where the disabled chip text color is composed (the `chipText` render around line 113), give disabled text a muted token color. Locate the chip `Text` and set its color dynamically when disabled, e.g.:

```tsx
              style={[
                styles.chipText,
                { color: disabled ? c.inkMuted : c.inkDark },
              ]}
```

Remove `opacity: 0.45` from `chipDisabled`, replacing it with a muted border so the chip outline reads as inactive:

```typescript
  chipDisabled: {
    borderStyle: 'dashed',
  },
```

(Use the picker's existing themed `c` color object; if `c.inkMuted`/`c.inkDark` are not the exact token names in this file, use the muted/primary ink tokens it already imports.)

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest tests/unit/markFrequencyPicker.test.ts -v`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add tests/unit/markFrequencyPicker.test.ts components/ui/MarkFrequencyPicker.tsx
git commit -m "fix(a11y): non-opacity disabled cue on MarkFrequencyPicker (2.4)"
```

---

### Task 6: Add `accessibilityState` to onboarding review-mark rows (2.4)

The onboarding "suggested marks" rows (`app/onboarding.tsx:374`) already convey selection visually three ways (check icon, muted text color, opacity), but the `TouchableOpacity` exposes no `accessibilityRole`/`accessibilityState`, so the selection state is invisible to assistive tech. Add them. This is a single low-risk attribute on a heavy full-screen component; verified by type-check, lint, and code review rather than a full-screen render test.

**Files:**
- Modify: `app/onboarding.tsx:374-378` (the review-mark `TouchableOpacity`)

**Interfaces:**
- No signature change.

- [ ] **Step 1: Add the a11y attributes**

In `app/onboarding.tsx`, on the review-mark `TouchableOpacity` (line ~374), add role and state:

```tsx
                  <TouchableOpacity
                    key={i}
                    style={[styles.reviewMarkRow, !selected && styles.markRowDeselected]}
                    activeOpacity={0.75}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: selected }}
                    onPress={() => {
```

- [ ] **Step 2: Type-check and lint**

Run: `npx tsc --noEmit && npx eslint app/onboarding.tsx`
Expected: both exit 0, no eslint output.

- [ ] **Step 3: Commit**

```bash
git add app/onboarding.tsx
git commit -m "fix(a11y): expose selection state on onboarding mark rows (2.4)"
```

---

### Task 7: Phase 2.9 doc edits — scrub brand names, resolve the thesis, voice-rule, follow-ups

Doc-only. Implements the 2.9 spec (`docs/superpowers/specs/2026-06-22-anti-reference-naming-design.md`): scrub every competitor brand name from committed artifacts (describe lanes by behavior), replace the "taste moat" stress point with the "release its grip" thesis, add the no-brand-names voice rule, and record the two follow-ups in ROADMAP. No code; verified by grep.

**Files:**
- Modify: `PRODUCT.md` (lines 353, 356, 372, 374, 381-384 region, and the Copy-formatting section ~`:264`)
- Modify: `docs/superpowers/specs/2026-06-17-momentum-design.md:112`
- Modify: `ROADMAP.md` (2.9 item `:136`, and a new follow-ups subsection)

**Interfaces:** none (documentation).

- [ ] **Step 1: Scrub brand names in PRODUCT.md, replace with behavioral categories**

Apply these replacements (preserve surrounding wording, swap only the brand reference):
- `:353` "Gamified streak apps (Duolingo-style guilt, ...)" → "Gamified streak apps (punishing-streak guilt, ...)"
- `:356` "Cluttered dashboards (Notion/enterprise density ...)" → "Cluttered dashboards (configurable-dashboard / enterprise density ...)"
- `:372` table row "Streak / gamified apps (Duolingo-style, streak trackers)" → "Streak / gamified apps (punishing-streak trackers)"
- `:374` table row "Notion-style / productivity tools" → "Configurable productivity tools"

- [ ] **Step 2: Replace the stress-point callout with the resolved thesis**

Replace the `PRODUCT.md:380-384` blockquote (the "taste moat, not structural" stress point naming the four warm brands) with a RESOLVED note carrying the D1 thesis and naming the lane by behavior, matching the 2.7 "RESOLVED" pattern:

```markdown
> **Stress point RESOLVED (Phase 2.9):** The competitive lane that matters is the warm,
> non-punishing wellness / mood companions, not the gamified apps. Livra's wedge is
> structural, not taste: it is designed to release its grip. Completing a goal ends the
> pressure of active pursuit, not the relationship. You return for your next goal, not every
> day, and the habits you built persist. An incumbent whose revenue depends on daily-active
> users cannot adopt that rhythm without punishing its own core metric. It can copy a
> single-goal screen; it cannot copy a model that is glad to let you rest. Resolved by the
> anti-reference naming spec (`docs/superpowers/specs/2026-06-22-anti-reference-naming-design.md`).
```

- [ ] **Step 3: Add the no-brand-names voice rule**

In PRODUCT.md's **Voice & Copy → Copy formatting** section (after the dash-rule paragraph ~`:269`), add:

```markdown
**No competitor brand names in any committed artifact.** Docs, specs, and shipped copy
describe competitive lanes by behavior (what they optimize for), never by brand. This keeps
positioning honest and keeps the repo free of names we would not market at a user. Enforced
by review.
```

- [ ] **Step 4: Scrub the momentum spec line**

In `docs/superpowers/specs/2026-06-17-momentum-design.md:112`, replace "Finch-adjacent" with "wellness-companion-adjacent".

- [ ] **Step 5: Tick 2.9 and add the two follow-ups in ROADMAP.md**

Change the `ROADMAP.md` 2.9 line from `- [ ]` to `- [x]` with a DONE note referencing this plan. Then add a new subsection after Phase 2 (before "Launch gate"):

```markdown
## Phase 3 — Tracked follow-ups (from 2.9)

- [ ] **3.1 — Post-completion marks (maintenance mode).** Marks persist in `lc_counters`
  after `completeGoal` (`state/goalsSlice.ts`) but no surface shows a mark once its goal is
  done (`app/(tabs)/focus.tsx` renders only `status === 'active'` goals). Build a first-class
  way to keep a habit going after its goal completes, so the "habits persist" positioning is
  real. Needs its own brainstorm.
- [ ] **3.2 — Business-coherence edge-case sweep.** Audit the app for other places where
  behavior contradicts the "finish and rest" model (3.1 is one instance). Run after this
  Phase 2 tail bundle merges.
```

- [ ] **Step 6: Verify zero brand names remain in tracked files**

Run:

```bash
grep -rniE "finch|stoic|daylio|fabulous|duolingo|notion" --include=*.md --include=*.ts --include=*.tsx . \
  | grep -v node_modules | grep -v "package-lock" | grep -v "/.claude/worktrees/"
```

Expected: no output.

- [ ] **Step 7: Commit**

```bash
git add PRODUCT.md docs/superpowers/specs/2026-06-17-momentum-design.md ROADMAP.md
git commit -m "docs(2.9): scrub brand names, resolve wedge thesis, record follow-ups"
```

---

### Task 8: Whole-bundle verification gate

Confirm the entire bundle is green before requesting final review.

**Files:** none (verification only).

- [ ] **Step 1: Full unit suite**

Run: `npm run test`
Expected: all suites pass (baseline was 710 tests after the voice merge; this bundle adds the Task 1/2/4/5 tests).

- [ ] **Step 2: Type-check**

Run: `npm run type-check`
Expected: exit 0.

- [ ] **Step 3: Lint changed files**

Run: `npx eslint lib/db/devTools.ts state/goalsSlice.ts app/diagnostics.tsx services/behaviorNotifications.ts components/ui/MarkRow.tsx "app/(tabs)/focus.tsx" components/ui/MarkFrequencyPicker.tsx app/onboarding.tsx`
Expected: exit 0, no output.

- [ ] **Step 4: Brand-name scrub re-check**

Run the Task 7 Step 6 grep again. Expected: no output.

- [ ] **Step 5: Roadmap reconciliation**

Run: `grep -nE "2\.4 —|2\.9 —" ROADMAP.md`
Expected: both show `- [x]`.

- [ ] **Step 6: Final commit (if any verification fixups were needed)**

```bash
git add -A
git commit -m "chore(phase2-tail): verification gate green" --allow-empty
```

---

## Self-Review

**Spec coverage (against the 2.9 spec + roadmap items):**
- D1 thesis → Task 7 Step 2. ✓
- D2 scrub + behavioral categories → Task 7 Steps 1, 4. ✓
- D3 voice-rule → Task 7 Step 3. ✓
- D4.1 maintenance-marks + D4.2 audit → Task 7 Step 5 (Phase 3 stubs). ✓
- 2.4 focus.tsx → Task 4; MarkFrequencyPicker → Task 5; onboarding → Task 6. ✓
- Phase 1 deferred minors: `assertDevToolsAccess` → Task 1; per-goal try/catch → Task 2; `handleBrokenStreak` rename + `anyStreakAtRisk` JSDoc → Task 3. ✓

**Placeholder scan:** No TBD/TODO. Task 5/6 note where exact token names must be confirmed against the file (`c.inkMuted`/`c.inkDark`) rather than guessing hex — consistent with the tokens-only constraint.

**Type consistency:** `done` prop named identically in MarkRow (Task 4) and the focus.tsx call. `seedBrokenMomentum`, `evaluateActiveGoalsMomentum`, `handleBrokenMomentum`, `anyStreakAtRisk` match their source files as read. `MomentumSnapshot` shape used in Task 2's test matches the engine's `{ state, days, cushionRemaining, slippingMarkId }`.

**Known verification caveat:** Task 6 (onboarding) ships an a11y attribute without a render test because the onboarding screen is impractical to mount in isolation; it is gated by type-check + lint + review instead. Flagged honestly rather than faking a test.
