# P1-1 — Notification Coherence Rewrite (design)

**Date:** 2026-06-22
**Roadmap:** Phase 3.1, finding P1-1 (carved out of the batch-1 fix plan for its own brainstorm).
**Seed:** `docs/superpowers/specs/2026-06-22-coherence-robustness-audit-findings.md` (P1-1).
**Status:** design approved; spec for plan-writing.

## Problem

The audit found the app's push-notification layer contradicts its own positioning ("finish and
rest, per-goal cadence, never guilt"). Multiple overlapping engines fire daily-completion,
deadline-urgency, and streak-loss copy — the exact patterns `PRODUCT.md` bans — while
`settings/notifications.tsx` promises *"Livra never sends guilt. Only momentum."*

Live engines today:
- `lib/notificationSystem.ts` `scheduleContextualDailyNotification` — raw `computeStreak` +
  tier/near-miss daily nudges ("One more today. Best week ever."). Called from `_layout.tsx`
  (foreground), `hooks/useNotifications.ts`, and `hooks/useCounters.ts` (×4, on every mark mutation).
- `services/behaviorNotifications.ts` `scheduleBehaviorNotifications` — `momentum`/`midday`/
  `end_of_day`/`win` nag types ("Close it out before midnight", "You said you'd do this today").
  Driven by `services/livraLocalNotificationOwner.ts`.
- `services/notificationService.ts` `updateNotifications` — schedules "the daily".
- **Sanctioned, keep:** `services/momentumWarningNotifications.ts` `reconcileMomentumWarnings`
  (the Momentum at-risk nudge), `lib/notifications/markReminder.ts` (opt-in per-mark reminders),
  `lib/notifications/sleepNotification.ts` (health/sleep wake).

## Decision (north-star)

**Sanctioned set + one gentle re-engagement nudge.** Keep only what `PRODUCT.md` sanctions plus a
single, infrequent, dormancy-based re-engagement nudge. Delete the daily-completion engines.

## Target notification set

**Keep unchanged:** Momentum at-risk nudge (`momentumWarningNotifications.ts`), per-mark reminders
(`markReminder.ts`), sleep/wake (`sleepNotification.ts`).

**Add:** gentle re-engagement nudge (new `lib/notifications/reengageNudge.ts`).

**Delete:**
- `services/behaviorNotifications.ts` nag types + copy (`buildCopy`, `planCandidates`, the
  `momentum`/`midday`/`end_of_day`/`win` machinery).
- `scheduleContextualDailyNotification` in `lib/notificationSystem.ts`, including the raw
  `computeStreak` and tier/near-miss daily nudges.
- The daily-completion scheduling in `notificationService.updateNotifications` ("the daily").

## The re-engagement nudge

- **Trigger:** `activeGoalCount ≥ 1` AND `daysIdle ≥ 7`, where `daysIdle = today − max(last_activity_date)`
  across marks linked to active goals (no log activity in 7 days).
- **Cadence:** fires once at 7 idle days; if still idle, at most once per 7 days thereafter
  (tracked via a persisted `lastReengageNudgeDate`). Never daily; never completion-based.
- **Scope:** per-app — exactly one notification, never stacks.
- **Suppression precedence (skip the nudge if any hold):**
  1. master notifications toggle is off (`getLivraRemindersEnabled`),
  2. a Momentum at-risk warning is already planned/firing (at-risk is more specific — it wins),
  3. notification permission not granted,
  4. no active goal, or `daysIdle < 7`, or `< 7` days since `lastReengageNudgeDate`.
- **Copy (no guilt, no urgency, references rest):**
  - Title: `Your goal is still here.`
  - Body: `Whenever you're ready, pick up where you left off. There's no rush.`
  - (Body chosen to pass the no-banned-token copy guard — an earlier draft used "No streak to
    lose…" which trips the literal `streak`/`lose` tokens despite reassuring intent.)

## Architecture / consolidation

- `services/livraLocalNotificationOwner.ts` remains the single coalescing owner, but its flush
  calls a new `scheduleReengageNudge(userId)` instead of `scheduleBehaviorNotifications`. It keeps
  its existing gates (master-enabled, permission).
- Remove direct `scheduleContextualDailyNotification` call sites: `hooks/useCounters.ts` (×4),
  `hooks/useNotifications.ts`, `app/_layout.tsx` foreground. Re-engagement is evaluated on
  foreground / `notificationsMaster` reconcile **only**, not on every mark mutation.
- `services/notificationsMaster.ts` reconciles the final set: per-mark reminders +
  momentum warnings + re-engage. Its `updateNotifications` daily-completion call is removed.
- Delete `behaviorNotifications.ts` and the `scheduleContextualDailyNotification` body once all
  call sites are repointed. Keep their tests only where they cover surviving behavior; delete tests
  that asserted the removed nag copy.

## Re-engage logic boundary (testable unit)

Pure function, no I/O, so it can be unit-tested directly:

```
planReengageNudge(input: {
  activeGoalCount: number;
  daysIdle: number;          // today − max(last_activity_date) across active-goal marks
  lastNudgeDate: string | null;  // 'yyyy-MM-dd' of last re-engage nudge, or null
  atRiskPlanned: boolean;    // a momentum at-risk warning is already planned for today
  today: string;             // 'yyyy-MM-dd'
}): { title: string; body: string } | null
```

Returns the nudge when the trigger conditions (4) hold and the at-risk suppression (2) does not
apply; returns `null` otherwise. The master-toggle gate (1) and permission gate (3) stay in the
scheduling layer (`scheduleReengageNudge` / owner), not in this pure function — they require I/O
(`getLivraRemindersEnabled`, `Notifications.getPermissionsAsync`).

## Coherence cleanup (folded in)

- `app/(tabs)/focus.tsx`: replace the daily-lean line "That's today done. See you tomorrow."
  (`focus.tsx:428`) with rest-framed copy: "That's everything for today." (no "see you tomorrow").
- `app/(tabs)/focus.tsx` greeting daily-lean ("your journey continues today") — soften to drop the
  daily "today" implication (P2-2).
- The **P1-6 expired-goal closure copy tone** is decided here (no-guilt, "time ran out — no failure"
  framing) so it is consistent; the expired-goal *UI surfacing* remains its own task (held for 3.2),
  out of scope for this spec.

## Out of scope

- Expired-goal UI surfacing (P1-6 — held for 3.2).
- Per-mark reminder, momentum at-risk, and sleep logic (kept as-is).
- The batch-1 fixes already planned (`plans/2026-06-22-coherence-robustness-fixes.md`).

## Testing

- TDD `planReengageNudge` as a pure function: 7-day threshold (6 → null, 7 → nudge), weekly cap
  (lastNudgeDate 6 days ago → null, 7 → nudge), at-risk suppression (`atRiskPlanned` → null),
  no active goal → null.
- Copy guard test: nudge body/title contain none of the banned tokens (streak, "don't", "miss",
  "tomorrow", urgency), mirroring `tests/unit/notificationCopy.test.ts`.
- Deletion guard test: no source references to the removed daily-nag copy or the
  `scheduleContextualDailyNotification` daily/streak path remain.
- Full Jest suite green; `type-check` and `lint` non-regressing.
