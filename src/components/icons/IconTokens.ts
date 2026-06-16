import { themedColors } from '../../../theme/tokens';

export const ICON_CANVAS_SIZES = [16, 20, 24, 28, 32, 40] as const;

export type IconCanvasSize = (typeof ICON_CANVAS_SIZES)[number];

export const DEFAULT_ICON_SIZE: IconCanvasSize = 24;

/**
 * Content renders within an inset canvas to guarantee consistent padding.
 * A padding ratio of 0.1 means 10% padding on each edge (20% net reduction).
 */
export const ICON_PADDING_RATIO = 0.1; // 10% per side → 80% live area

/**
 * Shared stroke width so icons feel like one family across sizes.
 */
export const ICON_STROKE_WIDTH = 2.5;

/**
 * Rounded shapes scale slightly with size to keep visual weight balanced.
 */
export const ICON_CORNER_RADIUS = {
  small: 4,
  medium: 5,
  large: 6,
} as const;

/**
 * Tone groupings map to existing theme tokens; `CounterIcon` will pick
 * the appropriate variant (light/dark) at runtime.
 *
 * Icons inherit color from their parent when possible. When a tone is supplied,
 * these provide sensible defaults that stay within the current palette.
 */
export const ICON_TONE_COLOR_TOKENS = {
  physical: {
    light: themedColors('light').accent,
    dark: themedColors('dark').accent,
  },
  nutrition: {
    light: themedColors('light').success,
    dark: themedColors('dark').success,
  },
  mind: {
    light: themedColors('light').inkMid,
    dark: themedColors('dark').inkMid,
  },
  misc: {
    light: themedColors('light').inkDark,
    dark: themedColors('dark').inkDark,
  },
} as const;

/**
 * Background circles reuse the foreground color at a reduced opacity.
 * Component logic applies the alpha multiplier below.
 */
export const ICON_BACKGROUND_ALPHA = 0.12; // 12% tint per spec

/**
 * Animation defaults expressed as durations so the wrapper can stay declarative.
 */
export const ICON_ANIMATION_TIMING = {
  increment: 160,
  streak: 400,
} as const;


