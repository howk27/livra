export const colors = {
  linen: '#F0EDE8',
  surface: '#FAF9F7',
  surfaceAlt: '#E8E4DE',
  forest: '#1C3830',
  forestLight: '#2D5446',
  mint: '#8DB5A8',
  mintLight: '#C8DDD8',
  inkDark: '#1A1A18',
  inkMid: '#4A4A45',
  inkMuted: '#9A9A92',
  inkInverse: '#F0EDE8',
  inkInverseMuted: '#A8C4BC',
  danger: '#C0392B',
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
  // Ink (text) inverts: light text on dark surfaces
  inkDark: '#F0EDE8',
  inkMid: '#C2C7C2',
  inkMuted: '#8A938E',
  // "Inverse" roles are text that sits on the forest card — already light, so
  // they remain light-on-dark.
  inkInverse: '#F0EDE8',
  inkInverseMuted: '#A8C4BC',
  danger: '#E07A6D',
  dangerLight: '#3A2422',
  success: '#5FA585',
  borderLight: '#2A3A35',
  borderMid: '#3A4A44',
};

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
  // Backward compat aliases used by theme/typography.ts
  heading: 'CormorantGaramond_700Bold',
  regular: 'DMSans_400Regular',
};

// Backward compat aliases — existing screens still reference these names
export const borderRadius = { ...radius, card: 16 };
export const fontSize = {
  xs: 11, sm: 12, base: 14, md: 15, lg: 16, xl: 20,
  display: 24, '2xl': 28, '3xl': 32, '4xl': 36,
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
  quick: 120, standard: 180, relaxed: 240,
};
