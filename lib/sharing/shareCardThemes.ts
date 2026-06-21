export type ShareCardThemeId = 'forest' | 'linen' | 'night' | 'sage';
export type ShareCardAccentId = 'rose' | 'forest' | 'gold' | 'slate';

export interface ShareCardStyle {
  themeId: ShareCardThemeId;
  accentId: ShareCardAccentId;
  showMomentum: boolean;
  showBadge: boolean;
  showDate: boolean;
}

export interface ResolvedCardColors {
  bg: string;
  text: string;
  muted: string;
  accent: string;
}

/** Order is the swatch display order in the Customize section. */
export const SHARE_CARD_THEME_IDS: ShareCardThemeId[] = ['forest', 'linen', 'night', 'sage'];
export const SHARE_CARD_ACCENT_IDS: ShareCardAccentId[] = ['rose', 'forest', 'gold', 'slate'];

export const SHARE_CARD_THEME_LABELS: Record<ShareCardThemeId, string> = {
  forest: 'Forest',
  linen: 'Linen',
  night: 'Night',
  sage: 'Sage',
};

/** Fixed (non-token) palettes: the card must render the same on any device theme. */
const SHARE_CARD_THEME_PALETTES: Record<
  ShareCardThemeId,
  { bg: string; text: string; muted: string }
> = {
  forest: { bg: '#1C2826', text: '#F0E6D0', muted: 'rgba(240,230,208,0.55)' },
  linen: { bg: '#F0E6D0', text: '#1C2826', muted: 'rgba(28,40,38,0.55)' },
  night: { bg: '#11151A', text: '#F0E6D0', muted: 'rgba(240,230,208,0.55)' },
  sage: { bg: '#3A4A42', text: '#F0E6D0', muted: 'rgba(240,230,208,0.55)' },
};

export const SHARE_CARD_ACCENT_HEX: Record<ShareCardAccentId, string> = {
  rose: '#C47E8A',
  forest: '#5E8C6A',
  gold: '#C9A24B',
  slate: '#7E8CA0',
};

export const DEFAULT_SHARE_CARD_STYLE: ShareCardStyle = {
  themeId: 'forest',
  accentId: 'rose',
  showMomentum: true,
  showBadge: true,
  showDate: true,
};

export function resolveCardColors(style: ShareCardStyle): ResolvedCardColors {
  const palette = SHARE_CARD_THEME_PALETTES[style.themeId];
  return {
    bg: palette.bg,
    text: palette.text,
    muted: palette.muted,
    accent: SHARE_CARD_ACCENT_HEX[style.accentId],
  };
}
