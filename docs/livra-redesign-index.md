# Livra Redesign — Build Index
**Date:** June 11, 2026
**Source of truth:** `livra-product-decisions.md` (locked decisions) + this session's resolutions of the 6 open items.

This index ties the resolved open items to the Claude Code prompts and the order they must run in. Read it before running any phase.

---

## What got resolved this session

| Open item | Resolution |
|---|---|
| 1. Frequency presentation | Per-mark preset chips generated from the mark's own min/rec/max range, recommended pre-selected, plain-language ("3× a week"). Fixed marks (Sleep) show a stated line, no control. Default = **recommended** on no answer, never daily/7×. |
| 1b. Rest behavior | **Count-based**, not assigned weekdays. Once weekly target is met the mark moves to a *done-for-the-week* state with a quiet "one more this week" bonus log. Bonus logs feed the mark streak/total but **do not** count toward weekly consistency (cap holds). |
| 2. Commitment question | Reframed as capacity, copy: "What feels right for now?" → *Easing back in / Steady rhythm (default) / Push myself*. Maps to **mark count + frequency position**: easing = 2 marks/min, steady = 2 marks/recommended (3–4×), push = 3 marks/max (5×). Push is ambitious by design; steady is the default. |
| 3. Consistency threshold | **Aggregate, per-mark contribution capped at target, threshold 70%.** Produces the single "X more check-ins this week" number the locked copy needs. Sub-threshold weeks read neutrally, never as failures. |
| 4. Tab naming | Queue → **Goals**. Bundled with `Home → Focus` and **removing the Marks tab**. Final set: Focus / Goals / Settings. |
| 5. Onboarding sequence | Welcome → Goal input (+ AI escape hatch inline) → Commitment → Marks → Focus. AI path routes through the same mandatory review screen (which teaches the marks→goal model). |
| 5b. AI safeguards | Nothing auto-activated; mandatory editable review; typed goal never lost; free-use burns only on confirm; one package per generate; **regenerations capped at 2** per goal session (onboarding and Livra+). |
| 6. Bugs | Gear = Expo dev menu, **ignored**. "Items" subtitle fix folded into Phase 1 (frequency). |
| + Premium gating | Not an open item (model was locked), but the redesign **changes the gates** — handled in Phase 5: mark cap global→per-goal (3/goal), 2 active goals free, new feature split, paywall copy. |

---

## Build order (dependency-driven)

Frequency is the spine. Everything reads from it. Run in this order:

1. **`prompt-01-frequency-model.md`** — audit-first. Per-mark weekly frequency model, fixed marks, count-based rest + bonus log, schema migration, "items" subtitle fix. **Touches protected files — carries an explicit exception flag.**
2. **`prompt-02-consistency-engine.md`** — weekly aggregate (capped, 70%), "X more check-ins" copy, neutral sub-threshold weeks, "X weeks strong" in stats only. Depends on Phase 1's weekly target.
3. **`prompt-03-ia-restructure.md`** — tabs → Focus / Goals / Settings; Focus redesign (goal cards with inline marks now that mark state exists); Queue repurposed to Goals planning view.
4. **`prompt-04-onboarding-commitment-ai.md`** — full sequence, commitment screen, AI generation + safeguards. Depends on Phase 1 defaults and Phase 3 Focus landing.
5. **`prompt-05-premium-gating.md`** — audit-first. Realign Livra+ gates to the new model: mark cap global→per-goal (3/goal free), 2 active goals free, gate reordering/reminders/health/CSV/share/pace, keep history/stats/presets free, paywall copy. **Touches protected files — carries an explicit exception flag.** Depends on Phase 3 (Goals tab) and overlaps Phase 4 (AI gating lives there).

Phases 1, 2, and 5 are architecture and must each be run **audit-only first**, conflict report reviewed, then executed. Phases 3–4 can run normally but still gate on type-checks.

---

## Standing rules (apply to every phase)

- **Audit before execution** for any phase marked audit-first: run in read-only mode, produce a conflict report, stop. Do not write code until the report is reviewed.
- **Protected files** — never touch `state/`, `lib/db/`, `hooks/useCounters.ts`, `lib/goalLogic.ts`, or `supabase/` unless the phase carries an explicit **PROTECTED-FILES EXCEPTION** flag naming the exact files.
- **Commit after each task.** Co-author trailer per existing convention.
- **Type-checks gate progression.** `npm run type-check` must pass before moving to the next task. Tests written before shipping each feature.
- **Log every change to `AUDIT_LOG.md`.**
- **No new package installs** unless a phase explicitly authorizes one.
- **Local persistence is an AsyncStorage-backed mock, not SQLite.** Use the existing `migrateCountersStorageKey` migration pattern (generic parser, no positional params) — there is no SQLite column-existence guard. Supabase is real Postgres; keep local mock and remote schemas from drifting.
- **Deprecated, not deleted:** `schedule_type`/`schedule_days` are superseded by `weekly_target` (count-based). They stay in the type but no phase reads them for frequency, done-for-week, or consistency math. `goal_value`/`goal_period` are legacy quantity display only (`getGoalLabel`) — `weekly_target` is the single source of truth for frequency.
- **Canonical week:** `currentWeekDates()` in `lib/features.ts`, Monday-start ISO (consolidates the three conflicting legacy defs). All frequency/consistency math uses only this — one definition app-wide.
- All decisions trace back to `livra-product-decisions.md`. If a phase conflicts with a locked decision, stop and report — do not reconcile silently.
