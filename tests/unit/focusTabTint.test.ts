import { readFileSync } from 'fs';
import { join } from 'path';
import { themedColors } from '../../theme/tokens';

/**
 * The active tab tint is amber for EVERY tab.
 *
 * Founder call 2026-07-26 (b), superseding the 2026-07-26 (a) decision that
 * scoped amber to Focus alone: "the Focus tab icon goes amber when focused, the
 * other 2 don't change. Make them change to amber if they are focused." One
 * active colour across the bar reads as a selection state; three tabs where only
 * one changes hue reads as a bug, which is exactly how it got reported.
 *
 * The contrast half of this guard is unchanged and still the point: the 10px tab
 * label is TEXT, so the token needs 4.5:1 against the tab bar surface in both
 * themes. Plain `ember` fails that on light (2.63:1), which is why `emberInk`
 * exists — and now that amber is on all three tabs, a "simplify back to ember"
 * cleanup would break three labels instead of one.
 */

const toRgb = (hex: string): [number, number, number] => {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
};
const relLum = (hex: string) => {
  const lin = toRgb(hex).map((v) => {
    const ch = v / 255;
    return ch <= 0.03928 ? ch / 12.92 : Math.pow((ch + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
};
const contrastRatio = (fg: string, bg: string) => {
  const a = relLum(fg);
  const b = relLum(bg);
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
};

const AA_BODY = 4.5;

const src = readFileSync(join(__dirname, '../../', 'app/(tabs)/_layout.tsx'), 'utf8');

describe('active tab tint', () => {
  it('the bar-wide ACTIVE tint is emberInk', () => {
    expect(src).toMatch(/const ACTIVE = tc\.emberInk;/);
    expect(src).toContain('tabBarActiveTintColor: ACTIVE');
  });

  it('no tab re-overrides the active tint, so all three read the same', () => {
    // A per-screen tabBarActiveTintColor is what made Focus the odd one out.
    // Any reappearance means one tab has drifted from the other two again.
    expect(src.match(/tabBarActiveTintColor:/g)).toHaveLength(1);
  });

  it('forest is no longer the active tint', () => {
    expect(src).not.toMatch(/const ACTIVE = tc\.forest;/);
  });

  it.each(['light', 'dark'] as const)(
    'emberInk clears AA body text on the %s tab bar surface',
    (theme) => {
      const c = themedColors(theme);
      // The tab bar is painted with tc.surface in _layout.tsx.
      expect(src).toContain('backgroundColor: tc.surface');
      expect(contrastRatio(c.emberInk, c.surface)).toBeGreaterThanOrEqual(AA_BODY);
    },
  );

  it('plain ember would still fail on light, so it stays barred from the tab', () => {
    const c = themedColors('light');
    expect(contrastRatio(c.ember, c.surface)).toBeLessThan(AA_BODY);
  });
});
