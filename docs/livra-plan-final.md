# Livra — Product Plan v3 (Final)
**Owner:** Deivi Sierra / Sierra Link LLC
**Updated:** May 2026
**Purpose:** Strategic repositioning + development roadmap handoff

---

## What Livra Is

Livra is a **goal execution app** for iOS. Not a habit tracker. Not a counter.

> *"Most people have a graveyard of abandoned goals. Livra is where goals actually get done — one at a time, in sequence."*

Clean and minimal UI. Human voice throughout. Monthly subscription at $4.99/mo.
App Store category: **Productivity.**

---

## The Architecture

### Marks Live at the User Level — Not the Goal Level

Marks represent who you're becoming daily. They do not reset when a goal changes.

- User owns their marks permanently
- Finish a goal → next goal activates → same marks continue
- What ties to a goal is the *context* — why those marks matter right now
- **Do not architect marks as children of goals. This is a hard rule.**

### Goal Queue

- Users queue up to **3 goals on the free tier**, unlimited on paid
- Only **1 goal is active** at a time
- Free users can see their full queue — they experience the system, they just hit a ceiling at 3
- Finishing a goal unlocks the next one automatically
- Completion history builds over time — the list of things you actually finished

### Daily Check-in

Single focused interaction. Not a checklist.
One question, one tap. Low friction. Human.
Tied to the active goal — not generic.

### Weekly Reflection

Rule-based in v1. Written copy, not AI-generated.

Each mark gets 5 performance tiers: **strong / solid / inconsistent / missing / first week**
Each tier gets 2–3 pre-written human sentences using the mark's identity language.
~60–75 lines of copy written once. Rotated to avoid repetition.

Example output:
*"This week you showed up for Sleep and Deep Work. Workout's been quiet — it'll notice when you come back."*

Flag for AI upgrade in v2 when subscription revenue justifies the cost.

---

## Marks System

Each mark has its own identity — not a label, not a checkbox.

| Mark Type | Identity | Native Integration |
|---|---|---|
| Sleep | Recovery | iOS Health / Alarm |
| Workout | Strength | Apple Health |
| Deep Work | Focus | Timer |
| Read | Growth | Pages log |
| No Spend | Discipline | Manual |
| Hydration | Vitality | Health app |
| Custom | User-defined | Manual |

Rules:
- Each mark has a name, icon, and one-line identity statement
- Marking done = confirming who you're becoming, not logging data
- Users can **reorder marks freely** — required at launch, not a v2 feature
- Native integrations ship in Phase 3

---

## Goal Completion Moment

**Feel:** Noticeable but not over the top. Minimal and celebratory at once.

**What it looks like:**
- A brief full-screen moment — subtle animation (not confetti, not fireworks)
- The goal name displayed prominently
- A single line of copy that lands with weight:
  *"Done. That one's yours forever."*
- Two actions: **See what's next** (activates next goal) or **Take a moment** (short reflection prompt before moving on)
- The completed goal moves to the history list immediately — visible proof it happened

**What it does not do:**
- No over-the-top celebration that feels hollow
- No immediate push to rate the app or share
- No streak reset language

---

## Notifications — Human Voice

The app speaks to you. Not at you.

### Daily reminder
*"Today's the day you said you'd work on [goal name]."*

### Re-engagement — lapsed 2–3 days
*"Hey — your goal is still waiting. You've got this."*

### Re-engagement — lapsed 4+ days
*"You've been away a few days. Want to pick up where you left off or adjust your timeline?"*
Two buttons. No shame. No broken streak language.

### Progress slip (Phase 3 — once recalculation engine exists)
*"At your current pace, you're running a few weeks behind. Still doable — want to push or recalibrate?"*

> **Voice rule:** Warm, direct, believes in the user. Never guilt. Never streaks as leverage. Always goal-anchored.

---

## Monetization

**Model:** Monthly subscription
**Price:** $4.99/mo
**Platform:** iOS only at launch
**App Store category:** Productivity

### Free Tier
- Up to 3 goals in queue (1 active at a time)
- Up to 3 marks
- Daily check-in
- Weekly reflection sentence
- Basic notifications
- Goal completion moment

### Livra+ (Paid)
- Unlimited goals in queue
- Unlimited marks
- Mark reordering
- Native integrations (Health, Alarm) — Phase 3
- Custom mark identities
- Full notification customization
- Backup / restore

> **IAP migration note:** Current build uses a one-time purchase IAP. Migration to subscription is the highest-risk technical change in this plan. Execute in isolation. Define a grace period or grandfather access for any existing purchasers before shipping.

---

## What Changes From Current Build

Current app is a counter tracker with streaks, 7-day charts, and a one-time purchase IAP. Everything below needs to change.

### Product
- [ ] Remove counter/tracker framing entirely
- [ ] Build goal queue (active + upcoming, capped at 3 free / unlimited paid)
- [ ] Refactor marks to user-level, persistent (architecture change — not a feature add)
- [ ] Replace counters with identity-based marks
- [ ] Add mark reorder functionality (required at launch)
- [ ] Redesign daily check-in as single focused interaction
- [ ] Build weekly reflection using pre-written copy tiers
- [ ] Build goal completion moment (subtle animation + copy + next goal activation)
- [ ] Rewrite all notification copy in human voice

### Monetization
- [ ] Migrate one-time purchase IAP → monthly subscription ($4.99/mo)
- [ ] Redefine free vs. paid feature split per this plan
- [ ] Update paywall screen copy and positioning
- [ ] Define grandfather/grace period for existing purchasers

### Copy & Tone
- [ ] Rewrite all UI copy — every label, empty state, onboarding prompt
- [ ] Write Livra voice guide (warm, direct, believes in the user)
- [ ] Write weekly reflection copy library (~60–75 lines across 5 tiers per mark)
- [ ] Write goal completion copy
- [ ] **App Store listing rewrite ships in the same release as Phase 2 — not before**

### Technical (Phase 3)
- [ ] Recalculation engine for goal progress / deadline slippage
- [ ] iOS Health integration for relevant marks
- [ ] Alarm integration via iOS for Sleep mark

---

## What Stays

- React Native / Expo stack
- Supabase backend
- SQLite offline-first
- Clean minimal visual aesthetic
- iOS only at launch

---

## Phased Rollout

### Phase 1 — Reposition (Now)
Rewrite copy and notification voice inside the current build.
No structural or feature changes. Ship as an update.
Test whether repositioning alone improves retention and reduces churn.
**App Store listing does NOT update until Phase 2 ships.**

### Phase 2 — Core System
- Refactor marks to user-level architecture
- Build goal queue (3 free / unlimited paid)
- Build identity-based marks with reordering
- Redesign daily check-in
- Build weekly reflection (rule-based copy library)
- Build goal completion moment
- Migrate to subscription IAP ($4.99/mo)
- App Store listing update ships with this release

### Phase 3 — Depth
- Recalculation engine (progress/deadline logic)
- Native integrations (Health, Alarm)
- Completion history screen
- Milestone moments within long goals
- Upgrade weekly reflection to AI-generated (if revenue supports it)

---

## Notes for Claude Code Handoff

- Phase 1 copy changes are non-breaking — safe to update strings without touching logic
- **Marks refactor is an architecture change** — user-level, not goal-level. Plan the data model before touching UI
- Subscription IAP migration is highest-risk — execute in isolation, test thoroughly before release
- Mark reordering: use existing `react-native-reanimated` already in stack (drag-and-drop)
- Weekly reflection: rule-based string selection from a copy library — no AI, no API cost at launch
- Goal completion moment: target a subtle scale + fade animation using `react-native-reanimated`
- Notification rewrites are copy-only — no logic changes needed for Phase 1
- App Store category: Productivity (not Health & Fitness)

---

## Open Decisions

None. All decisions closed as of May 2026.

---

*v3 Final — May 2026*
