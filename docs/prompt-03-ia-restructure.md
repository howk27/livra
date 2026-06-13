# Phase 3 — Information Architecture Restructure
**Run mode:** Normal (type-check gated). Read target files before editing each.
**Depends on:** Phase 1 (mark weekly state) and Phase 2 (consistency, for the daily surface staying neutral).
**Source of truth:** `livra-product-decisions.md` (IA section) + redesign index.

Two coupled changes that must not ship apart: the tab set, and the Focus/Goals screen redesigns.

---

## Hard rules

1. Read each target file immediately before editing it (no edits from memory of the audit).
2. Commit after each task; `npm run type-check` passes before the next.
3. Tokens from `theme/` only. Handle empty/loading/error states on every screen touched.
4. No new packages. `react-native-reanimated` (already in stack) only, for animation.
5. Do not modify `state/` or other protected paths — this phase is UI/navigation only. If a store change seems required, stop and report.

---

## Decisions this phase encodes

**Tab set → Focus / Goals / Settings (3 tabs).**
- `Home` tab → renamed/rebuilt as **Focus**.
- `Queue` tab → repurposed and renamed **Goals**.
- `Marks` tab → **removed** (marks now live inside Focus).

**Focus tab (primary daily surface):**
- Active goal cards, **max 2**, front and center.
- Each goal card: title, progress, today's due marks **inline and checkable without navigation**.
- Completed marks **sink to the bottom of the card, compressed and dimmed**.
- **Max 4 marks visible per card**, "X more" expander if exceeded.
- Marks not linked to a goal → a secondary **collapsed "Daily habits"** section below the cards.
- **No daily ring** on this screen — goal cards with inline marks ARE the progress indicator.
- FAB stays (adding marks).
- When the last due mark of the day is logged, the card transitions to a completed state with a single line: **"That's today done. See you tomorrow."** Subtle Reanimated transition — no confetti, no XP popups.
- Daily surface is **neutral** — no "weeks strong," no streaks, no judgment. (Consistency lives in stats.)
- A mark in `doneForWeek` state (Phase 1) shows its rest line + quiet bonus log; it sinks like a completed mark for the day.

**Goals tab (planning view only — not a daily action surface):**
- Shows all goals: active, upcoming, completed.
- Goal reordering lives here.
- Add new goals from here.

---

## Task 1 — Tab set

- [ ] In `app/(tabs)/_layout.tsx`: rename the `home` screen to **Focus** (title + route); rename `queue` → **goals** (route AND title "Goals", `_layout.tsx:91-99`); **remove the `marks` registration** (`_layout.tsx:111`, currently `href:null`). Keep `settings`.
- [ ] **Full route rename `queue`→`goals`** (file `app/(tabs)/queue.tsx` → `goals.tsx`). Repoint the redirect in `app/weekly-review.tsx:8` (`/(tabs)/queue` → `/(tabs)/goals`). Grep for any other `(tabs)/queue`, `(tabs)/home`, `(tabs)/marks` refs and fix all. **Do NOT touch `/goal/queue`** — that is a different route (the management screen being merged in Task 2), not the tab.
- [ ] Confirm onboarding's final `router.replace` target is updated in Phase 4 (note it; don't change onboarding here).
- [ ] Type-check, commit.

---

## Task 2 — Goals tab (planning view) — MERGE, don't strand

The planning UI is currently split: the tab (`(tabs)/queue.tsx`) is a thin title-list + reorder, while the real planning content lives in the `app/goal/queue.tsx` **management screen** (active w/ progress, upcoming, completed toggle, complete/delete, add). The locked IA says the Goals tab shows *all goals + reorder + add from here* — so merge.

- [ ] Fold `goal/queue.tsx`'s planning content into the Goals tab: active goals **with progress**, upcoming list, a **completed** section, drag reorder (existing reanimated), and the add-goal entry. The tab becomes the single planning surface.
- [ ] **Scope guard — do NOT build a new goal-detail screen in Phase 3.** Per-goal management actions (mark-complete, target-date picker, "N more logs to unlock") stay reachable via the existing goal routes (`/goal/...`). Phase 3 owns the *list*; goal detail is a separate item.
- [ ] Strip daily-action affordances (this is planning, not a daily surface).
- [ ] Empty/loading/error states. Type-check, commit.

---

## Task 3 — Focus tab redesign

Current Focus (`app/(tabs)/focus.tsx`) is a Phase-5 rebuild + Phase-2 wiring: a flat `activeCounters.slice(0,5)` list, a stat strip (STREAK / THIS WEEK / GOALS), a progress banner with a daily streak, and the Phase-2 forgiveness line. The daily ring is already gone (Phase 5) — nothing to remove there.

**Remove from the daily surface (neutral-surface rule):**
- [ ] Daily streak — delete the `overallStreakDays` memo (`focus.tsx:101-117`), the streak haptic effect + `prevStreakRef` (`156-166`), the banner streak line (`273-278`), the `STREAK` stat cell (`284`), and now-unused imports (`Lightning`, `subDays`, streak `Haptics` usage). (Line numbers from audit; re-verify before editing — they shift.)
- [ ] **THIS WEEK stat cell** — remove it from the stat strip (week aggregate ≠ "today's state"). Consistency belongs in stats.
- [ ] **KEEP the forgiveness line** (`302-308`) and keep `computeWeek` wired to feed its `remaining`. This is the one weekly surface the locked spec puts on the daily view. Do not delete the consistency computation — only its standalone stat display.

**Build the new surface:**
- [ ] Goal card (net-new — compose from `MarkRow` + goal grouping via `mark.goal_id`/`goal.linked_mark_ids` + `getGoalProgress`): title, progress, inline due marks checkable in place (existing `onLog`/`incrementCounter` path), completed marks compressed/dimmed at the bottom, max 4 visible + "X more" expander.
- [ ] Render at most 2 active goal cards. Below them, the collapsed **"Daily habits"** section for goal-less marks.
- [ ] **Drive marks off Phase-1 weekly state, NOT daily `loggedToday`.** Focus currently uses `resolveDailyTarget`/`loggedToday`; switch to `markWeeklyState` + `computeCompletionsThisWeek` so `due` marks are checkable and `doneForWeek` marks show the rest line + quiet bonus log and sink for the day. `MarkRow` already supports the weekly-count display mode (`showWeeklyCount`/`weeklyCount`/`weeklyTarget`). Abstinence/fixed marks never show rest copy (Phase 1). **Without this the entire Phase-1 frequency model is invisible on the main surface.**
- [ ] Remove the dead "See all → `/(tabs)/marks`" affordance (`focus.tsx:315`) — the Marks tab is gone and Focus now surfaces everything via goal cards + the Daily habits expander.
- [ ] Last-due-mark-of-day → card completed state + "That's today done. See you tomorrow." via a subtle Reanimated transition.
- [ ] Keep the FAB (already present on Focus — no change).
- [ ] Empty/loading/error states. Type-check, commit. **Pause after this task for review.**

---

## Acceptance

- Exactly three tabs: Focus, Goals, Settings. No orphaned Marks tab; no dead routes (incl. no "See all → marks").
- Focus shows ≤2 goal cards with inline, in-place checkable marks; completed marks dimmed at card bottom; >4 marks collapses behind an expander.
- **Focus marks reflect Phase-1 weekly state** — a mark at its weekly target shows the rest line + bonus log and sinks, not just a daily check.
- No ring, no streak, no THIS WEEK aggregate on Focus. The forgiveness line is preserved (the one allowed weekly surface).
- Goal-less marks appear only in the collapsed "Daily habits" section.
- Finishing the day's last due mark shows the calm completion line with a subtle transition.
- Goals tab is the single planning surface (active w/ progress + upcoming + completed + reorder + add); no new goal-detail screen built. Type-check clean; `AUDIT_LOG.md` updated.