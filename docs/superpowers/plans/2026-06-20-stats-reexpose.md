# Stats / History Re-expose Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the free history surface (`app/goal/history.tsx`) always reachable from the Goals tab, including for accounts with zero completed goals, so the `PRODUCT.md:436` "history & stats free, never gated" promise is reachable in-app.

**Architecture:** Extract the Goals-screen history entry into a small presentational component `HistoryRow` that renders unconditionally (the current entry is gated behind `completedCount > 0`, which hides it from every new user). Wire it into `goals.tsx` replacing the gated block. The history screen itself is unchanged — it is already free, empty-safe, and carries per-goal stats.

**Tech Stack:** React Native + Expo, TypeScript (strict), Zustand, `@testing-library/react-native` + `jest-expo`, phosphor-react-native, theme tokens (`theme/tokens`).

**Spec:** `docs/superpowers/specs/2026-06-20-stats-reexpose-design.md`

**Build branch:** `feat/stats-reexpose` off `docs/product-direction`.

## Global Constraints

- **No streaks / streak machinery.** Momentum is the model; do not reintroduce `computeStreak`, `StreakTimeline`, consistency-week streaks, or the deleted `(tabs)/stats.tsx`.
- **No dashes in user-facing copy** (`PRODUCT.md:262`): no em-dash, en-dash, or hyphen-as-dash. The `·` middot already in `history.tsx` is allowed (not a dash).
- **No Pro gate on history.** The surface must stay free.
- **Color tokens only** (`theme/tokens` / `theme/colors`) — never hardcoded hex. No inline styles except dynamic values (e.g. theme color); otherwise `StyleSheet.create`.
- **Tests before implementation (TDD).** New behavior covered by a failing test first.
- **Protected WIP — do not touch or stage:** `app/(tabs)/settings.tsx`, `app/_layout.tsx`, `app/settings/appearance.tsx`, `.semgrep/`. These carry unrelated uncommitted work; scope every commit to this part's files only.
- **Commands:** test `npm run test`, types `npm run type-check`, lint `npm run lint`.

---

### Task 1: `HistoryRow` presentational component

**Files:**
- Create: `components/goals/HistoryRow.tsx`
- Test: `tests/unit/historyRow.test.tsx`

**Interfaces:**
- Consumes: nothing from earlier tasks. Uses `useEffectiveTheme` (`state/uiSlice`), `themedColors`/`fonts`/`fontSize`/`spacing`/`radius` (`theme/tokens`), `CaretRight` (`phosphor-react-native`).
- Produces: `export function HistoryRow({ completedCount, onPress }: { completedCount: number; onPress: () => void }): JSX.Element`. Renders a `TouchableOpacity` with `testID="history-row"`, a primary label `History`, and a muted hint that is `"{completedCount} finished"` when `completedCount > 0` else `"Nothing finished yet"`. Used by Task 2.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/historyRow.test.tsx`:

```tsx
// tests/unit/historyRow.test.tsx
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { HistoryRow } from '../../components/goals/HistoryRow';

jest.mock('../../state/uiSlice', () => ({ useEffectiveTheme: () => 'light' }));

describe('HistoryRow', () => {
  it('renders the History label and empty hint with zero completed goals', () => {
    const { getByText } = render(<HistoryRow completedCount={0} onPress={() => {}} />);
    expect(getByText('History')).toBeTruthy();
    expect(getByText('Nothing finished yet')).toBeTruthy();
  });

  it('shows the finished count when there are completed goals', () => {
    const { getByText } = render(<HistoryRow completedCount={3} onPress={() => {}} />);
    expect(getByText('3 finished')).toBeTruthy();
  });

  it('calls onPress when the row is tapped', () => {
    const onPress = jest.fn();
    const { getByTestId } = render(<HistoryRow completedCount={0} onPress={onPress} />);
    fireEvent.press(getByTestId('history-row'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- historyRow`
Expected: FAIL — cannot find module `../../components/goals/HistoryRow`.

- [ ] **Step 3: Write the minimal implementation**

Create `components/goals/HistoryRow.tsx`:

```tsx
// components/goals/HistoryRow.tsx
// Always-visible entry to the free history surface (app/goal/history.tsx).
// Renders even with zero completions so "history & stats are free" is
// reachable in-app for new accounts (PRODUCT.md:436). No streaks, no Pro gate.
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { CaretRight } from 'phosphor-react-native';

import { fonts, fontSize, spacing, radius, themedColors } from '../../theme/tokens';
import { useEffectiveTheme } from '../../state/uiSlice';

export function HistoryRow({
  completedCount,
  onPress,
}: {
  completedCount: number;
  onPress: () => void;
}) {
  const theme = useEffectiveTheme();
  const c = themedColors(theme);
  const hint = completedCount > 0 ? `${completedCount} finished` : 'Nothing finished yet';
  return (
    <TouchableOpacity
      testID="history-row"
      style={[styles.row, { backgroundColor: c.surface }]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <View style={styles.textWrap}>
        <Text style={[styles.label, { color: c.inkMid }]}>History</Text>
        <Text style={[styles.hint, { color: c.inkMuted }]}>{hint}</Text>
      </View>
      <CaretRight size={16} color={c.inkMuted} weight="regular" />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    marginHorizontal: spacing.lg,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  textWrap: { gap: 2 },
  label: { fontFamily: fonts.sans, fontSize: fontSize.base },
  hint: { fontFamily: fonts.sans, fontSize: fontSize.sm },
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- historyRow`
Expected: PASS — all three tests green.

- [ ] **Step 5: Commit**

```bash
git add components/goals/HistoryRow.tsx tests/unit/historyRow.test.tsx
git commit -m "feat(history): always-visible HistoryRow component (Phase 2.1)"
```

---

### Task 2: Wire `HistoryRow` into the Goals screen

**Files:**
- Modify: `app/(tabs)/goals.tsx` (import; replace block at `441-456`; remove orphaned styles `completedRow` `592-600` and `completedLabel` `601-604`)

**Interfaces:**
- Consumes: `HistoryRow` from Task 1 (`components/goals/HistoryRow`). Reuses existing `completedCount` (`goals.tsx:332`) and `handleViewCompleted` (`goals.tsx:353-355`, pushes `/goal/history`).
- Produces: a Goals screen that renders the history entry unconditionally.

- [ ] **Step 1: Add the import**

In `app/(tabs)/goals.tsx`, after the existing component imports (the line `import { SectionLabel } from '../../components/ui/SectionLabel';` at line 30), add:

```tsx
import { HistoryRow } from '../../components/goals/HistoryRow';
```

- [ ] **Step 2: Replace the gated Completed block**

Replace this block (currently `app/(tabs)/goals.tsx:441-456`):

```tsx
        {/* Completed */}
        {completedCount > 0 && (
          <>
            <SectionLabel style={styles.sectionLabel}>COMPLETED</SectionLabel>
            <TouchableOpacity
              style={[styles.completedRow, { backgroundColor: c.surface }]}
              onPress={handleViewCompleted}
              activeOpacity={0.8}
            >
              <Text style={[styles.completedLabel, { color: c.inkMid }]}>
                {completedCount} goal{completedCount !== 1 ? 's' : ''} completed
              </Text>
              <CaretRight size={16} color={c.inkMuted} weight="regular" />
            </TouchableOpacity>
          </>
        )}
```

with:

```tsx
        {/* History — always reachable; free per PRODUCT.md:436 */}
        <HistoryRow completedCount={completedCount} onPress={handleViewCompleted} />
```

- [ ] **Step 3: Remove the now-orphaned styles**

In the `StyleSheet.create` block of `app/(tabs)/goals.tsx`, delete the `completedRow` and `completedLabel` style entries (and the `// Completed row` comment) at `592-604`:

```tsx
  // Completed row
  completedRow: {
    marginHorizontal: spacing.lg,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  completedLabel: {
    fontFamily: fonts.sans,
    fontSize: fontSize.base,
  },
```

Leave `CaretRight` and `SectionLabel` imports in place — both are still used elsewhere (`CaretRight` at lines 70/113; `SectionLabel` for ACTIVE/UP NEXT at 418/432).

- [ ] **Step 4: Type-check**

Run: `npm run type-check`
Expected: PASS — no unused-variable or missing-import errors from the edits. (If `Text`/`TouchableOpacity` are now unused in `goals.tsx`, confirm they are still referenced elsewhere in the file before removing; they are used by the active/queued cards, so leave them.)

- [ ] **Step 5: Run the full test suite**

Run: `npm run test`
Expected: PASS — full suite green, including `historyRow`.

- [ ] **Step 6: Commit**

```bash
git add "app/(tabs)/goals.tsx"
git commit -m "feat(history): always show history entry on Goals tab (Phase 2.1)"
```

---

### Task 3: Close the guardrail in the docs + final verification gate

**Files:**
- Modify: `PRODUCT.md` (the `:436` "Stats (pre-launch item)" + stress-point callout)
- Modify: `ROADMAP.md` (Phase 2.1 item)

**Interfaces:**
- Consumes: the shipped behavior from Tasks 1-2.
- Produces: docs that reflect the surface is now reachable; no code interface.

- [ ] **Step 1: Update the PRODUCT.md stats callout**

In `PRODUCT.md`, find the "Stats (pre-launch item)" note and the following "Stress point — resolve while building" paragraph (around `:436`). Replace the stress-point paragraph's claim that the surface is unreachable with a resolved note. Set the block to read (keep surrounding blockquote formatting):

```markdown
> **Stats (pre-launch item) — RESOLVED (Phase 2.1):** the history surface
> (`app/goal/history.tsx`) is free and now reachable in-app from the Goals tab via an
> always-visible History entry, including for accounts with zero completed goals. The
> "history & stats free, never gated" commitment is satisfied: free (no Pro gate), and
> reachable (no longer hidden behind a completed-count condition).
```

(Delete the old "the one free-tier promise the user *cannot reach in-app*" stress-point paragraph, since it no longer holds.)

- [ ] **Step 2: Tick and correct the ROADMAP item**

In `ROADMAP.md`, change the Phase 2.1 line. Replace:

```markdown
- [ ] **2.1 — Stats surface re-expose** (`PRODUCT.md:436`). Unhide + reroute the hidden `stats`
  tab so "history & stats are free" is reachable in-app. *(Next module after Momentum.)*
```

with:

```markdown
- [x] **2.1 — Stats surface re-expose** (`PRODUCT.md:436`). There was no hidden `stats` tab to
  unhide (`(tabs)/stats.tsx` was deleted in `2f53510`); the real gap was that the only in-app
  entry to the free `app/goal/history.tsx` was gated behind `completedCount > 0`, hiding it from
  new users. DONE (`feat/stats-reexpose`): extracted always-visible `components/goals/HistoryRow.tsx`,
  wired into `app/(tabs)/goals.tsx` (replacing the gated COMPLETED block). History stays free and
  empty-safe. Spec: `docs/superpowers/specs/2026-06-20-stats-reexpose-design.md`;
  plan: `docs/superpowers/plans/2026-06-20-stats-reexpose.md`.
```

- [ ] **Step 3: Commit the docs**

```bash
git add PRODUCT.md ROADMAP.md
git commit -m "docs(stats): close PRODUCT.md:436 guardrail + tick ROADMAP 2.1"
```

- [ ] **Step 4: Full suite**

Run: `npm run test`
Expected: PASS — all suites green.

- [ ] **Step 5: Type-check**

Run: `npm run type-check`
Expected: PASS (no errors).

- [ ] **Step 6: Lint changed files**

Run: `npm run lint`
Expected: No NEW violations versus the pre-branch baseline on `components/goals/HistoryRow.tsx`, `tests/unit/historyRow.test.tsx`, `app/(tabs)/goals.tsx`. (The repo carries known pre-existing lint problems; confirm the count/identity is unchanged by diffing against `docs/product-direction` if anything appears.)

- [ ] **Step 7: Confirm protected WIP untouched**

Run: `git status --short`
Expected: `app/(tabs)/settings.tsx`, `app/_layout.tsx`, `app/settings/appearance.tsx`, `.semgrep/` still show their original uncommitted state — none staged or modified by this branch.

---

## Notes for the implementer

- **The history screen is intentionally unchanged.** `app/goal/history.tsx` already handles empty (`count === 0` empty state), loading (via the store), and shows per-goal stats. Do not add charts, aggregate numbers, momentum, or streaks — that is explicitly out of scope (YAGNI).
- **Why a component, not an inline ungate:** the always-visible behavior is the regression that caused the guardrail failure, so it earns an isolated, unit-tested component (mirrors `MomentumBanner` / `GoalMomentum`).
- **Second entry point left as-is:** `app/goal/queue.tsx:276` also pushes to `/goal/history`; no change needed there.
