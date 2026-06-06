import React from 'react';
import { Text, StyleSheet } from 'react-native';
import { fonts, themedColors } from '../../theme/tokens';
import { useEffectiveTheme } from '../../state/uiSlice';

export interface LivraWordmarkProps {
  color?: string;
  fontSize?: number;
  letterSpacing?: number;
}

export function LivraWordmark({
  color,
  fontSize = 28,
  letterSpacing = 6,
}: LivraWordmarkProps) {
  const theme = useEffectiveTheme();
  const resolvedColor = color ?? themedColors(theme).inkDark;
  return (
    <Text style={[styles.wordmark, { color: resolvedColor, fontSize, letterSpacing }]}>
      LIVRA
    </Text>
  );
}

const styles = StyleSheet.create({
  wordmark: {
    fontFamily: fonts.serif,
    textTransform: 'uppercase',
  },
});
