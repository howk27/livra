# Phase 2 — Weekly Consistency Engine
**Run mode:** AUDIT-ONLY FIRST.
**Depends on:** Phase 1 (`weekly_target` per mark).
**Source of truth:** `livra-product-decisions.md` + redesign index.

Replaces daily streaks (as a primary metric) with weekly consistency. Forgiveness is the whole point — never punishing.

---

## PROTECTED-FILES EXCEPTION

Authorized to add a pure engine file and read from the marks/events stores. **Not** authorized to modify `hooks/useCounters.ts`, `lib/goalLogic.ts`, `lib/db/`, or `supabase/`. If the engine needs an event-query helper that only exists inside a protected file, **stop and report** — propose a read-only selector instead.

---

## Hard rules

1. First pass audit-only → conflict report in `AUDIT_LOG.md` → STOP.
2. Pure functions, no side effects, fully unit-tested before any UI wiring.
3. Commit after each task; type-check gates progression.
4. No new packages. Tokens from `theme/` only.

---

## The locked formula

```ts
// active marks for the goal/scope; weeklyTarget(m) from Phase 1
// completions(m) = DISTINCT DAYS this week the mark met its daily bar (Phase 1 Task 4 definition) —
//   NOT raw event count, NOT summed amount. Use currentWeekDates() + the same daily-bar rule.
expected  = Σ weeklyTarget(m)
counted   = Σ min(completions(m), weeklyTarget(m))   // per-mark cap — bonus logs excluded
required  = Math.max(1, Math.round(0.70 * expected)) // 70% threshold, floor of 1
strong    = counted >= required
remaining = Math.max(0, required - counted)          // → "You need X more check-ins this week"
```

Rules that ride with it:

- **Aggregate, not per-mark.** A neglected mark cannot zero the week. This is intentional and stays — no neglect guard.
- **Sub-threshold weeks are neutral, not failures.** They simply don't increment the "weeks strong" counter. No red, no "you missed," same warm tone as a strong week ("X check-ins this week").
- **"X weeks strong" appears in the stats view only** — never on the daily surface (Focus).
- **No streak repair.** Rejected as predatory for this audience.
- The forgiveness line **"Still on track. You need X more check-ins this week."** uses `remaining` directly.

---

## Task 1 — AUDIT ONLY

- [ ] **Week definition: use the canonical `currentWeekDates()` (Monday-start ISO) established in Phase 1 Task 4.** Do NOT reuse any of the three legacy defs (`getWeekRange` trailing-7, `startOfWeekISO` Sunday, `startOfWeekMonday`). Reconcile the existing weekly-reflection feature onto `currentWeekDates()` here if it diverges; report what it used.
- [ ] Find how per-mark completions for a date range are queried today (events store / SQLite read path). Report the exact read-only call the engine can use.
- [ ] Confirm where "weeks strong" would be displayed (stats view) and that nothing currently writes a daily-streak value to the daily surface that this supersedes.
- [ ] Report any place a daily streak is currently shown as a primary metric so Phase 3 can remove it from the daily surface.

Write findings to `AUDIT_LOG.md`. **STOP.**

---

## Task 2 — `lib/consistency.ts` (pure)

- [ ] Implement `computeWeek(marks, completionsByMark, weekDates)` returning `{ expected, counted, required, strong, remaining }` per the formula. Per-mark completions capped at that mark's `weekly_target`.
- [ ] Implement `weeksStrong(history)` — **total** strong weeks (confirmed in audit; NOT consecutive — "consecutive" reintroduces the streak fragility this redesign rejects).
- [ ] **History persistence (thin layer, separate from the pure functions):** storage key `@livra_consistency_history` holding `{ weekStart, strong }[]`. **Write trigger:** on app open, if ≥1 Monday boundary has passed since the last recorded `weekStart`, evaluate each *completed* week with `computeWeek` and append its `{ weekStart, strong }`. Never evaluate the in-progress week into history. `computeWeek` stays pure — this layer calls it.
- [ ] Tests: cap excludes bonus logs; `remaining` matches the copy number; low-volume week rounding (e.g. expected=2 → required=max(1,round(1.4))=1); empty week; all-met week; history append skips the in-progress week and backfills multiple missed weeks on a late app open.
- [ ] Type-check, commit.

---

## Task 3 — Week-helper consolidation

Three duplicate week definitions must collapse onto `currentWeekDates()`:

- [ ] `app/(tabs)/tracking.tsx:88` — delete the private `getWeekDatesMondayFirst()`, import `currentWeekDates()`. Pure dedup, no behavior change (already Monday-start).
- [ ] `app/(tabs)/stats.tsx:40-47` — replace the inline Monday-start block with `currentWeekDates()`. Pure dedup.
- [ ] `hooks/useWeeklyReview.ts` — **behavior change:** migrate off `getWeekRange()` (trailing-7) to ISO week. The review must target the **last completed Mon–Sun week**, never a partial in-progress one (a mid-week review must not show a 2-3 day stub). **Do not rewrite or recompute stored historical reviews.** Report whether reviews are persisted snapshots (safe — only future reviews change) or recomputed on the fly (past weeks re-render on ISO boundaries — cosmetic, flag it).
- [ ] Type-check, commit.

---

## Task 4 — Copy wiring

- [ ] Forgiveness line consumes `remaining`: "Still on track. You need {remaining} more check-ins this week." Only show when `!strong && remaining > 0`.
- [ ] Sub-threshold completed week renders neutrally: "{counted} check-ins this week." No negative styling.
- [ ] "{weeksStrong} weeks strong" in the stats view only.
- [ ] Type-check, commit.

---

## Acceptance

- One neglected mark never zeroes a week of real effort.
- Bonus logs (Phase 1) never raise `counted`.
- `remaining` exactly equals the number in the forgiveness copy.
- No "weeks strong" or streak metric appears on Focus.
- Sub-threshold weeks are visually neutral.
- `@livra_consistency_history` accumulates one entry per completed week; the in-progress week is never recorded; a late app open backfills missed weeks.
- All three duplicate week helpers are gone — only `currentWeekDates()` remains. The weekly review shows a complete week, never a partial one, and no stored history was rewritten.
- Tests green; `AUDIT_LOG.md` updated.