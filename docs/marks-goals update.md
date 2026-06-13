# Livra — Marks & Goals Update
**Document for Claude Code**
**Version:** 2.0  
**Date:** 2026-06-09

---

## How to Use This Document

Read the entire document before touching any file. Execute tasks in the listed order. Each task ends with `npm run type-check` and a commit. Do not skip either. Append every file touched to `AUDIT_LOG.md` after each task.

**Before starting any task:** Read every file you plan to modify. Do not assume structure — verify it.

**Protected files — never modify unless a task explicitly instructs it:**
- `hooks/useCounters.ts` — Task 2 only, and only the specific addition described
- `lib/goalLogic.ts` — Task 2 only
- `state/` files not mentioned in a task
- `supabase/` — create migration files only, never modify existing ones

**On code:** Do not copy code from this document into files. This document describes what to build and why. Read the actual files, understand the existing patterns, and write code that fits them.

---

## Current State — What Exists and What Is Wrong

### Data model gaps
The `Mark` type has no `goal_id` field. The `Goal` type has no `linked_mark_ids` field. There is no data relationship between marks and goals anywhere in the codebase — not in the type system, not in SQLite, not in the stores. This is the root cause of most user-facing confusion.

### Check-in system is broken by design
`state/checkinsSlice.ts` and `app/checkin.tsx` implement a separate yes/no daily check-in. It is completely disconnected from mark logging. A user can complete all their marks and still show "0/10 check-ins" because the check-in requires a separate tap on a separate screen. This is confusing and must be replaced. Logging a mark that belongs to a goal IS the check-in.

### Goal progress counter is hardcoded
`app/goal/queue.tsx` shows "0 / 10 check-ins to complete". The `10` is a hardcoded literal. No `calculateUnlockThreshold` function exists. The Complete button has no real gate.

### Mark suggestion engine is fragmented
Three separate libraries exist with overlapping data and no connection to goal text:
- `lib/onboarding/markRecommendations.ts` — `MARK_TEMPLATES` (8 marks, used during onboarding flow)
- `lib/suggestedCounters.ts` — `SUGGESTED_MARKS_BY_CATEGORY` (different structure, used for stats display)
- `lib/markCategory.ts` — keyword matching for categorizing existing marks

None of these maps a goal title like "Run a marathon" to suggested marks like Workout, Running, Sleep, Water. That intelligence layer does not exist.

### Other surface bugs
- Checkmark icon renders as emoji (Ionicons fallback to Unicode)
- Notes in mark detail screen are lost on navigation (no auto-save)
- Preset chips in Add Mark screen visually respond but don't populate the form
- "See All" marks screen has a black background in light mode
- Splash screen has wrong-colored spinner; logo doesn't animate
- Home screen shows the same marks-today count twice
- Floating gear FAB appears on non-Settings screens
- No goal detail screen exists — tapping a goal does nothing meaningful
- No mark-to-goal link shown anywhere on the home screen

### Missing consumer app UX
- No "Delete account" in Settings (App Store requirement)
- Theme toggle is binary — no "Follow system" option
- No swipe-to-delete on mark rows
- No long-press context menu on mark cards
- No way to edit a goal title after creation

---

## TASK 1 — Data Model: Link Marks to Goals

### What to build
Add `goal_id` to the `Mark` type and SQLite schema. Add `linked_mark_ids` to the `Goal` type. Update the mock DB in `lib/db/index.ts` to handle the new field. Update `addMark` in `countersSlice` to accept and persist `goal_id`. Add `linkMarkToGoal` and `unlinkMarkFromGoal` actions to `goalsSlice`.

### Files to modify
`types/index.ts`, `types/goal.ts`, `lib/db/index.ts`, `state/countersSlice.ts`, `state/goalsSlice.ts`

### File to create
`supabase/migrations/20260609_goal_id_on_marks.sql` (documentation only — engineer applies manually via Supabase dashboard)

### What each change must accomplish

**`types/index.ts`:** Add `goal_id?: string | null` to the `Mark` type. Place it with the other optional feature fields at the bottom of the type, before the closing brace.

**`types/goal.ts`:** Add `linked_mark_ids?: string[]` to the `Goal` type. This is the reverse lookup — the goal knows which marks belong to it.

**`lib/db/index.ts`:** This file uses positional param-count matching for `INSERT INTO lc_counters` and `UPDATE lc_counters`. Before making any changes, read the entire INSERT and UPDATE handler blocks. Count the existing param-count cases. The `addMark` path in `countersSlice` currently inserts with a specific number of params — adding `goal_id` increments that count by one. Add a new INSERT case for the new param count that includes `goal_id`. For UPDATE, read whether the generic SQL-parsing fallback already handles new fields (it likely does via the SET clause parser) — if so, no new UPDATE case is needed; if not, add one.

**`state/countersSlice.ts`:** The `addMark` function's parameter object must accept `goal_id?: string | null`. The SQL INSERT must include `goal_id`. The returned `Mark` object must include `goal_id`. Verify that `addMark` returns the created mark — if it currently returns `void`, update it to return the `Mark` so callers can chain `linkMarkToGoal` after creation.

**`state/goalsSlice.ts`:** Add `linkMarkToGoal(goalId, markId)` and `unlinkMarkFromGoal(goalId, markId)` to both the interface and implementation. Both functions read the goal, update `linked_mark_ids`, call `upsertGoal`, and update store state. Add `markIds?: string[]` to the `addGoal` parameter type so goals can be created with marks already linked. Update the `addGoal` implementation to set `linked_mark_ids: markIds ?? []` on the new goal object.

**Supabase migration:** The `goals` table does not exist in Supabase (goals are AsyncStorage-only on device). The migration adds `goal_id text` to the `counters` table. Do not add a foreign key constraint since there is no Supabase `goals` table to reference.

### Commit message
`feat(data): add goal_id to Mark type and linked_mark_ids to Goal — SQLite + store wired`

---

## TASK 2 — Replace Check-in System with Mark-Log-Based Goal Progress

### What to build
Remove the disconnected yes/no check-in system. Logging a mark that has a `goal_id` is now the goal check-in. Goal progress = count of increment events for marks linked to that goal. Add `calculateGoalProgress` and `calculateUnlockThreshold` as pure functions. Update the goal queue screen to show real progress. Archive (do not delete) the old check-in files.

### Files to modify
`lib/goalLogic.ts`, `state/goalsSlice.ts`, `hooks/useCounters.ts` (protected — specific addition only), `app/goal/queue.tsx`, `app/(tabs)/home.tsx`, `app/_layout.tsx`

### Files to archive (rename, do not delete)
`app/checkin.tsx` → `app/checkin.tsx.archived`  
`components/CheckinButton.tsx` → `components/CheckinButton.tsx.archived`

### What each change must accomplish

**`lib/goalLogic.ts`:** Add two pure functions at the end of the file.

`calculateGoalProgress(goal, events, marks)` — counts increment events (not deleted) where the event's `mark_id` is in `goal.linked_mark_ids`. Returns 0 if `linked_mark_ids` is empty or undefined.

`calculateUnlockThreshold(goal)` — calculates the minimum progress required to enable the Complete button. Formula: floor of 80% of days since goal was created. Minimum 7, maximum 365. A goal created today has a threshold of 7 (the minimum applies immediately).

Import whatever types these functions need from the existing types at the top of the file.

**`state/goalsSlice.ts`:** Add a `getGoalProgress(goalId)` selector that returns `{ progress, threshold, canComplete }`. This function reads events and marks from their respective stores to compute values using the two new pure functions. Be careful about circular imports — if importing from `eventsSlice` or `countersSlice` directly causes a circular dependency, use `require()` inside the function body or move this logic to a custom hook instead.

**`hooks/useCounters.ts` (protected):** Find the `increment` function. After the existing increment logic completes and succeeds (after the DB write), add a fire-and-forget block that checks: if the logged mark has a `goal_id`, and that `goal_id` is in the active goal's `linked_mark_ids`, ensure the mark is properly linked (defensive check only — the data relationship should already exist at mark creation time). Wrap the entire addition in try/catch. Never propagate errors from this block.

**`app/goal/queue.tsx`:** Remove all references to `checkinsSlice` and `hasCheckedInToday`. Replace the hardcoded "0 / 10" display with values from `getGoalProgress`. The "X more check-ins to unlock" pill becomes informational text (muted, no tap action) when the goal is not yet completable. When `canComplete` is true, show an active Complete button in forest green `#1C3830`.

**`app/(tabs)/home.tsx`:** Remove the `<CheckinButton />` component and its import.

**`app/_layout.tsx`:** Remove the `checkin` Stack.Screen entry.

### Commit message
`feat(goals): replace disconnected check-in system with mark-log-based goal progress`

---

## TASK 3 — Goal Detail Screen

### What to build
Create `app/goal/[id].tsx`. This is the screen users reach by tapping a goal in the queue. It shows the goal title, real progress ring, linked marks list, target date, and a Complete or Delete action.

### Files to create
`app/goal/[id].tsx`

### Files to modify
`app/goal/queue.tsx`, `app/_layout.tsx`, `state/goalsSlice.ts`

### What each change must accomplish

**`app/_layout.tsx`:** Register `goal/[id]` as a modal stack screen with no header.

**`state/goalsSlice.ts`:** Add `updateGoalTitle(goalId, newTitle)` to the interface and implementation. Trims the title, requires at least 3 characters, calls `upsertGoal`, updates store state.

**`app/goal/queue.tsx`:** Wrap the active goal card in a pressable that navigates to `goal/[activeGoal.id]`. The `+` button at the top right continues to create new goals — do not change its behavior.

**`app/goal/[id].tsx`:** Read the goal by `id` from `useGoalsStore`. Read linked marks by filtering the marks store where `mark.goal_id === id`. Read progress using `getGoalProgress`.

The screen must show:
- Goal title as a heading (Libre Baskerville, large). Tapping the edit icon switches to inline text editing. Saving calls `updateGoalTitle`.
- A circular progress ring (use `react-native-svg`, which is already installed) showing `progress / threshold` with the numeric values labeled below it.
- Target date row. If not set, shows "Not set". Tapping opens a date picker (`@react-native-community/datetimepicker` is already installed). Saving calls `updateGoalTargetDate`.
- A "YOUR MARKS" section listing linked marks using the compact variant of `MarkCard`. If no marks are linked, show a message and a button that navigates to `counter/new` with the goal ID as a param.
- A Complete button when `canComplete` is true. On tap: calls `completeGoal`, then navigates to `goal/complete` if that route exists, otherwise navigates back.
- A Delete option at the bottom behind an Alert confirmation.

Design: follow the Material Warmth system. Background is `themeColors.background`. Cards use `themeColors.surface`. All icons use Phosphor. No Ionicons. No hardcoded colors except `#1C3830` for the Complete button.

### Commit message
`feat(goals): add goal detail screen with progress ring, linked marks, and edit actions`

---

## TASK 4 — Goal-Aware Mark Suggestion Engine

### What to build
Create `lib/goalMarkSuggestions.ts` — a pure function that takes a goal title string and returns an ordered list of mark suggestions. This replaces the fragmented suggestion approach and makes mark recommendations intelligent at the moment of goal creation.

Also: consolidate the mark library. `MARK_TEMPLATES` in `lib/onboarding/markRecommendations.ts` and `SUGGESTED_MARKS_BY_CATEGORY` in `lib/suggestedCounters.ts` have overlapping data in different formats. The new suggestion engine should read from `MARK_TEMPLATES` as the single source of truth for mark metadata, and `lib/suggestedCounters.ts` should import from there.

### Files to create
`lib/goalMarkSuggestions.ts`

### Files to modify
`app/goal/new.tsx`, `app/counter/new.tsx`, `lib/onboarding/markRecommendations.ts`

### What each change must accomplish

**`lib/goalMarkSuggestions.ts`:** The core of this task. Build a pure function `suggestMarksForGoal(goalTitle: string): MarkTemplate[]` that returns 2–4 mark suggestions ranked by relevance.

The function works by keyword matching against the goal title. It must cover at minimum these goal categories with their mark mappings:

- **Fitness / running / marathon / race / cardio / endurance:** Workout, Sleep, Water, Steps
- **Weight / body / lean / cut / bulk / muscle / strength:** Workout, Water, Sleep
- **Health / wellness / lifestyle / habit / routine:** Sleep, Workout, Water, Meditation (if in library)
- **Career / business / work / productivity / professional / launch / startup:** Focus, Planning, Practice
- **Learning / skill / language / read / study / course / book:** Reading, Practice, Focus
- **Finance / money / saving / invest / budget / debt:** Finance, Planning
- **Creative / write / art / music / design / build / create:** Practice, Focus
- **Mental / stress / anxiety / mind / calm / peace / meditat:** Sleep, Focus (or Meditation if in library)
- **Social / relationship / connect / family / friend:** No specific marks — fall back to Planning, Focus
- **Default (no keyword match):** Return Focus, Planning, Sleep — the three most universally useful marks

The matching is case-insensitive. A goal title can match multiple categories — in that case, merge the mark lists and deduplicate, preserving the order of the first match. Return a maximum of 4 marks.

Expand `MARK_TEMPLATES` in `lib/onboarding/markRecommendations.ts` if needed to cover marks referenced in the mappings above (e.g., Meditation, Steps) that don't currently exist in the library. Each new template needs: `name`, `identity_label`, `icon` (emoji), `default_color`, `health_kit_type`.

**`app/goal/new.tsx`:** After the user types a goal title (on blur of the input, or when they tap the primary CTA), call `suggestMarksForGoal(goalTitle)` and show the results as selectable mark chips. The user can select or deselect each suggestion. A "Create custom mark" option navigates to `counter/new` with the goal ID. On confirming the goal, pass selected mark IDs to `addGoal` as `markIds`, then create each selected mark with `goal_id` set to the new goal's ID.

**`app/counter/new.tsx`:** Accept an optional `goalId` route param. Add a "Link to goal" toggle that is on by default if an active goal exists or if a `goalId` param was passed. The active goal's title shows next to the toggle so the user knows what they're linking to. Pass `goal_id` to `addMark` when saving. After a successful save, call `linkMarkToGoal` if `goal_id` was set.

Also fix the preset chips: when a preset chip is tapped, it must populate the name field and set the icon type. Read `ICON_OPTIONS` in the file to find the exact string values used for each icon type — use those exact strings, do not guess.

### Commit message
`feat(marks): goal-aware mark suggestion engine — suggestMarksForGoal + consolidated mark library`

---

## TASK 5 — Wire goal_id Through All Creation Paths

### What to build
All mark creation paths must pass `goal_id` to `addMark`. The home screen mark cards must show the goal they belong to. The mark detail screen must show the goal context.

### Files to modify
`app/onboarding/recommendations.tsx`, `app/(tabs)/home.tsx`, `components/MarkCard.tsx`, `app/counter/[id].tsx`

### What each change must accomplish

**`app/onboarding/recommendations.tsx`:** Reverse the creation order: create the goal first (to get its ID), then create marks with `goal_id` set to the new goal's ID. After each mark is created, call `linkMarkToGoal(goalId, mark.id)`. This ensures marks and goals are linked from the first moment of use.

**`components/MarkCard.tsx`:** Add an optional `goalTitle` prop. When present, render it as a small subtitle below the mark name — single line, muted, DM Sans 11px. Do not read the goals store from inside this component — receive the value as a prop.

**`app/(tabs)/home.tsx`:** Read `goals` from `useGoalsStore`. For each mark being rendered, derive `goalTitle` by finding the goal whose ID matches `mark.goal_id`. Pass it to `MarkCard`. If the mark has no `goal_id`, pass nothing (the subtitle is not shown).

**`app/counter/[id].tsx`:** Find the mark's linked goal from the goals store using `counter.goal_id`. If found, show a small tappable "Working toward: [Goal Title] →" line in the hero section below the mark name. Tapping navigates to `goal/[goalId]`.

### Commit message
`feat(marks): wire goal_id through onboarding, home cards, and mark detail`

---

## TASK 6 — Surface Bug Fixes

Fix each bug independently. Type-check and commit after each fix.

### Bug 1 — Checkmark icons render as emoji
**Affected files:** `components/MarkCard.tsx`, `app/(tabs)/marks.tsx`, any file using `Ionicons name="checkmark"` or `Ionicons name="checkmark-circle"`

Search for all checkmark Ionicons usages:
```
grep -r "checkmark" app/ components/ --include="*.tsx"
```

Replace every instance with the equivalent Phosphor icon. Use `Check` (bold weight) for log button morphs and inline checks. Use `CheckCircle` (duotone weight) for completion state indicators. Import from `phosphor-react-native`.

Commit: `fix(icons): replace all Ionicons checkmarks with Phosphor Check — fixes emoji rendering`

### Bug 2 — Notes lost on navigation
**Affected file:** `app/counter/[id].tsx`

The note draft state must auto-save in two situations: on TextInput blur, and on component unmount. Read the existing `upsertDailyLogNote` function signature from `useDailyTrackingStore` before writing the save calls. Only save if the draft differs from the already-saved note. Use fire-and-forget (no await) on unmount cleanup.

Commit: `fix(notes): auto-save note on blur and unmount`

### Bug 3 — Preset chips don't populate the form
**Affected file:** `app/counter/new.tsx`

Read the full file first. Find the form state setters and the exact string values used in `ICON_OPTIONS` for each icon type. The chip tap handler must call the name setter and the icon type setter using those exact string values. After setting the fields, ensure the form is in a state where the populated fields are visible.

Commit: `fix(marks): preset chip tap populates name and icon fields`

### Bug 4 — Splash screen needs polish
**Affected file:** `components/LoadingScreen.tsx`

Remove the `ActivityIndicator` entirely. Reduce the logo size from its current value to something smaller and more refined (audit the current size first). Add a slow breathing pulse animation using Reanimated — scale oscillates gently. The logo asset is already theme-aware; verify the light/dark variants look correct on their respective backgrounds.

Commit: `fix(splash): pulsing logo, no spinner, reduced size`

### Bug 5 — See All marks screen black background in light mode
**Affected file:** Find where "See all" navigates — it may be `app/(tabs)/marks.tsx` or a marks list screen. Audit before assuming.

Ensure the root container uses `themeColors.background`. Remove any hardcoded dark background colors.

Commit: `fix(marks): See All screen respects theme background color`

### Bug 6 — Duplicate marks-today stat on home screen
**Affected file:** `app/(tabs)/home.tsx`

Both the stat grid row and the `WeeklySummaryStrip` show today's mark completion count. Read both components to understand what each shows. Remove the redundant one — keep the component that provides more context (weekly data). If removing the stat row would break the layout, replace it with a different stat (e.g., goal count, streak).

Commit: `fix(home): remove duplicate today-marks count stat`

### Bug 7 — Floating gear FAB on non-Settings screens
Search all screens for floating gear buttons that are not the primary action of that screen. The gear FAB is a debug/settings shortcut — it should not appear on the Goals screen, Loading screen, or any screen that already has proper navigation. Remove it from every screen where it is not intentional.

Commit: `fix(ui): remove floating gear FAB from non-home screens`

---

## TASK 7 — Missing Consumer UX

### Step 1 — Delete account option in Settings
**File:** `app/(tabs)/settings.tsx`

Required by the App Store. Add a "Delete account" row in the account/danger section. The tap handler must show a confirmation Alert. For the initial submission, the confirmation can explain that users should email support to complete deletion — full server-side deletion can be implemented post-launch. This satisfies App Review.

### Step 2 — System theme option
**File:** `app/(tabs)/settings.tsx`

The `ThemeMode` type already has `'system'`. The UI only shows a binary dark/light switch. Replace the switch with a three-way selector: Light, System, Dark. Wire to `setThemeMode`. System follows the device's current appearance setting.

### Step 3 — Swipe-to-delete mark rows
**Files:** `app/(tabs)/home.tsx` or `components/SortableMarkList.tsx`

iOS users expect swipe-left to reveal a delete action. `react-native-gesture-handler` is already installed. Wrap mark rows in a `Swipeable` component with a destructive right action. The delete action must show an `Alert.alert` confirmation before calling `deleteMark`.

### Step 4 — Long-press context menu on mark cards
**Files:** `components/MarkCard.tsx`, `app/(tabs)/home.tsx`

Add `onLongPress?: (markId: string) => void` prop to `MarkCard`. Wire it in the home screen to show an `Alert.alert` with options: View details, Edit, Delete. View details navigates to `counter/[id]`. Edit navigates to `counter/[id]/edit`. Delete shows a second confirmation Alert.

### Step 5 — Edit goal title
**File:** `app/goal/[id].tsx` (created in Task 3)

The edit icon in the header switches the title `Text` to an inline `TextInput`. On blur or keyboard "Done": call `updateGoalTitle` (added in Task 3). Validate minimum 3 characters before saving.

Commit for all of Task 7: `feat(ux): delete account, system theme, swipe-to-delete, long-press menu, inline goal title edit`

---

## TASK 8 — UI Consistency Pass

Apply the Material Warmth design system uniformly. Read each screen in full before touching it.

**Design system reference:**
- Backgrounds: `themeColors.background` always — no hardcoded colors
- Surface cards: `themeColors.surface` with warm shadow from `shadow` tokens
- Primary accent: `#1C3830` (forest green) — CTAs, active states, left borders on goal cards
- Completed/check accent: `#C47E8A` (dusty rose) — completed mark checks, logged state
- Headings (≥20px): Libre Baskerville
- All other text: DM Sans
- Icons: Phosphor, duotone weight inside cards; regular weight in navigation chrome
- No `Ionicons` anywhere after this task

**Screens to audit and fix:**

**`app/(tabs)/marks.tsx`:** Verify background, header typography, row icon rendering (no emoji fallbacks), add mark button styling, completed mark check color.

**`app/goal/queue.tsx`:** Verify header typography, active goal card left border color, progress text styling, section label styling.

**`app/counter/[id].tsx` — notes section:** Section labels in correct case and weight. TextInput using surface background and border tokens. Past notes formatted with date labels and separators. No delete button on past notes — they are a log.

**`app/(tabs)/home.tsx`:** Add 6px gap between mark cards. Verify no hardcoded colors remain in card rendering.

**All screens:** Replace any remaining `Ionicons` with Phosphor equivalents.

Commit: `style(ui): Material Warmth consistency pass across all screens`

---

## Final Verification Checklist

After all tasks complete, run:
- `npm run type-check` — must pass with zero errors
- `npm run test` — must pass with zero failures
- `npx expo-doctor` — must pass or show only previously-known non-critical warnings

Then manually verify these flows:
1. Create a goal → marks are suggested based on the goal title → marks are created linked to the goal
2. Log a mark on the home screen → tap the goal in Queue → progress counter has increased
3. Tap a goal card → goal detail opens with linked marks visible
4. Add a mark from the home screen → link-to-goal toggle defaults to on → mark appears in goal detail
5. Onboarding: complete the flow → both goal and marks exist and are linked
6. Mark card on home shows goal subtitle
7. All checkmarks are vector icons, not emoji
8. Notes survive navigation (write a note, go back, return — note is still there)
9. Light mode: See All marks screen has correct background
10. Splash: pulsing logo, no spinner

---

## Appendix — File Inventory

| Screen / Component | File | Issues |
|---|---|---|
| Home / Focus tab | `app/(tabs)/home.tsx` | Duplicate stats, gear FAB, no goal subtitle on marks, no swipe-to-delete |
| Queue / Goals tab | `app/goal/queue.tsx` | Hardcoded check-in counter, no goal detail navigation |
| Goal detail | `app/goal/[id].tsx` | Does not exist — create in Task 3 |
| Add Mark | `app/counter/new.tsx` | Preset chips broken, no goal_id, no link-to-goal toggle |
| Mark detail | `app/counter/[id].tsx` | Notes lost on nav, no goal context |
| See All marks | `app/(tabs)/marks.tsx` | Black background in light mode, emoji icons |
| Settings | `app/(tabs)/settings.tsx` | No delete account, binary theme toggle |
| Splash / Loading | `components/LoadingScreen.tsx` | Spinner, no pulse animation |
| Onboarding | `app/onboarding/recommendations.tsx` | Marks not linked to goal at creation |
| Check-in screen | `app/checkin.tsx` | Archive — replaced by mark-log progress |
| Check-in button | `components/CheckinButton.tsx` | Archive — removed from home |
| Mark card | `components/MarkCard.tsx` | Emoji checkmarks, no goal subtitle prop |
| Goal logic | `lib/goalLogic.ts` | Missing calculateGoalProgress, calculateUnlockThreshold |
| Mark suggestions | `lib/goalMarkSuggestions.ts` | Does not exist — create in Task 4 |