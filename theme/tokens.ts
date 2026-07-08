export const colors = {
  linen: '#F0EDE8',
  surface: '#FAF9F7',
  surfaceAlt: '#E8E4DE',
  forest: '#1C3830',
  forestLight: '#2D5446',
  mint: '#8DB5A8',
  mintLight: '#C8DDD8',
  // Brand accent for FOREGROUND use (text, icons, selection outlines) on the
  // page background. Distinct from `forest`, which doubles as a card/button
  // background. On light this equals `forest`; on dark it must stay readable on
  // the dark-green background, so it uses the bright `mint` accent.
  accent: '#1C3830',
  inkDark: '#1A1A18',
  inkMid: '#4A4A45',
  inkMuted: '#9A9A92',
  inkInverse: '#F0EDE8',
  inkInverseMuted: '#A8C4BC',
  danger: '#C0392B',
  // Momentum cushion gauge + on-it glow. Warm amber, deliberately NOT danger/alarm-red.
  momentumAmber: '#C8913F',
  dangerLight: '#FDECEA',
  success: '#2D6A4F',
  borderLight: '#E0DBD4',
  borderMid: '#C8C2BA',
};

/**
 * Dark-mode variant of the Livra 2.0 semantic palette. Same shape as `colors`
 * so screens/components can resolve a theme-aware palette at render time:
 *
 *   const c = themedColors(useEffectiveTheme());
 *   <View style={{ backgroundColor: c.linen }} />
 *
 * Brand accents (forest, mint) stay recognizable across themes; only the
 * neutral surface/ink/border roles flip for dark backgrounds.
 */
const colorsDark: typeof colors = {
  // Backgrounds: deep warm-neutral instead of linen
  linen: '#15211D',
  surface: '#1C2826',
  surfaceAlt: '#243430',
  // Accents stay on-brand; forest becomes the lighter variant so it reads
  // against the dark background, mint stays as the bright accent.
  forest: '#2D5446',
  forestLight: '#3A6B58',
  mint: '#8DB5A8',
  mintLight: '#C8DDD8',
  // Foreground brand accent — the bright mint reads on the dark background,
  // where `forest` (#2D5446) would be green-on-green. See `accent` in `colors`.
  accent: '#8DB5A8',
  // Ink (text) inverts: light text on dark surfaces
  inkDark: '#F0EDE8',
  inkMid: '#C2C7C2',
  inkMuted: '#8A938E',
  // "Inverse" roles are text that sits on the forest card — already light, so
  // they remain light-on-dark.
  inkInverse: '#F0EDE8',
  inkInverseMuted: '#A8C4BC',
  danger: '#E07A6D',
  // Momentum cushion gauge + on-it glow. Warm amber, deliberately NOT danger/alarm-red.
  momentumAmber: '#D8A658',
  dangerLight: '#3A2422',
  success: '#5FA585',
  borderLight: '#2A3A35',
  borderMid: '#3A4A44',
};

/**
 * Per-category accent palette (warm, muted hues). These are *data* — one
 * recognizable color per mark category — not part of the light/dark semantic
 * roles, so they stay constant across themes. Single source of truth for
 * MarkRow's category map and the AddMarkSheet category picker.
 */
export const categoryAccents = {
  recovery: '#6B8FA6',
  fitness: '#A0614A',
  health: '#4A8C7A',
  mindset: '#8A6B7B',
  deepWork: '#4A6A8C',
  creative: '#7A4A8C',
  discipline: '#8A7E6B',
  relationships: '#9E7B6B',
  finance: '#9E8A6B',
  email: '#4A7A8C',
  planning: '#8C7A3A',
  custom: '#6B7A6B',
} as const;

const colorsByTheme = { light: colors, dark: colorsDark } as const;

/** Resolve the Livra 2.0 semantic palette for the effective theme. */
export function themedColors(theme: 'light' | 'dark'): typeof colors {
  return colorsByTheme[theme];
}

export const spacing = {
  xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48,
  // Backward compat aliases — existing screens still reference these
  xxs: 2,
  '3xl': 32,
  '4xl': 40,
  '5xl': 48,
};

export const radius = {
  sm: 6, md: 12, lg: 20, xl: 28, full: 999
};

export const shadow = {
  card: {
    shadowColor: '#8B7355',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  fab: {
    shadowColor: '#1C3830',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 6,
  },
  // Backward compat aliases
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
};

export const fonts = {
  serif: 'CormorantGaramond_700Bold',
  serifSemibold: 'CormorantGaramond_600SemiBold',
  serifItalic: 'CormorantGaramond_400Regular_Italic',
  sans: 'DMSans_400Regular',
  sansMedium: 'DMSans_500Medium',
  sansSemibold: 'DMSans_600SemiBold',
  sansBold: 'DMSans_700Bold',
  mono: 'monospace', // diagnostics / code display only
  // Backward compat aliases used by theme/typography.ts
  heading: 'CormorantGaramond_700Bold',
  regular: 'DMSans_400Regular',
};

// Backward compat aliases — existing screens still reference these names
export const borderRadius = { ...radius, card: 16 };
export const fontSize = {
  xs: 11, sm: 12, base: 14, md: 15, lg: 16, xl: 20,
  display: 24, '2xl': 28, '3xl': 32, '4xl': 36,
  // Wave 5 — remaining real sizes used across screens (key === px for the
  // in-between steps so the migration stays provably size-preserving).
  '2xs': 10,
  13: 13, 17: 17, 18: 18, 22: 22, 26: 26,
  '5xl': 40, '6xl': 60, '7xl': 64,
};
export const fontWeight = {
  normal: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
};
export const lineHeight = {
  tight: 1.1, snug: 1.2, default: 1.4, relaxed: 1.5,
};
export const letterSpacing = {
  tight: -0.2, normal: 0, wide: 0.4,
};
export const motion = {
  quick: 120, standard: 180, relaxed: 240, gentle: 350, moment: 500,
};
// Spring presets harvested from the app's best existing animations.
// playful: CheckinButton press. settle: overlay entrances. entrance: milestone reveal.
export const springs = {
  playful:  { damping: 12, stiffness: 280 },
  settle:   { damping: 20, stiffness: 200 },
  entrance: { damping: 14, stiffness: 90 },
} as const;
