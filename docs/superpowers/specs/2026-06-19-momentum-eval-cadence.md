# Decision — Momentum eval cadence (Phase 1.0 gate)

> Status: **decided.** Closes ROADMAP.md Phase 1.0, which blocked 1.1–1.3.
> Date: 2026-06-19 · Branch context: `docs/product-direction`
> Source spec: `2026-06-17-momentum-design.md` (mechanic §2, decisions §7).
> Engine under test: `lib/goalMomentum.ts` + `lib/goalMomentumStore.ts` (PR #1, unwired).

## The question

The engine only *starts* a run on a same-day `on_track` evaluation:
`goalMomentumState` returns `on_track` only when some mark has `gap <= 0` (logged today),
and `nextMomentumRecord` sets `startDate = today` only when `state === 'on_track'`. So a run
can **only** begin during an evaluation that happens on the same calendar day as a log. If
`evaluateGoalMomentum` is only ever called lazily on read (e.g. the next time the focus screen
mounts, a day later), the logged mark already has `gap >= 1` → `resting`, the start condition
is never met, and Momentum never begins. The gate: **decide when `evaluateGoalMomentum` runs
relative to a log.**

## Decision

**Two triggers, no engine change.**

1. **On every linked log (primary — this is what starts/continues the run).**
   Call `evaluateGoalMomentum(goalId, marks, today)` from inside
   `state/goalsSlice.ts → creditMarkToGoals` (`goalsSlice.ts:239`), for each goal it already
   resolves as `status === 'active'` (`goalsSlice.ts:248`). This runs in the existing post-log
   `InteractionManager.runAfterInteractions` block (`hooks/useCounters.ts:320-375`, fired via
   `creditMarkToGoals` at `useCounters.ts:349-353`), the same place streak/XP/goal-credit
   already run. Because this fires on the day of the log, the goal evaluates `on_track` and the
   run starts/continues reliably. `last_activity_date` is already written synchronously before
   this block (`state/countersSlice.ts:216`), so the marks the engine reads are current.

2. **On app foreground (decay — catches slipping/broken with no log).**
   Re-evaluate the active goal(s) when the app foregrounds, alongside the existing behavior-
   notification recompute (`scheduleBehaviorNotifications` is already invoked from
   `app/_layout.tsx:238` on `AppState 'active'`). Pure inactivity produces no log, so only a
   read-time re-eval moves a goal into `slipping`/`broken`, drives the in-app at-risk banner
   (1.2/1.3), and lets the nudge be (re)scheduled.

We do **not** relax the engine's start condition. The `on_track`-to-start rule is the meaning
("the run started because you showed up today"); keeping it intact preserves the already-tested
engine semantics (PR #1) and pushes the wiring entirely into the app layer.

## Scope of evaluation (per the design spec, confirmed against code)

- Momentum is **per active goal** (spec §2, §9). `creditMarkToGoals` and `checkGoalCompletion`
  already gate on `status === 'active'`, so evaluation naturally tracks the active goal and
  ignores `queued` goals (which spec §7.4 says start at 0 when promoted).
- The "one goal active vs free-tier 2 goals" tension (PRODUCT.md:95/448, deferred to ROADMAP
  2.3) does **not** block this: evaluating *per active goal* and persisting a record per
  `goalId` is forward-compatible whether one or two goals are active. The focus screen shows
  the foregrounded goal's snapshot. No decision is pre-empted here.

## Notification delivery (the 1+1 nudge)

**Pre-scheduled local notifications**, reusing the existing
`services/behaviorNotifications.ts` scheduling path (no OS background-fetch task):

- When a goal **enters at-risk**, schedule the first nudge; when it reaches the day before
  `breakGap`, schedule the one final nudge. Hard ceiling 1 + 1 per run (spec §4).
- Fires even if the app stays closed (local notifications are pre-scheduled), which is exactly
  when an at-risk warning is most useful.
- Honors quiet hours / reminder prefs already wired through
  `lib/notifications/livraReminderPrefs.ts` (read in `hooks/useNotifications.ts:37`). If push
  is off, the in-app at-risk banner carries the same warning (spec §4 "degrades gracefully").
- Rotating copy pool from spec §10 lands in `lib/copy.ts` (built in 1.3).

A background-fetch task was rejected for now: added battery/OS-throttling/permission cost for
marginal timeliness over pre-scheduled local notifications. Revisit only if pre-scheduling
proves insufficient.

## What this unblocks

- **1.1 streak-machinery transform** — `anyStreakAtRisk` (`services/behaviorNotifications.ts`)
  is repurposed to read Momentum state from the foreground re-eval (trigger 2).
- **1.2 representation** — `focus.tsx` reads the persisted snapshot (recomputed on render +
  refreshed by trigger 2).
- **1.3 banner + 1+1 notification** — scheduled from the at-risk transition detected by
  triggers 1 and 2, delivered as pre-scheduled local notifications.
- **1.4 completion banking** — co-locates in `creditMarkToGoals → completeGoal`
  (`goalsSlice.ts:264, 267, completeGoal`), the same path trigger 1 already runs through.

## Verified references

- `hooks/useCounters.ts:166` `incrementMark`; post-log block `:320-375`; `creditMarkToGoals`
  call `:349-353`.
- `state/countersSlice.ts:216` writes `last_activity_date`.
- `state/goalsSlice.ts:239` `creditMarkToGoals`; `:248` active-status filter; `:264`
  completion chain; `:267` `checkGoalCompletion`.
- `app/_layout.tsx:238` foreground `scheduleBehaviorNotifications`.
- `services/behaviorNotifications.ts` `anyStreakAtRisk` (in `computeDayProgress`),
  `scheduleBehaviorNotifications`.
- `hooks/useNotifications.ts:37` reminder-pref read.
