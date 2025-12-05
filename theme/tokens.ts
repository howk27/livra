// Spacing: 8-pt base system (use 4-pt for micro-tuning) per spec
export const spacing = {
  xxs: 2,
  xs: 4, // Micro-tuning
  sm: 8, // Base unit
  md: 12, // Between related items
  lg: 16, // Page padding (phones)
  xl: 20, // Page padding (large phones), between sections
  xxl: 24, // Page padding (tablet)
  '3xl': 32,
  '4xl': 40,
  '5xl': 48,
};

// Border radius per spec: card radius 16
export const borderRadius = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16, // Card radius per spec
  card: 16, // Card radius per spec
  full: 9999,
};

// Typography per spec
export const fontSize = {
  xs: 11, // Tab labels per spec
  sm: 12, // Meta/labels per spec
  base: 14, // Body per spec
  md: 15, // Paragraph captions
  lg: 16, // Section titles per spec
  xl: 20, // Subtitle / card titles
  display: 24, // Display numbers (totals)
  '2xl': 28, // Larger display
  '3xl': 32,
  '4xl': 36,
};

export const fontWeight = {
  normal: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
};

export const lineHeight = {
  tight: 1.1,
  snug: 1.2,
  default: 1.4,
  relaxed: 1.5,
};

export const letterSpacing = {
  tight: -0.2,
  normal: 0,
  wide: 0.4,
};

export const motion = {
  quick: 120,
  standard: 180,
  relaxed: 240,
};

export const shadow = {
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
  // Card shadow per design spec: 0 8 20 -6 @ 45% black
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 20,
    elevation: 8,
  },
};

export const fonts = {
  regular: 'Inter',
  heading: 'Satoshi',
};

