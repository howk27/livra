// The FU-5 hollow goal-card treatment, resolved once per theme.
//
// WHY THIS IS A MODULE AND NOT TWO INLINE EXPRESSIONS: the Goals list
// (`app/(tabs)/goals.tsx`) and the creation preview
// (`components/creation/GoalCardPreview.tsx`) each carried the identical pair of
// expressions, the second one commented "verbatim from the Goals screen". Two
// copies of a visual contract drift the moment one is touched, and the preview
// exists precisely so the user sees the card they are about to get.
//
// THE LIGHT AND DARK CARDS ARE NOT THE SAME MOVE, and writing them as one
// expression is what made the light card read greyed-out (founder, build 63):
//
//   const cardWash = applyOpacity(c.forest, theme === 'dark' ? 0.1 : 0.07);
//
// `c.forest` is not one colour. Dark resolves it to the LIGHTER `#2D5446`, so
// the wash over the near-black `linen` LIFTS the card off the page. Light
// resolves it to `#1C3830` — near-black green — so the same wash DARKENS the
// warm linen page. Measured: the light card rendered `#E1E0DB`, relative
// luminance 0.744, against a page at 0.849. A surface sitting ~12% darker than
// its own ground is the universal signal for "disabled", which is exactly what
// the founder saw. The old comment claimed "the same expressions resolve to a
// contrast-safe accent in both modes" — true of the BORDER, which is a contrast
// question, and false of the WASH, which is an elevation question.
//
// So light now raises onto `cardRaised` (lighter than the page) and earns its
// edge from the accent hairline plus the warm card shadow, the way an elevated
// surface does on a light ground. Dark keeps the value it already rendered.
//
// The invariant both themes now share — a goal card is LIGHTER than the page it
// sits on — is pinned by `tests/unit/goalCardSurface.test.ts`.

import type { ViewStyle } from 'react-native';
import { themedColors, shadow } from './tokens';
import { applyOpacity } from '../src/components/icons/color';

/**
 * Background, border and elevation for a hollow goal card.
 *
 * Spread onto the card's style AFTER the static StyleSheet entry (which owns
 * radius, border WIDTH and padding) and before any per-instance override.
 */
export function goalCardSurface(theme: 'light' | 'dark'): ViewStyle {
  const c = themedColors(theme);

  const base: ViewStyle = {
    backgroundColor: c.cardRaised,
    borderColor: applyOpacity(c.accent, 0.55),
  };

  // Shadow on light only. On the dark ground a warm low-opacity shadow is
  // invisible at best, and `elevation` on Android would paint a grey scrim that
  // fights the wash — the dark card's lift comes from the wash itself.
  return theme === 'light' ? { ...base, ...shadow.card } : base;
}
