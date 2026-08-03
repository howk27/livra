/**
 * A goal card must LIFT off the page it sits on, in BOTH themes.
 *
 * This is the invariant the light card violated. `applyOpacity(c.forest, 0.07)`
 * over `linen` rendered `#E1E0DB` — relative luminance 0.744 against a page at
 * 0.849, i.e. the card sat ~12% DARKER than its own ground, which is how every
 * platform draws a disabled surface. The founder read it as "greyed out" on
 * build 63 and was describing the elevation direction exactly.
 *
 * The test measures LUMINANCE, not hexes, on purpose. A hex assertion would go
 * green on any repaint and tell us nothing; this one fails the moment a card
 * ground drops below its page again, whatever colour gets us there. Both halves
 * were confirmed to fail before this file was kept:
 *   - restoring the old light wash fails "light card lifts off the page"
 *   - swapping the two `cardRaised` values fails both themes
 */

import { colors, themedColors, shadow } from '../../theme/tokens';
import { goalCardSurface } from '../../theme/goalCardSurface';

/** WCAG 2.x relative luminance. */
function luminance(hex: string): number {
  const v = hex.replace('#', '');
  const channel = (i: number) => {
    const srgb = parseInt(v.slice(i, i + 2), 16) / 255;
    return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
}

describe('goal card elevation', () => {
  it.each(['light', 'dark'] as const)('%s card lifts off the page', (theme) => {
    const c = themedColors(theme);
    expect(luminance(c.cardRaised)).toBeGreaterThan(luminance(c.linen));
  });

  it('the light card lifts by a visible margin, not a rounding error', () => {
    // The dark lift is deliberately a whisper (0.0168 vs 0.0134 — dark grounds
    // swallow contrast and the card is meant to stay calm). The LIGHT lift is
    // the one that was inverted, so it is held to a real gap.
    const c = themedColors('light');
    expect(luminance(c.cardRaised) - luminance(c.linen)).toBeGreaterThan(0.02);
  });

  it('the dark card is unchanged by the light-card fix', () => {
    // #172621 is exactly forest #2D5446 at 10% flattened over linen #15211D,
    // the wash dark already rendered. If someone "tidies" this token, dark
    // silently repaints — pin the value that makes the fix a no-op there.
    expect(colors.cardRaised).not.toBe('#172621');
    expect(themedColors('dark').cardRaised).toBe('#172621');
  });
});

describe('goalCardSurface', () => {
  it('carries the elevation shadow on light only', () => {
    // On the dark ground the warm shadow is invisible and Android `elevation`
    // paints a grey scrim that fights the wash.
    expect(goalCardSurface('light')).toMatchObject(shadow.card);
    expect(goalCardSurface('dark').elevation).toBeUndefined();
    expect(goalCardSurface('dark').shadowOpacity).toBeUndefined();
  });

  it.each(['light', 'dark'] as const)('%s resolves ground and border', (theme) => {
    const surface = goalCardSurface(theme);
    expect(surface.backgroundColor).toBe(themedColors(theme).cardRaised);
    // Border stays an alpha of the theme's foreground accent — forest on light,
    // mint on dark — which is the half of the old expression that was correct.
    expect(surface.borderColor).toMatch(/^rgba\(/);
  });
});
