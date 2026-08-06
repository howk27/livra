// lib/markGlyphs.ts
// THE glyph registry — the one place that says which Phosphor glyph a mark
// wears, in a form BOTH renderers can use.
//
// WHY THIS FILE EXISTS (2026-08-06 icon-parity investigation):
// the app rendered a mark's OWN library glyph (41 distinct) while the widget
// rendered its CATEGORY glyph (13 total), so 40 of 41 library marks showed a
// different face in the widget than in the app, and any two marks sharing a
// category (Water + Calories, both Health) were two icons in-app and one
// identical drop in the widget. The app side reads a React COMPONENT
// (MARK_LIBRARY.icon); the widget is native SwiftUI and can only take a STRING
// asset name. Those are two representations of one fact, and nothing tied them
// together — so they drifted silently and shipped.
//
// This registry is the tie. `MARK_GLYPH_DEFS` names the Phosphor def per library
// id; `tests/unit/markGlyphParity.test.ts` asserts each named def resolves to
// the SAME component the library entry holds (real identity comparison, not a
// string match), so a library icon swap that forgets this table fails the suite
// instead of reaching a device.
//
// The asset key is derived, never hand-written: `widgetAsset('MoonStars')` is
// always `livra_moon_stars`. scripts/generate-widget-icons.js renders from the
// same table, so the PNG set and this file cannot disagree about what exists.

/**
 * MARK_LIBRARY id → Phosphor def name (the file in
 * `phosphor-react-native/src/defs`, i.e. the export minus its `Icon` suffix).
 *
 * Every id in MARK_LIBRARY must appear here — the parity test fails on a
 * missing OR an extra key, so adding a library mark forces the glyph decision
 * rather than letting it default to a category circle.
 */
export const MARK_GLYPH_DEFS: Record<string, string> = {
  // Recovery
  sleep: 'MoonStars',
  stretch: 'PersonSimple',
  // Fitness
  workout: 'Barbell',
  steps: 'Footprints',
  run: 'PersonSimpleRun',
  swim: 'Waves',
  cycling: 'Bicycle',
  // Health
  water: 'Drop',
  nutrition: 'ForkKnife',
  calories: 'Fire',
  'no-alcohol': 'Prohibit',
  'meal-prep': 'BowlFood',
  'no-nicotine': 'Cigarette',
  'no-caffeine': 'Coffee',
  skincare: 'Sparkle',
  // Mindset
  meditation: 'Brain',
  journaling: 'NotePencil',
  gratitude: 'HandHeart',
  breathwork: 'Wind',
  // Deep Work
  focus: 'Target',
  planning: 'CalendarCheck',
  reading: 'BookOpenText',
  practice: 'Metronome',
  study: 'GraduationCap',
  'deep-work': 'Hourglass',
  writing: 'PenNib',
  language: 'GlobeSimple',
  // Finance
  finance: 'Wallet',
  saving: 'PiggyBank',
  'no-spend': 'CurrencyCircleDollar',
  invest: 'TrendUp',
  'side-hustle': 'Briefcase',
  // Discipline
  'cold-shower': 'Shower',
  'no-sugar': 'Cake',
  'screen-time': 'Monitor',
  cooking: 'CookingPot',
  // Relationships
  socialize: 'UsersThree',
  family: 'House',
  networking: 'Handshake',
  volunteer: 'Heart',
  // Creative
  creative: 'PaintBrush',
};

/**
 * CATEGORY_MAP key → Phosphor def name. The fallback face, for a mark with no
 * library entry (hand-built, renamed, or AI-authored beyond the library).
 *
 * These MUST stay in lockstep with CATEGORY_MAP in components/ui/MarkRow.tsx —
 * same guard file asserts it. Three of them (Drop, Heart, Briefcase) are also
 * library glyphs; the asset set dedupes on the def name, so they cost nothing
 * extra.
 */
export const CATEGORY_GLYPH_DEFS: Record<string, string> = {
  Recovery: 'Moon',
  Fitness: 'Pulse',
  Health: 'Drop',
  Mindset: 'Heart',
  'Deep Work': 'Briefcase',
  Creative: 'PencilSimple',
  Discipline: 'Shield',
  Relationships: 'Users',
  Finance: 'CurrencyDollar',
  email: 'EnvelopeSimple',
  // Legacy lowercase keys (mirror MarkRow's legacy rows)
  sleep: 'Moon',
  workout: 'Pulse',
  water: 'Drop',
  planning: 'Calendar',
  reading: 'BookOpen',
  work: 'Briefcase',
  custom: 'Circle',
};

/** The def every unresolvable mark falls back to. */
export const FALLBACK_GLYPH_DEF = 'Circle';

/**
 * Phosphor def name → widget asset key. Derived, so the generator, the TS
 * snapshot writer and the Swift `Image(...)` lookup all spell it identically.
 * `MoonStars` → `livra_moon_stars`.
 */
export function widgetAsset(def: string): string {
  const snake = def
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase();
  return `livra_${snake}`;
}

/** Every def that needs a rendered PNG — library glyphs + category fallbacks. */
export function allGlyphDefs(): string[] {
  return [
    ...new Set([
      ...Object.values(MARK_GLYPH_DEFS),
      ...Object.values(CATEGORY_GLYPH_DEFS),
      FALLBACK_GLYPH_DEF,
    ]),
  ].sort();
}
