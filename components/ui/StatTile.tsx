import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { fonts, radius, spacing, shadow, themedColors } from '../../theme/tokens';
import { useEffectiveTheme } from '../../state/uiSlice';

interface StatTileProps {
  icon: keyof typeof Feather.glyphMap;
  value: string;
  label: string;
  bgColor?: string;
}

export function StatTile({ icon, value, label, bgColor }: StatTileProps) {
  const theme = useEffectiveTheme();
  const c = themedColors(theme);
  return (
    <View style={[styles.tile, { backgroundColor: bgColor ?? c.surface }]}>
      <View style={styles.topRow}>
        <Feather name={icon} size={18} color={c.inkMid} />
        <Text style={[styles.value, { color: c.inkDark }]}>{value}</Text>
      </View>
      <Text style={[styles.label, { color: c.inkMuted }]}>{label.toUpperCase()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
    aspectRatio: 1,
    justifyContent: 'space-between',
    ...shadow.card,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  value: {
    fontFamily: fonts.serifSemibold,
    fontSize: 28,
  },
  label: {
    fontFamily: fonts.sansMedium,
    fontSize: 11,
    letterSpacing: 1.2,
  },
});
