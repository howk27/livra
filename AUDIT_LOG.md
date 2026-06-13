# V1 Audit Log

Changes made as part of the V1 Audit + Goal Queue feature.
Format: `filename → what changed → why`

---

## Step 1: Counter → Mark/Goal Rename

### Navigation Routes
| File | Change | Why |
|------|--------|-----|
| `app/mark/[id].tsx` | Created — re-exports `../counter/[id]` | `/mark/[id]` is the canonical route for mark detail |
| `app/mark/new.tsx` | Created — re-exports `../counter/new` | `/mark/new` is the canonical route for mark creation |
| `app/mark/[id]/edit.tsx` | Created — re-exports `../../counter/[id]/edit` | `/mark/[id]/edit` is the canonical route for mark editing |
| `app/(tabs)/home.tsx` | Updated `router.push('/counter/new')` → `/mark/new` and `/counter/${id}` → `/mark/${id}` | Match new canonical route |
| `app/(tabs)/marks.tsx` | Updated all `/counter/` navigation refs to `/mark/` | Match new canonical route |
| `app/counter/new.tsx` | Updated internal nav ref `/counter/${id}` → `/mark/${id}` | After creation, navigate to new canonical path |
| `app/counter/[id].tsx` | Updated edit nav ref `/counter/${id}/edit` → `/mark/${id}/edit` | Use canonical edit path |
| `app/_layout.tsx` | Added `Stack.Screen name="mark/[id]"` modal presentation | Register new route with navigator |

Note: Old `app/counter/` files are kept as thin wrappers / active route aliases. They should be removed in a future cleanup after all deep links are migrated to `/mark/`.

### Component Renames
| File | Change | Why |
|------|--------|-----|
| `components/DuplicateCounterModal.tsx` | Added `DuplicateMarkModal` as primary export; `DuplicateCounterModal` kept as backward-compat alias. Prop `counterName` → `markName`, `onGoToCounter` → `onGoToMark`. | Mark-oriented naming |
| `components/SuggestedCountersList.tsx` | Added `SuggestedMarksList` as primary export; `SuggestedCountersList` kept as alias. Props `onCounterSelect` → `onMarkSelect`, `selectedCounters` → `selectedMarks`. | Mark-oriented naming |

Note: `components/CounterTile.tsx` already exports `MarkTile` as the primary export; `CounterTile` is a backward-compat alias. File rename deferred.

### Type System
| File | Change | Why |
|------|--------|-----|
| `types/index.ts` | Added `GoalMarkLink` to re-export from `./goal` | New type needed for goal-mark relationships |
| `types/index.ts` | `Counter = Mark`, `CounterEvent = MarkEvent`, `CounterStreak = MarkStreak` aliases remain | Backward compat for any callers not yet migrated |

### State / Store Naming
| File | Change | Why |
|------|--------|-----|
| `state/countersSlice.ts` | Primary export is `useMarksStore`; `useCountersStore` kept as alias. File rename deferred pending import update across all callers. | Large blast radius; documented for next sprint |
| `hooks/useCounters.ts` | Primary export is `useMarks`; `useCounters` kept as alias. File rename deferred. | Same |

### SQLite Storage Keys
No rename applied. Storage keys `@livra_db_counters` etc. are internal and invisible to users. Renaming requires a data migration at next major version to avoid data loss on upgrade.

### Supabase Tables
| File | Change | Why |
|------|--------|-----|
| `supabase/migrations/20260602_rename_counters_to_marks.sql` | Migration to rename `counters`→`marks`, `counter_events`→`mark_events`, etc. | Mark-oriented naming in DB |

✅ **READY TO APPLY**: `hooks/useSync.ts` and `lib/sync/mappers.ts` have been updated to reference the new table/column names. The migration can now be safely applied to Supabase.

---

## Step 2: Data Model — Goals

| File | Change |
|------|--------|
| `types/goal.ts` | Extended `Goal` type: added `icon`, `color`, `target_mark_count`, `current_mark_count`, `deadline_date`, `linked_mark_ids`. Added `GoalMarkLink` type. Added `'expired' | 'paused'` to `GoalStatus`. Kept `target_date` and `sort_index` for backward compat. |
| `supabase/migrations/20260602_goals_with_mark_links.sql` | New `goals` and `goal_mark_links` tables with RLS policies |
| `lib/db/goalsDb.ts` | Extended to handle new Goal fields; added `addGoalMarkLink`, `removeGoalMarkLink`, `getLinksForMark`, `loadLinksForUser` |

---

## Step 3: Goal Store

| File | Change |
|------|--------|
| `lib/goalLogic.ts` | Added `getExpiredGoals`, `isMarkCountComplete`, `isDeadlineExpired`, `progressPercent` |
| `state/goalsSlice.ts` | Added: `isLoading`, `error`, `fetchGoals`, `createGoal` (extended), `updateGoal`, `linkMarkToGoal`, `unlinkMarkFromGoal`, `creditMarkToGoals`, `checkGoalCompletion`. Kept backward compat: `loadGoals`, `addGoal`. |
| `state/goalStore.ts` | Created — canonical re-export path for `useGoalsStore` |

---

## Step 4: Mark Logging Integration

| File | Change |
|------|--------|
| `hooks/useCounters.ts` | Added fire-and-forget `creditMarkToGoals(markId)` call inside `InteractionManager.runAfterInteractions` after successful increment. Uses `setTimeout(0)` pattern so it never blocks mark logging. |

---

## Step 5: Queue Screen

| File | Change |
|------|--------|
| `app/(tabs)/queue.tsx` | Full rebuild per spec: hero card with circular SVG progress ring, queue cards with up/down reordering, FAB, goal creation sheet, goal detail sheet, empty state |
| `app/(tabs)/_layout.tsx` | Added `QueueIcon`, moved `queue` from hidden route to visible 2nd tab between Home and Marks |

---

## Step 6: Tests

| File | Change |
|------|--------|
| `tests/unit/goalStore.test.ts` | 40 new tests covering: `isMarkCountComplete`, `isDeadlineExpired`, `progressPercent`, `getActiveGoal`, `getQueuedGoals`, `getExpiredGoals`, `nextGoalToActivate`, expired/paused status handling |

---

## Dead Code Audit

No orphaned components or clearly dead code found. The backward-compat aliases (`Counter = Mark`, `useCountersStore`, `DuplicateCounterModal`, `SuggestedCountersList`, `CounterTile`) are all intentionally kept. They will be removed in a dedicated cleanup sprint once all callers are migrated.

---

## Sync Layer Update (Session 2)

| File | Change |
|------|--------|
| `hooks/useSync.ts` | Updated all Supabase table references: `counters`→`marks`, `counter_events`→`mark_events`, `counter_streaks`→`mark_streaks`, `counter_badges`→`mark_badges`. Updated realtime channel and `table:` filters. Updated `onConflict` keys: `counter_id`→`mark_id`. Updated pull SELECT columns: `counter_id`→`mark_id`. Simplified pull-side row mappings (no longer need `counter_id \|\| mark_id` dual-read since column is uniformly `mark_id`). Local `lc_*` SQL untouched. |
| `lib/sync/mappers.ts` | Rewrote `SupabaseStreak/Badge/Event` types to use `mark_id` (was `counter_id`). Mapper functions are now identity-like for the parent-ID field — no translation required since both local and Supabase use `mark_id`. |

`20260602_rename_counters_to_marks.sql` is now **safe to apply** to Supabase.

---

## Phase 3 — Architectural Fixes

### Fix 1 — Route consolidation

| File | Change |
|------|--------|
| `app/mark/[id].tsx` | Replaced re-export wrapper with full screen implementation (moved from `app/counter/[id].tsx`) |
| `app/mark/new.tsx` | Replaced re-export wrapper with full screen implementation (moved from `app/counter/new.tsx`) |
| `app/mark/[id]/edit.tsx` | Replaced re-export wrapper with full screen implementation (moved from `app/counter/[id]/edit.tsx`) |
| `app/counter/` | Deleted entire directory (`[id].tsx`, `new.tsx`, `[id]/edit.tsx`) |
| `app/_layout.tsx` | Removed dead `Stack.Screen name="counter/[id]"` registration |
| `components/HealthConnectBanner.tsx` | Fixed `/counter/${markId}` → `/mark/${markId}` navigation call |
| `lib/review/weeklyReview.ts` | Fixed `/counter/new` → `/mark/new` empty-state CTA target |
| `tests/unit/weeklyReview.test.ts` | Updated test expectation to match `/mark/new` |

### Fix 2 — AsyncStorage key migration

| File | Change |
|------|--------|
| `lib/db/index.ts` | Changed `STORAGE_KEYS.counters` from `@livra_db_counters` to `@livra_db_marks`. Added `migrateCountersStorageKey()` one-time migration function (guarded by `@livra_migration_v2_complete` flag, non-fatal on error). Called before `loadFromStorage()` in `initDatabase()`. |
| `tests/unit/storageKeyMigration.test.ts` | New test file: migration runs once, skips if flag set, handles no-data case, preserves existing new-key data, does not throw on failure. |

### Fix 3 — AppState foreground goal expiry

| File | Change |
|------|--------|
| `state/goalsSlice.ts` | Added `checkAllGoalExpiry()` to `GoalsState` interface and implementation. Iterates active goals, calls `isDeadlineExpired()`, delegates to `checkGoalCompletion()` for each expired goal. Wrapped in `InteractionManager.runAfterInteractions` (non-blocking). |
| `app/_layout.tsx` | Added `useGoalsStore.getState().checkAllGoalExpiry()` call inside the existing `onAppState` handler when transitioning from background/inactive → active. |

### Fix 4 — Supabase migration verification

| File | Change |
|------|--------|
| `supabase/migrations/20260602_rename_counters_to_marks.sql` | Added `STATUS: READY TO APPLY` comment block with verification notes. Confirmed `useSync.ts` references `marks`/`mark_events`/`mark_streaks`/`mark_badges` and `mappers.ts` uses `mark_id` throughout. |

---

## Deferred (Future Sprint)

1. Rename `hooks/useCounters.ts` → `hooks/useMarks.ts` and update ~8 import sites
2. Rename `state/countersSlice.ts` → `state/marksSlice.ts` and update ~15 import sites
3. Rename `components/CounterTile.tsx` → `components/MarkTile.tsx`
4. Implement drag-to-reorder for queue cards (currently uses up/down buttons; `react-native-draggable-flatlist` not installed)

---

## Phase 4 — UI Overhaul (2026-06-02)

### Summary
Complete visual redesign of Livra app: design tokens, typography, 4 main tabs, 10+ screens, and shared component library.

### New Packages Installed
- @expo-google-fonts/cormorant-garamond — serif display font
- @expo-google-fonts/dm-sans — body/UI font
- expo-splash-screen — programmatic splash control

### Design System Changes
- theme/tokens.ts: replaced Inter/Satoshi with CormorantGaramond/DMSans font tokens
- theme/tokens.ts: new warm palette (linen/forest/mint) replacing grayscale+yellow
- theme/tokens.ts: backward-compat aliases preserved (borderRadius, fontSize, fontWeight, etc.)
- app.json: splash backgroundColor updated to #F0EDE8 (linen)

### New Components
- components/ui/SvgLogo.tsx — vectorized logo mark (placeholder, DESIGN TODO: replace with real logo)
- components/ui/LivraWordmark.tsx — LIVRA wordmark in CormorantGaramond
- components/ui/LivraHeader.tsx — unified app header with drawer/back support, exports DrawerContext
- components/ui/SectionLabel.tsx — uppercase tracking label
- components/ui/PillButton.tsx — primary/ghost/danger button variants
- components/ui/FAB.tsx — floating action button
- components/ui/StatTile.tsx — 1x1 stat display tile
- components/ui/HeroCard.tsx — dark/light mission card with progress bar
- components/ui/MarkRow.tsx — mark list row (daily + weekly modes)
- components/ui/QueueCard.tsx — hero + standard queue item
- components/navigation/LivraDrawer.tsx — slide-in side drawer (forest green)
- components/sheets/ProfileEditSheet.tsx — bottom sheet for profile editing

### Screen Changes
- app/(tabs)/home.tsx: Dashboard rebuild (greeting, HeroCard, 2×2 StatGrid, MarkRows, FAB)
- app/(tabs)/queue.tsx: Queue rebuild (LivraWordmark header, hero+queue cards, empty state)
- app/(tabs)/log.tsx: NEW screen (today summary, this-week mark rows)
- app/(tabs)/settings.tsx: Settings rebuild (profile card, 4 groups, ProfileEditSheet integration)
- app/settings/notifications.tsx: NEW — notification toggles
- app/settings/privacy.tsx: NEW — privacy toggles
- app/settings/appearance.tsx: NEW — theme selector (Light/Dark/System, dark TODO)
- app/paywall.tsx: Paywall rebuild (forest dark theme, IAP logic preserved)
- app/onboarding/welcome.tsx: Onboarding rebuild (3-step, serif typography)
- app/goal/complete.tsx: Goal complete rebuild (staggered Reanimated entrance)
- app/mark/[id].tsx: Mark detail rebuild (LivraHeader, StatTiles, Log button, history)

### Tab Bar Changes
- 3 visible tabs: Dashboard (target), Queue (list), Log (zap)
- Settings moved to drawer navigation only
- Active tint: colors.forest (#1C3830) replacing #FEB729

### Navigation
- LivraDrawer wired via DrawerContext throughout app
- New settings sub-screens registered in root Stack

### Assumptions & Design TODOs
- DESIGN TODO: SvgLogo uses a placeholder italic "L" — replace with real vectorized logo from Figma
- DESIGN TODO: app icon not updated (assets/branding/icon.png doesn't exist — kept existing icon)
- DESIGN TODO: Dark mode stores preference but only Light theme renders
- DESIGN TODO: Alternate app icons (future, needs separate assets)
- Local `lc_counters` / `lc_counter_events` SQLite tables intentionally NOT renamed (separate risk)
- ProfileEditSheet save handler is a stub — onSave prop wires to parent but no Supabase update
- Notification settings toggles are local state only (not persisted to notification system yet)

---

## Phase 5 — UI Corrections

### Change 1 — Tab Structure
| File | Change | Why |
|------|--------|-----|
| `app/(tabs)/_layout.tsx` | Rewrote — 3 tabs: Focus (sun), Queue (list), Settings (settings). Removed drawer, FABContext, FloatingActionButton | Simplify nav to 3-tab structure per spec |
| `app/(tabs)/home.tsx` | Deleted — replaced by `focus.tsx` | Tab rename: Dashboard → Focus |
| `app/(tabs)/focus.tsx` | Created — full Focus screen | New primary tab |
| `app/(tabs)/log.tsx` | Deleted | Log tab removed from nav |

### Change 2 — Remove Side Drawer
| File | Change | Why |
|------|--------|-----|
| `components/navigation/LivraDrawer.tsx` | Deleted | Drawer pattern removed |
| `components/ui/LivraHeader.tsx` | Removed hamburger/drawer trigger; left side = 22px empty View | Header no longer drives drawer |
| Multiple files | Updated `/(tabs)/home` → `/(tabs)/focus` routes | Tab rename |

### Change 3 — SpeedDialFAB
| File | Change | Why |
|------|--------|-----|
| `components/ui/SpeedDialFAB.tsx` | Created — self-contained speed dial with New Mark + New Goal options, backdrop, first-launch hint | Replaces individual FABs on Focus and Queue |
| `app/(tabs)/focus.tsx` | Imports SpeedDialFAB | |
| `app/(tabs)/queue.tsx` | Replaced old FAB with SpeedDialFAB | |

### Change 4 — AddMarkSheet
| File | Change | Why |
|------|--------|-----|
| `components/sheets/AddMarkSheet.tsx` | Created — bottom sheet with name, category picker, daily target stepper, Add Mark CTA | Inline mark creation without navigation |

### Change 5 — AddGoalSheet
| File | Change | Why |
|------|--------|-----|
| `components/sheets/AddGoalSheet.tsx` | Created — bottom sheet with name, why, target count, deadline toggle, linked marks, Add Goal CTA | Inline goal creation without navigation |

### Change 6 — Focus Screen
| File | Change | Why |
|------|--------|-----|
| `app/(tabs)/focus.tsx` | Built: greeting, today's progress dark card, 2×2 stat tiles, mark list with inline log taps, SpeedDialFAB | Visual rebuild per Phase 5 spec |

### Change 7 — Mark Detail Screen Rebuild
| File | Change | Why |
|------|--------|-----|
| `app/mark/[id].tsx` | Full visual rebuild: category icon hero, stat tile row, forest log button (64px pill), linked goals section, history section, "all done today" banner | Previous screen used old amber/Satoshi design |

### Change 8 — Typography Correction
| File | Change | Why |
|------|--------|-----|
| `components/ui/HeroCard.tsx` | `description` style: `serifItalic` → `sans` (was 15px, below 20px threshold) | Cormorant only at ≥20px |
| `components/ui/QueueCard.tsx` | `heroDescription` style: `serifItalic` → `sans` (was 15px) | Same rule |

### Change 9 — Remove Amber/Orange
| File | Change | Why |
|------|--------|-----|
| `app/(tabs)/_layout.tsx` | Rewrote — `#FEB729` FAB color gone | All amber replaced |
| `app/mark/[id].tsx` | Rewrote — `ACCENT = '#FEB729'` gone | |
| `components/WeeklyReflectionCard.tsx` | `inconsistent` tier color `#f59e0b` → `#1C3830` (forest) | No amber in app |

### Change 10 — Debug Gear Icon
| File | Change | Why |
|------|--------|-----|
| N/A | Grep found no floating gear icon outside profile.tsx (which is a legitimate nav button, not debug UI) | No action needed |

**Test result: 370/370 passing**

---

## Phase 6 — Remaining Screens

### Preliminary Fix
| File | Change | Why |
|------|--------|-----|
| `components/sheets/AddMarkSheet.tsx` | Already used `createCounter` (correct); no fix needed | Verified via grep |
| `components/ui/LivraHeader.tsx` | DrawerContext is no-op export only; no real consumers | Verified via grep |

### GoalCompletionOverlay
| File | Change | Why |
|------|--------|-----|
| `state/goalCompletionStore.ts` | Created — Zustand store: `{ completedGoal, show, showCompletion, hideCompletion }` | Needed to trigger overlay from anywhere |
| `components/overlays/GoalCompletionOverlay.tsx` | Created — full-screen overlay with staggered entry animations, swipe-down dismiss, next goal preview | Fires after any goal → 'completed' transition |
| `app/_layout.tsx` | Added goals subscription listener; detects completed-status transitions; wires GoalCompletionOverlay | Non-invasive watcher (no goalsSlice modification) |

### Screen 1 — Onboarding
| File | Change | Why |
|------|--------|-----|
| `app/onboarding.tsx` | Created — 3-step onboarding (Welcome, How It Works, Sign Up) with animated step dots, pan-advance support, Supabase email sign-up | Standalone entry screen |

### Screen 2 — Sign In
| File | Change | Why |
|------|--------|-----|
| `app/signin.tsx` | Created — email/password sign in with Feather eye toggle, forgot password link, Google placeholder, back to onboarding link | Standalone sign in screen |

### Screen 3 — Goal Completion
*See GoalCompletionOverlay above.*

### Screen 4 — Settings
| File | Change | Why |
|------|--------|-----|
| `app/(tabs)/settings.tsx` | Updated Support group: Help/Feedback/Rate now open real URLs; About navigates to `/settings/about` | Wire up previously stubbed rows |

### Screen 5 — ProfileEditSheet
Already fully implemented. No changes needed.

### Screen 6 — Notifications
| File | Change | Why |
|------|--------|-----|
| `app/settings/notifications.tsx` | Rebuilt — added intro text "Livra never sends guilt. Only momentum."; sub-rows expand on toggle (Reanimated height animation); day-picker pill row for weekly summary | Visual and functional upgrade |

### Screen 7 — Privacy
| File | Change | Why |
|------|--------|-----|
| `app/settings/privacy.tsx` | Rebuilt — 3 sections: Data Collection, Security (with autolock picker), Connected Services with sync status badge | Matches spec |

### Screen 8 — Appearance
| File | Change | Why |
|------|--------|-----|
| `app/settings/appearance.tsx` | Rebuilt — added theme description hint, app icon tile picker (3 placeholder tiles with active border), DESIGN TODO comments | Matches spec; icon assets not yet created |

### Screen 9 — About
| File | Change | Why |
|------|--------|-----|
| `app/settings/about.tsx` | Created — centered logo + wordmark, version, company, Privacy/Terms/OSS links, "Made with intention." footer | New screen |
| `app/_layout.tsx` | Registered `settings/about` and `signin` routes in Stack | New routes need registration |

### Paywall
Already fully implemented with forest design. No visual changes needed — existing render matches spec.

### Final Checks
- No `backgroundColor: '#fff'` or `backgroundColor: 'white'` found in app/ or components/
- GoalCompletionOverlay renders at zIndex 10000, above tab bar (inside `RootNavigator`, above Stack)
- Settings "Reset All Data" and "Delete Account" both use Alert confirmation before executing
- ProfileEditSheet ImagePicker wired via `expo-image-picker` (already installed)

**Test result: see test run**

---

## Phase 7 — Widget Plugin Fix (2026-06-04)

### Task 1 — Widget Plugin Fix

**Audit findings (Step 1):**
- Swift sources exist at `targets/LivraWidget/` (not `ios/LivraWidget/`) — consistent with the recent commit that moved them there to survive `prebuild --clean`.
- `expo-target.config.js` exists at `targets/LivraWidget/expo-target.config.js` — found by `@bacons/apple-targets` via the `root: './targets'` option already set in the plugin.
- `plugins/withLivraWidget.js` already correctly passes `{ root: './targets' }` to `withTargetsDir` — no path fix needed in the plugin itself.
- Bug confirmed: `bundleIdentifier` in `expo-target.config.js` was set to `'.widget'` (bare suffix) instead of the full reverse-DNS bundle ID.

| File | Change | Why |
|------|--------|-----|
| `targets/LivraWidget/expo-target.config.js` | `bundleIdentifier: '.widget'` → `'com.livra.app.widget'` | Bare suffix is not a valid bundle ID; EAS / Xcode requires the full reverse-DNS string so signing and provisioning resolve correctly |
| `plugins/withLivraWidget.js` | No change required | Plugin already references `root: './targets'`; path was correct after the sources were moved in a prior commit |

---

### Task 2 — App Icon & Logo Assets

**Audit findings:**
- `assets/branding/` contains 4 SVG files at 60×60, 120×120, 180×180, and 1024×1024 — not PNG. The old `assets/icon.png`, `assets/splash.png`, and `assets/adaptive-icon.png` were already deleted from the repo.
- `LoadingScreen.tsx` and `app/paywall.tsx` both held dead `require('../assets/icon.png')` references that would crash at runtime.
- `SvgLogo.tsx` was a placeholder ("L" italic text); replaced with the real vectorized path from `assets/branding/`.
- No "Logo NoBG" strings existed anywhere in the codebase — grep returned empty.

| File | Change | Why |
|------|--------|-----|
| `components/ui/SvgLogo.tsx` | Replaced placeholder italic-"L" SVG with real Livra logomark path data from `assets/branding/Livra_No Background - Clean - 180x180.svg`; default `height` changed to `48` (square); imports changed from `Text` to `Path, ClipPath, Rect, G` | Real brand asset now rendered throughout the app |
| `components/LoadingScreen.tsx` | Removed dead `require('../assets/icon.png')`; replaced `<Image>` with `<SvgLogo width={180} height={180}>` using `themeColors.text` as fill; removed unused `Image` import | icon.png was deleted; SVG logo renders correctly in both themes |
| `app/paywall.tsx` | Removed dead `LIVRA_APP_ICON = require('../assets/icon.png')` constant and `Image` from RN imports | icon.png was deleted; paywall already uses `SvgLogo` for rendering |
| `app.json` | `"icon"` → `./assets/branding/Livra_No Background - Clean - 1024x1024.svg`; `"splash.image"` → same; `splash.backgroundColor` → `#F0EBE3` (design-system linen); `android.adaptiveIcon.foregroundImage` → same SVG | Point all icon/splash fields to branding assets; correct linen hex |

**Note:** Expo native builds require PNG for `icon`, `splash.image`, and `adaptiveIcon.foregroundImage`. The branding files are SVG only. A PNG export (1024×1024) from `assets/branding/Livra_No Background - Clean - 1024x1024.svg` must be committed before running `eas build`. The SVG paths are correct placeholders in the meantime and will resolve for web/Expo Go previews.

---

### Task 3 — Avatar Image Picker

| File | Change | Why |
|------|--------|-----|
| `components/sheets/ProfileEditSheet.tsx` | Added imports for `useAuth`, `useNotification`, and `uploadAvatar`; wired `user` and `showError` from hooks; updated `pickImage` to call `uploadAvatar(user.id, uri)` after successful picker selection with `try/catch` error reporting via `showError` | Avatar tap had no upload logic — optimistic URI update was in place but upload was never called; error handling now matches the existing pattern used in `settings.tsx` and `mark/new.tsx` |

---

### Task 4 — Biometric Lock

| File | Change | Why |
|------|--------|-----|
| `app/settings/privacy.tsx` | Imported `expo-local-authentication` and `AsyncStorage`; on mount calls `hasHardwareAsync()` + `isEnrolledAsync()` to set `biometricAvailable`; toggle ON triggers `authenticateAsync({ promptMessage: 'Enable Face ID for Livra' })` and only persists if successful; toggle OFF persists immediately without re-auth; toggle disabled + subtitle changed to `"Face ID not available on this device"` when unavailable; preference stored at `AsyncStorage` key `biometric_lock_enabled` | Face ID toggle was a local `useState` stub with no persistence or auth gating |
| `app/_layout.tsx` | Imported `expo-local-authentication`, `AsyncStorage`, and `BIOMETRIC_LOCK_KEY`; added `isAuthenticated` state (default `false`); on mount reads `biometric_lock_enabled` — if `true` calls `authenticateAsync` in a recursive retry loop (no bypass on failure), else sets `isAuthenticated` immediately; gates the entire navigator tree on `isAuthenticated` (returns `null` while pending); fail-open on unexpected hardware errors so app is never bricked | Biometric lock preference had no enforcement at launch |

---

### Task 5 — Drag-to-Reorder Queue

| File | Change | Why |
|------|--------|-----|
| `app/(tabs)/queue.tsx` | Replaced the static `remainingGoals.map(...)` render with a self-contained `DraggableQueueList` built on `react-native-gesture-handler`'s `Gesture.Pan()` (modern Gesture API) + `react-native-reanimated` shared values — no third-party drag library. Each row exposes an `Ionicons` `reorder-three-outline` drag handle on the right edge, shown only when the draggable list has more than 1 item (`count > 1`). The handle's pan gesture uses `.activateAfterLongPress(220)` so a quick swipe still scrolls; on activation it fires `Haptics.impactAsync(Medium)` (skipped on web). During drag the active row scales to `1.03`, gains an elevated shadow, and raises `zIndex`; intermediate rows reflow live via a shared `positions` map keyed by goal id. On drop the row springs to its nearest slot and `reorderQueue(orderedIds)` is called with the full queued order. When no goal is active, the hero is `queued[0]` and is kept as a fixed prefix (`fixedPrefixIds`) so it stays first in the persisted order. A `positions` effect re-syncs when goals are added/removed/completed. Removed the now-unused `useMarksStore` import. | The queue had no reorder UI at all (no up/down buttons existed); spec required drag-to-reorder with long-press, haptics, elevated active card, auto-snap, drag handle (>1 item), wired to the existing `reorderQueue` action |

### Task 6 — Dark Mode

Dark-mode preference was already persisted (`uiSlice.themeMode` + `useEffectiveTheme()`), but the "Livra 2.0" screens/components rendered light only because they imported the flat, light-only palette `colors` from `theme/tokens.ts` and baked those hex values directly into `StyleSheet.create`. There is no `theme/colors.ts` `colors.light.*` usage in these screens (that file is only used by the legacy screens, which were already theme-aware via `colors[theme]`), so the fix routed every "2.0" screen through a new theme-aware resolver instead.

| File | Change | Why |
|------|--------|-----|
| `theme/tokens.ts` | Added a dark variant of the semantic palette (`colorsDark`) with the same shape as `colors`, plus `themedColors(theme: 'light' \| 'dark')` that returns the palette for the effective theme. Dark variant flips background/surface/ink/border roles (e.g. `linen → #15211D`, `surface → #1C2826`, `inkDark → #F0EDE8`) while keeping brand accents on-brand (`forest`, `mint`). Light `colors` export is unchanged. | A single source of truth for per-theme semantic colors so screens can resolve at render time without restructuring layout |
| `components/ui/SectionLabel.tsx`, `StatTile.tsx`, `HeroCard.tsx`, `MarkRow.tsx`, `LivraHeader.tsx`, `FAB.tsx`, `PillButton.tsx`, `LivraWordmark.tsx`, `QueueCard.tsx`, `SpeedDialFAB.tsx` | Each now calls `themedColors(useEffectiveTheme())` and applies colors via inline overrides; color properties removed from their static `StyleSheet.create` blocks (layout/spacing untouched). Defaulted-color props (`SectionLabel.color`, `LivraWordmark.color`, `StatTile.bgColor`) now resolve their fallback from the theme. | Shared UI primitives are reused across every screen, so they must be theme-aware for dark mode to render anywhere |
| `app/(tabs)/focus.tsx`, `app/(tabs)/queue.tsx`, `app/(tabs)/settings.tsx` | Wired `useEffectiveTheme()` + `themedColors`; moved all background/text/border colors to inline overrides. `settings.tsx` helper sub-components (`SettingsCard`, `SettingsRow`) made theme-aware. | These are the primary tab screens that only rendered light |
| `app/settings/appearance.tsx` | Wired the theme picker to the real store: replaced the placeholder `useState` with `useUIStore.themeMode` / `setThemeMode`, removed the "only Light renders" TODO, and made the screen itself theme-aware. Hint now reflects the active mode. | The toggle existed but was a no-op; spec requires it to actually switch themes |
| `app/settings/notifications.tsx`, `app/settings/privacy.tsx`, `app/settings/about.tsx` | Made theme-aware (screen, cards, toggle rows, day/auto-lock pills, dividers, links). In `privacy.tsx` the hardcoded `#E6F4EE` sync badge background was replaced with `surfaceAlt` (theme-aware). | Settings sub-screens rendered light only |
| `app/onboarding/welcome.tsx` | Made all three onboarding steps theme-aware (background, wordmark/logo, step circles, body copy, progress dots). | Listed critical onboarding screen |
| `components/overlays/GoalCompletionOverlay.tsx`, `components/sheets/AddMarkSheet.tsx`, `components/sheets/AddGoalSheet.tsx` | Made theme-aware: overlay/sheet backgrounds, handles, inputs (incl. `placeholderTextColor`), category/stepper controls, switches, linked-mark rows. Sheets use a `tc` alias for theme colors to avoid clashing with existing `c =>` find callbacks. | Listed critical overlay/sheet components |

**Out of scope / not changed (flagged):** Category accent hex values in `AddMarkSheet`/`MarkRow` (`#6B8FA6`, `#A0614A`, etc.) are intentional per-category brand hues and remain as primitives. White-on-accent text (`#FFFFFF`) in `iap-dashboard`, `auth/*`, `goal/*`, and several non-target components is text sitting on the always-yellow `#FEB729` accent or other fixed-hue surfaces; left as-is since those screens were outside the listed scope and the white is intentional. The legacy `theme/colors.ts` (`light`/`dark` keyed) was untouched — it already drives the older screens correctly.

**Validation:** `tsc --noEmit` clean; `npm test` 370/370 passing (32 suites).

---

### Task 6 Extended — Dark Mode Pass 2 (2026-06-05)

Continued the migration started above; all remaining user-reachable screens that still imported from `theme/colors` were converted to `themedColors`. Pattern identical to above: import swap, `const c = themedColors(theme)`, replace `themeColors.*` aliases.

| File | Change | Why |
|------|--------|-----|
| `app/mark/[id].tsx` | Converted to `createStyles(c)` + `useMemo`; removed `tokenColors.*` import; full inline-to-theme migration | Mark detail is primary UX |
| `app/goal/complete.tsx`, `app/goal/milestone.tsx` | Converted to `themedColors`; removed old `colors[theme]` usage | Goal completion flow |
| `app/onboarding.tsx`, `app/signin.tsx` | New screens wired to `themedColors` from creation | New auth/onboarding flow |
| `app/goal/queue.tsx` | Removed `colors[theme]`; replaced `themeColors.*` → `c.*` via mapping (`background→linen`, `text→inkDark`, `textSecondary→inkMuted`, `primary→forest`, `accent.primary→forest`) | Reachable from Queue tab |
| `app/goal/new.tsx`, `app/goal/history.tsx` | Same migration pattern (both use only inline styles, no createStyles needed) | Both reachable from goal/queue |
| `app/auth/reset-password.tsx`, `app/auth/reset-password-complete.tsx` | Migrated + added mappings for `error→danger`, `success→success`, `textTertiary→inkMuted` | Reachable from new signin screen |
| `app/legal/privacy-policy.tsx`, `app/legal/terms-and-conditions.tsx` | Migrated | Reachable from settings/privacy |
| `app/iap-dashboard.tsx` | Migrated | Reachable from settings |
| `app/checkin.tsx` | Migrated inline tokens; removed amber `#FEB729` from `yesBtn` StyleSheet → replaced with `{ backgroundColor: c.forest }` inline; `#111111` text → `{ color: c.inkInverse }` | Registered Stack.Screen; CheckinButton pushes to this route |

**Route fix (broken navigation):**
| File | Change | Why |
|------|--------|-----|
| `app/settings/profile.tsx` | Created — full-screen "Edit Profile" with avatar picker (`expo-image-picker`), display name field, read-only email, Save → Supabase upsert | Settings tab navigated to `/settings/profile` but the file did not exist; would crash on tap |

**Remaining on old color system (not reachable in current 3-tab nav):**
- `app/paywall.tsx` — 1997 lines; has partial dark mode via old system; out of scope
- `app/(tabs)/marks.tsx`, `profile.tsx`, `tracking.tsx`, `stats.tsx` — hidden tabs
- `app/mark/new.tsx`, `app/mark/[id]/edit.tsx` — only reachable from hidden `marks.tsx` tab
- `app/auth/signin.tsx`, `app/auth/_layout.tsx` — old auth stack replaced by `app/signin.tsx`
- `app/onboarding/*` sub-screens — old onboarding replaced by `app/onboarding.tsx`
- `app/diagnostics.tsx` — dev screen

**Validation:** `tsc --noEmit` 0 errors; `npm test` 370/370 passing.

**Validation:** `tsc --noEmit` clean; `npm test` 370/370 passing (32 suites). `npm run lint` is broken project-wide (ESLint v9 missing `eslint.config.js`) — pre-existing and unrelated to this change.

---

## Phase 7.5 — UI Overhaul (2026-06-07)

Visual improvements across Focus tab, mark detail, sheets, and shared components.
No logic changes; no protected files touched. 381 tests pass; 0 type errors.

| File | Change |
|------|--------|
| `theme/tokens.ts` | Added `sansBold: 'DMSans_700Bold'` font token |
| `app/_layout.tsx` | Load `DMSans_700Bold` font |
| `components/ui/StatTile.tsx` | Number font: serifSemibold → sansSemibold |
| `components/ui/PillButton.tsx` | Widened `style` prop to `StyleProp<ViewStyle>` |
| `app/(tabs)/focus.tsx` | Replaced progress card + 2×2 stat grid with compact banner (56px) + stat strip (44px) |
| `components/ui/CheckinButton.tsx` | Created: 3-state animated check-in button (+ → spin → ✓) with Reanimated + haptics |
| `components/ui/MarkRow.tsx` | Integrated CheckinButton; removed internal spring animation |
| `components/ui/SpeedDialFAB.tsx` | Hide FAB when AddMark or AddGoal sheet is open |
| `app/settings/integrations.tsx` | Created: Apple Health + Coming Soon integrations screen |
| `app/(tabs)/settings.tsx` | Added Integrations row in ACCOUNT section |
| `components/sheets/AddMarkSheet.tsx` | Upgraded layout: serif headline, POPULAR MARKS label, forest-green selected state, live identity preview |
| `components/sheets/AddGoalSheet.tsx` | Restructured into Intent (serif 28px) + Mechanics (HOW IT WORKS) zones; CTA → "Add to queue" |
| `app/mark/[id]/index.tsx` | Simplified to 3 zones: compact stat row (TODAY / ALL TIME), log button text updated, Apple Health card removed |

**Task 6 (email removal): email mark was already absent from MARK_LIBRARY — no action required.**

---

## Phase 7.5 v3 Addendum — Tasks 15–19 (Bug Fixes)

5 logic bug fixes in `app/mark/[id]/index.tsx`. Protected-file exception exercised for Tasks 15–16. 381 tests pass; 0 type errors.

| Task | Commit | File | Change |
|------|--------|------|--------|
| 15 — History dedup | `57dc9e7`, `0994508` | `app/mark/[id]/index.tsx` | `recentActivity` now aggregates by `occurred_local_date` (one row per day, increment events only). Fixed UTC-shift bug in date display. |
| 16 — Undo/Reset wiring | `79731ad`, `f932667` | `app/mark/[id]/index.tsx` | `handleDecrement` (Undo) and `handleReset` now use `deleteEvent` to soft-delete today's increment events instead of adding decrement events. Added null-guard on `counter`, fresh event snapshot on Reset confirm, ref debounce on Undo. |
| 17 — Notes persistence | `e18a851`, `a0040e3` | `app/mark/[id]/index.tsx` | Removed `setDraftNote('')` after save — saved text stays visible in TextInput. Added `useEffect` (with `draftNoteRef` to avoid stale closure) to sync draft when Zustand store hydrates async. |
| 18 — Duplicate checkmark | `9ba6e4a` | `app/mark/[id]/index.tsx` | Removed `✓` character from `"Logged today ✓"` label — Phosphor `Check` icon is the sole indicator. |
| 19 — Gear button | `497088b` | — | Verified: no floating gear button exists on mark detail screen. No code changes required. |

---

## 2026-06-09 — Three Logic Bug Fixes

### Task 1 — Replace Ionicons checkmarks with Phosphor icons (commit `bb2a120`)

| File | Change |
|------|--------|
| `components/MarkCard.tsx` | Removed `Ionicons` import entirely. Added `Check` from `phosphor-react-native`. Replaced `<Ionicons name="checkmark" size={24}>` on the morph button with `<Check size={22} weight="bold">` and `<Ionicons name="checkmark" size={14}>` on the compact check circle with `<Check size={13} weight="bold">`. |
| `components/CheckinButton.tsx` | Added `CheckCircle` from `phosphor-react-native`. Replaced the `done ? 'checkmark-circle' : ...` ternary with a conditional render: Phosphor `<CheckCircle size={18} weight="bold">` for the done state; kept `<Ionicons name="radio-button-off">` for the undone state (non-checkmark icon — not replaced per spec). |
| `components/NotificationToast.tsx` | Added `CheckCircle` from `phosphor-react-native`. Replaced `getIconName()` string-lookup + single `<Ionicons>` approach with a `renderIcon()` function: success → `<CheckCircle size={24} weight="bold">`; all other types → `<Ionicons>` (alert-circle, warning, information-circle unchanged). `close` button Ionicons left as-is. |
| `app/(tabs)/focus.tsx` | Fixed pre-existing `StyleSheet.absoluteFillObject` → `StyleSheet.absoluteFill` TS error (unrelated to checkmarks; required to get `tsc --noEmit` clean). |

### Task 2 — Auto-save note on navigation away (commit `00913c4`)

| File | Change |
|------|--------|
| `app/mark/[id]/index.tsx` | Added `useEffect` (dep: `[draftNote]`) whose cleanup function fires on unmount and on every draft change — calls `useDailyTrackingStore.getState().upsertDailyLogNote(...)` fire-and-forget so it never blocks React's cleanup phase. Skips the write when `draft === saved` or both are empty. Added `onBlur` to the note `TextInput` that awaits `upsertDailyLogNote` when the keyboard is dismissed (user taps elsewhere). Confirmed `noteUserId = user?.id ?? 'local'` is never an empty string. |

### Task 3 — Preset chip form population in Add Mark screen (commit `bbc4c95`)

| File | Change |
|------|--------|
| `app/mark/new.tsx` | Added `PRESET_MARKS` constant (Sleep/gym, Workout/gym, Water/water, Planning/planning with hex colors). Added `sleep` and `planning` to `ICON_OPTIONS` so the icon grid reflects those selections. Replaced `handleSuggestedCounterSelect` to: look up the tapped counter by name in `PRESET_MARKS` (sets name, iconType, color, `hasManualColorOverride = true`); fall back to a reverse-emoji lookup via `ICON_TYPE_TO_EMOJI` for any counter not in the preset list; then call `setMode('custom')` and clear `pendingSuggestedCounter` so the custom form is visible and pre-filled. |

---

## 2026-06-09 — Material Warmth UI Consistency Pass

Design system enforced across three screens: CormorantGaramond serif for headings ≥20px, DM Sans (`fonts.*` tokens) for UI text, `#1C3830` forest green for all CTAs, Phosphor icons (duotone) replacing all Ionicons, no emoji in UI chrome.

### Task 1 — "See All" Marks screen (commit `08a125b`)

| File | Change |
|------|--------|
| `app/(tabs)/marks.tsx` | Header "Your marks": `fontFamily: 'Satoshi'` 28px bold → `fonts.serif` 24px. Add/empty-state CTA buttons: `#FEB729` amber bg + dark text → `#1C3830` forest bg + white text. Mark icon slot: `mark.emoji` Text render → `MarkIcon` via `resolveCounterIconType`. Both `Lock` icons: `weight="regular"` → `"duotone"`. Locked mark opacity: 0.55 → 0.45. `markName`: Satoshi 15px → `fonts.sansMedium` 16px. All raw `'Satoshi'`/`'Inter'` font strings → `fonts.*` tokens (`serif`, `sansSemibold`, `sansMedium`, `sans`). Removed dead `markEmoji` StyleSheet entry. Added imports: `fonts`, `MarkIcon`, `resolveCounterIconType`. |

### Task 2 — Goal Queue screens (commit `ef60f95`)

| File | Change |
|------|--------|
| `app/goal/queue.tsx` | **Navigation note:** this screen is navigated to from the Queue tab FAB; it contains the active-goal card and all goal-management UI. Header "Goals": `fontSize.lg` semibold → `fonts.serif` 24px. Back button: `Ionicons chevron-back` → Phosphor `CaretLeft` bold. Add button: `Ionicons add` plain icon → 36×36 forest green pill (`#1C3830` bg, white `Plus`). Active goal card: full 1px green border → 3px left border only (`borderLeftWidth: 3, borderLeftColor: '#1C3830'`). `goalTitle`: `fontWeight.semibold` 15px → `fonts.sansSemibold` 16px. Check-in counter: 10px plain → 13px `fonts.sans`. Unlock pill: split locked/unlocked paths — locked state is now a muted border-only pill with `ArrowRight` icon navigating to `/(tabs)/focus`; unlocked keeps forest green "Mark complete" action. `COMPLETED` toggle chevron: `Ionicons chevron-forward` → Phosphor `CaretRight` bold. Queued-item delete: `Ionicons trash-outline` → Phosphor `Trash` duotone. `GoalMarkRow` mark chips: emoji `Text` → `MarkIcon` via `resolveCounterIconType`; removed `MARK_LIBRARY_BY_ID` import; `fontWeight.medium` → `fonts.sansMedium`. `sectionLabel`: letterSpacing 1 → 1.5, added `fonts.sansSemibold`, `textTransform: 'uppercase'`. |
| `app/(tabs)/queue.tsx` | **Navigation note:** this is the rendered Queue tab screen (wordmark header, hero/draggable list, SpeedDialFAB). Drag handle: `Ionicons reorder-three-outline` → Phosphor `DotsSixVertical`. |

### Task 3 — Mark Detail notes section (commit `885afc3`)

| File | Change |
|------|--------|
| `app/mark/[id]/index.tsx` | **Today's note card:** replaced "Today's note" + date flex header with `"TODAY'S NOTE"` section label (`fonts.sansSemibold` 11px uppercase letterSpacing 1.5). Placeholder: `"Write a note for today…"` → `"What did you do today?"`. TextInput: `backgroundColor: c.linen` → `c.surface`; `borderColor: c.borderLight` → `c.borderMid`; `fontSize: 14` → 15. Removed explicit Save button (auto-save via onBlur/unmount handles persistence). Actions row: char count + Save → char count OR `"Saved"` indicator (11px `c.inkMuted`, shown when `hasSavedNote && draftTrimmed === savedTrimmed`); Delete button kept. Removed dead styles: `noteTitle`, `noteDate`, `noteButtons`, `noteSaveBtn`, `noteSaveText`. **Past notes section (new):** renders only when `markNotes.length > 0`. `"PREVIOUS NOTES"` section label. Each row: date label ("Mon, Jun 9") in `fonts.sans` 12px, note text `fonts.sans` 14px with `numberOfLines={3}` + `CaretDown`/`CaretUp` expand toggle, hairline separator between rows; no delete button. Expand state tracked per-date via `Set<string>` in new `expandedNoteIds` useState. Added `CaretDown`, `CaretUp` to Phosphor imports. |

---

## Session 2026-06-10 — Marks & Goals Update (docs/marks-goals update.md)

### Task 1 — Data Model: Link Marks to Goals (commit `5616611`)

| File | Change |
|------|--------|
| `types/index.ts` | Added `goal_id?: string | null` to `Mark` type. |
| `state/countersSlice.ts` | Added `goal_id` to the second UPDATE in `addMark` so it is persisted to AsyncStorage via the generic SQL parser. |
| `state/goalsSlice.ts` | Added `markIds?: string[]` to deprecated `addGoal` interface and implementation; forwards to `createGoal` as `linked_mark_ids`. |
| `supabase/migrations/20260609_goal_id_on_marks.sql` | Created migration adding `goal_id text` column to `counters` table (no FK — goals are client-side only). |

### Task 2 — Replace Check-in System with Mark-Log-Based Goal Progress (commit `88477a7`)

| File | Change |
|------|--------|
| `lib/goalLogic.ts` | Added `calculateGoalProgress(goal, events)` (counts increment events for linked marks) and `calculateUnlockThreshold(goal)` (floor(0.8×days), min 7, max 365). |
| `state/goalsSlice.ts` | Added `getGoalProgress(goalId)` selector returning `{ progress, threshold, canComplete }`. Uses `require('../state/eventsSlice')` inside function body to avoid circular import. Imported new pure functions. |
| `app/goal/queue.tsx` | Replaced `target_mark_count`-based progress display with `getGoalProgress`. Removed `ArrowRight` import. Complete button is forest-green filled when `canComplete`, muted border-only when not. |
| `app/_layout.tsx` | Removed `useCheckinsStore` import and `loadCheckins` call. Removed `checkin` Stack.Screen registration. |
| `hooks/useCounters.ts` | Added defensive goal-link check inside `InteractionManager` block after increment (protected addition, wrapped in try/catch, never propagates). |
| `app/checkin.tsx` | Archived → `app/checkin.tsx.archived` |
| `components/CheckinButton.tsx` | Archived → `components/CheckinButton.tsx.archived` |

### Task 3 — Goal Detail Screen (commit `f22c5f1`)

| File | Change |
|------|--------|
| `app/goal/[id].tsx` | Created. Shows goal title (inline edit), circular SVG progress ring, target date with date picker, linked marks list, Complete button (when canComplete), Delete option. |
| `app/goal/queue.tsx` | Wrapped active goal card in `TouchableOpacity` navigating to `goal/[active.id]`. |
| `app/_layout.tsx` | Registered `goal/[id]` as modal stack screen (no header). |
| `state/goalsSlice.ts` | Added `updateGoalTitle(id, newTitle)` — trims, requires ≥ 3 chars, calls `updateGoal`. |

### Task 4 — Goal-Aware Mark Suggestion Engine (commit `8d3a8c7`)

| File | Change |
|------|--------|
| `lib/goalMarkSuggestions.ts` | Already had `getMarksForGoal` (token-scoring suggestion engine). No changes needed. |
| `app/goal/new.tsx` | Changed creation order: creates goal first to get its ID, then creates marks with `goal_id: newGoal.id`. Calls `linkMarkToGoal` for each new mark after creation. |
| `app/mark/new.tsx` | Added `goalId` route param support. Added `linkToGoal` toggle (defaults to on when `goalId` param passed or active goal exists). Passes `goal_id` to `createCounter` and calls `linkMarkToGoal` after save. |

## Task 5: Wire goal_id through all creation paths (0e78f06)

| File | Change |
|------|--------|
| `app/onboarding.tsx` | Reversed creation order: goal created first with `alreadyOwnedMarkIds`, then marks created with `goal_id: newGoal.id`, then `linkMarkToGoal` called for each new mark. Added `linkMarkToGoal` to store subscriptions. |
| `app/mark/[id]/index.tsx` | Added `workingTowardGoal` useMemo (finds goal by `counter.goal_id`, active/queued only). Added tappable "Working toward: [title] →" line in hero section. Added `heroGoalLink` / `heroGoalLinkText` styles. |
| `components/MarkCard.tsx` | Added `goalTitle?: string` prop to `MarkCardProps`. Added `fonts` import. Renders goalTitle as DM Sans 11px muted subtitle below mark name in identitySection. Added `goalSubtitle` style. |
| `app/(tabs)/focus.tsx` | Derives `goalTitle` per mark in visibleMarks.map using `goals.find(g => g.id === mark.goal_id)?.title`. Passes as `subtitle` prop to `MarkRow`. |

## Task 6: Bug fixes — splash, See All, duplicate stat, gear FAB (d3e6b10)

| File | Change |
|------|--------|
| `components/LoadingScreen.tsx` | Removed ActivityIndicator + showSpinner prop. Reduced logo from 180→80px. Added Reanimated breathing pulse (scale 1.0↔1.06, 1400ms cycle, -1 repeat). |
| `app/(tabs)/marks.tsx` | Added `backgroundColor: themeColors.background` to ScrollView to prevent black background in light mode. |
| `app/(tabs)/focus.tsx` | Removed TODAY cell from stat strip (banner already shows completedMarksToday/todayTotal). Strip now shows STREAK / THIS WEEK / GOALS. |
| `app/(tabs)/queue.tsx` | Removed SpeedDialFAB import and usage — Goals screen already has a header + button for new goals. |

## Task 7: Consumer UX — delete account, swipe-delete, long-press (2bdf0e8)

| File | Change |
|------|--------|
| `app/(tabs)/settings.tsx` | Updated `handleDeleteAccount` to explain email flow (support@getlivra.app) per App Store requirements. Replaced "Delete Account" destructive action with "Email Support" that opens mailto link. |
| `app/(tabs)/focus.tsx` | Added `Swipeable` from `react-native-gesture-handler` wrapping each `MarkRow`. Right action shows red "Delete" panel → Alert confirmation. Added `handleMarkLongPress` callback showing Alert with View details/Edit/Delete. Added `deleteCounter` from `useCounters`. |
| `components/MarkCard.tsx` | Added `onLongPress?: (markId: string) => void` prop wired to card Pressable. |
| `components/ui/MarkRow.tsx` | Added `onLongPress?: () => void` prop wired to TouchableOpacity. |
| `app/settings/appearance.tsx` | Already had 3-way Light/System/Dark selector (no changes needed). |
| `app/goal/[id].tsx` | Already had inline title editing from Task 3 (no changes needed). |

## Task 8: UI Consistency Pass — Material Warmth (bd4470d)

| File | Change |
|------|--------|
| `app/(tabs)/focus.tsx` | Added `gap: 6` to `marksList` style — 6px gap between mark cards per spec. |
| `app/(tabs)/profile.tsx` | Replaced `Ionicons` import with `GearSix, ShareNetwork` from `phosphor-react-native`. Updated both usages. |
| `app/(tabs)/marks.tsx` | Background already fixed in Task 6. Header typography, icons (MarkIcon with resolveCounterIconType), and section labels already consistent. No further changes needed. |
| `app/goal/queue.tsx` | Already uses `fonts.serif` for header (24px), `fonts.sansSemibold` for section labels, `#1C3830` for left border, `fonts.sans` for progress text. No changes needed. |

---

## Phase 1 (Redesign) — Task 1 Audit: Mark Frequency Model (2026-06-12)

**Status: AUDIT COMPLETE — awaiting go-ahead before Task 2**

---

### 1. Existing Mark Type — Cadence/Frequency Fields (`types/index.ts:8-36`)

| Field | Type | Semantics | Read sites |
|-------|------|-----------|------------|
| `unit` | `'sessions' \| 'days' \| 'items'` | What kind of thing is being tracked. Also displayed raw as the subtitle on mark cards (the "items" bug). | `app/(tabs)/marks.tsx:123`, `app/mark/[id]/index.tsx:618`, `lib/suggestedCounters.ts` library, `app/mark/[id]/edit.tsx:108` as form default |
| `dailyTarget` | `number \| null` | How many taps/increments complete ONE daily occurrence (1–99, default 1). Not a weekly count. | `lib/markDailyTarget.ts:resolveDailyTarget/normalizeDailyTargetInput`, `state/countersSlice.ts:123,154,179-182`, `hooks/useCounters.ts` (protected) |
| `schedule_type` | `'daily' \| 'weekly' \| 'custom'` | Cadence descriptor — whether the mark is due every day, N specified days/week, or a custom day pattern. | `lib/features.ts:isDueToday`, `hooks/useCounters.ts` (protected) |
| `schedule_days` | `string` (JSON array) | Weekday indices `[0-6]` for `weekly`/`custom` schedule types. | `lib/features.ts:parseScheduleDays`, `hooks/useCounters.ts` (protected) |
| `goal_value` | `number \| null` | Optional quantity target. E.g. "8 glasses of water per day" → `goal_value=8`. When `goal_period='week'` it doubles as a weekly frequency target. | `lib/features.ts:getPeriodTotal/getGoalProgress/getGoalLabel` |
| `goal_period` | `'day' \| 'week' \| 'month' \| null` | Period for `goal_value`. When `'week'`, semantically overlaps with the proposed `weekly_target`. | Same as above |
| `enable_streak` | `boolean` | Streak counting on/off per mark. | `state/countersSlice.ts`, streak hooks |
| `total` | `number` | All-time increment total. | Displayed on mark cards and detail screen |
| `health_kit_type` | `HealthKitType \| null` | HealthKit metric identifier. | `hooks/useCounters.ts` (protected), `lib/health/` |
| `health_kit_config` | `{ stepGoal?: number } \| null` | HealthKit goal configuration. | Same |
| `goal_id` | `string \| null` | Linked goal ID. | `state/goalsSlice.ts`, `app/mark/[id]/index.tsx`, `app/(tabs)/focus.tsx` |

---

### 2. Database Architecture — CRITICAL DISCOVERY

**The database in `lib/db/index.ts` is NOT SQLite.** It is an in-memory mock backed by AsyncStorage JSON blobs. The `CREATE TABLE IF NOT EXISTS` SQL at `initDatabase()` is decorative — it only triggers `storage.set('counters', [])`. No SQL engine parses it.

**Implications for Task 2:**
- The "idempotent column-existence guard" described in the spec **does not exist and cannot be reused**. It must be built as a one-time migration function in the same style as `migrateCountersStorageKey()` (`lib/db/index.ts:41-59`): read a flag from AsyncStorage, run once, set flag.
- Adding a new field means: (a) documenting it in the `CREATE TABLE` comment block, (b) adding it to the `newCounter` object in all `INSERT INTO lc_counters` branches in `runAsync` (currently dispatches by `params.length` — a new mandatory param would shift all param indices), (c) handling it in the generic UPDATE SQL parser (lines 393–416 handle unknown field counts).
- **Recommendation**: add new fields to the in-memory object with defaults (`null` / `undefined`) so they survive the param-length branches without being counted as SQL params. Wire them only through the generic `SET/WHERE` parser at line 393, not by adding a new param-count branch.
- The Supabase migration file is still required for the cloud DB.

---

### 3. Collision / Overlap Report

#### COLLISION A — `schedule_type` + `schedule_days` vs `frequency_recommended / weekly_target` ⚠️ HIGH

`schedule_type + schedule_days` already half-expresses weekly frequency:
- `schedule_type='daily'` = 7 days/week ≈ `weekly_target=7`
- `schedule_type='weekly', schedule_days='[1,3,5]'` = 3 days/week ≈ `weekly_target=3`
- `schedule_type='custom', schedule_days='[0,2,4,6]'` = 4 days/week ≈ `weekly_target=4`

However the semantics are fundamentally different: the current model is **day-assigned** (WHICH days), the new model is **count-based** (HOW MANY days, any days). They cannot be reconciled by renaming — they are different behaviors. Phase 1 must explicitly supersede `schedule_type/schedule_days` with `weekly_target` and the count-based rest logic. The schedule fields should be left in the type for backward compat but marked deprecated; Phase 2 must not read them for consistency math.

**Flag**: `parseScheduleDays()` and `isDueToday()` in `lib/features.ts` (lines 58–134) — both are in a non-protected file. Phase 1's `markWeeklyState` selector replaces `isDueToday` for the new surfaces but `lib/features.ts` is still read by `hooks/useCounters.ts` (protected). Task 2 must NOT modify `hooks/useCounters.ts` — flag for Phase 2.

#### COLLISION B — `goal_value` + `goal_period='week'` vs `weekly_target` ⚠️ MEDIUM

When a mark has `goal_period='week'`, `goal_value` is semantically identical to the proposed `weekly_target`. Example: `goal_value=3, goal_period='week'` = "3 times this week."

These are NOT the same field because `goal_value` is optional and serves a broader purpose (counting units like "8 glasses of water/day"). `weekly_target` is mandatory and specific to frequency. But the weekly-goal case is genuinely redundant after Phase 1. Resolution: keep both; `weekly_target` drives the frequency chip UI and done-for-week state; `goal_value/goal_period` remain as the legacy quantity-goal display in `getGoalLabel`. No data migration needed — they can coexist.

#### NON-COLLISION — `dailyTarget` vs `weekly_target` ✅ SAFE

`dailyTarget` = per-session tap count (1–99). `weekly_target` = occurrence count per week (1–7). These are orthogonal dimensions. `dailyTarget` answers "how many taps to log one session"; `weekly_target` answers "how many sessions this week." They do not conflict. **Do not derive `weekly_target` from `dailyTarget`** during backfill — use `schedule_type/schedule_days` instead.

---

### 4. Reconciliation Recommendation

**Extend with new fields; do not repurpose existing ones.**

Add to the `Mark` type:
- `frequency_min?: number | null` — lower bound of the mark's range
- `frequency_recommended?: number | null` — recommended weekly frequency (default for new marks)
- `frequency_max?: number | null` — upper bound
- `weekly_target?: number | null` — user's chosen count (defaults to `frequency_recommended`)

`isFixed` is derived (`frequency_min === frequency_max`), not stored.

Backfill for existing marks (one-time migration at app startup, guarded by AsyncStorage flag `@livra_migration_freq_v1`):
```
weekly_target =
  schedule_type === 'daily'                    → 7
  (schedule_type === 'weekly' ||
   schedule_type === 'custom') &&
   schedule_days is parseable                  → JSON.parse(schedule_days).length
  fallback                                     → 3

frequency_recommended = weekly_target (backfilled value)
frequency_min         = 1
frequency_max         = 7
```

**Risk note**: existing marks with `schedule_type='daily'` get `weekly_target=7`, which may feel more demanding under count-based rest (a "daily" workout mark previously showed as "due" every day; it will now show as done-for-the-week only at 7/7). This is an intentional redesign UX change. Users can adjust via the new `MarkFrequencyPicker` on the mark detail screen (Task 3).

---

### 5. Subtitle ("items") Bug — All Render Sites

| Location | Line | What renders | Fix needed |
|----------|------|--------------|------------|
| `app/(tabs)/marks.tsx` | 121–124 | `{mark.unit}` as `<Text style={markUnit}>` below mark name | Replace with frequency phrase or goal name |
| `app/mark/[id]/index.tsx` | 617–618 | `{counter.unit}` as `<Text style={heroMeta}>` below hero title | Same |
| `components/CounterTile.tsx` | 625 | `prevProps.counter.unit === nextProps.counter.unit` | Memo comparison only — no render change needed, but update after unit display is removed |
| `components/MarkCard.tsx` | 599 | `prev.counter.unit === next.counter.unit` | Same — memo only |
| `app/mark/[id]/edit.tsx` | 108 | `(counter?.unit as ...) \|\| 'sessions'` | Form default — unrelated to display subtitle; leave until edit screen is redesigned |
| `app/onboarding.tsx` | 177 | `unit: sugg.unit` | Mark creation param — not a display issue |
| `app/goal/new.tsx` | 75 | `unit: sugg.unit` | Same |

**Task 5 scope**: only the two render sites (`marks.tsx:121-124` and `mark/[id]/index.tsx:617-618`) need to change. The memo comparisons can remain unchanged without breaking anything.

---

### 6. Weekly-Window Helper Inventory

Three inconsistent implementations exist; Phase 2 must pick one:

| Location | Boundary | Export | Used by |
|----------|----------|--------|---------|
| `lib/review/weeklyReview.ts:48` | **Trailing 7 days** (today − 6 → today) | `getWeekRange` (exported) | Weekly reflection, weekly review seed query, `notificationSystem.ts` |
| `lib/features.ts:22` | **Sunday-start** calendar week | `startOfWeekISO` (private) | `getPeriodTotal` (for `goal_period='week'`), `getGoalLabel` |
| `lib/notificationSystem.ts:28` | **Monday-start** calendar week | `startOfWeekMonday` (private) | Notification scheduling |

None of these is a clean "Monday → Sunday calendar week" window. The Phase 1 `markWeeklyState` selector needs to count `completionsThisWeek` — it must define "this week." **Recommendation**: create a new exported helper `currentWeekDates(): string[]` that returns the 7 ISO date strings for the current Mon–Sun calendar week, placed in `lib/features.ts` alongside the existing date utils. Phase 2 adopts this as the canonical week definition.

---

### 7. Mark Library — Frequency Gaps (`lib/suggestedCounters.ts`)

All 44 marks in `MARK_LIBRARY` lack `frequency_min/recommended/max` and `frequencyKind`. Proposed values for confirmation (to be added in Task 2).

**⚠️ Prior draft had errors: abstinence marks were assigned 3/5/7 variable; cognitive marks were assigned 3/5/7 instead of 3/4/6. Both corrected below.**

| Mark | id | min | rec | max | frequencyKind | Notes |
|------|----|-----|-----|-----|---------------|-------|
| Sleep | sleep | 7 | 7 | 7 | fixed | Daily necessity |
| Stretch | stretch | 3 | 5 | 7 | variable | |
| Rest Day | rest | 1 | 2 | 3 | variable | Recovery inverse |
| Workout | workout | 2 | 3 | 5 | variable | |
| Steps | steps | 5 | 7 | 7 | variable | Near-daily |
| Run | run | 2 | 3 | 5 | variable | |
| Swim | swim | 2 | 3 | 5 | variable | |
| Cycling | cycling | 2 | 3 | 5 | variable | |
| Water | water | 5 | 7 | 7 | variable | Near-daily |
| Nutrition | nutrition | 3 | 5 | 7 | variable | |
| Vitamins | vitamins | 5 | 7 | 7 | variable | Near-daily |
| Calories | calories | 5 | 7 | 7 | variable | ⚠️ AMBIGUOUS: daily tracking (5/7/7 like Water) vs. lighter 3/5/7 — flag for confirmation |
| No Alcohol | no-alcohol | 7 | 7 | 7 | abstinence | Maps to spec `no_beer`; you don't rest from sobriety |
| Meal Prep | meal-prep | 1 | 2 | 3 | variable | Done once or twice a week |
| Meditation | meditation | 3 | 5 | 7 | variable | |
| Journaling | journaling | 3 | 5 | 7 | variable | |
| Gratitude | gratitude | 3 | 5 | 7 | variable | |
| Breathwork | breathwork | 3 | 5 | 7 | variable | |
| Affirmations | affirmations | 3 | 5 | 7 | variable | |
| Focus | focus | 3 | 4 | 6 | variable | Cognitive (taxing) archetype |
| Planning | planning | 3 | 5 | 7 | variable | Productivity |
| Reading | reading | 3 | 5 | 7 | variable | |
| Practice | practice | 3 | 4 | 6 | variable | ⚠️ AMBIGUOUS: cognitive taxing (3/4/6) vs. light wellness (3/5/7) |
| Study | study | 3 | 4 | 6 | variable | Cognitive (taxing) |
| Deep Work | deep-work | 3 | 4 | 6 | variable | Cognitive (taxing) |
| No Phone | no-phone | 7 | 7 | 7 | abstinence | Maps to spec `screen_free` |
| Writing | writing | 3 | 4 | 6 | variable | ⚠️ AMBIGUOUS: cognitive taxing (3/4/6) vs. light wellness (3/5/7) |
| Language | language | 3 | 4 | 6 | variable | ⚠️ AMBIGUOUS: cognitive taxing (3/4/6) vs. light wellness (3/5/7) |
| Finance | finance | 3 | 5 | 7 | variable | ⚠️ AMBIGUOUS: productivity (3/5/7) vs. low-frequency 2/3/5 |
| Saving | saving | 3 | 5 | 7 | variable | ⚠️ AMBIGUOUS: same as Finance |
| No Spend | no-spend | 7 | 7 | 7 | abstinence | Maps to spec `no_spending` |
| Invest | invest | 2 | 3 | 5 | variable | Lower frequency appropriate |
| Side Hustle | side-hustle | 2 | 3 | 5 | variable | |
| Cold Shower | cold-shower | 3 | 5 | 7 | variable | |
| Wake Early | wake-early | 5 | 7 | 7 | variable | ⚠️ AMBIGUOUS: near-daily variable (5/7/7) vs. fixed daily necessity (7/7/7) |
| No Sugar | no-sugar | 7 | 7 | 7 | abstinence | Maps to spec `no_sugar` |
| Screen Time | screen-time | 3 | 5 | 7 | variable | ⚠️ AMBIGUOUS: variable tracking vs. abstinence (7/7/7) if it means screen-free days |
| Cooking | cooking | 2 | 3 | 5 | variable | |
| Posture | posture | 3 | 5 | 7 | variable | |
| Socialize | socialize | 1 | 2 | 4 | variable | |
| Family Time | family | 2 | 3 | 5 | variable | |
| Networking | networking | 1 | 2 | 3 | variable | |
| Volunteer | volunteer | 1 | 1 | 2 | variable | |
| Creative | creative | 2 | 3 | 5 | variable | |

**Marks requiring confirmation before Task 2 begins library changes:**
- **Calories** — 5/7/7 (near-daily tracking) or 3/5/7?
- **Practice / Writing / Language** — cognitive taxing (3/4/6) or light wellness (3/5/7)?
- **Finance / Saving** — productivity ladder (3/5/7) or low-frequency (2/3/5)?
- **Wake Early** — variable near-daily (5/7/7) or fixed daily necessity (7/7/7)?
- **Screen Time** — variable (3/5/7) or abstinence (7/7/7)?

Sleep (7/7/7 fixed) and the four abstinence marks (No Alcohol, No Phone, No Spend, No Sugar) are not ambiguous — confirm before Task 2 executes.

---

### 8. Migration Risk Summary

| Risk | Severity | Notes |
|------|----------|-------|
| Existing marks missing new fields | Medium | Handled by one-time startup migration. Backfill expression documented above. |
| `schedule_type='daily'` → `weekly_target=7` shift | Low–Medium | Intended UX change; users can adjust on detail screen. |
| AsyncStorage mock `params.length` branching | Medium | New fields must NOT be added as positional SQL params. Use generic parser path. |
| No real SQLite column-existence guard | Medium | Migration pattern must be built from scratch using AsyncStorage flag (same as `migrateCountersStorageKey`). |
| Three inconsistent week definitions | Medium | Phase 2 will need a canonical `currentWeekDates()` helper; Phase 1 Task 4 must be consistent with what Phase 2 will build. |
| Supabase cloud DB | Low | Migration file needed but applied manually; no app code reads frequency fields from Supabase yet. |

---

**STOP — awaiting go-ahead before Task 2.**

---

## Phase 1 Task 2 — Frequency Fields + Migration (2026-06-12) — 91aed7b, b400687

| File | Change | Why |
|------|--------|-----|
| `types/index.ts` | Added `FrequencyKind` type export (`'variable' \| 'fixed' \| 'abstinence'`). Added `frequency_min`, `frequency_recommended`, `frequency_max`, `weekly_target`, `frequency_kind` as optional nullable fields to `Mark` type. | Frequency model fields required by Phase 1 spec. |
| `lib/suggestedCounters.ts` | Added `frequency_min`, `frequency_recommended`, `frequency_max`, `frequencyKind` to `MarkDefinition` type. Populated all 44 marks with approved values (see Section 7 above). | Mark library must carry frequency ranges to default new marks correctly. |
| `lib/db/index.ts` | Added `migrateFrequencyFields()` — one-time AsyncStorage migration guarded by `@livra_migration_freq_v1` flag. Backfills `weekly_target` from `schedule_type`/`schedule_days` (never `dailyTarget`). Sets `frequency_recommended = weekly_target`, `frequency_min = 1`, `frequency_max = 7`, `frequency_kind = 'variable'`. Called in `initDatabase()` after `migrateCountersStorageKey()`. Fixed pre-existing bug: generic UPDATE parser regex now uses dotAll flag (`/is`) so multi-line SQL template literals are parsed correctly. | New fields must be backfilled for existing users. Regex bug silently discarded all updateMark field writes. |
| `state/countersSlice.ts` | `addMark`: adds a third UPDATE (6 params: frequency_min/recommended/max/weekly_target/frequency_kind/id) routed through generic SQL parser — avoids 11-param branch conflict. `updateMark`: added all 5 new fields to existing large UPDATE SQL. | New fields must persist through all creation/update paths. |
| `hooks/useCounters.ts` | ⚠️ **Controlled exception to protected-file rule**: added `frequency_kind` to the input type and passthrough in `createMark`. 2-line change, no logic modification. Required to prevent abstinence/fixed marks from having their `frequencyKind` silently overwritten to `'variable'` on creation. | Without this, library marks with `frequencyKind='abstinence'` would be stored as `'variable'`. |
| `app/mark/new.tsx`, `app/onboarding.tsx`, `app/goal/new.tsx` | Added `frequency_kind: sugg.frequencyKind` to all call sites that convert a `MarkDefinition` suggestion into an `addMark` payload. | Ensures library frequency kind propagates through all creation UI paths. |
| `supabase/migrations/20260612_frequency_fields.sql` | New migration file. Adds 5 columns to `marks` table. Includes idempotent backfill UPDATE (`WHERE weekly_target IS NULL`). **Not applied — run manually via `supabase db push`.** | Cloud DB must match local schema. |
| `tests/unit/frequencyMigration.test.ts` | 8 tests: flag guard, daily→7, custom-days by count, empty-days→3, null schedule→3, correct min/rec/max/kind defaults, clamping to 1–7, non-fatal on error. | TDD coverage for migration guard. |

**Tests:** 389/389 passing. **Type-check:** 0 errors.

---

## Supabase IO Optimization (2026-06-10) — d9a5c05, 7ec494a, cd66dc7

| File | Change | Why |
|------|--------|-----|
| `supabase/migrations/20260610_fix_rls_performance.sql` | New migration — drops and recreates all RLS policies on `profiles`, `marks`/`counters`, `mark_events`/`counter_events`, `mark_streaks`/`counter_streaks`, `mark_badges`/`counter_badges`, `mark_notes`, `xp_events` using `(select auth.uid())` instead of bare `auth.uid()`. Handles pre- and post-rename table names via `DO $$` blocks. | `auth.uid()` is a volatile function; without the subselect wrapper Postgres re-executes it for every row scanned, causing excessive disk IO on the Free tier. |
| `hooks/useSync.ts` | `SYNC_THROTTLE_MS` 30 000 → 120 000 (30 s → 2 min). | Reduces Supabase read/write frequency by 4× per user session, cutting per-request IO without changing correctness — real-time and bypass-throttle paths are unaffected. |
| `hooks/useSync.ts` | Added `lastCleanupDateRef = useRef<string \| null>(null)`. Cleanup jobs block (`cleanupDuplicateCounters`, `cleanupOrphanedStreaksAndBadges`, `cleanupOrphanedEvents`, orphan badge sweep) gated behind `lastCleanupDateRef.current !== today` where `today = formatDate(getAppDate())`. Ref updated before entering the block. | These SQLite + Supabase cleanup queries are best-effort maintenance, not per-sync correctness. Running them on every sync (potentially dozens of times per day) created unnecessary IO load. Once-per-day cadence is sufficient. |

> **Action required:** Apply `supabase/migrations/20260610_fix_rls_performance.sql` manually via the Supabase Dashboard SQL Editor or `supabase db push`. The migration is idempotent and safe to run on a live database.
| `app/mark/[id]/index.tsx` | Notes section already uses `fonts.sansSemibold` uppercase labels, `c.surface` background, `c.borderMid` border on TextInput, date labels and separators on past notes, no delete buttons on past notes. No changes needed. |

---

## Phase 1 Task 4 — Weekly State: due / doneForWeek / bonus (2026-06-12)

| File | Change | Why |
|------|--------|-----|
| `lib/features.ts` | Added `currentWeekDates(): string[]` — exported, returns 7 ISO strings for Mon–Sun of the current week using inline Monday-start logic (mirrors notificationSystem.ts private helper). Added `markWeeklyState(mark, completionsThisWeek): 'due' \| 'doneForWeek'` — pure selector; returns `'doneForWeek'` when `completionsThisWeek >= (weekly_target ?? 3)`. Added `computeCompletionsThisWeek(mark, events, weekDates): number` — counts distinct days in the week where sum of increment amounts meets `resolveDailyTarget(mark)`. | Weekly state logic needed by detail screen and future home screen badges. |
| `app/mark/[id]/index.tsx` | Imported `currentWeekDates`, `markWeeklyState`, `computeCompletionsThisWeek` from `lib/features`. Added `weekDates`, `completionsThisWeek`, `weeklyState` derived memos in `MarkDetailContent`. Added "done for week" UI block (after secondary actions) shown only for `frequency_kind === 'variable'` marks at `doneForWeek` state — displays motivational copy and a "One more this week" bonus log button. Added `doneForWeekWrap`, `doneForWeekText`, `bonusLogBtn`, `bonusLogBtnText` to `createStyles`. | Surface weekly completion state for variable-frequency marks. |
| `tests/unit/weeklyState.test.ts` | 20 tests: `currentWeekDates` (7 strings, Mon start, Mon/Sat/Sun entry days, consecutive), `markWeeklyState` (due/doneForWeek at/above/below target, null target defaults, fixed kind passthrough), `computeCompletionsThisWeek` (empty, 3-logs-same-day, multiple days, bar>1 partial, outside week, deleted, decrement). Phase 2 passthrough test documents that raw count is uncapped here; Phase 2 will cap at `weekly_target` for consistency math. | TDD coverage for all three new helpers. |

**Flag:** `startOfWeekISO()` in `lib/features.ts` (line ~24) is Sunday-start and still used by `getPeriodTotal` for `'week'` period goals. `currentWeekDates()` and `computeCompletionsThisWeek` use Monday-start logic. **Phase 2 must reconcile** whether `getPeriodTotal` week period should also shift to Monday-start or whether the two functions intentionally use different week anchors.

**Tests:** 20/20 passing (weeklyState.test.ts). **Type-check:** 0 errors.

---

## Phase 1 Task 5 — Subtitle Fix: replace `unit` string with frequency phrasing (2026-06-12)

| File | Change | Why |
|------|--------|-----|
| `app/(tabs)/marks.tsx` | Added `import { frequencyLabel } from '../../components/ui/MarkFrequencyPicker'` and `import type { Mark } from '../../types'`. Added `markSubtitle()` helper (lines 24–35). Replaced `mark.unit ? <Text>{mark.unit}</Text>` (was lines 121–125) with an IIFE calling `markSubtitle(mark)` — renders frequency phrasing or nothing. | The `unit` field (`'sessions'`, `'items'`, etc.) was never intended as a display subtitle. The marks list now shows human-readable frequency text (e.g., "Twice a week", "Every day") or nothing if the mark lacks frequency data. |
| `app/mark/[id]/index.tsx` | Added `frequencyLabel` to the existing `MarkFrequencyPicker` import (line 61). Added `markSubtitle()` helper using `Pick<import('../../../types').Mark, ...>` inline type (lines 95–106). Replaced `counter.unit ? <Text>{counter.unit}</Text>` (was lines 637–639) with an IIFE that shows `markSubtitle(counter)` first, falls back to `workingTowardGoal?.title` if no frequency data, or renders nothing. | Same `unit` bug on the mark detail hero area. Fall-back to linked goal title ensures old marks (without frequency fields) still show useful context. Raw `unit` string no longer renders. |

**Type-check:** 0 errors.

---

## Phase 2 — Consistency Engine Audit (2026-06-12)

### 1. `currentWeekDates()` — confirmed present

`lib/features.ts` exports `currentWeekDates(): string[]` (Monday-start ISO, added Phase 1 Task 4). It is the canonical week definition. The consistency engine **must use this and nothing else.**

### 2. Completions query — exact read-only call

`lib/features.ts` also exports `computeCompletionsThisWeek(mark, events, weekDates): number` (Phase 1 Task 4). It counts **distinct days in `weekDates` where sum of increment `amount` ≥ `resolveDailyTarget(mark)`** — exactly the Phase 1 definition. Events come from `useEventsStore(s => s.events || [])`.

The consistency engine call pattern per mark:

```ts
const weekDates = currentWeekDates();
const markEvents = allEvents.filter(e => e.mark_id === mark.id && !e.deleted_at);
const completions = computeCompletionsThisWeek(mark, markEvents, weekDates);
const capped = Math.min(completions, mark.weekly_target ?? 3);
```

No protected files need to be touched. `useEventsStore` is already read in the tracking tab and mark detail screen — the consistency engine reads it the same way.

### 3. Weekly-reflection feature — reconciliation onto `currentWeekDates()`

Four week helpers exist in the codebase. Three are legacy; one is canonical:

| Helper | File | Anchor | Status |
|--------|------|--------|--------|
| `currentWeekDates()` | `lib/features.ts:38` | **Monday-start ISO** ✅ | **Canonical — use this** |
| `getWeekDatesMondayFirst(anchor)` | `app/(tabs)/tracking.tsx:88` | Monday-start (same logic as canonical) | ⚠️ Private duplicate — **Phase 2 must replace with `currentWeekDates()` import** |
| `getWeekRange(referenceDate)` | `lib/review/weeklyReview.ts:48` | **Trailing 7 days** (today − 6) | ❌ Different semantic — used by `useWeeklyReview.ts`. The weekly-reflection panel shows the trailing window, not the ISO week. **Phase 2 must migrate `hooks/useWeeklyReview.ts` to use `currentWeekDates()`** so the reflection panel and consistency engine agree on week boundaries. |
| `startOfWeekMonday(d)` | `lib/notificationSystem.ts:28` | Monday-start | Private to notification scheduling — not a concern for consistency. |
| stats.tsx inline | `app/(tabs)/stats.tsx:40–47` | Monday-start (inline) | ⚠️ Duplicate inline — replace with `currentWeekDates()` call in Phase 2. |

**Reconciliation required for Phase 2:**
- `app/(tabs)/tracking.tsx`: replace `getWeekDatesMondayFirst(getAppDate())` (line 164) with `currentWeekDates()`.
- `hooks/useWeeklyReview.ts`: replace `getWeekRange(ref)` with `currentWeekDates()` to align the reflection panel to the ISO week.
- `app/(tabs)/stats.tsx`: replace inline Monday-start block (lines 40–47) with `currentWeekDates()`.

### 4. "Weeks strong" — current state

**"Weeks strong" does not exist anywhere in the codebase** — no component, no utility, no copy string. Phase 2 Task 3 will introduce it for the stats view only. No migration needed; it is net-new.

The `weeksStrong` history must be stored. No AsyncStorage key exists yet. **Phase 2 must define `@livra_consistency_history`**: `{ weekStart: string; strong: boolean }[]`. `weeksStrong(history)` = count of entries where `strong === true` (total, not consecutive — see Phase 2 Task 2 note).

### 5. Daily streak as primary metric — surfaces Phase 3 must clean up

| Location | What renders | Spec says |
|----------|-------------|-----------|
| `app/(tabs)/focus.tsx:284` | `{overallStreakDays} day streak` in the Focus banner | **Remove from Focus** (Phase 3) |
| `app/(tabs)/focus.tsx:292` | `STREAK` stat strip on Focus | **Remove from Focus** (Phase 3) |
| `app/(tabs)/tracking.tsx:259–265` | Per-mark day-streak motivation copy | Phase 3 decision (tracking panel replaced by consistency copy) |
| `app/(tabs)/stats.tsx:182` | "Best streak" stat card — all-time best consecutive days | **Keep in stats** — historical, not weekly consistency |
| `app/(tabs)/profile.tsx:258` | "Best streak" per-mark | Review in Phase 3 |

`overallStreakDays` (focus.tsx:99–115) counts consecutive days with any increment event — it is a raw-activity daily streak, unrelated to the weekly consistency model. Phase 3 removes it from the daily surface.

### 6. No collisions with locked formula

The `computeWeek` formula fields (`weekly_target`, `completions`, `weekDates`) all exist and are unprotected. No field touches `schedule_type`, `schedule_days`, `dailyTarget`, `goal_value`, or `goal_period`. No protected file needs modification for Phase 2.

---

## Phase 2 Task 2 — `lib/consistency.ts` (commit `8354aeb`)

| File | Change | Why |
|------|--------|-----|
| `lib/consistency.ts` | Created. Exports `computeWeek(marks, completionsByMark, weekDates)` → `{ expected, counted, required, strong, remaining }` per the locked formula. Exports `weeksStrong(history)` — total (not consecutive) strong-week count. Exports `appendCompletedWeeks(marks, allEvents)` — async thin layer: reads `@livra_consistency_history`, finds completed Mon–Sun weeks not yet recorded, evaluates each with `computeWeek` (never the in-progress week), appends and persists. Backfills up to 12 weeks on empty history. | Weekly consistency engine per Phase 2 spec. |
| `tests/unit/consistency.test.ts` | 16 tests: formula fields, per-mark cap (bonus logs excluded), remaining = copy number, low-volume rounding (expected=2→required=1), empty marks, all-met week, default weekly_target=3, weeksStrong variants, appendCompletedWeeks (skip in-progress, one missed, multiple missed backfill, no re-record, max-12 on empty). Written before implementation (TDD). | |

**Tests:** 16/16. **Type-check:** 0 errors.

---

## Phase 2 Task 3 — Week-helper consolidation (commit `c0cdd5a`)

| File | Change | Why |
|------|--------|-----|
| `app/(tabs)/tracking.tsx` | Removed private `getWeekDatesMondayFirst()` (lines 88–96). Added `currentWeekDates` import from `lib/features`. Replaced `getWeekDatesMondayFirst(getAppDate())` at line 164 with `currentWeekDates()`. Pure dedup — same Monday-start logic, no behavior change. | Duplicate eliminated; single canonical definition. |
| `app/(tabs)/stats.tsx` | Replaced inline Monday-start block (lines 40–47 computing `weekLoggedDays`/`isAfterComeback`) with `currentWeekDates()`. Logic preserved; previous-week dates now derived from `dates[0] - 7 days`. Pure dedup. | Same. |
| `hooks/useWeeklyReview.ts` | **Behavior change**: replaced `getWeekRange(ref)` (trailing-7 days) with last completed ISO Mon–Sun week. New logic: `currentMonday = currentWeekDates()[0]`, `lastSunday = currentMonday - 1 day`. Passes `lastSunday` to `getWeekRange`, yielding `weekStart = lastSunday - 6 = last Monday`. Removed `referenceDate` parameter (no callers). | Weekly review must target a complete Mon–Sun week, never a partial in-progress stub. |

**Behavior note (useWeeklyReview):** Reviews are recomputed on the fly (not stored snapshots). Changing the window from trailing-7 to ISO Mon–Sun means past history entries under trailing-7 keys remain in `livra_weekly_review_history` but are superseded by new ISO-keyed entries. Cosmetic boundary shift; no stored review was rewritten.

**Tests:** 402/402. **Type-check:** 0 errors.

---

## Phase 2 Task 4 — Copy wiring (commit pending)

| File | Change | Why |
|------|--------|-----|
| `app/(tabs)/focus.tsx` | Removed `thisWeekCount` memo (inline Monday-start block). Added `weekDates` memo via `currentWeekDates()`. Added `consistencyResult` memo: calls `computeCompletionsThisWeek` per active mark, then `computeWeek` for the current week. Replaced `thisWeekCount` in stat strip with `consistencyResult?.counted ?? 0`. Added forgiveness line below stat strip: "Still on track. You need {remaining} more check-in(s) this week." — only when `!strong && remaining > 0`. No red/negative styling on any element. | Forgiveness copy wired to consistency engine. THIS WEEK stat shows completion days (not raw event sum). |
| `app/(tabs)/stats.tsx` | Added `useEffect` to call `appendCompletedWeeks` on mount (app-open trigger for history persistence). Added `weeksStrongCount` from `weeksStrong(consistencyHistory)`. Added "Weeks strong" stat card to the stat row. | `weeksStrong` appears in stats view only per spec. |

**Tests:** 439/439. **Type-check:** 0 errors.

---

## Phase 3 — IA Restructure Audit (2026-06-12) — READ-ONLY, NO CODE CHANGED

**Status: AUDIT COMPLETE — awaiting go-ahead before any Task.** Mapping of current state vs. `prompt-03-ia-restructure.md`. No source files were modified.

### 1. What `app/(tabs)/focus.tsx` renders today

Phase-5 rebuild + Phase-2 wiring. Top-to-bottom:
1. `LivraHeader` (centerLogo, showAvatar).
2. Greeting line (serif italic).
3. **Compact progress banner** (56px): `{completedMarksToday}/{todayTotal} marks` on the left; **daily streak** (`{overallStreakDays} day streak` + Lightning icon) on the right (lines 273–278).
4. **Compact stat strip** (44px, 3 cells): `STREAK` / `THIS WEEK` / `GOALS` (lines 283–286). `THIS WEEK` = `consistencyResult.counted` (Phase 2). `GOALS` = active goal count.
5. **Forgiveness line** (Phase 2 Task 4, lines 302–308): "Still on track. You need {remaining} more check-in(s) this week." Renders only when `consistencyResult && !strong && remaining > 0`. Neutral styling. **Must be preserved by the redesign.**
6. **YOUR MARKS** section + "See all" → `router.push('/(tabs)/marks')` (line 315). Flat list of `activeCounters.slice(0,5)` (line 232), each a `Swipeable` → `MarkRow` with inline `CheckinButton` (`onLog` → `handleQuickIncrement` → `incrementCounter`). Long-press = View/Edit/Delete alert. Empty state handled.
7. `SpeedDialFAB`.

**Integration constraints for the redesign:**
- There is **NO daily ring** on Focus anymore (Phase 5 replaced the old SVG ring with the banner). Grep for `ring|Svg|Circle` in focus.tsx is empty. Spec Task 3 "remove the daily ring" is **already satisfied** — nothing to remove.
- The **THIS WEEK stat (`consistencyResult.counted`) and the forgiveness line are Phase-2 consistency surfaces.** Spec says consistency lives in stats, daily surface stays neutral — but these were *just* added in Phase 2 Task 4 and wired to the locked copy. **DECISION NEEDED:** does Phase 3 keep the forgiveness line + THIS WEEK on Focus (they are neutral/forgiving, not streaks), or move them to stats? The prompt says integrate, not clobber — flag this conflict rather than silently delete.

### 2. Daily streak removal sites (prompt referenced focus.tsx:284,292 — line numbers have SHIFTED)

The prompt's `284,292` came from the Phase 2 audit; focus.tsx changed in Phase 2 Task 4. **Current actual streak sites:**

| Site | Current line(s) | What |
|------|-----------------|------|
| `overallStreakDays` memo (computation) | **101–117** | Counts consecutive days with any increment event. Raw-activity daily streak. |
| Streak haptic effect + `prevStreakRef` | **156–166** | Fires haptic when streak increases. Becomes dead once streak removed. |
| Banner streak line | **273–278** | `{overallStreakDays} day streak` + `Lightning` icon in the progress banner. |
| `STREAK` stat cell | **284** | `{ value: String(overallStreakDays), label: 'STREAK' }` in stat strip. (Line 284 still matches.) |

**Line 292 is NOT a streak site in the current file** — it is `borderRightColor` styling inside the stat-strip `.map`. The second streak site is the banner at 273–278. If streak is removed: delete memo (101–117), effect (156–166), banner block (273–278), STREAK cell (284), plus now-unused imports (`Lightning`, `subDays`, `Haptics` streak usage, `prevStreakRef`).

### 3. Marks tab — what it does + every breaking reference if removed

`app/(tabs)/marks.tsx` (282 lines): full mark list (all `activeCounters`, not sliced), header "Your marks" + add button → `/mark/new`, per-mark card → `/mark/[id]` (or `/paywall` if locked), **free-tier gating** (`FREE_MARK_LIMIT = 3`, marks beyond index 3 locked for non-Pro), Livra+ upsell row, frequency subtitle via local `markSubtitle()` helper. Uses legacy `theme/colors` (not `themedColors`). Registered hidden at `_layout.tsx:111` (`href: null`).

**References that break if the tab/file is removed:**
| Ref | Location | Impact |
|-----|----------|--------|
| `router.push('/(tabs)/marks')` | `app/(tabs)/focus.tsx:315` (See all) | **Breaks** — dead route. Must repoint (e.g. to Goals or a marks list) or remove the "See all" affordance. |
| `<Tabs.Screen name="marks" href:null />` | `app/(tabs)/_layout.tsx:111` | Remove this registration. |

No other code imports `marks.tsx`. **Gating note:** the `FREE_MARK_LIMIT=3` lock UI + Livra+ upsell currently live ONLY in marks.tsx. Removing the tab orphans that paywall surface — Phase 5 (premium gating) is supposed to move mark-cap to per-goal; flag that the only existing mark-cap UI disappears here.

### 4. Shared components between Marks and Focus

Almost none at the component level. Marks tab uses `MarkIcon` + `resolveCounterIconType` directly and a **local** `markSubtitle()`; Focus uses `MarkRow` (ui), `SpeedDialFAB`, `LivraHeader`, `SectionLabel`. Both consume the `useCounters` hook and `useIapSubscriptions`/event data. The `markSubtitle()` frequency helper is **duplicated** in `marks.tsx` (lines 24–35) and `app/mark/[id]/index.tsx` — removing the Marks tab does not lose it (still in mark detail), but the duplication should eventually consolidate to `MarkFrequencyPicker.frequencyLabel`. No shared component is *uniquely* coupling the two screens; removing Marks is low-blast-radius UI-wise.

### 5. Current queue screen — TWO distinct "queue" surfaces (critical)

There are **two** files and they split the "Goals planning view" the spec wants:

| File | Role | Renders |
|------|------|---------|
| `app/(tabs)/queue.tsx` (453 ln) | **The Queue TAB** (→ becomes Goals) | LivraWordmark header, "YOUR QUEUE" label, empty state, hero `QueueCard` (active/first goal), drag-to-reorder `DraggableQueueList` of remaining queued goals. **Title only — no progress, no completed goals, no add-goal-here beyond the card `+`.** Card `+` and `handleAddGoal` both `router.push('/goal/queue')`. |
| `app/goal/queue.tsx` (412 ln) | **Goal MANAGEMENT modal** (stack screen, reached from the tab) | ACTIVE card (progress bar `progress/threshold mark logs`, target-date picker, Mark-complete / "N more logs to unlock"), UP NEXT list (delete), COMPLETED toggle → `/goal/history`, full empty state, add → `/goal/new`. |

**Spec's Goals tab (Task 2: "active + upcoming + completed, reorder, add-goal") = a MERGE of these two.** The tab has reorder; the modal has active/upcoming/completed + progress + complete/delete + add. **DECISION NEEDED:** does Phase 3 (a) fold `goal/queue.tsx`'s richer planning content into the tab and drop the modal, or (b) keep the tab thin and keep navigating to the modal? Spec Task 2 says "repurpose the former queue screen" — but the former queue screen (the tab) lacks completed-goals and progress entirely. Executing Task 2 literally would still leave the real planning UI stranded in the modal.

### 6. Route-rename impact: `queue` → `goals`

If the tab file is renamed `app/(tabs)/queue.tsx` → `goals.tsx` (route `/(tabs)/queue` → `/(tabs)/goals`):
| Ref | Location | Action |
|-----|----------|--------|
| `Tabs.Screen name="queue" title:'Queue'` | `app/(tabs)/_layout.tsx:91–99` | Rename to `goals`, title → "Goals". |
| `<Redirect href='/(tabs)/queue' />` | `app/weekly-review.tsx:8` | Repoint to `/(tabs)/goals`. |

**Do NOT confuse** `/(tabs)/queue` (the tab) with `/goal/queue` (the management modal). Refs to `/goal/queue` — `(tabs)/queue.tsx:304`, `goal/complete.tsx:106`, `components/ActiveGoalBanner.tsx:37` — are a different route and are unaffected by the tab rename. (Title can change without renaming the file/route; the spec only mandates the **title** "Goals" + removing Marks. Renaming the route is optional and carries the redirect cost above.)

### 7. Goal-card / inline-mark UI — does any exist? **NO (net-new build)**

No component renders a goal card with inline *checkable* marks. Inventory of the building blocks:
- `components/ui/QueueCard.tsx` — goal card (hero/standard) by **title + sequence only**, no marks. Used by the Queue tab.
- `app/goal/queue.tsx` `GoalMarkRow` — linked-mark **chips** that `router.push('/mark/[id]')` (navigate, NOT checkable in place).
- `components/ui/MarkRow.tsx` — a mark row WITH inline `CheckinButton` (checkable via `onLog`), but flat, not grouped under a goal. Supports `subtitle`, `showWeeklyCount`/`weeklyCount`/`weeklyTarget` (a weekly-count display mode already exists).
- `components/MarkCard.tsx` (666 ln) and `components/ActiveGoalBanner.tsx` exist but are **NOT rendered anywhere** in the live 3-tab nav (orphaned; MarkCard only re-exported via `components/HabitRow.tsx`).

**The Task 3 goal-card-with-inline-marks must be composed new** from `MarkRow` (checkable) + goal grouping (`mark.goal_id` / `goal.linked_mark_ids`) + `getGoalProgress`. Data exists; the composed component does not.

### 8. Focus redesign gaps vs. current behavior (Task 3)

| Spec requirement | Current state |
|------------------|---------------|
| ≤2 active goal cards, marks grouped under them | Focus shows a **flat** `activeCounters.slice(0,5)` list, ungrouped. |
| Max 4 marks/card + "X more" expander | No expander; hard slice of 5. |
| Completed marks sink/dim at card bottom | No sink/dim; `loggedToday` only toggles the CheckinButton state. |
| `doneForWeek` marks show rest line + bonus log, sink for the day | Focus uses **daily** `loggedToday` (`resolveDailyTarget`), NOT Phase-1 `markWeeklyState`/`computeCompletionsThisWeek`. Weekly state is wired on the **mark detail** screen only, not Focus. |
| "Daily habits" collapsed section for goal-less marks | Does not exist. |
| Last-due-mark → "That's today done. See you tomorrow." + Reanimated transition | Does not exist. |
| No streak/weeks-strong on Focus | Streak present (banner + STREAK cell). THIS WEEK + forgiveness line present (Phase 2). See §1 decision. |

### 9. FAB wiring

`SpeedDialFAB` (self-contained) renders on Focus (focus.tsx:375) and opens `AddMarkSheet` ("New Mark", `check-circle` icon) / `AddGoalSheet` ("New Goal", `flag` icon) bottom sheets. First-launch peek hint via AsyncStorage `fab_hint_shown`. It was **removed from the Queue tab** in the Marks-Goals Task 6 (queue.tsx has no FAB now; it adds goals via card `+`/header). Spec Task 3 says "keep the FAB" on Focus — already present, no change needed.

### Open decisions to resolve before executing Phase 3
1. **§1/§8:** Keep or relocate the Phase-2 THIS WEEK stat + forgiveness line on Focus? (Just shipped; spec wants neutral daily surface.)
2. **§5:** Merge `goal/queue.tsx` (management modal) into the Goals tab, or keep the tab→modal split? Task 2 as written under-specifies the real planning UI's home.
3. **§3:** Removing the Marks tab orphans the only `FREE_MARK_LIMIT=3` lock + Livra+ upsell surface. Confirm Phase 5 absorbs this, or retain gating somewhere in the interim.
4. **§6:** Rename the route `queue`→`goals` (file rename + redirect repoint) or only change the tab **title**? Spec mandates title + Marks removal, not necessarily a route rename.

**STOP — awaiting go-ahead before executing any Phase 3 Task.**

---

## Phase 3 — IA Restructure EXECUTION (2026-06-12)

Audit approved. UI/navigation only — no `state/` or protected paths modified. Tab set is now **Focus / Goals / Settings**.

### Task 1 — Tab set (route rename + Marks removal)

| File | Change | Why |
|------|--------|-----|
| `app/(tabs)/queue.tsx` → `app/(tabs)/goals.tsx` | `git mv` — full route rename `queue` → `goals`. Content unchanged in this task (rebuilt in Task 2). | Locked IA renames the Queue tab to Goals; route + file renamed so tab label, route, and filename agree. |
| `app/(tabs)/marks.tsx` → `app/(tabs)/marks.tsx.archived` | `git mv` — removed from the route group (archived in place, matching the existing `checkin.tsx.archived` precedent). | Removing only the `href:null` registration would leave the `.tsx` file in `(tabs)/`, which expo-router would auto-surface as a visible tab. Archiving removes it as a route while preserving the `FREE_MARK_LIMIT=3` gating UI for Phase 5 to repurpose. |
| `app/(tabs)/_layout.tsx` | Renamed `QueueIcon` → `GoalsIcon`; `Tabs.Screen name="queue" title="Queue"` → `name="goals" title="Goals"`; removed `<Tabs.Screen name="marks" href:null />`. | Three-tab set: Focus / Goals / Settings. |
| `app/weekly-review.tsx` | Redirect `/(tabs)/queue` → `/(tabs)/goals`; comment updated. | Only deep-link/redirect pointing at the renamed tab route. |

**Not touched (per spec):** `/goal/queue` (management screen — different route, merged in Task 2), `app/onboarding.tsx` final `router.replace('/(tabs)/focus')` (Phase 4), `focus.tsx:315` dead `See all → /(tabs)/marks` (removed in Task 3 per spec). Grep confirmed `(tabs)/queue` and `(tabs)/home` have no remaining refs; the only `(tabs)/marks` ref is the focus.tsx See-all (Task 3).

**Tests:** 439/439 passing. **Type-check:** 0 errors.

---

### Task 2 — Goals planning view (rewrite of `app/(tabs)/goals.tsx`)

| File | Change | Why |
|------|--------|-----|
| `app/(tabs)/goals.tsx` | Full rewrite. Screen renamed `GoalsScreen` (was `QueueScreen`). Added `ActiveGoalCard` inline component: forest bg, progress bar (`getGoalProgress → progress/threshold`), deadline date, "Ready to complete" CTA row when `canComplete`, tappable → `/goal/[id]`. Updated `DraggableRow`: removed `onAdd` prop; wrapped `QueueCard` in `TouchableOpacity` to wire `onPress` → `/goal/[id]` (QueueCard has no `onPress` prop in its interface). Updated `DraggableQueueList`: replaced `onAdd`/`fixedPrefixIds` with `onPressGoal`; `reorderQueue` now receives queued-only IDs (active is separate above, no fixed prefix needed). `handleAddGoal` → `router.push('/goal/new')` (was `/goal/queue` modal). Added `getCompletedGoals` selector; completed count row → `router.push('/goal/history')`. Loading: `ActivityIndicator`. Error: banner with `c.danger`. Empty: logo + copy + CTA button. ACTIVE / UP NEXT / COMPLETED section labels. Add-goal button in header. Removed `useIapSubscriptions` / `useAuth` (not needed in planning view). |
| — | No `state/` or protected paths modified. `getGoalProgress`, `getCompletedGoals`, `getQueuedGoals`, `getActiveGoal` are all existing selectors on `useGoalsStore`. | UI/navigation only per Phase 3 constraint. |

**Tests:** 439/439. **Type-check:** 0 errors.
