# Livra Level System — Design Spec
**Date:** 2026-05-28
**Status:** Approved

---

## Overview

Identity-based progression system for Livra. Levels represent who the user is becoming — not game points. XP is never shown as a raw number. The level-up interrupt carries the same emotional weight as the goal completion screen.

---

## Level Tiers

| Level | XP Required | Title |
|---|---|---|
| 1 | 0 | Beginner |
| 2 | 200 | Committed |
| 3 | 500 | Consistent |
| 4 | 1,000 | Focused |
| 5 | 2,000 | Disciplined |
| 6 | 3,500 | Dedicated |
| 7 | 5,500 | Relentless |
| 8 | 8,000 | Unstoppable |
| 9 | 11,000 | Elite |
| 10 | 15,000 | Livra |

---

## XP Events

| Action | XP |
|---|---|
| Daily mark logged (first log per mark per day) | 10 |
| All marks completed in a day | 25 bonus |
| Goal completed | 150 |
| 7-day consistency (5 of last 7 days with ≥1 mark) | 50 |
| 30-day consistency (25 of last 30 days with ≥1 mark) | 200 |

**Daily cap:** 100 XP maximum per calendar day regardless of actions.

---

## Anti-Cheat Rules

1. Only the first 5 unique marks logged per calendar day contribute XP. Additional marks award 0.
2. A mark must be ≥ 3 days old (`created_at`) before any of its logs contribute XP.
3. 7-day bonus: rolling window only. Requires 5 of the last 7 calendar days to have ≥1 mark logged. Awards at most once per 7-day period (tracked via `last_7d_bonus_date`).
4. 30-day bonus: rolling window only. Requires 25 of the last 30 calendar days to have ≥1 mark logged. Awards at most once per 30-day period (tracked via `last_30d_bonus_date`).
5. Goal completion XP requires the goal to be ≥ 14 days old (`created_at`). Younger goals award 0.
6. After completing a goal, a 48-hour cooldown applies before a new goal's marks contribute XP. Tracked via `cooldown_until` on the user XP record.

---

## Data Model

### Supabase — `profiles` table additions

```sql
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS total_xp integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS current_level integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS goal_completion_cooldown_until timestamptz,
  ADD COLUMN IF NOT EXISTS last_7d_bonus_date date,
  ADD COLUMN IF NOT EXISTS last_30d_bonus_date date;
```

### Supabase — new `xp_events` table

```sql
CREATE TABLE IF NOT EXISTS public.xp_events (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN (
    'mark_logged', 'full_day_bonus', 'goal_completed', 'consistency_7d', 'consistency_30d'
  )),
  xp_awarded integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_xp_events_user_date
  ON public.xp_events (user_id, created_at DESC);

ALTER TABLE public.xp_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own xp_events"
  ON public.xp_events FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

### Local (AsyncStorage mock DB)

Two new tables initialized alongside existing `lc_counters`, `lc_events`, etc.:

**`lc_user_xp`**
```sql
CREATE TABLE IF NOT EXISTS lc_user_xp (
  user_id TEXT PRIMARY KEY,
  total_xp INTEGER NOT NULL DEFAULT 0,
  current_level INTEGER NOT NULL DEFAULT 1,
  cooldown_until TEXT,           -- ISO timestamp or null
  last_7d_bonus_date TEXT,       -- YYYY-MM-DD or null
  last_30d_bonus_date TEXT       -- YYYY-MM-DD or null
);
```

**`lc_xp_events`**
```sql
CREATE TABLE IF NOT EXISTS lc_xp_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  xp_awarded INTEGER NOT NULL,
  created_at TEXT NOT NULL,      -- ISO timestamp
  metadata TEXT NOT NULL DEFAULT '{}'  -- JSON string
);
```

### `level_progress` — derived value (not stored)

Computed in memory by `getLevelProgress(totalXP)`:

```ts
interface LevelProgress {
  currentLevel: number;       // 1–10
  levelTitle: string;
  nextLevelTitle: string | null;   // null at level 10
  xpInCurrentLevel: number;   // XP earned since last threshold
  xpToNextLevel: number;      // XP needed to reach next level; 0 at level 10
  progressRatio: number;      // 0.0–1.0 for progress bar; 1.0 at level 10
}
```

---

## `lib/xpEngine.ts` — Pure Functions

### `LEVEL_THRESHOLDS`
```ts
const LEVEL_THRESHOLDS = [0, 200, 500, 1000, 2000, 3500, 5500, 8000, 11000, 15000];
```

### `checkLevelUp(previousXP, newXP): number | null`
Returns the new level number if a threshold was crossed, `null` otherwise. Handles multiple levels crossed in one award — returns the highest new level reached. If `newXP` crosses from level 3 to level 5, returns `5`.

### `getLevelForXP(xp): number`
Returns 1–10.

### `getLevelProgress(xp): LevelProgress`
Computes all progress bar fields from total XP.

### `getBorderStyle(level): BorderStyle`

| Level | Style |
|---|---|
| 1–2 | Thin single ring, `text-primary` color |
| 3–4 | Slightly thicker ring |
| 5–6 | Double ring |
| 7–8 | Textured/engraved appearance (shadow token) |
| 9 | Gold-tinted ring (`#C9963A`) |
| 10 | Animated subtle pulse (only animated element in system) |

Returns border width, color, and `animated: boolean`.

### `LEVEL_UP_COPY`
```ts
const LEVEL_UP_COPY: Record<number, string> = {
  2: "You came back. That's where it starts.",
  3: "Showing up is a skill. You're building it.",
  4: "Most people scatter their energy. You don't.",
  5: "This isn't motivation anymore. It's just you.",
  6: "The work is becoming effortless. That's the point.",
  7: "You finish what others abandon.",
  8: "Goals don't intimidate you anymore.",
  9: "One percent of people get here. You're one of them.",
  10: "You became the thing. This one's yours forever.",
};
```

### `awardMarkXP(userId, markId, date): Promise<XPResult>`

Anti-cheat checks in order:
1. Load mark from local DB — verify `created_at` is ≥ 3 days before `date`. If not: return `{ xpAwarded: 0, newTotal, levelUp: null }`.
2. Query `lc_xp_events` for existing `mark_logged` event with matching `user_id`, `mark_id` (in metadata), and `date`. If found: skip (already awarded today).
3. Count distinct marks that earned XP today (event_type = `mark_logged`, same date). If ≥ 5: skip.
4. Check daily XP total today. If already at 100: skip. Award `min(10, remaining)`.
5. Check cooldown: if `cooldown_until` is in the future: skip mark XP entirely.
6. Write `lc_xp_events` event (mark_logged) and update `lc_user_xp.total_xp`.
7. Check full-day bonus: all active marks have a `mark_logged` event today? Award 25 (subject to remaining daily cap).
8. Check 7-day consistency: rolling 5/7 condition met AND `last_7d_bonus_date` > 7 days ago (or null)? Award 50.
9. Check 30-day consistency: rolling 25/30 condition met AND `last_30d_bonus_date` > 30 days ago (or null)? Award 200.
10. Run `checkLevelUp(previousXP, newTotal)`.
11. Fire-and-forget Supabase sync (non-blocking).
12. Return `{ xpAwarded, newTotal, levelUp: number | null }`.

### `awardGoalXP(userId, goalId): Promise<XPResult>`

1. Load goal from local DB — verify `created_at` is ≥ 14 days before now. If not: return `{ xpAwarded: 0, newTotal, levelUp: null }`.
2. Check `cooldown_until` on `lc_user_xp` — if in the future: return 0.
3. Award `min(150, remaining daily cap)` XP. Daily cap applies to all events.
4. Set `cooldown_until = now + 48h` on `lc_user_xp`.
5. Write `lc_xp_events` event (goal_completed).
6. Update `lc_user_xp.total_xp`.
7. Run `checkLevelUp(previousXP, newTotal)`.
8. Fire-and-forget Supabase sync.
9. Return `{ xpAwarded, newTotal, levelUp: number | null }`.

---

## `lib/db/xpDb.ts`

AsyncStorage CRUD following the `goalsDb.ts` pattern:

- `loadUserXP(userId): Promise<UserXP | null>`
- `upsertUserXP(data: UserXP): Promise<void>`
- `insertXPEvent(event: XPEvent): Promise<void>`
- `loadXPEventsForDate(userId, date): Promise<XPEvent[]>` — for daily cap checks
- `loadXPEventDates(userId, days: number): Promise<string[]>` — for rolling window checks (returns distinct YYYY-MM-DD strings with ≥1 mark_logged event)
- `syncXPToSupabase(userId): Promise<void>` — best-effort push of unsync'd events; silent on failure

---

## `state/xpSlice.ts`

```ts
interface XPState {
  totalXP: number;
  currentLevel: number;
  pendingLevelUp: number | null;  // non-null triggers the modal
  loading: boolean;
  loadXP: (userId: string) => Promise<void>;
  applyXPResult: (result: XPResult) => void;  // called after awardMarkXP / awardGoalXP
  clearPendingLevelUp: () => void;
}
```

`applyXPResult` updates `totalXP`, `currentLevel`, and sets `pendingLevelUp` if `result.levelUp` is non-null.

---

## `hooks/useXP.ts`

Reads from `xpSlice`. Returns:

```ts
{
  currentLevel: number;
  levelTitle: string;
  nextLevelTitle: string | null;
  progressRatio: number;           // 0.0–1.0
  xpInCurrentLevel: number;
  xpToNextLevel: number;
  borderStyle: BorderStyle;
  pendingLevelUp: number | null;
  clearPendingLevelUp: () => void;
}
```

No raw XP number is returned — only progress ratio and level metadata.

---

## `components/LevelUpModal.tsx`

- Full-screen modal (`position: absolute`, covers entire screen)
- Triggered when `pendingLevelUp !== null` in xpSlice
- Cannot be dismissed by tapping outside — user must tap the button
- Shows: profile border animation (new border style), level number, level title, one-line copy from `LEVEL_UP_COPY`
- Level 10 border animates (pulse); all other levels are static on the modal
- Single CTA: "Keep going" → calls `clearPendingLevelUp()`
- Animation: subtle scale-in using Reanimated (matches existing goal completion screen weight)

---

## `components/LevelProgressBar.tsx`

- Left label: current level title
- Right label: next level title (hidden at level 10, replaced with "You're there.")
- Animated fill bar between them, `progressRatio` → width
- Fill color: accent (`#C47E8A`)
- No raw XP numbers anywhere
- Lives on the profile/settings screen

---

## Integration Points

### `hooks/useCounters.ts` — `increment` function

Inside `InteractionManager.runAfterInteractions`, after `evaluateMarkBadges`:

```ts
awardMarkXP(userId, markId, today)
  .then(result => useXPStore.getState().applyXPResult(result))
  .catch(err => logger.error('[XP] awardMarkXP failed:', err));
```

### `state/goalsSlice.ts` — `completeGoal`

After the goal is written to AsyncStorage:

```ts
awardGoalXP(userId, goal.id)
  .then(result => useXPStore.getState().applyXPResult(result))
  .catch(err => logger.error('[XP] awardGoalXP failed:', err));
```

### `app/_layout.tsx`

Read `pendingLevelUp` from xpSlice. Render `<LevelUpModal>` as a sibling to the `<Stack>` navigator when non-null.

---

## Out of Scope (v2)

- Social profiles, leaderboards, friend milestones
- Medals system (consistency medals, completion medals, comeback medal, identity medals)
- Additional levels beyond 10
- Bidirectional XP sync (full conflict resolution)

---

## Open Questions

None. All decisions resolved.
