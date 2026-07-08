# Livra Motion & Personality System — Design Spec

**Date:** 2026-07-08
**Status:** Approved design, pre-implementation
**Risk class:** Medium (user-facing UX across shared components) — requires `@dispatcher-pm` intake and `@critic` UX review before implementation; decision logged in `.agentic/decisions.md`.

## Purpose

Give Livra a coherent motion personality — *the calm friend who notices* — and use it to
psychologically reinforce progress toward goals. Motion never demands attention; it responds
to the user, rewards progress, and softens failure.

**Hard rule:** every animation maps to a named psychological effect or it doesn't ship.

## Current-state audit (2026-07-08)

- Reanimated 4 used in 27 files (~294 call sites). Strong existing moments:
  `components/ui/CheckinButton.tsx` (rotate + squash-spring + haptic),
  `components/overlays/GoalCompletionOverlay.tsx` (staggered entrance, swipe dismiss),
  `components/ui/GoalMomentum.tsx` (animated cushion gauge),
  `app/goal/milestone.tsx` (milestone celebration screen with `MILESTONE_COPY`).
- `theme/tokens.ts` `motion` token defines only 3 durations (120/180/240); no easing or
  spring presets. Components hardcode 100/300/350/400/500ms independently — no shared
  motion language.
- Motion is confirmation-only today; the psychologically high-leverage moments (mark logged,
  momentum growth, fresh start, milestones, empty states) are mostly static.
- No animation dependencies beyond Reanimated + expo-haptics (deliberate: no Lottie/Skia
  build weight before iOS launch).

## Scope

**In:** motion vocabulary in theme tokens; retrofit of the ~8 files the hero moments touch;
four hero moments (below); Reduce Motion accessibility; tests.

**Out:** full retrofit of all 27 animated files (tracked as debt in `.agentic/debt.md`);
mascot/character elements; new dependencies; sound design.

## 1. Foundation — motion vocabulary (`theme/tokens.ts`)

Extend the `motion` export:

- **Durations:** `quick: 120`, `standard: 180`, `relaxed: 240`, `gentle: 350`, `moment: 500`.
- **Spring presets** (harvested from the best existing animations):
  - `springs.playful` — damping 12, stiffness 280 (from CheckinButton)
  - `springs.settle` — damping 20, stiffness 200 (from GoalCompletionOverlay)
  - `springs.entrance` — damping 14, stiffness 90 (from milestone screen)
- **`useMotion()` hook** built **on top of the existing `hooks/useReducedMotion.ts`**
  (AccessibilityInfo-based — the single reduced-motion source in the app; do not introduce a
  second Reanimated-based path). When iOS Reduce Motion is enabled, springs/scales degrade to
  plain opacity fades; looping motion is disabled entirely (elements render static at rest:
  scale 1, base opacity). Every new animation goes through this hook.

Retrofit hardcoded values onto tokens **only in files touched by the hero moments**.

## 2. Moment A — Daily mark logged *(variable reward / behavioral "shine")*

Core loop, highest frequency. CheckinButton's spin stays; add the payoff after the check:

- Check settles with a soft radial pulse in the goal's **category accent color**
  (`categoryAccents` in tokens — personal, not generic).
- The completed row gently tints and settles (no snap).
- **Last mark of the day** gets a richer beat: success haptic + a one-time **staggered
  per-row opacity/tint pulse** down the day's list (plain `useAnimatedStyle` transforms only —
  no gradient sweep, no shimmer library). This is the reward-peak element — most checks are
  pleasant, the day-complete one is delightful. No confetti, ever.

## 3. Moment B — Momentum growth & fresh start *(endowed progress + fresh-start effect)*

- Momentum day-count increment: label ticks up with a gentle glow pulse — the user watches
  the asset grow.
- Returning after a rest day: fresh-start line enters warmly (fade + scale from 0.96).
  Structurally opposite to streak-shame apps.
- Cushion gauge in `GoalMomentum.tsx` unified onto the new tokens.

## 4. Moment C — Goal milestones *(goal-gradient effect)*

- Polish existing `app/goal/milestone.tsx` onto the vocabulary; add an **animated progress
  arc sweeping from previous value to current %** — never from zero. The arc is **net-new
  scope**: a small `components/ui/ProgressArc.tsx` built on the already-present
  `react-native-svg` + Reanimated animated props (no new dependency; no existing arc
  component to reuse).
- App-wide rule: every progress bar animates from last-known value on mount, never from zero.

## 5. Moment D — Empty & first-run states *(invitation, not void)*

- Empty states in `app/(tabs)/goals.tsx` and `app/(tabs)/focus.tsx`: slow breathing loop
  (scale 1.0→1.02, ~3s cycle, **scale only** — no opacity/rotation change, to avoid reading
  as a loading spinner) + staggered text entrance.
- `focus.tsx`'s empty state is currently text-only: add a small muted phosphor icon as the
  breathing element (new visual element, agreed in review). `goals.tsx` breathes its existing
  `SvgLogo`; manual QA must confirm it doesn't read as a spinner.
- The **only** place looping motion is allowed — an empty screen has nothing else competing
  for attention. Under Reduce Motion the loop is off and elements render static at rest.

## Guardrails

- No looping motion outside empty states.
- No animation over 500ms.
- Every effect interruptible (user input never blocked by motion).
- Reduce Motion always honored via `useMotion()`.
- Color from theme tokens only; springs/durations from motion tokens only — no new
  hardcoded values.

## Testing

- Trigger logic (what fires when: last-mark-of-day detection, momentum increment, fresh-start
  condition, milestone thresholds) lives in plain presenter functions → unit tests in
  `tests/unit/`, written **before** implementation per house rules.
- Component tests follow existing reanimated-mock patterns in `tests/unit/`.
- Manual pass: Reduce Motion on/off, light/dark theme, both empty states.

## Sequencing

Foundation → Moment A → Moment B → Moment D → Moment C.
(A and B are the daily loop; C is lowest frequency.)

## Psychological basis (reference)

| Moment | Effect | Mechanism |
|---|---|---|
| A — mark logged | Variable reward; Fogg "shine" | Celebration immediately after behavior wires the habit |
| B — momentum | Endowed-progress; fresh-start effect | Visible growing asset creates protectiveness; warm re-entry removes shame |
| C — milestones | Goal-gradient effect | Visible proximity to finish accelerates effort |
| D — empty states | Invitation / affordance | Motion directs attention to the single next action |
