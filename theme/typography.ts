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
});

export type TypographyVariant = keyof typeof typography;


