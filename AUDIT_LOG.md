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
