// Weekly Story card palettes (spec 2026-09-15 §4). Contrast is MEASURED, not
// pinned by hex, so a retune that drops below 4.5:1 fails here.
import { DEFAULT_STORY_PALETTE, STORY_GROUND, STORY_LINEN, STORY_PALETTES, STORY_PALETTE_IDS, blendTint, isStoryPaletteId } from '../../lib/sharing/storyPalettes';
import { colors } from '../../theme/tokens';

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const ch = [16, 8, 0].map((s) => ((n >> s) & 255) / 255).map((c) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

describe('storyPalettes', () => {
  it('exposes exactly two palettes, amber first, amber default', () => {
    expect(STORY_PALETTE_IDS).toEqual(['amber', 'green']);
    expect(DEFAULT_STORY_PALETTE).toBe('amber');
  });

  it.each(STORY_PALETTE_IDS)('%s tint carries text on the ground (>= 4.5:1)', (id) => {
    expect(contrast(STORY_PALETTES[id].tint, STORY_GROUND)).toBeGreaterThanOrEqual(4.5);
  });

  it('linen carries the numeral on the ground (>= 7:1)', () => {
    expect(contrast(STORY_LINEN, STORY_GROUND)).toBeGreaterThanOrEqual(7);
  });

  it('chip swatches are the app tokens, not new colours', () => {
    expect(STORY_PALETTES.amber.swatch).toBe(colors.ember);
    expect(STORY_PALETTES.green.swatch).toBe(colors.mint);
  });

  it('isStoryPaletteId guards persisted strings', () => {
    expect(isStoryPaletteId('amber')).toBe(true);
    expect(isStoryPaletteId('green')).toBe(true);
    expect(isStoryPaletteId('rose')).toBe(false);
    expect(isStoryPaletteId(undefined)).toBe(false);
  });
});

// Founder 2026-09-20: "make it a gradient that changes between the Amber &
// Green". The palette id now picks the DIRECTION of one gradient, not one flat
// colour: `tint` leads (name, kicker, glow centre) and `tintEnd` closes
// (signature, the last day of the week).
describe('story gradient', () => {
  it('each palette leads with its own colour and closes on the other', () => {
    expect(STORY_PALETTES.amber.tint).toBe('#E3B463');
    expect(STORY_PALETTES.amber.tintEnd).toBe(STORY_PALETTES.green.tint);
    expect(STORY_PALETTES.green.tintEnd).toBe(STORY_PALETTES.amber.tint);
  });

  it('blendTint walks from one end to the other and never leaves the pair', () => {
    const { tint, tintEnd } = STORY_PALETTES.amber;
    expect(blendTint(tint, tintEnd, 0)).toBe(tint.toUpperCase());
    expect(blendTint(tint, tintEnd, 1)).toBe(tintEnd.toUpperCase());
    const mid = blendTint(tint, tintEnd, 0.5);
    expect(mid).toMatch(/^#[0-9A-F]{6}$/);
    // Halfway is between the two on every channel.
    const chan = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
    for (let i = 0; i < 3; i++) {
      const lo = Math.min(chan(tint, i), chan(tintEnd, i));
      const hi = Math.max(chan(tint, i), chan(tintEnd, i));
      expect(chan(mid, i)).toBeGreaterThanOrEqual(lo);
      expect(chan(mid, i)).toBeLessThanOrEqual(hi);
    }
  });

  it('clamps a position outside 0..1 rather than inventing a colour', () => {
    const { tint, tintEnd } = STORY_PALETTES.green;
    expect(blendTint(tint, tintEnd, -1)).toBe(tint.toUpperCase());
    expect(blendTint(tint, tintEnd, 4)).toBe(tintEnd.toUpperCase());
  });
});
