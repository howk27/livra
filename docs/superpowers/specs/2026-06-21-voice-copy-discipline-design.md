# Voice & Copy Discipline — Design Spec

**Date:** 2026-06-21
**Branch target:** `docs/product-direction` (implementation on `feat/voice-copy-discipline`)
**Roadmap items closed:** Phase 2.6 (canonical definitions), 2.7 (dash-rule enforcement), 2.8 (register boundary)
**PRODUCT.md stress points resolved:** `:36`, `:262`, `:313`

---

## 1. Purpose

Three Phase 2 stress points are the same problem from three angles: Livra's voice is
asserted but not *enforceable*. A reviewer cannot apply the register rule, the core term
definitions drift one screen at a time, and the dash rule is eyeballed and regresses. This
spec turns all three into things a reviewer or a test can actually check.

The unifying idea: **give each voice rule a home.** The register boundary gets a written,
applicable section in PRODUCT.md; the canonical definitions and recurring lines get a home
file (`lib/copy.ts`); the dash rule gets a mechanical test over that home file.

## 2. Decisions (locked during brainstorming)

1. **One combined spec**, three workstreams (2.8, 2.6, 2.7).
2. **Build order 2.8 → 2.6 → 2.7.** Each depends on the prior: the register boundary
   defines which lines earn canonical treatment; the canonical copy is what the dash test
   guards. (This reorders the roadmap's 2.6→2.8 listing for dependency reasons.)
3. **Dash rule enforced by a Jest test over the centralized copy modules**, not a broad
   app-wide grep and not a review-only note.
4. **Targeted centralization** for 2.6: the four term definitions plus lines that repeat
   across two or more screens. One-off inline strings are *not* migrated. A convention note
   establishes `lib/copy.ts` as the home for future *shared* copy.
5. **Hyphen-as-dash** is checked by the mechanical proxy ` - ` (space-hyphen-space); em-dash
   `—` and en-dash `–` are hard failures. The subjectivity limit is documented, per
   PRODUCT.md `:262`.

## 3. Out of scope

- Migrating every user-facing string into copy modules (rejected: scope creep, risky
  multi-screen refactor). Only definitions + recurring lines move.
- Rewriting the existing dynamic-copy functions in `lib/copy.ts` (header statements,
  post-log messages). They stay; the dash test simply also covers them.
- Voice canonicalization beyond the four core terms (Goal / Mark / Momentum / Daily-habit).
- Items 2.4 (a11y done-state) and 2.9 (anti-reference naming) — separate phases.

---

## 4. Workstream A — Register boundary (2.8)

**File:** `PRODUCT.md` only. No code.

### 4.1 The boundary
Replace the `:36` stress-point callout with a written, applicable "Voice register boundary"
subsection. The rule a reviewer applies, in two columns:

- **Earned personality** (voice is allowed and wanted):
  - Home greeting / living header
  - Mark-log confirmation ("That's one. It counts.")
  - Goal completion and the all-complete closure state
  - Fixed first-use teaching moments (what's a mark?, first missed day)
  - Milestone moments (streak/momentum milestones)
  - Inviting empty states (no goals yet)
- **Plain chrome** (no personality, conventional copy only):
  - Settings and all settings sub-screens
  - Lists and list rows
  - Forms, field labels, and placeholders
  - Buttons and navigation
  - Loading skeletons
  - Error states (standard message + retry; never a bare string)

### 4.2 Reconcile the surrounding doc
- Tie the new boundary to Design Principle #5 ("the tool disappears into the task") and the
  existing Do/Don't table (around `:262`) so the three sections agree rather than restate.
- Mark the `:36` stress-point callout RESOLVED with a one-line pointer to this spec.

### 4.3 Acceptance
A reviewer can take any screen, classify each string as "earned moment" or "chrome," and
get a deterministic yes/no on whether personality belongs there.

---

## 5. Workstream B — Canonical definitions + recurring lines (2.6)

**File:** `lib/copy.ts` (extend the existing module; no new file).

### 5.1 Term definitions
Add a `TERMS` block exporting the canonical one-line definition for each core term, used by
first-use teaching, tooltips, and inviting empty states:

- `TERMS.goal` — what a goal is
- `TERMS.mark` — what a mark is (canonical line already exists in the Do/Don't table:
  "A mark is one action you'll repeat toward your goal. Small, yours. Log it each time you
  show up.")
- `TERMS.momentum` — what momentum is (forgiving, not a streak)
- `TERMS.dailyHabit` — what a daily habit (un-goaled mark) is

Exact wording is drafted at implementation time against the Do/Don't table and current
in-app strings, and must obey the register boundary (WS-A) and the dash rule (WS-C).

### 5.2 Recurring lines
- **Planning-time audit:** grep for user-facing strings that appear (near-)identically on
  two or more screens. Candidates seen so far: the "what's a mark?" definition, goal-limit
  copy. Lift each into a named constant in `lib/copy.ts`.
- Migrate the affected screens to import the constant instead of re-typing the string.
- A string used on exactly one screen stays inline (targeted scope, decision 4).

### 5.3 Convention
- Add a short note to the `lib/copy.ts` header and to PRODUCT.md: **new *shared* copy
  (anything shown on more than one screen, and every core-term definition) lives in
  `lib/copy.ts`.** One-off copy may stay inline.
- Mark the `:313` stress-point callout RESOLVED.

### 5.4 Acceptance
The four definitions resolve from one place; no migrated line is typed in two screens.

---

## 6. Workstream C — Dash-rule enforcement (2.7)

**File:** `tests/unit/copyDashRule.test.ts` (new), plus a one-time cleanup pass.

### 6.1 The test
- Read the **source text** of the copy modules: `lib/copy.ts` and
  `lib/weeklyReflectionCopy.ts` (the new `TERMS` lives in `lib/copy.ts`, so it is covered).
- **Hard fail** on any em-dash `—` (U+2014) or en-dash `–` (U+2013).
- **Flag** the mechanical hyphen-as-dash proxy ` - ` (space-hyphen-space) as a failure.
- Source-text scan (not function invocation) so every string literal is covered regardless
  of which conditional branch produces it.
- The box-drawing section divider `─` (U+2500) is a different codepoint and does not match
  the dash characters, so existing `─── … ───` headers do not false-positive.

### 6.2 Cleanup
- Run the check, fix any existing violations in the copy modules (rephrase to comma, period,
  colon, or parentheses per the calm voice), until the test is green.

### 6.3 Scope and limits
- Coverage is intentionally scoped to the centralized copy modules. This is why WS-B lands
  first: as shared copy moves into `lib/copy.ts`, the test's reach grows with it.
- The ` - ` proxy will not catch a hyphen-as-dash written without surrounding spaces, and may
  in rare cases flag a legitimate spaced hyphen. This residual subjectivity is accepted and
  documented, per PRODUCT.md `:262` (mechanical check chosen over eyeball QA).
- Mark the `:262` stress-point callout RESOLVED.

---

## 7. Documentation closeout (required)

Part of this work, not a follow-up:

- **PRODUCT.md:** `:36` → RESOLVED (register boundary written), `:262` → RESOLVED
  (mechanical dash check), `:313` → RESOLVED (canonical definitions anchored). Each with a
  one-line pointer to this spec.
- **ROADMAP.md:** tick `[x]` for **2.6**, **2.7**, **2.8** with a short done-note
  (branch + spec path), matching the 2.1/2.2/2.3 format.

## 8. Testing (TDD throughout)

- **WS-B:** the four `TERMS` definitions exist and are non-empty; a representative migrated
  screen imports the shared constant rather than hardcoding it.
- **WS-C:** the dash test fails on a seeded em-dash/en-dash/` - ` fixture and passes on the
  cleaned copy modules.
- Full suite green, `type-check` clean, `lint` clean on changed files.

## 9. File touch list (anticipated)

- `PRODUCT.md` (register boundary, convention note, three stress points → RESOLVED)
- `lib/copy.ts` (TERMS block, recurring-line constants, header convention note)
- Screens importing newly-centralized recurring lines (identified by the WS-B audit)
- `tests/unit/copyDashRule.test.ts` (new), plus `tests/unit/*` for WS-B
- `ROADMAP.md` (tick 2.6 / 2.7 / 2.8)

## 10. Sequencing

WS-A → WS-B → WS-C. WS-A (the rulebook) is doc-only and unblocks the wording choices in
WS-B; WS-C depends on WS-B having centralized the copy it guards. Documentation closeout
(section 7) lands with the workstream that resolves each item, with a final pass to tick
ROADMAP.
