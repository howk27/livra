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
  /** Archetype name, kicker, active day dots. */
  tint: string;
  /** The chip swatch in the share sheet: the app token, not the tint. */
  swatch: string;
};

export const STORY_GROUND = '#15211D';
export const STORY_LINEN = '#F0EDE8';

export const STORY_PALETTE_IDS: readonly StoryPaletteId[] = ['amber', 'green'];

export const STORY_PALETTES: Record<StoryPaletteId, StoryPalette> = {
  amber: { id: 'amber', label: 'Amber', tint: '#E3B463', swatch: colors.ember },
  green: { id: 'green', label: 'Green', tint: '#A9CFC3', swatch: colors.mint },
};

export const DEFAULT_STORY_PALETTE: StoryPaletteId = 'amber';

export function isStoryPaletteId(x: unknown): x is StoryPaletteId {
  return x === 'amber' || x === 'green';
}
