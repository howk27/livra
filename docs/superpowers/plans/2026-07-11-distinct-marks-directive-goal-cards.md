# Distinct Marks + Directive Goal Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the AI goal package from generating overlapping marks (Run + Steps), and make each Focus goal card lead with a time-feasible "Today: <mark> · N of M this week" hero step.

**Architecture:** Part A is prompt + client-validation only (no data model change): a distinctness rule in the ai-goal-generation Edge Function prompt, plus a conservative icon→effort-category collapse inside `validateAIGoalPackage`. Part B adds a pure selection module `lib/nextStep.ts` (time-affinity gating + most-behind pick), `timeAffinity` metadata on `MARK_LIBRARY`, a new `GoalHeroStep` component, and wires it into the goal card in `app/(tabs)/focus.tsx`.

**Tech Stack:** React Native + Expo, TypeScript strict, Jest (jest-expo), Zustand state already in place. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-07-11-distinct-marks-directive-goal-cards-design.md`
**Dispatcher conditions (2026-07-11, decisions.md):** commits separable from other work; architect sign-off on `lib/nextStep.ts` + collapse map; critic review of card-state copy + Momentum-visibly-moves check before merge; Edge Function change verified against the deployed function, not code alone.

---

### Task 1: Overlap collapse in `validateAIGoalPackage`

**Files:**
- Modify: `lib/ai/goalGeneration.ts` (after the `AI_ICON_TO_MARK_ID` block, and inside `validateAIGoalPackage`)
- Test: `tests/unit/goalGenerationOverlap.test.ts` (new)

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/goalGenerationOverlap.test.ts
import { validateAIGoalPackage } from '../../lib/ai/goalGeneration';

const base = { goalTitle: 'Get fit', timeframeWeeks: 12, confidence: 'high' as const };
const mark = (name: string, icon: string) => ({ name, icon, frequency: 3, why: 'because' });

describe('validateAIGoalPackage overlap collapse', () => {
  it('collapses gym+steps to the first movement mark', () => {
    const pkg = validateAIGoalPackage({ ...base, marks: [mark('Run', 'gym'), mark('Steps', 'steps'), mark('Sleep', 'sleep')] });
    expect(pkg?.marks.map((m) => m.name)).toEqual(['Run', 'Sleep']);
  });

  it('collapses gratitude+journaling and focus+study', () => {
    const pkg = validateAIGoalPackage({ ...base, marks: [mark('Gratitude', 'gratitude'), mark('Journal', 'journaling'), mark('Study', 'study')] });
    expect(pkg?.marks.map((m) => m.name)).toEqual(['Gratitude', 'Study']);
  });

  it('leaves distinct efforts untouched', () => {
    const pkg = validateAIGoalPackage({ ...base, marks: [mark('Run', 'gym'), mark('Read', 'reading'), mark('Water', 'water')] });
    expect(pkg?.marks).toHaveLength(3);
  });

  it('never collapses a package below 1 mark', () => {
    const pkg = validateAIGoalPackage({ ...base, marks: [mark('Run', 'gym'), mark('Steps', 'steps')] });
    expect(pkg?.marks.map((m) => m.name)).toEqual(['Run']);
  });

  it('does not collapse marks whose icon was repaired to the fallback', () => {
    // 'focus' is FALLBACK_ICON: a repaired junk icon must not knock out a genuine deep-work mark
    const pkg = validateAIGoalPackage({ ...base, marks: [mark('Deep work', 'focus'), mark('Weird', 'not-an-icon')] });
    expect(pkg?.marks).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest tests/unit/goalGenerationOverlap.test.ts`
Expected: FAIL — collapse assertions get 3 marks where 2 expected (no collapse exists yet).

- [ ] **Step 3: Implement the collapse**

In `lib/ai/goalGeneration.ts`, after `AI_ICON_TO_MARK_ID`:

```ts
/**
 * Effort-category collapse (spec 2026-07-11): two marks one single activity
 * satisfies must not coexist. Conservative pairs only; icons not listed are
 * always kept. Applied in validateAIGoalPackage — first mark per category wins.
 */
export const AI_ICON_EFFORT_CATEGORY: Partial<Record<ValidIcon, string>> = {
  gym: 'movement',
  steps: 'movement',
  gratitude: 'reflection',
  journaling: 'reflection',
  focus: 'deep-work',
  study: 'deep-work',
};
```

Inside `validateAIGoalPackage`, the loop currently pushes `{ name, icon, frequency, why }`. Track whether the icon was repaired, then collapse after the loop:

```ts
  const validMarks: (AIGoalMark & { __repaired?: boolean })[] = [];
  // ... in the loop, replace the icon-repair block with:
    const rawIcon = typeof mark.icon === 'string' ? mark.icon : '';
    const repaired = !(VALID_ICONS as readonly string[]).includes(rawIcon);
    const icon: string = repaired ? FALLBACK_ICON : rawIcon;

    validMarks.push({
      name: String(mark.name).trim(),
      icon,
      frequency,
      why: String(mark.why).trim(),
      ...(repaired ? { __repaired: true } : {}),
    });
  // ... after the loop, before the length check:
  const seenCategories = new Set<string>();
  const distinctMarks = validMarks
    .filter((m) => {
      const category = m.__repaired ? undefined : AI_ICON_EFFORT_CATEGORY[m.icon as ValidIcon];
      if (!category) return true;
      if (seenCategories.has(category)) return false;
      seenCategories.add(category);
      return true;
    })
    .map(({ __repaired, ...m }) => m);

  if (distinctMarks.length === 0) return null;

  return {
    goalTitle: String(r.goalTitle).trim(),
    timeframeWeeks,
    confidence: r.confidence as 'high' | 'low',
    marks: distinctMarks.slice(0, 3),
  };
```

- [ ] **Step 4: Run the new tests and the existing goal-generation suites**

Run: `npx jest tests/unit/goalGenerationOverlap.test.ts tests/unit/onboarding`
Expected: PASS (existing `goalGeneration.test.ts` / `aiReview.test.ts` must stay green — if one asserts a 3-overlapping-mark package survives intact, update that fixture to distinct icons and note it in the commit).

- [ ] **Step 5: Commit**

```
git add lib/ai/goalGeneration.ts tests/unit/goalGenerationOverlap.test.ts
git commit -m "feat(ai): collapse overlapping effort marks in package validation"
```

---

### Task 2: Distinctness rule in the Edge Function prompt

**Files:**
- Modify: `supabase/functions/ai-goal-generation/index.ts` (`buildSystemPrompt()`, rules block ~line 126)

- [ ] **Step 1: Add the rules**

Append to the `Rules:` list in `buildSystemPrompt()`:

```
- Each mark must be a separate real-world effort. Never suggest two marks that one single activity would satisfy (a run must not appear as both a running mark and a steps mark)
- Prefer 2 distinct marks over 3 overlapping ones
```

- [ ] **Step 2: Mirror-check**

The client comment in `lib/ai/goalGeneration.ts` says the icon list "Mirrors the same list in the Edge Function system prompt" — no icon change here, nothing else to mirror. Confirm the Edge Function's own `validMarks` capping logic is untouched.

- [ ] **Step 3: Commit**

```
git add supabase/functions/ai-goal-generation/index.ts
git commit -m "feat(ai): distinct-efforts rule in goal-generation prompt"
```

- [ ] **Step 4: Deploy + verify against the DEPLOYED function (dispatcher condition 4 — do not skip)**

Run: `npx supabase functions deploy ai-goal-generation`
Then from the running app (or a curl with a user JWT): generate a package for "I want to get fit and run a 5k" and confirm no Run+Steps style pairing in the result. Record the outcome in `.agentic/handoff.md`. If deploy credentials are unavailable in this environment, flag to founder — the task is NOT done until this runs.

---

### Task 3: `lib/nextStep.ts` — pure hero-step selection

**Files:**
- Create: `lib/nextStep.ts`
- Test: `tests/unit/nextStep.test.ts` (new)

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/nextStep.test.ts
import { selectNextStep, isFeasibleNow, type NextStepCandidate } from '../../lib/nextStep';

const at = (hour: number) => new Date(2026, 6, 11, hour, 0, 0);
const cand = (over: Partial<NextStepCandidate>): NextStepCandidate => ({
  markId: 'm1', name: 'Run', weeklyCount: 0, weeklyTarget: 3,
  loggedToday: false, timeAffinity: 'anytime', ...over,
});

describe('isFeasibleNow', () => {
  it('daytime marks stop at 20:00', () => {
    expect(isFeasibleNow('daytime', at(19))).toBe(true);
    expect(isFeasibleNow('daytime', at(20))).toBe(false);
  });
  it('evening marks start at 16:00', () => {
    expect(isFeasibleNow('evening', at(15))).toBe(false);
    expect(isFeasibleNow('evening', at(16))).toBe(true);
  });
  it('anytime is always feasible', () => {
    expect(isFeasibleNow('anytime', at(3))).toBe(true);
  });
});

describe('selectNextStep', () => {
  it('picks the most-behind due mark', () => {
    const r = selectNextStep([
      cand({ markId: 'a', name: 'Run', weeklyCount: 2, weeklyTarget: 3 }),
      cand({ markId: 'b', name: 'Read', weeklyCount: 0, weeklyTarget: 3 }),
    ], at(10));
    expect(r).toEqual({ kind: 'step', candidate: expect.objectContaining({ markId: 'b' }) });
  });

  it('breaks ties by array order', () => {
    const r = selectNextStep([
      cand({ markId: 'a', weeklyCount: 1, weeklyTarget: 3 }),
      cand({ markId: 'b', weeklyCount: 1, weeklyTarget: 3 }),
    ], at(10));
    expect(r.kind).toBe('step');
    if (r.kind === 'step') expect(r.candidate.markId).toBe('a');
  });

  it('skips marks already logged today (promotion after log)', () => {
    const r = selectNextStep([
      cand({ markId: 'a', loggedToday: true }),
      cand({ markId: 'b', name: 'Read' }),
    ], at(10));
    if (r.kind === 'step') expect(r.candidate.markId).toBe('b');
    expect(r.kind).toBe('step');
  });

  it('10pm with only a daytime Run due returns tomorrow', () => {
    const r = selectNextStep([cand({ timeAffinity: 'daytime' })], at(22));
    expect(r).toEqual({ kind: 'tomorrow', candidate: expect.objectContaining({ name: 'Run' }) });
  });

  it('all due marks done for the week returns allClear', () => {
    const r = selectNextStep([cand({ weeklyCount: 3, weeklyTarget: 3 })], at(10));
    expect(r).toEqual({ kind: 'allClear' });
  });

  it('every due mark already logged today returns allClear', () => {
    const r = selectNextStep([cand({ loggedToday: true })], at(10));
    expect(r).toEqual({ kind: 'allClear' });
  });

  it('empty candidate list returns allClear', () => {
    expect(selectNextStep([], at(10))).toEqual({ kind: 'allClear' });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest tests/unit/nextStep.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement**

```ts
// lib/nextStep.ts
/**
 * Hero-step selection for Focus goal cards (spec 2026-07-11).
 * Pure: takes candidates + a Date so tests control the clock.
 * The hero only ever names the NEXT thing (invitation, never a debt).
 */
import { MARK_LIBRARY } from './suggestedCounters';

export type TimeAffinity = 'anytime' | 'daytime' | 'evening';

export type NextStepCandidate = {
  markId: string;
  name: string;
  weeklyCount: number;
  weeklyTarget: number;
  loggedToday: boolean;
  timeAffinity: TimeAffinity;
};

export type NextStepResult =
  | { kind: 'step'; candidate: NextStepCandidate }
  | { kind: 'tomorrow'; candidate: NextStepCandidate }
  | { kind: 'allClear' };

/** Daytime marks are not suggested at/after this hour. */
export const DAYTIME_CUTOFF_HOUR = 20;
/** Evening marks are not suggested before this hour. */
export const EVENING_START_HOUR = 16;

export function isFeasibleNow(affinity: TimeAffinity, now: Date): boolean {
  const hour = now.getHours();
  if (affinity === 'daytime') return hour < DAYTIME_CUTOFF_HOUR;
  if (affinity === 'evening') return hour >= EVENING_START_HOUR;
  return true;
}

function mostBehind(candidates: NextStepCandidate[]): NextStepCandidate {
  let best = candidates[0];
  for (const c of candidates.slice(1)) {
    const bestRatio = best.weeklyCount / Math.max(1, best.weeklyTarget);
    const ratio = c.weeklyCount / Math.max(1, c.weeklyTarget);
    if (ratio < bestRatio) best = c;
  }
  return best;
}

export function selectNextStep(
  candidates: NextStepCandidate[],
  now: Date,
): NextStepResult {
  const due = candidates.filter((c) => c.weeklyCount < c.weeklyTarget);
  const notToday = due.filter((c) => !c.loggedToday);
  if (notToday.length === 0) return { kind: 'allClear' };

  const feasible = notToday.filter((c) => isFeasibleNow(c.timeAffinity, now));
  if (feasible.length > 0) return { kind: 'step', candidate: mostBehind(feasible) };
  return { kind: 'tomorrow', candidate: mostBehind(notToday) };
}

/** Emoji-match against MARK_LIBRARY (existing focus.tsx pattern); custom marks are anytime. */
export function resolveTimeAffinity(emoji: string | null | undefined): TimeAffinity {
  if (!emoji) return 'anytime';
  const def = MARK_LIBRARY.find((m) => m.emoji === emoji);
  return def?.timeAffinity ?? 'anytime';
}
```

- [ ] **Step 4: Run tests**

Run: `npx jest tests/unit/nextStep.test.ts`
Expected: PASS (resolveTimeAffinity compiles against Task 4's field — do Task 4 Step 1 first if TS complains, or land both before running type-check).

- [ ] **Step 5: Commit** (after Task 4 lands, see note — or commit both together)

```
git add lib/nextStep.ts tests/unit/nextStep.test.ts
git commit -m "feat(focus): pure next-step selection with time feasibility"
```

---

### Task 4: `timeAffinity` metadata on MARK_LIBRARY

**Files:**
- Modify: `lib/suggestedCounters.ts` (`MarkDefinition` type + tagged entries)
- Test: extend `tests/unit/nextStep.test.ts`

- [ ] **Step 1: Add the optional field to the type**

```ts
export type MarkDefinition = {
  // ...existing fields...
  frequencyKind: 'variable' | 'fixed' | 'abstinence';
  /** Hero-step time gating (spec 2026-07-11). Absent = 'anytime'. */
  timeAffinity?: 'daytime' | 'evening';
};
```

- [ ] **Step 2: Tag entries**

Add `timeAffinity: 'daytime'` to the Fitness movement entries: ids `workout`, `steps`, `run`, and any swim/bike/walk entries present (grep `id: '` in the file; tag only genuine daytime physical activity).
Add `timeAffinity: 'evening'` to: `sleep`, `reading`, `journaling`, `gratitude`, `meditation` (verify each id exists; skip absent ones).
Everything else stays untagged (= anytime). `water`, `calories`, `planning`, `focus`, `study`, `language`, `rest` must remain untagged per spec.

- [ ] **Step 3: Add resolver tests to `tests/unit/nextStep.test.ts`**

```ts
import { resolveTimeAffinity } from '../../lib/nextStep';

describe('resolveTimeAffinity', () => {
  it('maps a known daytime mark by emoji', () => {
    expect(resolveTimeAffinity('🏃')).toBe('daytime'); // run
  });
  it('maps a known evening mark by emoji', () => {
    expect(resolveTimeAffinity('🌙')).toBe('evening'); // sleep
  });
  it('defaults custom/unknown to anytime', () => {
    expect(resolveTimeAffinity('🦖')).toBe('anytime');
    expect(resolveTimeAffinity(null)).toBe('anytime');
  });
});
```

- [ ] **Step 4: Run tests + type-check**

Run: `npx jest tests/unit/nextStep.test.ts && npm run type-check`
Expected: PASS, clean.

- [ ] **Step 5: Commit**

```
git add lib/suggestedCounters.ts lib/nextStep.ts tests/unit/nextStep.test.ts
git commit -m "feat(focus): timeAffinity metadata on mark library"
```

---

### Task 5: `GoalHeroStep` component

**Files:**
- Create: `components/ui/GoalHeroStep.tsx`
- Test: `tests/unit/goalHeroStep.test.tsx` (new; follow `tests/unit/markRow.test.tsx` rendering setup)

- [ ] **Step 1: Write the failing tests**

```tsx
// tests/unit/goalHeroStep.test.tsx
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { GoalHeroStep } from '../../components/ui/GoalHeroStep';

const step = {
  kind: 'step' as const,
  candidate: { markId: 'a', name: 'Run', weeklyCount: 2, weeklyTarget: 3, loggedToday: false, timeAffinity: 'daytime' as const },
};

describe('GoalHeroStep', () => {
  it('renders the directive step with weekly position', () => {
    const { getByText } = render(<GoalHeroStep result={step} onLog={jest.fn()} />);
    getByText('Today');
    getByText('Run');
    getByText('2 of 3 this week');
  });

  it('fires onLog with the mark id', () => {
    const onLog = jest.fn();
    const { getByTestId } = render(<GoalHeroStep result={step} onLog={onLog} />);
    fireEvent.press(getByTestId('hero-checkin'));
    expect(onLog).toHaveBeenCalledWith('a');
  });

  it('renders the quiet tomorrow state without a check-in button', () => {
    const { getByText, queryByTestId } = render(
      <GoalHeroStep result={{ kind: 'tomorrow', candidate: step.candidate }} onLog={jest.fn()} />,
    );
    getByText('Tomorrow: Run');
    expect(queryByTestId('hero-checkin')).toBeNull();
  });

  it('renders the all-clear state', () => {
    const { getByText } = render(<GoalHeroStep result={{ kind: 'allClear' }} onLog={jest.fn()} />);
    getByText("That's this goal for today.");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest tests/unit/goalHeroStep.test.tsx`
Expected: FAIL — component does not exist.

- [ ] **Step 3: Implement**

```tsx
// components/ui/GoalHeroStep.tsx
/**
 * Goal card hero (spec 2026-07-11): the one next step this goal asks for now.
 * Voice guardrails: invitation only — no overdue language, no red, no counts
 * of missed days. Copy must satisfy the repo dash rule (no dash-as-dash).
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { CheckinButton } from './CheckinButton';
import { fonts, fontSize, spacing, radius, themedColors } from '../../theme/tokens';
import { applyOpacity } from '@/src/components/icons/color';
import { useEffectiveTheme } from '../../state/uiSlice';
import type { NextStepResult } from '../../lib/nextStep';

interface GoalHeroStepProps {
  result: NextStepResult;
  onLog: (markId: string) => void;
}

export function GoalHeroStep({ result, onLog }: GoalHeroStepProps) {
  const theme = useEffectiveTheme();
  const c = themedColors(theme);

  if (result.kind === 'allClear') {
    return (
      <View style={styles.quietWrap}>
        <Text style={[styles.quietText, { color: c.inkMuted }]}>
          {"That's this goal for today."}
        </Text>
      </View>
    );
  }

  if (result.kind === 'tomorrow') {
    return (
      <View style={styles.quietWrap}>
        <Text style={[styles.quietText, { color: c.inkMuted }]}>
          {`Tomorrow: ${result.candidate.name}`}
        </Text>
      </View>
    );
  }

  const { candidate } = result;
  return (
    <View style={[styles.stepWrap, { backgroundColor: applyOpacity(c.forest, 0.08) }]}>
      <View style={styles.stepText}>
        <Text style={[styles.eyebrow, { color: c.inkMuted }]}>Today</Text>
        <Text style={[styles.markName, { color: c.inkDark }]} numberOfLines={1}>
          {candidate.name}
        </Text>
        <Text style={[styles.weekly, { color: c.inkMuted }]}>
          {`${candidate.weeklyCount} of ${candidate.weeklyTarget} this week`}
        </Text>
      </View>
      <CheckinButton
        checked={false}
        onCheckin={() => onLog(candidate.markId)}
        accent={c.forest}
        testID="hero-checkin"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  stepWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.md,
  },
  stepText: { flex: 1 },
  eyebrow: {
    fontFamily: fonts.sansMedium,
    fontSize: fontSize.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  markName: {
    fontFamily: fonts.serifSemibold,
    fontSize: fontSize.lg,
    marginTop: 1,
  },
  weekly: {
    fontFamily: fonts.sans,
    fontSize: fontSize.sm,
    marginTop: 1,
  },
  quietWrap: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    paddingVertical: spacing.xs,
  },
  quietText: {
    fontFamily: fonts.serifItalic,
    fontSize: fontSize.md,
  },
});
```

Check `CheckinButton`'s actual props before writing (accent/checked/onCheckin/disabled per MarkRow usage at `components/ui/MarkRow.tsx:177`); adjust if its signature differs.

- [ ] **Step 4: Run tests**

Run: `npx jest tests/unit/goalHeroStep.test.tsx`
Expected: PASS. Also run the copy dash-rule suite if it globs components (`npx jest copy` to be safe).

- [ ] **Step 5: Commit**

```
git add components/ui/GoalHeroStep.tsx tests/unit/goalHeroStep.test.tsx
git commit -m "feat(focus): GoalHeroStep card hero component"
```

---

### Task 6: Wire the hero into the Focus goal card

**Files:**
- Modify: `app/(tabs)/focus.tsx` (goal-card block, ~lines 479–548)

- [ ] **Step 1: Build candidates + result per goal**

Inside the `activeGoals.map((goal) => ...)` render, after `marks` is computed, add:

```tsx
const heroResult = selectNextStep(
  marks.map((m) => ({
    markId: m.id,
    name: m.name,
    weeklyCount: weeklyCountsMap.get(m.id) ?? 0,
    weeklyTarget: m.weekly_target ?? 3,
    loggedToday: (todayCountsMap.get(m.id) ?? 0) > 0,
    timeAffinity: resolveTimeAffinity(m.emoji),
  })),
  getAppDate(),
);
const heroMarkId = heroResult.kind === 'step' ? heroResult.candidate.markId : null;
```

Imports to add at top: `import { selectNextStep, resolveTimeAffinity } from '../../lib/nextStep';` (`getAppDate` is already imported).

Note: `getAppDate()` reflects the debug date override — correct for QA. The result recomputes on every log because `todayCountsMap`/`weeklyCountsMap` are upstream memos.

- [ ] **Step 2: Render order — title → hero → momentum → rows**

Insert `<GoalHeroStep result={heroResult} onLog={handleQuickIncrement} />` between the card header `TouchableOpacity` and the `momentumRow` View. Exclude the hero mark from the due rows below so it isn't shown twice:

```tsx
const dueMarks = marks.filter(
  (m) =>
    m.id !== heroMarkId &&
    markWeeklyState(m, weeklyCountsMap.get(m.id) ?? 0) === 'due',
);
```

(`doneMarks` unchanged.) Import `GoalHeroStep` from `../../components/ui/GoalHeroStep`.

- [ ] **Step 3: Type-check + full unit suite**

Run: `npm run type-check && npx jest`
Expected: clean, all suites green (focus.tsx has no direct unit suite; watch for snapshot-adjacent failures in markRow/copy suites).

- [ ] **Step 4: Preview verification (dev server already running on :8081)**

Web preview: load `http://localhost:8081`, sign in, confirm a goal card shows Today hero with check-in; tap it → hero promotes to next feasible mark; read console for errors. Founder verifies on phone via Expo Go (`exp://192.168.1.146:8081`), including the evening case (or use the debug date/time override).

- [ ] **Step 5: Commit**

```
git add app/(tabs)/focus.tsx
git commit -m "feat(focus): goal card leads with time-feasible next step"
```

---

### Task 7: Gates, verification, memory

- [ ] **Step 1: Architect sign-off** (dispatcher condition 2) — dispatch @architect on `lib/nextStep.ts` boundary + `AI_ICON_EFFORT_CATEGORY` map. Light-touch confirm.
- [ ] **Step 2: Critic review** (dispatcher condition 3) — dispatch @critic on: the three card states' exact copy vs no-guilt guardrails, AND confirmation that Momentum visibly moves in the same check-in interaction as the hero (check-in accent pulse + momentum growth pulse from the motion system fire on `handleQuickIncrement` — verify wiring, then confirm on device). This closes critic's carried-over 2026-07-08 item.
- [ ] **Step 3: Fix anything the gates raise; re-run `npx jest && npm run type-check && npm run lint`** (lint: changed files only; repo-wide react-hooks errors are the known pre-existing false positive).
- [ ] **Step 4: Edge Function deployed-function verification** from Task 2 Step 4 recorded in handoff.
- [ ] **Step 5: Update `.agentic/handoff.md`** (feature state, device-QA checklist: hero on phone, 10pm tomorrow state, promotion after log, Reduce Motion) and append completion note to the 2026-07-11 decisions.md entry if any decision changed during implementation.
- [ ] **Step 6: Final commit of memory files if tracked; summarize to founder** (technical + founder summary; next task = resume the 11-item launch-readiness walk).
