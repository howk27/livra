# Phase 1.5 — Momentum & at-risk toggle + real notification prefs

Date: 2026-06-20
Branch (planned): `feat/momentum-label-copy` off `docs/product-direction`
ROADMAP: §Phase 1, item 1.5 (`ROADMAP.md:91`)
Related: `docs/superpowers/specs/2026-06-17-momentum-design.md` (Momentum), `PRODUCT.md:294` / `PRODUCT.md:418`

## Problem

ROADMAP 1.5 says: "Settings/notification toggle reads 'Momentum & at-risk status'." Investigation shows
the real situation is larger than a label swap:

1. **No momentum toggle exists.** `app/settings/notifications.tsx` has four toggles (Daily Reminder,
   Goal Progress Updates, Weekly Summary, Mark Reminders) and none for momentum/at-risk.
2. **The toggles are fake.** All four are local `useState` (lines 85-88) — nothing persists or wires to a
   notification subsystem. This violates the project rule "Zustand slices only — never useState for
   persistent data" and means flipping any switch does nothing.
3. **The momentum gate is invisible and coupled.** Momentum warnings *are* gated, but by the master key
   `livra_reminders_enabled_v1` (`getLivraRemindersEnabled`), which **also** gates the daily reminder. That
   key has no UI surface, and it couples two unrelated behaviors.
4. **Two toggles have no backend at all.** Goal Progress Updates and Weekly Summary schedule no
   notification — milestones are folded into the daily notification ("Tier 4" in `lib/notificationSystem.ts`),
   and the weekly review is an in-app prompt (`lib/review/weeklyReview.ts`), not a push.

## Decisions (locked during brainstorming)

- **Scope:** add a real Momentum toggle *and* make the remaining toggles real persisted prefs.
- **Backend-less toggles removed:** drop Goal Progress Updates and Weekly Summary. Every remaining switch
  must gate a real notification. Final screen = three toggles.
- **Persistence:** source of truth = AsyncStorage helper functions (extend the existing
  `lib/notifications/livraReminderPrefs.ts` pattern), because background schedulers run outside React and
  read prefs with `await`. UI binds via a custom hook that hydrates on mount and writes through — replacing
  the fake `useState`. (A Zustand slice was rejected: background, notification-triggered launches may run
  before a persisted store hydrates.)
- **Out of scope (YAGNI):** notification backends for Goal Progress / Weekly Summary; a pace-notification
  toggle (Livra+, configured per-goal elsewhere); daily-reminder-hour UI changes.

## Pref model

Split the master key into three independent, single-purpose AsyncStorage keys.

| Toggle | Key | Default | Gates |
|---|---|---|---|
| **Daily Reminder** | `livra_reminders_enabled_v1` (existing — narrowed to "daily") | on | `scheduleContextualDailyNotification` (`lib/notificationSystem.ts:169`), `notificationService.updateNotifications` (`services/notificationService.ts:137`) |
| **Momentum & at-risk status** | `livra_momentum_warnings_enabled_v1` (new) | inherits master on first read, then independent | `reconcileMomentumWarnings` (`services/momentumWarningNotifications.ts:52`) |
| **Mark Reminders** | `livra_mark_reminders_enabled_v1` (new) | on | `scheduleMarkReminder` (`lib/notifications/markReminder.ts`) |

### Migration safety

`getMomentumWarningsEnabled()` does **lazy migration**: if its key is unset, it reads the current
`livra_reminders_enabled_v1` value, writes it back to the momentum key once, and returns it. This preserves
existing user intent — someone who had turned reminders *off* does not suddenly start receiving momentum
warnings after the split; everyone else defaults on. After the first read the two keys are fully decoupled.

`livra_mark_reminders_enabled_v1` defaults on with no inheritance: mark reminders were never gated, so
default-on preserves current behavior exactly.

The existing `getLivraRemindersEnabled` / `setLivraRemindersEnabled` and their call sites in
`lib/notificationSystem.ts`, `services/notificationService.ts`, and `hooks/useNotifications.ts` are
unchanged — they already mean "daily reminder."

## Components

- **`lib/notifications/livraReminderPrefs.ts`** — keep the existing daily getter/setter. Add:
  - `getMomentumWarningsEnabled()` / `setMomentumWarningsEnabled(enabled)` with lazy inherit-and-write-back.
  - `getMarkRemindersEnabled()` / `setMarkRemindersEnabled(enabled)` (default on).
  - Export the two new key constants. NOTE: the account-delete cleanup that clears
    `livra_reminders_enabled_v1` lives in `app/(tabs)/settings.tsx`, which is currently uncommitted WIP and
    must not be touched in this branch. Adding the two new keys to that cleanup list is **deferred** (a
    leftover pref after account delete is harmless — defaults restore on next use). Revisit when settings.tsx
    lands.

- **`hooks/useNotificationPrefs.ts` (new)** — hydrates the three booleans on mount from the helpers; exposes
  per-toggle `{ value }` plus a `hydrated` flag and write-through setters. Each setter (a) persists via the
  helper and (b) fires the matching side effect:
  - Daily Reminder → trigger the existing daily reschedule path (`notificationService.updateNotifications`
    / `requestLivraLocalNotificationReschedule`), which already cancels when disabled.
  - Momentum → `reconcileMomentumWarnings(userId)` (cancels when its key is off; reschedules when on).
  - Mark Reminders → `reconcileMarkReminders(...)` (cancel-all when off; reschedule-from-stored when on).
  - `userId` is obtained from the same session source used in `app/_layout.tsx` / `hooks/useCounters.ts`.

- **`app/settings/notifications.tsx`** — remove the Goal Progress Updates and Weekly Summary rows; render
  three `ToggleRow`s bound to the hook; add the "Momentum & at-risk status" row. Switches render disabled
  until `hydrated`.

- **`lib/notifications/markReminder.ts`** — `scheduleMarkReminder` guards on `getMarkRemindersEnabled()`
  (no-ops when off). Add `reconcileMarkReminders(marks)`: when off, cancel all per-mark reminders; when on,
  reschedule from stored per-mark times (`getMarkReminderTime`).

- **`services/momentumWarningNotifications.ts:52`** — read `getMomentumWarningsEnabled()` instead of
  `getLivraRemindersEnabled()`.

## Copy (no-guilt guardrail — `PRODUCT.md:298`)

- **Momentum & at-risk status** — subtitle: "A gentle nudge when a goal needs attention. Never a penalty."
  - No streak-loss, guilt, or fake-urgency language. No em-dash, en-dash, or hyphen-as-dash.

## States (empty / loading / error)

- **Loading:** hook exposes `hydrated`; switches are disabled until hydration completes. Default values match
  the helper defaults, so there is no value flicker on render.
- **Error:** persist failures are caught and logged via the existing helper `try/catch` pattern; UI stays
  optimistic (the toggle reflects the user's intent even if the write fails).
- **No permission:** unchanged — permission gating stays inside the scheduling services. Toggling a pref still
  persists; scheduling simply no-ops without permission.

## Testing (tests-first)

- `livraReminderPrefs`: new getters/setters; momentum lazy-inherit + one-time write-back; mark default-on.
- `momentumWarningNotifications` (extend `tests/unit/momentumWarningNotifications.test.ts`): gated by the
  momentum key — off cancels by prefix, on proceeds; independent of the daily key.
- `markReminder`: `scheduleMarkReminder` no-ops when global gate off; `reconcileMarkReminders` cancels all
  when off and reschedules from stored times when on.
- Copy guardrail: assert the new subtitle contains no guilt/dash language.
- Hook (if practical under the RN test setup): hydrate from helpers + write-through; otherwise rely on the
  thoroughly-tested helper layer.

## Acceptance

- Settings → Notifications shows exactly three toggles, each gating a real notification subsystem.
- A "Momentum & at-risk status" toggle exists, persists, and independently enables/disables momentum
  warnings without affecting the daily reminder.
- No toggle uses local `useState` for its persisted value.
- Existing users' effective behavior is unchanged on first launch after the split (migration safety holds).
- Full suite green, type-check + lint clean (no new violations).
