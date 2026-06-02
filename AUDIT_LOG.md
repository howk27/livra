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

## Deferred (Future Sprint)

1. Rename `hooks/useCounters.ts` → `hooks/useMarks.ts` and update ~8 import sites
2. Rename `state/countersSlice.ts` → `state/marksSlice.ts` and update ~15 import sites
3. Rename `components/CounterTile.tsx` → `components/MarkTile.tsx`
4. Add data migration for AsyncStorage key rename (`@livra_db_counters` → `@livra_db_marks`)
5. Implement drag-to-reorder for queue cards (currently uses up/down buttons; `react-native-draggable-flatlist` not installed)
6. Deadline expiry background check (currently checked on `checkGoalCompletion`; consider app foreground event listener)
