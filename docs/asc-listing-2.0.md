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

**App Store descriptions render PLAIN TEXT.** No markdown survives, so the short
standalone lines below are doing the work of headings on purpose. Do not add
`**bold**`; it will render as literal asterisks.

**No em dashes anywhere in the copy blocks, by instruction (2026-08-09), and
verified at 0.** They are a tell, and Apple renders them inconsistently across
storefront fonts anyway. Use commas, colons or a full stop. If you edit a block,
re-check with a search for the character before pasting.

---

## 1. Description — the field that matters

```
Most habit apps help you track a lot of things. Livra is built to help you
finish one.

You name a goal, and Livra breaks it into a few small actions you repeat. Those
are your marks. You tap one each time you do it, and that's really all there is
to using it.

You can run two goals at once with a handful of marks under each. There's no
grid of forty habits and no dashboard to keep up with. That much is free and
stays free. Finishing a goal never costs anything.

Momentum instead of streaks
Each goal builds a day count you earn by keeping the rhythm you picked, not by
never missing. You're allowed to rest. A quiet day doesn't wipe anything out,
and Livra won't panic at you to come back.

One next thing
Livra picks a single thing to do next from whatever is actually due. Once you've
met the week's rhythm it says so and stops asking.

Marks that match your week
Every mark has its own cadence: daily, three times a week, once. Choose a pace
of easing, steady or pushing and Livra retunes all of them together.

Type a goal, get a plan
Describe what you're after in your own words. Livra suggests the marks to get
there and says why each one made the list. You can change any of it before it
saves. Every account gets one free AI draft, and the presets are free for good.

Apple Health, where it fits
Sleep, workouts and steps can log themselves. Nothing else claims to.

A widget on your home screen
It keeps the goal in front of you, and you can log a mark without opening Livra
at all.

Finishing counts
Completing a goal is the part this app is actually for. Livra marks the moment,
then leaves you alone until you pick the next one.

Livra won't punish you for a missed day, bury you in charts, or send you
notifications designed to pull you back in.
```

Character count: see § 6 (verified, not estimated).

### Livra+ block — append to the Description above

Apple guideline 3.1.2 wants subscription name, length, price basis and the two
links present in the metadata for an auto-renewing subscription. Keep this
appended rather than separate.

```
Livra+
Livra is free for two goals and six marks, and finishing them is never gated.
Livra+ gives you more room rather than removing an obstacle: unlimited goals,
unlimited marks per goal, repeat AI drafting, Apple Health sync, and CSV export
of your history.

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
Most habit apps help you track a lot of things. Livra helps you finish one. Two goals, a few marks each, free, with momentum that survives a rest day.
```

---

## 4. Keywords — 100 char limit, comma-separated, no spaces

Do not repeat the app name or the subtitle words; Apple already indexes those.

```
goal,habit,routine,momentum,consistency,discipline,focus,daily,tracker,planner,progress,accountability
```

See § 6 — this one needs trimming to fit; the trimmed version is there.

---

## 5. What's New — now carries the whole story

The live store page still sells the marks tracker. Anyone who reads this field is
being told, for the first time, that Livra is a goal app.

```
Livra started out as a way to track daily marks. This version makes it a goal
app, which is what it was always trying to be.

Goals come first now
You name something you actually want to finish, and your marks live underneath
it instead of floating on their own. Progress adds up toward the goal, and
completing one is a real moment rather than a counter going back to zero.

One next thing, not a list
The Focus screen picks a single thing to do next out of whatever is due. Once
you've met the week's rhythm it says so and stops asking.

Momentum instead of streaks
Each goal keeps its own day count, earned by holding the rhythm you set rather
than by never missing. A rest day doesn't break it.

Marks have a cadence
Daily, three times a week, once. Choose a pace of easing, steady or pushing and
every flexible mark retunes together.

Describe a goal and get a plan
Type what you're after and Livra drafts the marks to get there, with a line on
why each one is in the plan. You can change any of it before it saves. Every
account gets one free draft.

Apple Health and a home screen widget
Sleep, workouts and steps can log themselves with Livra+. The widget keeps the
goal in front of you and logs a mark without opening the app, and it now shows
the same icons you see inside Livra.

Also in this version: a goal takes its icon from its own name and keeps it,
marks Livra suggested tell you why they're there, Apple Health only offers to
connect where it can actually measure something, your profile picture updates
the moment you change it, and marks made before Livra tracked weekly rhythm now
read their real cadence instead of falling back to three days a week.
```

**This block assumes build 67.** The final paragraph names the 2026-08-08 batch
(commits `86b207b`..`ccb62a9`), which is NOT in the build 66 sitting at Apple. If
you ever ship 66 instead, cut the profile-picture and cadence clauses.

**Why it is long now, deliberately:** the live App Store page still describes the
old app ("simple daily marks, clean stats"), so for anyone who reads it, the
goal model IS the news. With no install base there is no one to bore, and this
field is the only place the change gets explained.

Left out deliberately: the recovery-link confirmation and the journal-edit
repair (security fixes for situations no user knowingly hit — naming them
advertises a weakness and tells the reader nothing), and the hidden share card
(a removal almost nobody could reach).

---

## 6. Verified character counts
| Field | Limit | Count | Status |
| --- | --- | --- | --- |
| Description (core) | 4000 | 1764 | OK |
| Description + Livra+ block | 4000 | 2394 | OK |
| Subtitle — "Finish one goal at a time" | 30 | 25 | OK |
| Subtitle — alternative | 30 | 30 | Exactly at limit — see note |
| Promotional text | 170 | 150 | OK |
| Keywords as written above | 100 | 102 | **OVER by 2** |
| Keywords trimmed (use this) | 100 | 87 | OK |
| What's New (build 67) | 4000 | 1672 | OK |


**Note on the alternative subtitle:** "A calm app for finishing goals" is
exactly 30 of 30. It fits, but there is no margin, and ASC has rejected
at-limit strings before when it counts a character differently than expected.
"Finish one goal at a time" (25) is the safer pick and the stronger line.

**Use this keyword string** — the one above is 2 over:

```
goal,habit,routine,momentum,consistency,discipline,focus,daily,tracker,planner,progress
```

Slop scan: clean, re-run after the 2026-08-09 marketing pass. No forbidden phrase from the `copy` skill appears in any
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
