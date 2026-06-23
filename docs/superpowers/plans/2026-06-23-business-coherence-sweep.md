# Business-Coherence Edge-Case Sweep Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sweep Livra for surfaces whose behavior contradicts the "designed to release its grip / finish and rest" business model, fix the clear-cut contradictions inline (TDD), and spin out the larger ones as new ROADMAP items.

**Architecture:** One investigative task produces a findings table and pauses for an interactive owner walk (the "hybrid" working style). Then TDD fix tasks address the two clear-cut findings already verified in recon — dead streak-era copy and under-enforced dash rule — plus a docs task that records every deferred finding as a new ROADMAP item. A final gate verifies the Definition of Done and checks off 3.1.

**Tech Stack:** TypeScript 5.9, Jest (`jest-expo`), React Native / Expo. No new dependencies.

## Global Constraints

- No em-dash, en-dash, or hyphen-as-dash in user-facing copy (PRODUCT.md:262). This plan extends enforcement of that rule.
- No banned pattern reintroduced: brittle streaks, guilt copy, manufactured urgency, paywalled core loop.
- Color tokens from `theme/colors` / `theme/tokens` only; no hardcoded hex.
- Tests live in `tests/unit/*.test.ts`. Run with `npm run test`.
- Definition of Done: full unit suite green, `npm run type-check` clean, `npm run lint` clean on new/changed files.
- Branch: work continues on `docs/product-direction` (matching where 3.1/3.2 commits already live).

---

### Task 1: Complete the sweep + findings table + interactive walk

This task is investigative, not TDD. Its deliverable is a findings document and a locked fix/defer split agreed with the owner. No production code changes here.

**Files:**
- Create: `docs/superpowers/specs/2026-06-23-business-coherence-sweep-findings.md`

**Interfaces:**
- Produces: the locked list of clear-cut fixes (consumed by Tasks 2–3) and the deferred/spun-out list (consumed by Task 4).

- [ ] **Step 1: Apply the rubric to every surface not yet deeply swept.**

The spec already recon-verified Notifications, Home/Focus, and the copy module. Apply the
severity rubric (S1 live / S2 landmine / S3 enforcement-gap / S4 ambiguous) to the
remaining surfaces, reading each file:
- Completion + closure: `app/goal/complete.tsx`, `app/goal/milestone.tsx`, `state/goalsSlice.ts` (`completeGoal`), the completion overlay component, and the all-complete closure state (2.5).
- Goals tab: `app/(tabs)/goals.tsx` empty/first-run vs finished-everything states; `components/goals/HistoryRow.tsx`; `app/goal/history.tsx`.
- Onboarding / paywall: `app/onboarding.tsx`, `app/paywall.tsx`, `components/CommitmentScreen.tsx`.
- Momentum surfaces: confirm `components/GoalMomentum.tsx` / `MomentumBanner` reintroduce no daily pressure.

For each finding record: id, surface (file:line), severity, the reading(s), a recommendation, and a proposed disposition (fix-inline vs spin-out).

- [ ] **Step 2: Write the findings table into the findings doc.**

Seed it with the four recon-verified findings from the spec (dead streak copy, dash-rule
gap, CommitmentScreen S4, expired-goal orphans) plus everything Step 1 surfaces. Mark the
"aligned, no action" surfaces explicitly so coverage is auditable.

- [ ] **Step 3: Commit the findings doc.**

```bash
git add docs/superpowers/specs/2026-06-23-business-coherence-sweep-findings.md
git commit -m "docs(3.1): business-coherence sweep findings table"
```

- [ ] **Step 4: STOP — interactive owner walk.**

Present the findings table to the owner. Walk the surfaces they care about; add edge cases
they raise; settle every S4 (fix vs accept). Lock the final fix/defer split. Update the
findings doc with the decisions and amend the commit. Do not start Task 2 until the owner
has locked the split. If the walk promotes additional clear-cut fixes beyond Tasks 2–3,
append them as extra TDD tasks following the same RED→GREEN→commit shape.

---

### Task 2: Remove dead streak-era copy

`getDailyHeader`, `getWeekArc`, `getPostLogMessage`, `getWeekSentimentHeader` in
`lib/copy.ts` have zero consumers (verified across `app/ components/ lib/ services/`) and
carry the old streak/daily-pressure model. Remove them and their now-unused state types.
A guard test locks them from returning.

**Files:**
- Create: `tests/unit/copyDeadExportsRemoved.test.ts`
- Modify: `lib/copy.ts` (delete the 4 functions + their `HeaderState`/`WeekArcState`/`PostLogState`/`WeekSentimentState` types/interfaces and the `DailyHeader` return type if unused elsewhere)

**Interfaces:**
- Consumes: the locked fix list from Task 1.
- Produces: nothing; `lib/copy.ts` retains `getMomentum*Copy`, `TERMS`, `GOAL_LIMIT_MESSAGE`.

- [ ] **Step 1: Write the failing guard test.**

```ts
import * as copy from '../../lib/copy';

describe('dead streak-era copy is removed', () => {
  it.each([
    'getDailyHeader',
    'getWeekArc',
    'getPostLogMessage',
    'getWeekSentimentHeader',
  ])('%s is no longer exported', (name) => {
    expect((copy as Record<string, unknown>)[name]).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails.**

Run: `npx jest tests/unit/copyDeadExportsRemoved.test.ts`
Expected: FAIL — the four exports are still defined (`toBeUndefined` fails).

- [ ] **Step 3: Delete the dead functions and their types.**

In `lib/copy.ts` remove the four `export function` blocks (`getDailyHeader`, `getWeekArc`,
`getPostLogMessage`, `getWeekSentimentHeader`) and the interfaces/types used only by them
(`HeaderState`, `DailyHeader`, `WeekArcState`, `PostLogState`, `WeekSentimentState`). Before
removing each type, grep to confirm no other consumer:

Run: `grep -rn "HeaderState\|WeekArcState\|PostLogState\|WeekSentimentState\|DailyHeader" app/ components/ lib/ services/ | grep -v "lib/copy.ts"`
Expected: no output (safe to delete). Keep any type that still has an external consumer.

- [ ] **Step 4: Run the guard test + full suite to verify green.**

Run: `npx jest tests/unit/copyDeadExportsRemoved.test.ts && npm run test`
Expected: guard test PASS; full suite PASS (no consumer broke because there were none).

- [ ] **Step 5: Type-check.**

Run: `npm run type-check`
Expected: clean.

- [ ] **Step 6: Commit.**

```bash
git add lib/copy.ts tests/unit/copyDeadExportsRemoved.test.ts
git commit -m "refactor(3.1): delete dead streak-era copy from lib/copy.ts"
```

---

### Task 3: Extend dash-rule enforcement to inline screen copy + clean violations

`tests/unit/copyDashRule.test.ts` only covers `lib/copy.ts` + `lib/weeklyReflectionCopy.ts`.
Inline copy in `app/` + `components/` `.tsx` files escapes it (24 files carry em/en dashes).
Add a test that flags **prose** dashes (em/en dash with a word character on both sides) in
those files, while NOT false-positiving on lone `'—'` placeholder cells or `— /price`
decorative separators (per the spec's exclusions). Then clean the prose violations.

**Files:**
- Create: `tests/unit/inlineCopyDashRule.test.ts`
- Modify (clean prose dashes): `app/(tabs)/focus.tsx`, `app/(tabs)/settings.tsx`, `app/goal/complete.tsx`, `app/goal/milestone.tsx`, `app/goal/[id].tsx`, `app/mark/[id]/index.tsx`, `components/CommitmentScreen.tsx`, `app/paywall.tsx`, `app/index.tsx` (and any further files the test reports)

**Interfaces:**
- Consumes: the locked fix list from Task 1.
- Produces: an enforced prose-dash ban over `app/**/*.tsx` + `components/**/*.tsx`.

- [ ] **Step 1: Write the failing test.**

```ts
import { readFileSync, readdirSync } from 'fs';
import { join, relative } from 'path';

const ROOT = join(__dirname, '../../');

// Prose dash = em/en dash with a word char on both sides (optionally spaces between):
// "it — but", "yet — tap", "syncing—try". Does NOT match a lone "—" placeholder cell,
// nor "— /month" / "— $price" decorative separators (non-word char after the dash).
const PROSE_DASH = /\w[ \t]*[—–][ \t]*\w/;

// Strip comments so dashes in code comments/JSDoc (e.g. "MarkCard — Livra 2.0",
// "3–6 → ...") are not flagged. Order matters: block comments first.
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

// Dependency-free recursive walk for .tsx files under the given roots.
function walkTsx(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      walkTsx(full, out);
    } else if (entry.name.endsWith('.tsx')) {
      out.push(relative(ROOT, full));
    }
  }
  return out;
}

const FILES = [
  ...walkTsx(join(ROOT, 'app')),
  ...walkTsx(join(ROOT, 'components')),
];

describe('prose dash ban over inline screen copy', () => {
  it.each(FILES)('%s has no prose em/en dash', (rel) => {
    const src = stripComments(readFileSync(join(ROOT, rel), 'utf8'));
    const offenders = src
      .split('\n')
      .map((line, i) => ({ line: line.trim(), n: i + 1 }))
      .filter(({ line }) => PROSE_DASH.test(line));
    expect(offenders.map((o) => `${o.n}: ${o.line}`)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails.**

Run: `npx jest tests/unit/inlineCopyDashRule.test.ts`
Expected: FAIL — offenders reported, including `app/(tabs)/focus.tsx:363`, `:573`,
`app/(tabs)/settings.tsx:391`, `app/goal/complete.tsx:172`, `app/goal/milestone.tsx:74`,
`app/goal/[id].tsx:135`, `app/mark/[id]/index.tsx:739`, `components/CommitmentScreen.tsx:269`,
`app/paywall.tsx:57` and `:618`, `app/index.tsx:34`.

- [ ] **Step 3: Clean every reported prose dash.**

Replace the em/en dash with a comma, period, or "to" (for ranges) so the sentence reads
naturally. Exact replacements for the known offenders:
- `app/(tabs)/focus.tsx:363` and `app/mark/[id]/index.tsx:739`: `Rest is part of it — but if you want one more, go for it.` → `Rest is part of it, but if you want one more, go for it.`
- `app/(tabs)/focus.tsx:573`: `No marks yet — tap + to add your first one.` → `No marks yet. Tap + to add your first one.`
- `app/(tabs)/settings.tsx:391`: `Verification email sent — check your inbox.` → `Verification email sent. Check your inbox.`
- `app/goal/complete.tsx:172` and `app/goal/milestone.tsx:74`: `Write anything — or skip.` → `Write anything, or skip.`
- `app/goal/[id].tsx:135`: `Done — it's mine` → `Done, it's mine`
- `components/CommitmentScreen.tsx:269`: `That's not failure — that's just Tuesday.` → `That's not failure. That's just Tuesday.` (the "Keep going anyway" S4 wording is handled per the Task 1 walk decision, not here)
- `app/paywall.tsx:57`: `Sleep, Workout, Steps — synced automatically.` → `Sleep, Workout, Steps. Synced automatically.`
- `app/paywall.tsx:618`: `Entitlements syncing—try again in a moment.` → `Entitlements syncing, try again in a moment.`
- `app/index.tsx:34`: `Loading timeout — proceeding with fallback` → `Loading timeout, proceeding with fallback` (log string; harmless to de-dash, keeps the rule simple)

Leave untouched (correctly NOT flagged): lone `'—'` placeholder cells in `app/diagnostics.tsx`,
`app/paywall.tsx` debug rows, `app/settings/profile.tsx`; the `— /month` / `— /year` /
`— ${selectedPrice}` price separators in `app/paywall.tsx`; dashes inside code comments.

- [ ] **Step 4: Run the test to verify it passes.**

Run: `npx jest tests/unit/inlineCopyDashRule.test.ts`
Expected: PASS. If new offenders appear, clean them the same way until green.

- [ ] **Step 5: Run the full suite + lint on changed files.**

Run: `npm run test && npx eslint app components --ext .tsx` (or lint just the changed files)
Expected: suite PASS; no new lint errors on changed files.

- [ ] **Step 6: Commit.**

```bash
git add tests/unit/inlineCopyDashRule.test.ts app components
git commit -m "fix(3.1): enforce + clean prose dash rule over inline screen copy"
```

---

### Task 4: Record deferred findings as new ROADMAP items

Every spun-out finding from the Task 1 walk becomes a new unchecked ROADMAP item so nothing
is lost. At minimum this includes the expired-goal orphans closure path.

**Files:**
- Modify: `ROADMAP.md` (Phase 3 follow-ups section)

**Interfaces:**
- Consumes: the deferred list from Task 1.

- [ ] **Step 1: Add a new unchecked item per deferred finding.**

Under Phase 3, add e.g.:

```markdown
- [ ] **3.3 — Expired-goal closure path.** A goal reaching `status: 'expired'`
  (`state/goalsSlice.ts`) orphans its marks the same way completion did before 3.2.
  Decide the closure UX (maintenance-graduate like 3.2, or a distinct expired off-ramp)
  and implement. Surfaced by the 3.1 coherence sweep.
```

Add one `- [ ]` item for each additional deferred finding from the walk, numbered in
sequence (3.4, 3.5, …), each naming the surface (file:line) and the decision needed.

- [ ] **Step 2: Commit.**

```bash
git add ROADMAP.md
git commit -m "docs(3.1): record sweep deferrals as new ROADMAP items"
```

---

### Task 5: Final verification gate + check off 3.1

**Files:**
- Modify: `ROADMAP.md` (tick 3.1)

- [ ] **Step 1: Run the full Definition-of-Done gate.**

Run: `npm run test && npm run type-check && npx eslint app components lib tests --ext .ts,.tsx`
Expected: full suite green; type-check clean; no NEW lint errors on changed files (the
pre-existing focus.tsx refs-during-render / preserve-manual-memoization backlog is allowed).

- [ ] **Step 2: Confirm no banned pattern was reintroduced.**

Run: `npx jest tests/unit/copyDashRule.test.ts tests/unit/inlineCopyDashRule.test.ts tests/unit/copyDeadExportsRemoved.test.ts`
Expected: all PASS.

- [ ] **Step 3: Tick 3.1 in ROADMAP.md** with a one-paragraph summary (what was fixed
  inline, what was spun out) mirroring the other completed items' style.

- [ ] **Step 4: Commit.**

```bash
git add ROADMAP.md
git commit -m "docs(3.1): mark business-coherence sweep complete"
```

---

## Self-Review

**Spec coverage:**
- Severity rubric (S1–S4) → applied in Task 1, drives dispositions. ✓
- Surfaces swept list → Task 1 Step 1 enumerates each. ✓
- Seeded finding #1 (dead copy) → Task 2. ✓
- Seeded finding #2 (dash rule) → Task 3, with the spec's exclusions encoded in `PROSE_DASH`. ✓
- Seeded finding #3 (CommitmentScreen S4) → Task 1 walk decides; dash cleaned in Task 3. ✓
- Seeded finding #4 (expired-goal orphans) → Task 4 (spin-out). ✓
- Hybrid working style (full findings → interactive walk → lock split) → Task 1 Steps 2–4. ✓
- Flag-don't-auto-decide for S4 → Task 1 Step 4 (owner settles S4). ✓
- Verification / Definition of Done → Task 5. ✓
- Spun-out items become ROADMAP entries → Task 4. ✓
- Scope boundary (coherence only, not general UX) → Task 1 records out-of-scope as non-actioned. ✓

**Placeholder scan:** No TBD/TODO. Every code step shows the actual test or replacement. The
only deliberately open-ended element is "additional walk-surfaced fixes," which is inherent
to the approved hybrid model and bounded by the same RED→GREEN→commit template.

**Type consistency:** `PROSE_DASH`, `stripComments`, and the export names
(`getDailyHeader` etc.) are used identically wherever referenced. Guard test asserts the
exact four removed names that Task 2 Step 3 deletes.
