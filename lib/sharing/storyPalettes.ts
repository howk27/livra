// lib/sharing/storyPalettes.ts
// The Weekly Story card's two palettes (spec 2026-09-15 §4). The person picks
// one before sharing; the archetype never picks the colour.
//
// Fixed values, not themed tokens, on purpose: a shared image must render the
// same from every phone regardless of the app theme (the same reasoning as
// shareCardThemes.ts). The ground is the dark-theme page green and the tints
// are the dark-theme ember/mint tints, so nothing here is a colour the app
// does not already show.
import { colors } from '../../theme/tokens';

export type StoryPaletteId = 'amber' | 'green';

export type StoryPalette = {
  id: StoryPaletteId;
  label: 'Amber' | 'Green';
  /** Leads: archetype name, kicker, Monday's dot, the glow's centre. */
  tint: string;
  /**
   * Closes: the signature, Sunday's dot, the glow's outer reach. The palette
   * id chose a flat colour until 2026-09-20; it now chooses the DIRECTION of
   * one amber-to-green gradient (founder: "make it a gradient that changes
   * between the Amber & Green").
   */
  tintEnd: string;
  /** The chip swatch: the app token, not the tint. */
  swatch: string;
};

export const STORY_GROUND = '#15211D';
export const STORY_LINEN = '#F0EDE8';

export const STORY_PALETTE_IDS: readonly StoryPaletteId[] = ['amber', 'green'];

// Founder 2026-09-20, twice. First "slightly more visible": the amber
// measured 8.66:1 on the ground against green's 9.79, so one end of every
// gradient read dimmer. Then "slightly stronger": brightness was no longer
// the problem, presence was. This is 9.81:1 — still level with green — at
// 88% saturation against the first pass's 77%, so it gained colour, not light.
const AMBER = '#F4BF57';
const GREEN = '#A9CFC3';

export const STORY_PALETTES: Record<StoryPaletteId, StoryPalette> = {
  amber: { id: 'amber', label: 'Amber', tint: AMBER, tintEnd: GREEN, swatch: colors.ember },
  green: { id: 'green', label: 'Green', tint: GREEN, tintEnd: AMBER, swatch: colors.mint },
};

/**
 * A colour `position` of the way from `from` to `to` (0..1, clamped), as an
 * uppercase #RRGGBB. Straight sRGB interpolation: both ends are light, low
 * saturation tints on the same dark ground, so the midpoint stays legible and
 * needs no perceptual space to avoid a muddy centre.
 */
export function blendTint(from: string, to: string, position: number): string {
  const t = Math.min(1, Math.max(0, position));
  const channel = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  const mixed = [0, 1, 2].map((i) => {
    const value = Math.round(channel(from, i) + (channel(to, i) - channel(from, i)) * t);
    return value.toString(16).padStart(2, '0');
  });
  return `#${mixed.join('')}`.toUpperCase();
}

export const DEFAULT_STORY_PALETTE: StoryPaletteId = 'amber';

export function isStoryPaletteId(x: unknown): x is StoryPaletteId {
  return x === 'amber' || x === 'green';
}
