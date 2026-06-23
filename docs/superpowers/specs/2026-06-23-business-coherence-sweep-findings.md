# Business-coherence sweep — findings table

**Date:** 2026-06-23
**Plan:** `docs/superpowers/plans/2026-06-23-business-coherence-sweep.md`
**Spec:** `docs/superpowers/specs/2026-06-23-business-coherence-sweep-design.md`
**Rubric:** S1 live contradiction · S2 landmine (dead streak-era code) · S3 enforcement gap · S4 ambiguous (owner decides)

Question applied to every surface: *does this behavior match a product glad to let you
finish and rest, and return per-goal rather than per-day?*

## Findings

| ID | Surface (file:line) | Sev | Reading(s) | Recommendation | Disposition |
|----|---------------------|-----|------------|----------------|-------------|
| F1 | `lib/copy.ts` — `getDailyHeader`, `getWeekArc`, `getPostLogMessage`, `getWeekSentimentHeader` | S2 | Zero consumers (grep across `app/ components/ lib/ services/ hooks/ state/` → none). Carry old streak/daily-pressure model: "Come back tomorrow.", "Don't let Sunday slip.", "Most people stopped by now.", `brevity = urgency` comment. | Delete the 4 functions + their unused types (`HeaderState`/`WeekArcState`/`PostLogState`/`WeekSentimentState`/`DailyHeader`). | **Fix inline** (Task 2) |
| F2 | `app/**/*.tsx` + `components/**/*.tsx` prose dashes (10 prose offenders) | S3 | `copyDashRule.test.ts` only covers `lib/copy.ts` + `lib/weeklyReflectionCopy.ts`. Inline screen copy escapes it. Confirmed offenders: `app/index.tsx:34`, `app/paywall.tsx:57` & `:618`, `app/(tabs)/focus.tsx:363` & `:573`, `app/(tabs)/settings.tsx:391`, `app/goal/complete.tsx:172`, `app/goal/milestone.tsx:74`, `app/goal/[id].tsx:135`, `app/mark/[id]/index.tsx:739`, `components/CommitmentScreen.tsx:269`. | Add prose-dash test over `app/**`+`components/**`; clean the 10 offenders. Exclude lone `'—'` placeholder cells, decorative price separators, and code comments (`components/MarkCard.tsx:2`, `components/ui/MarkFrequencyPicker.tsx:14` correctly skipped via `stripComments`). | **Fix inline** (Task 3) |
| F3 | `components/CommitmentScreen.tsx:269` | S4 | "Life gets in the way. That's not failure — that's just Tuesday. Keep going anyway." Forgiving frame, but "Keep going anyway" brushes daily-pressure. Also carries a dash. | **Owner decision (2026-06-23 walk): soften** to "Life gets in the way. That's not failure. That's just Tuesday. Pick it back up when you can." (drops daily-pressure brush, removes dash). | **Fix inline** (Task 3) |
| F4 | `state/goalsSlice.ts:302-306` — `status: 'expired'` transition | S1 / spin-out | A goal reaching `expired` orphans its marks the same way completion did before 3.2. No closure UX. Touches data model + needs a design decision. | Spin out: design the expired closure path (maintenance-graduate like 3.2, or distinct off-ramp). | **Spin out** ROADMAP 3.3 (Task 4) |

## Aligned — no action (coverage audit)

| Surface | Verdict |
|---------|---------|
| `app/goal/complete.tsx` completion overlay | "Done. That one's yours forever." / all-complete "You finished everything you set out to do." + "WHAT YOU BUILT" / "Start your next goal". Treats completion as accomplishment, not dead-end. ✓ |
| `app/(tabs)/goals.tsx` empty/finished states | Distinguishes "You finished everything." / "Start your next goal when you are ready." vs "No goals yet." / "Add your first goal to begin." (2.5 distinction present). ✓ |
| `components/ui/GoalMomentum.tsx`, `components/ui/MomentumBanner.tsx` | Copy from presenter/props; calm "Momentum · N days", neutral when resting, fresh-start at zero, amber cushion only when slipping. No flame, no countdown, no daily literal. ✓ |
| `app/onboarding.tsx` | `enable_streak: false`; `schedule_type`/`dailyTarget` are data config, not user-facing pressure copy. ✓ |
| `app/paywall.tsx` | No daily-pressure lexicon ("every day"/"streak"/"don't lose"/"come back"). Only F2 dashes. ✓ |
| Momentum nudge copy, `TERMS`, greetings, `MASTER_NOTIF_SUBTITLE` | Verified in spec recon as forgiving post-repositioning voice. ✓ |

## Fix / defer split (LOCKED — owner walk 2026-06-23)

- **Fix inline (TDD):** F1 (Task 2), F2 (Task 3), F3 (Task 3, soften per walk decision).
- **Spin out (ROADMAP):** F4 → 3.3.
- No additional edge cases raised; no disposition changed from the proposal.

> **Status: split locked. Proceeding to Tasks 2–5.**
