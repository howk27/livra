# Product

## Goal of this document

**This document defines what Livra is, who it's for, and how it must feel — and it is the
checklist we hold the app against before launch.**

It exists to do two jobs:

1. **Be the source of truth for product direction.** Any decision about features, copy,
   visual design, or monetization is settled here first. If a proposed change conflicts with
   this document, the change is wrong — or this document needs an explicit, deliberate update.
2. **Be the final UI check before launch.** Several sections end in a **Guardrails** block of
   pass/fail criteria. Before shipping, hold the real app against each one; if a screen fails
   a guardrail, it is not ready. The full list is consolidated in
   [Launch Readiness Check](#launch-readiness-check).

This is not a backlog or a spec. It says what Livra *is* and what it *refuses to be*; the
roadmap and individual feature specs are derived from it, not the reverse. The build order and
status of each part live in [ROADMAP.md](./ROADMAP.md) — every part ships through the same
brainstorm → spec → plan → subagent-driven TDD → review → PR pipeline.

> **Stress points.** Throughout this document, **Stress point — resolve while building**
> callouts flag places where the stated direction either contradicts the current code,
> contradicts another section, or carries a known strategic risk. They are not new
> direction; they are open gaps to close while building the relevant module. Several are
> launch-blocking — they mark guardrails that are currently *failing*, not aspirational.

## Register

product

This is a task-serving app surface, not a marketing or brand showcase. The register
is **earned familiarity**: consistent affordances, conventional patterns, no invented
strangeness. Personality is carried by voice and a few earned moments — never by
decorating the chrome.

> **Stress point — resolve while building:** This register ("no invented strangeness")
> sits in unresolved tension with the Brand Personality section's serif-italic greetings
> and "wise, slightly playful mentor" voice. The doc never draws the line where
> *personality* becomes *decorating the chrome*, so a reviewer can't actually apply it.
> When building any screen, decide concretely which moments earn personality (greetings,
> completion, the fixed teaching events) and which must stay plain chrome (settings, lists,
> forms). Write that boundary down here once it's settled.

## Users

Livra is for the person getting back to life — someone with one or two meaningful
goals they want to actually execute on, **one mark at a time**, rather than tracking
twenty habits at once. The audience blends three overlapping mindsets:

- The **goal-focused self-improver** who wants daily execution toward a real goal.
- The **habit-tracker graduate** who outgrew streak apps and wants something calmer.
- The **discipline-builder** working on a specific behavior (consistency, abstinence)
  who needs gentle accountability, not pressure.

Their context: a mobile-first, often interrupted daily check-in. The job they hire
Livra for is *"help me make steady progress on what matters without it becoming
another source of anxiety or another dashboard to maintain."*

What they are **not**: power users who want maximal configurability, quantified-self
hobbyists who want dense data, or people looking for a social accountability network.
Designing for those users would pull Livra toward the very things it rejects.

## Product Purpose

Livra turns goals into a small set of daily/weekly **marks** and helps the user keep
showing up — one goal active at a time, with the rest queued. Success is the user
completing real goals over weeks and months while feeling calmer and more in control,
not more surveilled. The app is a companion for execution, not a tracking spreadsheet.

Target outcome: a production iOS App Store release where the core loop (add a goal →
log marks → make visible progress → complete the goal) feels effortless and humane.

## Core Loop & Scope Guardrails

Everything in Livra serves one loop. If a feature doesn't make a step of this loop
clearer, calmer, or more rewarding, it doesn't belong.

```
add a goal  →  log marks toward it  →  see progress accrue  →  complete the goal
     ↑                                                                  │
     └──────────────────── queue the next one ──────────────────────────┘
```

- **Add a goal.** The user names something that matters. One goal is active; the rest
  wait in a queue. Adding is light — presets, templates, or a single AI-assisted
  generation get them moving without a setup chore.
- **Log marks.** A mark is the smallest repeatable unit of progress (the daily/weekly
  action). Logging is the core gesture of the app and must be near-frictionless: one
  tap, with visible confirmation.
- **See progress.** Progress accrues visibly and honestly — toward the active goal,
  not as a streak to protect. Rest is part of it; a missed day is not a broken state.
- **Complete the goal.** Completion is the emotional peak. It is marked with weight and
  warmth — earned, not manufactured — and the next queued goal steps forward.

> **Stress point — resolve while building:** "One goal is active" collides with the
> monetization model, which sells "Active goals: 2" on the free tier (`FREE_GOAL_LIMIT = 2`
> in `lib/gating.ts`). A goal is either active or queued — the words can't both be true.
> Before building the goals list / queue UI, pick one model and make every surface agree
> (most likely **1 active + 1 queued slot free**, with Livra+ unlocking an unlimited
> queue), then fix the monetization table's "Active goals: 2" wording to match. Otherwise
> this contradiction ships as confusing copy.

### The vocabulary (define it, don't assume it)

Livra runs on **three owned nouns: Goal, Mark, and Momentum.** A **mark** is *not* the act of
tapping — it is a repeatable action you define and then **log** each time you do it. Logging
is the gesture; the mark is the thing being logged.

- **Goal** — the meaningful outcome you're working toward (e.g. *run a half-marathon*).
- **Mark** — a small, repeatable action under that goal, logged each time you show up
  (e.g. *training run*, logged ~4× a week). A mark that isn't attached to a goal is a
  standalone **daily habit** — the same object, just goal-free. "Daily habit" is a label
  for one kind of mark, **not a separate concept** the user has to learn.
- **Momentum** — each active goal's forgiving run (up to two active at once, one per goal): a day count earned by honoring your marks'
  frequencies. It survives a stumble and only resets after a real slide, so a rest day never
  breaks it. Momentum is *not* a streak in the punishing sense (see "Not now / not ever") and
  is specced in full at `docs/superpowers/specs/2026-06-17-momentum-design.md`.

Worked example — **Goal:** run a half-marathon · **Mark:** "training run," logged ~4×/week ·
**Daily habit (un-goaled mark):** "stretch." · **Momentum:** "12 days," held as long as the
marks' frequencies are honored.

"Mark" is owned vocabulary, not throwaway jargon: define it **once**, early — in onboarding
and in the relevant empty state — then **use it consistently and warmly everywhere after**
(milestone marks, completion, progress copy), never quietly swapping it for a generic word.

### Not now / not ever

To protect focus, Livra explicitly refuses to become:

- **A multi-habit dashboard.** No "track 20 things at once" grid. One active goal is the
  whole point.
- **A streak-panic engine.** No *brittle* streaks that punish a missed day, no loss-aversion
  mechanics, no "don't break the chain" pressure. Livra's **Momentum** is the sanctioned
  opposite: a forgiving run that survives a stumble and resets only after a genuine slide, so
  the lever is encouragement, never dread.
- **A social/accountability feed.** No followers, no leaderboards, no public shaming or
  comparison. (Sharing a finished result is opt-in and outbound only — never a feed.)
- **A quantified-self analytics suite.** No dense charts competing for attention. Stats
  exist to reassure and orient, not to be studied.
- **A notification nag machine.** Reminders are gentle, user-set, and skippable — never
  attention-hijacking or guilt-driven. The one sanctioned exception is the **Momentum
  at-risk warning**: at most two pushes per slip (one when it goes at-risk, one final before
  it would reset), rotating copy, always an offer with a rest-out. With a frequency-scaled
  cushion the warning is the only way to see the edge, so it informs rather than nags.

**Guardrails (check before launch):**
- [ ] Logging a mark is reachable in one tap from the primary screen and gives visible
      confirmation (not haptic-only).
- [ ] Exactly one goal is presented as "active"; the rest are clearly queued, not competing.
- [ ] No screen presents the user with more than a handful of things to do at once.
- [ ] "Mark," "Goal," and "Daily habit" are each defined in copy the user actually sees
      before they're expected to use them.

## Brand Personality

Calm, intentional, warm, and human. The current feel is the north star: serif-italic
greetings, forgiveness language ("rest is part of it"), one-thing-at-a-time focus,
celebration that feels *earned* rather than gamified.

Three words: **calm · intentional · warm.**

### The growth edge: more didactic & entertaining

A deliberate growth edge: Livra should become a little more **didactic and
entertaining** — teaching the user gently and keeping them engaged — *without*
sacrificing calm and focus. This edge is real, but it is **disciplined**: it lives in
three specific vehicles and nowhere else.

1. **Onboarding teaches the method, once, up front.** The didactic weight is
   front-loaded so the rest of the app can stay quiet. By the end of onboarding the user
   understands what a goal, a mark, and a daily habit are, why one goal at a time, and why
   a missed day is fine. Teaching here can be richer and more guided because it happens
   once and then gets out of the way.
2. **A small, fixed set of earned teaching moments.** At specific, meaningful events —
   **first goal created, first missed day, first completion, and milestone marks** — Livra
   says something that teaches or reflects. These are event-driven and finite, not an
   always-on layer. Each moment earns its interruption.
3. **Voice and micro-copy carry the rest.** Day to day, personality lives entirely in the
   words — greetings, empty states, confirmations, the occasional aside — not in new
   surfaces. See [Voice & Copy](#voice--copy).

**Onboarding is skippable — so empty states teach too.** Onboarding carries the richest
teaching, but a user can skip it, so the empty states are a **co-equal** teaching surface,
not a fallback: each term is defined wherever it's first relied on, with or without
onboarding. And teaching the *method* is not a setup chore — the first goal stays light
(presets, templates, or one AI draft); what onboarding adds is the *why*, not more steps.

**What the growth edge is NOT.** It is explicitly **not** a recurring engagement surface —
no weekly feed, no "insight of the week" card, no daily content stream, no brittle streak
visualization. Most of the retention layer (calendar heatmap, daily-progress card, pace
banner, Weekly Review screen) was **intentionally cut** and stays cut. The **one deliberate
exception is Momentum** — the forgiving, frequency-earned run defined in the vocabulary above
and specced separately — readmitted on purpose because it pulls *without* punishing.
Everything else in that cut list must not quietly return, and Momentum itself must never
harden into the brittle streak it replaced. Engagement otherwise comes from the user making
real progress on something they care about — not from Livra manufacturing reasons to return.

> **Stress point — being resolved (Momentum):** The streak machinery still wired through the
> code (the "Enable streak" toggle in `app/mark/new.tsx`, `enable_streak: true` defaults in
> `app/onboarding.tsx` / `app/goal/new.tsx`, `anyStreakAtRisk` in
> `services/behaviorNotifications.ts`, the `streakProtection` flag and "Simulate Streak Loss"
> in `app/diagnostics.tsx`, "streak data" in the privacy policy) is **not** being deleted —
> it is being *transformed* into Momentum. See
> `docs/superpowers/specs/2026-06-17-momentum-design.md` §6 for the per-file plan. The brittle
> streak goes; the forgiving run takes its place.

> **Stress point — resolve while building:** "No manufactured reasons to return" is
> principled but is also the product's biggest commercial risk, and the doc treats it as
> pure virtue. A goal-completion app has a structural cliff: a user finishes in ~8 weeks,
> the queue empties, and nothing pulls them back. Before launch, answer here what week 9
> looks like after a completion with an empty queue — the calm, non-nagging version of
> "what's next" — so the anti-retention principle has a deliberate answer instead of an
> accidental churn hole. (Momentum answers the *within-goal* pull, a reason to show up day to
> day; the post-completion, empty-queue cliff is still open and separate.)

**Guardrails (check before launch):**
- [ ] Onboarding leaves the user able to define a goal, a mark, and a daily habit.
- [ ] Onboarding is completable in well under a minute and never traps the user (Skip always works).
- [ ] A user who skips onboarding still meets each term defined in empty states before relying on it.
- [ ] Teaching/reflection moments appear only at the fixed events above — not on a timer or
      every session.
- [ ] No surface re-creates the cut retention layer (brittle streaks, heatmaps, pace banners,
      weekly feed). Momentum is the one sanctioned exception and must stay forgiving.

## Voice & Copy

Livra speaks like a **wise, slightly playful mentor**: a thoughtful coach who has seen
people do this before, names what's actually hard, reframes setbacks without sugar-coating
them, and — once in a while, when it's earned — lets a warm, knowing wink through. Never
preachy. Never cutesy. Never a cheerleader. The wit is dry and human; it makes the user
feel *understood*, not *performed at*. When in doubt, the voice errs toward calm.

### Voice principles

1. **Teach, don't lecture.** Offer a small, useful insight in the user's moment of need —
   then stop. A sentence the user can act on beats a paragraph they'll skip.
2. **Reframe, don't cheerlead.** Meet setbacks honestly and turn them. "Rest is part of it"
   beats "You've got this!" Optimism is earned by acknowledging the real thing first.
3. **Earn the wink.** Playfulness is a seasoning, not the dish. A light, knowing aside lands
   only when the rest of the voice is calm and sincere. If every line is witty, none of them
   are.
4. **Brevity is warmth.** Respect the interrupted, mobile context. Short sentences. Plain
   words. The user is mid-life, not reading an essay.
5. **Never guilt.** No shame, no loss aversion, no "you broke your streak." A missed day is
   met with reassurance, never a frown. Forgiveness is non-negotiable.
6. **Own the vocabulary, define it once.** "Goal," "Mark," and "Momentum" are Livra's three
   nouns — define each the first time it appears, then use it consistently and with warmth
   everywhere after. Don't define "mark" once and then hide it behind a generic word; the term
   should recur (milestone marks, "that's one," completion copy) so it becomes the user's own
   language. "Daily habit" is just an un-goaled mark, not a separate term to teach. Momentum is
   defined where it first appears (not forced into onboarding). Never assume the user already
   knows the model.

### Copy formatting

**No dashes in user-facing copy.** Notifications, alerts, and any on-screen message use no
em-dashes (—), en-dashes (–), or hyphens standing in as dashes. Use a period, a comma, or two
short sentences instead. (This rule governs shipped app copy; this spec document itself is
exempt — the example lines below are written dash-free to model the rule.)

> **Stress point — resolve while building:** This ban (em-dash, en-dash, *and*
> hyphen-as-dash) is a launch-blocking pass/fail, but it's subjective and hard to QA —
> distinguishing a hyphen-as-dash from a legitimate hyphen is human judgment, and it
> regresses every time copy is touched. Either downgrade it from a hard launch gate to a
> copy-review style note, or give it a mechanical check (a lint rule or CI grep over copy
> strings) so it's enforced automatically rather than by eyeball. As written it competes
> for launch attention with guardrails that are actually failing.

### Do / Don't (with real lines)

| Surface | Do — wise & playful mentor | Don't — off-tone |
| --- | --- | --- |
| **Greeting** | *"Welcome back. One step today is enough."* | "🔥 Day 7! Keep your streak alive!" |
| **Empty state (no goals)** | *"Nothing here yet. That's exactly the right place to start. Pick one thing that matters."* | "You have 0 goals. Get started now!" |
| **What's a mark? (first use)** | *"A mark is one action you'll repeat toward your goal. Small, yours. Log it each time you show up."* | "Tap + to add a counter to your tracker." |
| **First missed day** | *"Missed yesterday? Good. That means you're human. Today's still open."* | "You broke your 5-day streak. 😟 Don't let it happen again." |
| **Logging a mark** | *"That's one. It counts."* | "+1 XP! Streak +1! Combo x3!" |
| **Goal completion** | *"You finished what you started. That's rarer than it sounds. Take the moment."* | "Achievement unlocked! 🏆🎉 Share your badge!" |
| **Paywall nudge** | *"You've filled this goal up. Livra+ lets you carry more when you're ready. No rush."* | "Upgrade now! Limited time! Don't miss out!" |
| **At-risk status** | *"This one's slipping a little. Want to make it today's single focus?"* | "⚠️ You're falling behind! Catch up now!" |
| **Momentum (on screen)** | *"Momentum · 12 days. Resting today, and it holds."* | "🔥 12-day streak! Don't break it!" |

> **On "at-risk":** this is an *offer to refocus*, never a penalty — the one allowed
> nudge that survives the no-guilt rule. It surfaces a choice ("want to make this today's
> one thing?") and never scores, scolds, counts a loss, or implies a broken state. The
> moment it starts to feel like streak-panic in softer clothing, it has crossed the line.

> **Stress point — RESOLVED (Momentum 1.3, `841ce15`):** At-risk is no longer a separate feature —
> it is **Momentum's warning system**. It derives from the per-mark frequency gap (built on
> `lib/consistency.ts`), never from a raw streak counter, and surfaces as the in-app banner
> plus the 1+1 rotating notification. See
> `docs/superpowers/specs/2026-06-17-momentum-design.md` §3–4. Settings exposes a single master
> notification switch (Phase 1.5); at-risk controllability is satisfied by the calm 2/day cap and
> no-guilt copy rather than a dedicated at-risk off-switch. The monetization table line already reads
> "Momentum & at-risk status".

**Guardrails (check before launch):**
- [ ] No copy uses guilt, fake urgency, or streak-loss language.
- [ ] No user-facing copy uses an em-dash, en-dash, or a hyphen as a dash.
- [ ] "At-risk" reads as an offer to refocus, never a penalty or a broken-state warning.
- [ ] Celebration copy is proportionate to what was actually achieved.
- [ ] Playful lines are the exception, sitting among calm, sincere ones — not wall-to-wall.
- [ ] Every term of the Goal/Mark/Momentum/Daily-habit vocabulary is defined before it's
      relied on (Momentum at its first appearance).

### Keeping voice consistent

Voice drifts one well-meant screen at a time, so these are standing rules, not just launch
checks: all new user-facing copy is held against the Do/Don't table before it ships, and each
vocabulary term has **one** canonical definition that screens reuse — never re-invented or
re-worded per surface. If a new string can't be written in this voice, the feature copy is
wrong, not the voice.

> **Stress point — resolve while building:** "One canonical definition each screen reuses"
> has no enforcement mechanism, so it will drift one screen at a time exactly as warned. A
> copy constants file already exists (`lib/copy.ts`); anchor the Goal/Mark/Daily-habit
> definitions and the recurring lines there as the single source, and have screens import
> them rather than re-typing strings. A rule with no home file is a hope, not a guardrail.

## Design Principles

1. **One mark at a time.** Focus over breadth. The interface protects attention; one
   active goal, the rest queued. Never present the user with twenty things to do.
2. **Forgiveness over guilt.** Missing a day is not a failure state. No streak panic,
   no loss aversion as a lever. Reassure at the low moments.
3. **Earned celebration, not cheap dopamine.** Mark real milestones and completions
   with weight and warmth; never manufacture excitement the user didn't earn.
4. **Teach gently.** Be a little didactic and engaging — guide the user into the
   method — without lecturing, cluttering, or breaking the calm.
5. **The tool disappears into the task.** Product register: earned familiarity,
   consistent affordances, no invented strangeness. Personality is carried by voice
   and a few moments, not by decorating the chrome.
6. **Every state is designed.** Every screen handles its empty, loading, and error
   states deliberately — and consistently across the app (standard skeletons, standard
   error copy with a retry, never a blank screen or a raw error string).

## Anti-references

Livra must NOT feel like:

- **Gamified streak apps** (Duolingo-style guilt, streak-loss panic, badge spam,
  confetti dopamine, dark-pattern nags). This bans the *punishing* streak, not momentum
  itself — Livra's forgiving **Momentum** is the deliberate counter-example.
- **Cluttered dashboards** (Notion/enterprise density — charts and widgets competing
  for attention).
- **Corporate / clinical SaaS** (cold, gray, generic productivity-tool aesthetic with
  no soul).
- **Hyper-aggressive growth UX** (constant upsell modals, fake urgency,
  attention-hijacking notifications).

## Competitive Positioning

**The wedge:** *Most habit apps help you track many things; Livra helps you finish one.*

Livra is the calm middle that the market leaves empty — between toys that gamify and
tools that overwhelm. It competes on **focus and feel**, not feature count.

| Category | What they optimize for | Where Livra differs |
| --- | --- | --- |
| **Streak / gamified apps** (Duolingo-style, streak trackers) | Daily return via loss aversion and dopamine | Momentum without the panic. A forgiving run you can rest from, not a brittle streak that punishes a missed day. |
| **Habit trackers** (multi-habit grids, checkbox apps) | Breadth — track everything | Livra is deliberately narrow: one active goal, a few marks. Depth over breadth. |
| **Notion-style / productivity tools** | Configurability and data density | Livra is opinionated and quiet. No setup chore, no dashboard to maintain. |

The defensibility is the **personality and the discipline of the cut** — the things Livra
refuses to do are as load-bearing as the things it does. A competitor can copy a feature;
copying the restraint means giving up their own growth metrics.

> **Stress point — resolve while building:** The named anti-references are all *gamified*
> apps (Duolingo-style), but the calm/forgiving lane is the most crowded emerging niche —
> Finch, Stoic, Daylio, and Fabulous already own "warm and non-punishing," and at least one
> is well funded. The real threat isn't a streak app; it's a warm incumbent adding a
> "single goal" mode. "Discipline of the cut" is a *taste* moat, not a structural one.
> Before leaning on this positioning in store copy, name the live calm-lane competitors
> here and state what specifically Livra does that they don't, beyond restraint, which is
> copyable.

## Monetization Stance

Livra sustains itself through a **Livra+** subscription, sold the way the rest of the
product behaves: **soft, honest, never aggressive.** The core loop is never blocked. The
free tier must stay genuinely useful on its own — a free user can complete real goals and
feel the product's value before they're ever asked to pay.

**Principles:**
- **The core loop is never paywalled.** Adding goals, logging marks, seeing progress, and
  completing goals always work for free.
- **History, stats, and presets belong to the user** — never gated. The user's own data and
  progress are not a hostage.
- **Soft upsell only.** Upgrade prompts appear at the moment a limit is genuinely reached,
  framed as "when you're ready" — never as a modal interruption, fake urgency, or a wall on
  the core experience.
- **Livra+ sells more room and power, not relief from pain.** The free tier is not
  deliberately crippled to force the upgrade; Livra+ extends a product that already works.
- **The free AI draft is honest about being one-time.** AI generation is an *optional*
  accelerator, not the only way in — presets and templates are always free. Its one-time
  nature is stated plainly at the point of use ("one free AI draft"), so it's a deliberate
  choice the user makes, never a wall they discover later.

> **Stress point — resolve while building:** "One free AI draft, ever" (confirmed:
> `free_use_exhausted` in `app/onboarding.tsx`) is honest but may read as stingy at the
> exact first-impression moment, in a market trending toward free AI assist as table
> stakes. The honesty is right; the *generosity* is the open question. This only holds if
> the free presets/templates path is genuinely good enough that a user who never touches AI
> still gets a great first goal, so the preset library quality is a hard dependency of this
> stance, not a side feature. Pressure-test the presets before assuming "one draft ever" is
> safe.

**The split (locked model):**

| | Free | Livra+ |
| --- | --- | --- |
| Active goals | 2 | Unlimited queue |
| Marks per goal | 3 | Unlimited |
| Goal history & stats | ✅ Full | ✅ Full |
| Presets / templates | ✅ All | ✅ All |
| AI goal/mark generation | 1 free, ever | Repeat use |
| Momentum & at-risk status | ✅ | ✅ |
| Share card | ✅ Preset designs | ✅ Custom designs |
| Custom reminders, CSV export, Apple Health, mark reordering, pace projection | — | ✅ |

> **Share cards:** preset share-card designs are free — finishing a goal is a moment any
> user should be able to share. Livra+ adds *custom* designs (themes, layout, branding), so
> the upgrade sells expression, not the ability to share at all.

> **Stress point — RESOLVED (Phase 2.2):** Sharing the completion card is now free (the inline
> Pro bounce in `app/goal/complete.tsx` is gone). Customization is the Livra+ tier:
> `canCustomizeShareCard(isPro)` in `lib/gating.ts` gates a 4-theme picker, accent swatches, and
> element toggles surfaced inline in `SharePreviewModal`; free users get the default preset and a
> soft "Customize · Livra+" nudge. `canUseShareCard` (dead code) was removed. Paywall reframed to
> "Custom Share Cards". Design: `docs/superpowers/specs/2026-06-21-share-card-split-design.md`.

> **Stats (pre-launch item) — RESOLVED (Phase 2.1):** the history surface
> (`app/goal/history.tsx`) is free and now reachable in-app from the Goals tab via an
> always-visible History entry, including for accounts with zero completed goals. The
> "history & stats free, never gated" commitment is satisfied: free (no Pro gate), and
> reachable (no longer hidden behind a completed-count condition).

**Why these numbers are genuinely useful, not crippled.** A mark is a *recurring action*,
not a single rep — so 3 marks on a goal is a complete routine (e.g. half-marathon: training
run · strength · stretch), not a teaser. Two active goals matches the "one at a time, rest
queued" philosophy: enough to have real work in flight, few enough to stay focused. A free
user can run, and finish, a meaningful goal — Livra+ adds room, not the basics.

> **Stress point — resolve while building:** The locked-model table is silent on a real
> shipped gate: free users are capped at 3 un-goaled daily-habit marks (`FREE_HABIT_LIMIT =
> 3` in `lib/gating.ts`). A source-of-truth monetization table that omits a live limit will
> surface as a surprise paywall. Add the daily-habit cap to the table so the model the doc
> settles matches the gates the code enforces.

**Guardrails (check before launch):**
- [ ] No part of the add → log → progress → complete loop is blocked for free users.
- [ ] History, stats, and presets are never behind the paywall.
- [ ] The free AI generation discloses it's one-time *before* it's spent; presets/templates
      remain a full free path to a first goal.
- [ ] Preset share cards work for free users; only custom designs are Livra+.
- [ ] Upsell language is soft and contextual — no fake urgency, no full-screen interruption
      of the core loop.

## North-Star & Success Metrics

**North-star: goals completed.** The single number that means Livra is working is **real
goals finished** by real users over weeks and months. Not opens, not streaks, not daily
active sessions — those can all go up while the user feels worse. Livra succeeds when people
*accomplish the thing they came to accomplish*.

**Supporting signals** (each with an anti-vanity guardrail):

| Signal | What it tells us | Guard against |
| --- | --- | --- |
| **Goal completion rate** | Are people finishing what they start? | Don't inflate by making goals trivial — completion should mean something. |
| **Marks logged per active week** | Is the core loop actually used? | Not a streak. More is not automatically better; healthy rest weeks are fine. |
| **Return after a missed day** | Does forgiveness work — do people come back? | Never engineer this with guilt nags. Measure recovery, don't force it. |
| **Free → Livra+ at a real limit** | Is the value clear enough to pay for? | Conversion driven by genuine need (more room), not by crippling free. |

If a metric can be moved by a dark pattern, moving it that way is a failure, not a win.
Every metric is read through the anti-references: a number that goes up because the app got
pushier is a number we ignore.

## Accessibility & Inclusion

Not a current priority — the focus is shipping the core experience first. The broader pass
(AA contrast, reduced-motion) stays deferred.

**One exception is not deferrable.** Done/logged state is currently shown by dimming to 45%
opacity with no other cue (`focus.tsx`, `MarkFrequencyPicker`). That conveys state by opacity
alone — a usability bug, not just an a11y nicety — and it contradicts Design Principle 6
("every state is designed"). Before launch, the done state must carry a non-dimming cue: a
check, a label, or a strikethrough.

> **Stress point — resolve while building:** Confirmed in code at `app/(tabs)/focus.tsx`
> and `app/onboarding.tsx` (both `opacity: 0.45`). The fix pattern already exists in the
> app: `components/MarkCard.tsx` marks a logged state with a completion line and a
> color/background change, not dimming. Reuse that treatment rather than inventing a new
> one, and apply it to `focus.tsx` and `MarkFrequencyPicker` so the done cue is consistent
> across surfaces.

## Launch Readiness Check

A consolidated pass/fail list pulled from the guardrails above. Before launch, hold the
real app against each line.

**Core loop & focus**
- [ ] Log a mark in one tap from the primary screen, with visible confirmation (not
      haptic-only).
- [ ] Exactly one active goal; the rest clearly queued, not competing.
- [ ] No screen shows more than a handful of things to do at once.
- [ ] No brittle streaks, heatmaps, pace banners, or weekly feed anywhere. (Momentum is the
      one sanctioned exception: forgiving, frequency-earned, resets only after a real slide.)

**Voice & teaching**
- [ ] "Goal," "Mark," "Momentum," and "Daily habit" are each defined in copy the user sees
      before they're expected to use them (Momentum at its first appearance).
- [ ] Onboarding leaves the user able to define all three terms and explain "one at a time."
- [ ] Teaching/reflection moments appear only at fixed events (first goal, first miss, first
      completion, milestones) — never on a timer.
- [ ] No copy uses guilt, fake urgency, or streak-loss language.
- [ ] No user-facing copy uses an em-dash, en-dash, or a hyphen as a dash.
- [ ] Celebration is proportionate; playful lines are the exception, not the default.

**State handling**
- [ ] Every screen handles empty, loading, and error states — consistently (standard
      skeletons, human-readable errors with retry, no blank screens, no raw error strings).
- [ ] Logged/done state is shown by more than opacity — an icon, label, or strikethrough —
      not dimming or color alone.

**Monetization**
- [ ] No part of the core loop is paywalled; history/stats/presets are free.
- [ ] The free AI generation discloses it's one-time before it's spent; presets are a full
      free path to a first goal.
- [ ] Preset share cards work for free; only custom designs are Livra+.
- [ ] Upsells are soft and contextual — no fake urgency, no full-screen interruption.

**Feel (anti-references)**
- [ ] The app does not read as a gamified streak app, a cluttered dashboard, clinical SaaS,
      or aggressive growth UX.
