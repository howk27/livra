# Phase 1 — Mark Frequency Model
**Run mode:** AUDIT-ONLY FIRST. Do not write code on the first pass.
**Source of truth:** `livra-product-decisions.md` + redesign index.

This is the spine of the redesign. Consistency, the Focus tab, onboarding defaults, and the mark subtitle all read from this. Implement carefully — not rushed.

---

## PROTECTED-FILES EXCEPTION

This phase is explicitly authorized to modify the following protected paths **and no others**:

- `lib/db/index.ts` (SQLite migration only)
- `state/countersSlice.ts` (Mark model + frequency fields/actions)
- `supabase/migrations/` (new migration file only)

`hooks/useCounters.ts` and `lib/goalLogic.ts` remain protected. If you believe a change there is required, **stop and report** — do not edit them.

---

## Hard rules

1. First pass is **audit-only**: read the real files, produce the conflict report in `AUDIT_LOG.md`, then STOP. Wait for go-ahead before Task 2 onward.
2. Commit after each task. Type-check (`npm run type-check`) must pass before the next task.
3. Tests before shipping each unit of logic (`tests/unit/...`).
4. No new packages.
5. Color/spacing tokens from `theme/` constants only — never hardcode hex.

---

## Decisions this phase encodes

- Each library mark has a weekly frequency **range**: `min / recommended / max`. Example: Sleep = 7/7/7 (fixed), Workout = 2/3/5.
- A mark carries a chosen **weekly target** (defaults to `recommended`).
- **Fixed marks** (`min === max`) render a stated line ("Every night"), no editable control.
- Frequency is presented at mark creation as **preset chips generated from that mark's range**, recommended pre-selected, labeled in plain language ("3× a week"). Never a generic universal set, never a slider.
- **Count-based rest**: once `completionsThisWeek >= weeklyTarget`, the mark enters a *done-for-the-week* state. It is NOT locked — a quiet "one more this week" log stays available.
- **Bonus logs** (beyond target) increment the mark's streak/total but are **capped out of weekly-consistency math** (Phase 2 enforces the cap; this phase must not let bonus logs inflate any "counted" field).
- On no commitment answer, defaults fall back to **recommended for all marks** — never daily/7×.
- The **"items" subtitle bug**: replace the literal `unit` string on mark cards/detail with frequency phrasing ("3× a week" / "Every night" for fixed), or the linked goal name if present. Frequency is primary.

---

## Task 1 — AUDIT ONLY (read, report, stop)

Read and report on, without editing:

- [ ] `state/countersSlice.ts` — current `Mark` type. Inventory every existing field touching cadence/targets: `unit` (`'sessions'|'days'|'items'`), `schedule_type`, `schedule_days`, `dailyTarget`, `goal_value`, `goal_period`, `enable_streak`, `total`, `health_kit_type`. Note which are read anywhere.
- [ ] `lib/db/index.ts` — the marks table schema (`lc_*`), existing column-existence migration guard pattern, and how migrations are run on app update.
- [ ] Everywhere the literal subtitle renders (`grep -rn "items" components/ app/` for the `unit`-derived subtitle on mark cards and mark detail).
- [ ] Any existing weekly-window helper (`WEEK_START`, week-boundary util used by weekly reflection) — Phase 2 will reuse it; confirm it exists and where.
- [ ] The mark library / templates source (`lib/onboarding/markRecommendations.ts` `MARK_TEMPLATES`, and any `MARK_LIBRARY`). Report current per-mark fields so we know where to attach `min/recommended/max`.

Write to `AUDIT_LOG.md`:
1. Proposed new fields vs. existing fields, and any **collision/overlap** (e.g., does `dailyTarget` + `schedule_type` already half-express this?).
2. A reconciliation recommendation: extend existing fields or add new ones.
3. Every read site that will need updating when the subtitle/state changes.
4. Migration risk for existing users' marks.

**STOP. Do not proceed to Task 2 until the report is reviewed.**

---

## Task 2 — Frequency fields + migration

- [ ] Add to the `Mark` model (reconciled per audit): `frequency_min`, `frequency_recommended`, `frequency_max` (weekly ints), `weekly_target` (chosen int, defaults to `frequency_recommended`). Add a derived `isFixed = frequency_min === frequency_max` helper (computed, not stored).
- [ ] Migration in `lib/db/index.ts`. **Note: local persistence is an AsyncStorage-backed mock, NOT SQLite — there is no column-existence guard to reuse.** Build the migration using the existing `migrateCountersStorageKey` pattern, routing new fields through the generic parser (not positional params). **Backfill existing marks**: derive `weekly_target` from `schedule_days` (count of assigned days → weekly frequency) or `schedule_type` — **never from `dailyTarget`** (different dimension). Default `frequency_recommended = weekly_target`, `frequency_min = 1`, `frequency_max = 7` so nothing breaks.
- [ ] Matching Supabase migration file in `supabase/migrations/` (real Postgres — do not run it; note that the user runs `supabase db push` manually). Confirm the local mock and remote Supabase schemas don't drift.
- [ ] Library/template marks: assign `min/recommended/max` from the **archetype rule** below (keyed to the category the repo already assigns — `lib/markCategory.ts` / `MarkType`). Add a `frequencyKind` to each mark: `'variable' | 'fixed' | 'abstinence'`.

  | Archetype | Marks | min / rec / max | frequencyKind |
  |---|---|---|---|
  | Daily necessity | Sleep | 7 / 7 / 7 | fixed |
  | Abstinence | no_smoking, no_beer, no_sugar, no_spending, soda_free, screen_free | 7 / 7 / 7 | abstinence |
  | Hydration / movement | Water, Steps | 5 / 7 / 7 | variable |
  | Light wellness/mind | Meditation, Gratitude, Journaling, Reading, Language, Mood | 3 / 5 / 7 | variable |
  | Productivity | Planning, Tasks, Email | 3 / 5 / 7 | variable |
  | Cognitive (taxing) | Focus/Deep Work, Study | 3 / 4 / 6 | variable |
  | High-effort physical | Workout/Gym, Calories | 2 / 3 / 5 | variable |
  | Recovery (inverse) | Rest Day | 1 / 2 / 3 | variable |

  Custom (user-created) marks default to the light-wellness ladder (3/5/7), `variable`. Report the final per-mark assignment in `AUDIT_LOG.md` for any mark whose category is ambiguous.
- [ ] Type-check, test the migration guard, commit.

---

## Task 3 — Frequency presentation component

- [ ] Build a `MarkFrequencyPicker` that takes a mark's range and renders:
  - If `isFixed`: a stated line ("Every night"), no control.
  - Else: preset chips from `[min, recommended, max]` (dedupe), recommended pre-selected, labels in plain language ("Twice a week / 3× a week / 5× a week").
- [ ] Wire it into the mark **creation** and mark **detail** screens (detail allows post-setup change, per locked decision). Onboarding does NOT show this — it defaults silently (Phase 4).
- [ ] Tests for label generation and fixed-mark rendering. Type-check, commit.

---

## Task 4 — Weekly state: due / done-for-week / bonus

- [ ] **First establish the canonical week.** Three conflicting definitions exist (`getWeekRange` trailing-7, `startOfWeekISO` Sunday, `startOfWeekMonday` Monday). Create and export `currentWeekDates()` in `lib/features.ts` returning the 7 dates of the current **Monday-start ISO week** (consolidate onto `startOfWeekMonday`). Everything below and Phase 2 use only this. Do not migrate the existing weekly-reflection feature here — flag it in the log for Phase 2 to reconcile.
- [ ] Add a pure selector `markWeeklyState(mark, completionsThisWeek)` → `'due' | 'doneForWeek'`. `doneForWeek` when `completionsThisWeek >= weekly_target`. Fixed marks reach it only at 7/7.
  - **`completionsThisWeek` is defined precisely as: the count of DISTINCT DAYS in `currentWeekDates()` on which the mark met its daily bar.** Daily bar = `dailyTarget` if the mark has one (Water 8 bottles/day → that day counts only when the day's increments reach 8), else ≥1 increment. It is NOT the raw `lc_events` count and NOT the summed `amount` — a mark logged 3× in one day is one weekly occurrence, not three. Build this from `lc_events` filtered to the week (raw events are the source of truth; counts derive at read time).
- [ ] Mark interaction surfaces:
  - `due` → normal log.
  - `doneForWeek` → show the rest line ("You've hit your three this week. Rest is part of it — but if you want one more, go for it.") + a quiet secondary log button. **Do not block logging.** The bonus button uses the same log path as a normal log (`handleQuickIncrement`), inheriting whatever per-day behavior `resolveDailyTarget`/`dailyTarget` already provides. (Note: there is no `checkGatingRules`/`lib/gating.ts` in the live repo — an earlier reference to one was based on a stale snapshot. Do not build a gating layer.)
  - **`frequencyKind === 'abstinence'` (and `'fixed'`) NEVER show the rest/bonus copy** — you don't "rest" from not smoking. These read as a daily streak ("7 days clean" / logged-today), never "done for the week, rest now." Gate the rest message on `frequencyKind === 'variable'` only.
- [ ] Bonus logs are **normal `lc_events` increment events** (raw events are the source of truth; lifetime `total` is correctly incremented by them). **No write-path change is needed to protect consistency** — Phase 2 caps `counted` at `weekly_target` at READ time, so bonus logs cannot inflate the weekly-strong math. Add a test asserting the Phase 2 read-time cap excludes bonus-day occurrences beyond `weekly_target` (NOT a test that a write is suppressed). Do not modify the increment path in `hooks/useCounters.ts` (protected, not in this phase's exception).
- [ ] Type-check, tests, commit.

---

## Task 5 — Subtitle fix ("items" bug)

- [ ] Two render sites (from audit): `app/(tabs)/marks.tsx:121-123` (`{mark.unit}` subtitle) and `app/mark/[id]/index.tsx:617-618` (`{counter.unit}` heroMeta). Replace both with: frequency phrasing primary ("3× a week" / "Every night"), linked goal name secondary if the mark feeds a goal. Never render the raw `unit` string.
- [ ] Type-check, commit.

---

## Acceptance

- Existing users' marks survive migration with a sane `weekly_target`.
- A fixed mark shows no frequency control anywhere.
- A 3×/week mark reads "due" until the 3rd log that week, then "done for the week" with a working, non-blocking bonus log.
- Bonus logs never raise the consistency-counted value.
- No "items" string renders anywhere.
- `npm run type-check` clean; all new tests green; every change in `AUDIT_LOG.md`.