// Weekly Story card palettes (spec 2026-09-15 §4). Contrast is MEASURED, not
// pinned by hex, so a retune that drops below 4.5:1 fails here.
import {
  DEFAULT_STORY_PALETTE,
  STORY_GROUND,
  STORY_LINEN,
  STORY_PALETTES,
  STORY_PALETTE_IDS,
  isStoryPaletteId,
} from '../../lib/sharing/storyPalettes';
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
