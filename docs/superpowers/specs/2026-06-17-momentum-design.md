# Design — Momentum (forgiving, frequency-aware momentum)

> Status: **design complete (all decisions closed) / not yet building.** Captured for when
> the build starts. Remaining work is the PRODUCT.md rewrite (§8) and an implementation plan.
> Date: 2026-06-17 · Branch context: `docs/product-direction`
> Supersedes the planned "streak teardown" (module #1) and "at-risk status" (module #3) —
> they merge into this one feature.
>
> **Name:** the feature is **Momentum** (the placeholder "Roll" is retired). Note the naming
> collision recorded in §8 — "momentum counter" is currently in PRODUCT.md's *banned* list
> and must be explicitly carved out.

## 1. Why this exists (and what it reverses)

PRODUCT.md currently bans streaks outright across five sections — "no streak-panic engine,"
"retention layer intentionally cut," and the competitive wedge itself ("Progress, not
streaks; forgiveness, not guilt"). **This design deliberately reverses that**, but narrowly:
it does **not** bring back the thing the doc actually objected to.

The doc's objection was always to **loss aversion** — the brittle one-miss wipeout, the
"you broke your 5-day streak 😟" guilt, the don't-break-the-chain panic. It was never an
objection to **momentum** — the felt sense of being on a run. Those two ship together in
most apps but are separable. Momentum keeps the run and removes the panic by making the loss
condition **fair**: you only lose it when you fail to do what *you* committed to, never when
you rest.

This is a product-identity change, made with eyes open. PRODUCT.md is rewritten to match
(see §8). The new stance: **brittle/guilt streaks stay banned; forgiving frequency-Momentum
is the one sanctioned form.**

## 2. The mechanic

**Scope: one Momentum, on the active goal.** Not per-mark (that re-creates the multi-habit
streak grid the doc bans), not app-wide (that ignores the goal and is gameable). One thing to
protect, matching Livra's one-goal-at-a-time spine.

**Earned through the marks.** Momentum lives on the goal but is calculated from the goal's
marks and their committed frequencies. You keep it by honoring those frequencies. You lose it
by falling short of them — not by resting.

**Frequency-aware days (the clock).** The displayed count is a **daily count** (so it feels
immediate, like a streak), but a "miss" is defined by frequency, not by the calendar. Each
day the goal sits in one of three states:

| Day state | Meaning | Effect on Momentum |
| --- | --- | --- |
| **On it** | You logged toward the goal / you're on pace for your frequencies | grows |
| **Resting** | Your frequencies didn't ask for anything today | holds — rest costs nothing |
| **Slipping** | You owed work per your frequency and didn't do it | cushion ticks down |

The number shown is **days in good standing** — it ticks up on rest days too, so it grows
daily and never punishes a planned rest.

**Frequency-scaled cushion.** Each mark's frequency implies an expected interval between
logs (daily ≈ 1 day, 4×/week ≈ ~2 days, 2×/week ≈ ~3–4 days). Momentum goes **at-risk when
you pass that interval** and **breaks at roughly double it**:

- Daily mark → warns after ~1–2 quiet days, breaks at ~3.
- 2×/week mark → warns after ~4, breaks at ~7.

The less often you committed, the more rope you get. Exact multipliers and the aggregation
rule are resolved in §7.

**Why scaled, not fixed:** a fixed "miss 3 days running" cushion misjudges low-frequency
goals (a 2×/week goal has legitimate multi-day gaps). Scaling keeps the loss *fair*, which is
the entire point. The cost — the user can't eyeball where the edge is — is exactly why the
notification matters (§4): it becomes the instrument panel, not a nag.

## 3. At-risk is Momentum's warning system (modules merge)

PRODUCT.md already sanctions exactly one nudge: *"This one's slipping a little. Want to make
it today's single focus?"* — explicitly "an offer to refocus, never a penalty." That **is**
Momentum's early-warning. So we are not building a streak *and* a separate at-risk status —
the at-risk warning is how Momentum protects itself before it breaks. The at-risk surface
(in-app banner + notification) derives from Momentum state, computed from
progress/consistency (`lib/consistency.ts`), never from a raw streak counter.

## 4. The notification (designed to not become the nag machine)

Because the cushion is frequency-scaled and therefore invisible, the notification is the
**only** way the user knows where the edge is. That reframes it from pestering to
information — the justification for allowing a Momentum-warning notification in a doc that
bans the "notification nag machine."

- **Cadence: 1 + 1, hard ceiling.** One nudge when the goal crosses into at-risk; at most one
  *final* nudge the day before it would actually break. Never a daily drip. A warning that
  repeats is a nag; a warning that fires once is information.
- **Rotating copy pool.** 8–12 hand-written variants in the sanctioned voice, rotated so the
  user never sees the same line back-to-back — this is what kills the robotic feeling. Lives
  in `lib/copy.ts` (this folds in module #12, the voice source-of-truth file).
- **Always an offer, always a rest-out.** e.g. *"[Goal] is slipping a little. One log keeps
  it going, or rest easy if today's a rest day."* Surfaces a choice, names the exit, never
  "you're about to lose your streak."
- **Degrades gracefully.** Honors quiet hours and existing reminder prefs, fully
  disable-able. If push is off, the **in-app at-risk banner** on the focus screen carries the
  same warning — the signal never depends on notifications alone.
- **Voice/copy rules apply.** No dashes in shipped copy; held against the Do/Don't table.

## 5. Representation — DECIDED: C + A hybrid

A flame + number would silently undo the whole design: it screams don't-break-the-chain,
shows no cushion, and treats a rest day as a gap. The representation must convey **momentum +
breathing room**, and must stay calm when things are fine.

**Decision: the C + A hybrid.** Count-forward and calm in good standing — "Momentum · 12
days" with a soft warm glow when on it, neutral when resting. The **breathing-room indicator
(the cushion gauge from option A) appears only once you're actually slipping** — invisible
when you're fine, legible exactly when the edge is near and the user can act on it. This
matches "every interruption is earned" and keeps daily use quiet.

Options considered and rejected: **B** (soft ring) reads as "today's target," colliding with
mark completion; **D** (organic growth metaphor) risks cutesy and Finch-adjacent
(anti-reference); **A alone** (always-on depleting gauge) manufactures the exact anxiety we
removed; **C alone** hides the cushion entirely. The hybrid takes C's calm default and adds
A's gauge only in the at-risk moment.

Hard constraints on the build: no flame/loss-aversion iconography; no calendar heatmap or
day-dot chain (the doc bans heatmaps); amber/warm for at-risk, never alarm-red; a rest day
must never *look* like a break.

## 6. What this does to the codebase (transform, not strip)

The earlier plan was to *delete* streak machinery. This design **transforms** it instead:

- `services/behaviorNotifications.ts` — `anyStreakAtRisk` logic is repurposed into the
  frequency-aware at-risk computation + the 1+1 rotating notification, not deleted.
- `lib/consistency.ts` — frequency-aware engine (`weeksStrong`, expected vs completed) is the
  basis for pace / day-state computation.
- `enable_streak` field (on marks, set in `app/mark/new.tsx`, `app/onboarding.tsx`,
  `app/goal/new.tsx`) — repurposed/retired in favor of Momentum-from-frequency; the
  user-facing "Enable streak" toggle in `app/mark/new.tsx` is removed (Momentum is
  goal-level and automatic, not a per-mark opt-in).
- `app/diagnostics.tsx` — `seedBrokenStreak` / "Simulate Streak Loss" become Momentum-state
  simulators.
- New: Momentum state computation (per active goal), the Momentum representation component
  (C+A hybrid), at-risk banner on `app/(tabs)/focus.tsx`, rotating copy pool in `lib/copy.ts`.
- Privacy policy — "streak data" wording revisited to match the new model.

## 7. Resolved decisions

All six items closed this session. Numbers are tunable constants, not magic values.

**7.1 Expected interval + cushion multipliers.** A mark's frequency (times per week) gives an
expected interval `I = 7 / timesPerWeek` days. For a mark, let `gap` = whole days since its
last qualifying log. Then **at-risk gap** = `ceil(I) + 1` and **break gap** = `ceil(2I) + 1`.

| Frequency | Interval I | At-risk at gap | Breaks at gap |
| --- | --- | --- | --- |
| Daily (7×/wk) | 1.0 | 2 days | 3 days |
| 4×/week | 1.75 | 3 days | 5 days |
| 2×/week | 3.5 | 5 days | 8 days |

Less often you committed, more rope. Matches the "2–3 in a row" feel for daily marks.

**7.2 Aggregation: weakest link, per mark.** Momentum is **at-risk when any active mark on the
goal passes its at-risk gap**, and **breaks when any active mark passes its break gap**. This
keeps Momentum *honest* — you can't fake it by over-doing one easy mark while abandoning the
goal-defining one — while the generous 2×-interval break keeps it forgiving and the at-risk
warning names *which* mark is slipping. The "one neglected minor mark kills it" risk is
mitigated by the generous break gap plus the early warning.

**7.3 Rest vs slip is derived, not a separate rule.** A day is **resting** while every mark is
within its at-risk gap, and **slipping** the moment any mark exceeds it. The frequency already
budgets the rest, so there is no extra rest rule. The displayed count is the run of
consecutive days with no mark slipping; it ticks up on rest days.

**7.4 On goal completion / queue advance.** On completion, the goal's Momentum is **banked
into its completion record** (history, and an optional share-card line: "finished with N days
of momentum") and folded into the celebration. The newly-active queued goal **starts at 0**,
framed as a fresh start, never a loss. Momentum is per active goal only: an abandoned or
deleted goal drops its Momentum with no guilt, and un-goaled daily habits carry no Momentum.

**7.5 Copy pool** — drafted in §10.

**7.6 Cushion gauge (the A-half of the representation).** A thin amber bar directly under the
"Momentum · N days" label, visible **only in the at-risk state**. Fill represents cushion
remaining, `(breakGap − gap) / (breakGap − atRiskGap)`, draining as the gap grows toward
reset. Warm amber on a neutral track, never alarm-red, no flame. **No numeric countdown** (a
"1 day until reset" number re-imports the panic); the bar gives the felt sense, the banner and
notification carry the actionable words. It fades in on entering at-risk and fades back to the
calm glow the instant a log restores good standing.

## 8. PRODUCT.md changes this commits us to

- **Resolve the naming collision first.** "Momentum counter" / "momentum" sits in the *banned*
  retention-layer list in three places (the Brand Personality cut + guardrail, and the Launch
  Readiness check). Naming the feature Momentum directly contradicts those lines, so they must
  be rewritten to carve momentum out of the ban and define it as the sanctioned mechanic —
  otherwise the doc bans, by name, the feature we're shipping.
- Rewrite the anti-streak sections (Not now / not ever, Brand Personality growth-edge,
  Anti-references, Competitive Positioning) from "streaks banned" to "brittle/guilt streaks
  banned; forgiving frequency-Momentum is the sanctioned form."
- Add a sanctioned exception to the "no notification nag machine" guardrail for the 1+1
  rotating, offer-framed Momentum warning — same framing as "the one allowed nudge."
- Update the existing stress-point callouts for #2 (streak teardown) and #3 (at-risk) to
  point at this design instead of a strip-out.
- Re-examine the competitive wedge copy ("Progress, not streaks") so it stays honest under
  the new model — likely "Momentum without the panic."
- Add Momentum to the owned-vocabulary set (alongside Goal and Mark): one canonical
  definition, defined once, used warmly everywhere.

## 9. Settled this session

- Re-introduce a streak, but the **forgiving** kind: survives a stumble, breaks on a real
  slide. ✅
- Name: **Momentum** (placeholder "Roll" retired). ✅
- Scope: **one Momentum, on the active goal, earned through its marks.** ✅
- Clock: **frequency-aware days** (daily-feeling count, frequency-defined miss). ✅
- Cushion: **frequency-scaled** (at-risk ~1× expected interval, break ~2×). ✅
- Warning = the **at-risk** feature; modules #2 and #3 merge. ✅
- Notification: **1 + 1 ceiling**, rotating copy pool, offer-framed, degrades to in-app
  banner. ✅
- Representation: **C + A hybrid** — calm count by default, cushion gauge only when
  slipping. ✅
- All six §7 items resolved: intervals/cushion math, weakest-link aggregation, derived
  rest/slip, completion banking, copy pool, cushion-gauge form. ✅

## 10. Copy pool (draft, held against the Voice Do/Don't table)

No dashes (em, en, or hyphen-as-dash). `[Goal]` is the goal title. Final trims happen at
build; the count here is enough to seed the rotation.

**At-risk notification — first nudge (rotate, never repeat back-to-back):**
1. "[Goal] is slipping a little. One log keeps your momentum. Or rest easy if today's a rest day."
2. "Your momentum on [Goal] is dipping. A single log today and you're back on it."
3. "[Goal] could use a touch today. One mark keeps the momentum going. No pressure if you're resting."
4. "Momentum fades quietly. One log on [Goal] today and it holds."
5. "You've built real momentum on [Goal]. One log keeps it."
6. "[Goal] is asking for a little attention. One mark today, or rest if that's what today is."
7. "Still time to keep your momentum on [Goal]. One log is all it takes."
8. "Your run on [Goal] is worth protecting. A single mark today keeps it alive."
9. "Momentum on [Goal] is slipping. One small log brings it back. Resting is fine too."
10. "[Goal] hasn't heard from you in a bit. One log holds the momentum, if today's the day."

**Final nudge — day before reset (rotate):**
1. "Last call on [Goal]'s momentum. One log today keeps it, or let it rest. Your call."
2. "Your momentum on [Goal] resets after today. One mark holds it, no guilt either way."
3. "[Goal]'s momentum resets after today. One log keeps it, or a fresh start tomorrow is just fine."

**In-app at-risk banner (focus screen, shorter):**
1. "Slipping a little. One log keeps your momentum."
2. "[Goal] is at risk today. Want to make it your one focus?"
3. "Momentum dipping. A single mark holds it."

**Momentum label and states:**
- Label: "Momentum · {n} days"
- Strong / greeting: "{n} days of momentum. That builds."
- Rest day: "Resting today. Your momentum holds."
- Fresh start (after reset or new goal): "Fresh start. Momentum begins with one log."
- Completion banked: "You finished [Goal] with {n} days of momentum."
