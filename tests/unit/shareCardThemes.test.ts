import {
  DEFAULT_SHARE_CARD_STYLE,
  SHARE_CARD_THEME_IDS,
  SHARE_CARD_ACCENT_IDS,
  SHARE_CARD_ACCENT_HEX,
  resolveCardColors,
  type ShareCardStyle,
} from '../../lib/sharing/shareCardThemes';

describe('shareCardThemes', () => {
  it('default style reproduces the original Forest card', () => {
    expect(DEFAULT_SHARE_CARD_STYLE).toEqual({
      themeId: 'forest',
      accentId: 'rose',
      showMomentum: true,
      showBadge: true,
      showDate: true,
    });
    const colors = resolveCardColors(DEFAULT_SHARE_CARD_STYLE);
    expect(colors.bg).toBe('#1C2826');
    expect(colors.text).toBe('#F0E6D0');
    expect(colors.muted).toBe('rgba(240,230,208,0.55)');
    expect(colors.accent).toBe('#C47E8A');
  });

  it('exposes exactly four themes and four accents', () => {
    expect(SHARE_CARD_THEME_IDS).toEqual(['forest', 'linen', 'night', 'sage']);
    expect(SHARE_CARD_ACCENT_IDS).toEqual(['rose', 'forest', 'gold', 'slate']);
  });

  it('every theme id resolves to a full color set', () => {
    for (const themeId of SHARE_CARD_THEME_IDS) {
      const colors = resolveCardColors({
        ...DEFAULT_SHARE_CARD_STYLE,
        themeId,
      } as ShareCardStyle);
      expect(colors.bg).toMatch(/^#|^rgba/);
      expect(colors.text).toMatch(/^#|^rgba/);
      expect(colors.muted).toMatch(/^#|^rgba/);
    }
  });

  it('accent overrides theme accent', () => {
    const colors = resolveCardColors({ ...DEFAULT_SHARE_CARD_STYLE, accentId: 'gold' });
    expect(colors.accent).toBe(SHARE_CARD_ACCENT_HEX.gold);
  });
});
