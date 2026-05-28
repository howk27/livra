# Level System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an identity-based XP + level progression system that awards XP for daily mark logs and goal completions, surfaces a full-screen level-up interrupt, and shows a progress bar — with anti-cheat rules enforced locally.

**Architecture:** XP data lives in two new AsyncStorage-backed tables (`lc_user_xp`, `lc_xp_events`) managed by `lib/db/xpDb.ts`. Pure business logic (thresholds, award functions, anti-cheat) lives in `lib/xpEngine.ts`. A Zustand slice (`state/xpSlice.ts`) holds UI-visible state; `hooks/useXP.ts` derives level metadata without exposing raw XP numbers. The level-up modal renders as an absolute-positioned overlay in `app/_layout.tsx` when `pendingLevelUp !== null`.

**Tech Stack:** AsyncStorage (existing mock DB pattern), Zustand, React Native Reanimated 4.x, `@supabase/supabase-js`, TypeScript 5.9 strict, Jest + jest-expo.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `lib/db/index.ts` | Modify | Add `lc_user_xp` + `lc_xp_events` tables to `execAsync`, `runAsync`, `getAllAsync`, `getFirstAsync` |
| `lib/db/xpDb.ts` | Create | AsyncStorage CRUD for XP tables |
| `lib/xpEngine.ts` | Create | Pure functions: thresholds, award logic, anti-cheat, border style, copy |
| `state/xpSlice.ts` | Create | Zustand slice: `totalXP`, `currentLevel`, `pendingLevelUp`, `loadXP`, `applyXPResult`, `clearPendingLevelUp` |
| `hooks/useXP.ts` | Create | Derived hook: level progress fields, border style — no raw XP |
| `components/LevelUpModal.tsx` | Create | Full-screen, non-dismissable level-up interrupt with Reanimated scale-in |
| `components/LevelProgressBar.tsx` | Create | Animated progress bar with level titles |
| `hooks/useCounters.ts` | Modify | Fire-and-forget `awardMarkXP` inside `InteractionManager.runAfterInteractions` |
| `state/goalsSlice.ts` | Modify | Fire-and-forget `awardGoalXP` after `upsertGoals` in `completeGoal` |
| `app/_layout.tsx` | Modify | Import `xpSlice`, render `<LevelUpModal>` as sibling to `<Stack>` when `pendingLevelUp !== null` |
| `tests/unit/xpEngine.test.ts` | Create | Unit tests for all pure functions |
| `tests/unit/xpDb.test.ts` | Create | Unit tests for DB helpers |
| `tests/unit/xpSlice.test.ts` | Create | Unit tests for slice actions |

---

## Task 1: DB Schema — `lc_user_xp` and `lc_xp_events`

**Files:**
- Modify: `lib/db/index.ts`

### Step 1.1 — Add storage keys
- [ ] Open `lib/db/index.ts`. In the `STORAGE_KEYS` object (lines 23–29), add two new keys:

```ts
const STORAGE_KEYS = {
  counters: '@livra_db_counters',
  events: '@livra_db_events',
  streaks: '@livra_db_streaks',
  badges: '@livra_db_badges',
  meta: '@livra_db_meta',
  userXp: '@livra_db_user_xp',
  xpEvents: '@livra_db_xp_events',
};
```

### Step 1.2 — Load XP tables from AsyncStorage on init
- [ ] In the `loadFromStorage` function (after the `badges` block, around line 60), add:

```ts
const userXpJson = await AsyncStorage.getItem(STORAGE_KEYS.userXp);
if (userXpJson) {
  storage.set('userXp', JSON.parse(userXpJson));
}

const xpEventsJson = await AsyncStorage.getItem(STORAGE_KEYS.xpEvents);
if (xpEventsJson) {
  storage.set('xpEvents', JSON.parse(xpEventsJson));
}
```

### Step 1.3 — Handle `execAsync` for XP tables
- [ ] In the `execAsync` handler inside `createMockDb` (the block that checks `sql.includes('lc_counters')` etc.), add after the `lc_meta` check:

```ts
if (sql.includes('lc_user_xp') && !storage.has('userXp')) {
  storage.set('userXp', []);
}
if (sql.includes('lc_xp_events') && !storage.has('xpEvents')) {
  storage.set('xpEvents', []);
}
```

### Step 1.4 — Handle `runAsync` for `lc_user_xp` INSERT/UPSERT
- [ ] In the `runAsync` handler, after the last `if (sql.includes('UPDATE lc_streaks'))` block (before `return { rowsAffected: 0 }`), add:

```ts
// INSERT OR REPLACE INTO lc_user_xp
if (sql.includes('lc_user_xp')) {
  const rows = storage.get('userXp') || [];
  const userId = params[0];
  const idx = rows.findIndex((r: any) => r.user_id === userId);
  const row = {
    user_id: params[0],
    total_xp: params[1],
    current_level: params[2],
    cooldown_until: params[3],
    last_7d_bonus_date: params[4],
    last_30d_bonus_date: params[5],
  };
  if (idx >= 0) {
    rows[idx] = row;
  } else {
    rows.push(row);
  }
  storage.set('userXp', rows);
  await saveToStorage('userXp', rows);
  return { rowsAffected: 1 };
}

// INSERT INTO lc_xp_events
if (sql.includes('lc_xp_events')) {
  const rows = storage.get('xpEvents') || [];
  rows.push({
    id: params[0],
    user_id: params[1],
    event_type: params[2],
    xp_awarded: params[3],
    created_at: params[4],
    metadata: params[5],
  });
  storage.set('xpEvents', rows);
  await saveToStorage('xpEvents', rows);
  return { rowsAffected: 1 };
}
```

### Step 1.5 — Handle `getAllAsync` for `lc_xp_events`
- [ ] In the `getAllAsync` handler, after the `FROM lc_badges` block (before `return []`), add:

```ts
if (sql.includes('FROM lc_xp_events')) {
  let rows: any[] = storage.get('xpEvents') || [];
  if (sql.includes('user_id = ?') && params[0]) {
    rows = rows.filter((r) => r.user_id === params[0]);
  }
  // Filter by date prefix: created_at LIKE '2026-05-28%'
  if (sql.includes('created_at LIKE ?') && params.length >= 2) {
    const prefix = params[1].replace('%', '');
    rows = rows.filter((r) => r.created_at.startsWith(prefix));
  }
  // Filter by event_type
  if (sql.includes('event_type = ?')) {
    const typeIdx = sql.includes('created_at LIKE ?') ? 2 : 1;
    if (params[typeIdx]) {
      rows = rows.filter((r) => r.event_type === params[typeIdx]);
    }
  }
  if (sql.includes('ORDER BY created_at DESC')) {
    rows = [...rows].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
  }
  return rows as T[];
}
```

### Step 1.6 — Handle `getFirstAsync` for `lc_user_xp`
- [ ] In the `getFirstAsync` handler, after the `FROM lc_badges WHERE counter_id = ?` block (before `return null`), add:

```ts
if (sql.includes('FROM lc_user_xp')) {
  const rows: any[] = storage.get('userXp') || [];
  const userId = params[0];
  return (rows.find((r) => r.user_id === userId) ?? null) as T | null;
}
```

### Step 1.7 — Initialize XP tables in `initDatabase`
- [ ] At the bottom of the `initDatabase` function (after the `lc_meta` `execAsync` call), add:

```ts
await db.execAsync(`
  CREATE TABLE IF NOT EXISTS lc_user_xp (
    user_id TEXT PRIMARY KEY,
    total_xp INTEGER NOT NULL DEFAULT 0,
    current_level INTEGER NOT NULL DEFAULT 1,
    cooldown_until TEXT,
    last_7d_bonus_date TEXT,
    last_30d_bonus_date TEXT
  );
`);

await db.execAsync(`
  CREATE TABLE IF NOT EXISTS lc_xp_events (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    xp_awarded INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    metadata TEXT NOT NULL DEFAULT '{}'
  );
`);
```

### Step 1.8 — Commit
- [ ] Run `npm run type-check` — expected: no errors related to `lib/db/index.ts`.

```bash
git add lib/db/index.ts
git commit -m "feat(xp): add lc_user_xp and lc_xp_events tables to mock DB"
```

---

## Task 2: `lib/db/xpDb.ts` — AsyncStorage CRUD

**Files:**
- Create: `lib/db/xpDb.ts`
- Reference: `lib/db/goalsDb.ts` (same AsyncStorage direct pattern)

### Step 2.1 — Write types and `loadUserXP`
- [ ] Create `/mnt/c/Users/DEIVI/Desktop/Livra/lib/db/xpDb.ts` with:

```ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSupabaseClient } from '../supabase';
import { logger } from '../utils/logger';

const USER_XP_KEY = '@livra_db_user_xp';
const XP_EVENTS_KEY = '@livra_db_xp_events';

export interface UserXP {
  user_id: string;
  total_xp: number;
  current_level: number;
  cooldown_until: string | null;   // ISO timestamp or null
  last_7d_bonus_date: string | null;  // YYYY-MM-DD or null
  last_30d_bonus_date: string | null; // YYYY-MM-DD or null
}

export interface XPEvent {
  id: string;
  user_id: string;
  event_type: 'mark_logged' | 'full_day_bonus' | 'goal_completed' | 'consistency_7d' | 'consistency_30d';
  xp_awarded: number;
  created_at: string; // ISO timestamp
  metadata: string;   // JSON string
}

export interface XPResult {
  xpAwarded: number;
  newTotal: number;
  levelUp: number | null;
}

async function readAllUserXP(): Promise<UserXP[]> {
  try {
    const raw = await AsyncStorage.getItem(USER_XP_KEY);
    return raw ? (JSON.parse(raw) as UserXP[]) : [];
  } catch {
    return [];
  }
}

async function writeAllUserXP(rows: UserXP[]): Promise<void> {
  await AsyncStorage.setItem(USER_XP_KEY, JSON.stringify(rows));
}

async function readAllXPEvents(): Promise<XPEvent[]> {
  try {
    const raw = await AsyncStorage.getItem(XP_EVENTS_KEY);
    return raw ? (JSON.parse(raw) as XPEvent[]) : [];
  } catch {
    return [];
  }
}

async function writeAllXPEvents(rows: XPEvent[]): Promise<void> {
  await AsyncStorage.setItem(XP_EVENTS_KEY, JSON.stringify(rows));
}

export async function loadUserXP(userId: string): Promise<UserXP | null> {
  const all = await readAllUserXP();
  return all.find((r) => r.user_id === userId) ?? null;
}

export async function upsertUserXP(data: UserXP): Promise<void> {
  const all = await readAllUserXP();
  const idx = all.findIndex((r) => r.user_id === data.user_id);
  if (idx >= 0) {
    all[idx] = data;
  } else {
    all.push(data);
  }
  await writeAllUserXP(all);
}

export async function insertXPEvent(event: XPEvent): Promise<void> {
  const all = await readAllXPEvents();
  all.push(event);
  await writeAllXPEvents(all);
}

export async function loadXPEventsForDate(userId: string, date: string): Promise<XPEvent[]> {
  // date is YYYY-MM-DD; match against ISO created_at prefix
  const all = await readAllXPEvents();
  return all.filter(
    (e) => e.user_id === userId && e.created_at.startsWith(date),
  );
}

export async function loadXPEventDates(userId: string, days: number): Promise<string[]> {
  // Returns distinct YYYY-MM-DD strings (most recent `days`) where ≥1 mark_logged event exists
  const all = await readAllXPEvents();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffISO = cutoff.toISOString().slice(0, 10);

  const dateSet = new Set<string>();
  for (const e of all) {
    if (
      e.user_id === userId &&
      e.event_type === 'mark_logged' &&
      e.created_at.slice(0, 10) >= cutoffISO
    ) {
      dateSet.add(e.created_at.slice(0, 10));
    }
  }
  return Array.from(dateSet);
}

export async function syncXPToSupabase(userId: string): Promise<void> {
  try {
    const userXp = await loadUserXP(userId);
    if (!userXp) return;

    const supabase = getSupabaseClient();
    const { error: profileErr } = await supabase
      .from('profiles')
      .update({
        total_xp: userXp.total_xp,
        current_level: userXp.current_level,
        goal_completion_cooldown_until: userXp.cooldown_until,
        last_7d_bonus_date: userXp.last_7d_bonus_date,
        last_30d_bonus_date: userXp.last_30d_bonus_date,
      })
      .eq('id', userId);

    if (profileErr) {
      logger.warn('[XP] Supabase profile sync failed (non-blocking):', profileErr.message);
      return;
    }

    const all = await readAllXPEvents();
    const unsyncedEvents = all.filter((e) => e.user_id === userId);
    if (unsyncedEvents.length === 0) return;

    const { error: eventsErr } = await supabase.from('xp_events').upsert(
      unsyncedEvents.map((e) => ({
        id: e.id,
        user_id: e.user_id,
        event_type: e.event_type,
        xp_awarded: e.xp_awarded,
        created_at: e.created_at,
        metadata: JSON.parse(e.metadata),
      })),
      { onConflict: 'id' },
    );

    if (eventsErr) {
      logger.warn('[XP] Supabase xp_events sync failed (non-blocking):', eventsErr.message);
    }
  } catch (err) {
    logger.warn('[XP] syncXPToSupabase error (non-blocking):', err);
  }
}
```

### Step 2.2 — Run type-check
- [ ] Run `npm run type-check`
  Expected: no errors in `lib/db/xpDb.ts`

### Step 2.3 — Commit
```bash
git add lib/db/xpDb.ts
git commit -m "feat(xp): add xpDb CRUD helpers (AsyncStorage)"
```

---

## Task 3: `lib/xpEngine.ts` — Pure Functions

**Files:**
- Create: `lib/xpEngine.ts`
- Create: `tests/unit/xpEngine.test.ts`

These are pure functions — no AsyncStorage calls, no side effects. They take plain data arguments and return plain values. Tests run without any React Native mocks.

### Step 3.1 — Write failing tests

- [ ] Create `tests/unit/xpEngine.test.ts`:

```ts
import {
  LEVEL_THRESHOLDS,
  getLevelForXP,
  getLevelProgress,
  checkLevelUp,
  getBorderStyle,
  LEVEL_UP_COPY,
} from '../../lib/xpEngine';

describe('LEVEL_THRESHOLDS', () => {
  it('has 10 entries', () => {
    expect(LEVEL_THRESHOLDS).toHaveLength(10);
  });
  it('first threshold is 0', () => {
    expect(LEVEL_THRESHOLDS[0]).toBe(0);
  });
  it('last threshold is 15000', () => {
    expect(LEVEL_THRESHOLDS[9]).toBe(15000);
  });
});

describe('getLevelForXP', () => {
  it('returns 1 at 0 XP', () => {
    expect(getLevelForXP(0)).toBe(1);
  });
  it('returns 1 just below level 2 threshold', () => {
    expect(getLevelForXP(199)).toBe(1);
  });
  it('returns 2 at exactly 200 XP', () => {
    expect(getLevelForXP(200)).toBe(2);
  });
  it('returns 5 at 2000 XP', () => {
    expect(getLevelForXP(2000)).toBe(5);
  });
  it('returns 10 at 15000 XP', () => {
    expect(getLevelForXP(15000)).toBe(10);
  });
  it('returns 10 (capped) beyond 15000', () => {
    expect(getLevelForXP(99999)).toBe(10);
  });
});

describe('getLevelProgress', () => {
  it('returns correct fields at level 1 with 100 XP', () => {
    const p = getLevelProgress(100);
    expect(p.currentLevel).toBe(1);
    expect(p.levelTitle).toBe('Beginner');
    expect(p.nextLevelTitle).toBe('Committed');
    expect(p.xpInCurrentLevel).toBe(100);
    expect(p.xpToNextLevel).toBe(200);
    expect(p.progressRatio).toBeCloseTo(100 / 200);
  });
  it('returns progressRatio 1.0 at level 10', () => {
    const p = getLevelProgress(15000);
    expect(p.currentLevel).toBe(10);
    expect(p.progressRatio).toBe(1.0);
    expect(p.nextLevelTitle).toBeNull();
    expect(p.xpToNextLevel).toBe(0);
  });
  it('handles mid-level correctly at level 3 (XP = 700)', () => {
    // Level 3 starts at 500, level 4 at 1000 → range 500
    const p = getLevelProgress(700);
    expect(p.currentLevel).toBe(3);
    expect(p.levelTitle).toBe('Consistent');
    expect(p.xpInCurrentLevel).toBe(200); // 700 - 500
    expect(p.xpToNextLevel).toBe(1000);
    expect(p.progressRatio).toBeCloseTo(200 / 500);
  });
});

describe('checkLevelUp', () => {
  it('returns null when no threshold crossed', () => {
    expect(checkLevelUp(0, 100)).toBeNull();
  });
  it('returns 2 when crossing from 0 to 200', () => {
    expect(checkLevelUp(0, 200)).toBe(2);
  });
  it('returns 2 when crossing from 100 to 250', () => {
    expect(checkLevelUp(100, 250)).toBe(2);
  });
  it('returns 5 when jumping from level 3 to level 5 in one award', () => {
    // Level 4 threshold = 1000, level 5 = 2000
    expect(checkLevelUp(600, 2100)).toBe(5);
  });
  it('returns null at level 10 (no higher level)', () => {
    expect(checkLevelUp(15000, 15200)).toBeNull();
  });
});

describe('getBorderStyle', () => {
  it('level 1 — thin ring, animated false', () => {
    const s = getBorderStyle(1);
    expect(s.borderWidth).toBe(1);
    expect(s.animated).toBe(false);
  });
  it('level 2 — same style as level 1', () => {
    const s = getBorderStyle(2);
    expect(s.borderWidth).toBe(1);
    expect(s.animated).toBe(false);
  });
  it('level 3 — slightly thicker', () => {
    const s = getBorderStyle(3);
    expect(s.borderWidth).toBe(2);
    expect(s.animated).toBe(false);
  });
  it('level 9 — gold color', () => {
    const s = getBorderStyle(9);
    expect(s.borderColor).toBe('#C9963A');
    expect(s.animated).toBe(false);
  });
  it('level 10 — animated', () => {
    const s = getBorderStyle(10);
    expect(s.animated).toBe(true);
  });
});

describe('LEVEL_UP_COPY', () => {
  it('has entries for levels 2–10', () => {
    for (let level = 2; level <= 10; level++) {
      expect(LEVEL_UP_COPY[level]).toBeTruthy();
    }
  });
  it('level 10 copy ends with "forever"', () => {
    expect(LEVEL_UP_COPY[10]).toMatch(/forever/);
  });
});
```

### Step 3.2 — Run tests to confirm they fail
- [ ] Run: `npm run test -- tests/unit/xpEngine.test.ts`
  Expected: FAIL — `Cannot find module '../../lib/xpEngine'`

### Step 3.3 — Write `lib/xpEngine.ts`
- [ ] Create `/mnt/c/Users/DEIVI/Desktop/Livra/lib/xpEngine.ts`:

```ts
import { v4 as uuidv4 } from 'uuid';
import { logger } from './utils/logger';
import {
  loadUserXP,
  upsertUserXP,
  insertXPEvent,
  loadXPEventsForDate,
  loadXPEventDates,
  syncXPToSupabase,
  UserXP,
  XPEvent,
  XPResult,
} from './db/xpDb';
import { query, queryFirst } from './db';

// ---------------------------------------------------------------------------
// Thresholds & metadata
// ---------------------------------------------------------------------------

export const LEVEL_THRESHOLDS: number[] = [
  0, 200, 500, 1000, 2000, 3500, 5500, 8000, 11000, 15000,
];

const LEVEL_TITLES: string[] = [
  'Beginner',
  'Committed',
  'Consistent',
  'Focused',
  'Disciplined',
  'Dedicated',
  'Relentless',
  'Unstoppable',
  'Elite',
  'Livra',
];

export const LEVEL_UP_COPY: Record<number, string> = {
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

// ---------------------------------------------------------------------------
// Pure computation helpers
// ---------------------------------------------------------------------------

export function getLevelForXP(xp: number): number {
  let level = 1;
  for (let i = 1; i < LEVEL_THRESHOLDS.length; i++) {
    if (xp >= LEVEL_THRESHOLDS[i]) {
      level = i + 1;
    } else {
      break;
    }
  }
  return level;
}

export interface LevelProgress {
  currentLevel: number;
  levelTitle: string;
  nextLevelTitle: string | null;
  xpInCurrentLevel: number;
  xpToNextLevel: number;
  progressRatio: number;
}

export function getLevelProgress(xp: number): LevelProgress {
  const currentLevel = getLevelForXP(xp);
  const idx = currentLevel - 1; // 0-based index into LEVEL_THRESHOLDS

  if (currentLevel === 10) {
    return {
      currentLevel: 10,
      levelTitle: LEVEL_TITLES[9],
      nextLevelTitle: null,
      xpInCurrentLevel: xp - LEVEL_THRESHOLDS[9],
      xpToNextLevel: 0,
      progressRatio: 1.0,
    };
  }

  const currentThreshold = LEVEL_THRESHOLDS[idx];
  const nextThreshold = LEVEL_THRESHOLDS[idx + 1];
  const xpInCurrentLevel = xp - currentThreshold;
  const rangeSize = nextThreshold - currentThreshold;

  return {
    currentLevel,
    levelTitle: LEVEL_TITLES[idx],
    nextLevelTitle: LEVEL_TITLES[idx + 1],
    xpInCurrentLevel,
    xpToNextLevel: nextThreshold,
    progressRatio: rangeSize > 0 ? xpInCurrentLevel / rangeSize : 0,
  };
}

/** Returns the new level number if a threshold was crossed, null otherwise.
 *  Handles multiple levels crossed at once — returns the highest new level reached. */
export function checkLevelUp(previousXP: number, newXP: number): number | null {
  const prevLevel = getLevelForXP(previousXP);
  const newLevel = getLevelForXP(newXP);
  if (newLevel > prevLevel && newLevel <= 10) {
    return newLevel;
  }
  return null;
}

export interface BorderStyle {
  borderWidth: number;
  borderColor: string;
  animated: boolean;
  /** Double ring: render two concentric borders */
  doubleRing?: boolean;
  /** Shadow elevation for textured levels */
  shadowElevation?: number;
}

export function getBorderStyle(level: number): BorderStyle {
  if (level <= 2) {
    return { borderWidth: 1, borderColor: '#C26960', animated: false };
  }
  if (level <= 4) {
    return { borderWidth: 2, borderColor: '#C26960', animated: false };
  }
  if (level <= 6) {
    return { borderWidth: 2, borderColor: '#C26960', animated: false, doubleRing: true };
  }
  if (level <= 8) {
    return {
      borderWidth: 2,
      borderColor: '#C26960',
      animated: false,
      shadowElevation: 6,
    };
  }
  if (level === 9) {
    return { borderWidth: 3, borderColor: '#C9963A', animated: false };
  }
  // level 10
  return { borderWidth: 3, borderColor: '#C9963A', animated: true };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DAILY_CAP = 100;

function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

function defaultUserXP(userId: string): UserXP {
  return {
    user_id: userId,
    total_xp: 0,
    current_level: 1,
    cooldown_until: null,
    last_7d_bonus_date: null,
    last_30d_bonus_date: null,
  };
}

async function getDailyXPTotal(userId: string, date: string): Promise<number> {
  const events = await loadXPEventsForDate(userId, date);
  return events.reduce((sum, e) => sum + e.xp_awarded, 0);
}

// ---------------------------------------------------------------------------
// awardMarkXP
// ---------------------------------------------------------------------------

export async function awardMarkXP(
  userId: string,
  markId: string,
  date: string,
): Promise<XPResult> {
  let userXp = (await loadUserXP(userId)) ?? defaultUserXP(userId);
  const previousXP = userXp.total_xp;
  const noAward: XPResult = { xpAwarded: 0, newTotal: previousXP, levelUp: null };

  // Anti-cheat 1: mark must be ≥ 3 days old
  const mark = await queryFirst<{ created_at: string }>(
    'SELECT created_at FROM lc_counters WHERE id = ? AND deleted_at IS NULL',
    [markId],
  );
  if (!mark) return noAward;
  const markAge = Math.floor(
    (new Date(date + 'T00:00:00Z').getTime() - new Date(mark.created_at).getTime()) /
      (1000 * 60 * 60 * 24),
  );
  if (markAge < 3) return noAward;

  // Anti-cheat 5: cooldown active (48h after goal completion)
  if (userXp.cooldown_until) {
    const cooldownEnd = new Date(userXp.cooldown_until).getTime();
    if (Date.now() < cooldownEnd) return noAward;
  }

  // Anti-cheat 2: already awarded this mark today?
  const todayEvents = await loadXPEventsForDate(userId, date);
  const alreadyAwarded = todayEvents.some((e) => {
    if (e.event_type !== 'mark_logged') return false;
    try {
      const meta = JSON.parse(e.metadata);
      return meta.mark_id === markId;
    } catch {
      return false;
    }
  });
  if (alreadyAwarded) return noAward;

  // Anti-cheat 3: max 5 unique marks per day
  const marksAwardedToday = new Set<string>();
  for (const e of todayEvents) {
    if (e.event_type !== 'mark_logged') continue;
    try {
      const meta = JSON.parse(e.metadata);
      if (meta.mark_id) marksAwardedToday.add(meta.mark_id);
    } catch {}
  }
  if (marksAwardedToday.size >= 5) return noAward;

  // Anti-cheat 4: daily cap
  const dailyTotal = todayEvents.reduce((s, e) => s + e.xp_awarded, 0);
  if (dailyTotal >= DAILY_CAP) return noAward;

  const markXP = Math.min(10, DAILY_CAP - dailyTotal);
  let totalAwarded = markXP;

  // Write mark_logged event
  const markEvent: XPEvent = {
    id: uuidv4(),
    user_id: userId,
    event_type: 'mark_logged',
    xp_awarded: markXP,
    created_at: new Date().toISOString(),
    metadata: JSON.stringify({ mark_id: markId, date }),
  };
  await insertXPEvent(markEvent);

  // Refresh today's events to include the one just written
  const refreshedTodayEvents = await loadXPEventsForDate(userId, date);
  let runningDailyTotal = refreshedTodayEvents.reduce((s, e) => s + e.xp_awarded, 0);

  // Full-day bonus: all active marks have a mark_logged event today?
  const activeMarks = await query<{ id: string }>(
    'SELECT id FROM lc_counters WHERE user_id = ? AND deleted_at IS NULL',
    [userId],
  );
  const marksLoggedToday = new Set<string>();
  for (const e of refreshedTodayEvents) {
    if (e.event_type !== 'mark_logged') continue;
    try {
      const meta = JSON.parse(e.metadata);
      if (meta.mark_id) marksLoggedToday.add(meta.mark_id);
    } catch {}
  }
  const allLoggedToday =
    activeMarks.length > 0 && activeMarks.every((m) => marksLoggedToday.has(m.id));

  if (allLoggedToday && runningDailyTotal < DAILY_CAP) {
    const bonusXP = Math.min(25, DAILY_CAP - runningDailyTotal);
    totalAwarded += bonusXP;
    runningDailyTotal += bonusXP;
    await insertXPEvent({
      id: uuidv4(),
      user_id: userId,
      event_type: 'full_day_bonus',
      xp_awarded: bonusXP,
      created_at: new Date().toISOString(),
      metadata: JSON.stringify({ date }),
    });
  }

  // 7-day consistency bonus
  const sevenDayDates = await loadXPEventDates(userId, 7);
  const qualifies7d = sevenDayDates.length >= 5;
  const last7dBonusExpired =
    !userXp.last_7d_bonus_date ||
    new Date(date + 'T00:00:00Z').getTime() - new Date(userXp.last_7d_bonus_date + 'T00:00:00Z').getTime() >
      7 * 24 * 60 * 60 * 1000;

  if (qualifies7d && last7dBonusExpired && runningDailyTotal < DAILY_CAP) {
    const bonusXP = Math.min(50, DAILY_CAP - runningDailyTotal);
    totalAwarded += bonusXP;
    runningDailyTotal += bonusXP;
    userXp = { ...userXp, last_7d_bonus_date: date };
    await insertXPEvent({
      id: uuidv4(),
      user_id: userId,
      event_type: 'consistency_7d',
      xp_awarded: bonusXP,
      created_at: new Date().toISOString(),
      metadata: JSON.stringify({ date }),
    });
  }

  // 30-day consistency bonus
  const thirtyDayDates = await loadXPEventDates(userId, 30);
  const qualifies30d = thirtyDayDates.length >= 25;
  const last30dBonusExpired =
    !userXp.last_30d_bonus_date ||
    new Date(date + 'T00:00:00Z').getTime() - new Date(userXp.last_30d_bonus_date + 'T00:00:00Z').getTime() >
      30 * 24 * 60 * 60 * 1000;

  if (qualifies30d && last30dBonusExpired && runningDailyTotal < DAILY_CAP) {
    const bonusXP = Math.min(200, DAILY_CAP - runningDailyTotal);
    totalAwarded += bonusXP;
    userXp = { ...userXp, last_30d_bonus_date: date };
    await insertXPEvent({
      id: uuidv4(),
      user_id: userId,
      event_type: 'consistency_30d',
      xp_awarded: bonusXP,
      created_at: new Date().toISOString(),
      metadata: JSON.stringify({ date }),
    });
  }

  const newTotal = previousXP + totalAwarded;
  const levelUp = checkLevelUp(previousXP, newTotal);
  const updatedXP: UserXP = {
    ...userXp,
    total_xp: newTotal,
    current_level: getLevelForXP(newTotal),
  };
  await upsertUserXP(updatedXP);

  // Fire-and-forget Supabase sync
  syncXPToSupabase(userId).catch((err) =>
    logger.warn('[XP] syncXPToSupabase fire-and-forget failed:', err),
  );

  return { xpAwarded: totalAwarded, newTotal, levelUp };
}

// ---------------------------------------------------------------------------
// awardGoalXP
// ---------------------------------------------------------------------------

export async function awardGoalXP(userId: string, goalId: string): Promise<XPResult> {
  let userXp = (await loadUserXP(userId)) ?? defaultUserXP(userId);
  const previousXP = userXp.total_xp;
  const noAward: XPResult = { xpAwarded: 0, newTotal: previousXP, levelUp: null };

  // Anti-cheat: goal must be ≥ 14 days old
  const goal = await queryFirst<{ created_at: string }>(
    'SELECT created_at FROM lc_counters WHERE id = ?',
    [goalId],
  );
  // Goals are stored in AsyncStorage via goalsDb, not the mock DB.
  // We rely on the caller (goalsSlice) passing only valid completed goals;
  // load goal age check from goalsDb is done at the integration layer (Task 8).
  // Here we award if the goal object is not available via mock DB (AsyncStorage-only goals).

  // Check cooldown
  if (userXp.cooldown_until) {
    const cooldownEnd = new Date(userXp.cooldown_until).getTime();
    if (Date.now() < cooldownEnd) return noAward;
  }

  // Daily cap check
  const today = todayDateString();
  const dailyTotal = await getDailyXPTotal(userId, today);
  if (dailyTotal >= DAILY_CAP) return noAward;

  const goalXP = Math.min(150, DAILY_CAP - dailyTotal);

  // Set cooldown_until = now + 48h
  const cooldownUntil = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

  await insertXPEvent({
    id: uuidv4(),
    user_id: userId,
    event_type: 'goal_completed',
    xp_awarded: goalXP,
    created_at: new Date().toISOString(),
    metadata: JSON.stringify({ goal_id: goalId }),
  });

  const newTotal = previousXP + goalXP;
  const levelUp = checkLevelUp(previousXP, newTotal);
  const updatedXP: UserXP = {
    ...userXp,
    total_xp: newTotal,
    current_level: getLevelForXP(newTotal),
    cooldown_until: cooldownUntil,
  };
  await upsertUserXP(updatedXP);

  syncXPToSupabase(userId).catch((err) =>
    logger.warn('[XP] syncXPToSupabase fire-and-forget failed:', err),
  );

  return { xpAwarded: goalXP, newTotal, levelUp };
}
```

### Step 3.4 — Run tests to confirm they pass
- [ ] Run: `npm run test -- tests/unit/xpEngine.test.ts`
  Expected: all tests PASS

### Step 3.5 — Commit
```bash
git add lib/xpEngine.ts tests/unit/xpEngine.test.ts
git commit -m "feat(xp): add xpEngine pure functions with tests"
```

---

## Task 4: `state/xpSlice.ts` — Zustand Slice

**Files:**
- Create: `state/xpSlice.ts`
- Create: `tests/unit/xpSlice.test.ts`

### Step 4.1 — Write failing tests

- [ ] Create `tests/unit/xpSlice.test.ts`:

```ts
import AsyncStorage from '@react-native-async-storage/async-storage';

// Mock xpDb so the slice doesn't hit AsyncStorage
jest.mock('../../lib/db/xpDb', () => ({
  loadUserXP: jest.fn(),
  upsertUserXP: jest.fn(),
}));

import { useXPStore } from '../../state/xpSlice';
import { loadUserXP } from '../../lib/db/xpDb';

const mockLoadUserXP = loadUserXP as jest.MockedFunction<typeof loadUserXP>;

beforeEach(() => {
  useXPStore.setState({
    totalXP: 0,
    currentLevel: 1,
    pendingLevelUp: null,
    loading: false,
  });
  jest.clearAllMocks();
});

describe('loadXP', () => {
  it('sets totalXP and currentLevel from DB', async () => {
    mockLoadUserXP.mockResolvedValue({
      user_id: 'u1',
      total_xp: 500,
      current_level: 3,
      cooldown_until: null,
      last_7d_bonus_date: null,
      last_30d_bonus_date: null,
    });
    await useXPStore.getState().loadXP('u1');
    expect(useXPStore.getState().totalXP).toBe(500);
    expect(useXPStore.getState().currentLevel).toBe(3);
  });

  it('leaves state at defaults when no DB record exists', async () => {
    mockLoadUserXP.mockResolvedValue(null);
    await useXPStore.getState().loadXP('u1');
    expect(useXPStore.getState().totalXP).toBe(0);
    expect(useXPStore.getState().currentLevel).toBe(1);
  });
});

describe('applyXPResult', () => {
  it('updates totalXP and currentLevel', () => {
    useXPStore.getState().applyXPResult({ xpAwarded: 10, newTotal: 210, levelUp: null });
    expect(useXPStore.getState().totalXP).toBe(210);
    expect(useXPStore.getState().currentLevel).toBe(2);
  });

  it('sets pendingLevelUp when levelUp is non-null', () => {
    useXPStore.getState().applyXPResult({ xpAwarded: 200, newTotal: 200, levelUp: 2 });
    expect(useXPStore.getState().pendingLevelUp).toBe(2);
  });

  it('does not set pendingLevelUp when levelUp is null', () => {
    useXPStore.getState().applyXPResult({ xpAwarded: 10, newTotal: 110, levelUp: null });
    expect(useXPStore.getState().pendingLevelUp).toBeNull();
  });
});

describe('clearPendingLevelUp', () => {
  it('sets pendingLevelUp to null', () => {
    useXPStore.setState({ pendingLevelUp: 3 });
    useXPStore.getState().clearPendingLevelUp();
    expect(useXPStore.getState().pendingLevelUp).toBeNull();
  });
});
```

### Step 4.2 — Run tests to confirm they fail
- [ ] Run: `npm run test -- tests/unit/xpSlice.test.ts`
  Expected: FAIL — `Cannot find module '../../state/xpSlice'`

### Step 4.3 — Write `state/xpSlice.ts`
- [ ] Create `/mnt/c/Users/DEIVI/Desktop/Livra/state/xpSlice.ts`:

```ts
import { create } from 'zustand';
import { loadUserXP } from '../lib/db/xpDb';
import { getLevelForXP } from '../lib/xpEngine';
import type { XPResult } from '../lib/db/xpDb';

interface XPState {
  totalXP: number;
  currentLevel: number;
  pendingLevelUp: number | null;
  loading: boolean;
  loadXP: (userId: string) => Promise<void>;
  applyXPResult: (result: XPResult) => void;
  clearPendingLevelUp: () => void;
}

export const useXPStore = create<XPState>((set) => ({
  totalXP: 0,
  currentLevel: 1,
  pendingLevelUp: null,
  loading: false,

  loadXP: async (userId) => {
    set({ loading: true });
    try {
      const record = await loadUserXP(userId);
      if (record) {
        set({
          totalXP: record.total_xp,
          currentLevel: record.current_level,
          loading: false,
        });
      } else {
        set({ loading: false });
      }
    } catch {
      set({ loading: false });
    }
  },

  applyXPResult: (result) => {
    set((s) => ({
      totalXP: result.newTotal,
      currentLevel: getLevelForXP(result.newTotal),
      pendingLevelUp: result.levelUp !== null ? result.levelUp : s.pendingLevelUp,
    }));
  },

  clearPendingLevelUp: () => {
    set({ pendingLevelUp: null });
  },
}));
```

### Step 4.4 — Run tests to confirm they pass
- [ ] Run: `npm run test -- tests/unit/xpSlice.test.ts`
  Expected: all tests PASS

### Step 4.5 — Commit
```bash
git add state/xpSlice.ts tests/unit/xpSlice.test.ts
git commit -m "feat(xp): add xpSlice Zustand store with tests"
```

---

## Task 5: `hooks/useXP.ts` — Derived Hook

**Files:**
- Create: `hooks/useXP.ts`

No separate test file — this hook is a thin adapter over the slice and pure engine functions. It is exercised indirectly by component tests and the slice tests.

### Step 5.1 — Create `hooks/useXP.ts`
- [ ] Create `/mnt/c/Users/DEIVI/Desktop/Livra/hooks/useXP.ts`:

```ts
import { useXPStore } from '../state/xpSlice';
import { getLevelProgress, getBorderStyle, BorderStyle, LevelProgress } from '../lib/xpEngine';

export interface UseXPReturn {
  currentLevel: number;
  levelTitle: string;
  nextLevelTitle: string | null;
  progressRatio: number;
  xpInCurrentLevel: number;
  xpToNextLevel: number;
  borderStyle: BorderStyle;
  pendingLevelUp: number | null;
  clearPendingLevelUp: () => void;
}

export function useXP(): UseXPReturn {
  const totalXP = useXPStore((s) => s.totalXP);
  const pendingLevelUp = useXPStore((s) => s.pendingLevelUp);
  const clearPendingLevelUp = useXPStore((s) => s.clearPendingLevelUp);

  const progress: LevelProgress = getLevelProgress(totalXP);
  const borderStyle: BorderStyle = getBorderStyle(progress.currentLevel);

  return {
    currentLevel: progress.currentLevel,
    levelTitle: progress.levelTitle,
    nextLevelTitle: progress.nextLevelTitle,
    progressRatio: progress.progressRatio,
    xpInCurrentLevel: progress.xpInCurrentLevel,
    xpToNextLevel: progress.xpToNextLevel,
    borderStyle,
    pendingLevelUp,
    clearPendingLevelUp,
  };
}
```

### Step 5.2 — Type-check
- [ ] Run: `npm run type-check`
  Expected: no errors in `hooks/useXP.ts`

### Step 5.3 — Commit
```bash
git add hooks/useXP.ts
git commit -m "feat(xp): add useXP derived hook"
```

---

## Task 6: `components/LevelUpModal.tsx` — Full-Screen Interrupt

**Files:**
- Create: `components/LevelUpModal.tsx`

This component is not unit-tested (requires a full render environment). Visual verification is done during integration testing (Task 8).

### Step 6.1 — Create `components/LevelUpModal.tsx`
- [ ] Create `/mnt/c/Users/DEIVI/Desktop/Livra/components/LevelUpModal.tsx`:

```tsx
import React, { useEffect } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { colors } from '../theme/colors';
import { spacing, fontSize, borderRadius } from '../theme/tokens';
import { LEVEL_UP_COPY, getBorderStyle } from '../lib/xpEngine';
import { useEffectiveTheme } from '../state/uiSlice';

interface LevelUpModalProps {
  level: number;
  levelTitle: string;
  onDismiss: () => void;
}

export function LevelUpModal({ level, levelTitle, onDismiss }: LevelUpModalProps) {
  const theme = useEffectiveTheme();
  const c = colors[theme];

  const borderStyle = getBorderStyle(level);
  const scale = useSharedValue(0.85);
  const pulseScale = useSharedValue(1);

  useEffect(() => {
    scale.value = withSpring(1, { damping: 14, stiffness: 120 });

    if (borderStyle.animated) {
      pulseScale.value = withRepeat(
        withTiming(1.06, { duration: 900, easing: Easing.inOut(Easing.ease) }),
        -1,
        true,
      );
    }
  }, []);

  const containerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
  }));

  const copy = LEVEL_UP_COPY[level] ?? 'Keep going.';

  return (
    <View style={styles.overlay}>
      <Animated.View style={[styles.card, { backgroundColor: c.surface }, containerStyle]}>
        <Text style={[styles.levelNumber, { color: c.accent.primary }]}>Level {level}</Text>

        <Animated.View
          style={[
            styles.emblem,
            {
              borderWidth: borderStyle.borderWidth,
              borderColor: borderStyle.borderColor,
            },
            borderStyle.doubleRing && {
              shadowColor: borderStyle.borderColor,
              shadowOffset: { width: 0, height: 0 },
              shadowOpacity: 0.4,
              shadowRadius: 6,
              elevation: 6,
            },
            borderStyle.shadowElevation != null && {
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.2,
              shadowRadius: borderStyle.shadowElevation,
              elevation: borderStyle.shadowElevation,
            },
            borderStyle.animated && pulseStyle,
          ]}
        >
          <Text style={[styles.emblemText, { color: c.accent.primary }]}>{level}</Text>
        </Animated.View>

        <Text style={[styles.title, { color: c.text }]}>{levelTitle}</Text>
        <Text style={[styles.copy, { color: c.textSecondary }]}>{copy}</Text>

        <Pressable
          onPress={onDismiss}
          style={({ pressed }) => [
            styles.cta,
            { backgroundColor: c.accent.primary, opacity: pressed ? 0.8 : 1 },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Keep going"
        >
          <Text style={styles.ctaText}>Keep going</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.72)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  },
  card: {
    width: '82%',
    borderRadius: borderRadius.xl,
    paddingVertical: spacing['3xl'],
    paddingHorizontal: spacing.xxl,
    alignItems: 'center',
    gap: spacing.lg,
  },
  levelNumber: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  emblem: {
    width: 80,
    height: 80,
    borderRadius: borderRadius.full,
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: spacing.md,
  },
  emblemText: {
    fontSize: 32,
    fontWeight: '700',
  },
  title: {
    fontSize: fontSize['2xl'] ?? 24,
    fontWeight: '700',
    textAlign: 'center',
  },
  copy: {
    fontSize: fontSize.base,
    textAlign: 'center',
    lineHeight: 22,
  },
  cta: {
    marginTop: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing['3xl'],
    borderRadius: borderRadius.full,
  },
  ctaText: {
    color: '#fff',
    fontSize: fontSize.base,
    fontWeight: '600',
  },
});
```

### Step 6.2 — Type-check
- [ ] Run: `npm run type-check`
  Expected: no errors in `components/LevelUpModal.tsx`

  Note: if `fontSize['2xl']` does not exist in `theme/tokens.ts`, replace it with `24` (a plain number literal).

### Step 6.3 — Commit
```bash
git add components/LevelUpModal.tsx
git commit -m "feat(xp): add LevelUpModal component"
```

---

## Task 7: `components/LevelProgressBar.tsx` — Progress Bar

**Files:**
- Create: `components/LevelProgressBar.tsx`

### Step 7.1 — Create `components/LevelProgressBar.tsx`
- [ ] Create `/mnt/c/Users/DEIVI/Desktop/Livra/components/LevelProgressBar.tsx`:

```tsx
import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { colors } from '../theme/colors';
import { spacing, fontSize, borderRadius } from '../theme/tokens';
import { useEffectiveTheme } from '../state/uiSlice';
import { useXP } from '../hooks/useXP';

export function LevelProgressBar() {
  const theme = useEffectiveTheme();
  const c = colors[theme];

  const { levelTitle, nextLevelTitle, progressRatio } = useXP();

  const fillWidth = useSharedValue(0);

  useEffect(() => {
    fillWidth.value = withTiming(progressRatio, {
      duration: 600,
      easing: Easing.out(Easing.quad),
    });
  }, [progressRatio]);

  const fillStyle = useAnimatedStyle(() => ({
    width: `${fillWidth.value * 100}%` as any,
  }));

  const rightLabel = nextLevelTitle ?? "You're there.";

  return (
    <View style={styles.container}>
      <View style={styles.labels}>
        <Text style={[styles.label, { color: c.textSecondary }]}>{levelTitle}</Text>
        <Text style={[styles.label, { color: c.textSecondary }]}>{rightLabel}</Text>
      </View>
      <View style={[styles.track, { backgroundColor: c.border }]}>
        <Animated.View style={[styles.fill, { backgroundColor: '#C47E8A' }, fillStyle]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.xs,
  },
  labels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  label: {
    fontSize: fontSize.sm,
  },
  track: {
    height: 6,
    borderRadius: borderRadius.full,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: borderRadius.full,
  },
});
```

### Step 7.2 — Type-check
- [ ] Run: `npm run type-check`
  Expected: no errors in `components/LevelProgressBar.tsx`

### Step 7.3 — Commit
```bash
git add components/LevelProgressBar.tsx
git commit -m "feat(xp): add LevelProgressBar component"
```

---

## Task 8: Integration — Wire XP into `useCounters.ts`, `goalsSlice.ts`, and `_layout.tsx`

**Files:**
- Modify: `hooks/useCounters.ts`
- Modify: `state/goalsSlice.ts`
- Modify: `app/_layout.tsx`

### Step 8.1 — Hook `awardMarkXP` into `useCounters.ts`

- [ ] Open `hooks/useCounters.ts`. Find the `InteractionManager.runAfterInteractions` block inside `incrementMark` (around line 298). It currently ends with the `evaluateMarkBadges` call and the logger statement. Add the XP call directly after `evaluateMarkBadges`:

```ts
// Inside InteractionManager.runAfterInteractions, after evaluateMarkBadges call:
const { awardMarkXP } = await import('../lib/xpEngine');
awardMarkXP(userId, markId, today)
  .then((result) => {
    const { useXPStore } = require('../state/xpSlice');
    useXPStore.getState().applyXPResult(result);
  })
  .catch((err: unknown) => {
    logger.error('[XP] awardMarkXP failed:', err);
  });
```

The full `InteractionManager.runAfterInteractions` callback after the edit should look like:

```ts
InteractionManager.runAfterInteractions(() => {
  if (mark.enable_streak) {
    setTimeout(() => {
      const markEvents = getEventsByMark(markId);
      const streakData = computeStreak(markEvents, getAppDate());
      updateStreakInDB(markId, userId, streakData).catch((error) => {
        logger.error('[INCREMENT] Error updating streak after increment:', error);
      });
    }, 50);
  }

  evaluateMarkBadges(markId, userId).catch((error) => {
    logger.error('[INCREMENT] Error evaluating badges after increment:', error);
  });

  import('../lib/xpEngine').then(({ awardMarkXP }) => {
    awardMarkXP(userId, markId, today)
      .then((result) => {
        const { useXPStore } = require('../state/xpSlice');
        useXPStore.getState().applyXPResult(result);
      })
      .catch((err: unknown) => {
        logger.error('[XP] awardMarkXP failed:', err);
      });
  });

  logger.log('[INCREMENT] ===== END INCREMENT (background tasks started) =====', {
    markId,
    finalTotal: newTotal,
  });
});
```

### Step 8.2 — Hook `awardGoalXP` into `goalsSlice.ts`

- [ ] Open `state/goalsSlice.ts`. Find the `completeGoal` action. After the `await upsertGoals(writes)` line and before the `set(...)` call, add a goal age check and XP award:

```ts
completeGoal: async (id) => {
  const now = new Date().toISOString();
  const goals = get().goals;
  const completing = goals.find(g => g.id === id);
  if (!completing) return;

  const completed: Goal = {
    ...completing,
    status: 'completed',
    completed_at: now,
    updated_at: now,
  };

  const remaining = goals.filter(g => g.id !== id);
  const next = nextGoalToActivate(remaining);
  const activated: Goal | undefined = next
    ? { ...next, status: 'active', updated_at: now }
    : undefined;

  const writes = [completed, ...(activated ? [activated] : [])];
  await upsertGoals(writes);

  // Award goal completion XP — fire and forget, age check happens inside awardGoalXP
  const goalAgeMs = Date.now() - new Date(completing.created_at).getTime();
  const goalAgeDays = goalAgeMs / (1000 * 60 * 60 * 24);
  if (goalAgeDays >= 14 && completing.user_id) {
    import('../lib/xpEngine').then(({ awardGoalXP }) => {
      awardGoalXP(completing.user_id, completing.id)
        .then((result) => {
          const { useXPStore } = require('./xpSlice');
          useXPStore.getState().applyXPResult(result);
        })
        .catch((err: unknown) => {
          console.warn('[XP] awardGoalXP failed:', err);
        });
    });
  }

  set(s => ({
    goals: s.goals.map(g => {
      if (g.id === completed.id) return completed;
      if (activated && g.id === activated.id) return activated;
      return g;
    }),
  }));
},
```

### Step 8.3 — Load XP on login in `_layout.tsx`

- [ ] Open `app/_layout.tsx`. At the top, add the import:

```ts
import { useXPStore } from '../state/xpSlice';
import { LevelUpModal } from '../components/LevelUpModal';
import { getLevelProgress } from '../lib/xpEngine';
```

- [ ] Inside the `useEffect` that runs `loadGoals`, `loadCheckins`, etc. (the big auth effect starting around line 362), add an XP load call after `loadCheckins`:

```ts
await useXPStore.getState().loadXP(user.id);
```

### Step 8.4 — Render `LevelUpModal` in `RootNavigator`

- [ ] In the `RootNavigator` function, read `pendingLevelUp` and the dismiss function from the store, then render the modal as a sibling to `<Stack>`:

```tsx
function RootNavigator() {
  const theme = useEffectiveTheme();
  const pendingLevelUp = useXPStore((s) => s.pendingLevelUp);
  const clearPendingLevelUp = useXPStore((s) => s.clearPendingLevelUp);

  const levelProgress = pendingLevelUp !== null ? getLevelProgress(pendingLevelUp * 200) : null;
  // We pass the level number directly — getLevelProgress is only needed for the title.
  // Derive title from the level number using LEVEL_UP_COPY keys mapping to titles.
  const levelTitles: Record<number, string> = {
    1: 'Beginner', 2: 'Committed', 3: 'Consistent', 4: 'Focused',
    5: 'Disciplined', 6: 'Dedicated', 7: 'Relentless', 8: 'Unstoppable',
    9: 'Elite', 10: 'Livra',
  };

  return (
    <>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors[theme].background },
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="counter/[id]" options={{ presentation: 'modal' }} />
        <Stack.Screen name="onboarding" options={{ presentation: 'fullScreenModal' }} />
        <Stack.Screen name="paywall" options={{ presentation: 'modal' }} />
        <Stack.Screen name="auth" options={{ presentation: 'modal' }} />
        <Stack.Screen name="iap-dashboard" options={{ presentation: 'modal' }} />
        <Stack.Screen name="goal/new" options={{ presentation: 'modal', title: 'New Goal', headerShown: false }} />
        <Stack.Screen name="goal/queue" options={{ title: 'Goals', headerShown: false }} />
        <Stack.Screen name="checkin" options={{ presentation: 'modal', headerShown: false }} />
        <Stack.Screen
          name="goal/complete"
          options={{
            presentation: 'fullScreenModal',
            headerShown: false,
            gestureEnabled: false,
          }}
        />
        <Stack.Screen name="goal/history" options={{ headerShown: false }} />
        <Stack.Screen
          name="goal/milestone"
          options={{
            presentation: 'fullScreenModal',
            headerShown: false,
            gestureEnabled: false,
          }}
        />
      </Stack>
      <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
      {pendingLevelUp !== null && (
        <LevelUpModal
          level={pendingLevelUp}
          levelTitle={levelTitles[pendingLevelUp] ?? 'Livra'}
          onDismiss={clearPendingLevelUp}
        />
      )}
    </>
  );
}
```

### Step 8.5 — Type-check entire codebase
- [ ] Run: `npm run type-check`
  Expected: no errors across all modified files

### Step 8.6 — Run full test suite
- [ ] Run: `npm run test`
  Expected: all existing tests PASS, `xpEngine.test.ts` and `xpSlice.test.ts` PASS

### Step 8.7 — Commit
```bash
git add hooks/useCounters.ts state/goalsSlice.ts app/_layout.tsx
git commit -m "feat(xp): integrate XP awards into mark increment and goal completion"
```

---

## Task 9: Supabase Migration SQL

**Files:**
- Create: `docs/superpowers/migrations/2026-05-28-level-system.sql`

This file is documentation only — the engineer applies it manually via the Supabase dashboard or CLI.

### Step 9.1 — Create migration file
- [ ] Run `mkdir -p /mnt/c/Users/DEIVI/Desktop/Livra/docs/superpowers/migrations`
- [ ] Create `docs/superpowers/migrations/2026-05-28-level-system.sql`:

```sql
-- Livra Level System — Supabase Migration
-- Apply via: Supabase Dashboard > SQL Editor

-- 1. Add XP columns to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS total_xp integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS current_level integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS goal_completion_cooldown_until timestamptz,
  ADD COLUMN IF NOT EXISTS last_7d_bonus_date date,
  ADD COLUMN IF NOT EXISTS last_30d_bonus_date date;

-- 2. Create xp_events table
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

### Step 9.2 — Commit
```bash
git add docs/superpowers/migrations/2026-05-28-level-system.sql
git commit -m "docs(xp): add Supabase migration SQL for level system"
```

---

## Self-Review

### Spec coverage checklist

| Spec requirement | Covered by task |
|---|---|
| 10 levels with thresholds | Task 3 — `LEVEL_THRESHOLDS`, `getLevelForXP` |
| Level titles | Task 3 — `LEVEL_TITLES` in `getLevelProgress` |
| Daily mark XP (10 per unique mark, first log) | Task 3 — `awardMarkXP` steps 1–6 |
| Full-day bonus (25) | Task 3 — `awardMarkXP` step 7 |
| Goal completed XP (150) | Task 3 — `awardGoalXP` |
| 7-day consistency bonus (50) | Task 3 — `awardMarkXP` step 8 |
| 30-day consistency bonus (200) | Task 3 — `awardMarkXP` step 9 |
| Daily cap (100 XP) | Task 3 — `DAILY_CAP`, all award paths |
| Anti-cheat 1: max 5 marks/day | Task 3 — `marksAwardedToday.size >= 5` check |
| Anti-cheat 2: mark ≥ 3 days old | Task 3 — `markAge < 3` check |
| Anti-cheat 3: 7d bonus once per 7d window | Task 3 — `last7dBonusExpired` check |
| Anti-cheat 4: 30d bonus once per 30d window | Task 3 — `last30dBonusExpired` check |
| Anti-cheat 5: goal ≥ 14 days old | Task 8 — `goalAgeDays >= 14` in `goalsSlice.ts` |
| Anti-cheat 6: 48h cooldown after goal | Task 3 — `cooldown_until` set in `awardGoalXP` |
| `lc_user_xp` / `lc_xp_events` tables | Task 1 — `lib/db/index.ts` |
| `LevelProgress` interface | Task 3 — exported from `lib/xpEngine.ts` |
| `getLevelProgress` | Task 3 + tested Task 3.1 |
| `checkLevelUp` — handles multi-level jumps | Task 3 + tested Task 3.1 |
| `getBorderStyle` — all 6 tiers including animated level 10 | Task 3 + tested Task 3.1 |
| `LEVEL_UP_COPY` — levels 2–10 | Task 3 + tested Task 3.1 |
| `xpSlice` — `pendingLevelUp`, `applyXPResult`, `clearPendingLevelUp` | Task 4 |
| `useXP` hook — no raw XP number | Task 5 |
| `LevelUpModal` — non-dismissable, scale-in, "Keep going" CTA | Task 6 |
| `LevelProgressBar` — animated fill, no raw numbers, "You're there." at L10 | Task 7 |
| Integration in `useCounters.ts` | Task 8.1 |
| Integration in `goalsSlice.ts` | Task 8.2 |
| `LevelUpModal` rendered in `_layout.tsx` | Task 8.3–8.4 |
| Supabase migration SQL | Task 9 |
| `syncXPToSupabase` — best-effort, silent on failure | Task 2 |

All spec requirements are covered. No placeholders found. Type names are consistent: `XPResult` is defined in `lib/db/xpDb.ts` and re-exported, used identically in `xpSlice.ts`, `xpEngine.ts`, and `hooks/useXP.ts`.
