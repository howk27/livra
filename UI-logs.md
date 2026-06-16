# Livra — UI/UX Audit Log

> **Purpose:** A screen-by-screen reference of the current UI state before any visual rework.
> Captures hardcoded values, design-system drift, and inconsistencies so we can move toward a
> **unique, cohesive look from first launch to deep screens** while staying loyal to the existing
> "Material Warmth" identity (forest green + warm linen, Cormorant serif + DM Sans).
>
> **Audited:** 2026-06-15 · branch `fix/auth-batch-1`
> **Method:** Read `theme/` (source of truth) + every active screen and core component; grep sweeps
> for hardcoded hex/rgba/fonts and icon libraries. All findings below were verified in code, not assumed.

---

## 0. Design Intent (read this first)

The **current design is decent but too basic.** It's clean and tasteful, but it reads as a quiet
"notes-app" aesthetic: flat cards, thin dividers, small type, almost no motion on the main screen.
For a goal-execution app meant to feel motivating, it underdelivers on personality and reward.

**Goal of the rework:** make Livra more **entertaining and flashy** — more alive, rewarding, and
distinctive — **without going overboard.** Think: richer progress visualizations, satisfying
micro-interactions, celebratory moments, depth (gradients/shadows used intentionally), and a
consistent motion language. We are **not** redesigning the color identity (dark green is
non-negotiable) and **not** turning it into a noisy, gamified mess. Restraint + delight.

The single biggest blocker to a "unique look from beginning to end" is **system drift**: there are
effectively **two design systems, three icon libraries, and two font expectations** living in the
codebase at once. Unifying these is prerequisite work before any "flashy" layer will look intentional.

---

## 1. The Design System Today (theme/)

### `theme/tokens.ts` — the CURRENT / intended system ("Material Warmth", Livra 2.0)
- **Palette** (`colors` + `colorsDark`, resolved via `themedColors(theme)`):
  linen `#F0EDE8`, surface `#FAF9F7`, forest `#1C3830`, mint `#8DB5A8`, warm inks. Dark variant included.
- **Spacing:** `xs 4 / sm 8 / md 16 / lg 24 / xl 32 / xxl 48` (+ backward-compat aliases `xxs, 3xl, 4xl, 5xl`).
- **Radius:** `sm 6 / md 12 / lg 20 / xl 28 / full 999` (+ alias `borderRadius.card = 16`).
- **Shadow:** `card` (brown `#8B7355` shadow), `fab` (forest shadow) + legacy `sm/md/lg` (black).
- **Fonts:** serif = Cormorant Garamond, sans = DM Sans. **These are the only fonts actually loaded.**

### `theme/colors.ts` — the LEGACY system (amber era, pre-rebrand)
- Accent **`#FEB729` (amber/yellow)**, gray backgrounds (`#E8E8E8`/`#111111`), a 10-color
  `COUNTER_COLORS` palette. This is the **old** look and conflicts with Material Warmth entirely.
- **Still imported by user-facing screens** (see §3). Anywhere this renders, the app looks like a
  different, older app.

### `theme/typography.ts` — a proper type scale that's barely used
- Defines `display / headline / title / subtitle / body / caption / label / button` using tokens.
- **Almost no screen imports it.** Screens hardcode `fontSize`/`fontFamily` inline instead, so the
  type scale is not actually enforced anywhere.

> **Key takeaway:** We have a good token system AND a good type scale — but adoption is partial and
> a whole legacy palette is still live. The work is consolidation, not invention.

---

## 2. Cross-Cutting Findings (affect the whole app)

| # | Finding | Impact | Where |
|---|---------|--------|-------|
| C1 | **Two color systems coexist** (`tokens.ts` forest/linen vs `colors.ts` amber/gray) | Screens on the legacy system look like a different app | §3 list |
| C2 | **Three icon libraries**: Ionicons (17 files), Feather (12), Phosphor (13) | Three different icon design languages mixed across screens | app-wide |
| C3 | **Unloaded fonts in auth**: `signin.tsx` uses `'Satoshi'` & `'Inter'` — neither is loaded (only Cormorant + DM Sans are) → silently falls back to **system font** | The **first screen users see** is typographically off-brand | `app/auth/signin.tsx` |
| C4 | **Hardcoded font sizes everywhere** instead of `fontSize`/`typography` tokens | No enforced typographic rhythm; sizes drift (18/22/26/28/32…) | nearly every screen |
| C5 | **Type scale (`typography.ts`) is unused** | Good system sitting idle | app-wide |
| C6 | **Hardcoded hex (123 occurrences) + rgba (41 occurrences)** outside tokens | Maintenance + theming/dark-mode risk | see §4 |
| C7 | **Uneven animation language** — some screens richly animated (Reanimated), the **main Focus tab is fully static** | App feels inconsistent: alive in places, flat in the place users see most | §3 |
| C8 | **Shadow color drift** — token card shadow is brown `#8B7355`, but `goals.tsx` hardcodes forest `#1C3830` shadows | Subtle inconsistency in depth/elevation feel | `goals.tsx`, `tokens.ts` |
| C9 | **Stub buttons shipped** — Settings "Export Goals", "Import Data", "Reset All Data" only `console.log`; "Export Marks" says "sharing coming soon" | Dead-end taps; feels unfinished | `app/(tabs)/settings.tsx:532,537,554` |

---

## 3. Screen-by-Screen

### Navigation
Active tabs (`app/(tabs)/_layout.tsx`): **Focus · Goals · Settings** (Feather icons: sun/list/settings).
Hidden (`href:null`): `stats`, `tracking`, `profile` — legacy screens still in the tree.

---

### 🟢 Focus tab — `app/(tabs)/focus.tsx`  *(primary screen)*
**System:** ✅ tokens (forest/linen) · **Icons:** Phosphor (via MarkRow) + Feather (FAB) · **Animation:** ❌ none on content.

- Clean structure: italic serif greeting, compact progress banner, goal cards w/ marks, collapsible
  "Daily Habits", swipe-to-delete, rest/bonus lines. Good information design.
- **Hardcoded font sizes**: greeting `22`, banner fraction `26`, goal title `18`, etc. (not tokens).
- **Hardcoded rgba** for the progress banner glow: `rgba(28,60,52,…)` / `rgba(141,181,168,…)` inline
  for both themes (focus.tsx:334–346) instead of token-derived overlays.
- **No entrance/stagger animation** — cards and lists just pop in. This is the screen users see most
  and it's the flattest. **Prime candidate for tasteful motion + a richer progress hero.**
- The progress banner is functional but visually plain (a fraction in a tinted box) — opportunity for
  a more rewarding "today" visualization (ring/arc/animated fill).

### 🟢 Goals tab — `app/(tabs)/goals.tsx`
**System:** ✅ tokens · **Icons:** Phosphor · **Animation:** ✅ strong (drag-to-reorder, springs).

- Best-looking screen. Forest "active goal" hero card, progress bar, ACTIVE badge, draggable
  "Up Next" queue with haptics + scale/shadow on lift. This is the **quality bar** for the rest.
- **Hardcoded values**: active title `28`, shadow color `'#1C3830'` hardcoded in the drag style
  (goals.tsx:222), progress alpha via string concat (`c.mint + '33'`, `c.inkInverse + '22'`).
- Empty state is minimal (faint logo + text + button) — could be more inviting.

### 🟢 Settings tab — `app/(tabs)/settings.tsx`
**System:** ✅ tokens · **Icons:** Feather only · **Animation:** sync-icon spin only.

- Solid: profile mini-card w/ avatar + `LevelProgressBar`, grouped cards, verify-email nudge, PRO badge.
- **Stub buttons** (C9): Export Goals / Import Data / Reset All Data are `console.log` only.
- Hardcoded sizes (`15/17/13/11`) and avatar dims; otherwise tokenized.

### 🔴 Paywall — `app/paywall.tsx`  *(key conversion screen — worst offender)*
**System:** ❌ **LEGACY `colors.ts` (amber `#FEB729` + gray bg)** · **Icons:** ❌ Ionicons · **Animation:** none.

- **Renders in the old amber/gray look with Ionicons** — a jarring break from the forest/linen
  Phosphor/Feather app. A user going Settings → Subscription crosses into what looks like a different app.
- 2,000+ line monolith (mostly IAP logic) — UI is hard to find/maintain.
- **Highest-priority visual fix:** rebrand to Material Warmth, swap icons, add restrained polish.
  This is where money happens; it should feel premium and on-brand.

### 🔴 Sign In — `app/auth/signin.tsx`  *(first impression)*
**System:** ✅ tokens (colors) · **Icons:** none · **Animation:** ✅ FadeIn/FadeOut, spring slide.

- Good layout and motion, BUT **fonts `'Satoshi'` / `'Inter'` are not loaded** (C3) → the headline,
  wordmark, labels, and buttons fall back to the **system font**. The first screen users meet does
  **not** match the app's Cormorant + DM Sans identity.
- Hardcoded `fontSize` (32/22/15/13/16/14/12) + raw `fontWeight` throughout.
- **Fix is quick and high-impact:** switch to `fonts.serif`/`fonts.sans` + size tokens.

### 🟡 Onboarding — `app/onboarding.tsx`
**System:** ✅ tokens (themed `createStyles`) · **Icons:** Phosphor (Check) · **Animation:** ❌ none between steps.

- Strong copy + clean 4-step flow (welcome → goal → pace → marks) with AI review path, animated step dots.
- **One hardcoded hex**: `aiError` color `'#C0392B'` (onboarding.tsx:850) instead of `c.danger`.
- Hardcoded sizes (tagline `26`, stepTitle `28`, wordmark `42`).
- **No step transitions** — steps swap instantly. A flagship onboarding should feel guided/animated;
  this is a flashy-but-tasteful opportunity (slide/fade between steps, mark check celebrations).

### 🟡 Mark: New — `app/mark/new.tsx`
**System:** ❌ **LEGACY `colors.ts`** + tokens mixed · **Icons:** ❌ Ionicons · 10 hardcoded hex.
- On the old palette → off-brand creation flow.

### 🟡 Mark: Detail / Edit — `app/mark/[id]/index.tsx`, `app/mark/[id]/edit.tsx`
- `index.tsx`: ✅ tokens + themedColors + Reanimated (good).
- `edit.tsx`: ❌ **legacy `colors.ts`** + tokens mixed, 6 hardcoded hex → inconsistent with detail view.

### 🟡 Goal: Detail / New / Complete / Milestone / History / Queue — `app/goal/*`
- All ✅ on tokens + themedColors. `complete.tsx` & `milestone.tsx` use Reanimated (celebration moments).
- `goal/[id].tsx` has **12 hardcoded hex** (highest in the goal flow) and `queue.tsx` has 8 — worth tokenizing.

### ⚪ Hidden / legacy screens — `app/(tabs)/{stats,tracking,profile}.tsx`, `app/diagnostics.tsx`, `app/auth/signing-out.tsx`
- All ❌ on **legacy `colors.ts`** (+ Ionicons in tracking, GradientBackground in stats/profile).
- Not in active nav, but `tracking`/`stats`/`profile` are full screens carrying the old look. Decide:
  **delete, or rebrand** if they'll be re-exposed. They currently anchor the legacy system in place.

### Other flows (brief)
- **Auth reset-password / reset-password-complete:** ✅ tokens + Reanimated. 2 hardcoded hex each.
- **Legal (privacy/terms):** ✅ tokens but ❌ Ionicons + GradientBackground (legacy bg).
- **iap-dashboard:** ✅ tokens but ❌ Ionicons, 4 hardcoded hex (internal/dev screen).

---

## 4. Hardcoded-Value Inventory (top offenders)

Hex counts from grep (`#RRGGBB`/`#RGB`), components + app: **123 total hex, 41 rgba.**

| File | Hex | Notes |
|------|-----|-------|
| `components/ui/MarkRow.tsx` | **17** | `CATEGORY_MAP` = a whole secondary accent palette (`#6B8FA6`, `#A0614A`, `#4A8C7A`, …) outside tokens. Defines how every mark row looks. **Promote to tokens.** |
| `app/goal/[id].tsx` | 12 | tokenize |
| `components/DailyProgressCard.tsx` | 11 | legacy-leaning |
| `app/mark/new.tsx` | 10 | on legacy palette |
| `app/goal/queue.tsx` | 8 | |
| `components/sheets/AddMarkSheet.tsx` | 7 | |
| `app/settings/integrations.tsx`, `app/mark/[id]/edit.tsx` | 6 | |
| `components/ui/LivraHeader.tsx` | 1 | **`#C47E8A`** hardcoded XP-ring stroke (pinkish, off the forest/mint brand). Same ring concept in settings avatar. |
| `app/onboarding.tsx` | 1 | `#C0392B` should be `c.danger` |
| `app/(tabs)/focus.tsx` | 1 + rgba | banner glow uses literal `rgba(28,60,52/141,181,168)` |

**Other non-token literals:** `MarkRow` swipe text `#FFFFFF`; multiple `'#1C3830'`/`'#000'` shadow colors;
alpha via string concat (`color + '33'`, `+ '22'`, `+ 'E6'`) instead of a token opacity helper.

---

## 5. Animation Coverage

**Has Reanimated / motion (good):** goals (drag), signin (fade/slide), CheckinButton (spin+spring+haptic),
SpeedDialFAB (spring dial + peek hint), goal complete & milestone, mark detail, LevelUpModal,
GoalCompletionOverlay, StreakTimeline, CalendarHeatmap, MomentumCounter, sheets, LoadingScreen.

**No motion (flat):** **Focus tab content** (the most-used screen), Settings body, Onboarding step
transitions, Paywall.

**Implication:** The motion language is uneven. The reward/celebration pieces exist
(LevelUp, GoalCompletion, milestone) — but the daily-driver screen (Focus) doesn't reward the core
action visually beyond the small check animation. Best lever for "more entertaining without overboard":
bring the Focus screen up to the goals/celebration bar.

---

## 6. Recommended Direction (no code yet — for planning)

**Phase A — Unify (prerequisite, mostly invisible but essential):**
1. Migrate all user-facing legacy screens off `theme/colors.ts` → tokens (`paywall`, `mark/new`,
   `mark/[id]/edit`, legal, plus decide on tracking/stats/profile).
2. Fix `signin.tsx` fonts (Satoshi/Inter → `fonts.serif`/`fonts.sans`). **Quick win, first impression.**
3. Pick ONE icon library (recommend **Phosphor** — already the most "designed" set in use) and migrate.
4. Promote `MarkRow.CATEGORY_MAP` accents + the `#C47E8A` ring color into `theme/tokens.ts`.
5. Adopt `typography.ts` scale; replace inline `fontSize`/`fontFamily` with tokens. Add an opacity helper
   to kill `color + '33'` string concat.

**Phase B — Elevate (the "flashy, not overboard" layer):**
1. **Focus screen hero:** turn the flat fraction banner into a rewarding daily-progress visualization
   (animated ring/arc), add gentle staggered entrance for cards/rows.
2. **Onboarding transitions:** animate between steps + small celebration on mark selection.
3. **Paywall:** premium, on-brand redesign (it currently looks the most dated).
4. Consistent depth: standardize one shadow color/elevation story; use gradients deliberately
   (the forest active-goal card is a good anchor) rather than the legacy `GradientBackground`.
5. Lean into the reward moments that already exist (level-up, completion) and make them feel signature.

**Guardrails (loyalty to design):** dark green stays primary; warm linen background; Cormorant + DM Sans;
restraint over noise. Every new flourish should reinforce "build with intention," not distract from it.

---

## 6b. Micro-Animation / "Delight" Ideas (the small flashy touches)

These are **small, distinct, moment-specific animations** — the kind that make the app feel alive and
crafted without being noisy. Each is tied to a specific interaction so it reads as intentional, not decorative.

- **"Let Livra suggest a plan" (AI hatch, `onboarding.tsx`):** while generating, play a playful
  **bubbles / sparkle pop** animation rising from the button (small mint/forest bubbles floating up,
  fading) instead of the plain `ActivityIndicator`. Reinforces "magic happening." On result, the AI
  review card should **spring/scale in**, and each suggested mark should **stagger-reveal** one by one.
- **Mark check-in (`CheckinButton`):** already spins — add a tiny **burst/confetti pop** or ripple on
  completion for extra reward (keep it <300ms, subtle).
- **Goal completion / "Ready to complete":** when a goal hits its threshold, pulse the active card's
  progress bar and let the "Ready to complete" CTA **shimmer** once to draw the eye.
- **Daily progress hero (Focus):** animate the fraction/ring **counting up** on screen focus rather
  than rendering the final number instantly.
- **FAB speed-dial:** already springs — consider a soft **glow/pulse** on the first-launch peek hint.
- **Onboarding step transitions:** slide/fade between steps; animate the step-dots filling.
- **Mark selection (onboarding/AI review):** the checkbox should **pop** (scale overshoot) on select,
  and the row gently lift.
- **Level-up / streak milestones:** these celebration moments exist — make them *signature* (the one
  place we go a little bigger: bursts, particles, a satisfying sound/haptic combo).

**Guardrail:** one motion vocabulary (spring timing + easing from a shared `motion` token set),
durations mostly 120–300ms, celebrations reserved for genuine achievements. Bubbles/particles only on
"creation" and "achievement" moments — never on routine navigation. Respect reduced-motion settings.

---

## 7. Code Issues Found During Audit (fix BEFORE adding more)

> Surfaced while reading the files above. These are correctness / hygiene / maintainability issues,
> independent of visuals. **Cleaning these first keeps the animation/redesign work from piling onto a
> shaky base.** Type-check currently **passes (0 TS errors)** — these are quality issues, not compile breaks.
> Counts (app + components): **62 `as any` casts · 20 `eslint-disable` · 10 TODO/FIXME/"coming soon".**

### High priority
1. **`signin.tsx` references unloaded fonts** (`'Satoshi'`, `'Inter'`). Verified: only Cormorant +
   DM Sans are in `useFonts` (`_layout.tsx`), and no Satoshi/Inter font files exist → silent
   system-font fallback on the first screen. *(Also listed as C3 — it's both a UX and a code bug.)*
2. **Paywall is a 2,002-line monolith** (`app/paywall.tsx`) with a fragile, multi-`useEffect`
   operation state machine (≈8 effects all driving `operationState`/`operationMessage`). Hard to
   reason about and easy to regress. Should be decomposed (hook for IAP/verify logic + presentational UI).
3. **Paywall price parsing is locale-fragile:** `parseFloat(price.replace(/[^0-9.]/g, ''))`
   (paywall.tsx ~334–352) breaks for currencies that use comma decimals or group separators
   (e.g. `1.234,56 €`) → wrong "save %" / per-month math.
4. **Stub buttons shipped to users** (`settings.tsx`): Export Goals (`console.log` :532), Import Data
   (`console.log` :537), Reset All Data (confirm → `console.log` :554, deletes nothing). "Export Marks"
   builds a CSV then only logs its length and shows "sharing coming soon" — no actual export/share.

### Medium priority
5. **Dead code in paywall:** `const diag = getIapService().getDiagnostics();` (:197) is assigned and
   never used; the surrounding `useEffect` is effectively a no-op (comment admits "tracked but not used").
6. **Dead/nonsensical guard:** `!isNaN(12)` (paywall.tsx :342) is always `true` — leftover logic.
7. **Unused imports in `focus.tsx`:** `Haptics` and `Platform` are imported but never used in the body
   (verified). The primary screen also fires no haptics on check-in (inconsistent with the rest of the app,
   where logging a mark elsewhere does).
8. **`goals.tsx` `activeId` shared value is write-only:** set on drag start/end (:167/:196/:205) but
   **never read** — it drives no visual (e.g. no dimming of non-dragged rows). Either wire it up or remove it.
9. **Two `colors` exports with the same name** (`theme/tokens.ts` *and* `theme/colors.ts`) — easy to
   import the wrong one; a real source of the dual-palette drift. Rename/retire the legacy export.
10. **`theme/tokens.ts` carries two design eras** as "backward-compat aliases" (`borderRadius.card=16`,
    `fontSize`/`fontWeight`/`lineHeight` blocks duplicating `typography.ts`, `shadow.sm/md/lg` in black
    vs `shadow.card` in brown). This redundancy is *why* sizes/shadows drift. Consolidate to one set.

### Low priority / hygiene
11. **62 `as any` casts** — concentrated in router pushes (`router.push(... as any)`) and IAP/product
    handling. Router casts can be fixed with typed routes; the rest erode type safety silently.
12. **Duplicated color math:** `hexToRgba` is re-implemented in `MarkRow.tsx`; alpha is elsewhere done by
    string concat (`color + '33'`). Centralize as a token/util (`applyOpacity` already exists in
    `src/components/icons/color` and is used by paywall — standardize on it).
13. **`MarkRow.CATEGORY_MAP`** hardcodes ~15 accent hexes and a `custom` fallback — this is data, not
    style, but it's the largest single source of non-token color (17 hex). Promote to `theme/tokens`.
14. **`ensureProfile` typed as `any`** (`signin.tsx`) — untyped Supabase client/user params.
15. **20 `eslint-disable` directives** (mostly `react-hooks/exhaustive-deps` around zustand selectors and
    worklet deps). Mostly legitimate, but worth a pass to confirm none hide real stale-closure bugs.

> **Recommended order:** §7 items 1–4 (user-visible/correctness) → Phase A unify (§6) → §7 items 5–10
> (decompose/consolidate) → Phase B elevate + §6b micro-animations on the now-clean base.

---

## 8. Open Questions (RESOLVED 2026-06-16)
- **Legacy tabs** (`tracking`, `stats`, `profile`): **DELETE** ✅ (done, Wave 1).
- **Icon library**: **Phosphor** is the single standard. No extra icon sets; remove dead icon-set refs in Settings.
- **Settings stubs**: **Hide** Export Goals + Import Data; **build** Reset All Data + Export Marks.
- **Dark mode**: **Dark + light both ship v1.** No extra themes. Every token change verified through `themedColors`.

---

## 9. Fix Log — Implementation (2026-06-16, branch `fix/auth-batch-1`)

> Executed in dependency-ordered waves; legacy refs were **replaced** with new tokens by name
> (never aliased to preserve old values), per directive. Verification after each wave.

### ✅ Wave 1 — Deletions + isolated quick wins
- **Deleted legacy screens**: `app/(tabs)/{stats,tracking,profile}.tsx` + their hidden `Tabs.Screen`
  entries in `_layout.tsx`; removed `app/diagnostics.tsx` navigations to the deleted `/(tabs)/tracking`.
  Deleted `app/(tabs)/marks.tsx.archived` + `components/CheckinButton.tsx.archived`.
- **signin.tsx (C3/§7.1)**: replaced unloaded `'Satoshi'`/`'Inter'` → `fonts.serif`/`fonts.sans`(+weighted);
  hardcoded `fontSize` → `fontSize` tokens; raw `fontWeight` dropped where weighted family covers it;
  `ensureProfile` params typed via `SupabaseClient`/`AuthUser` (§7.14).
- **focus.tsx (§7.7, C6)**: wired a light haptic on mark check-in (`handleQuickIncrement`) so the imported
  `expo-haptics` is used + matches app behavior; banner-glow `rgba(...)` literals → `applyOpacity(c.forest/c.mint, …)`;
  hardcoded font sizes → `fontSize` tokens.
- Verify: type-check ✓, 553 tests ✓.

### ✅ Wave 2 — Killed the legacy palette (C1, §7.9)
- **Migrated all 37 importers** of `theme/colors.ts` (30 components + 5 screens + 2 `src/components/icons`)
  onto `themedColors(theme)` from `theme/tokens.ts`, then **deleted `theme/colors.ts`** (dual `colors`
  export drift gone). Canonical field map applied (amber `primary`→`forest`, `text`→`inkDark`,
  `textSecondary`→`inkMid`, `border`→`borderMid`, translucent amber→`applyOpacity(c.forest/mint, …)`, etc.).
  The dead amber `COUNTER_COLORS` picker palette died with the file (only dead `CounterTile` used it).
- **paywall.tsx**: full colors migration (now forest/linen, amber gone); CTA buttons = `c.forest` + `c.inkInverse`.
  Removed dead `const diag = getIapService().getDiagnostics()` (§7.5) and the always-true `!isNaN(12)` guard (§7.6).
  **Price parsing (§7.3)**: added module-scope `priceToNumber()` (prefers expo-iap numeric `price`) +
  `parseLocalizedPrice()` (locale-aware, handles `1,234.56` and `1.234,56`); replaced the locale-fragile
  `parseFloat(localizedPrice.replace(/[^0-9.]/g,''))` math.
- Note: paywall/mark-new were left half-migrated when subagents hit a session limit; finished manually
  (scope-corrected `c`/`themeColors` mismatches across `ErrorDetails`, `PaywallErrorFallback`, and `mark/new`).
- Verify: type-check ✓ (0 errors), 553 tests ✓.

### ✅ Wave 3 — Icons → Phosphor (DONE)
Migrated every live Ionicons/Feather importer onto **Phosphor** (`phosphor-react-native`, PascalCase named
imports, `size`/`color`/`weight`): tab bar `Sun`/`List`/`Gear`, settings rows + profile-card icons,
paywall (`PRO_FEATURES` now carry `icon: Icon` components; close = `X`), NotificationToast (per-type icons),
sheets (AddMark category icons as components, AddGoal steppers), QueueCard, SpeedDialFAB, GoalCompletionOverlay,
DailyTargetStepper, DuplicateCounterModal, ProfileEditSheet, settings/profile. **No `@expo/vector-icons`
references remain.** Note: phosphor v3 canonical exports are `XxxIcon`-suffixed; `Circle`/`Infinity` lack the
deprecated alias so they import as `CircleIcon`/`InfinityIcon`. Dead icon-using components were **deleted**
rather than migrated (CounterTile/InfoModal/WeeklySummaryStrip/NotificationToast was *restored* — it is live
via `contexts/NotificationContext` — SortableMarkList/Row). Duplicate `app/signin.tsx` deleted.

### ✅ Wave 4 — Tokenize hex + promote CATEGORY_MAP (DONE, scoped)
Added shared `categoryAccents` to `theme/tokens.ts`; MarkRow + AddMarkSheet now reference it (killed ~24 hex
+ the duplicated `hexToRgba`/local `applyOpacity`, standardized on shared `applyOpacity`). Fixed off-brand
XP-ring `#C47E8A`→`colors.mint`, onboarding `#C0392B`→`c.danger`, and **dark-mode drift** where light-forest
`#1C3830` was hardcoded in `goal/[id]` + `goal/queue` (now `c.forest`/`c.inkInverse`). **Deliberately left:**
`DailyProgressCard` `MOMENTUM_ANCHORS_LIGHT/DARK` (intentional, already theme-aware progress gradient) and
`mark/new` color-picker palette (user color data). **Did NOT** strip `tokens.ts` backward-compat aliases
(§7.10): `fontSize`/`fontWeight`/`shadow.sm-lg`/`spacing` aliases are load-bearing (3–14 refs each) and removal
conflicts with Wave 5 — deferred to a combined typography pass.

### ✅ Wave 6 — Settings data actions (DONE)
Shipped real **Export Marks** (CSV → `expo-file-system/legacy` + `expo-sharing.shareAsync`) and **Reset All
Data** (`resetDatabaseState()` clears local marks/goals/events/streaks/badges/xp + reloads the Zustand stores;
account/session untouched). Hid the unimplemented Export Goals + Import Data stub rows.

### ⏳ Wave 5 — Typography adoption (NOT STARTED — deferred)
Scope is large/cosmetic: **172 raw `fontSize: NN` sites across 37 files**; `typography.ts` presets are only
consumed by `components/Typography.tsx`. High visual-regression risk, untestable, low ROI pre-release — flagged
for an explicit go-ahead + scope decision rather than a blind blanket pass.

### ⏳ Wave 7 — Paywall hook extraction (NOT STARTED — deferred, RISK)
`app/paywall.tsx` is **2051 lines** with a fragile ~8-`useEffect` IAP operation state machine and **thin test
coverage** (only `iapReVerify.test.ts` touches IAP). Decomposing the money path autonomously, with no test net,
right before a store release is high-risk — flagged for an explicit decision.

> **STATE (2026-06-16): Waves 1–4 + 6 complete, verified (type-check 0 errors · eslint clean · 553/553 tests),
> and COMMITTED on `fix/auth-batch-1` (deletions → UI-unification → docs → build). Waves 5 & 7 deferred pending
> a user decision (cosmetic-churn scope / revenue-path risk). Not pushed.**
