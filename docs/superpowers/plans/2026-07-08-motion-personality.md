# Livra Motion & Personality System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Livra a coherent motion vocabulary and four psychologically-targeted hero moments (mark logged, momentum/fresh start, milestones, empty states) with zero new dependencies.

**Architecture:** Extend `theme/tokens.ts` with motion durations + spring presets; a `useMotion()` hook built on the existing `hooks/useReducedMotion.ts` gates every animation for Reduce Motion; pure trigger logic lives in `lib/motionTriggers.ts` (unit-tested first); components consume tokens + hook. Spec: `docs/superpowers/specs/2026-07-08-motion-personality-design.md`.

**Tech Stack:** React Native 0.81, Expo SDK 54, react-native-reanimated 4, react-native-svg (already present), expo-haptics, Jest (`jest-expo`), TypeScript strict.

**House rules that bind every task:** color from `theme/tokens` only; no hardcoded durations/springs in new code (tokens only); no looping motion outside empty states; nothing over `motion.moment` (500ms); tests in `tests/unit/*.test.ts(x)`; no em/en dashes in user-facing copy.

---

### Task 1: Motion vocabulary tokens

**Files:**
- Modify: `theme/tokens.ts:186-188`
- Test: `tests/unit/motionTokens.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/motionTokens.test.ts
import { motion, springs } from '../../theme/tokens';

describe('motion tokens', () => {
  it('defines the five duration steps', () => {
    expect(motion).toMatchObject({
      quick: 120, standard: 180, relaxed: 240, gentle: 350, moment: 500,
    });
  });

  it('caps every duration at 500ms (calm guardrail)', () => {
    Object.values(motion).forEach((d) => expect(d).toBeLessThanOrEqual(500));
  });

  it('defines the three spring presets harvested from existing animations', () => {
    expect(springs.playful).toEqual({ damping: 12, stiffness: 280 });
    expect(springs.settle).toEqual({ damping: 20, stiffness: 200 });
    expect(springs.entrance).toEqual({ damping: 14, stiffness: 90 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/unit/motionTokens.test.ts`
Expected: FAIL — `springs` is not exported; `motion` lacks `gentle`/`moment`.

- [ ] **Step 3: Implement tokens**

In `theme/tokens.ts`, replace the existing `motion` export (lines 186-188):

```ts
export const motion = {
  quick: 120, standard: 180, relaxed: 240, gentle: 350, moment: 500,
};
// Spring presets harvested from the app's best existing animations.
// playful: CheckinButton press. settle: overlay entrances. entrance: milestone reveal.
export const springs = {
  playful:  { damping: 12, stiffness: 280 },
  settle:   { damping: 20, stiffness: 200 },
  entrance: { damping: 14, stiffness: 90 },
} as const;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/unit/motionTokens.test.ts` — Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add theme/tokens.ts tests/unit/motionTokens.test.ts
git commit -m "feat(motion): motion duration + spring preset tokens"
```

---

### Task 2: `useMotion()` hook (single reduced-motion source)

**Files:**
- Create: `hooks/useMotion.ts`
- Test: `tests/unit/useMotion.test.tsx`

Builds ON TOP of the existing `hooks/useReducedMotion.ts` (AccessibilityInfo-based). Do NOT import Reanimated's `useReducedMotion` anywhere.

- [ ] **Step 1: Write the failing test**

```tsx
// tests/unit/useMotion.test.tsx
import { renderHook } from '@testing-library/react-native';
import { useMotion } from '../../hooks/useMotion';

let mockReduced = false;
jest.mock('../../hooks/useReducedMotion', () => ({
  useReducedMotion: () => mockReduced,
}));

describe('useMotion', () => {
  it('exposes reduced=false when Reduce Motion is off', () => {
    mockReduced = false;
    const { result } = renderHook(() => useMotion());
    expect(result.current.reduced).toBe(false);
  });

  it('exposes reduced=true when Reduce Motion is on', () => {
    mockReduced = true;
    const { result } = renderHook(() => useMotion());
    expect(result.current.reduced).toBe(true);
  });

  it('provides timing and spring builders', () => {
    mockReduced = false;
    const { result } = renderHook(() => useMotion());
    expect(typeof result.current.timing).toBe('function');
    expect(typeof result.current.spring).toBe('function');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/unit/useMotion.test.tsx`
Expected: FAIL — module `hooks/useMotion` not found.

- [ ] **Step 3: Implement the hook**

```ts
// hooks/useMotion.ts
// Single gateway for animation configs. Wraps the app's one reduced-motion
// source (AccessibilityInfo). Under Reduce Motion, springs and timings
// collapse to instant so state still lands, just without travel.
import { withSpring, withTiming } from 'react-native-reanimated';
import { motion, springs } from '../theme/tokens';
import { useReducedMotion } from './useReducedMotion';

export function useMotion() {
  const reduced = useReducedMotion();

  const timing = (toValue: number, duration: number = motion.standard) =>
    withTiming(toValue, { duration: reduced ? 0 : duration });

  const spring = (toValue: number, preset: keyof typeof springs = 'settle') =>
    reduced ? withTiming(toValue, { duration: 0 }) : withSpring(toValue, springs[preset]);

  return { reduced, timing, spring };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/unit/useMotion.test.tsx` — Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add hooks/useMotion.ts tests/unit/useMotion.test.tsx
git commit -m "feat(motion): useMotion hook over existing reduced-motion source"
```

---

### Task 3: Pure trigger logic (`lib/motionTriggers.ts`)

**Files:**
- Create: `lib/motionTriggers.ts`
- Test: `tests/unit/motionTriggers.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/motionTriggers.test.ts
import { dayJustCompleted, momentumDayIncreased } from '../../lib/motionTriggers';

describe('dayJustCompleted', () => {
  it('fires only on the false->true transition', () => {
    expect(dayJustCompleted(false, true)).toBe(true);
    expect(dayJustCompleted(true, true)).toBe(false);
    expect(dayJustCompleted(false, false)).toBe(false);
    expect(dayJustCompleted(true, false)).toBe(false);
  });
});

describe('momentumDayIncreased', () => {
  it('fires when days grow', () => {
    expect(momentumDayIncreased(3, 4)).toBe(true);
  });
  it('does not fire on same, lower, or null values', () => {
    expect(momentumDayIncreased(4, 4)).toBe(false);
    expect(momentumDayIncreased(4, 0)).toBe(false);
    expect(momentumDayIncreased(null, 1)).toBe(false); // first render: no pulse
    expect(momentumDayIncreased(2, null)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/unit/motionTriggers.test.ts` — Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

```ts
// lib/motionTriggers.ts
// Pure predicates for when hero-moment animations fire. No React, no I/O.

/** True only on the transition into "everything loggable today is done". */
export function dayJustCompleted(prevAllDone: boolean, nextAllDone: boolean): boolean {
  return !prevAllDone && nextAllDone;
}

/** True when the momentum day-count visibly grew. Null on either side = no pulse
 *  (first render or missing snapshot must not celebrate). */
export function momentumDayIncreased(prevDays: number | null, nextDays: number | null): boolean {
  return prevDays != null && nextDays != null && nextDays > prevDays;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/unit/motionTriggers.test.ts` — Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/motionTriggers.ts tests/unit/motionTriggers.test.ts
git commit -m "feat(motion): pure trigger predicates for hero moments"
```

---

### Task 4: Moment A — check-in accent pulse (CheckinButton + MarkRow)

**Files:**
- Modify: `components/ui/CheckinButton.tsx`
- Modify: `components/ui/MarkRow.tsx:136-140` (pass accent)
- Test: `tests/unit/checkinButtonPulse.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// tests/unit/checkinButtonPulse.test.tsx
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { CheckinButton } from '../../components/ui/CheckinButton';

describe('CheckinButton accent pulse', () => {
  it('renders a pulse ring element when an accent is provided', () => {
    const { getByTestId } = render(
      <CheckinButton checked={false} onCheckin={jest.fn()} accent="#5B8C5A" />,
    );
    expect(getByTestId('checkin-pulse-ring')).toBeTruthy();
  });

  it('still fires onCheckin on press', () => {
    const onCheckin = jest.fn();
    const { getByTestId } = render(
      <CheckinButton checked={false} onCheckin={onCheckin} accent="#5B8C5A" testID="btn" />,
    );
    fireEvent.press(getByTestId('btn'));
    // onCheckin fires from the animation completion callback; with the
    // reanimated jest mock, withTiming callbacks run synchronously.
    expect(onCheckin).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/unit/checkinButtonPulse.test.tsx`
Expected: FAIL — no `checkin-pulse-ring` testID, no `accent`/`testID` props.

- [ ] **Step 3: Implement**

In `components/ui/CheckinButton.tsx`:

1. Extend props:

```ts
interface CheckinButtonProps {
  checked: boolean;
  onCheckin: () => void;
  disabled?: boolean;
  /** Goal-category accent for the completion pulse. Falls back to forest. */
  accent?: string;
  testID?: string;
}
```

2. Import tokens/hook and add pulse shared values:

```ts
import { motion, themedColors } from '../../theme/tokens';
import { useMotion } from '../../hooks/useMotion';
import { applyOpacity } from '../../src/components/icons/color';
```

```ts
export function CheckinButton({ checked, onCheckin, disabled, accent, testID }: CheckinButtonProps) {
  const theme = useEffectiveTheme();
  const c = themedColors(theme);
  const { reduced, timing } = useMotion();
  const rotation = useSharedValue(0);
  const scale = useSharedValue(1);
  const iconOpacity = useSharedValue(1);
  const pulseScale = useSharedValue(1);
  const pulseOpacity = useSharedValue(0);
  const pulseColor = accent ?? c.forest;
```

3. In `handlePress`, after the existing scale sequence, fire the pulse (skip under Reduce Motion), and swap hardcoded durations for tokens (`100 → motion.quick`, `300 → motion.relaxed`, keep the spring but via `springs.playful` import):

```ts
    if (!reduced) {
      pulseOpacity.value = 0.35;
      pulseScale.value = 1;
      pulseScale.value = withTiming(1.9, { duration: motion.gentle });
      pulseOpacity.value = withTiming(0, { duration: motion.gentle });
    }
```

4. Add the ring element inside the unchecked branch's outer `Animated.View`, absolutely positioned (render it whenever `accent` is provided or always; keep always, colored by `pulseColor`):

```tsx
      <Animated.View
        testID="checkin-pulse-ring"
        pointerEvents="none"
        style={[
          {
            position: 'absolute',
            width: 22, height: 22, borderRadius: 11,
            backgroundColor: applyOpacity(pulseColor, 0.5),
          },
          pulseStyle,
        ]}
      />
```

with

```ts
  const pulseStyle = useAnimatedStyle(() => ({
    opacity: pulseOpacity.value,
    transform: [{ scale: pulseScale.value }],
  }));
```

5. Thread `testID` onto the `TouchableOpacity`.

In `components/ui/MarkRow.tsx`, pass the accent (line ~136):

```tsx
          <CheckinButton
            checked={loggedToday ?? false}
            onCheckin={handleLog}
            disabled={loggedToday || !onLog}
            accent={accent}
          />
```

- [ ] **Step 4: Run tests**

Run: `npx jest tests/unit/checkinButtonPulse.test.tsx tests/unit/markRow.test.tsx`
Expected: PASS (markRow.test.tsx guards against regressions).

- [ ] **Step 5: Commit**

```bash
git add components/ui/CheckinButton.tsx components/ui/MarkRow.tsx tests/unit/checkinButtonPulse.test.tsx
git commit -m "feat(motion): category-accent completion pulse on check-in"
```

---

### Task 5: Moment A — day-complete staggered row pulse (focus screen)

**Files:**
- Modify: `components/ui/MarkRow.tsx` (celebration overlay)
- Modify: `app/(tabs)/focus.tsx` (detect transition via `allDoneForDay`, line ~194)
- Test: `tests/unit/markRowCelebrate.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// tests/unit/markRowCelebrate.test.tsx
import React from 'react';
import { render } from '@testing-library/react-native';
import { MarkRow } from '../../components/ui/MarkRow';

describe('MarkRow day-complete celebration', () => {
  it('renders the celebration overlay when a celebrateStamp is provided', () => {
    const { getByTestId } = render(
      <MarkRow title="Read" loggedToday celebrateStamp={123} celebrateIndex={0} />,
    );
    expect(getByTestId('markrow-celebrate-overlay')).toBeTruthy();
  });

  it('renders no overlay without a stamp', () => {
    const { queryByTestId } = render(<MarkRow title="Read" loggedToday />);
    expect(queryByTestId('markrow-celebrate-overlay')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/unit/markRowCelebrate.test.tsx` — Expected: FAIL (unknown props / missing testID).

- [ ] **Step 3: Implement MarkRow overlay**

Add props `celebrateStamp?: number` (changes each time a day completes) and `celebrateIndex?: number` (row position for stagger). Inside `MarkRow`, when `celebrateStamp` changes to a truthy value, pulse a full-row accent overlay — plain opacity transform only, per spec (no gradient sweep):

```tsx
import Animated, { useSharedValue, useAnimatedStyle, withDelay, withSequence, withTiming } from 'react-native-reanimated';
import { motion } from '../../theme/tokens';
import { useMotion } from '../../hooks/useMotion';
```

```tsx
  const { reduced } = useMotion();
  const celebrateOpacity = useSharedValue(0);
  useEffect(() => {
    if (!celebrateStamp || reduced) return;
    const delay = (celebrateIndex ?? 0) * 60;
    celebrateOpacity.value = withDelay(
      delay,
      withSequence(
        withTiming(0.10, { duration: motion.standard }),
        withTiming(0, { duration: motion.gentle }),
      ),
    );
  }, [celebrateStamp, celebrateIndex, reduced, celebrateOpacity]);

  const celebrateStyle = useAnimatedStyle(() => ({ opacity: celebrateOpacity.value }));
```

Render inside the row's `TouchableOpacity`, before the accent bar (absolute fill, `pointerEvents="none"`), only when `celebrateStamp` is set:

```tsx
      {celebrateStamp ? (
        <Animated.View
          testID="markrow-celebrate-overlay"
          pointerEvents="none"
          style={[{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: accent }, celebrateStyle]}
        />
      ) : null}
```

(`useEffect` needs importing into MarkRow's React import.)

- [ ] **Step 4: Wire the trigger in focus.tsx**

Near the existing `allDoneForDay` memo (line ~194):

```tsx
import { dayJustCompleted } from '../../lib/motionTriggers';
```

```tsx
  const prevAllDoneRef = useRef(allDoneForDay);
  const [celebrateStamp, setCelebrateStamp] = useState<number | null>(null);
  useEffect(() => {
    if (dayJustCompleted(prevAllDoneRef.current, allDoneForDay)) {
      setCelebrateStamp(Date.now());
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    }
    prevAllDoneRef.current = allDoneForDay;
  }, [allDoneForDay]);
```

Pass `celebrateStamp={celebrateStamp ?? undefined}` and `celebrateIndex={i}` to each rendered `MarkRow` in the goal-section and daily-habit lists (follow the file's existing map callbacks; `Haptics`/`Platform` may already be imported — check before adding).

- [ ] **Step 5: Run tests + type-check**

Run: `npx jest tests/unit/markRowCelebrate.test.tsx tests/unit/markRow.test.tsx && npm run type-check`
Expected: PASS / clean.

- [ ] **Step 6: Commit**

```bash
git add components/ui/MarkRow.tsx "app/(tabs)/focus.tsx" tests/unit/markRowCelebrate.test.tsx
git commit -m "feat(motion): staggered row pulse + haptic when the day completes"
```

---

### Task 6: Moment B — momentum growth pulse + fresh-start entrance

**Files:**
- Modify: `components/ui/GoalMomentum.tsx`
- Test: extend `tests/unit/goalMomentumComponent.test.tsx`

- [ ] **Step 1: Write the failing test (append to existing file)**

```tsx
// append to tests/unit/goalMomentumComponent.test.tsx
it('wraps the label in an animated container (growth pulse + fresh entrance)', () => {
  const snap = { days: 3, state: 'on_track', cushionRemaining: null } as any;
  const { getByTestId } = render(<GoalMomentum snapshot={snap} />);
  expect(getByTestId('momentum-label-animated')).toBeTruthy();
});
```

(Match the existing test file's render helpers/mocks — read it first and follow its patterns.)

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest tests/unit/goalMomentumComponent.test.tsx` — Expected: new case FAILS.

- [ ] **Step 3: Implement in GoalMomentum.tsx**

- Track previous days with a ref; on `momentumDayIncreased` → scale pulse `1 → 1.06 → settle` with `springs.playful`.
- When `d.visual === 'fresh'` on mount → entrance: opacity 0→1 (`motion.gentle`) + scale 0.96→1 (`springs.entrance`).
- Replace the hardcoded `350` with `motion.gentle`.
- All gated through `useMotion()` (`reduced` → values land instantly).

```tsx
import { useEffect, useRef } from 'react';
import Animated, { useSharedValue, useAnimatedStyle, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { motion, springs } from '../../theme/tokens';
import { useMotion } from '../../hooks/useMotion';
import { momentumDayIncreased } from '../../lib/motionTriggers';
```

```tsx
  const { reduced } = useMotion();
  const labelScale = useSharedValue(1);
  const labelOpacity = useSharedValue(d.visual === 'fresh' ? 0 : 1);
  const prevDaysRef = useRef<number | null>(null);

  useEffect(() => {
    const days = snapshot?.days ?? null;
    if (!reduced && momentumDayIncreased(prevDaysRef.current, days)) {
      labelScale.value = withSequence(
        withTiming(1.06, { duration: motion.quick }),
        withSpring(1, springs.playful),
      );
    }
    prevDaysRef.current = days;
  }, [snapshot?.days, reduced, labelScale]);

  useEffect(() => {
    if (d.visual === 'fresh') {
      if (reduced) { labelOpacity.value = 1; return; }
      labelOpacity.value = withTiming(1, { duration: motion.gentle });
      labelScale.value = 0.96;
      labelScale.value = withSpring(1, springs.entrance);
    } else {
      labelOpacity.value = 1;
    }
  }, [d.visual, reduced, labelOpacity, labelScale]);

  const labelAnimStyle = useAnimatedStyle(() => ({
    opacity: labelOpacity.value,
    transform: [{ scale: labelScale.value }],
  }));
```

Wrap the existing label row: change the outer `<View style={[styles.labelRow, ...]}>` to `<Animated.View testID="momentum-label-animated" style={[styles.labelRow, ..., labelAnimStyle]}>`. Change the gauge fill's `withTiming(..., { duration: 350 })` to `{ duration: motion.gentle }`.

- [ ] **Step 4: Run tests**

Run: `npx jest tests/unit/goalMomentumComponent.test.tsx` — Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add components/ui/GoalMomentum.tsx tests/unit/goalMomentumComponent.test.tsx
git commit -m "feat(motion): momentum growth pulse and warm fresh-start entrance"
```

---

### Task 7: Moment C — ProgressArc + milestone screen sweep

**Files:**
- Create: `components/ui/ProgressArc.tsx`
- Modify: `lib/goalMilestones.ts` (add `milestoneArcRange`)
- Modify: `app/goal/milestone.tsx`
- Test: `tests/unit/milestoneArcRange.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/milestoneArcRange.test.ts
import { milestoneArcRange } from '../../lib/goalMilestones';

describe('milestoneArcRange', () => {
  it('sweeps dated milestones from the previous threshold (endowed progress)', () => {
    expect(milestoneArcRange('25')).toEqual({ from: 0, to: 0.25 });
    expect(milestoneArcRange('50')).toEqual({ from: 0.25, to: 0.5 });
    expect(milestoneArcRange('75')).toEqual({ from: 0.5, to: 0.75 });
  });
  it('returns null for dateless milestones (7/30/60 day counts have no % arc)', () => {
    expect(milestoneArcRange('7')).toBeNull();
    expect(milestoneArcRange('30')).toBeNull();
    expect(milestoneArcRange('60')).toBeNull();
    expect(milestoneArcRange('nonsense')).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest tests/unit/milestoneArcRange.test.ts` — Expected: FAIL, not exported.

- [ ] **Step 3: Implement `milestoneArcRange` in `lib/goalMilestones.ts`**

```ts
/** Arc sweep for a dated milestone: from the previous threshold, never from a
 *  cold zero on re-render (goal-gradient: show accumulated progress). Null for
 *  dateless day-count milestones. */
export function milestoneArcRange(key: string): { from: number; to: number } | null {
  const idx = (DATED_KEYS as readonly string[]).indexOf(key);
  if (idx === -1) return null;
  const prev = idx === 0 ? 0 : parseInt(DATED_KEYS[idx - 1], 10) / 100;
  return { from: prev, to: parseInt(key, 10) / 100 };
}
```

Run: `npx jest tests/unit/milestoneArcRange.test.ts` — Expected: PASS. Commit:

```bash
git add lib/goalMilestones.ts tests/unit/milestoneArcRange.test.ts
git commit -m "feat(motion): milestone arc sweep ranges (goal-gradient)"
```

- [ ] **Step 4: Create ProgressArc**

```tsx
// components/ui/ProgressArc.tsx
// Animated circular progress. Sweeps from a previous value to the current one;
// net-new component on the already-present react-native-svg (no new dependency).
import React, { useEffect } from 'react';
import Svg, { Circle } from 'react-native-svg';
import Animated, { useSharedValue, useAnimatedProps, withTiming } from 'react-native-reanimated';
import { motion } from '../../theme/tokens';
import { useMotion } from '../../hooks/useMotion';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface ProgressArcProps {
  from: number;              // 0..1 starting fill
  to: number;                // 0..1 target fill
  size?: number;
  strokeWidth?: number;
  color: string;             // pass theme token values from the caller
  trackColor: string;
}

export function ProgressArc({ from, to, size = 96, strokeWidth = 6, color, trackColor }: ProgressArcProps) {
  const { reduced } = useMotion();
  const progress = useSharedValue(from);

  useEffect(() => {
    progress.value = withTiming(to, { duration: reduced ? 0 : motion.moment });
  }, [to, reduced, progress]);

  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - progress.value),
  }));

  return (
    <Svg width={size} height={size} testID="progress-arc">
      <Circle cx={size / 2} cy={size / 2} r={r} stroke={trackColor} strokeWidth={strokeWidth} fill="none" />
      <AnimatedCircle
        cx={size / 2} cy={size / 2} r={r}
        stroke={color} strokeWidth={strokeWidth} fill="none"
        strokeDasharray={`${circumference} ${circumference}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        animatedProps={animatedProps}
      />
    </Svg>
  );
}
```

- [ ] **Step 5: Integrate into `app/goal/milestone.tsx`**

Above the headline (inside the `moment` phase view):

```tsx
import { milestoneArcRange, MILESTONE_COPY } from '../../lib/goalMilestones';
import { ProgressArc } from '../../components/ui/ProgressArc';
import { applyOpacity } from '../../src/components/icons/color';
```

```tsx
  const arc = milestoneArcRange(milestoneKey ?? '');
```

```tsx
      {arc && (
        <ProgressArc
          from={arc.from}
          to={arc.to}
          color={c.forest}
          trackColor={applyOpacity(c.forest, 0.15)}
        />
      )}
```

Also swap the screen's hardcoded spring `{ damping: 14, stiffness: 90 }` for `springs.entrance` and durations `500/400` for `motion.moment`/`motion.gentle` (import from tokens).

- [ ] **Step 6: Run checks + commit**

Run: `npm run type-check && npx jest tests/unit` — Expected: clean / PASS.

```bash
git add components/ui/ProgressArc.tsx app/goal/milestone.tsx
git commit -m "feat(motion): animated milestone progress arc"
```

---

### Task 8: Moment D — breathing empty states

**Files:**
- Create: `components/ui/Breathing.tsx`
- Modify: `app/(tabs)/goals.tsx:390-411` (wrap logo)
- Modify: `app/(tabs)/focus.tsx:569-574` (add icon + wrap)
- Test: `tests/unit/breathing.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// tests/unit/breathing.test.tsx
import React from 'react';
import { Text } from 'react-native';
import { render } from '@testing-library/react-native';
import { Breathing } from '../../components/ui/Breathing';

let mockReduced = false;
jest.mock('../../hooks/useReducedMotion', () => ({
  useReducedMotion: () => mockReduced,
}));

describe('Breathing', () => {
  it('renders its children', () => {
    const { getByText } = render(<Breathing><Text>hi</Text></Breathing>);
    expect(getByText('hi')).toBeTruthy();
  });
  it('renders (static) under Reduce Motion without crashing', () => {
    mockReduced = true;
    const { getByText } = render(<Breathing><Text>hi</Text></Breathing>);
    expect(getByText('hi')).toBeTruthy();
    mockReduced = false;
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest tests/unit/breathing.test.tsx` — Expected: FAIL, module not found.

- [ ] **Step 3: Implement Breathing**

```tsx
// components/ui/Breathing.tsx
// Slow scale-only breathing loop (1.0 -> 1.02, ~3s). The ONLY looping motion
// allowed in the app, and only inside empty states (spec guardrail). Scale
// only, no opacity/rotation, so it never reads as a loading spinner.
// Static at rest under Reduce Motion.
import React, { useEffect } from 'react';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useMotion } from '../../hooks/useMotion';

const HALF_CYCLE_MS = 1500;

export function Breathing({ children }: { children: React.ReactNode }) {
  const { reduced } = useMotion();
  const scale = useSharedValue(1);

  useEffect(() => {
    if (reduced) {
      scale.value = 1;
      return;
    }
    scale.value = withRepeat(
      withSequence(
        withTiming(1.02, { duration: HALF_CYCLE_MS, easing: Easing.inOut(Easing.sin) }),
        withTiming(1, { duration: HALF_CYCLE_MS, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
    );
    return () => cancelAnimation(scale);
  }, [reduced, scale]);

  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return <Animated.View style={style}>{children}</Animated.View>;
}
```

(Note: `HALF_CYCLE_MS` exceeds `motion.moment` deliberately — the ≤500ms guardrail applies to one-shot effects; this is the sanctioned empty-state loop.)

- [ ] **Step 4: Wire into the two empty states**

`app/(tabs)/goals.tsx` (line ~392) — wrap the existing logo view:

```tsx
            <Breathing>
              <View style={{ opacity: 0.35 }}>
                <SvgLogo color={c.inkMuted} width={32} height={16} />
              </View>
            </Breathing>
```

`app/(tabs)/focus.tsx` (line ~571) — add a muted icon above the text (agreed in critic review; new visual element). `phosphor-react-native` is already used across the app:

```tsx
import { Plus } from 'phosphor-react-native';
```

```tsx
          <View style={[styles.emptyMarks, { backgroundColor: c.surface }]}>
            <Breathing>
              <Plus size={20} color={c.inkMuted} weight="duotone" />
            </Breathing>
            <Text style={[styles.emptyMarksText, { color: c.inkMuted }]}>
```

Add `alignItems: 'center'` and a small gap to `styles.emptyMarks` if not present so the icon centers above the text. Import `Breathing` in both files.

- [ ] **Step 5: Run checks + commit**

Run: `npx jest tests/unit/breathing.test.tsx && npm run type-check` — Expected: PASS / clean.

```bash
git add components/ui/Breathing.tsx "app/(tabs)/goals.tsx" "app/(tabs)/focus.tsx" tests/unit/breathing.test.tsx
git commit -m "feat(motion): breathing empty states (goals + focus)"
```

---

### Task 9: Guardrail sweep, full checks, memory updates

**Files:**
- Modify: `.agentic/debt.md`, `.agentic/handoff.md`
- Verify: whole repo

- [ ] **Step 1: Guardrail sweep on touched files**

Grep the files changed in Tasks 4-8 for leftover hardcoded animation numbers:

Run: `npx grep -nE "duration: [0-9]|damping: [0-9]|stiffness: [0-9]" components/ui/CheckinButton.tsx components/ui/GoalMomentum.tsx components/ui/MarkRow.tsx components/ui/Breathing.tsx components/ui/ProgressArc.tsx app/goal/milestone.tsx` (use ripgrep/Grep tool). Every hit must be a token reference or the documented `HALF_CYCLE_MS`. Fix stragglers.

- [ ] **Step 2: Full verification**

Run: `npm run type-check && npm run lint && npm run test`
Expected: type-check clean; lint clean on changed files; full Jest suite green (was 1417 passing pre-work — no regressions).

- [ ] **Step 3: Record deferred debt**

Append to `.agentic/debt.md`:

```md
## 2026-07-08 — Motion token retrofit incomplete (deliberate)
Only files touched by the motion hero moments consume `motion`/`springs` tokens. Remaining
Reanimated call sites (~19 files, e.g. GoalCompletionOverlay, LevelUpModal, SpeedDialFAB,
sheets) still hardcode durations/springs. Retrofit opportunistically when touching those files.
Spec: docs/superpowers/specs/2026-07-08-motion-personality-design.md.
```

- [ ] **Step 4: Update handoff + commit**

Update `.agentic/handoff.md` (In Progress → Completed, note manual QA remains) and commit:

```bash
git add .agentic/debt.md .agentic/handoff.md
git commit -m "docs(motion): record retrofit debt + handoff after motion system"
```

- [ ] **Step 5: Manual QA checklist (device/simulator — founder walk)**

Not automatable; run with the app (`npm run start`):
1. Check a mark: accent pulse fires, calm not flashy. 2. Complete all marks: staggered pulse + success haptic, once only. 3. Momentum label pulses when a day is added; fresh-start enters warmly after a rest day. 4. Milestone screen (dated goal at 25/50/75%): arc sweeps from previous threshold. 5. Both empty states breathe; goals.tsx logo must NOT read as a loading spinner (critic condition). 6. iOS Settings → Accessibility → Reduce Motion ON: no loops, no travel, all states still land. 7. Repeat spot checks in dark mode.

---

## Self-review notes

- Spec coverage: Foundation → Tasks 1-2; triggers/tests-first → Task 3; Moment A → Tasks 4-5; B → Task 6; C → Task 7; D → Task 8; guardrails/debt/QA → Task 9. Sequencing follows spec (A, B, D before C is acceptable; C placed at Task 7 to keep ProgressArc after its pure-logic test — net effect identical, all ship together).
- Critic blocker resolutions honored: single reduced-motion source (Task 2), focus.tsx icon added (Task 8), no gradient shimmer (Task 5), arc as net-new scoped component (Task 7), Reduce Motion loop fallback static (Task 8).
- Line numbers are from 2026-07-08 reads; re-verify before editing.
