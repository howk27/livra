export const colors = {
  // Light theme (UI/UX Spec palette)
  light: {
    // Core colors from spec
    // Desaturated neutral “canvas” — not a hue-forward mint; lets warm cream cards read clearly
    background: '#E5E7E6', // bg.default
    surface: '#F7F6F2', // bg.surface — slightly off-white vs page tint
    surfaceVariant: '#F1F0EB', // Slightly darker variant
    surfaceActive: '#ECEAE4', // Active/pressed states
    
    // Text colors from spec
    text: '#2C3E50', // text.primary
    textSecondary: '#5A6B77', // text.muted (60% opacity base)
    textTertiary: '#8A95A7', // Lighter for tertiary
    
    // Accent colors from spec
    // primary = pale pink tint (for backgrounds and subtle fills)
    // accent.primary = deeper rose (for text labels, CTAs, active states — readable on light surfaces)
    primary: '#F4C7C3', // Tint color — used for subtle fills, backgrounds
    primaryLight: '#F8D4D0', // Lighter tint variant
    primaryHover: '#E8A8A3', // Hover state (slightly deeper)
    accent: {
      primary: '#C26960', // CTA / active label — readable rose on light backgrounds
      secondary: '#F8E8A6', // Secondary highlights
    },
    
    // Border and state colors
    border: '#DED9CF', // border.soft — clearer separation from surface
    error: '#E6B1AE', // state.destructive
    // Slightly deeper sage than prior mint for contrast on light surfaces (momentum, states)
    success: '#4F8F72', // state.success — deeper sage for light UI contrast
    warning: '#F8E8A6', // accent.secondary for warnings
    
    // Overlay for press states
    overlay: 'rgba(0,0,0,0.06)', // Press/hover overlay

    // Legacy support (mapped to new colors)
    successGlow: '#4F8F72',
    warningGlow: '#F8E8A6',
    reset: '#F8E8A6',
    
    // Counter colors (user-selectable) - keep existing
    counter: {
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
    },
  },
  
  // Dark theme (UI/UX Spec palette)
  dark: {
    // Core colors from spec
    background: '#1F2E2C', // bg.default
    surface: '#2B3A39', // bg.surface
    surfaceVariant: '#344443', // Slightly lighter variant
    surfaceActive: '#3D4E4C', // Active/pressed states
    
    // Text colors from spec
    text: '#F3F1EB', // text.primary
    textSecondary: '#DCD7CE', // text.muted (80% opacity base)
    textTertiary: '#B8B3AA', // Lighter for tertiary
    
    // Accent colors from spec
    primary: '#D8A7A0', // accent.primary
    primaryLight: '#E0B5AE', // Lighter variant
    primaryHover: '#D0998F', // Hover state
    accent: {
      primary: '#D8A7A0', // Main CTA, active tab
      secondary: '#D7C47B', // Secondary highlights
    },
    
    // Border and state colors
    border: '#3A4A49', // border.soft
    error: '#C99995', // state.destructive
    success: '#8FBFA0', // state.success
    warning: '#D7C47B', // accent.secondary for warnings
    
    // Overlay for press states
    overlay: 'rgba(0,0,0,0.24)', // Press/hover overlay

    // Legacy support (mapped to new colors)
    successGlow: '#8FBFA0',
    warningGlow: '#D7C47B',
    reset: '#D7C47B',
    
    // Counter colors (user-selectable) - keep existing
    counter: {
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
    },
  },
  
  // Counter colors (user-selectable)
  counter: {
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
  },
};

export type Colors = typeof colors.light;

