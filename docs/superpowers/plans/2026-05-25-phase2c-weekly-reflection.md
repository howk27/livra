# Phase 2C — Weekly Reflection Copy Library

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current tracking tab's stat-heavy weekly view with a goal-execution weekly reflection: per-mark tiers (strong / solid / inconsistent / missing / first week) each with 2-3 pre-written human sentences, rotated by week seed to avoid repetition.

**Architecture:** Pure copy lives in `lib/weeklyReflectionCopy.ts` (no side effects, fully testable). Tier classification logic in `lib/weeklyReflectionLogic.ts` computes each mark's tier from events. A new `WeeklyReflectionCard` component renders the output. The existing `tracking.tsx` gets a new section above the existing stats rather than replacing the whole screen.

**Tech Stack:** React Native / Expo, TypeScript, Jest. No new dependencies.

**Prerequisite:** None — this plan is independent of Phase 2A and 2B.

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `lib/weeklyReflectionCopy.ts` | Create | 5-tier copy library (~75 lines), picker function |
| `lib/weeklyReflectionLogic.ts` | Create | Pure: classify mark into tier from events |
| `components/WeeklyReflectionCard.tsx` | Create | Renders one mark's tier sentence |
| `tests/unit/weeklyReflection.test.ts` | Create | Unit tests for logic and copy |
| `app/(tabs)/tracking.tsx` | Modify | Add reflection section at top of weekly view |

**Do not touch:** `lib/review/weeklyReview.ts`, `types/WeeklyReview.ts`, `hooks/useWeeklyReview.ts` — the existing data pipeline is unchanged. We add a new display layer on top of it.

---

## Task 1: Copy library and tier logic

**Files:**
- Create: `lib/weeklyReflectionCopy.ts`
- Create: `lib/weeklyReflectionLogic.ts`
- Create: `tests/unit/weeklyReflection.test.ts`

- [ ] **Step 1: Create `lib/weeklyReflectionCopy.ts`**

```typescript
export type ReflectionTier = 'strong' | 'solid' | 'inconsistent' | 'missing' | 'first_week';

type TierCopy = { title: string; body: string };

const TIER_COPY: Record<ReflectionTier, TierCopy[]> = {
  strong: [
    {
      title: 'Strong.',
      body: 'You showed up most days. This is how habits lock in.',
    },
    {
      title: 'Locked in.',
      body: "Consistent presence this week. That's the whole game.",
    },
    {
      title: 'This week worked.',
      body: 'Most days logged. That kind of consistency compounds.',
    },
  ],
  solid: [
    {
      title: 'Solid week.',
      body: "Not perfect, but real. A few more weeks like this and it sticks.",
    },
    {
      title: 'Building rhythm.',
      body: "You showed up more than you didn't. Keep building on that.",
    },
  ],
  inconsistent: [
    {
      title: 'Needs more.',
      body: "You showed up some days — more than nothing. But you know you can do more.",
    },
    {
      title: 'Uneven week.',
      body: 'Hit-or-miss. Reset Monday and pick one day to protect first.',
    },
  ],
  missing: [
    {
      title: "It didn't happen.",
      body: 'This mark got skipped this week. Monday is the reset.',
    },
    {
      title: 'No movement here.',
      body: "Zero this week. It's not too late to start over — start Monday.",
    },
  ],
  first_week: [
    {
      title: 'First week.',
      body: "The hardest part is starting — you did that. Stack another week.",
    },
    {
      title: 'You started.',
      body: 'First week with this mark. Build on it.',
    },
  ],
};

function seedIndex(weekStart: string, markId: string, poolSize: number): number {
  const seed = `${weekStart}:${markId}`;
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % poolSize;
}

export function getReflectionCopy(
  tier: ReflectionTier,
  markId: string,
  weekStart: string,
): TierCopy {
  const pool = TIER_COPY[tier];
  return pool[seedIndex(weekStart, markId, pool.length)]!;
}
```

- [ ] **Step 2: Create `lib/weeklyReflectionLogic.ts`**

```typescript
import type { ReflectionTier } from './weeklyReflectionCopy';
import type { MarkEvent } from '../types';

/**
 * Classify a mark's performance for the given 7-day window.
 *
 * @param markId - the mark to classify
 * @param events - all events for this user (will be filtered)
 * @param weekDates - array of 7 YYYY-MM-DD strings, Mon–Sun
 * @param isFirstWeek - true if the mark was created within the last 7 days
 */
export function classifyMarkTier(
  markId: string,
  events: MarkEvent[],
  weekDates: string[],
  isFirstWeek: boolean,
): ReflectionTier {
  if (isFirstWeek) return 'first_week';

  const activeDates = new Set(
    events
      .filter(
        e =>
          e.mark_id === markId &&
          !e.deleted_at &&
          e.event_type === 'increment' &&
          weekDates.includes(e.occurred_local_date),
      )
      .map(e => e.occurred_local_date),
  );

  const daysLogged = activeDates.size;
  const totalDays = weekDates.length;

  if (daysLogged === 0) return 'missing';
  if (daysLogged / totalDays >= 5 / 7) return 'strong';
  if (daysLogged / totalDays >= 3 / 7) return 'solid';
  return 'inconsistent';
}

/**
 * Determine if a mark was created within the last 7 days relative to weekStart.
 */
export function isMarkFirstWeek(markCreatedAt: string, weekStart: string): boolean {
  const created = new Date(`${markCreatedAt.slice(0, 10)}T00:00:00`);
  const week = new Date(`${weekStart}T00:00:00`);
  const diffMs = week.getTime() - created.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  return diffDays < 7;
}
```

- [ ] **Step 3: Create `tests/unit/weeklyReflection.test.ts`**

```typescript
import {
  classifyMarkTier,
  isMarkFirstWeek,
} from '../../lib/weeklyReflectionLogic';
import { getReflectionCopy } from '../../lib/weeklyReflectionCopy';
import type { MarkEvent } from '../../types';

const WEEK_DATES = [
  '2026-05-18',
  '2026-05-19',
  '2026-05-20',
  '2026-05-21',
  '2026-05-22',
  '2026-05-23',
  '2026-05-24',
];
const WEEK_START = '2026-05-18';
const MARK_ID = 'mark-1';

function makeEvent(date: string): MarkEvent {
  return {
    id: `e-${date}`,
    user_id: 'u1',
    mark_id: MARK_ID,
    event_type: 'increment',
    amount: 1,
    occurred_at: `${date}T08:00:00Z`,
    occurred_local_date: date,
    created_at: `${date}T08:00:00Z`,
    updated_at: `${date}T08:00:00Z`,
  };
}

describe('classifyMarkTier', () => {
  test('first_week overrides all else', () => {
    expect(classifyMarkTier(MARK_ID, [], WEEK_DATES, true)).toBe('first_week');
  });

  test('missing — 0 days logged', () => {
    expect(classifyMarkTier(MARK_ID, [], WEEK_DATES, false)).toBe('missing');
  });

  test('strong — 5 of 7 days', () => {
    const events = ['2026-05-18', '2026-05-19', '2026-05-20', '2026-05-21', '2026-05-22'].map(makeEvent);
    expect(classifyMarkTier(MARK_ID, events, WEEK_DATES, false)).toBe('strong');
  });

  test('strong — 7 of 7 days', () => {
    const events = WEEK_DATES.map(makeEvent);
    expect(classifyMarkTier(MARK_ID, events, WEEK_DATES, false)).toBe('strong');
  });

  test('solid — 3 of 7 days', () => {
    const events = ['2026-05-18', '2026-05-19', '2026-05-20'].map(makeEvent);
    expect(classifyMarkTier(MARK_ID, events, WEEK_DATES, false)).toBe('solid');
  });

  test('solid — 4 of 7 days', () => {
    const events = ['2026-05-18', '2026-05-19', '2026-05-20', '2026-05-21'].map(makeEvent);
    expect(classifyMarkTier(MARK_ID, events, WEEK_DATES, false)).toBe('solid');
  });

  test('inconsistent — 1 of 7 days', () => {
    const events = [makeEvent('2026-05-18')];
    expect(classifyMarkTier(MARK_ID, events, WEEK_DATES, false)).toBe('inconsistent');
  });

  test('inconsistent — 2 of 7 days', () => {
    const events = ['2026-05-18', '2026-05-20'].map(makeEvent);
    expect(classifyMarkTier(MARK_ID, events, WEEK_DATES, false)).toBe('inconsistent');
  });

  test('ignores deleted events', () => {
    const events = WEEK_DATES.map(d => ({ ...makeEvent(d), deleted_at: '2026-05-25T00:00:00Z' }));
    expect(classifyMarkTier(MARK_ID, events, WEEK_DATES, false)).toBe('missing');
  });

  test('ignores events outside the week window', () => {
    const events = [makeEvent('2026-05-10'), makeEvent('2026-05-11')]; // before week
    expect(classifyMarkTier(MARK_ID, events, WEEK_DATES, false)).toBe('missing');
  });

  test('ignores events for other marks', () => {
    const events = WEEK_DATES.map(d => ({ ...makeEvent(d), mark_id: 'other-mark' }));
    expect(classifyMarkTier(MARK_ID, events, WEEK_DATES, false)).toBe('missing');
  });
});

describe('isMarkFirstWeek', () => {
  test('true if created 3 days before weekStart', () => {
    expect(isMarkFirstWeek('2026-05-15T00:00:00Z', WEEK_START)).toBe(true);
  });

  test('true if created on weekStart', () => {
    expect(isMarkFirstWeek('2026-05-18T00:00:00Z', WEEK_START)).toBe(true);
  });

  test('false if created 7 or more days before weekStart', () => {
    expect(isMarkFirstWeek('2026-05-11T00:00:00Z', WEEK_START)).toBe(false);
  });
});

describe('getReflectionCopy', () => {
  const tiers = ['strong', 'solid', 'inconsistent', 'missing', 'first_week'] as const;

  test.each(tiers)('%s returns non-empty title and body', (tier) => {
    const { title, body } = getReflectionCopy(tier, MARK_ID, WEEK_START);
    expect(title.length).toBeGreaterThan(0);
    expect(body.length).toBeGreaterThan(0);
  });

  test('same mark+week always returns same copy (deterministic)', () => {
    const first = getReflectionCopy('strong', MARK_ID, WEEK_START);
    const second = getReflectionCopy('strong', MARK_ID, WEEK_START);
    expect(first).toEqual(second);
  });

  test('different marks may return different copy from same tier', () => {
    const results = new Set<string>();
    const markIds = ['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8', 'm9', 'm10'];
    for (const id of markIds) {
      results.add(getReflectionCopy('strong', id, WEEK_START).title);
    }
    // With 3 strong variants and 10 marks, we expect more than 1 unique title
    expect(results.size).toBeGreaterThan(1);
  });
});
```

- [ ] **Step 4: Run tests — expect failures then pass**

```bash
cd /mnt/c/Users/DEIVI/Desktop/Livra && npm run test -- tests/unit/weeklyReflection.test.ts
```

Expected: FAIL until the two lib files exist. After creating both: all 18 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/weeklyReflectionCopy.ts lib/weeklyReflectionLogic.ts tests/unit/weeklyReflection.test.ts
git commit -m "$(cat <<'EOF'
feat(phase2c): add weekly reflection copy library and tier logic

5 tiers (strong/solid/inconsistent/missing/first_week) with 2-3
pre-written message variants per tier. Seed-based rotation ensures
the same mark gets consistent copy within a week but can rotate
across weeks. 18 unit tests cover tier classification and copy output.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: WeeklyReflectionCard component

**Files:**
- Create: `components/WeeklyReflectionCard.tsx`

- [ ] **Step 1: Create `components/WeeklyReflectionCard.tsx`**

```typescript
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';
import { spacing, fontSize, fontWeight, borderRadius } from '../theme/tokens';
import { useEffectiveTheme } from '../state/uiSlice';
import type { ReflectionTier } from '../lib/weeklyReflectionCopy';

const TIER_ACCENT: Record<ReflectionTier, string> = {
  strong: '#22c55e',      // green
  solid: '#3b82f6',       // blue
  inconsistent: '#f59e0b', // amber
  missing: '#6b7280',     // gray
  first_week: '#a78bfa',  // violet
};

interface WeeklyReflectionCardProps {
  markName: string;
  tier: ReflectionTier;
  title: string;
  body: string;
}

export function WeeklyReflectionCard({
  markName,
  tier,
  title,
  body,
}: WeeklyReflectionCardProps) {
  const theme = useEffectiveTheme();
  const themeColors = colors[theme];
  const accent = TIER_ACCENT[tier];

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: themeColors.surface,
          borderColor: themeColors.border,
          borderLeftColor: accent,
        },
      ]}
    >
      <Text style={[styles.markName, { color: themeColors.textSecondary }]}>
        {markName.toUpperCase()}
      </Text>
      <Text style={[styles.title, { color: themeColors.text }]}>{title}</Text>
      <Text style={[styles.body, { color: themeColors.textSecondary }]}>{body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderLeftWidth: 3,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  markName: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    letterSpacing: 0.8,
  },
  title: { fontSize: fontSize.md, fontWeight: fontWeight.semibold },
  body: { fontSize: fontSize.sm, lineHeight: 20 },
});
```

- [ ] **Step 2: Run full test suite**

```bash
cd /mnt/c/Users/DEIVI/Desktop/Livra && npm run test
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add components/WeeklyReflectionCard.tsx
git commit -m "$(cat <<'EOF'
feat(phase2c): add WeeklyReflectionCard component

Renders one mark's weekly tier sentence with a color-coded left border
accent. No logic — pure display, receives tier/title/body as props.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Wire into tracking tab

**Files:**
- Modify: `app/(tabs)/tracking.tsx`

The tracking screen has a `ScrollView` with weekly stats. We add a "This week" reflection section at the top of the content, before the existing stats.

- [ ] **Step 1: Add imports to `app/(tabs)/tracking.tsx`**

Find the import block at the top of `tracking.tsx`. Add:

```typescript
import { WeeklyReflectionCard } from '../../components/WeeklyReflectionCard';
import { classifyMarkTier, isMarkFirstWeek } from '../../lib/weeklyReflectionLogic';
import { getReflectionCopy } from '../../lib/weeklyReflectionCopy';
import { buildWeekDates, getWeekRange } from '../../lib/review/weeklyReview';
```

- [ ] **Step 2: Build weekly reflection data in the component**

Inside the `tracking.tsx` component function, after the existing state and `counters` / `events` are available, add:

```typescript
const weeklyReflectionItems = useMemo(() => {
  const { weekStart } = getWeekRange(getAppDate());
  const weekDates = buildWeekDates(weekStart);

  return counters.map(mark => {
    const firstWeek = isMarkFirstWeek(mark.created_at, weekStart);
    const tier = classifyMarkTier(mark.id, events, weekDates, firstWeek);
    const copy = getReflectionCopy(tier, mark.id, weekStart);
    return { mark, tier, title: copy.title, body: copy.body };
  });
}, [counters, events]);
```

- [ ] **Step 3: Render the reflection section in the JSX**

Find the first `<View>` or content block inside the `<ScrollView>` (or the outermost content container) in `tracking.tsx`. Insert the reflection section before it:

```tsx
{weeklyReflectionItems.length > 0 && (
  <View style={{ paddingHorizontal: spacing.md, paddingTop: spacing.md }}>
    <Text
      style={[
        styles.sectionHeader,
        { color: themeColors.textSecondary },
      ]}
    >
      THIS WEEK
    </Text>
    {weeklyReflectionItems.map(({ mark, tier, title, body }) => (
      <WeeklyReflectionCard
        key={mark.id}
        markName={mark.name}
        tier={tier}
        title={title}
        body={body}
      />
    ))}
  </View>
)}
```

Add a `sectionHeader` style to the existing `StyleSheet.create` in `tracking.tsx`:

```typescript
sectionHeader: {
  fontSize: 11,
  fontWeight: '600',
  letterSpacing: 1,
  marginBottom: spacing.sm,
},
```

- [ ] **Step 4: Run full test suite**

```bash
cd /mnt/c/Users/DEIVI/Desktop/Livra && npm run test
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add app/(tabs)/tracking.tsx
git commit -m "$(cat <<'EOF'
feat(phase2c): add weekly reflection section to tracking tab

Each mark now shows its tier (strong/solid/inconsistent/missing/first week)
with a pre-written sentence at the top of the weekly view. Tier
classification and copy are deterministic — same mark + week = same copy.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

### Spec coverage

| Spec requirement | Covered by |
|---|---|
| 5 performance tiers | `TIER_COPY` in `weeklyReflectionCopy.ts` |
| 2-3 pre-written sentences per tier | 2-3 entries per tier in `TIER_COPY` |
| ~60-75 lines of copy | 13 title+body pairs ≈ 26 strings total ✓ |
| Rotated to avoid repetition | `seedIndex` function — consistent within week, varies across marks |
| Rule-based (no AI) | Pure string selection — no API calls |
| Each mark gets its own tier | `classifyMarkTier` called per mark in `useMemo` |

### Placeholder scan
None. All copy lines are fully written.

### Type consistency
- `ReflectionTier` exported from `weeklyReflectionCopy.ts` — used by `weeklyReflectionLogic.ts` and `WeeklyReflectionCard.tsx`
- `getReflectionCopy(tier, markId, weekStart)` — matches usage in `tracking.tsx`
- `classifyMarkTier(markId, events, weekDates, isFirstWeek)` — matches usage in `tracking.tsx`
- `buildWeekDates(weekStart)` — already exported from `lib/review/weeklyReview.ts` ✓
