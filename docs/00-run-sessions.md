# Livra Redesign — Session Runbook
Drop this in `./docs` alongside the index and the five phase prompts. Run **one session per block below**, in order. Don't combine two execute phases in one session — context bloat degrades quality.

**Before Session 1:** confirm `./docs/` contains `livra-redesign-index.md` and `prompt-01..05`, and that `AUDIT_LOG.md` exists at the repo root (create an empty one if not).

**Between every session:** review the diff/report, run the app, make sure the tree is committed clean before starting the next.

**Every EXECUTE prompt also reads `AUDIT_LOG.md` first** — it carries the audit findings and your confirmed decisions across the cold session boundary (a fresh session won't remember its own audit).

---

## Session 1 — Phase 1 Frequency (AUDIT)

```
Read ./docs/livra-redesign-index.md, then ./docs/prompt-01-frequency-model.md.
Run Task 1 (AUDIT ONLY). Do not write, edit, or create any code or migration —
read only. Produce the conflict report in AUDIT_LOG.md exactly as the doc
specifies, then STOP and summarize the report to me. Pay special attention to
whether existing fields (dailyTarget, schedule_type, unit) already half-express
the frequency model — if they do, flag it as a collision, do not resolve it.
```

## Session 2 — Phase 1 Frequency (EXECUTE)

```
The Phase 1 audit is reviewed and approved, including the confirmed 44-mark
frequency table in AUDIT_LOG.md Section 7. Read ./docs/livra-redesign-index.md,
./docs/prompt-01-frequency-model.md, AND AUDIT_LOG.md (it holds the architecture
findings — local persistence is an AsyncStorage-backed mock, NOT SQLite; use the
migrateCountersStorageKey pattern, and backfill weekly_target from schedule_days,
never dailyTarget). Execute Tasks 2 through 5 in order. Only touch files named in
the PROTECTED-FILES EXCEPTION; commit after each task; run `npm run type-check`
before moving to the next task and stop if it fails; write tests before shipping
logic; log every change to AUDIT_LOG.md. Do NOT run the Supabase migration — just
create the file. If anything conflicts with a locked decision, stop and report.
```

---

## Session 3 — Phase 2 Consistency (AUDIT)

```
Read ./docs/livra-redesign-index.md, then ./docs/prompt-02-consistency-engine.md,
then AUDIT_LOG.md. Run Task 1 (AUDIT ONLY), read only. The week is already decided:
use currentWeekDates() (Monday-start ISO) built in Phase 1 — confirm it exists and
that the completions query can use it; do NOT reuse any legacy week def. completions(m)
must mean distinct days meeting the daily bar (Phase 1 definition), not raw events.
Report the read-only completions query, reconcile the weekly-reflection feature onto
currentWeekDates(), and note where "weeks strong" displays. Write to AUDIT_LOG.md,
then STOP and summarize.
```

## Session 4 — Phase 2 Consistency (EXECUTE)

```
The Phase 2 audit is reviewed and approved. Read ./docs/livra-redesign-index.md,
./docs/prompt-02-consistency-engine.md, AND AUDIT_LOG.md. Execute Tasks 2 through 4.
Use currentWeekDates() (Monday ISO) — do NOT reuse any legacy week def. Keep
computeWeek pure and unit-tested; the @livra_consistency_history persistence is a
thin separate layer that evaluates only COMPLETED weeks on app open (never the
in-progress week). Task 3 consolidates the three duplicate week helpers; for
useWeeklyReview, target the last completed week and do NOT rewrite stored history —
report whether reviews are persisted or recomputed. Commit after each task;
type-check gates progression; log to AUDIT_LOG.md. If the engine needs anything
inside a protected file, stop and propose a read-only selector instead.
```

---

## Session 5 — Phase 3 IA Restructure (AUDIT)

```
Read ./docs/livra-redesign-index.md, then ./docs/prompt-03-ia-restructure.md, then
AUDIT_LOG.md. AUDIT ONLY — read, do not edit. Map before touching anything: what
app/(tabs)/focus.tsx renders today (Phase 2 just added the THIS WEEK stat + the
forgiveness line — the redesign must integrate these, not clobber them); what the
Marks tab does and every reference to (tabs)/marks that breaks if it's removed; what
components are shared between Marks and Focus; the current queue screen; the FAB
wiring; and whether any goal-card / inline-mark UI already exists. Report the daily
streak removal sites (focus.tsx:284,292). Write findings to AUDIT_LOG.md, STOP,
summarize.
```

## Session 6 — Phase 3 IA Restructure (EXECUTE)

```
The Phase 3 audit is reviewed and approved. Read ./docs/livra-redesign-index.md,
./docs/prompt-03-ia-restructure.md, AND AUDIT_LOG.md. This is UI/navigation only —
do NOT modify state/ or other protected paths; stop and report if a store change
seems required. Read each target file immediately before editing it. Execute Task 1
(tabs), then Task 2 (Goals planning view), then Task 3 (Focus redesign). Preserve the
THIS WEEK stat + forgiveness line Phase 2 added to focus.tsx — integrate them into the
goal-card layout. Commit after each task; `npm run type-check` must pass before the
next; handle empty/loading/error states on every screen touched; log to AUDIT_LOG.md.
Pause after Task 3 (Focus redesign) and let me review before anything else.
```

---

## Session 7 — Phase 4 Onboarding/AI (AUDIT) — DONE

Audit complete. Outcome: AI is greenfield; auth = Option B (every user signs up,
late/value-first); Phase 4 split into 4a (sequence) + 4b (AI). See 04a/04b docs.

## Session 8 — Phase 4a Onboarding Sequence (EXECUTE)

```
The Phase 4 audit is reviewed and approved. Read ./docs/livra-redesign-index.md,
./docs/prompt-04a-onboarding-sequence.md, AND AUDIT_LOG.md. Execute Tasks 2 through 4.
No AI in this phase — leave the goal-screen AI hatch stubbed/hidden (built in 4b).
Auth = Option B: screens 2-4 collect a draft into onboardingSlice; signup is screen 5;
only on signup success do completeOnboarding + createGoal + addMark fire with the new
userId, then land on Focus. Fix the two bugs: onboardingSlice is dead (screen uses
local useState — make the slice source of truth) and completeOnboarding is never
called (must set onboarding_completed). Commitment maps easing=2/min, steady=2/rec,
push=3/max; do NOT clamp daily marks. Do not touch CommitmentScreen (it serves
goal/new). Only the PROTECTED-FILES EXCEPTION paths. Commit per task; type-check gates;
tests; log to AUDIT_LOG.md.
```

## Session 9 — Phase 4b AI Goal Generation (EXECUTE)

```
Phase 4a is complete. Read ./docs/livra-redesign-index.md,
./docs/prompt-04b-ai-generation.md, AND AUDIT_LOG.md. Greenfield build — no AI exists
yet. Execute Tasks 1 through 3: lib/ai/goalGeneration.ts (fetch, no package) with the
output contract + validation; profiles.ai_uses_count + ai_goal_packages migration
(write, do NOT run); semantic cache check before any API call; free-use decrements
only on confirm+activate; regeneration cap of 2 per session; un-stub the hatch routing
through the mandatory editable review; manual fallback at every failure with the typed
goal preserved. Only the PROTECTED-FILES EXCEPTION paths. Commit per task; type-check
gates; tests; log to AUDIT_LOG.md.
```

---

## Session 10 — Phase 5 Premium Gating (AUDIT)

```
Read ./docs/livra-redesign-index.md, then ./docs/prompt-05-premium-gating.md.
Run Task 1 (AUDIT ONLY), read only. Report how the current mark cap works
(FREE_COUNTER_LIMIT — global today), the current goal cap, the paywall PRO_FEATURES
list, and CRITICALLY anything currently gating history/stats/presets/charts that the
locked model says must be free. Write to AUDIT_LOG.md, STOP, summarize.
```

## Session 11 — Phase 5 Premium Gating (EXECUTE)

```
The Phase 5 audit is reviewed and approved. Read ./docs/livra-redesign-index.md,
./docs/prompt-05-premium-gating.md, AND AUDIT_LOG.md. Execute Tasks 2 through 5.
Key change: mark cap goes from global to 3-per-goal; active goal cap is 2 free;
relocate the mark-cap upsell into the add-mark flow (marks.tsx was removed in Phase 3);
un-gate anything wrongly gating history/stats/presets. Soft upsell language only —
never block the core loop. Only touch the PROTECTED-FILES EXCEPTION paths
(hooks/useCounters.ts, state/goalsSlice.ts). Commit after each task; type-check gates;
tests for every gate; log to AUDIT_LOG.md. Do not change IAP product IDs or purchase
call sites.
```

---

## Two places to slow down

- **Run Phase 4a before 4b, and Phase 4 before Phase 5.** 4b un-stubs what 4a builds;
  Phase 5's paywall copy references the AI free-use logic 4b builds.
- **Every EXECUTE session reads AUDIT_LOG.md first** — it carries confirmed decisions
  and architecture findings across the cold session boundary.

---

## Session 12 — Phase 6 Monetization Hardening (EXECUTE)

```
The Phase 6 audit is complete. Read ./docs/livra-redesign-index.md,
./docs/prompt-06-monetization-hardening.md, AND AUDIT_LOG.md. Execute Tasks 1-4 IN
ORDER — each blocks the next. Task 1 first (RLS profile write hole — highest priority,
one migration, no client changes, confirm before Task 2). Task 2 (AI Edge Function:
key moves to Supabase secrets, client never sees it, free-use gated server-side with
service-role). Task 3 (RLS quantity constraints on marks/goals tables). Task 4
(restore Daily habits cap in lib/gating.ts + hooks/useCounters.ts). Only the
PROTECTED-FILES EXCEPTION paths. Write each migration, do NOT run any — user runs
supabase db push after all four are written. Commit per task; type-check gates; tests;
log to AUDIT_LOG.md. Stop after Task 1 and summarize before proceeding.
```
