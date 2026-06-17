# Momentum Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the pure computation engine + persistence for Momentum — Livra's forgiving, frequency-aware run — so any UI/notification can ask "what is this goal's Momentum right now?" and get a tested, correct answer.

**Architecture:** A pure functional core (`lib/goalMomentum.ts`) computes per-mark gap state from `weekly_target` + `last_activity_date`, aggregates to a goal-level state by weakest link, and assembles a snapshot (state, day count, cushion, slipping mark). A thin AsyncStorage wrapper (`lib/goalMomentumStore.ts`) persists the run's start date per goal and re-evaluates on demand. No UI in this plan. Mirrors the existing `lib/consistency.ts` pattern (pure functions + thin persistence).

**Tech Stack:** TypeScript (strict), Jest (`jest-expo`), `@react-native-async-storage/async-storage`, `date-fns` (via `lib/date.ts`).

**Source spec:** `docs/superpowers/specs/2026-06-17-momentum-design.md` (§2 mechanic, §7 resolved decisions).

---

## Scope

This plan is **one subsystem: the engine + persistence.** The remaining Momentum subsystems are separate plans (see "Remaining subsystems" at the end): the streak-machinery transform, the representation component, the at-risk banner + 1+1 notification, and completion banking. Each consumes this engine's `MomentumSnapshot`.

**Naming:** `lib/momentum.ts` already exists (legacy per-mark lifetime stats, `calculateMomentum`). This feature is goal-scoped and uses the distinct prefix **`goalMomentum`** for all new files and exports to avoid any clash.

## File Structure

- Create: `lib/goalMomentum.ts` — pure functions + types. One responsibility: compute Momentum state from marks. No I/O.
- Create: `lib/goalMomentumStore.ts` — thin AsyncStorage persistence + `evaluateGoalMomentum`. The only file that touches storage.
- Create: `tests/unit/goalMomentum.test.ts` — unit tests for the pure core (the bulk of the testing).

## Reference: shapes already in the codebase (do not redefine)

From `types/index.ts`:
```ts
type Mark = {
  id: string;
  weekly_target?: number | null;      // times per week; engine default 3 when null/<=0
  last_activity_date?: string;        // 'YYYY-MM-DD' of last log; absent = never logged
  // ...many other fields, irrelevant here
};
```
From `lib/date.ts`:
```ts
const daysBetween = (date1, date2): number => differenceInDays(d1, d2); // date1 - date2, whole days
const yyyyMmDd = (date: Date): string;                                  // local 'YYYY-MM-DD'
```
The spec's resolved cushion table (the oracle for tests):

| Frequency (weekly_target) | Interval I = 7/target | at-risk gap = ceil(I)+1 | break gap = ceil(2I)+1 |
| --- | --- | --- | --- |
| 7 (daily) | 1.0 | 2 | 3 |
| 4 | 1.75 | 3 | 5 |
| 2 | 3.5 | 5 | 8 |

---

### Task 1: Interval + gap-threshold math

**Files:**
- Create: `lib/goalMomentum.ts`
- Test: `tests/unit/goalMomentum.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/goalMomentum.test.ts
import {
  expectedInterval,
  atRiskGapFor,
  breakGapFor,
} from '../../lib/goalMomentum';

describe('interval + thresholds', () => {
  it('derives interval = 7 / weekly_target, defaulting to 3', () => {
    expect(expectedInterval(7)).toBeCloseTo(1.0);
    expect(expectedInterval(4)).toBeCloseTo(1.75);
    expect(expectedInterval(2)).toBeCloseTo(3.5);
    expect(expectedInterval(null)).toBeCloseTo(7 / 3);
    expect(expectedInterval(0)).toBeCloseTo(7 / 3);
  });

  it('matches the spec cushion table', () => {
    expect(atRiskGapFor(expectedInterval(7))).toBe(2);
    expect(breakGapFor(expectedInterval(7))).toBe(3);
    expect(atRiskGapFor(expectedInterval(4))).toBe(3);
    expect(breakGapFor(expectedInterval(4))).toBe(5);
    expect(atRiskGapFor(expectedInterval(2))).toBe(5);
    expect(breakGapFor(expectedInterval(2))).toBe(8);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/unit/goalMomentum.test.ts`
Expected: FAIL — "Cannot find module '../../lib/goalMomentum'".

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/goalMomentum.ts
// Goal-scoped Momentum engine: forgiving, frequency-aware run.
// Pure functions only — no I/O. Distinct from the legacy per-mark lib/momentum.ts.

/** Expected days between logs for a mark, from its weekly target. Default 3/week. */
export function expectedInterval(weeklyTarget?: number | null): number {
  const t = weeklyTarget && weeklyTarget > 0 ? weeklyTarget : 3;
  return 7 / t;
}

/** Whole-day gap at which a mark goes at-risk. */
export function atRiskGapFor(interval: number): number {
  return Math.ceil(interval) + 1;
}

/** Whole-day gap at which a mark's run breaks. */
export function breakGapFor(interval: number): number {
  return Math.ceil(2 * interval) + 1;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/unit/goalMomentum.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/goalMomentum.ts tests/unit/goalMomentum.test.ts
git commit -m "feat(momentum): interval and gap-threshold math"
```

---

### Task 2: Per-mark gap + state

**Files:**
- Modify: `lib/goalMomentum.ts`
- Test: `tests/unit/goalMomentum.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// add to tests/unit/goalMomentum.test.ts
import { markGapDays, markMomentum } from '../../lib/goalMomentum';

describe('markGapDays', () => {
  it('returns whole days since last log, null when never logged', () => {
    expect(markGapDays('2026-06-10', '2026-06-10')).toBe(0);
    expect(markGapDays('2026-06-08', '2026-06-10')).toBe(2);
    expect(markGapDays(undefined, '2026-06-10')).toBeNull();
    expect(markGapDays(null, '2026-06-10')).toBeNull();
  });
});

describe('markMomentum (daily mark, target 7: at-risk 2 / break 3)', () => {
  const mk = (last?: string) => ({ id: 'm1', weekly_target: 7, last_activity_date: last });
  it('classifies by gap', () => {
    expect(markMomentum(mk('2026-06-10'), '2026-06-10').state).toBe('on_track'); // gap 0
    expect(markMomentum(mk('2026-06-09'), '2026-06-10').state).toBe('resting');  // gap 1 (<2)
    expect(markMomentum(mk('2026-06-08'), '2026-06-10').state).toBe('slipping'); // gap 2 (<3)
    expect(markMomentum(mk('2026-06-07'), '2026-06-10').state).toBe('broken');   // gap 3 (>=3)
    expect(markMomentum(mk(undefined), '2026-06-10').state).toBe('resting');     // never logged
  });
});

describe('markMomentum (2x/week, target 2: at-risk 5 / break 8)', () => {
  const mk = (last?: string) => ({ id: 'm2', weekly_target: 2, last_activity_date: last });
  it('gives low-frequency marks more rope', () => {
    expect(markMomentum(mk('2026-06-07'), '2026-06-10').state).toBe('resting');  // gap 3 (<5)
    expect(markMomentum(mk('2026-06-05'), '2026-06-10').state).toBe('slipping'); // gap 5 (<8)
    expect(markMomentum(mk('2026-06-02'), '2026-06-10').state).toBe('broken');   // gap 8 (>=8)
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/unit/goalMomentum.test.ts`
Expected: FAIL — "markGapDays is not a function" / "markMomentum is not a function".

- [ ] **Step 3: Write minimal implementation**

```ts
// add to lib/goalMomentum.ts
import { daysBetween } from './date';

export type MarkMomentumState = 'on_track' | 'resting' | 'slipping' | 'broken';

export type MarkMomentumInput = {
  id: string;
  weekly_target?: number | null;
  last_activity_date?: string | null;
};

export type MarkMomentum = {
  id: string;
  intervalDays: number;
  atRiskGap: number;
  breakGap: number;
  gap: number | null;
  state: MarkMomentumState;
};

/** Whole days since the mark's last log; null when never logged. */
export function markGapDays(
  lastActivityDate: string | null | undefined,
  today: string,
): number | null {
  if (!lastActivityDate) return null;
  return daysBetween(today, lastActivityDate);
}

export function markMomentum(mark: MarkMomentumInput, today: string): MarkMomentum {
  const intervalDays = expectedInterval(mark.weekly_target);
  const atRiskGap = atRiskGapFor(intervalDays);
  const breakGap = breakGapFor(intervalDays);
  const gap = markGapDays(mark.last_activity_date, today);

  let state: MarkMomentumState;
  if (gap === null) state = 'resting';
  else if (gap <= 0) state = 'on_track';
  else if (gap < atRiskGap) state = 'resting';
  else if (gap < breakGap) state = 'slipping';
  else state = 'broken';

  return { id: mark.id, intervalDays, atRiskGap, breakGap, gap, state };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/unit/goalMomentum.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/goalMomentum.ts tests/unit/goalMomentum.test.ts
git commit -m "feat(momentum): per-mark gap and state classification"
```

---

### Task 3: Goal aggregation by weakest link

**Files:**
- Modify: `lib/goalMomentum.ts`
- Test: `tests/unit/goalMomentum.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// add to tests/unit/goalMomentum.test.ts
import { goalMomentumState } from '../../lib/goalMomentum';

const mm = (state: string) => ({
  id: state, intervalDays: 1, atRiskGap: 2, breakGap: 3, gap: 0, state,
}) as any;

describe('goalMomentumState (weakest link)', () => {
  it('any broken mark breaks the goal', () => {
    expect(goalMomentumState([mm('on_track'), mm('broken')])).toBe('broken');
  });
  it('any slipping (no broken) makes the goal slipping', () => {
    expect(goalMomentumState([mm('on_track'), mm('slipping'), mm('resting')])).toBe('slipping');
  });
  it('on_track when at least one logged today and none worse', () => {
    expect(goalMomentumState([mm('on_track'), mm('resting')])).toBe('on_track');
  });
  it('resting when all resting', () => {
    expect(goalMomentumState([mm('resting'), mm('resting')])).toBe('resting');
  });
  it('empty goal is resting', () => {
    expect(goalMomentumState([])).toBe('resting');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/unit/goalMomentum.test.ts`
Expected: FAIL — "goalMomentumState is not a function".

- [ ] **Step 3: Write minimal implementation**

```ts
// add to lib/goalMomentum.ts
export type GoalMomentumState = 'on_track' | 'resting' | 'slipping' | 'broken';

export function goalMomentumState(marks: MarkMomentum[]): GoalMomentumState {
  if (marks.some((m) => m.state === 'broken')) return 'broken';
  if (marks.some((m) => m.state === 'slipping')) return 'slipping';
  if (marks.some((m) => m.state === 'on_track')) return 'on_track';
  return 'resting';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/unit/goalMomentum.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/goalMomentum.ts tests/unit/goalMomentum.test.ts
git commit -m "feat(momentum): goal aggregation by weakest link"
```

---

### Task 4: Cushion fraction + day count

**Files:**
- Modify: `lib/goalMomentum.ts`
- Test: `tests/unit/goalMomentum.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// add to tests/unit/goalMomentum.test.ts
import { cushionFraction, momentumDays } from '../../lib/goalMomentum';

describe('cushionFraction', () => {
  it('is 1 at the at-risk edge and 0 at the break edge', () => {
    expect(cushionFraction(3, 3, 5)).toBeCloseTo(1);   // just at-risk
    expect(cushionFraction(4, 3, 5)).toBeCloseTo(0.5);
    expect(cushionFraction(5, 3, 5)).toBeCloseTo(0);   // breaking
  });
  it('clamps to [0,1]', () => {
    expect(cushionFraction(2, 3, 5)).toBe(1);
    expect(cushionFraction(9, 3, 5)).toBe(0);
  });
});

describe('momentumDays', () => {
  it('counts inclusive days since the run started, 0 when not started', () => {
    expect(momentumDays(null, '2026-06-10')).toBe(0);
    expect(momentumDays('2026-06-10', '2026-06-10')).toBe(1);
    expect(momentumDays('2026-05-30', '2026-06-10')).toBe(12);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/unit/goalMomentum.test.ts`
Expected: FAIL — "cushionFraction is not a function".

- [ ] **Step 3: Write minimal implementation**

```ts
// add to lib/goalMomentum.ts
/** Fraction of cushion remaining before break, clamped [0,1]. 1 = just at-risk, 0 = breaking. */
export function cushionFraction(gap: number, atRiskGap: number, breakGap: number): number {
  if (breakGap <= atRiskGap) return 0;
  const frac = (breakGap - gap) / (breakGap - atRiskGap);
  return Math.max(0, Math.min(1, frac));
}

/** Inclusive count of good-standing days since the run began; 0 when not started. */
export function momentumDays(startDate: string | null, today: string): number {
  if (!startDate) return 0;
  return daysBetween(today, startDate) + 1;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/unit/goalMomentum.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/goalMomentum.ts tests/unit/goalMomentum.test.ts
git commit -m "feat(momentum): cushion fraction and day count"
```

---

### Task 5: Run-record transition (when the run starts / resets)

**Files:**
- Modify: `lib/goalMomentum.ts`
- Test: `tests/unit/goalMomentum.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// add to tests/unit/goalMomentum.test.ts
import { nextMomentumRecord } from '../../lib/goalMomentum';

describe('nextMomentumRecord', () => {
  const T = '2026-06-10';
  it('does not start a run before the first real log', () => {
    expect(nextMomentumRecord(null, 'g1', 'resting', T)).toEqual({ goalId: 'g1', startDate: null });
  });
  it('starts the run on the first on_track day', () => {
    expect(nextMomentumRecord(null, 'g1', 'on_track', T)).toEqual({ goalId: 'g1', startDate: T });
  });
  it('continues an existing run through resting and slipping', () => {
    const prev = { goalId: 'g1', startDate: '2026-06-01' };
    expect(nextMomentumRecord(prev, 'g1', 'resting', T)).toEqual(prev);
    expect(nextMomentumRecord(prev, 'g1', 'slipping', T)).toEqual(prev);
  });
  it('resets the run when broken', () => {
    const prev = { goalId: 'g1', startDate: '2026-06-01' };
    expect(nextMomentumRecord(prev, 'g1', 'broken', T)).toEqual({ goalId: 'g1', startDate: null });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/unit/goalMomentum.test.ts`
Expected: FAIL — "nextMomentumRecord is not a function".

- [ ] **Step 3: Write minimal implementation**

```ts
// add to lib/goalMomentum.ts
export type MomentumRecord = { goalId: string; startDate: string | null };

export function nextMomentumRecord(
  prev: MomentumRecord | null,
  goalId: string,
  state: GoalMomentumState,
  today: string,
): MomentumRecord {
  if (state === 'broken') return { goalId, startDate: null };
  if (prev && prev.startDate) return { goalId, startDate: prev.startDate };
  if (state === 'on_track') return { goalId, startDate: today };
  return { goalId, startDate: null };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/unit/goalMomentum.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/goalMomentum.ts tests/unit/goalMomentum.test.ts
git commit -m "feat(momentum): run-record transition (start, continue, reset)"
```

---

### Task 6: Snapshot assembler (what the UI/notification consume)

**Files:**
- Modify: `lib/goalMomentum.ts`
- Test: `tests/unit/goalMomentum.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// add to tests/unit/goalMomentum.test.ts
import { momentumSnapshot } from '../../lib/goalMomentum';

describe('momentumSnapshot', () => {
  const T = '2026-06-10';
  it('reports days and on_track when logged today', () => {
    const marks = [{ id: 'm1', weekly_target: 7, last_activity_date: '2026-06-10' }];
    const snap = momentumSnapshot(marks, { goalId: 'g1', startDate: '2026-06-01' }, T);
    expect(snap.state).toBe('on_track');
    expect(snap.days).toBe(10);
    expect(snap.cushionRemaining).toBeNull();
    expect(snap.slippingMarkId).toBeNull();
  });

  it('surfaces the worst slipping mark and its cushion', () => {
    const marks = [
      { id: 'm1', weekly_target: 7, last_activity_date: '2026-06-08' }, // gap 2: slipping, cushion 1
      { id: 'm2', weekly_target: 4, last_activity_date: '2026-06-07' }, // gap 3: slipping (3/5), cushion 1
    ];
    const snap = momentumSnapshot(marks, { goalId: 'g1', startDate: '2026-06-01' }, T);
    expect(snap.state).toBe('slipping');
    // m1 cushion = (3-2)/(3-2) = 1 ; m2 cushion = (5-3)/(5-3) = 1 ; tie -> first found
    expect(snap.slippingMarkId).toBe('m1');
    expect(snap.cushionRemaining).toBeCloseTo(1);
  });

  it('reports 0 days and broken when a mark has fallen off', () => {
    const marks = [{ id: 'm1', weekly_target: 7, last_activity_date: '2026-06-06' }]; // gap 4 >= 3
    const snap = momentumSnapshot(marks, { goalId: 'g1', startDate: null }, T);
    expect(snap.state).toBe('broken');
    expect(snap.days).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/unit/goalMomentum.test.ts`
Expected: FAIL — "momentumSnapshot is not a function".

- [ ] **Step 3: Write minimal implementation**

```ts
// add to lib/goalMomentum.ts
export type MomentumSnapshot = {
  state: GoalMomentumState;
  days: number;
  cushionRemaining: number | null; // null unless slipping
  slippingMarkId: string | null;
};

export function momentumSnapshot(
  marks: MarkMomentumInput[],
  record: MomentumRecord | null,
  today: string,
): MomentumSnapshot {
  const mms = marks.map((m) => markMomentum(m, today));
  const state = goalMomentumState(mms);
  const days = momentumDays(record?.startDate ?? null, today);

  let cushionRemaining: number | null = null;
  let slippingMarkId: string | null = null;

  if (state === 'slipping') {
    let worst: { id: string; c: number } | null = null;
    for (const m of mms) {
      if (m.state !== 'slipping' || m.gap === null) continue;
      const c = cushionFraction(m.gap, m.atRiskGap, m.breakGap);
      if (worst === null || c < worst.c) worst = { id: m.id, c };
    }
    if (worst) {
      cushionRemaining = worst.c;
      slippingMarkId = worst.id;
    }
  }

  return { state, days, cushionRemaining, slippingMarkId };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/unit/goalMomentum.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/goalMomentum.ts tests/unit/goalMomentum.test.ts
git commit -m "feat(momentum): snapshot assembler (state, days, cushion, slipping mark)"
```

---

### Task 7: Thin persistence store

**Files:**
- Create: `lib/goalMomentumStore.ts`
- Test: `tests/unit/goalMomentumStore.test.ts`

> AsyncStorage is auto-mocked by `jest-expo` (an in-memory mock). The existing `lib/consistency.ts` relies on the same mock, so no extra setup is needed.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/goalMomentumStore.test.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { evaluateGoalMomentum, loadMomentumRecord } from '../../lib/goalMomentumStore';

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('evaluateGoalMomentum', () => {
  it('starts a run on first log and persists the record', async () => {
    const marks = [{ id: 'm1', weekly_target: 7, last_activity_date: '2026-06-10' }];
    const snap = await evaluateGoalMomentum('g1', marks, '2026-06-10');
    expect(snap.state).toBe('on_track');
    expect(snap.days).toBe(1);

    const rec = await loadMomentumRecord('g1');
    expect(rec).toEqual({ goalId: 'g1', startDate: '2026-06-10' });
  });

  it('continues the run on a later day and resets when broken', async () => {
    const marks = [{ id: 'm1', weekly_target: 7, last_activity_date: '2026-06-10' }];
    await evaluateGoalMomentum('g1', marks, '2026-06-10'); // start
    const cont = await evaluateGoalMomentum('g1', marks, '2026-06-11'); // gap 1: resting, run continues
    expect(cont.state).toBe('resting');
    expect(cont.days).toBe(2);

    const broken = await evaluateGoalMomentum('g1', marks, '2026-06-14'); // gap 4 >= 3: broken
    expect(broken.state).toBe('broken');
    expect(broken.days).toBe(0);
    expect(await loadMomentumRecord('g1')).toEqual({ goalId: 'g1', startDate: null });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/unit/goalMomentumStore.test.ts`
Expected: FAIL — "Cannot find module '../../lib/goalMomentumStore'".

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/goalMomentumStore.ts
// Thin AsyncStorage wrapper for Momentum. The only Momentum file that touches storage.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { yyyyMmDd } from './date';
import {
  markMomentum,
  goalMomentumState,
  nextMomentumRecord,
  momentumSnapshot,
  type MarkMomentumInput,
  type MomentumRecord,
  type MomentumSnapshot,
} from './goalMomentum';

const keyFor = (goalId: string) => `@livra_momentum_${goalId}`;

export async function loadMomentumRecord(goalId: string): Promise<MomentumRecord | null> {
  try {
    const raw = await AsyncStorage.getItem(keyFor(goalId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof parsed.goalId === 'string' &&
      (parsed.startDate === null || typeof parsed.startDate === 'string')
    ) {
      return parsed as MomentumRecord;
    }
    return null;
  } catch {
    return null;
  }
}

/** Evaluate a goal's Momentum for `today`, persist the updated record, return the snapshot. */
export async function evaluateGoalMomentum(
  goalId: string,
  marks: MarkMomentumInput[],
  today: string = yyyyMmDd(new Date()),
): Promise<MomentumSnapshot> {
  const prev = await loadMomentumRecord(goalId);
  const mms = marks.map((m) => markMomentum(m, today));
  const state = goalMomentumState(mms);
  const record = nextMomentumRecord(prev, goalId, state, today);
  try {
    await AsyncStorage.setItem(keyFor(goalId), JSON.stringify(record));
  } catch {
    // best effort — record is a convenience cache, recomputed from marks next open
  }
  return momentumSnapshot(marks, record, today);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/unit/goalMomentumStore.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/goalMomentumStore.ts tests/unit/goalMomentumStore.test.ts
git commit -m "feat(momentum): thin AsyncStorage persistence + evaluateGoalMomentum"
```

---

### Task 8: Full-suite + type-check gate

**Files:** none (verification only)

- [ ] **Step 1: Run the full unit suite**

Run: `npm run test`
Expected: PASS, including the two new files. No existing test regressed.

- [ ] **Step 2: Type-check**

Run: `npm run type-check`
Expected: no new errors from `lib/goalMomentum.ts` / `lib/goalMomentumStore.ts`.

- [ ] **Step 3: Lint the new files**

Run: `npm run lint`
Expected: clean for the new files (pre-existing backlog elsewhere is acceptable).

- [ ] **Step 4: Commit any fixups**

```bash
git add -A
git commit -m "chore(momentum): engine passes suite, type-check, lint" --allow-empty
```

---

## Remaining subsystems (each its own plan)

These consume `MomentumSnapshot` from this engine. Build in this order; each gets its own brainstorm-light plan when reached.

1. **Streak-machinery transform** (spec §6). Remove the "Enable streak" toggle in `app/mark/new.tsx`; stop defaulting `enable_streak: true` in `app/onboarding.tsx` / `app/goal/new.tsx`; repurpose `anyStreakAtRisk` in `services/behaviorNotifications.ts` to read Momentum; convert `seedBrokenStreak` / "Simulate Streak Loss" in `app/diagnostics.tsx` to Momentum-state seeds; revisit "streak data" in the privacy policy.
2. **Representation component** (spec §5). The C+A hybrid: a `GoalMomentum` view on `app/(tabs)/focus.tsx` showing "Momentum · N days" with a warm glow, and the amber cushion gauge (driven by `cushionRemaining`) visible only when `state === 'slipping'`. No flame, no countdown number.
3. **At-risk banner + 1+1 notification** (spec §4, §10). In-app banner on `focus.tsx` when slipping; one push on entering at-risk + one final before break; rotating copy pool added to `lib/copy.ts`; honors quiet hours / reminder prefs.
4. **Completion banking** (spec §7.4). On goal completion in `state/goalsSlice.ts`, bank `days` into the completion record (and optional share-card line); the newly-active queued goal starts with no record (days 0).

## Notes for the implementer

- All thresholds are tunable constants centralized in `expectedInterval` / `atRiskGapFor` / `breakGapFor`. If product tuning changes the cushion, only these three functions and the Task-1 table change.
- `today` is always an explicit `'YYYY-MM-DD'` argument in the pure layer (never `new Date()` inside pure functions) so tests are deterministic. Only `evaluateGoalMomentum` defaults it.
- The engine reads only `id`, `weekly_target`, and `last_activity_date` from a mark. It never reads `enable_streak` — Momentum is independent of the legacy streak field, which the transform plan removes.
