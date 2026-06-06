import React from 'react';
import { Text, StyleSheet } from 'react-native';
import { fonts, themedColors } from '../../theme/tokens';
import { useEffectiveTheme } from '../../state/uiSlice';

interface SectionLabelProps {
  children: string;
  color?: string;
  style?: object;
}

export function SectionLabel({ children, color, style }: SectionLabelProps) {
  const theme = useEffectiveTheme();
  const c = themedColors(theme);
  const resolvedColor = color ?? c.inkMuted;
  return (
    <Text style={[styles.label, { color: resolvedColor }, style]}>
      {children.toUpperCase()}
    </Text>
  );
}

const styles = StyleSheet.create({
  label: {
    fontFamily: fonts.sansMedium,
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
});
