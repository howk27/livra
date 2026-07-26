import { readFileSync } from 'fs';
import { join } from 'path';
import { themedColors } from '../../theme/tokens';

/**
 * The Next Move card's microlabel must be readable in BOTH themes.
 *
 * History: the label carried its own hue per state — `ember` for NEXT MOVE,
 * `mint` for START BACK SMALL. Dark mode was always fine (6.89:1 / 6.74:1).
 * On a light surface both were unreadable at 10px bold: 2.63:1 and 2.14:1
 * against a 4.5:1 floor. It read as a design choice and measured as a defect.
 *
 * This is the third flag of "warm/muted token used as small text on a light
 * surface" (2026-07-16 inkMuted, 2026-07-22 inkMuted, now ember/mint), so the
 * guard measures the token rather than pinning the string that failed.
 */

const FILE = 'components/NextMoveCard.tsx';
const src = readFileSync(join(__dirname, '../../', FILE), 'utf8');

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

describe('NextMoveCard microlabel contrast', () => {
  it('is painted with a single theme-resolved token, not a per-state hue', () => {
    const label = src.match(/<Text style=\{\[styles\.microlabel,\s*\{\s*color:\s*([^}]+)\}/);
    expect(label).not.toBeNull();
    expect(label![1].trim()).toBe('c.accent');
  });

  it.each(['light', 'dark'] as const)('clears AA on the %s card surface', (theme) => {
    const c = themedColors(theme);
    // The surface is painted by the goalCard shell in GoalCards.tsx, which
    // owns it; this component only pads. Keep the background in step with it.
    const shellSrc = readFileSync(join(__dirname, '../../', 'components/focus/GoalCards.tsx'), 'utf8');
    expect(shellSrc).toContain('styles.goalCard, { backgroundColor: c.surface }');
    expect(contrastRatio(c.accent, c.surface)).toBeGreaterThanOrEqual(AA_BODY);
  });

  it('the retired per-state hues would still fail, so they stay retired', () => {
    const c = themedColors('light');
    expect(contrastRatio(c.ember, c.surface)).toBeLessThan(AA_BODY);
    expect(contrastRatio(c.mint, c.surface)).toBeLessThan(AA_BODY);
  });
});
