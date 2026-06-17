# Design — The Roll (forgiving, frequency-aware momentum)

> Status: **design / not yet building.** Captured for when the build starts.
> Date: 2026-06-17 · Branch context: `docs/product-direction`
> Supersedes the planned "streak teardown" (module #1) and "at-risk status" (module #3) —
> they merge into this one feature.

## 1. Why this exists (and what it reverses)

PRODUCT.md currently bans streaks outright across five sections — "no streak-panic engine,"
"retention layer intentionally cut," and the competitive wedge itself ("Progress, not
streaks; forgiveness, not guilt"). **This design deliberately reverses that**, but narrowly:
it does **not** bring back the thing the doc actually objected to.

The doc's objection was always to **loss aversion** — the brittle one-miss wipeout, the
"you broke your 5-day streak 😟" guilt, the don't-break-the-chain panic. It was never an
objection to **momentum** — the felt sense of being on a run. Those two ship together in
most apps but are separable. The Roll keeps the momentum and removes the panic by making
the loss condition **fair**: you only lose the Roll when you fail to do what *you* committed
to, never when you rest.

This is a product-identity change, made with eyes open. PRODUCT.md is rewritten to match
(see §8). The new stance: **brittle/guilt streaks stay banned; the forgiving
frequency-Roll is the one sanctioned form.**

## 2. The mechanic

**Scope: one Roll, on the active goal.** Not per-mark (that re-creates the multi-habit
streak grid the doc bans), not app-wide (that ignores the goal and is gameable). One Roll to
protect, matching Livra's one-goal-at-a-time spine.

**Earned through the marks.** The Roll lives on the goal but is calculated from the goal's
marks and their committed frequencies. You keep the Roll by honoring those frequencies. You
lose it by falling short of them — not by resting.

**Frequency-aware days (the clock).** The displayed Roll is a **daily count** (so it feels
immediate, like a streak), but a "miss" is defined by frequency, not by the calendar. Each
day the goal sits in one of three states:

| Day state | Meaning | Effect on the Roll |
| --- | --- | --- |
| **On it** | You logged toward the goal / you're on pace for your frequencies | Roll grows |
| **Resting** | Your frequencies didn't ask for anything today | Roll holds — rest costs nothing |
| **Slipping** | You owed work per your frequency and didn't do it | Cushion ticks down |

The number shown is **days in good standing** — it ticks up on rest days too, so it grows
daily and never punishes a planned rest.

**Frequency-scaled cushion.** Each mark's frequency implies an expected interval between
logs (daily ≈ 1 day, 4×/week ≈ ~2 days, 2×/week ≈ ~3–4 days). The Roll goes **at-risk when
you pass that interval** and **breaks at roughly double it**:

- Daily mark → warns after ~1–2 quiet days, breaks at ~3.
- 2×/week mark → warns after ~4, breaks at ~7.

The less often you committed, the more rope you get. Exact multipliers and the per-mark vs
goal-aggregate aggregation are pinned in the implementation plan (see §7 open items).

**Why scaled, not fixed:** a fixed "miss 3 days running" cushion misjudges low-frequency
goals (a 2×/week goal has legitimate multi-day gaps). Scaling keeps the loss *fair*, which is
the entire point. The cost — the user can't eyeball where the edge is — is exactly why the
notification matters (§4): it becomes the instrument panel, not a nag.

## 3. At-risk is the Roll's warning system (modules merge)

PRODUCT.md already sanctions exactly one nudge: *"This one's slipping a little. Want to make
it today's single focus?"* — explicitly "an offer to refocus, never a penalty." That **is**
the Roll's early-warning. So we are not building a streak *and* a separate at-risk status —
the at-risk warning is how the Roll protects itself before it breaks. The at-risk surface
(in-app banner + notification) derives from Roll state, computed from progress/consistency
(`lib/consistency.ts`), never from a raw streak counter.

## 4. The notification (designed to not become the nag machine)

Because the cushion is frequency-scaled and therefore invisible, the notification is the
**only** way the user knows where the edge is. That reframes it from pestering to
information — the justification for allowing a Roll-warning notification in a doc that bans
the "notification nag machine."

- **Cadence: 1 + 1, hard ceiling.** One nudge when the goal crosses into at-risk; at most one
  *final* nudge the day before it would actually break. Never a daily drip. A warning that
  repeats is a nag; a warning that fires once is information.
- **Rotating copy pool.** 8–12 hand-written variants in the sanctioned voice, rotated so the
  user never sees the same line back-to-back — this is what kills the robotic feeling. Lives
  in `lib/copy.ts` (this folds in module #12, the voice source-of-truth file).
- **Always an offer, always a rest-out.** e.g. *"[Goal] is slipping a little. One log keeps
  the roll going, or rest easy if today's a rest day."* Surfaces a choice, names the exit,
  never "you're about to lose your streak."
- **Degrades gracefully.** Honors quiet hours and existing reminder prefs, fully
  disable-able. If push is off, the **in-app at-risk banner** on the focus screen carries the
  same warning — the signal never depends on notifications alone.
- **Voice/copy rules apply.** No dashes in shipped copy; held against the Do/Don't table.

## 5. Representation (the part that makes or breaks "does this read as Livra")

A flame + number would silently undo the whole design: it screams don't-break-the-chain,
shows no cushion, and treats a rest day as a gap. The representation must convey **momentum +
breathing room**, and must stay calm when things are fine. Options brainstormed, not yet
chosen:

- **A — Cushion gauge / "breathing room" meter.** A subtle bar that fills as you log and
  draws down during quiet days, with the Roll count alongside. *Pro:* shows cushion directly,
  solves the "invisible edge" problem on-screen. *Con:* a constantly-depleting meter can
  manufacture the exact anxiety we're removing.
- **B — Soft ring + count.** Ring around the goal, full when on pace, gently emptying as
  cushion is spent, refilling on log; count in the center. *Pro:* familiar, calm. *Con:*
  rings usually read as "today's target," risks confusion with mark completion.
- **C — Glow + count, state by warmth.** Just "On a roll · 12 days" with a calm visual state:
  soft glow when on it, neutral when resting, gentle amber when slipping. Cushion is
  surfaced only when it matters (the at-risk moment), not always on screen. *Pro:* calmest,
  most on-brand, "earned interruption." *Con:* hides the cushion during normal use, leaning
  on the notification to surface the edge.
- **D — Organic growth metaphor (path / plant).** Forgiving by nature (it pauses, doesn't
  shatter). *Con:* risks cutesy (doc bans cutesy) and Finch-adjacent (anti-reference).

**Leaning: a hybrid of C + A.** Count-forward and calm in good standing ("On a roll · 12
days," warm glow), with the breathing-room indicator appearing **only once you're actually
slipping** — invisible when you're fine, legible exactly when the edge is near and the user
can act on it. This matches "every interruption is earned" and keeps daily use quiet. Final
pick is an open decision (§7).

Hard constraints on whatever is chosen: no flame/loss-aversion iconography; no calendar
heatmap or day-dot chain (the doc bans heatmaps); amber/warm for at-risk, never alarm-red;
a rest day must never *look* like a break.

## 6. What this does to the codebase (transform, not strip)

The earlier plan was to *delete* streak machinery. This design **transforms** it instead:

- `services/behaviorNotifications.ts` — `anyStreakAtRisk` logic is repurposed into the Roll's
  frequency-aware at-risk computation + the 1+1 rotating notification, not deleted.
- `lib/consistency.ts` — frequency-aware engine (`weeksStrong`, expected vs completed) is the
  basis for pace / day-state computation.
- `enable_streak` field (on marks, set in `app/mark/new.tsx`, `app/onboarding.tsx`,
  `app/goal/new.tsx`) — repurposed/retired in favor of Roll-from-frequency; the user-facing
  "Enable streak" toggle in `app/mark/new.tsx` is removed (the Roll is goal-level and
  automatic, not a per-mark opt-in).
- `app/diagnostics.tsx` — `seedBrokenStreak` / "Simulate Streak Loss" become Roll-state
  simulators.
- New: Roll state computation (per active goal), Roll representation component, at-risk
  banner on `app/(tabs)/focus.tsx`, rotating copy pool in `lib/copy.ts`.
- Privacy policy — "streak data" wording revisited to match the new model.

## 7. Open decisions (carry into the implementation plan)

1. **Representation final pick** — C+A hybrid vs a cleaner single option.
2. **Cushion multipliers** — exact "at-risk at 1× interval, break at ~2×" numbers, and how a
   day's expected interval is derived from a frequency.
3. **Aggregation** — is the goal "slipping" when *any* mark falls behind its frequency, or
   only on goal-level overall pace? (Risk: one neglected minor mark shouldn't kill the Roll.)
4. **Rest vs slip boundary** — precise rule for when a quiet day is "resting" vs "slipping"
   given a weekly frequency distributed across days.
5. **Roll on goal completion / queue advance** — what happens to the number when a goal
   completes and the next queued goal steps forward.
6. **Copy variants** — write the 8–12 notification lines + the at-risk banner line(s).

## 8. PRODUCT.md changes this commits us to

- Rewrite the anti-streak sections (Not now / not ever, Brand Personality growth-edge,
  Anti-references, Competitive Positioning) from "streaks banned" to "brittle/guilt streaks
  banned; the forgiving frequency-Roll is the sanctioned form."
- Add a sanctioned exception to the "no notification nag machine" guardrail for the 1+1
  rotating, offer-framed Roll warning — same framing as "the one allowed nudge."
- Update the existing stress-point callouts for #2 (streak teardown) and #3 (at-risk) to
  point at this design instead of a strip-out.
- Re-examine the competitive wedge copy ("Progress, not streaks") so it stays honest under
  the new model — likely "Momentum without the panic."

## 9. Settled this session

- Re-introduce a streak, but the **forgiving** kind: survives a stumble, breaks on a real
  slide. ✅
- Scope: **one Roll, on the active goal, earned through its marks.** ✅
- Clock: **frequency-aware days** (daily-feeling count, frequency-defined miss). ✅
- Cushion: **frequency-scaled** (at-risk ~1× expected interval, break ~2×). ✅
- Warning = the **at-risk** feature; modules #2 and #3 merge. ✅
- Notification: **1 + 1 ceiling**, rotating copy pool, offer-framed, degrades to in-app
  banner. ✅
- Representation: **leaning C+A hybrid**, final pick open. ⏳
