# Momentum At-Risk Warning (Phase 1.3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pre-schedule calm, offer-framed local notifications that warn the user before an active goal's Momentum breaks, plus an in-app amber banner that carries the same signal when push is unavailable.

**Architecture:** A new pure engine helper computes weakest-link warning dates per goal; a new pure planner merges per-goal nudges into at most one push per calendar day; a new I/O service (`momentumWarningNotifications.ts`) reconciles (cancels + reschedules) the `livra-mw-` notification set on each Momentum eval point. The notification ownership module gains a namespace split so the engagement planner (`livra-bn-`) and warnings (`livra-mw-`) cancel independently. An in-app banner reads the cached `momentumSlice` snapshots.

**Tech Stack:** React Native + Expo (`expo-notifications`), Zustand, AsyncStorage, TypeScript 5.9 strict, Jest (`jest-expo`), `date-fns`.

## Global Constraints

Every task's requirements implicitly include these (copied verbatim from spec):

- **Color tokens only** — never hardcode hex. Amber is `themedColors(theme).momentumAmber`. Never alarm-red, no flame, no countdown number.
- **Copy voice** — no dashes (em, en, or hyphen-as-dash) in any user-facing string. Always offer-framed with a rest-out. Pools rotate so the user never sees the same line back-to-back.
- **Namespace** — warning notification identifiers use the `livra-mw-` prefix; engagement notifs keep `livra-bn-`. The master "disable reminders" path still cancels everything (both prefixes).
- **Gating** — no warnings scheduled when `getLivraRemindersEnabled()` is false OR OS notification permission is not `granted`. The in-app banner still shows regardless.
- **Exemptions** — warnings are exempt from the engagement planner's 3-consecutive-no-tap throttle and 2/day cap; governed only by the structural 1+1 and the one-push-per-day merge cap.
- **`weekly_target`** — may be null; `expectedInterval()` already defaults it to 3. Never assume non-null.
- **Daytime window** — a nudge fires within local `~9:00–20:00`, jittered (reuse `pickFireInWindow` from `behaviorNotifications.ts`). This window IS the quiet-time honoring; there is no separate quiet-hours system.
- **Predictive pre-scheduling (LOCKED)** — warning dates are computed from the last log and scheduled into the future even when the goal is currently on-track. Past-window nudges are simply skipped. No episode-ID state.
- **Tests** live in `tests/unit/*.test.ts(x)`. Run with `npm run test`.
- **Commit discipline** — `git add` ONLY the files for the current task. NEVER `git add -A` or `git add .` (the repo carries unrelated uncommitted WIP in `app/(tabs)/settings.tsx`, `app/_layout.tsx`'s appearance-screen removal, `app/settings/appearance.tsx`, and `.semgrep/` — do not touch or stage those except the specific `app/_layout.tsx` edit in Task 6, which must be staged alone with `git add app/_layout.tsx`).

---

## File Structure

- `lib/goalMomentum.ts` (modify) — add pure `momentumWarningDates(marks, today)` weakest-link helper.
- `lib/momentumWarningPlanner.ts` (create) — pure cross-goal merge: per-goal dates → ≤1 push/day descriptors.
- `lib/copy.ts` (modify) — add first-nudge / final-nudge / combined / banner copy pools + pure rotating selectors.
- `lib/notifications/livraScheduledOwnership.ts` (modify) — add `livra-mw-` prefix constant + `cancelLivraScheduledByPrefix`.
- `services/behaviorNotifications.ts` (modify) — export `pickFireInWindow`; narrow its internal cancels to `livra-bn-` only.
- `services/momentumWarningNotifications.ts` (create) — `reconcileMomentumWarnings(userId)` I/O lifecycle.
- `state/goalsSlice.ts` (modify) / `hooks/useCounters.ts` (modify) / `app/_layout.tsx` (modify) — wire reconcile into the two eval points.
- `lib/momentumPresenter.ts` (modify) — add pure `shouldShowMomentumBanner`.
- `lib/momentumBannerDismiss.ts` (create) — per-day dismiss flag (AsyncStorage).
- `components/ui/MomentumBanner.tsx` (create) — presentational amber strip.
- `app/(tabs)/focus.tsx` (modify) — mount the banner.
- `PRODUCT.md` (modify) — reconcile "the active goal's Momentum" wording to "per active goal".

---

## Task 1: Pure warning-dates engine helper

**Files:**
- Modify: `lib/goalMomentum.ts` (append after `momentumSnapshot`)
- Test: `tests/unit/momentumWarningDates.test.ts`

**Interfaces:**
- Consumes: existing `expectedInterval`, `atRiskGapFor`, `breakGapFor`, `markGapDays`, `cushionFraction`, `MarkMomentumInput` (already in this file); `addDays`, `parseISO`, `formatDate` from `./date`.
- Produces: `export type MomentumWarningDates = { atRiskDate: string; breakDate: string }` and `export function momentumWarningDates(marks: MarkMomentumInput[], today: string): MomentumWarningDates | null`.

**Semantics (LOCKED — do not re-derive):** Returns the **weakest-link** mark's dates: `atRiskDate = lastActivity + atRiskGap`, `breakDate = lastActivity + breakGap`. Weakest link = soonest `breakDate`, ties broken by soonest `atRiskDate`, then lowest cushion fraction. Returns `null` only when there are no marks, or no mark has a `last_activity_date` (never-logged goal has no run to protect). Dates may be in the future even when the goal is currently on-track — that is the predictive pre-scheduling intent; the planner/service skip past-window nudges later. (This overrides §6's looser "null when far from at-risk" wording; §3's predictive model governs.)

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/momentumWarningDates.test.ts
import { momentumWarningDates } from '../../lib/goalMomentum';

describe('momentumWarningDates', () => {
  it('returns null when there are no marks', () => {
    expect(momentumWarningDates([], '2026-06-19')).toBeNull();
  });

  it('returns null when no mark has been logged', () => {
    const marks = [{ id: 'a', weekly_target: 7, last_activity_date: null }];
    expect(momentumWarningDates(marks, '2026-06-19')).toBeNull();
  });

  it('daily mark: atRisk = last+2, break = last+3', () => {
    const marks = [{ id: 'a', weekly_target: 7, last_activity_date: '2026-06-17' }];
    expect(momentumWarningDates(marks, '2026-06-19')).toEqual({
      atRiskDate: '2026-06-19',
      breakDate: '2026-06-20',
    });
  });

  it('2x/week mark: atRisk = last+5, break = last+8', () => {
    const marks = [{ id: 'a', weekly_target: 2, last_activity_date: '2026-06-10' }];
    expect(momentumWarningDates(marks, '2026-06-19')).toEqual({
      atRiskDate: '2026-06-15',
      breakDate: '2026-06-18',
    });
  });

  it('defaults weekly_target null to 3/week (interval 2.33, atRiskGap 4, breakGap 6)', () => {
    const marks = [{ id: 'a', weekly_target: null, last_activity_date: '2026-06-10' }];
    expect(momentumWarningDates(marks, '2026-06-19')).toEqual({
      atRiskDate: '2026-06-14',
      breakDate: '2026-06-16',
    });
  });

  it('weakest link = soonest breakDate across marks', () => {
    const marks = [
      { id: 'slow', weekly_target: 2, last_activity_date: '2026-06-18' }, // break far out
      { id: 'fast', weekly_target: 7, last_activity_date: '2026-06-17' }, // break 2026-06-20
    ];
    expect(momentumWarningDates(marks, '2026-06-19')).toEqual({
      atRiskDate: '2026-06-19',
      breakDate: '2026-06-20',
    });
  });

  it('ignores never-logged marks when another mark has a run', () => {
    const marks = [
      { id: 'logged', weekly_target: 7, last_activity_date: '2026-06-17' },
      { id: 'fresh', weekly_target: 7, last_activity_date: null },
    ];
    expect(momentumWarningDates(marks, '2026-06-19')).toEqual({
      atRiskDate: '2026-06-19',
      breakDate: '2026-06-20',
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- momentumWarningDates`
Expected: FAIL with `momentumWarningDates is not a function` (or import error).

- [ ] **Step 3: Write minimal implementation**

In `lib/goalMomentum.ts`, change the top import to include the date helpers, then append the helper at the end of the file.

Change line 4 from:
```typescript
import { daysBetween } from './date';
```
to:
```typescript
import { daysBetween, addDays, parseISO, formatDate } from './date';
```

Append at end of file:
```typescript
export type MomentumWarningDates = { atRiskDate: string; breakDate: string };

/**
 * Weakest-link warning dates for a goal, from the last log of each mark.
 * atRiskDate = lastActivity + atRiskGap (first nudge); breakDate = lastActivity + breakGap.
 * Weakest link = soonest breakDate, ties by soonest atRiskDate, then lowest cushion fraction.
 * Null only when no marks or no mark has ever been logged. Dates may be in the future
 * (predictive pre-scheduling); callers skip past-window nudges.
 */
export function momentumWarningDates(
  marks: MarkMomentumInput[],
  today: string,
): MomentumWarningDates | null {
  type Cand = { atRiskDate: string; breakDate: string; cushion: number };
  const cands: Cand[] = [];
  for (const m of marks) {
    if (!m.last_activity_date) continue;
    const interval = expectedInterval(m.weekly_target);
    const atRiskGap = atRiskGapFor(interval);
    const breakGap = breakGapFor(interval);
    const last = parseISO(m.last_activity_date);
    const atRiskDate = formatDate(addDays(last, atRiskGap));
    const breakDate = formatDate(addDays(last, breakGap));
    const gap = markGapDays(m.last_activity_date, today) ?? 0;
    const cushion = cushionFraction(gap, atRiskGap, breakGap);
    cands.push({ atRiskDate, breakDate, cushion });
  }
  if (cands.length === 0) return null;
  cands.sort((a, b) => {
    if (a.breakDate !== b.breakDate) return a.breakDate < b.breakDate ? -1 : 1;
    if (a.atRiskDate !== b.atRiskDate) return a.atRiskDate < b.atRiskDate ? -1 : 1;
    return a.cushion - b.cushion;
  });
  const w = cands[0]!;
  return { atRiskDate: w.atRiskDate, breakDate: w.breakDate };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- momentumWarningDates`
Expected: PASS (7 tests).

- [ ] **Step 5: Type-check and commit**

Run: `npm run type-check`
Expected: no new errors.

```bash
git add lib/goalMomentum.ts tests/unit/momentumWarningDates.test.ts
git commit -m "feat(momentum): pure weakest-link warning-dates helper (Phase 1.3)"
```

---

## Task 2: Notification ownership namespace split

**Files:**
- Modify: `lib/notifications/livraScheduledOwnership.ts`
- Modify: `services/behaviorNotifications.ts` (export `pickFireInWindow`; narrow internal cancels)
- Modify: `tests/unit/behaviorNotificationsCopy.test.ts` (extend the existing jest mock)
- Test: `tests/unit/livraScheduledOwnership.test.ts`

**Interfaces:**
- Produces: `export const LIVRA_MOMENTUM_WARNING_ID_PREFIX = 'livra-mw-'` and `export async function cancelLivraScheduledByPrefix(prefix: string): Promise<number>` from `livraScheduledOwnership.ts`; `export function pickFireInWindow(...)` from `behaviorNotifications.ts` (signature unchanged from its current private form).
- Consumes: existing `cancelAllLivraScheduledNotifications` (unchanged — still cancels everything `livra`-prefixed, which covers `livra-mw-`).

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/livraScheduledOwnership.test.ts
import * as Notifications from 'expo-notifications';
import {
  LIVRA_MOMENTUM_WARNING_ID_PREFIX,
  cancelLivraScheduledByPrefix,
  cancelAllLivraScheduledNotifications,
} from '../../lib/notifications/livraScheduledOwnership';

jest.mock('expo-notifications');

const mockPending = (ids: string[]) =>
  (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue(
    ids.map((identifier) => ({ identifier, content: { data: {} } })),
  );

describe('namespace split', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (Notifications.cancelScheduledNotificationAsync as jest.Mock).mockResolvedValue(undefined);
  });

  it('exposes the momentum-warning prefix', () => {
    expect(LIVRA_MOMENTUM_WARNING_ID_PREFIX).toBe('livra-mw-');
  });

  it('cancelLivraScheduledByPrefix cancels only matching prefix', async () => {
    mockPending(['livra-bn-2026-06-19-win-0', 'livra-mw-2026-06-19-0']);
    const n = await cancelLivraScheduledByPrefix('livra-bn-');
    expect(n).toBe(1);
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith(
      'livra-bn-2026-06-19-win-0',
    );
    expect(Notifications.cancelScheduledNotificationAsync).not.toHaveBeenCalledWith(
      'livra-mw-2026-06-19-0',
    );
  });

  it('master cancelAll cancels both bn and mw', async () => {
    mockPending(['livra-bn-2026-06-19-win-0', 'livra-mw-2026-06-19-0']);
    const n = await cancelAllLivraScheduledNotifications();
    expect(n).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- livraScheduledOwnership`
Expected: FAIL (`LIVRA_MOMENTUM_WARNING_ID_PREFIX`/`cancelLivraScheduledByPrefix` undefined).

- [ ] **Step 3: Add the prefix + scoped cancel**

In `lib/notifications/livraScheduledOwnership.ts`, after line 15 (`export const LIVRA_BEHAVIOR_ID_PREFIX = 'livra-bn-';`) add:
```typescript
export const LIVRA_MOMENTUM_WARNING_ID_PREFIX = 'livra-mw-';
```

After the `cancelAllLivraScheduledNotifications` function (end of file) add:
```typescript
/** Cancels only scheduled notifications whose identifier starts with `prefix`. */
export async function cancelLivraScheduledByPrefix(prefix: string): Promise<number> {
  let cancelled = 0;
  try {
    const pending = await Notifications.getAllScheduledNotificationsAsync();
    for (const p of pending) {
      if (p.identifier.startsWith(prefix)) {
        await Notifications.cancelScheduledNotificationAsync(p.identifier);
        cancelled += 1;
      }
    }
  } catch (e) {
    logger.warn('[LivraNotif] cancel by prefix failed', e);
  }
  return cancelled;
}
```

- [ ] **Step 4: Export `pickFireInWindow` and narrow the engagement planner's cancels**

In `services/behaviorNotifications.ts`:

1. Add the scoped-cancel import. Change line 19 from:
```typescript
import { cancelAllLivraScheduledNotifications } from '../lib/notifications/livraScheduledOwnership';
```
to:
```typescript
import {
  cancelAllLivraScheduledNotifications,
  cancelLivraScheduledByPrefix,
} from '../lib/notifications/livraScheduledOwnership';
```

2. Export the window helper. Change `function pickFireInWindow(` (around line 295) to `export function pickFireInWindow(`.

3. Narrow the three cancels inside `scheduleBehaviorNotifications` (the no-tap-streak path, the no-marks path, and the pre-schedule cancel — currently `await cancelAllLivraScheduledNotifications();` at the lines inside `scheduleBehaviorNotifications`, around 460/466/473) to scoped:
```typescript
await cancelLivraScheduledByPrefix(BEHAVIOR_NOTIF_PREFIX);
```
Leave the deprecated `cancelBehaviorNotifications` shim (around line 435) calling `cancelAllLivraScheduledNotifications` unchanged.

- [ ] **Step 5: Update the existing copy test's mock**

In `tests/unit/behaviorNotificationsCopy.test.ts`, the `jest.mock` for `livraScheduledOwnership` (around line 23) currently provides `cancelAllLivraScheduledNotifications: jest.fn()`. Add the new export so the import resolves:
```typescript
  cancelAllLivraScheduledNotifications: jest.fn(),
  cancelLivraScheduledByPrefix: jest.fn(),
  LIVRA_BEHAVIOR_ID_PREFIX: 'livra-bn-',
  LIVRA_MOMENTUM_WARNING_ID_PREFIX: 'livra-mw-',
```
(Keep any existing keys; only add the missing ones.)

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm run test -- livraScheduledOwnership behaviorNotifications`
Expected: PASS (new ownership tests + existing behavior tests still green).

- [ ] **Step 7: Type-check and commit**

Run: `npm run type-check`
Expected: no new errors.

```bash
git add lib/notifications/livraScheduledOwnership.ts services/behaviorNotifications.ts tests/unit/livraScheduledOwnership.test.ts tests/unit/behaviorNotificationsCopy.test.ts
git commit -m "feat(momentum): livra-mw notification namespace + scoped cancel (Phase 1.3)"
```

---

## Task 3: Copy pools + rotating selectors

**Files:**
- Modify: `lib/copy.ts` (append a new section; `lib/copy.ts` stays pure — no RN/AsyncStorage imports)
- Test: `tests/unit/momentumWarningCopy.test.ts`

**Interfaces:**
- Produces (all from `lib/copy.ts`):
  - `export type MomentumCopy = { text: string; template: string }`
  - `export function getMomentumFirstNudgeCopy(goalTitle: string, lastTemplate?: string): MomentumCopy`
  - `export function getMomentumFinalNudgeCopy(goalTitle: string, lastTemplate?: string): MomentumCopy`
  - `export function getMomentumCombinedCopy(goalA: string, goalB: string, lastTemplate?: string): MomentumCopy`
  - `export function getMomentumBannerCopy(lastTemplate?: string): MomentumCopy`
- Each returns `{ text, template }`: `text` is the rendered string (titles substituted), `template` is the raw pool entry. Callers persist `template` and pass it back as `lastTemplate` so the same template is never returned twice in a row. (Mirrors the existing `getPostLogMessage` last-shown pattern.)

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/momentumWarningCopy.test.ts
import {
  getMomentumFirstNudgeCopy,
  getMomentumFinalNudgeCopy,
  getMomentumCombinedCopy,
  getMomentumBannerCopy,
} from '../../lib/copy';

const NO_DASH = /[—–]|(?:^|\s)-(?:\s|$)/; // em, en, or hyphen-as-dash

describe('momentum warning copy', () => {
  it('first nudge substitutes the goal title and carries the template', () => {
    const c = getMomentumFirstNudgeCopy('Run a 5k');
    expect(c.text).toContain('Run a 5k');
    expect(c.text).not.toContain('[Goal]');
    expect(c.template).toContain('[Goal]');
  });

  it('combined names both goals', () => {
    const c = getMomentumCombinedCopy('Run a 5k', 'Read daily');
    expect(c.text).toContain('Run a 5k');
    expect(c.text).toContain('Read daily');
  });

  it('banner has no goal placeholder', () => {
    const c = getMomentumBannerCopy();
    expect(c.text).not.toContain('[Goal]');
    expect(c.template).toBe(c.text);
  });

  it('never returns the lastTemplate back-to-back (when pool > 1)', () => {
    const first = getMomentumFinalNudgeCopy('X');
    for (let i = 0; i < 50; i++) {
      const next = getMomentumFinalNudgeCopy('X', first.template);
      expect(next.template).not.toBe(first.template);
    }
  });

  it('no dashes in any rendered line across many draws', () => {
    const draw = () => [
      getMomentumFirstNudgeCopy('Goal').text,
      getMomentumFinalNudgeCopy('Goal').text,
      getMomentumCombinedCopy('A', 'B').text,
      getMomentumBannerCopy().text,
    ];
    for (let i = 0; i < 40; i++) {
      for (const line of draw()) expect(line).not.toMatch(NO_DASH);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- momentumWarningCopy`
Expected: FAIL (selectors not exported).

- [ ] **Step 3: Append the copy section to `lib/copy.ts`**

```typescript
// ─── Momentum at-risk warning copy (Phase 1.3) ──────────────────────────────
// No dashes. Offer-framed with a rest-out. Rotate, never the same template twice in a row.

export interface MomentumCopy {
  /** Rendered, goal titles substituted. */
  text: string;
  /** Raw pool entry, used by the caller to avoid back-to-back repeats. */
  template: string;
}

const MOMENTUM_FIRST_NUDGE: string[] = [
  "[Goal] is slipping a little. One log keeps your momentum. Or rest easy if today's a rest day.",
  "Your momentum on [Goal] is dipping. A single log today and you're back on it.",
  "[Goal] could use a touch today. One mark keeps the momentum going. No pressure if you're resting.",
  'Momentum fades quietly. One log on [Goal] today and it holds.',
  "You've built real momentum on [Goal]. One log keeps it.",
  '[Goal] is asking for a little attention. One mark today, or rest if that\'s what today is.',
  'Still time to keep your momentum on [Goal]. One log is all it takes.',
  'Your run on [Goal] is worth protecting. A single mark today keeps it alive.',
  'Momentum on [Goal] is slipping. One small log brings it back. Resting is fine too.',
];

const MOMENTUM_FINAL_NUDGE: string[] = [
  "Last call on [Goal]'s momentum. One log today keeps it, or let it rest. Your call.",
  'Your momentum on [Goal] resets after today. One mark holds it, no guilt either way.',
  "[Goal]'s momentum resets after today. One log keeps it, or a fresh start tomorrow is just fine.",
  "Today's the day to keep your momentum on [Goal]. One log holds it, or rest if that's right for today.",
  'One log on [Goal] today keeps your momentum. After that it resets, and that is okay too.',
  'Your run on [Goal] holds with a single log today. Or let it rest and begin fresh tomorrow.',
  'Keep [Goal] going with one mark today. No mark is fine too, a fresh start always waits.',
  'Momentum on [Goal] is at its edge. One log today, or a clean slate tomorrow. Either is fine.',
];

const MOMENTUM_COMBINED: string[] = [
  'Two of your goals are slipping a little, [Goal A] and [Goal B]. One log each keeps them going, or rest easy if today\'s a rest day.',
  'Your momentum on [Goal A] and [Goal B] is dipping. A single log on each holds them. No pressure if you\'re resting.',
  '[Goal A] and [Goal B] could both use a touch today. One mark each keeps the momentum, or rest if that\'s today.',
  'A little attention keeps [Goal A] and [Goal B] going. One log each today, or rest easy.',
  'Momentum on [Goal A] and [Goal B] is slipping a little. One small log each brings them back. Resting is fine too.',
  'Still time to keep [Goal A] and [Goal B] going. One log on each is all it takes, or let today rest.',
];

const MOMENTUM_BANNER: string[] = [
  'Some of your momentum is slipping a little. A log or two keeps things going.',
  'A bit of your momentum is dipping. One log brings it back, or rest easy today.',
  'Momentum slipping a little. A single mark holds it, no pressure if you\'re resting.',
  'Some momentum could use a touch today. A log keeps it going, or let today be a rest day.',
  'A little of your momentum is fading. One log today and it holds.',
  'Your momentum is slipping a touch. A mark or two keeps it, resting is fine too.',
];

function rotatePick(pool: string[], lastTemplate?: string): string {
  const avail = pool.length > 1 ? pool.filter((t) => t !== lastTemplate) : pool;
  const source = avail.length > 0 ? avail : pool;
  return source[Math.floor(Math.random() * source.length)]!;
}

export function getMomentumFirstNudgeCopy(goalTitle: string, lastTemplate?: string): MomentumCopy {
  const template = rotatePick(MOMENTUM_FIRST_NUDGE, lastTemplate);
  return { template, text: template.replace('[Goal]', goalTitle) };
}

export function getMomentumFinalNudgeCopy(goalTitle: string, lastTemplate?: string): MomentumCopy {
  const template = rotatePick(MOMENTUM_FINAL_NUDGE, lastTemplate);
  return { template, text: template.replace('[Goal]', goalTitle) };
}

export function getMomentumCombinedCopy(goalA: string, goalB: string, lastTemplate?: string): MomentumCopy {
  const template = rotatePick(MOMENTUM_COMBINED, lastTemplate);
  return { template, text: template.replace('[Goal A]', goalA).replace('[Goal B]', goalB) };
}

export function getMomentumBannerCopy(lastTemplate?: string): MomentumCopy {
  const template = rotatePick(MOMENTUM_BANNER, lastTemplate);
  return { template, text: template };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- momentumWarningCopy`
Expected: PASS (5 tests). If the no-dash test flags a line, edit that line to remove the dash and re-run.

- [ ] **Step 5: Type-check and commit**

Run: `npm run type-check`
Expected: no new errors.

```bash
git add lib/copy.ts tests/unit/momentumWarningCopy.test.ts
git commit -m "feat(momentum): at-risk warning + banner copy pools (Phase 1.3)"
```

---

## Task 4: Pure cross-goal merge planner

**Files:**
- Create: `lib/momentumWarningPlanner.ts`
- Test: `tests/unit/momentumWarningPlanner.test.ts`

**Interfaces:**
- Consumes: `addDays`, `parseISO`, `formatDate` from `./date`.
- Produces:
  - `export type GoalWarningInput = { goalId: string; title: string; atRiskDate: string; breakDate: string }` (the `atRiskDate`/`breakDate` come straight from Task 1's `momentumWarningDates`, paired with the goal id/title by the service)
  - `export type WarningGoalRef = { goalId: string; title: string; isFinal: boolean }`
  - `export type PlannedWarning = { fireDay: string; goals: WarningGoalRef[] }`
  - `export function planMomentumWarnings(inputs: GoalWarningInput[], today: string): PlannedWarning[]`

**Semantics (LOCKED):** Each goal yields up to two candidate nudges: a **first** on `atRiskDate` and a **final** on `breakDate − 1`. When those collapse to the same day (daily marks), they become a single first-framed nudge. Candidates strictly before `today` are dropped. Candidates are grouped by fire-day; each fire-day is exactly one `PlannedWarning` (the ≤1-push-per-day cap). A day with two goals lists both (the service renders gentle combined copy). Result is sorted by `fireDay` ascending.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/momentumWarningPlanner.test.ts
import { planMomentumWarnings } from '../../lib/momentumWarningPlanner';

const today = '2026-06-19';

describe('planMomentumWarnings', () => {
  it('single goal, distinct first/final days → two single-goal warnings (1+1)', () => {
    const out = planMomentumWarnings(
      [{ goalId: 'g1', title: 'Run', atRiskDate: '2026-06-20', breakDate: '2026-06-23' }],
      today,
    );
    expect(out).toEqual([
      { fireDay: '2026-06-20', goals: [{ goalId: 'g1', title: 'Run', isFinal: false }] },
      { fireDay: '2026-06-22', goals: [{ goalId: 'g1', title: 'Run', isFinal: true }] },
    ]);
  });

  it('daily collapse: atRisk and break-1 same day → one first-framed nudge', () => {
    const out = planMomentumWarnings(
      [{ goalId: 'g1', title: 'Run', atRiskDate: '2026-06-20', breakDate: '2026-06-21' }],
      today,
    );
    expect(out).toEqual([
      { fireDay: '2026-06-20', goals: [{ goalId: 'g1', title: 'Run', isFinal: false }] },
    ]);
  });

  it('drops nudges whose day is strictly before today', () => {
    const out = planMomentumWarnings(
      [{ goalId: 'g1', title: 'Run', atRiskDate: '2026-06-17', breakDate: '2026-06-20' }],
      today,
    );
    // first (06-17) dropped; final = break-1 = 06-19 (today) kept
    expect(out).toEqual([
      { fireDay: '2026-06-19', goals: [{ goalId: 'g1', title: 'Run', isFinal: true }] },
    ]);
  });

  it('two goals same fire-day → one combined warning naming both', () => {
    const out = planMomentumWarnings(
      [
        { goalId: 'g1', title: 'Run', atRiskDate: '2026-06-20', breakDate: '2026-06-25' },
        { goalId: 'g2', title: 'Read', atRiskDate: '2026-06-20', breakDate: '2026-06-26' },
      ],
      today,
    );
    expect(out[0]).toEqual({
      fireDay: '2026-06-20',
      goals: [
        { goalId: 'g1', title: 'Run', isFinal: false },
        { goalId: 'g2', title: 'Read', isFinal: false },
      ],
    });
  });

  it('two goals different days → separate single-goal warnings, at most one per day', () => {
    const out = planMomentumWarnings(
      [
        { goalId: 'g1', title: 'Run', atRiskDate: '2026-06-20', breakDate: '2026-06-21' },
        { goalId: 'g2', title: 'Read', atRiskDate: '2026-06-22', breakDate: '2026-06-23' },
      ],
      today,
    );
    expect(out.map((w) => w.fireDay)).toEqual(['2026-06-20', '2026-06-22']);
    for (const w of out) expect(w.goals.length).toBe(1);
  });

  it('returns empty when every candidate is in the past', () => {
    const out = planMomentumWarnings(
      [{ goalId: 'g1', title: 'Run', atRiskDate: '2026-06-10', breakDate: '2026-06-12' }],
      today,
    );
    expect(out).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- momentumWarningPlanner`
Expected: FAIL (module not found).

- [ ] **Step 3: Write the implementation**

```typescript
// lib/momentumWarningPlanner.ts
// Pure cross-goal merge: per-goal warning dates → at most one push per calendar day.
import { addDays, parseISO, formatDate } from './date';

export type GoalWarningInput = {
  goalId: string;
  title: string;
  atRiskDate: string;
  breakDate: string;
};

export type WarningGoalRef = { goalId: string; title: string; isFinal: boolean };
export type PlannedWarning = { fireDay: string; goals: WarningGoalRef[] };

export function planMomentumWarnings(
  inputs: GoalWarningInput[],
  today: string,
): PlannedWarning[] {
  // goalId+day → ref (collapse same-goal duplicates; first nudge wins over final when same day)
  type Cand = { fireDay: string; goalId: string; title: string; isFinal: boolean };
  const cands: Cand[] = [];

  for (const g of inputs) {
    const finalDay = formatDate(addDays(parseISO(g.breakDate), -1));
    const firstDay = g.atRiskDate;
    // first nudge
    if (firstDay >= today) {
      cands.push({ fireDay: firstDay, goalId: g.goalId, title: g.title, isFinal: false });
    }
    // final nudge — skip if it collapses onto the first (daily); the first already covers it
    if (finalDay !== firstDay && finalDay >= today) {
      cands.push({ fireDay: finalDay, goalId: g.goalId, title: g.title, isFinal: true });
    }
  }

  const byDay = new Map<string, WarningGoalRef[]>();
  for (const c of cands) {
    const refs = byDay.get(c.fireDay) ?? [];
    if (!refs.some((r) => r.goalId === c.goalId)) {
      refs.push({ goalId: c.goalId, title: c.title, isFinal: c.isFinal });
    }
    byDay.set(c.fireDay, refs);
  }

  return [...byDay.keys()]
    .sort()
    .map((fireDay) => ({ fireDay, goals: byDay.get(fireDay)! }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- momentumWarningPlanner`
Expected: PASS (6 tests).

- [ ] **Step 5: Type-check and commit**

Run: `npm run type-check`
Expected: no new errors.

```bash
git add lib/momentumWarningPlanner.ts tests/unit/momentumWarningPlanner.test.ts
git commit -m "feat(momentum): pure cross-goal merge planner, <=1 push/day (Phase 1.3)"
```

---

## Task 5: Warning reconcile service

**Files:**
- Create: `services/momentumWarningNotifications.ts`
- Test: `tests/unit/momentumWarningNotifications.test.ts`

**Interfaces:**
- Consumes: `momentumWarningDates` (Task 1); `planMomentumWarnings`, `GoalWarningInput`, `PlannedWarning` (Task 4); copy selectors (Task 3); `LIVRA_MOMENTUM_WARNING_ID_PREFIX`, `cancelLivraScheduledByPrefix` (Task 2); `pickFireInWindow` (Task 2); `getLivraRemindersEnabled` (`lib/notifications/livraReminderPrefs`); `useGoalsStore` (`state/goalsSlice`); `useMarksStore` (`state/countersSlice`); `formatDate`, `parseISO` from `lib/date`; `getAppDate` from `lib/appDate`.
- Produces: `export async function reconcileMomentumWarnings(userId: string | undefined): Promise<void>`.

**Behavior:** No-op when `userId` falsy, reminders disabled, or OS permission ≠ granted. Otherwise: read active goals + their linked (non-deleted) marks; per goal compute `momentumWarningDates`; pair non-null results with goal id/title into `GoalWarningInput[]`; run `planMomentumWarnings`; cancel the previous `livra-mw-` set; for each `PlannedWarning`, pick a `9:00–20:00` jittered fire time on its `fireDay` (skip if `pickFireInWindow` returns null — past window today), build copy (single first/final or combined), and schedule with identifier `livra-mw-<fireDay>-<idx>`. Persist last-used copy templates in AsyncStorage to avoid back-to-back repeats.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/momentumWarningNotifications.test.ts
import * as Notifications from 'expo-notifications';
import { reconcileMomentumWarnings } from '../../services/momentumWarningNotifications';
import { useGoalsStore } from '../../state/goalsSlice';
import { useMarksStore } from '../../state/countersSlice';
import { cancelLivraScheduledByPrefix } from '../../lib/notifications/livraScheduledOwnership';

jest.mock('expo-notifications');
jest.mock('../../lib/notifications/livraScheduledOwnership', () => ({
  LIVRA_MOMENTUM_WARNING_ID_PREFIX: 'livra-mw-',
  cancelLivraScheduledByPrefix: jest.fn().mockResolvedValue(0),
}));
jest.mock('../../lib/notifications/livraReminderPrefs', () => ({
  getLivraRemindersEnabled: jest.fn().mockResolvedValue(true),
}));
// Fix "today" so date math is deterministic.
jest.mock('../../lib/appDate', () => ({ getAppDate: () => new Date('2026-06-19T10:00:00') }));

const setStores = (goals: any[], marks: any[]) => {
  useGoalsStore.setState({ goals } as any);
  useMarksStore.setState({ marks } as any);
};

describe('reconcileMomentumWarnings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
    (Notifications.scheduleNotificationAsync as jest.Mock).mockResolvedValue('id');
  });

  it('no-ops when userId is missing', async () => {
    setStores([], []);
    await reconcileMomentumWarnings(undefined);
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('no-ops when OS permission is not granted', async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'denied' });
    setStores(
      [{ id: 'g1', title: 'Run', status: 'active', linked_mark_ids: ['m1'] }],
      [{ id: 'm1', weekly_target: 7, last_activity_date: '2026-06-17', deleted_at: null }],
    );
    await reconcileMomentumWarnings('u1');
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('cancels then schedules the future nudge for a slipping goal', async () => {
    setStores(
      [{ id: 'g1', title: 'Run', status: 'active', linked_mark_ids: ['m1'] }],
      // daily mark logged 06-17 → first/final collapse on 06-19 (today, window open at 10:00)
      [{ id: 'm1', weekly_target: 7, last_activity_date: '2026-06-17', deleted_at: null }],
    );
    await reconcileMomentumWarnings('u1');
    expect(cancelLivraScheduledByPrefix).toHaveBeenCalledWith('livra-mw-');
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    const arg = (Notifications.scheduleNotificationAsync as jest.Mock).mock.calls[0][0];
    expect(arg.identifier).toMatch(/^livra-mw-2026-06-19-/);
    expect(arg.content.data.livraOwner).toBe(true);
    expect(arg.content.body).toContain('Run');
  });

  it('schedules nothing (only cancels) when no goal has a logged mark (recovery/fresh)', async () => {
    setStores(
      [{ id: 'g1', title: 'Run', status: 'active', linked_mark_ids: ['m1'] }],
      [{ id: 'm1', weekly_target: 7, last_activity_date: null, deleted_at: null }],
    );
    await reconcileMomentumWarnings('u1');
    expect(cancelLivraScheduledByPrefix).toHaveBeenCalledWith('livra-mw-');
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('ignores non-active goals (they drop out and get cancelled)', async () => {
    setStores(
      [{ id: 'g1', title: 'Run', status: 'completed', linked_mark_ids: ['m1'] }],
      [{ id: 'm1', weekly_target: 7, last_activity_date: '2026-06-17', deleted_at: null }],
    );
    await reconcileMomentumWarnings('u1');
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- momentumWarningNotifications`
Expected: FAIL (module not found).

- [ ] **Step 3: Write the implementation**

```typescript
// services/momentumWarningNotifications.ts
// Reconciles the livra-mw- at-risk warning notification set on each Momentum eval.
// Predictive pre-scheduling: dates computed from the last log; past-window nudges skipped.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { logger } from '../lib/utils/logger';
import { getAppDate } from '../lib/appDate';
import { formatDate, parseISO } from '../lib/date';
import { momentumWarningDates } from '../lib/goalMomentum';
import type { MarkMomentumInput } from '../lib/goalMomentum';
import {
  planMomentumWarnings,
  type GoalWarningInput,
} from '../lib/momentumWarningPlanner';
import {
  getMomentumFirstNudgeCopy,
  getMomentumFinalNudgeCopy,
  getMomentumCombinedCopy,
} from '../lib/copy';
import {
  LIVRA_MOMENTUM_WARNING_ID_PREFIX,
  cancelLivraScheduledByPrefix,
} from '../lib/notifications/livraScheduledOwnership';
import { pickFireInWindow } from './behaviorNotifications';
import { getLivraRemindersEnabled } from '../lib/notifications/livraReminderPrefs';
import { useGoalsStore } from '../state/goalsSlice';
import { useMarksStore } from '../state/countersSlice';

const LAST_TEMPLATES_KEY = 'livra_mw_last_templates_v1';
type LastTemplates = { first?: string; final?: string; combined?: string };

async function loadLastTemplates(): Promise<LastTemplates> {
  try {
    const raw = await AsyncStorage.getItem(LAST_TEMPLATES_KEY);
    return raw ? (JSON.parse(raw) as LastTemplates) : {};
  } catch {
    return {};
  }
}

async function saveLastTemplates(t: LastTemplates): Promise<void> {
  try {
    await AsyncStorage.setItem(LAST_TEMPLATES_KEY, JSON.stringify(t));
  } catch (e) {
    logger.warn('[MomentumWarn] persist templates failed', e);
  }
}

export async function reconcileMomentumWarnings(userId: string | undefined): Promise<void> {
  if (!userId) return;

  if (!(await getLivraRemindersEnabled())) {
    await cancelLivraScheduledByPrefix(LIVRA_MOMENTUM_WARNING_ID_PREFIX);
    return;
  }
  const { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') return;

  const now = getAppDate();
  const today = formatDate(now);

  const goals = useGoalsStore.getState().goals.filter((g) => g.status === 'active');
  const allMarks = useMarksStore.getState().marks;

  const inputs: GoalWarningInput[] = [];
  for (const g of goals) {
    const ids = new Set(g.linked_mark_ids ?? []);
    const goalMarks: MarkMomentumInput[] = allMarks
      .filter((m: any) => !m.deleted_at && ids.has(m.id))
      .map((m: any) => ({
        id: m.id,
        weekly_target: m.weekly_target,
        last_activity_date: m.last_activity_date,
      }));
    const dates = momentumWarningDates(goalMarks, today);
    if (dates) {
      inputs.push({ goalId: g.id, title: g.title, atRiskDate: dates.atRiskDate, breakDate: dates.breakDate });
    }
  }

  const planned = planMomentumWarnings(inputs, today);

  // Always cancel the previous set first (recovery / replace / drop).
  await cancelLivraScheduledByPrefix(LIVRA_MOMENTUM_WARNING_ID_PREFIX);
  if (planned.length === 0) return;

  const last = await loadLastTemplates();
  let idx = 0;

  for (const w of planned) {
    const dayBase = parseISO(w.fireDay); // local midnight of the fire day
    const fireAt = pickFireInWindow(now, dayBase, 9, 0, 20, 0, 60 * 1000);
    if (!fireAt) continue; // today but window already passed

    let title: string;
    let body: string;
    if (w.goals.length >= 2) {
      const c = getMomentumCombinedCopy(w.goals[0]!.title, w.goals[1]!.title, last.combined);
      last.combined = c.template;
      title = 'Momentum';
      body = c.text;
    } else {
      const ref = w.goals[0]!;
      if (ref.isFinal) {
        const c = getMomentumFinalNudgeCopy(ref.title, last.final);
        last.final = c.template;
        title = ref.title;
        body = c.text;
      } else {
        const c = getMomentumFirstNudgeCopy(ref.title, last.first);
        last.first = c.template;
        title = ref.title;
        body = c.text;
      }
    }

    const identifier = `${LIVRA_MOMENTUM_WARNING_ID_PREFIX}${w.fireDay}-${idx++}`;
    try {
      await Notifications.scheduleNotificationAsync({
        identifier,
        content: {
          title,
          body,
          data: { type: 'momentum_warning', livraOwner: true, planDay: w.fireDay },
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: fireAt },
      });
    } catch (e) {
      logger.error('[MomentumWarn] schedule failed', e);
    }
  }

  await saveLastTemplates(last);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- momentumWarningNotifications`
Expected: PASS (5 tests).

- [ ] **Step 5: Type-check and commit**

Run: `npm run type-check`
Expected: no new errors.

```bash
git add services/momentumWarningNotifications.ts tests/unit/momentumWarningNotifications.test.ts
git commit -m "feat(momentum): reconcile service for livra-mw at-risk warnings (Phase 1.3)"
```

---

## Task 6: Wire reconcile into the two eval points

**Files:**
- Modify: `hooks/useCounters.ts` (after `creditMarkToGoals` resolves — the log eval point)
- Modify: `app/_layout.tsx` (after `evaluateActiveGoalsMomentum` on foreground — the foreground eval point)
- Test: `tests/unit/momentumWarningWiring.test.ts`

**Interfaces:**
- Consumes: `reconcileMomentumWarnings` (Task 5).

**Note:** Both edits are fire-and-forget (`.catch(() => {})`); reconcile must never block logging or foreground. In `app/_layout.tsx`, **stage this file alone** (`git add app/_layout.tsx`) — it carries unrelated WIP; only add the one new line described here, and do not revert/alter the existing modifications already in the working tree.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/momentumWarningWiring.test.ts
// Guards that the log eval path triggers a warning reconcile.
import { reconcileMomentumWarnings } from '../../services/momentumWarningNotifications';

jest.mock('../../services/momentumWarningNotifications', () => ({
  reconcileMomentumWarnings: jest.fn().mockResolvedValue(undefined),
}));

describe('warning reconcile wiring (smoke)', () => {
  it('reconcileMomentumWarnings is importable and callable', async () => {
    await reconcileMomentumWarnings('u1');
    expect(reconcileMomentumWarnings).toHaveBeenCalledWith('u1');
  });
});
```

(A full integration test of `useCounters` increment → reconcile would require the full SQLite/store harness; the existing `tests/unit/momentumIntegration.test.ts` covers the credit path. This smoke test plus the explicit wiring edits below are sufficient; verify the wiring by reading the diff.)

- [ ] **Step 2: Run test to verify it passes (import resolves)**

Run: `npm run test -- momentumWarningWiring`
Expected: PASS.

- [ ] **Step 3: Wire the log eval point in `hooks/useCounters.ts`**

Find the fire-and-forget credit block (around line 351):
```typescript
        // Fire-and-forget: credit linked goals. Never blocks mark logging.
        setTimeout(() => {
          import('../state/goalsSlice').then(({ useGoalsStore }) => {
            useGoalsStore.getState().creditMarkToGoals(markId).catch(() => {});
          });
        }, 0);
```
Replace with (reconcile after the credit + momentum eval completes):
```typescript
        // Fire-and-forget: credit linked goals, then reconcile at-risk warnings. Never blocks logging.
        setTimeout(() => {
          import('../state/goalsSlice').then(({ useGoalsStore }) => {
            useGoalsStore
              .getState()
              .creditMarkToGoals(markId)
              .then(() =>
                import('../services/momentumWarningNotifications').then(({ reconcileMomentumWarnings }) =>
                  reconcileMomentumWarnings(userId),
                ),
              )
              .catch(() => {});
          });
        }, 0);
```
(`userId` is already in scope at this call site — confirm by reading the surrounding function signature; it is the same `userId` used by `awardMarkXP(userId, ...)` a few lines above.)

- [ ] **Step 4: Wire the foreground eval point in `app/_layout.tsx`**

Find (around line 243):
```typescript
        useGoalsStore.getState().checkAllGoalExpiry();
        void useGoalsStore.getState().evaluateActiveGoalsMomentum();
```
Replace the second line with an eval-then-reconcile chain:
```typescript
        useGoalsStore.getState().checkAllGoalExpiry();
        void useGoalsStore
          .getState()
          .evaluateActiveGoalsMomentum()
          .then(() =>
            import('../services/momentumWarningNotifications').then(({ reconcileMomentumWarnings }) =>
              reconcileMomentumWarnings(user?.id),
            ),
          )
          .catch(() => {});
```
(`user` is in scope in this effect — it is the same `user?.id` used by `scheduleContextualDailyNotification(user.id)` two lines above. Use the dynamic `import('../services/...')` form to avoid pulling the service into the root bundle eagerly and to dodge any import cycle.)

- [ ] **Step 5: Verify and commit (stage files individually)**

Run: `npm run type-check && npm run test -- momentumWarningWiring`
Expected: no new type errors; smoke test PASS.

Read the diff to confirm `app/_layout.tsx` contains ONLY the eval-then-reconcile change plus the pre-existing WIP (do not stage anything you did not intend):
```bash
git add hooks/useCounters.ts
git add app/_layout.tsx
git commit -m "feat(momentum): reconcile at-risk warnings on log + foreground eval (Phase 1.3)"
```

---

## Task 7: Banner presenter + per-day dismiss store

**Files:**
- Modify: `lib/momentumPresenter.ts` (append pure `shouldShowMomentumBanner`)
- Create: `lib/momentumBannerDismiss.ts` (AsyncStorage per-day flag)
- Test: `tests/unit/momentumBanner.test.ts`

**Interfaces:**
- Produces:
  - `export function shouldShowMomentumBanner(snapshots: Record<string, MomentumSnapshot>, dismissedDate: string | null, today: string): boolean` (in `lib/momentumPresenter.ts`)
  - `export async function getMomentumBannerDismissedDate(): Promise<string | null>` and `export async function setMomentumBannerDismissedDate(date: string): Promise<void>` (in `lib/momentumBannerDismiss.ts`)

**Semantics:** Banner shows when any cached snapshot is `slipping` AND it was not already dismissed today. Auto-resolves: if nothing is slipping, returns false regardless of the dismiss flag.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/momentumBanner.test.ts
import { shouldShowMomentumBanner } from '../../lib/momentumPresenter';
import {
  getMomentumBannerDismissedDate,
  setMomentumBannerDismissedDate,
} from '../../lib/momentumBannerDismiss';
import AsyncStorage from '@react-native-async-storage/async-storage';

const slipping = { state: 'slipping', days: 4, cushionRemaining: 0.5, slippingMarkId: 'm1' } as const;
const onTrack = { state: 'on_track', days: 4, cushionRemaining: null, slippingMarkId: null } as const;

describe('shouldShowMomentumBanner', () => {
  it('shows when any snapshot is slipping and not dismissed today', () => {
    expect(shouldShowMomentumBanner({ g1: slipping }, null, '2026-06-19')).toBe(true);
  });
  it('hides when dismissed today', () => {
    expect(shouldShowMomentumBanner({ g1: slipping }, '2026-06-19', '2026-06-19')).toBe(false);
  });
  it('returns next day after dismissal', () => {
    expect(shouldShowMomentumBanner({ g1: slipping }, '2026-06-18', '2026-06-19')).toBe(true);
  });
  it('auto-resolves: hidden when nothing slipping even if not dismissed', () => {
    expect(shouldShowMomentumBanner({ g1: onTrack }, null, '2026-06-19')).toBe(false);
  });
  it('hidden with no snapshots', () => {
    expect(shouldShowMomentumBanner({}, null, '2026-06-19')).toBe(false);
  });
});

describe('momentum banner dismiss store', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });
  it('round-trips the dismissed date', async () => {
    expect(await getMomentumBannerDismissedDate()).toBeNull();
    await setMomentumBannerDismissedDate('2026-06-19');
    expect(await getMomentumBannerDismissedDate()).toBe('2026-06-19');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- momentumBanner`
Expected: FAIL (functions/module not found).

- [ ] **Step 3: Implement the presenter predicate**

Append to `lib/momentumPresenter.ts`:
```typescript
/** Banner shows when any active goal's cached snapshot is slipping and not dismissed today. */
export function shouldShowMomentumBanner(
  snapshots: Record<string, MomentumSnapshot>,
  dismissedDate: string | null,
  today: string,
): boolean {
  const anySlipping = Object.values(snapshots).some((s) => s?.state === 'slipping');
  if (!anySlipping) return false;
  return dismissedDate !== today;
}
```

- [ ] **Step 4: Implement the dismiss store**

```typescript
// lib/momentumBannerDismiss.ts
// Per-day "dismiss the at-risk banner" flag. Holds the last local date the user dismissed.
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'livra_momentum_banner_dismissed_v1';

export async function getMomentumBannerDismissedDate(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export async function setMomentumBannerDismissedDate(date: string): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, date);
  } catch {
    /* best effort */
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test -- momentumBanner`
Expected: PASS (6 tests).

- [ ] **Step 6: Type-check and commit**

Run: `npm run type-check`
Expected: no new errors.

```bash
git add lib/momentumPresenter.ts lib/momentumBannerDismiss.ts tests/unit/momentumBanner.test.ts
git commit -m "feat(momentum): banner show-predicate + per-day dismiss store (Phase 1.3)"
```

---

## Task 8: Banner component + focus-screen mount

**Files:**
- Create: `components/ui/MomentumBanner.tsx`
- Modify: `app/(tabs)/focus.tsx` (mount the banner at the top of the scroll content)
- Test: `tests/unit/momentumBannerComponent.test.tsx`

**Interfaces:**
- Consumes: `shouldShowMomentumBanner` (Task 7), `getMomentumBannerDismissedDate`/`setMomentumBannerDismissedDate` (Task 7), `getMomentumBannerCopy` (Task 3), `useMomentumStore` (already imported in `focus.tsx`), `themedColors`/`fonts`/`fontSize`/`spacing`/`borderRadius` from `theme/tokens`, `applyOpacity` (already imported in `focus.tsx`).
- Produces: `export function MomentumBanner(props: { text: string; onDismiss: () => void }): JSX.Element` — presentational only.

**Visual:** Warm amber strip. Tinted `momentumAmber` background (match `GoalMomentum`'s opacity treatment: `applyOpacity(c.momentumAmber, theme === 'dark' ? 0.16 : 0.12)`), amber text, a dismiss affordance (testID `momentum-banner-dismiss`). No flame, no countdown, never alarm-red.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/momentumBannerComponent.test.tsx
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { MomentumBanner } from '../../components/ui/MomentumBanner';

jest.mock('../../state/uiSlice', () => ({ useEffectiveTheme: () => 'light' }));

describe('MomentumBanner', () => {
  it('renders the copy text', () => {
    const { getByText } = render(<MomentumBanner text="Some momentum is slipping." onDismiss={() => {}} />);
    expect(getByText('Some momentum is slipping.')).toBeTruthy();
  });

  it('calls onDismiss when the dismiss control is pressed', () => {
    const onDismiss = jest.fn();
    const { getByTestId } = render(<MomentumBanner text="x" onDismiss={onDismiss} />);
    fireEvent.press(getByTestId('momentum-banner-dismiss'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- momentumBannerComponent`
Expected: FAIL (component not found).

- [ ] **Step 3: Implement the component**

```tsx
// components/ui/MomentumBanner.tsx
// Calm amber at-risk strip for the focus screen. Generic (no goal names),
// dismissable for the day. Never alarm-red, no flame, no countdown.
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

import { fonts, fontSize, spacing, borderRadius, themedColors } from '../../theme/tokens';
import { useEffectiveTheme } from '../../state/uiSlice';
import { applyOpacity } from '../../src/components/icons/color';

export function MomentumBanner({ text, onDismiss }: { text: string; onDismiss: () => void }) {
  const theme = useEffectiveTheme();
  const c = themedColors(theme);
  return (
    <View
      testID="momentum-banner"
      style={[
        styles.wrap,
        {
          backgroundColor: applyOpacity(c.momentumAmber, theme === 'dark' ? 0.16 : 0.12),
          borderColor: applyOpacity(c.momentumAmber, theme === 'dark' ? 0.24 : 0.18),
        },
      ]}
    >
      <Text style={[styles.text, { color: c.momentumAmber }]}>{text}</Text>
      <TouchableOpacity
        testID="momentum-banner-dismiss"
        onPress={onDismiss}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        accessibilityLabel="Dismiss"
      >
        <Text style={[styles.dismiss, { color: c.momentumAmber }]}>Dismiss</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    borderRadius: borderRadius.card,
    borderWidth: 0.5,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
  },
  text: {
    flex: 1,
    fontFamily: fonts.sansMedium,
    fontSize: fontSize.sm,
  },
  dismiss: {
    fontFamily: fonts.sansMedium,
    fontSize: fontSize.sm,
  },
});
```

(If `borderRadius` is not an export of `theme/tokens`, confirm its source — `focus.tsx` already imports `borderRadius`; match that exact import path.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- momentumBannerComponent`
Expected: PASS (2 tests).

- [ ] **Step 5: Mount the banner in `app/(tabs)/focus.tsx`**

1. Add imports near the other component imports (after the `GoalMomentum` import on line 30):
```typescript
import { MomentumBanner } from '../../components/ui/MomentumBanner';
import { shouldShowMomentumBanner } from '../../lib/momentumPresenter';
import {
  getMomentumBannerDismissedDate,
  setMomentumBannerDismissedDate,
} from '../../lib/momentumBannerDismiss';
import { getMomentumBannerCopy } from '../../lib/copy';
```

2. Add banner state + load + handler. After the existing `const momentumSnapshots = useMomentumStore((s) => s.snapshots);` (line 95), add:
```typescript
  const [bannerDismissedDate, setBannerDismissedDate] = useState<string | null>(null);
  useEffect(() => {
    void getMomentumBannerDismissedDate().then(setBannerDismissedDate);
  }, [todayStr]);

  const bannerVisible = useMemo(
    () => shouldShowMomentumBanner(momentumSnapshots, bannerDismissedDate, todayStr),
    [momentumSnapshots, bannerDismissedDate, todayStr],
  );

  const bannerLastTemplateRef = useRef<string | undefined>(undefined);
  const bannerText = useMemo(() => {
    if (!bannerVisible) return '';
    const c = getMomentumBannerCopy(bannerLastTemplateRef.current);
    bannerLastTemplateRef.current = c.template;
    return c.text;
  }, [bannerVisible, todayStr]);

  const handleDismissBanner = useCallback(() => {
    setBannerDismissedDate(todayStr);
    void setMomentumBannerDismissedDate(todayStr);
  }, [todayStr]);
```
(Ensure `useState`, `useRef`, `useMemo`, `useCallback`, `useEffect` are imported from `react` at the top — `useState`/`useEffect`/`useMemo`/`useCallback` already are; add `useRef` if missing.)

3. Render the banner as the first child inside the `ScrollView` content, immediately after the opening `<ScrollView ...>` (just before the `{/* ── Greeting ── */}` block around line 345):
```tsx
        {bannerVisible && bannerText !== '' && (
          <MomentumBanner text={bannerText} onDismiss={handleDismissBanner} />
        )}
```

- [ ] **Step 6: Verify the full suite + type-check**

Run: `npm run test -- momentumBannerComponent && npm run type-check && npm run lint`
Expected: tests PASS; no new type errors; lint neutral (no new violations — the repo has a known pre-existing `react-hooks` backlog; do not introduce new ones).

- [ ] **Step 7: Commit**

```bash
git add components/ui/MomentumBanner.tsx app/(tabs)/focus.tsx tests/unit/momentumBannerComponent.test.tsx
git commit -m "feat(momentum): in-app at-risk banner on focus screen (Phase 1.3)"
```

---

## Task 9: PRODUCT.md reconciliation

**Files:**
- Modify: `PRODUCT.md`

**Why a task:** §11 of the spec commits us to reconciling the singular "the active goal's Momentum" framing with the app's up-to-2-active-goals reality and the per-card UI. This is a reviewable doc change with no code.

- [ ] **Step 1: Locate the wording**

Run:
```bash
grep -n "active goal's forgiving run\|the active goal" PRODUCT.md
```
The primary target is the Momentum definition line (currently "**Momentum** — the active goal's forgiving run: ..."). The line numbers in the spec (95/448) have drifted; rely on the grep.

- [ ] **Step 2: Edit the Momentum definition**

Change the Momentum definition so it reads as **per active goal** rather than implying a single global Momentum. For example, change:
```
- **Momentum** — the active goal's forgiving run: a day count earned by honoring your marks'
```
to:
```
- **Momentum** — each active goal's forgiving run (up to two active at once): a day count earned by honoring your marks'
```
Keep the rest of the sentence intact. Do not alter the "one sanctioned exception" lines (they already cover the offer-framed Momentum warning; confirm by reading them that the cross-goal merged push and the in-app banner are consistent with "forgiving, no guilt" — no edit needed if so).

- [ ] **Step 3: Verify and commit**

Run:
```bash
grep -n "each active goal's forgiving run" PRODUCT.md
```
Expected: the new line is present.

```bash
git add PRODUCT.md
git commit -m "docs(product): Momentum is per active goal, not one global (Phase 1.3)"
```

---

## Self-Review

**Spec coverage:**
- §2 scope / per-goal → Tasks 1, 5 (per active goal), 9 (PRODUCT.md).
- §3 predictive pre-scheduling, daytime window, past-window skip → Tasks 1, 5 (`pickFireInWindow`, null skip).
- §3.1 structural 1+1 → Tasks 4 (first+final, collapse), 5 (cancel+replace each eval).
- §4 cross-goal merge ≤1/day → Task 4.
- §5 in-app banner (generic, dismissable, auto-resolve, rotation) → Tasks 7, 8, 3.
- §6 architecture (new service, pure engine helper, namespace split, exemptions) → Tasks 1, 2, 5. Exemptions: the warning service never consults the engagement throttle/cap (it lives in a separate file) — satisfied by construction.
- §6.1 snapshot vs dates → Task 1 (dates) + Task 7 (banner uses `slipping` state).
- §7 copy pools → Task 3.
- §8 settings/disable gating → Task 5 (`getLivraRemindersEnabled` + permission); master disable cancels `livra-mw-` via unchanged `cancelAllLivraScheduledNotifications` (Task 2 test asserts).
- §9 edge cases: non-active goals drop out → Task 5 (active filter + cancel) test; `weekly_target` null → Task 1 test; permission revoked → Task 5 no-op + banner; day boundary → foreground reconcile (Task 6).
- §10 testing → each task's tests.
- §11 PRODUCT.md → Task 9.
- §12 out of scope (1.4 banking, 1.5 settings labels) → not in plan. Correct.

**Placeholder scan:** No TBD/TODO; every code step shows full code; every test shows full assertions.

**Type consistency:** `MomentumWarningDates {atRiskDate,breakDate}` (Task 1) → `GoalWarningInput` (Task 4) → consumed in Task 5. `PlannedWarning {fireDay, goals: WarningGoalRef[]}` (Task 4) consumed in Task 5. `MomentumCopy {text, template}` (Task 3) consumed in Task 5 and Task 8. `cancelLivraScheduledByPrefix`/`LIVRA_MOMENTUM_WARNING_ID_PREFIX`/`pickFireInWindow` (Task 2) consumed in Task 5. `shouldShowMomentumBanner` (Task 7) consumed in Task 8. Names are consistent across tasks.

---

## Execution Handoff

Per the project build pipeline (ROADMAP.md): one branch `feat/momentum-at-risk-warning` off `docs/product-direction`, built via subagent-driven-development with per-task review, then a final whole-branch opus review, then finishing-a-development-branch merged no-ff back into `docs/product-direction`. Archive the existing `.superpowers/sdd/progress.md` (the 1.2 ledger) to `progress-1.2-representation.md` before starting a fresh SDD ledger.
