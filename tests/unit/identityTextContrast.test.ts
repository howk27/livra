import { readFileSync } from 'fs';
import { join } from 'path';
import { themedColors } from '../../theme/tokens';

/**
 * QA gate B1/B2 (2026-07-22) — body text on the identity screen must clear
 * WCAG AA 4.5:1.
 *
 * The bug: app/settings/profile.tsx painted its 13px `note` and its 15px
 * `quietLine` in `inkMuted` (2.69:1 on surface, 2.43:1 on linen). One of them
 * was the whole signed-out state; another explained why adding a password is
 * worth doing. `inkMuted` on a light surface is a repeat offender — the same
 * remedy (`inkMid`) is logged in .reports/design-decisions.md on 2026-07-16 —
 * so this guard scans the screen's own stylesheet rather than pinning the two
 * styles that happened to fail this time.
 *
 * Scope note: this covers `color:` inside createStyles (real rendered text).
 * Placeholder tints, which pass through `placeholderTextColor` and are muted
 * app-wide by convention, are out of scope here.
 */

const SCREEN = 'app/settings/profile.tsx';
const src = readFileSync(join(__dirname, '../../', SCREEN), 'utf8');

// --- WCAG 2.1 relative luminance + contrast ratio.
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
export const contrastRatio = (fg: string, bg: string) => {
  const a = relLum(fg);
  const b = relLum(bg);
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
};

const AA_BODY = 4.5;

/** The `createStyles(c)` body — the only place this screen sets text color. */
function styleSheetBody(): string {
  const start = src.indexOf('function createStyles');
  expect(start).toBeGreaterThan(-1);
  return src.slice(start);
}

/** Every semantic token the stylesheet uses as a text color, deduped. */
function textColorTokens(): string[] {
  const found = new Set<string>();
  for (const m of styleSheetBody().matchAll(/\bcolor:\s*c\.([A-Za-z0-9_]+)/g)) {
    found.add(m[1]);
  }
  return [...found];
}

// Text that renders on the forest button fill, not on a page surface — it is
// checked against forest instead, below.
const ON_FOREST = new Set(['inkInverse', 'inkInverseMuted']);

describe('identity screen body text clears WCAG AA (QA B1/B2)', () => {
  const themes = ['light', 'dark'] as const;

  it('uses at least one text color (the scan is not silently empty)', () => {
    expect(textColorTokens().length).toBeGreaterThan(0);
  });

  it.each(themes)('every text color clears 4.5:1 on surface AND linen (%s)', (theme) => {
    const c = themedColors(theme);
    const failures: string[] = [];
    for (const token of textColorTokens()) {
      if (ON_FOREST.has(token)) continue;
      const hex = (c as Record<string, unknown>)[token];
      expect(typeof hex).toBe('string');
      // The two backgrounds any text on this screen can land on: the page
      // (linen) and the cards (surface).
      for (const bg of ['surface', 'linen'] as const) {
        const ratio = contrastRatio(hex as string, c[bg]);
        if (ratio < AA_BODY) {
          failures.push(`${theme}: ${token} on ${bg} = ${ratio.toFixed(2)}:1`);
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it.each(themes)('the ink that sits on the filled inputs clears it there too (%s)', (theme) => {
    // surfaceAlt is the input fill and the pending-email block: only inkDark
    // (typed value) and inkMid (pending copy) ever render on it.
    const c = themedColors(theme);
    for (const token of ['inkDark', 'inkMid'] as const) {
      expect(contrastRatio(c[token], c.surfaceAlt)).toBeGreaterThanOrEqual(AA_BODY);
    }
  });

  it.each(themes)('inkMuted is never a body-text color on this screen (%s)', (theme) => {
    // Pinned separately because it is the token that failed twice: a future
    // edit that reaches for it must fail here even if the palette moves.
    expect(textColorTokens()).not.toContain('inkMuted');
    const c = themedColors(theme);
    // And it is banned for a reason that this asserts is still true.
    if (theme === 'light') {
      expect(contrastRatio(c.inkMuted, c.surface)).toBeLessThan(AA_BODY);
    }
  });

  it('the remedy token is genuinely legible on every surface it lands on', () => {
    for (const theme of themes) {
      const c = themedColors(theme);
      for (const bg of ['surface', 'linen', 'surfaceAlt'] as const) {
        expect(contrastRatio(c.inkMid, c[bg])).toBeGreaterThanOrEqual(AA_BODY);
      }
    }
    // The number QA quoted for the fix, so a palette drift is visible here.
    expect(contrastRatio(themedColors('light').inkMid, themedColors('light').surface)).toBeGreaterThan(8);
  });

  it('the signed-out copy QA charged stays on the legible ink', () => {
    // quietLine was one of the two 2026-07-22 offenders; pin it so a revert is
    // named in the failure. (Its sibling `note` was retired in the 2026-07-23
    // flatten — the scan above still catches any inkMuted text that returns.)
    expect(src).toMatch(/quietLine:\s*\{[^}]*color:\s*c\.inkMid/s);
  });
});

/**
 * Founder 2026-07-23 — Edit Profile is now ONE clean flat workflow: no bordered
 * cards, no "sign-in zone" seam. Name, Email and Password stack as plain fields,
 * with explanatory text kept out of the way. (Supersedes the old QA B3 seam.)
 */
describe('identity screen is one clean flat form (founder 2026-07-23)', () => {
  it('has no bordered-card or zone-seam chrome', () => {
    expect(src).not.toMatch(/\bcard:\s*\{/);
    expect(src).not.toMatch(/zoneSeam:/);
  });

  it('ties Save changes to the field above it', () => {
    expect(src).toMatch(/saveBtn:\s*\{[^}]*marginTop:\s*spacing\.md/s);
  });

  it('email rests as a greyed on-file value that taps to edit', () => {
    expect(src).toMatch(/readonlyField:/);
    expect(src).toMatch(/onPress=\{startEmailEdit\}/);
  });

  it('leaves exactly one filled pill, so the screen has a focal point', () => {
    const pills = src.match(/<PillButton/g) ?? [];
    const ghosts = src.match(/variant="ghost"/g) ?? [];
    expect(pills.length).toBe(3);
    expect(ghosts.length).toBe(2);
  });
});
