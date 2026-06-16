import { StyleSheet, TextStyle } from 'react-native';
import { fontSize, fontWeight, lineHeight, letterSpacing, fonts } from './tokens';

const roundLineHeight = (size: number, ratio: number) =>
  Math.round(size * ratio);

type TypographyScale = Record<string, TextStyle>;

export const typography: TypographyScale = StyleSheet.create({
  display: {
    fontFamily: fonts.heading,
    fontSize: fontSize['2xl'],
    fontWeight: fontWeight.bold,
    lineHeight: roundLineHeight(fontSize['2xl'], lineHeight.snug),
    letterSpacing: letterSpacing.tight,
  },
  headline: {
    fontFamily: fonts.heading,
    fontSize: fontSize.display,
    fontWeight: fontWeight.bold,
    lineHeight: roundLineHeight(fontSize.display, lineHeight.snug),
    letterSpacing: letterSpacing.tight,
  },
  title: {
    fontFamily: fonts.heading,
    fontSize: fontSize.xl,
    fontWeight: fontWeight.semibold,
    lineHeight: roundLineHeight(fontSize.xl, lineHeight.default),
    letterSpacing: letterSpacing.normal,
  },
  subtitle: {
    fontFamily: fonts.regular,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.medium,
    lineHeight: roundLineHeight(fontSize.lg, lineHeight.default),
    letterSpacing: letterSpacing.normal,
  },
  body: {
    fontFamily: fonts.regular,
    fontSize: fontSize.base,
    fontWeight: fontWeight.normal,
    lineHeight: roundLineHeight(fontSize.base, lineHeight.relaxed),
    letterSpacing: letterSpacing.normal,
  },
  caption: {
    fontFamily: fonts.regular,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    lineHeight: roundLineHeight(fontSize.sm, lineHeight.relaxed),
    letterSpacing: letterSpacing.wide,
    textTransform: 'uppercase',
  },
  label: {
    fontFamily: fonts.regular,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    lineHeight: roundLineHeight(fontSize.xs, lineHeight.default),
    letterSpacing: letterSpacing.wide,
  },
  button: {
    fontFamily: fonts.regular,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    lineHeight: roundLineHeight(fontSize.lg, lineHeight.snug),
    letterSpacing: letterSpacing.normal,
  },

  // ── Wave 5 additions — size-preserving semantic roles for the clusters the
  // original 8 presets don't cover. Serif heroes above 2xl, italic greeting,
  // and the common sans body/meta weights (non-uppercase, unlike `caption`).
  hero: {
    fontFamily: fonts.serif,
    fontSize: fontSize['4xl'],
    fontWeight: fontWeight.bold,
    lineHeight: roundLineHeight(fontSize['4xl'], lineHeight.snug),
    letterSpacing: letterSpacing.tight,
  },
  display2: {
    fontFamily: fonts.serif,
    fontSize: fontSize['3xl'],
    fontWeight: fontWeight.bold,
    lineHeight: roundLineHeight(fontSize['3xl'], lineHeight.snug),
    letterSpacing: letterSpacing.tight,
  },
  greeting: {
    fontFamily: fonts.serifItalic,
    fontSize: fontSize[22],
    fontWeight: fontWeight.normal,
    lineHeight: roundLineHeight(fontSize[22], lineHeight.snug),
    letterSpacing: letterSpacing.normal,
  },
  bodyMedium: {
    fontFamily: fonts.sansMedium,
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium,
    lineHeight: roundLineHeight(fontSize.base, lineHeight.relaxed),
    letterSpacing: letterSpacing.normal,
  },
  bodySemibold: {
    fontFamily: fonts.sansSemibold,
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    lineHeight: roundLineHeight(fontSize.base, lineHeight.relaxed),
    letterSpacing: letterSpacing.normal,
  },
  bodySmall: {
    fontFamily: fonts.sans,
    fontSize: fontSize[13],
    fontWeight: fontWeight.normal,
    lineHeight: roundLineHeight(fontSize[13], lineHeight.relaxed),
    letterSpacing: letterSpacing.normal,
  },
  bodySmallMedium: {
    fontFamily: fonts.sansMedium,
    fontSize: fontSize[13],
    fontWeight: fontWeight.medium,
    lineHeight: roundLineHeight(fontSize[13], lineHeight.relaxed),
    letterSpacing: letterSpacing.normal,
  },
  meta: {
    fontFamily: fonts.sansMedium,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    lineHeight: roundLineHeight(fontSize.sm, lineHeight.default),
    letterSpacing: letterSpacing.normal,
  },
});

export type TypographyVariant = keyof typeof typography;


