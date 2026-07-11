# Distinct Marks + Directive Goal Cards — Design

**Date:** 2026-07-11
**Status:** Approved by founder (design review in session)
**Risk:** Medium (user-facing core UX, AI generation behavior) — dispatcher intake required before implementation
**Problem source:** Founder device test 2026-07-08 — "felt like a calm noting app, goals not pulling forward." Root cause narrowed in intake 2026-07-11: onboarding's AI package suggests overlapping marks (e.g. Run + Steps for a fitness goal), so the Focus screen renders near-duplicate rows the same single activity satisfies. Logging feels like duplicate bookkeeping; the goal is a title above a flat checklist with nothing directive.

## Product decisions (founder, 2026-07-11)

1. Overlapping marks **should not exist** — one real-world effort = one mark. The fix is at creation, not display-time merging or linked-mark crediting.
2. The goal card's hero is **today's next step** — the goal tells you the one thing to do next.
3. The hero must be **time-feasible**: never suggest a daytime activity (e.g. a run) late at night. When nothing feasible remains, show a quiet "Tomorrow: X" instead — an appointment, not a nag.
4. Pre-launch: no migration or merge tooling for existing overlapping marks. Founder test data gets recreated.

## Part A — Marks are distinct efforts by construction

No data-model change. Two layers:

### A1. Edge Function prompt rule

`supabase/functions/ai-goal-generation/index.ts` — `buildSystemPrompt()` rules block gains:

- Each mark must be a separate real-world effort.
- Never suggest two marks that one single activity would satisfy (a run must not appear as both "Run" and "Steps").
- Prefer 2 distinct marks over 3 overlapping ones.

Verified manually against the deployed function (a redeploy is required for it to take effect).

### A2. Client safety net — overlap collapse in `validateAIGoalPackage`

`lib/ai/goalGeneration.ts` gains an icon → effort-category map; validation keeps the **first** mark per category and drops later ones. Runs on every package the client accepts (API and cache), so it also repairs cached packages and model slips.

Conservative pairs only:

| Category | Icons collapsed |
|---|---|
| movement | `gym`, `steps` |
| reflection | `gratitude`, `journaling` |
| deep-work | `focus`, `study` |

`tasks`/`planning` already collapse via `AI_ICON_TO_MARK_ID` (same mark id). `water`, `calories`, `sleep`, `rest`, `meditation`, `language` remain distinct — they are genuinely different efforts.

## Part B — Goal card leads with today's next feasible step

Focus screen goal card restructure (`app/(tabs)/focus.tsx`): **title → hero step → Momentum line → remaining mark rows** (existing `MarkRow`, unchanged), replacing title → flat rows.

### B1. Hero selection — `lib/nextStep.ts` (new, pure)

Among the goal's marks that are (a) due this week (`markWeeklyState === 'due'`), (b) not already logged today, and (c) time-feasible now: pick the mark **most behind** on its weekly target (lowest `weeklyCount / weeklyTarget`; ties broken by existing card order). Signature is pure — takes marks, counts, and a `Date` — for testability.

Hero renders as: `Today: Run · 2 of 3 this week` with the inline check-in button (same `CheckinButton` affordance as MarkRow).

### B2. Time feasibility — `timeAffinity` on MARK_LIBRARY

`lib/suggestedCounters.ts` entries gain `timeAffinity: 'anytime' | 'daytime' | 'evening'`, assigned by category heuristic:

- **daytime** — movement/exercise marks (workout, steps)
- **evening** — reading, journaling, gratitude, meditation, sleep
- **anytime** — water, calories, planning, focus, study, language, rest, and any unmapped/custom mark (custom marks default to `anytime`)

Windows: `daytime` marks are suggestible until **20:00** local; `evening` marks from **16:00**; `anytime` always. Constants live in `lib/nextStep.ts`.

### B3. Card states

1. **Step available** — hero shows the selected mark. After logging, the hero **promotes** to the next feasible due mark.
2. **Due marks exist but none feasible now** (the 10 pm Run case) — quiet `Tomorrow: Run` line, muted styling. No ask, no guilt; it doubles as a reason to return.
3. **Nothing due today / all clear** — calm done state: `That's this goal for today.` Consistent with the existing day-complete celebration; no extra fanfare.

### B4. Voice guardrails

The hero is an invitation, never a debt: it only ever names the *next* thing. No overdue language, no red, no "you missed", no countdowns. Momentum remains the ONE retention mechanic (2026-06-17 decision) and is untouched — the hero step is navigation, not a metric. Copy goes through `lib/copy.ts` conventions (no dashes-as-dashes rule applies).

## What does not change

- Data model, events, sync, `goal_mark_links`, Momentum engine and its evaluation cadence.
- `MarkRow`, weekly progress bars, rest line, daily-habits and maintenance sections, top progress banner, forgiveness line.
- Onboarding flow structure (only the generated package contents improve).

## Testing

- **A2:** unit tests — overlapping package in → one mark per category out; order preserved; cache-path package repaired; non-overlapping packages untouched; collapse never empties a package below 1 mark.
- **B1/B2:** unit tests for `nextStep` — most-behind wins; tie-break by order; logged-today excluded; daytime mark excluded after 20:00; evening mark excluded before 16:00; promotion after log; 10 pm-with-only-Run → tomorrow state; no due marks → all-clear state; custom marks treated as anytime.
- **B3:** component-level test of the three card states on Focus.
- **A1:** manual verification against the deployed Edge Function (generate for a fitness goal; assert no Run+Steps pairing).

## Rollback

Part A is prompt + validation, trivially revertible. Part B is UI + one pure module; revert restores the flat-row card. No stored data is written in a new shape.
