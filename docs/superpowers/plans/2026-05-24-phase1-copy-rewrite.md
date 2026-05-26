# Phase 1 — Copy & Tone Rewrite

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite all user-facing copy to match Livra's goal-execution voice — warm, direct, believes in the user, never uses streaks as leverage, never guilt.

**Architecture:** Pure copy changes only. No structural changes, no logic changes, no navigation changes. All string edits are confined to constants and helper functions. Tests cover the notification copy function (the only non-trivial logic), which is exported for testability.

**Tech Stack:** React Native / Expo, TypeScript, Jest (`npm run test`), `lib/copy.ts` (home copy), `services/behaviorNotifications.ts` (push notification copy).

**Voice rule (must be enforced throughout):**
> Warm, direct, believes in the user. Never guilt. Never streaks as leverage. Always goal-anchored.

**Banned phrases (may not appear in any notification copy):**
- "Keep your streak alive"
- "Don't lose the streak"
- "streak-day momentum going" (any form)
- "Save today's progress" (implies failure)
- Any streak count used as a threat or warning

---

## File Map

| File | Change |
|---|---|
| `services/behaviorNotifications.ts` | Export `buildCopy`; rewrite all 4 notification type copy |
| `tests/unit/behaviorNotificationsCopy.test.ts` | Create — tests for banned phrases and structural correctness |
| `app/onboarding.tsx` | Rewrite `FRAME_LINES` constant |
| `app/paywall.tsx` | Rewrite subtitle text and `PRO_FEATURES` descriptions |
| `app/(tabs)/home.tsx` | Rewrite empty state title + message |

**Do not touch:** `lib/copy.ts` (already aligned), `tests/unit/copy.test.ts` (all passing, no changes needed), any navigation, data, or component logic.

---

## Task 1: Export `buildCopy` and write failing tests

**Files:**
- Modify: `services/behaviorNotifications.ts` (add `export` keyword only — no copy changes yet)
- Create: `tests/unit/behaviorNotificationsCopy.test.ts`

- [ ] **Step 1: Add `export` to `buildCopy` in `services/behaviorNotifications.ts`**

Find line 218 (the function declaration) and change:

```typescript
function buildCopy(
```

to:

```typescript
export function buildCopy(
```

That is the only change in this step.

- [ ] **Step 2: Create `tests/unit/behaviorNotificationsCopy.test.ts` with failing tests**

```typescript
import { buildCopy } from '../../services/behaviorNotifications';
import type { DayProgressSnapshot } from '../../services/behaviorNotifications';

function snapshot(overrides: Partial<DayProgressSnapshot> = {}): DayProgressSnapshot {
  return {
    todayStr: '2026-05-24',
    activeMarkCount: 3,
    completedCount: 1,
    incompleteCount: 2,
    incompleteNames: ['Workout', 'Deep Work'],
    anyStreakAtRisk: false,
    maxCurrentStreak: 5,
    ...overrides,
  };
}

const BANNED_PHRASES = [
  'streak alive',
  'lose the streak',
  'streak-day momentum',
  'momentum going',
  'Save today',
];

function assertNoBannedPhrases(text: string) {
  for (const phrase of BANNED_PHRASES) {
    expect(text.toLowerCase()).not.toContain(phrase.toLowerCase());
  }
}

describe('buildCopy — structural correctness', () => {
  const types = ['momentum', 'midday', 'end_of_day', 'win'] as const;

  test.each(types)('%s returns non-empty title and body', (type) => {
    const { title, body } = buildCopy(type, snapshot());
    expect(typeof title).toBe('string');
    expect(title.length).toBeGreaterThan(0);
    expect(typeof body).toBe('string');
    expect(body.length).toBeGreaterThan(0);
  });
});

describe('buildCopy — no streak-threat language', () => {
  const types = ['momentum', 'midday', 'end_of_day', 'win'] as const;
  const snapshots = [
    snapshot(),
    snapshot({ anyStreakAtRisk: true, maxCurrentStreak: 7 }),
    snapshot({ completedCount: 0, incompleteCount: 3 }),
    snapshot({ completedCount: 3, incompleteCount: 0 }),
  ];

  for (const s of snapshots) {
    test.each(types)(`%s with streak=${s.maxCurrentStreak} has no banned phrases`, (type) => {
      const { title, body } = buildCopy(type, s);
      assertNoBannedPhrases(title);
      assertNoBannedPhrases(body);
    });
  }
});

describe('buildCopy — win type', () => {
  test('all done — mentions all marks complete', () => {
    const { body } = buildCopy('win', snapshot({ completedCount: 3, incompleteCount: 0 }));
    expect(body).toContain('3');
  });

  test('not all done — mentions remaining count', () => {
    const { body } = buildCopy('win', snapshot({ completedCount: 2, incompleteCount: 1 }));
    expect(body).toContain('2');
  });
});

describe('buildCopy — momentum type', () => {
  test('single incomplete mark uses mark name in title', () => {
    const { title } = buildCopy('momentum', snapshot({
      completedCount: 2,
      incompleteCount: 1,
      incompleteNames: ['Workout'],
    }));
    expect(title).toBe('Workout');
  });

  test('all incomplete — body references total count', () => {
    const { body } = buildCopy('momentum', snapshot({
      completedCount: 0,
      incompleteCount: 3,
      incompleteNames: ['Workout', 'Deep Work', 'Sleep'],
    }));
    expect(body).toContain('3');
  });
});
```

- [ ] **Step 3: Run tests — expect failures**

```bash
cd /mnt/c/Users/DEIVI/Desktop/Livra && npm run test -- tests/unit/behaviorNotificationsCopy.test.ts
```

Expected: tests fail because `buildCopy` is not yet exported and copy still has banned phrases.

---

## Task 2: Rewrite `buildCopy` in `services/behaviorNotifications.ts`

**Files:**
- Modify: `services/behaviorNotifications.ts:218-288`

- [ ] **Step 1: Replace the entire `buildCopy` function body**

Replace the existing `buildCopy` function (lines 218–288) with:

```typescript
export function buildCopy(
  type: BehaviorNotifType,
  p: DayProgressSnapshot,
): { title: string; body: string } {
  const rem = p.incompleteCount;
  const done = p.completedCount;
  const total = p.activeMarkCount;

  switch (type) {
    case 'momentum': {
      // Single incomplete mark — name it directly (personal, goal-anchored)
      if (rem === 1 && p.incompleteNames[0]) {
        return {
          title: p.incompleteNames[0],
          body: "You said you'd do this today. There's still time.",
        };
      }
      const titles = ['Your marks are waiting', 'Time to show up', "Today's on you"];
      const t = titles[Math.floor(Math.random() * titles.length)]!;
      const body =
        rem === total
          ? total === 1
            ? 'You have one mark today. One tap is all it takes.'
            : `You have ${total} marks today. Pick the easiest one first.`
          : `${rem} marks still open. Even one moves the day forward.`;
      return { title: t, body };
    }

    case 'midday': {
      const titles = ['Halfway through', 'Still time today', 'Pick up where you left off'];
      const t = titles[Math.floor(Math.random() * titles.length)]!;
      const body =
        done > 0
          ? `${done} of ${total} done. Finish the rest this afternoon.`
          : `${total} marks waiting. A few minutes now is all it takes.`;
      return { title: t, body };
    }

    case 'end_of_day': {
      const titles = ['Before the day ends', 'One more thing', "Today isn't done yet"];
      const t = titles[Math.floor(Math.random() * titles.length)]!;
      const body =
        rem === 1
          ? '1 mark left. Close it out before midnight.'
          : `${rem} marks still open. A few taps now beat starting over tomorrow.`;
      return { title: t, body };
    }

    case 'win': {
      const allDoneHere = done >= total;
      const titles = allDoneHere
        ? ['You showed up today', "That's the work", 'Full day — done']
        : ['Strong progress today', 'Almost there', "You're close"];
      const t = titles[Math.floor(Math.random() * titles.length)]!;
      const body = allDoneHere
        ? total <= 1
          ? 'Every mark for today is done. See you tomorrow.'
          : `All ${total} marks complete. That's what showing up looks like.`
        : rem === 1
          ? `1 mark left — you're ${done} of ${total}. Finish the set.`
          : `${done} of ${total} done. Close it out and make today a full win.`;
      return { title: t, body };
    }
  }
}
```

- [ ] **Step 2: Run tests — expect pass**

```bash
cd /mnt/c/Users/DEIVI/Desktop/Livra && npm run test -- tests/unit/behaviorNotificationsCopy.test.ts
```

Expected output: all tests PASS.

- [ ] **Step 3: Run full test suite — expect no regressions**

```bash
cd /mnt/c/Users/DEIVI/Desktop/Livra && npm run test
```

Expected: all tests pass (copy.test.ts, streaks.test.ts, etc. unchanged).

- [ ] **Step 4: Commit**

```bash
git add services/behaviorNotifications.ts tests/unit/behaviorNotificationsCopy.test.ts
git commit -m "$(cat <<'EOF'
feat(phase1): rewrite notification copy — remove streak-threat language

Replaces all streak-as-leverage copy in push notification buildCopy()
with warm, goal-anchored messages. Single-mark case now names the mark
directly ("Workout" as title) for a more personal nudge.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Rewrite onboarding frame copy

**Files:**
- Modify: `app/onboarding.tsx:50-55`

- [ ] **Step 1: Replace `FRAME_LINES`**

Find and replace the `FRAME_LINES` constant:

**Old:**
```typescript
const FRAME_LINES = [
  'Most people quit by day 4.',
  'You probably will too.',
  'But if you come back on day 5...',
  '...something starts to change.',
];
```

**New:**
```typescript
const FRAME_LINES = [
  'Most people have a graveyard of abandoned goals.',
  'Not because they gave up.',
  'Because they tried to do everything at once.',
  'Livra is one goal at a time. Until it\'s done.',
];
```

- [ ] **Step 2: Run full test suite — no regressions**

```bash
cd /mnt/c/Users/DEIVI/Desktop/Livra && npm run test
```

Expected: all tests pass (no tests cover this constant).

- [ ] **Step 3: Commit**

```bash
git add app/onboarding.tsx
git commit -m "$(cat <<'EOF'
feat(phase1): reframe onboarding copy for goal-execution positioning

Replaces the day-4 streak framing with the product's core value prop:
one goal at a time, until it's done. Removes "you probably will too"
which contradicted the voice rule of believing in the user.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Rewrite paywall copy

**Files:**
- Modify: `app/paywall.tsx:38-49` (PRO_FEATURES array)
- Modify: `app/paywall.tsx:1035-1037` (subtitle text in JSX)

- [ ] **Step 1: Replace `PRO_FEATURES`**

Find and replace the `PRO_FEATURES` constant:

**Old:**
```typescript
const PRO_FEATURES = [
  {
    ion: 'infinite-outline',
    title: 'Unlimited Marks',
    description: 'Track every milestone without artificial caps.',
  },
  {
    ion: 'bar-chart-outline',
    title: 'CSV Export',
    description: 'Export your history for analysis anytime.',
  },
];
```

**New:**
```typescript
const PRO_FEATURES = [
  {
    ion: 'infinite-outline',
    title: 'Unlimited Marks',
    description: 'Every mark, every goal. No ceiling on what you can build.',
  },
  {
    ion: 'bar-chart-outline',
    title: 'CSV Export',
    description: 'Your history is yours. Export it whenever you want.',
  },
];
```

- [ ] **Step 2: Replace subtitle text in JSX**

Find in `app/paywall.tsx` (~line 1036):

```tsx
          <Text style={[styles.subtitle, { color: themeColors.textSecondary }]}>
            Unlock unlimited tracking potential
          </Text>
```

Replace with:

```tsx
          <Text style={[styles.subtitle, { color: themeColors.textSecondary }]}>
            More goals. More marks. No limits.
          </Text>
```

- [ ] **Step 3: Run full test suite**

```bash
cd /mnt/c/Users/DEIVI/Desktop/Livra && npm run test
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add app/paywall.tsx
git commit -m "$(cat <<'EOF'
feat(phase1): rewrite paywall copy for goal-execution positioning

Removes "tracking potential" framing (counter-app language) and
updates PRO_FEATURES descriptions to reflect goal-execution value,
not milestone tracking.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Rewrite home screen empty state

**Files:**
- Modify: `app/(tabs)/home.tsx:1134-1145`

- [ ] **Step 1: Replace empty state strings**

Find in `app/(tabs)/home.tsx` (~line 1134):

```tsx
          <EmptyState
            title={loading ? "Loading marks" : "Start Your Journey"}
            message={loading ? "Please wait while we load your marks..." : "Create your first mark to start tracking your progress and building momentum!"}
            iconElement={
```

Replace with:

```tsx
          <EmptyState
            title={loading ? "Loading marks" : "Add your first mark."}
            message={loading ? "Please wait..." : "Marks are the daily actions that move your goal forward. Pick something you've been putting off and start there."}
            iconElement={
```

- [ ] **Step 2: Run full test suite**

```bash
cd /mnt/c/Users/DEIVI/Desktop/Livra && npm run test
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add app/(tabs)/home.tsx
git commit -m "$(cat <<'EOF'
feat(phase1): rewrite home empty state for goal-execution framing

Replaces journey/momentum/tracking language with goal-execution
framing: marks move goals forward, not progress bars.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

### Spec coverage

| Spec requirement | Covered by |
|---|---|
| Rewrite all notification copy in human voice | Task 2 |
| Never guilt, never streaks as leverage | Task 2 (tests enforce this) |
| Warm, direct, believes in the user | All tasks |
| Onboarding: goal-execution positioning | Task 3 |
| Paywall: goal-execution copy | Task 4 |
| No structural or logic changes | All tasks (copy-only) |
| No App Store listing changes until Phase 2 | Not in this plan (correct) |

### Gaps checked
- `lib/copy.ts` — already aligned, all tests pass, no changes needed ✓
- `services/notificationService.ts` — no user-facing copy, no changes needed ✓
- `app/(tabs)/tracking.tsx` — copy functions (`pickConsistencyEncouragement`, `streakMotivationLine`) are already honest/direct, no banned phrases ✓
- `lib/suggestedCounters.ts` — category labels only, no voice-rule violations ✓
- Auth screens — functional error messages only, no tone violations ✓
- Settings screen — functional labels only, no tone violations ✓

### Placeholder scan
None. All steps contain complete code.

### Type consistency
`buildCopy` signature unchanged: `(type: BehaviorNotifType, p: DayProgressSnapshot) => { title: string; body: string }`. All callers in `planCandidates` unaffected.
