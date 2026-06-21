# Share Card Free / Paid Split — Design

**Phase:** 2.2 (ROADMAP.md)
**Closes:** `PRODUCT.md:424`, `:428` (failing stress point: `canUseShareCard` gates the whole card behind Livra+)
**Date:** 2026-06-21
**Status:** design approved, ready for plan

---

## 1. Problem

PRODUCT.md promises a split: **preset share-card designs are free** (finishing a goal is a
moment any user should be able to share), and **Livra+ adds custom designs** (themes, layout,
accent). The monetization table already reads `Share card | ✅ Preset designs | ✅ Custom designs`.

The code contradicts this:

- `lib/gating.ts:59` defines `canUseShareCard(isPro)` — but it is **dead code**, imported nowhere.
- The real gate is **hardcoded inline** in `app/goal/complete.tsx:114-120`: `handleSharePress`
  calls `checkProStatus()` and bounces free users to `/paywall`. Sharing is fully paywalled.
- There is exactly **one** card design (`components/GoalCompletionShareCard.tsx`, fixed colors).
  Neither "presets" nor "custom designs" exist yet.
- `app/paywall.tsx:55,65` lists "Share Cards" as a flat paid feature.

So this phase is a real design task, not a one-line un-gate: sharing must become free, and a
genuine paid customization tier must exist so the Livra+ line isn't hollow.

## 2. The split

| | Free | Livra+ |
| --- | --- | --- |
| Share the card | ✅ always | ✅ |
| Save to Photos | ✅ always | ✅ |
| Design | 1 fixed preset (current **Forest** card, all elements shown) | Theme picker, accent color, element toggles |

The **share action itself becomes free**. The inline `checkProStatus()` bounce in
`complete.tsx` is removed. Only *customization* is gated, via a new
`canCustomizeShareCard(isPro)`.

## 3. What "custom" contains (Livra+, YAGNI-bounded)

- **4 themes** — fixed palettes (the card looks identical regardless of the user's app theme,
  preserving the existing "shareable image artifact" principle):
  - **Forest** — default and the free preset. Current palette: bg `#1C2826`, text `#F0E6D0`,
    muted `rgba(240,230,208,0.55)`.
  - **Linen** — light: warm cream bg, dark ink text.
  - **Night** — deep near-black bg, warm light text.
  - **Sage** — muted green bg, light text.
  - (Exact non-Forest hex values are a design detail finalized during implementation; they are
    fixed per-theme constants, **not** `theme/tokens` values, because the card must render the
    same on any device theme.)
- **Accent color** — ~4 curated brand swatches (**Rose** `#C47E8A` default, **Forest green**,
  **Gold**, **Slate**). Recolors the wordmark, the level-badge border/text, and the divider.
  Curated swatches only, **not** a free-form color wheel — stays calm and brand-safe.
- **3 element toggles** — show/hide **momentum line** (banked-momentum meta), **level badge**,
  **date/days meta**. The goal title and the line "Done. That one's yours forever." are
  **always present** (they are the point of the card).

Free users are pinned to `DEFAULT_SHARE_CARD_STYLE` = Forest theme, Rose accent, all elements on
— i.e. today's card, pixel-for-pixel.

## 4. Surface & free-user upsell

All customization lives **inline in the existing `SharePreviewModal`** as one "Customize"
section under the live preview. There is **no new screen / route** (a dedicated editor was
considered and rejected as too dashboard-like for the product register).

```
┌─ Share sheet ──────────┐
│   [ live card preview ] │
│                         │
│  Customize  · Livra+    │  ← section header
│  Theme   ● ○ ○ ○        │  ← 4 theme swatches
│  Accent  ■ ■ ■ ■        │  ← 4 accent swatches
│  Momentum line   [on]   │  ← 3 toggles
│  Level badge     [on]   │
│  Date            [on]   │
│  [    Share    ]        │
│  [ Save to Photos ]     │
└─────────────────────────┘
```

- **Livra+**: full controls; the preview re-renders live on every tap.
- **Free**: the whole section collapses to a single `🔒 Customize · Livra+` row. Tapping it
  shows a calm nudge (copy: *"Livra+ lets you restyle this. No rush."*) with a path to
  `/paywall`. Sharing is never walled. This is the soft, contextual upsell PRODUCT's
  monetization stance calls for — at the moment the value is felt, framed as "when you're ready."

## 5. Architecture

- **`lib/sharing/shareCardThemes.ts`** (new, pure) — the single source of truth for card
  styling:
  - `ShareCardTheme` palette type + the 4 theme definitions (keyed by `themeId`).
  - The accent swatch definitions (keyed by `accentId`).
  - `ShareCardStyle` = `{ themeId, accentId, showMomentum, showBadge, showDate }`.
  - `DEFAULT_SHARE_CARD_STYLE` — Forest / Rose / all-on (reproduces today's card).
  - A resolver `resolveCardColors(style)` → `{ bg, text, muted, accent }`.
  - No React, no I/O. Fully unit-testable.
- **`lib/gating.ts`** — remove dead `canUseShareCard`; add
  `canCustomizeShareCard(isPro: boolean): boolean` (returns `isPro`). Sharing/saving are no
  longer gated anywhere.
- **`state/shareCardSlice.ts`** (new, Zustand + AsyncStorage — per project convention, never
  `useState` for persisted data) — persists the user's last-used `ShareCardStyle` so their
  style is remembered across completions. Free users effectively stay at the default (the
  controls that would change it are not shown to them). Key namespaced like existing slices.
- **`components/GoalCompletionShareCard.tsx`** — parameterized by a `style: ShareCardStyle`
  prop instead of module-level hardcoded constants. Colors come from `resolveCardColors`;
  the three optional rows render conditionally on the toggles. The default prop value is
  `DEFAULT_SHARE_CARD_STYLE`, so existing render output is unchanged.
- **`components/SharePreviewModal.tsx`** — two changes:
  1. The preview slot renders the **live `GoalCompletionShareCard` component** (scaled to fit)
     instead of a pre-captured `Image`. Theme/toggle changes preview instantly. Capture to a
     file happens on Share/Save via `generateShareCard(ref)`.
  2. New props: `canCustomize: boolean`, `style: ShareCardStyle`, `onStyleChange`,
     `onRequestUpgrade`. Renders the Customize section (full controls when `canCustomize`,
     the locked nudge row otherwise).
- **`app/goal/complete.tsx`** — remove the `checkProStatus()` bounce in `handleSharePress`
  (sharing is free). Read `canCustomizeShareCard` from Pro status and the persisted style from
  `shareCardSlice`; pass them to the modal. The off-screen full-size card used for capture is
  driven by the same `style`. `onRequestUpgrade` routes to `/paywall`.
- **`app/paywall.tsx`** — reframe the `Share Cards` entry: title **"Custom Share Cards"**,
  description **"Restyle your finish. Themes, accent, and layout."** Keep it in
  `SHIPPED_PREMIUM_FEATURE_TITLES`.

### Live preview note

The card is a fixed 16:9 artifact (`CARD_HEIGHT = width * 9/16`). The modal's current preview
container is 9:16 portrait — a pre-existing mismatch papered over by `resizeMode="cover"`. When
we move to a live component, the preview slot is resized to the card's true 16:9 aspect (scaled
down to fit the sheet width) so the preview matches the captured output exactly.

## 6. Copy (dash-free, on-voice)

- Locked nudge: **"Livra+ lets you restyle this. No rush."**
- Section header: **"Customize"** (with a small `Livra+` tag).
- Toggle labels: **"Momentum line"**, **"Level badge"**, **"Date"**.
- Paywall: **"Custom Share Cards" / "Restyle your finish. Themes, accent, and layout."**

All copy avoids em-dash, en-dash, and hyphen-as-dash (`PRODUCT.md:259` rule).

## 7. Testing (TDD, pure-first)

1. `shareCardThemes` — `DEFAULT_SHARE_CARD_STYLE` matches today's Forest palette; every theme
   and accent id resolves; `resolveCardColors` returns expected colors; no dashes in any
   shipped string.
2. `canCustomizeShareCard` — true iff Pro; `canUseShareCard` no longer exported.
3. `shareCardSlice` — persists and rehydrates a style; defaults to `DEFAULT_SHARE_CARD_STYLE`.
4. `GoalCompletionShareCard` — renders all elements at default; each toggle off removes exactly
   its row; theme/accent change applies resolved colors; goal title + completion line always
   present.
5. `SharePreviewModal` — shows full controls when `canCustomize`, the locked nudge row
   otherwise; tapping the nudge calls `onRequestUpgrade`; Share/Save work in both states;
   style taps call `onStyleChange`.
6. `complete.tsx` — free user reaches the share modal (no paywall bounce) and can Share; the
   modal receives `canCustomize=false` for free, `true` for Pro.

## 8. Out of scope (deliberately cut)

- Free-form color wheel (curated swatches only).
- Layout/positioning controls, fonts, custom backgrounds or images, branding/logo upload.
- A dedicated card-editor screen or route.
- Letting free users preview locked themes (no tease-then-wall pattern).
- Sharing surfaces other than goal completion (this card is completion-only today).

## 9. Definition of Done (from ROADMAP.md)

- [ ] Sharing the card works for free users; only customization is gated.
- [ ] A real Livra+ customization tier exists (themes + accent + toggles), persisted.
- [ ] `canUseShareCard` dead code removed; `canCustomizeShareCard` is the only gate.
- [ ] Paywall reframed to "Custom Share Cards"; no dead-end feature claim.
- [ ] All new behavior covered by tests written first; full suite green; `type-check` + `lint`
      clean on changed files.
- [ ] No dashes in new user-facing copy; no paywalled core loop.
- [ ] `PRODUCT.md:428` stress point updated to RESOLVED; ROADMAP 2.2 checked off.
