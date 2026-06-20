# Momentum At-Risk Warning (Phase 1.3) — Design

> Source mechanic spec: `docs/superpowers/specs/2026-06-17-momentum-design.md` (§3 at-risk
> merges modules, §4 the 1+1 notification, §7 gap math, §7.6 cushion gauge, §10 copy pool).
> Eval cadence: `docs/superpowers/specs/2026-06-19-momentum-eval-cadence.md`.
> Builds on Phase 1.1 (eval wiring, merged `60dc1e8`) and Phase 1.2 (representation, merged
> `aad3dec`). Tracked as ROADMAP.md Phase 1.3.

## 1. Goal

Give the user a calm, actionable heads-up *before* a goal's Momentum breaks, plus an in-app
banner that carries the same signal when push is unavailable. Because the cushion is
frequency-scaled and therefore invisible (§2 of the mechanic spec), the warning is the only
way the user knows where the edge is — it is information, not a nag.

## 2. Scope

- **Per active goal** (the app allows up to 2 active goals; Phase 1.2 already renders Momentum
  per active-goal card). Each active goal can independently be at-risk. This reconciles
  PRODUCT.md's "one Momentum on THE active goal" wording, which must be updated to
  "per active goal" (see §11).
- Un-goaled daily habits never warn (no Momentum).
- A goal is **at-risk / slipping** when its weakest active mark passes its at-risk gap, and
  **breaks** when any active mark passes its break gap (weakest-link aggregation, mechanic
  spec §7.2).

## 3. Scheduling model — predictive pre-scheduling

At-risk happens by *time passing*. If the warning waited to "detect" at-risk, a user who never
opens the app would never be warned. So the warning is **pre-scheduled predictively** from the
last qualifying log, as OS-level local notifications that fire whether or not the app is open.

On each Momentum eval — the two cadence points from Phase 1.1: a linked log
(`creditMarkToGoals`) and app foreground (`evaluateActiveGoalsMomentum`) — the warning service
recomputes, per active goal, from the relevant mark(s):

- `atRiskDate = lastActivity + atRiskGap` → **first nudge**, fired that day in a calm jittered
  daytime window.
- `breakDate = lastActivity + breakGap` → **final nudge**, fired on `breakDate − 1` (so the
  break lands the day *after* the final nudge).

**Daytime window.** A nudge fires within a humane local-time window of **~9:00–20:00**,
jittered (reuse the engagement planner's window/jitter helpers in `behaviorNotifications.ts`,
e.g. `pickFireInWindow`). This window is the quiet-time honoring — there is no separate
quiet-hours system. If the only valid date for a nudge is today but the window has already
passed (computed at a late foreground), that nudge is skipped rather than pushed to tomorrow
(past-window skip, §3.1).

where `atRiskGap = ceil(I) + 1`, `breakGap = ceil(2I) + 1`, and `I = 7 / weekly_target`
(mechanic spec §7.1; the engine already computes these in `markMomentum`).

**Gap reference table** (from the mechanic spec):

| Frequency      | Interval I | atRiskGap | breakGap | first nudge day | final nudge day |
| -------------- | ---------- | --------- | -------- | --------------- | --------------- |
| Daily (7×/wk)  | 1.0        | 2         | 3        | last + 2        | last + 2        |
| 4×/week        | 1.75       | 3         | 5        | last + 3        | last + 4        |
| 2×/week        | 3.5        | 5         | 8        | last + 5        | last + 7        |

**Daily marks collapse to a single nudge** — `atRiskDate` and `breakDate − 1` fall on the same
day. Their cushion is tiny, so one warning is correct.

**Per-goal "relevant mark."** A goal may have several marks. The warning dates are computed
from the mark that drives the goal's at-risk/break transition — the **weakest link**: the mark
whose `breakDate` is soonest (i.e., the first mark that would break). Ties broken by soonest
`atRiskDate`, then by lowest cushion fraction. This matches §7.2 aggregation.

### 3.1 The 1+1 ceiling and reset — structural, not stateful

Because the pair is recomputed and **replaced** on every eval, and **a nudge whose fire window
is already in the past is never scheduled**, the ceiling is enforced by construction:

- At most one first nudge + one final nudge per at-risk episode.
- A qualifying log moves `lastActivity` forward → on the next eval the goal is no longer near
  its gaps → its pending pair is cancelled.
- If the goal later climbs back toward at-risk, fresh future dates produce a fresh 1+1. A
  recover-then-slip-again is naturally a new episode. No episode-ID bookkeeping is needed.
- Re-firing is prevented by the past-window skip: once the first nudge's window has passed,
  a later foreground will not reschedule it; only a still-future final nudge remains.

## 4. Cross-goal merge — at most one at-risk push per day

With per-goal scheduling, two slipping goals could otherwise stack up to four nudges. To stay
globally bounded and calm while never silently ignoring a goal the user committed to:

- **At most one at-risk push per calendar day, total.**
- When two goals have a nudge due on the **same day**, they merge into **one combined push
  that names both goals**, in the gentle "slipping" framing — even if one of them is
  technically a final (about-to-break) nudge. Never an "about to break" alarm tone.
- Goals whose nudge days **differ** simply get their own single-goal nudge on their own day;
  they are days apart, so this is not stacking.

Implementation: after computing each active goal's nudge dates, a merge pass groups nudges by
fire-day; each fire-day yields exactly one scheduled notification (single-goal copy for one
goal, combined copy for two).

## 5. In-app banner

A warm amber strip at the top of the focus screen (`app/(tabs)/focus.tsx`), above the goal
list. Never alarm-red, no flame, no countdown number (mechanic spec hard constraints).

- **Shown whenever any active goal is at-risk** (derived from the per-goal Momentum snapshots
  already cached in `momentumSlice` by Phase 1.2 — `state === 'slipping'`).
- **Generic, no goal names.** One calm, friendly line: e.g. "Some of your momentum is slipping
  a little. A log or two keeps things going, or rest easy if today's a rest day." The
  *which-goal-and-how-close* detail lives on the card's cushion gauge (Phase 1.2, §7.6) — the
  banner is the gentle global heads-up, not a callout.
- **Dismissable for the day.** Tapping dismiss hides it for the rest of the current local day
  (a per-day flag in AsyncStorage holding the last-dismissed date). It returns the next day if
  something is still slipping.
- **Auto-resolves.** It disappears the instant a log restores good standing, regardless of the
  dismiss flag.
- Copy rotates from the banner pool (never the same line back-to-back).

## 6. Architecture

- **New `services/momentumWarningNotifications.ts`** — owns the reconcile / schedule / cancel
  lifecycle for at-risk warnings. Reuses the shared low-level helpers (OS permission check,
  the expo `scheduleNotificationAsync` primitive, the calm daytime-window picker patterned on
  `behaviorNotifications.ts`, and the ownership module). The only genuinely duplicated logic is
  the *decision* logic, which is a distinct job (cross-day, run-lifecycle) from the existing
  same-day engagement planner.
  - Entry point: `reconcileMomentumWarnings(userId)`, called right after each Momentum eval
    point (after `creditMarkToGoals` and after `evaluateActiveGoalsMomentum`).
  - It reads active goals + their marks (`weekly_target`, `last_activity_date`), computes
    per-goal nudge dates via the engine helper (§6.1), runs the cross-goal merge (§4), cancels
    the previously scheduled `livra-mw-` set, and schedules the new set.

- **New pure engine helper in `lib/goalMomentum.ts`** — e.g.
  `momentumWarningDates(marks, today): { atRiskDate: string; breakDate: string } | null`,
  returning the weakest-link mark's `atRiskDate` and `breakDate` (null when the goal is in good
  standing far from at-risk, or has no marks). Keeps `MomentumSnapshot` display-only and the
  date math independently testable. Reuses the existing `expectedInterval` / gap computations.

- **Namespace split in the notification ownership module**
  (`lib/notifications/livraScheduledOwnership.ts`):
  - Warnings use a new identifier sub-prefix **`livra-mw-`** (momentum-warning); engagement
    notifs keep **`livra-bn-`**.
  - Add a scoped cancel (e.g. `cancelLivraScheduledByPrefix(prefix)` or a category predicate)
    so the engagement planner's reschedule cancels **only** `livra-bn-`, leaving pending
    `livra-mw-` warnings intact. `behaviorNotifications.ts` is changed only to use the scoped
    cancel instead of `cancelAllLivraScheduledNotifications`.
  - The master "disable reminders" path (`applyLivraRemindersPreference`) and any full reset
    still cancel **everything**, including `livra-mw-`.

- **Exemptions.** The warning is exempt from the engagement planner's 3-consecutive-no-tap
  throttle and its 2/day engagement cap; it is governed solely by its own structural 1+1 (§3.1)
  and the one-push-per-day merge cap (§4).

### 6.1 Snapshot vs. warning dates

`MomentumSnapshot` (Phase 1.1) carries `state`, `days`, `cushionRemaining`, `slippingMarkId`
for display. It does **not** carry absolute days-to-break, so the warning service uses the new
pure `momentumWarningDates` helper (§6) rather than extending the snapshot. The banner's
*shown/hidden* decision uses the existing `slipping` state from the cached snapshots; the
notification *dates* use the helper.

## 7. Copy (in `lib/copy.ts`)

All pools rotate so the user never sees the same line back-to-back. No dashes (em, en, or
hyphen-as-dash). Always offer-framed with a rest-out. `[Goal]` / `[Goal A]`, `[Goal B]` are
goal titles.

- **First-nudge, single goal** — the 9 variants drafted in mechanic spec §10 (reuse).
- **Final-nudge, single goal** — new pool (~8). "Last touch today" framing, still an offer and
  a rest-out, never an alarm. e.g. "Today's the day to keep your momentum on [Goal]. One log
  holds it, or let it rest if that's right for today."
- **Combined, multi-goal** — new pool (~6). Gentle slipping framing naming both goals. e.g.
  "Two of your goals are slipping a little, [Goal A] and [Goal B]. One log each keeps them
  going, or rest easy if today's a rest day."
- **Banner, generic (no names)** — new pool (~6). e.g. "Some of your momentum is slipping a
  little. A log or two keeps things going."

Final wording is trimmed at build and held against the Voice Do/Don't table.

## 8. Settings / disable

- Respects the existing master toggle `getLivraRemindersEnabled()` (`livra_reminders_enabled_v1`)
  and OS notification permission. When either is off, no warnings are scheduled; the in-app
  banner still carries the signal.
- There is no separate quiet-hours system in the codebase; the calm daytime window (§3) is the
  quiet-time honoring.
- Settings *labels/copy* for Momentum notifications are Phase 1.5, out of scope here. 1.3 wires
  the behavior to the existing preference; it does not add a new toggle.

## 9. Edge cases

- **Completion / queue advance / abandon / delete.** A goal that is no longer `active` drops
  out of the reconcile's active set, so its pending `livra-mw-` warnings are cancelled on the
  next reconcile. (Banking Momentum into the completion record is Phase 1.4; 1.3 only ensures
  non-active goals stop warning.)
- **`weekly_target` integrity.** Verified safe: every creation/update path defaults to 3, and
  `expectedInterval(weekly_target)` handles null. The gap math the dates depend on is sound.
- **Permission revoked mid-life.** Scheduling no-ops; the in-app banner continues to carry the
  signal.
- **App foregrounded across a day boundary.** Covered by the foreground reconcile. A goal that
  slips overnight with the app open but not on the focus screen updates on the next
  interaction; the pre-scheduled notification is the authoritative signal. (Consistent with the
  Phase 1.2 note.)
- **Same-day first/final collision across goals** — handled by the merge (§4): one push, gentle
  framing.

## 10. Testing

- **Pure `momentumWarningDates` helper** — daily / 4×/week / 2×/week including the daily
  collapse; weakest-link selection across multiple marks; null when in good standing or
  markless.
- **Cross-goal merge** — same-day two goals → one combined push; different-day → separate
  single-goal pushes; the ≤1-push-per-day cap holds.
- **Reconcile lifecycle** (mocked scheduler) — schedules the pair on slip; cancels on a
  qualifying log (recovery); replaces (cancel + reschedule) when `last_activity` moves; skips
  past-window nudges; cancels warnings for goals that leave the active set.
- **Namespace split** — the engagement planner's scoped cancel leaves `livra-mw-` intact; the
  master disable cancels both.
- **Banner** — presenter shows when any goal is `slipping`; per-day dismiss hides for the day
  and returns next day; auto-resolves on recovery; copy rotation never repeats back-to-back.

## 11. PRODUCT.md changes this commits us to

- Reconcile "one Momentum on THE active goal" (PRODUCT.md:95, :448) to "**per active goal**"
  to match the app's up-to-2-active-goals reality and the Phase 1.2 per-card UI.
- Confirm the sanctioned-exception line for the 1+1 offer-framed Momentum warning (added with
  the mechanic spec) covers the cross-goal merged push and the in-app banner.

## 12. Out of scope

- **Phase 1.4** — completion banking (`days` into the completion record, share-card line).
- **Phase 1.5** — settings/notification *labels* and the user-facing copy for the Momentum
  notification preference.
