# App Store Connect listing — Livra 2.0.0 (build 67)

Rewritten 2026-08-08 after the founder confirmed: **the app is public but has no
users and no marketing.**

That changes which field matters. "What's New" is read by people who already
have the app — with no install base, its only real audience is App Review. The
**Description** is the whole funnel: it is what a cold visitor reads, and it is
the only field doing any selling right now. So it leads here.

Positioning is not invented — it is `PRODUCT.md` § Competitive Positioning
verbatim ("Most habit apps help you track many things; Livra helps you finish
one") plus § Product Purpose and § Anti-references. Voice per
`.reports/design-decisions.md` Direction: calm executor.

**App Store descriptions render PLAIN TEXT.** No markdown survives — the short
standalone lines below are doing the work of headings on purpose. Do not add
`**bold**`; it will render as literal asterisks.

---

## 1. Description — the field that matters

```
Most habit apps help you track many things. Livra helps you finish one.

Name a goal that matters. Livra turns it into a few small, repeatable actions —
marks — and asks you to log each one as you do it. One tap. That is the whole
gesture.

You run up to two goals at a time, each with a handful of marks. Not a grid of
forty habits. Not a dashboard to maintain.

Momentum, not streaks
Each goal builds a momentum count: days earned by honoring the rhythm you set,
not by never missing. Rest is part of the plan. A quiet day does not wipe the
board, and nothing panics at you to come back.

One next move
Livra shows a single thing to do next, chosen from what is actually due. When
the week's rhythm is met, it says so and gets out of the way.

Marks that fit your week
Every mark carries its own cadence — every day, three times a week, once. Set
your pace to easing, steady or pushing and Livra retunes them together.

Describe it, and Livra drafts it
Type the goal in your own words. Livra proposes the marks to get there and tells
you why each one is in the plan. Edit anything before it lands.

Apple Health where it fits
Sleep, workouts and steps can log themselves. Nothing else pretends to.

On your home screen
A widget keeps the goal in front of you and logs a mark without opening the app.

Finishing is the point
Completing a goal is the moment Livra is built around. It marks it, and then it
lets go. You come back for the next goal — not out of obligation.

What Livra will not do: punish you for a missed day, bury you in charts, or
engineer notifications to pull you back.
```

Character count: see § 6 (verified, not estimated).

### Livra+ block — append to the Description above

Apple guideline 3.1.2 wants subscription name, length, price basis and the two
links present in the metadata for an auto-renewing subscription. Keep this
appended rather than separate.

```
Livra+
Unlimited goals, unlimited marks per goal, AI goal drafting, Apple Health sync,
data export, and styling for your finish card. Livra is free for two goals and
six marks — Livra+ removes the ceiling.

Livra+ is an auto-renewing subscription, offered monthly or annually. Payment is
charged to your Apple ID at confirmation of purchase. It renews automatically
unless turned off at least 24 hours before the current period ends. Manage or
cancel in your Apple ID settings.

Terms of Use: https://www.livralife.com/terms
Privacy Policy: https://www.livralife.com/privacy
```

⚠️ **Confirm both URLs resolve before pasting.** Session records say `/privacy`
and `/terms` returned 200 on 2026-07-27, but that was eleven days ago and this
project has been burned by "merged" not meaning "live". Load them.

---

## 2. Subtitle — 30 char limit

Carries the wedge into search results, which matters far more than the earlier
mood-led options now that this is the entire funnel.

```
Finish one goal at a time
```

Recommended. Alternative, if you want the noun to lead:

```
A calm app for finishing goals
```

---

## 3. Promotional text — 170 chars, editable WITHOUT a review

The single highest-leverage field you own: it sits above the description and can
be changed any day without resubmitting.

```
Most habit apps help you track many things. Livra helps you finish one. Two goals at a time, a few marks each, and momentum that survives a rest day.
```

---

## 4. Keywords — 100 char limit, comma-separated, no spaces

Do not repeat the app name or the subtitle words; Apple already indexes those.

```
goal,habit,routine,momentum,consistency,discipline,focus,daily,tracker,planner,progress,accountability
```

See § 6 — this one needs trimming to fit; the trimmed version is there.

---

## 5. What's New — low priority now, but still required

With no install base this is mostly for App Review. Short is correct.

```
Your widget now wears the same faces as the app. Every mark shows its own icon
on the home screen, and a goal carries an icon drawn from its own name — steady
from the day you create it.

Marks that Livra suggested for a goal now say why they are there.

Apple Health connects only where it can actually measure: sleep, workouts and
steps.

Plus a truer first-day greeting, a clearer note on your weekly pace, and a
number of smaller repairs underneath.
```

2.0.0 carries the 2026-08-08 batch (commits `86b207b`..`ccb62a9`), so append
this — those commits are in build 67, not in the build 66 already at Apple:

```
Your profile picture now appears in Settings the moment you change it. And marks
created before Livra tracked weekly rhythm now read their real cadence instead
of defaulting to three days a week.
```

Left out deliberately: the recovery-link confirmation and the journal-edit
repair (security fixes for situations no user knowingly hit — naming them
advertises a weakness and tells the reader nothing), and the hidden share card
(a removal almost nobody could reach).

---

## 6. Verified character counts

| Field | Limit | Count | Status |
| --- | --- | --- | --- |
| Description (core) | 4000 | 1589 | OK |
| Description + Livra+ block | 4000 | 2165 | OK |
| Subtitle — "Finish one goal at a time" | 30 | 25 | OK |
| Subtitle — alternative | 30 | 30 | Exactly at limit — see note |
| Promotional text | 170 | 149 | OK |
| Keywords as written above | 100 | 102 | **OVER by 2** |
| Keywords trimmed (use this) | 100 | 87 | OK |
| What's New (core) | 4000 | 453 | OK |
| What's New + add-on | 4000 | 650 | OK |

**Note on the alternative subtitle:** "A calm app for finishing goals" is
exactly 30 of 30. It fits, but there is no margin, and ASC has rejected
at-limit strings before when it counts a character differently than expected.
"Finish one goal at a time" (25) is the safer pick and the stronger line.

**Use this keyword string** — the one above is 2 over:

```
goal,habit,routine,momentum,consistency,discipline,focus,daily,tracker,planner,progress
```

Slop scan: clean. No forbidden phrase from the `copy` skill appears in any
field, and no "Submit" / "Learn more" / "Get started" CTA.

---

## 7. Screenshots — the real bottleneck

With no marketing, screenshots do more selling than every word above. Current
store shots predate icon parity, where 40 of the 41 library marks wore a
different face in the widget than in the app.

Minimum set, in this order — the first two are what most visitors ever see:

1. Focus with the next-move card — the wedge made visible: one thing to do.
2. Home screen with the widget, so widget and app visibly agree.
3. A goal mid-run showing momentum and the weekly rhythm.
4. The completion moment.

---

## 8. Version — DECIDED 2026-08-08

**2.0.0 / iOS build 67 / Android versionCode 67.** Bumped in `app.json`, and
`package.json` was reconciled from its long-drifted `1.0.44` to `2.0.0` at the
same time so the npm banner stops contradicting the release.

Build **67**, not 66: build 66 is already uploaded to App Store Connect, and an
iOS build number cannot be reused. **No binary has been cut** — the bump is
committed and waiting.

The ASC version record must read 2.0.0 and be attached to the build 67 binary
once it exists.

**V2 includes the 2026-08-08 batch** (commits `86b207b`..`ccb62a9`), so the
What's New add-on block in § 5 applies. Those are all JS, so they could ship by
`eas update` instead — but they are riding this build.

---

## Not needed for this release

App Privacy is published, per-app, and carries to a new version unedited. The
privacy policy URL is live. Neither needs touching.
