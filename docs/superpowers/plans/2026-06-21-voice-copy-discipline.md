# Voice & Copy Discipline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Livra's voice rules enforceable — a written register boundary, canonical term definitions and recurring lines in one file, and a mechanical dash-rule test.

**Architecture:** Three workstreams built in dependency order. WS-A writes the register boundary into PRODUCT.md (doc only). WS-B adds a `TERMS` block and a shared goal-limit constant to `lib/copy.ts` and migrates the duplicate call sites. WS-C adds a Jest test that scans the copy modules for dashes, after cleaning existing violations.

**Tech Stack:** TypeScript 5.9 (strict), Jest (`jest-expo`), React Native / Expo. Copy lives in `lib/copy.ts` (pure, no RN imports).

## Global Constraints

- All user-facing copy is dash-free: no em-dash `—` (U+2014), no en-dash `–` (U+2013), no hyphen-as-dash. (PRODUCT.md `:262`)
- Color tokens from `theme/colors` / `theme/tokens` only; never hardcode hex. (CLAUDE.md)
- Zustand slices for persistent data; never `useState`. (CLAUDE.md) — not exercised here, but do not introduce violations.
- `lib/copy.ts` stays pure: no side effects, no React Native imports.
- Tests live in `tests/unit/*`. Write tests before shipping. (CLAUDE.md)
- Branch: `feat/voice-copy-discipline` (off `docs/product-direction`, already created).
- Commit messages end with the two trailers used in this repo (`Co-Authored-By:` and `Claude-Session:`); omitted from the snippets below for brevity — append them on each commit.

---

### Task 1: WS-A — Register boundary in PRODUCT.md (2.8)

Doc-only task. Deliverable: a written boundary a reviewer can apply, replacing the `:36` stress-point callout.

**Files:**
- Modify: `PRODUCT.md` (the `## Register` section near line 36)

- [ ] **Step 1: Replace the `:36` stress-point callout with a written boundary**

In `PRODUCT.md`, under `## Register`, after the existing "earned familiarity" paragraph, remove the `> **Stress point — resolve while building:** …` blockquote and replace it with:

```markdown
### Voice register boundary (resolves the stress point above)

Apply this per string. Classify each piece of copy as an **earned moment** or
**chrome**, then:

**Earned personality** (voice is wanted):
- Home greeting and the living header
- Mark-log confirmation
- Goal completion and the all-complete closure state
- Fixed first-use teaching moments (what's a mark, first missed day)
- Milestone moments (streak and momentum milestones)
- Inviting empty states (no goals yet)

**Plain chrome** (conventional copy only, no personality):
- Settings and every settings sub-screen
- Lists and list rows
- Forms, field labels, and placeholders
- Buttons and navigation
- Loading skeletons
- Error states (standard message plus retry, never a bare string)

A reviewer takes any screen, classifies each string by this list, and gets a
deterministic yes/no on whether personality belongs there. Resolved by
`docs/superpowers/specs/2026-06-21-voice-copy-discipline-design.md`.
```

(Note: the replacement text itself must be dash-free. Use commas/periods, not `—`.)

- [ ] **Step 2: Verify the callout is gone and the section exists**

Run: `grep -c "Stress point — resolve while building" PRODUCT.md` (expect the count to drop by one vs. before) and `grep -q "Voice register boundary" PRODUCT.md && echo OK`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add PRODUCT.md
git commit -m "docs(voice): write register boundary, resolve PRODUCT.md:36 (2.8)"
```

---

### Task 2: WS-B — `TERMS` definitions block in `lib/copy.ts` (2.6)

**Files:**
- Modify: `lib/copy.ts` (append a `TERMS` constant + header note)
- Test: `tests/unit/copyTerms.test.ts` (create)

**Interfaces:**
- Produces: `export const TERMS: { goal: string; mark: string; momentum: string; dailyHabit: string }` from `lib/copy.ts`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/copyTerms.test.ts`:

```typescript
import { TERMS } from '../../lib/copy';

describe('TERMS canonical definitions', () => {
  const keys = ['goal', 'mark', 'momentum', 'dailyHabit'] as const;

  it.each(keys)('defines a non-empty %s definition', (key) => {
    expect(typeof TERMS[key]).toBe('string');
    expect(TERMS[key].trim().length).toBeGreaterThan(0);
  });

  it('has no em-dash or en-dash in any definition', () => {
    for (const key of keys) {
      expect(TERMS[key]).not.toMatch(/[—–]/);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- copyTerms`
Expected: FAIL — `TERMS` is not exported from `lib/copy.ts`.

- [ ] **Step 3: Add the `TERMS` block to `lib/copy.ts`**

At the end of `lib/copy.ts`, append:

```typescript
// ─── Canonical term definitions (single source; screens import these) ────────
// New shared copy (anything shown on more than one screen, and every core-term
// definition) lives in this file. One-off copy may stay inline.

export const TERMS = {
  goal: "A goal is something you're working toward. Pick one or two that matter and give them the time.",
  mark: "A mark is one action you'll repeat toward your goal. Small, yours. Log it each time you show up.",
  momentum: "Momentum is how your effort adds up over time. Miss a day and it bends, it does not break.",
  dailyHabit: "A daily habit is a mark you keep on its own, not tied to any goal.",
} as const;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- copyTerms`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add lib/copy.ts tests/unit/copyTerms.test.ts
git commit -m "feat(copy): canonical TERMS definitions in lib/copy.ts (2.6)"
```

---

### Task 3: WS-B — Centralize the duplicated goal-limit line (2.6)

The string `Free keeps you to 2 goals at once so you can actually finish them. Livra+ opens unlimited goals.` is byte-identical at `app/goal/new.tsx:100` and `components/sheets/AddGoalSheet.tsx:156`. Lift it to one constant and import it at both sites.

**Files:**
- Modify: `lib/copy.ts` (add `GOAL_LIMIT_MESSAGE`)
- Modify: `app/goal/new.tsx:100`
- Modify: `components/sheets/AddGoalSheet.tsx:156`
- Test: `tests/unit/copyGoalLimit.test.ts` (create)

**Interfaces:**
- Consumes: nothing.
- Produces: `export const GOAL_LIMIT_MESSAGE: string` from `lib/copy.ts`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/copyGoalLimit.test.ts`:

```typescript
import { readFileSync } from 'fs';
import { join } from 'path';
import { GOAL_LIMIT_MESSAGE } from '../../lib/copy';

describe('GOAL_LIMIT_MESSAGE centralization', () => {
  it('matches the expected copy and is dash-free', () => {
    expect(GOAL_LIMIT_MESSAGE).toBe(
      'Free keeps you to 2 goals at once so you can actually finish them. Livra+ opens unlimited goals.',
    );
    expect(GOAL_LIMIT_MESSAGE).not.toMatch(/[—–]/);
  });

  it('is not re-typed as an inline literal in the call sites', () => {
    const sites = ['app/goal/new.tsx', 'components/sheets/AddGoalSheet.tsx'];
    for (const rel of sites) {
      const src = readFileSync(join(__dirname, '../../', rel), 'utf8');
      expect(src).not.toContain(
        "'Free keeps you to 2 goals at once so you can actually finish them. Livra+ opens unlimited goals.'",
      );
      expect(src).toContain('GOAL_LIMIT_MESSAGE');
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- copyGoalLimit`
Expected: FAIL — `GOAL_LIMIT_MESSAGE` not exported.

- [ ] **Step 3: Add the constant to `lib/copy.ts`**

Below the `TERMS` block in `lib/copy.ts`, append:

```typescript
// ─── Recurring shared lines ──────────────────────────────────────────────────

/** Shown when a free user hits the 2-goal cap (goal/new + AddGoalSheet). */
export const GOAL_LIMIT_MESSAGE =
  'Free keeps you to 2 goals at once so you can actually finish them. Livra+ opens unlimited goals.';
```

- [ ] **Step 4: Replace the inline string at both call sites**

In `app/goal/new.tsx`: add `GOAL_LIMIT_MESSAGE` to the existing `import { … } from '@/lib/copy'` (create the import if absent), then replace the inline string at line 100 with `GOAL_LIMIT_MESSAGE`.

In `components/sheets/AddGoalSheet.tsx`: same — import `GOAL_LIMIT_MESSAGE` from `@/lib/copy` and replace the inline string at line 156 with `GOAL_LIMIT_MESSAGE`.

(Use the `@/*` path alias, matching the file's existing import style; if the file imports via relative paths, match that instead.)

- [ ] **Step 5: Run test + type-check to verify**

Run: `npm test -- copyGoalLimit` → Expected: PASS
Run: `npm run type-check` → Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add lib/copy.ts app/goal/new.tsx components/sheets/AddGoalSheet.tsx tests/unit/copyGoalLimit.test.ts
git commit -m "feat(copy): centralize goal-limit message, drop duplicate (2.6)"
```

---

### Task 4: WS-C — Dash-rule test over copy modules + cleanup (2.7)

Add the mechanical check and clean existing violations so it passes.

**Refinement (from planning):** em-dash/en-dash are scanned over the whole source text of the copy modules (those characters never appear in legitimate code, so comments are covered too). The hyphen-as-dash proxy ` - ` is checked **only inside quoted string literals**, because raw source contains arithmetic like `totalMarks - 1` that is not a copy violation.

**Files:**
- Test: `tests/unit/copyDashRule.test.ts` (create)
- Modify: `lib/copy.ts`, `lib/weeklyReflectionCopy.ts` (clean 10 existing em/en-dash occurrences)

- [ ] **Step 1: Write the failing test**

Create `tests/unit/copyDashRule.test.ts`:

```typescript
import { readFileSync } from 'fs';
import { join } from 'path';

const COPY_MODULES = ['lib/copy.ts', 'lib/weeklyReflectionCopy.ts'];

// Matches single-quoted, double-quoted, and backtick string literals (no escaped
// quote handling needed for our copy, which contains none).
const STRING_LITERAL = /'[^']*'|"[^"]*"|`[^`]*`/g;

function read(rel: string): string {
  return readFileSync(join(__dirname, '../../', rel), 'utf8');
}

describe('dash rule over copy modules', () => {
  it.each(COPY_MODULES)('%s has no em-dash or en-dash anywhere', (rel) => {
    const src = read(rel);
    const offenders = src
      .split('\n')
      .map((line, i) => ({ line, n: i + 1 }))
      .filter(({ line }) => /[—–]/.test(line));
    expect(offenders.map((o) => `${o.n}: ${o.line.trim()}`)).toEqual([]);
  });

  it.each(COPY_MODULES)('%s has no hyphen-as-dash inside string literals', (rel) => {
    const src = read(rel);
    const literals = src.match(STRING_LITERAL) ?? [];
    const offenders = literals.filter((lit) => / - /.test(lit));
    expect(offenders).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- copyDashRule`
Expected: FAIL — the em/en-dash case lists 10 offending lines across the two files.

- [ ] **Step 3: Clean the 10 em/en-dash occurrences**

Edit `lib/copy.ts` — replace each `—`/`–` (comments and strings) with dash-free punctuation:
- line 3 (comment): `Pure functions — no side effects` → `Pure functions, no side effects`
- line 20 (comment): `current Mon–Sun week` → `current Monday to Sunday week`
- line 58 (comment): `All marks done — streak` → `All marks done. Streak`
- line 84 (comment): `streak 5+ days — brevity` → `streak 5+ days, brevity`
- line 135 (comment): `more than 1 day in — Monday` → `more than 1 day in, so Monday`
- line 155 (string): `'Weekend incoming — the real test.'` → `'Weekend incoming. The real test.'`
- line 245 (comment): `Tracking screen — week sentiment header` → `Tracking screen, week sentiment header`

Edit `lib/weeklyReflectionCopy.ts`:
- line 16 (string): `some days — more than nothing.` → `some days, more than nothing.`
- line 21 (string): `start over — start Monday.` → `start over. Start Monday.`
- line 24 (string): `The hardest part is starting — you did that.` → `The hardest part is starting. You did that.`

(Confirm line numbers at edit time; the strings are the anchors. Keep wording in the calm voice.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- copyDashRule`
Expected: PASS (both cases, both files).

- [ ] **Step 5: Commit**

```bash
git add tests/unit/copyDashRule.test.ts lib/copy.ts lib/weeklyReflectionCopy.ts
git commit -m "test(copy): dash-rule check over copy modules + cleanup (2.7)"
```

---

### Task 5: Documentation closeout + final verification

**Files:**
- Modify: `PRODUCT.md` (`:262` and `:313` stress-point callouts → RESOLVED; convention note)
- Modify: `ROADMAP.md` (tick 2.6 / 2.7 / 2.8)

- [ ] **Step 1: Resolve PRODUCT.md `:262` and `:313`**

In `PRODUCT.md`, append a `RESOLVED` note (dash-free) to each callout pointing at the spec:
- `:262` (dash rule): note that a mechanical Jest check (`tests/unit/copyDashRule.test.ts`) now enforces em/en-dash over the copy modules and the ` - ` proxy inside string literals. Resolved by the voice-copy-discipline spec.
- `:313` (canonical definitions): note that `TERMS` in `lib/copy.ts` is the single source, with a convention that new shared copy lives there. Resolved by the spec.

- [ ] **Step 2: Tick ROADMAP items 2.6 / 2.7 / 2.8**

In `ROADMAP.md`, change `- [ ]` to `- [x]` for 2.6, 2.7, 2.8 and append a done-note in the 2.1/2.2/2.3 format, e.g.:

```markdown
- [x] **2.6 — Voice: one canonical definition per screen** (`PRODUCT.md:313`). DONE
  (feat/voice-copy-discipline): TERMS block in lib/copy.ts; goal-limit line centralized.
  Spec: docs/superpowers/specs/2026-06-21-voice-copy-discipline-design.md.
```

(Repeat for 2.7 — dash test; and 2.8 — register boundary.)

- [ ] **Step 3: Full verification**

Run: `npm test` → Expected: all suites pass (new: copyTerms, copyGoalLimit, copyDashRule).
Run: `npm run type-check` → Expected: no errors.
Run: `npm run lint` → Expected: clean on changed files.

- [ ] **Step 4: Verify no copy says a dash anywhere it shouldn't (sanity)**

Run: `grep -nP "[\x{2014}\x{2013}]" lib/copy.ts lib/weeklyReflectionCopy.ts`
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add PRODUCT.md ROADMAP.md
git commit -m "docs(voice): resolve PRODUCT.md:262/:313, tick ROADMAP 2.6/2.7/2.8"
```

---

## Self-Review

**Spec coverage:**
- §4 register boundary → Task 1 ✓
- §5.1 TERMS definitions → Task 2 ✓
- §5.2 recurring lines (goal-limit) → Task 3 ✓
- §5.3 convention note → Task 2 Step 3 (copy.ts header) + Task 5 Step 1 (PRODUCT.md) ✓
- §6 dash test + cleanup → Task 4 ✓
- §6.1 refinement (literals-only ` - `) → Task 4 note + test ✓
- §7 docs closeout (`:36`/`:262`/`:313`, ROADMAP) → Task 1 + Task 5 ✓
- §8 testing → tests in Tasks 2/3/4 + Task 5 final run ✓

**Placeholder scan:** No TBD/TODO; all test and copy code is concrete; cleanup lists exact strings.

**Type consistency:** `TERMS` (object with `goal`/`mark`/`momentum`/`dailyHabit`) and `GOAL_LIMIT_MESSAGE` (string) are referenced consistently across tasks and tests.

**Note on §5.2 scope:** Only the byte-identical duplicate (goal/new + AddGoalSheet) is centralized. The related variants at `state/goalsSlice.ts:33` (the `GoalLimitError` message) and `app/paywall.tsx:52` (a feature-card description) are *different* sentences, so per the targeted scope they stay as-is.
