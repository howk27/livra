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

- [x] **1.0 — Decide eval cadence (design gate, blocks 1.1–1.3).** DECIDED: evaluate on every
  linked log (in `creditMarkToGoals`, starts/continues the run) + re-evaluate on app foreground
  (catches slipping/broken decay); engine start condition unchanged; 1+1 nudge via pre-scheduled
  local notifications. See `docs/superpowers/specs/2026-06-19-momentum-eval-cadence.md`.
- [x] **1.1 — Momentum integration (eval wiring + streak-machinery transform)** (spec §6). DONE +
  merged (`60dc1e8`), 9 TDD tasks, 592 tests, final review = ready. Wired both eval triggers
  (`creditMarkToGoals` + `evaluateActiveGoalsMomentum`); repurposed `anyStreakAtRisk`
  (`services/behaviorNotifications.ts`) to read Momentum; removed the "Enable streak" toggle
  (`app/mark/new.tsx`, `app/mark/[id]/edit.tsx`); stopped defaulting `enable_streak: true`
  (`app/onboarding.tsx`, `app/goal/new.tsx`, default now false); converted `seedBrokenStreak` /
  "Simulate Streak Loss" (`app/diagnostics.tsx`) to a Momentum-broken seed; privacy copy now
  "momentum data". Plan: `docs/superpowers/plans/2026-06-19-momentum-integration.md`. Closes
  `PRODUCT.md:199`, `:223`.
- [x] **1.2 — Representation component** (spec §5). C+A hybrid on `app/(tabs)/focus.tsx`:
  "Momentum · N days" + warm glow; amber cushion gauge (from `cushionRemaining`) shown **only**
  when `state === 'slipping'`. No flame, no countdown number. Closes `PRODUCT.md:282`, `:303/516`, `:538`.
  DONE + merged (aad3dec): momentumSlice cache, pure momentumPresenter, GoalMomentum component,
  momentumAmber token, per-goal render on focus.tsx. 606 tests; final opus review = ready.
- [x] **1.3 — At-risk banner + 1+1 notification** (spec §4, §10). In-app banner on `focus.tsx`
  when slipping; one push entering at-risk + one final before break; rotating copy pool added to
  `lib/copy.ts`; honors quiet hours / reminder prefs. Closes `PRODUCT.md:289`, `:297`, `:299`, `:520`.
  DONE + merged (`841ce15`): pure `momentumWarningDates` + `momentumWarningPlanner` (≤1 push/day),
  `livra-mw-` namespace split, `momentumWarningNotifications` reconcile service wired into both eval
  points, banner show-predicate + per-day dismiss + `MomentumBanner` on focus. 35 warning/banner tests
  green. Plan: `docs/superpowers/plans/2026-06-19-momentum-at-risk-warning.md`.
- [x] **1.4 — Completion banking** (spec §7.4). On goal completion (`state/goalsSlice.ts`) bank
  `days` into the completion record (+ optional share-card line); newly-active queued goal starts
  at days 0. DONE (branch `feat/momentum-completion-banking`): `banked_momentum_days` on the
  completed goal (AsyncStorage JSON, no migration), pure `formatBankedMomentum`, "Finished with N
  days of momentum" on the completion overlay and the share card; completed goal's snapshot cleared,
  promoted queued goal starts at 0. 653/653 tests, type-check + lint clean (no new violations).
  Plan: `docs/superpowers/plans/2026-06-20-momentum-completion-banking.md`.
- [x] **1.5 — Notification master switch + daily guardrail.** Settings/Notifications is a single
  persisted master switch (reuses `livra_reminders_enabled_v1`) governing daily, momentum/at-risk, and
  mark reminders. Livra-initiated notifications are capped at 2/day with at-risk priority: on an at-risk
  day the routine daily reminder is suppressed (`lib/notificationSystem.ts`), so the at-risk nudge stands
  alone; mark reminders are exempt from the cap but obey the master. Spec:
  `docs/superpowers/specs/2026-06-20-momentum-at-risk-toggle-design.md`; plan:
  `docs/superpowers/plans/2026-06-20-notifications-master-switch.md`.

*Deferred Minors from the engine review: ✅ `cushionFraction` `breakGap<=atRiskGap` guard test +
✅ `momentumDays` future-startDate clamp (both done in 1.1 Task 9). Remaining: JSDoc on a few
exports, plus the 1.1-review minors (per-goal try/catch in `evaluateActiveGoalsMomentum`,
`assertDevToolsAccess` on `seedBrokenMomentum`, `handleBrokenStreak` rename, `anyStreakAtRisk`
JSDoc, orphaned toggle styles) — fold into 1.2/1.3 when those files are touched.*

---

## Phase 2 — Remaining PRODUCT.md stress points (big-first)

- [x] **2.1 — Stats surface re-expose** (`PRODUCT.md:436`). There was no hidden `stats` tab to
  unhide (`(tabs)/stats.tsx` was deleted in `2f53510`); the real gap was that the only in-app
  entry to the free `app/goal/history.tsx` was gated behind `completedCount > 0`, hiding it from
  new users. DONE (`feat/stats-reexpose`): extracted always-visible `components/goals/HistoryRow.tsx`,
  wired into `app/(tabs)/goals.tsx` (replacing the gated COMPLETED block). History stays free and
  empty-safe. Spec: `docs/superpowers/specs/2026-06-20-stats-reexpose-design.md`;
  plan: `docs/superpowers/plans/2026-06-20-stats-reexpose.md`.
- [x] **2.2 — Share card free/paid split** (`PRODUCT.md:424`). `canUseShareCard` currently gates
  the whole card behind Pro; PRODUCT promises presets free / custom designs paid.
  DONE (feat/share-card-split): sharing free, Livra+ customization (themes/accent/toggles) inline in SharePreviewModal, canUseShareCard removed. Plan: docs/superpowers/plans/2026-06-21-share-card-split.md.
- [x] **2.3 — Monetization coherence** (`PRODUCT.md:95`, `:448`). Reconcile "one goal is active"
  with the free tier's 2 goals; make the locked-model table explicit about the daily-habit cap.
  DONE (free-tier coherence): two concurrent active goals, queued status retired, habit cap added to table. Plan: docs/superpowers/plans/2026-06-21-free-tier-coherence.md.
- [ ] **2.4 — Opacity done-state a11y** (`PRODUCT.md:494`). `focus.tsx` + `MarkFrequencyPicker`
  signal done with opacity 0.45 only; reuse the `MarkCard` completion-line pattern (icon/label/strikethrough).
- [x] **2.5 — Retention cliff answer** (`PRODUCT.md:208`). DONE (branch
  `feat/free-tier-coherence`): calm all-complete closure state on the completion screen
  ("You finished everything you set out to do.") + goals-tab empty-state distinguishes
  finished-everything from first-run. No manufactured return hook; dignified off-ramp.
  Plan: `docs/superpowers/plans/2026-06-21-free-tier-coherence.md`.
- [ ] **2.6 — Voice: one canonical definition per screen** (`PRODUCT.md:313`). Centralize the
  Goal/Mark/Momentum/Daily-habit definitions each screen reuses (lands in `lib/copy.ts`).
- [ ] **2.7 — Dash-rule enforcement** (`PRODUCT.md:262`). No em-dash, en-dash, or hyphen-as-dash
  in user-facing copy; add a check.
- [ ] **2.8 — Register boundary** (`PRODUCT.md:36`). Draw the line where *personality* becomes
  *decorating the chrome* so a reviewer can apply it.
- [ ] **2.9 — Competitor / anti-reference naming** (`PRODUCT.md:367`).
- [x] **2.10 — AI generosity** (`PRODUCT.md:398`). DONE (branch `feat/free-tier-coherence`):
  one-time nature disclosed at the point of use before the draft is spent; draft fully
  editable before saving. Preset path remains the primary free-tier route; preset quality
  is a launch dependency. Plan: `docs/superpowers/plans/2026-06-21-free-tier-coherence.md`.

---

## Launch gate

When Phases 1–2 are complete, run the full **Launch Readiness Check** in PRODUCT.md against the
real app. Every guardrail must pass before an App Store build.
