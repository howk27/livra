# Phase 3.1 — Coherence + Robustness Audit: Findings

**Date:** 2026-06-22
**Design:** `docs/superpowers/specs/2026-06-22-coherence-robustness-audit-design.md`
**Status:** audit COMPLETE — all core, supporting, and notification surfaces deep-audited; auth +
profile/about spot-checked; dev/static Tier-3 skipped. See Coverage table at the end. 1×P0,
6×P1, 14×P2. Ready for fix-phase prioritization.

Severity: **P0** crash/data-loss/broken core flow · **P1** clear contradiction or broken/missing
state · **P2** deferrable polish/subjective. Lens **A** = business coherence, **B** = robustness.

---

## P0 — fix this pass

### P0-1 · "Add a mark" CTA routes to a nonexistent screen — `app/goal/[id].tsx:227`
**Lens B.** From a goal with no linked marks, the empty-state "Add a mark" button does
`router.push({ pathname: '/counter/new', params: { goalId: id } })`. There is no `app/counter/`
route (counter→mark rename); the only live route is `app/mark/new.tsx`. The primary CTA on the
empty goal-detail state dead-ends. `grep` confirms `/counter/new` appears nowhere else.
**Fix:** route to `/mark/new` with `goalId` param; confirm `mark/new` reads `goalId`.

---

## P1 — fix this pass

### P1-1 · Daily-nag notification engines contradict the business model (systemic) — `services/behaviorNotifications.ts`, `lib/notificationSystem.ts`
**Lens A.** Two live local-notification engines are built on a daily-completion, don't-miss-the-day
model with manufactured urgency and loss-aversion — the exact patterns PRODUCT.md bans (Launch
Readiness: "No copy uses guilt, fake urgency, or streak-loss language"; "No surface re-creates the
cut retention layer (brittle streaks…)").

- `behaviorNotifications.ts` `buildCopy`:
  - `end_of_day`: *"Today isn't done yet"*, *"1 mark left. Close it out before midnight."*,
    *"A few taps now beat starting over tomorrow."* — deadline urgency + restart/loss framing.
  - `momentum`: *"You said you'd do this today. There's still time."*, *"Today's on you"* — guilt.
  - `win`/`midday`: *"See you tomorrow."*, *"Finish the rest this afternoon."* — daily cadence.
- `notificationSystem.ts` `scheduleContextualDailyNotification` (fires on every mark
  create/update/delete via `useCounters`): raw `computeStreak` (lines 100–132) +
  `if (currentStreak >= 3 && !todayLogged)` 8pm nudge (line 197) = streak-protection nudging;
  *"One more today. Best week ever."* (line 232).

Reinforcing evidence: `app/settings/notifications.tsx:18` shows the user an explicit promise —
*"Livra never sends guilt. Only momentum."* — that these engines break. The app states the rule on
one screen and violates it from the notification layer.

The single sanctioned exception is the Momentum at-risk nudge within its no-guilt boundary; these
engines go far beyond it. **This is the largest contradiction found and is systemic** (copy +
scheduling logic + a still-live raw-streak counter that Momentum was meant to replace).
**Fix (needs a decision — likely its own sub-spec):** options range from (a) rewrite all copy to
per-goal / forgiving framing and delete the raw-streak nudges, to (b) gut the daily-completion
notification types and keep only the sanctioned Momentum nudge + a single opt-in gentle reminder.
Recommend deciding scope before implementing. Flag possible double-scheduling overlap between the
two engines as part of that work.

### P1-2 · Live completion overlay's "Share your win" is a no-op — `components/overlays/GoalCompletionOverlay.tsx:147`
**Lens B.** The real completion celebration (driven by `goalCompletionStore`) has
`<TouchableOpacity onPress={() => {}}>` for "Share your win" — tapping does nothing. The entire
share-card feature (Phase 2.2: generate, preview modal, Livra+ customize, save/share) is wired into
`app/goal/complete.tsx`, which is **never navigated to** (see P2-1). So a shipped feature is
unreachable from the live surface at the app's most important emotional moment.
**Fix:** port the share flow from `goal/complete.tsx` into the overlay (or open the share modal),
then resolve the dead screen per P2-1.

### P1-3 · Home screen has no loading or error state; quick-log failures are silent — `app/(tabs)/focus.tsx`
**Lens B** (violates the CLAUDE.md convention "all screens must handle empty, loading, and error
states"). `useCounters` exposes `loading` and `error`; `focus.tsx` consumes only `loading`, and
only to gate the empty state (line 529). While loading, the screen renders greeting + "0/0 marks
today" with no skeleton/spinner; `error` is never surfaced. `handleQuickIncrement` swallows failures
to `logger.error` with no user feedback (lines 245–247) — the tap silently does nothing on failure.
(The mark detail screen, by contrast, Alerts on increment failure — inconsistent.)
**Fix:** add loading + error states; surface increment failure (toast/inline) consistent with
`mark/[id]`.

### P1-4 · Android target-date picker modal is empty/non-functional — `app/goal/[id].tsx:282`
**Lens B.** The date-picker modal renders the `DateTimePicker` and "Set date" button only inside
`Platform.OS === 'ios'`. On Android the modal opens showing just the "TARGET DATE" label — no
picker, no way to set a date. iOS-first launch mitigates, but it's a broken state on a shipped
platform. **Fix:** add the Android picker branch (imperative dialog) or hide the entry on Android.

### P1-5 · Privacy screen toggles don't do anything (misleading controls) — `app/settings/privacy.tsx`
**Lens B** (compliance-sensitive). "Analytics" and "Crash Reports" toggles are `useState(true)`
local-only (lines 86–87, 136–148): not persisted, not wired to any analytics/crash SDK. Toggling
appears to change a data-collection setting but does nothing and resets on unmount. "Auto-lock" and
its interval options are likewise local-only and unenforced. "Supabase Sync: Synced" (line 196) is a
hardcoded label regardless of real sync state. Shipping a privacy screen whose controls don't
function is misleading and a compliance risk. (Biometric/Face ID toggle, by contrast, is correctly
implemented and persisted.) **Fix:** wire each toggle to real persistence + behavior, or remove /
clearly label as not-yet-active; replace the static "Synced" with real status.

### P1-6 · Expired goals vanish with no closure — `state/goalsSlice.ts:297`, `app/(tabs)/goals.tsx`, `app/goal/history.tsx`
**Lens A** (the exact "abandonment" closure gap the kickoff flagged). `checkGoalCompletion` sets a
lapsed-deadline goal to `status: 'expired'`. No consumer surface renders `'expired'`: the goals tab
lists only `'active'`, history lists only `'completed'`, mark detail explicitly excludes
`'expired'`. So a goal whose deadline passes without completing silently disappears from the entire
app — no dignified off-ramp, no record, no acknowledgement. Narrow trigger (only goals with a set
deadline that lapses) but directly contradicts "finish and rest / no abandonment." **Fix:** give
expired goals a closure surface (e.g. a gentle "time ran out — restart or archive?" state, or fold
into history as "not finished this time"). Decide the closure copy with the P1-1 / 3.2 work.

---

## P2 — logged, not fixed this pass

- **P2-1 · Dead duplicate completion screen** — `app/goal/complete.tsx`. Never navigated to
  (only registered in `_layout.tsx:611`; live path is the overlay). Also harbors an unreachable
  `'reflect'` phase (`setPhase` never called — the "What made this one possible?" reflection is
  dead; `milestone.tsx` wires the same pattern correctly at line 112). **Recommend:** delete the
  screen after porting its share wiring to fix P1-2, or repurpose it as the real completion route.
- **P2-2 · Greeting/"see you tomorrow" daily lean** — `focus.tsx:217` greeting "your journey
  continues today"; `focus.tsx:428` "That's today done. See you tomorrow." Mild daily-cadence
  framing on home. **Lens A**, low severity; revisit copy toward per-goal/rest framing.
- **P2-3 · Duplicate long-press actions** — `focus.tsx:257–258` "View details" and "Edit" both
  `router.push('/mark/{id}')`. Known UX-backlog dupe. **Lens B.**
- **P2-4 · "All done today" banner uses stale state** — `mark/[id]/index.tsx:426` reads
  `allLoggedToday` inside a `setTimeout(200)` from the render closure; may show/skip incorrectly
  after the triggering log. **Lens B**, timing reliability.
- **P2-5 · Invalid `milestoneKey` → blank headline** — `goal/milestone.tsx:48`
  `MILESTONE_COPY[key] ?? ''` renders an empty headline if the key is unknown. **Lens B** edge case.
- **P2-6 · Orphaned "YOUR GOALS" header** — `focus.tsx:434` the section + label render when active
  goals exist, but each goal card returns `null` if it has 0 marks (line 439); two active goals with
  no marks → label with no cards. **Lens B**, minor.
- **P2-7 · Static settings sub-screens — verify states** — `settings/notifications.tsx`,
  `settings/integrations.tsx`, `settings/privacy.tsx` show no loading/error/empty handling in grep.
  Likely fine (static toggles/links) but not yet read line-by-line. **Lens B**, verify.
- **P2-8 · `Linking.openURL('clock:')` unguarded** — `mark/[id]/index.tsx:950` iOS-only scheme; on
  Android the promise rejects unhandled. Health/sleep is iOS-gated, low risk. **Lens B.**
- **P2-9 · "Counter" jargon leaks in user-facing strings** — `mark/new.tsx` ("Counter created
  successfully", "Creating counter…"), `mark/[id]/edit.tsx` ("Counter not found", "Failed to update
  counter", "enter a counter name"). Despite the counter→mark rename and "Add a mark" headers.
  **Lens A** naming consistency.
- **P2-10 · Inert "Connect" affordance** — `settings/integrations.tsx:36` the Apple Health "Connect"
  badge is a styled `View` with no `onPress`; it reads as a button but does nothing (real connect is
  on the mark detail screen). **Lens B.**
- **P2-11 · Non-editable "Week Start Day" row** — `settings.tsx:593` renders "Monday" as a settings
  row with no `onPress`; looks configurable, isn't. **Lens B.**
- **P2-12 · Onboarding partial-failure is silent** — `onboarding.tsx:308` goal/mark creation runs in
  a try/catch that only logs, *after* `completeOnboarding` already succeeded. If creation fails
  (e.g. offline), onboarding is marked done and the user lands on an empty Focus with no goal/marks
  and no error. **Lens B** edge case.
- **P2-13 · "Skip for now" may re-show onboarding** — `onboarding.tsx:512` navigates to Focus
  without calling `completeOnboarding`; verify the gate doesn't re-present onboarding next launch.
  **Lens B**, verify.
- **P2-14 · Unused loading state** — `mark/[id]/edit.tsx:114` sets `loading` but never renders a
  loading UI (save button isn't even disabled on it). Minor. **Lens B.**

---

## Surfaces audited clean (no findings)

- `app/(tabs)/goals.tsx` — loading/error/empty all handled; empty-state copy on-brand
  ("You finished everything." / "Start your next goal when you are ready.").
- `app/goal/history.tsx` — empty state + accomplishment framing ("Done." / "things you actually
  finished").
- `app/goal/new.tsx` — saving/error states; soft goal-limit nudge ("Two goals at a time").
- `app/mark/[id]/index.tsx` — exemplary: loading/not-found/error all handled, mutations guarded,
  on-brand rest copy. (Except P2-4.)
- `app/paywall.tsx` — exemplary IAP state coverage, ErrorBoundary-wrapped; calm on-brand copy,
  no fake urgency, core loop never walled.
- `hooks/useCounters.ts` — optimistic write with DB-failure rollback + reconciliation.
- `components/overlays/GoalCompletionOverlay.tsx` copy — on-brand ("Done. That one's yours
  forever."). (Except the no-op share button, P1-2.)
- `app/onboarding.tsx` — intentional on-brand copy, transparent AI disclosure, "change anytime",
  no streak/treadmill language; robust loading/error/auth states. (Except P2-12/P2-13.)
- `app/(tabs)/settings.tsx` — robust account deletion / reset / export / sync-error handling; soft
  Pro nudges on-brand. (Except P2-11.)
- `state/goalsSlice.ts completeGoal` + `_layout.tsx` overlay trigger — momentum banking, XP gate,
  and transition-only overlay firing are correct. (Expiry path is P1-6.)

---

## Coverage

| Surface | Status |
|---|---|
| focus, goals, goal/new, goal/[id], goal/complete, goal/history, goal/milestone | deep-audited |
| mark/new, mark/[id]/index, mark/[id]/edit | deep-audited |
| onboarding, paywall | deep-audited |
| settings (hub), settings/notifications, settings/integrations, settings/privacy | deep-audited |
| GoalCompletionOverlay, useCounters, goalsSlice (completeGoal/credit/expiry), _layout overlay trigger | deep-audited |
| behaviorNotifications, notificationSystem | deep-audited |
| auth (signin/reset-password/reset-password-complete/signing-out) | grep spot-check (rich loading/error states confirmed) |
| settings/profile, settings/about | grep spot-check (states present) |
| momentumWarningPlanner | not read (logic, heavily unit-tested) |
| share-card components (GoalCompletionShareCard, SharePreviewModal) | seen via goal/complete.tsx; wiring is P1-2/P2-1 |
| diagnostics, iap-dashboard, legal/* | Tier-3 (dev/static) — basic check only, no findings expected |

## 3.2 hand-off note
P2-1 (dead completion screen), P1-6 (expired-goal closure), and the post-completion maintenance-mark
question all touch closure/maintenance UX. The expired-goal closure copy and the "resting between
goals" Focus state should be decided together with 3.2. No standalone maintenance-marks defect
surfaced in audited surfaces beyond these.
