const COUNTER_COLORS = {
  blue: '#3B82F6',
  purple: '#A855F7',
  green: '#10B981',
  orange: '#F97316',
  red: '#EF4444',
  pink: '#EC4899',
  yellow: '#F59E0B',
  teal: '#14B8A6',
  indigo: '#6366F1',
  cyan: '#06B6D4',
};

export const colors = {
  light: {
    background: '#E8E8E8',
    surface: '#DEDEDE',
    surfaceVariant: '#D4D4D4',
    surfaceActive: '#CACACA',

    text: '#111111',
    textSecondary: '#888888',
    textTertiary: '#BBBBBB',

    // Accent: #FEB729 — used boldly, not sparingly
    primary: '#FEB729',
    primaryLight: '#FEB72920',
    primaryHover: '#F5AE1A',
    accent: {
      primary: '#FEB729',
      secondary: '#FEB72940',
    },
    // Text color to use ON accent (#FEB729) backgrounds
    accentText: '#111111',

    border: '#C8C8C8',
    error: '#EF4444',
    success: '#22C55E',
    warning: '#FEB729',
    overlay: 'rgba(0,0,0,0.06)',

    // Legacy compat
    successGlow: '#22C55E',
    warningGlow: '#FEB72950',
    reset: '#FEB72950',

    counter: COUNTER_COLORS,
  },

  dark: {
    background: '#111111',
    surface: '#1A1A1A',
    surfaceVariant: '#242424',
    surfaceActive: '#2E2E2E',

    text: '#F5F0E8',
    textSecondary: '#666666',
    textTertiary: '#3A3A3A',

    // Accent: #FEB729 — same in both themes
    primary: '#FEB729',
    primaryLight: '#FEB72920',
    primaryHover: '#F5AE1A',
    accent: {
      primary: '#FEB729',
      secondary: '#FEB72940',
    },
    accentText: '#111111',

    border: '#2A2A2A',
    error: '#EF4444',
    success: '#22C55E',
    warning: '#FEB729',
    overlay: 'rgba(0,0,0,0.40)',

    // Legacy compat
    successGlow: '#22C55E',
    warningGlow: '#FEB72940',
    reset: '#FEB72940',

    counter: COUNTER_COLORS,
  },

  // Top-level counter colors (legacy support)
  counter: COUNTER_COLORS,
};

export type Colors = typeof colors.light;
