# Roadmap

Derived from [PRODUCT.md](./PRODUCT.md). PRODUCT.md says what Livra *is*; this file says
**what to build next and in what order**. Line references (e.g. `PRODUCT.md:436`) point at the
exact stress point or guardrail a part closes.

Order is **big-first**: the changes with the most product surface and risk go first, so later
polish lands on a stable base.

---

## How every part ships (the process)

Each part below goes through the **same pipeline** we used for the Momentum engine. No part is
"done" until it has been through all of it:

1. **Brainstorm** (`superpowers:brainstorming`) — only for parts with open design questions.
   Skip for mechanical parts whose shape is already settled in PRODUCT.md / the spec.
2. **Spec** (if the design is non-trivial) — a short design doc in
   `docs/superpowers/specs/`, decisions closed before any code.
3. **Plan** (`superpowers:writing-plans`) — a TDD task plan in `docs/superpowers/plans/`,
   each task `RED → GREEN → commit`, with a final verification gate task.
4. **Build** (`superpowers:subagent-driven-development`) — one implementer subagent per task
   (cheap tier for transcription, standard for integration), a **spec + quality review after
   each task**, fix loop until clean.
5. **Final whole-branch review** (`superpowers:requesting-code-review`, most capable model).
6. **Finish** (`superpowers:finishing-a-development-branch`) — push + PR (base is the current
   working branch, e.g. `docs/product-direction`).

**Branch per part:** `feat/<part-slug>` off the active product branch. Keep unrelated working-tree
changes unstaged; scope every commit to the part's files.

**Definition of Done (applies to every part):**
- [ ] All new behavior covered by tests written first (TDD).
- [ ] Full unit suite green, `type-check` clean, `lint` clean on new/changed files.
- [ ] The PRODUCT.md guardrail(s) / stress point(s) it targets are demonstrably satisfied.
- [ ] No banned pattern reintroduced (brittle streaks, guilt copy, dashes in user copy, paywalled core loop).
- [ ] PRODUCT.md stress-point callout updated or removed; this roadmap item checked off.

> Note: a Semgrep Guardian hook currently blocks `npm` in the main session — run test/lint/type-check
> through a subagent (they are not blocked), or log in the guardian MCP first.

---

## Phase 0 — Momentum engine ✅ DONE

- [x] **Momentum engine + persistence** — pure core `lib/goalMomentum.ts` + thin store
  `lib/goalMomentumStore.ts`. PR [#1](https://github.com/howk27/livra/pull/1)
  (`feat/momentum-engine`). 583/583 tests, final review = ready to merge.
  Plan: `docs/superpowers/plans/2026-06-17-momentum-engine.md`.

The engine is **invisible plumbing** — nothing consumes it yet. Phase 1 makes it real.

---

## Phase 1 — Complete the Momentum feature

Closes the two "being resolved (Momentum)" stress points (`PRODUCT.md:199`, `PRODUCT.md:289`)
and the Momentum guardrails (`PRODUCT.md:223`, `:282`, `:297`, `:299`, `:303/516`, `:520`).
Each subsystem consumes the engine's `MomentumSnapshot { state, days, cushionRemaining, slippingMarkId }`.

- [ ] **1.0 — Decide eval cadence (design gate, blocks 1.1–1.3).** A run only *starts* on a
  same-day `on_track` evaluation. Decide WHEN `evaluateGoalMomentum` is called relative to a
  log (call it synchronously on the log action, or relax the start condition). ~Half a page;
  no code. *Resolve before planning the subsystems below.*
- [ ] **1.1 — Streak-machinery transform** (spec §6). Heaviest part; streak refs live in ~16
  files. Remove the "Enable streak" toggle (`app/mark/new.tsx`); stop defaulting
  `enable_streak: true` (`app/onboarding.tsx`, `app/goal/new.tsx`); repurpose `anyStreakAtRisk`
  (`services/behaviorNotifications.ts`) to read Momentum; convert `seedBrokenStreak` /
  "Simulate Streak Loss" (`app/diagnostics.tsx`) to Momentum-state seeds; revisit "streak data"
  in the privacy policy. Closes `PRODUCT.md:199`, `:223`.
- [ ] **1.2 — Representation component** (spec §5). C+A hybrid on `app/(tabs)/focus.tsx`:
  "Momentum · N days" + warm glow; amber cushion gauge (from `cushionRemaining`) shown **only**
  when `state === 'slipping'`. No flame, no countdown number. Closes `PRODUCT.md:282`, `:303/516`, `:538`.
- [ ] **1.3 — At-risk banner + 1+1 notification** (spec §4, §10). In-app banner on `focus.tsx`
  when slipping; one push entering at-risk + one final before break; rotating copy pool added to
  `lib/copy.ts`; honors quiet hours / reminder prefs. Closes `PRODUCT.md:289`, `:297`, `:299`, `:520`.
- [ ] **1.4 — Completion banking** (spec §7.4). On goal completion (`state/goalsSlice.ts`) bank
  `days` into the completion record (+ optional share-card line); newly-active queued goal starts
  at days 0.
- [ ] **1.5 — Label copy.** Settings/notification toggle reads "Momentum & at-risk status"
  (`PRODUCT.md:294`).

*Deferred Minors from the engine review (fold into 1.x or a cleanup commit): `cushionFraction`
`breakGap<=atRiskGap` guard test; `momentumDays` future-startDate clamp; JSDoc on a few exports.*

---

## Phase 2 — Remaining PRODUCT.md stress points (big-first)

- [ ] **2.1 — Stats surface re-expose** (`PRODUCT.md:436`). Unhide + reroute the hidden `stats`
  tab so "history & stats are free" is reachable in-app. *(Next module after Momentum.)*
- [ ] **2.2 — Share card free/paid split** (`PRODUCT.md:424`). `canUseShareCard` currently gates
  the whole card behind Pro; PRODUCT promises presets free / custom designs paid.
- [ ] **2.3 — Monetization coherence** (`PRODUCT.md:95`, `:448`). Reconcile "one goal is active"
  with the free tier's 2 goals; make the locked-model table explicit about the daily-habit cap.
- [ ] **2.4 — Opacity done-state a11y** (`PRODUCT.md:494`). `focus.tsx` + `MarkFrequencyPicker`
  signal done with opacity 0.45 only; reuse the `MarkCard` completion-line pattern (icon/label/strikethrough).
- [ ] **2.5 — Retention cliff answer** (`PRODUCT.md:208`). Post-completion empty-queue gap
  (Momentum only covers the within-goal pull). Decide what an empty queue offers without
  manufacturing reasons to return.
- [ ] **2.6 — Voice: one canonical definition per screen** (`PRODUCT.md:313`). Centralize the
  Goal/Mark/Momentum/Daily-habit definitions each screen reuses (lands in `lib/copy.ts`).
- [ ] **2.7 — Dash-rule enforcement** (`PRODUCT.md:262`). No em-dash, en-dash, or hyphen-as-dash
  in user-facing copy; add a check.
- [ ] **2.8 — Register boundary** (`PRODUCT.md:36`). Draw the line where *personality* becomes
  *decorating the chrome* so a reviewer can apply it.
- [ ] **2.9 — Competitor / anti-reference naming** (`PRODUCT.md:367`).
- [ ] **2.10 — AI generosity** (`PRODUCT.md:398`). Make "one free AI draft, ever" honest and
  disclosed before it's spent.

---

## Launch gate

When Phases 1–2 are complete, run the full **Launch Readiness Check** in PRODUCT.md against the
real app. Every guardrail must pass before an App Store build.
