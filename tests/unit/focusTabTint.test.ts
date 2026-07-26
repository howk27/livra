import { readFileSync } from 'fs';
import { join } from 'path';
import { themedColors } from '../../theme/tokens';

/**
 * The Focus tab's active tint is amber — a founder-sanctioned exception
 * (2026-07-26) to "forest/mint = navigation" for that one tab — and it must
 * stay READABLE: the 10px tab label is text, so the token needs 4.5:1 against
 * the tab bar surface in both themes. Plain `ember` fails that on light
 * (2.63:1), which is exactly why `emberInk` exists; this guard measures the
 * token so a "simplify back to ember" cleanup fails here instead of on device.
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

describe('Focus tab active tint', () => {
  it('the focus screen overrides the active tint with emberInk', () => {
    expect(src).toContain('tabBarActiveTintColor: tc.emberInk');
  });

  it('only the focus tab carries the override — goals/settings stay structural', () => {
    expect(src.match(/tabBarActiveTintColor: tc\.emberInk/g)).toHaveLength(1);
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
