# Phase 1.5 — One master notification switch + daily nudge guardrail

Date: 2026-06-20
Branch (planned): `feat/momentum-label-copy` off `docs/product-direction`
ROADMAP: §Phase 1, item 1.5 (`ROADMAP.md:91`)
Related: `docs/superpowers/specs/2026-06-17-momentum-design.md` (Momentum), `PRODUCT.md:294` / `PRODUCT.md:418`

## Problem

ROADMAP 1.5 was scoped as "Settings/notification toggle reads 'Momentum & at-risk status'." Investigation
showed the settings screen is broken in a deeper way, and the product owner chose to redesign the model
rather than relabel:

1. **The four toggles are fake.** `app/settings/notifications.tsx` shows Daily Reminder, Goal Progress
   Updates, Weekly Summary, Mark Reminders — all local `useState` (lines 85-88). Nothing persists or wires
   to a notification subsystem. Flipping any switch does nothing. (Violates "Zustand slices only — never
   useState for persistent data.")
2. **The real gate is invisible.** The only working control is the master key `livra_reminders_enabled_v1`
   (`getLivraRemindersEnabled`), which gates the daily reminder and momentum warnings but has no UI surface.
3. **Two toggles have no backend.** Goal Progress Updates and Weekly Summary schedule no notification
   (milestones fold into the daily notification; the weekly review is an in-app prompt).
4. **The master switch does not cover everything.** `scheduleMarkReminder`
   (`lib/notifications/markReminder.ts`) is ungated, so even the working master key does not silence
   mark reminders. A user who turned reminders "off" still received mark reminders.

## How notifications actually fire today (verified)

- **Daily reminder** — `scheduleContextualDailyNotification` (`lib/notificationSystem.ts`): exactly one per
  day (single identifier).
- **Momentum / at-risk** — `reconcileMomentumWarnings` (`services/momentumWarningNotifications.ts`) via
  `planMomentumWarnings` (`lib/momentumWarningPlanner.ts`): **at most one push per calendar day** (multiple
  at-risk goals are merged into one combined notification).
- **Pace notification** — `schedulePaceNotification` exists but is **dead code: no caller anywhere**. Never
  fires today.
- **Mark reminders** — `scheduleMarkReminder`: one per mark for which the user set a time. The only category
  that can stack.

So Livra's own nudges are already ≤2/day. The "4-5 notifications" risk comes almost entirely from
user-configured mark reminders.

## Decisions (locked during brainstorming)

- **One master switch.** Collapse the four fake toggles into a single persisted "Notifications" master switch
  governing every Livra notification (daily, momentum/at-risk, mark reminders).
- **Daily nudge guardrail.** A hard ceiling of **2 Livra-initiated notifications per calendar day**, with
  **at-risk as the top-priority item**. Mark reminders are **exempt** from the cap (the user set those times
  deliberately) but still obey the master switch.
- **At-risk day suppresses the routine daily.** On a day a goal is genuinely at-risk, only the at-risk nudge
  fires; the routine daily reminder is suppressed for that day. Normal days fire only the daily reminder.
  Net lived experience: **≤1 Livra-initiated nudge per day** today, with headroom of 2 as the ceiling.
- **One switch is sufficient.** No dedicated at-risk sub-toggle. The 2/day ceiling plus the existing
  no-guilt copy keep at-risk gentle enough; PRODUCT.md / ROADMAP get updated to record this.
- **Removed:** Goal Progress Updates and Weekly Summary toggles (no backend).
- **Out of scope (YAGNI):** wiring the dead pace notification; building Goal Progress / Weekly Summary
  notification backends; daily-reminder-hour UI.

## Pref model

Reuse the existing single master key — no new keys, no split.

| Control | Key | Default | Governs |
|---|---|---|---|
| **Notifications** (master) | `livra_reminders_enabled_v1` (existing) | on | daily reminder, momentum/at-risk, **and** mark reminders |

`getLivraRemindersEnabled` / `setLivraRemindersEnabled` stay. The change is that **mark reminders now also
respect this key** (previously ungated).

### Migration / behavior change

- Master **on** (default): unchanged for daily + momentum; mark reminders continue to fire (they were
  effectively on). No user-visible change.
- Master **off**: mark reminders now stop too. Previously a master-off user still received mark reminders —
  that was a leak. After this change, "off" means off. This is the intended correct behavior; called out so
  it is a deliberate, documented change rather than a surprise.

## Guardrail mechanism

The 2/day ceiling and at-risk priority are enforced by three cooperating rules — no separate counter store
needed, because each category is already ≤1/day:

1. **Daily reminder ≤1/day** — already true (single identifier).
2. **Momentum/at-risk ≤1/day** — already true (`planMomentumWarnings` merges to one push per day).
3. **At-risk suppresses the routine daily.** `scheduleContextualDailyNotification` checks whether a momentum
   warning is planned for *today* before scheduling the daily; if so, it skips the daily (the at-risk nudge
   is the more important one). The check uses the same planner inputs
   (`momentumWarningDates` / `planMomentumWarnings`) so it is deterministic and independent of scheduling
   order — it does not rely on querying the OS notification queue.

**Invariant (documented):** any future Livra-initiated notification type MUST route through this same
priority/suppression check before scheduling, so the 2/day ceiling holds. This is the single place to extend.

## Components

- **`app/settings/notifications.tsx`** — remove all four existing rows; render **one** master `ToggleRow`
  ("Notifications"). Bind it via a small hook (below) to the existing master key. Switch is disabled until
  hydrated. Update the intro/explanatory copy to describe the calm, capped model.

- **`hooks/useNotificationsMaster.ts` (new, small)** — hydrates the master boolean on mount from
  `getLivraRemindersEnabled`; exposes `{ enabled, hydrated, setEnabled }`. `setEnabled` persists via
  `setLivraRemindersEnabled` and fires the reconcile side effects:
  - daily reschedule (`notificationService.updateNotifications` / existing reschedule path),
  - `reconcileMomentumWarnings(userId)`,
  - `reconcileMarkReminders(marks)` (new — see below).
  `userId` / `marks` come from the same session + store sources used in `app/_layout.tsx` and
  `hooks/useCounters.ts`.

- **`lib/notifications/markReminder.ts`** — `scheduleMarkReminder` guards on `getLivraRemindersEnabled()`
  (no-ops when master off). Add `reconcileMarkReminders(marks)`: when master off, cancel all per-mark
  reminders; when on, reschedule each from its stored time (`getMarkReminderTime`).

- **`lib/notificationSystem.ts`** — in `scheduleContextualDailyNotification`, before scheduling today's
  daily, skip if a momentum warning is planned for today (suppress-on-at-risk). Extract a small shared helper
  (e.g. `hasMomentumWarningPlannedForToday(userId, today)`) so both this and the momentum service can reuse
  the planner without duplicating logic.

## Copy (no-guilt guardrail — `PRODUCT.md:298`)

- Master row label: **"Notifications"**; subtitle: "Gentle nudges only — at most a couple a day, and never
  guilt." (No streak-loss / fake-urgency language; no em-dash, en-dash, or hyphen-as-dash.)
- Keep the screen intro line "Livra never sends guilt. Only momentum." (already compliant).
- At-risk notification copy is unchanged (already shipped in Phase 1.3, already no-guilt). Prioritizing it is
  a scheduling decision, not a copy change — no "you're losing your streak" language is introduced.

## States (empty / loading / error)

- **Loading:** hook exposes `hydrated`; the switch is disabled until hydration completes. Default matches the
  helper default (on), so no value flicker.
- **Error:** persist failures are caught and logged (existing helper `try/catch` pattern); UI stays optimistic.
- **No permission:** unchanged — permission gating stays inside the scheduling services; toggling still
  persists the pref.

## Doc updates

- **`ROADMAP.md:91`** — rewrite item 1.5 from "toggle reads 'Momentum & at-risk status'" to the
  single-master-switch + 2/day guardrail model described here.
- **`PRODUCT.md`** — the monetization table line (`PRODUCT.md:418`, "Momentum & at-risk status ✅ ✅") stays.
  Update the §294 stress-point note: the settings model is a single master notification switch with a 2/day
  Livra-initiated ceiling and at-risk priority; at-risk controllability is satisfied by the calm cap rather
  than a dedicated off-switch.

## Testing (tests-first)

- `markReminder`: `scheduleMarkReminder` no-ops when master off; `reconcileMarkReminders` cancels all when
  off and reschedules from stored times when on.
- `notificationSystem`: daily reminder is suppressed when a momentum warning is planned for today; fires
  normally when none is.
- `hasMomentumWarningPlannedForToday` helper: true on an at-risk fire day, false otherwise (pure, planner-based).
- `momentumWarningNotifications`: still gated by the master key (unchanged behavior; keep existing coverage).
- Copy guardrail: assert the master subtitle contains no guilt/dash language.
- Hook (if practical under the RN test setup): hydrate + write-through; otherwise rely on the helper layer.

## Acceptance

- Settings → Notifications shows exactly one master switch; it persists across navigation.
- Master off silences everything, including mark reminders.
- On an at-risk day, the user receives the at-risk nudge and NOT the routine daily reminder.
- Livra-initiated notifications never exceed 2 on any calendar day; at-risk is always the kept priority.
- Mark reminders fire on their user-set times when the master is on, and are not throttled by the cap.
- No persisted toggle uses local `useState`.
- ROADMAP 1.5 and the PRODUCT.md §294 note reflect the single-switch model.
- Full suite green, type-check + lint clean (no new violations).
