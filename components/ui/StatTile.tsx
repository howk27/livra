import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { type Icon as PhosphorIcon } from 'phosphor-react-native';
import { fonts, radius, spacing, shadow, themedColors } from '../../theme/tokens';
import { useEffectiveTheme } from '../../state/uiSlice';

interface StatTileProps {
  icon: PhosphorIcon;
  value: string;
  label: string;
  bgColor?: string;
}

export function StatTile({ icon: Icon, value, label, bgColor }: StatTileProps) {
  const theme = useEffectiveTheme();
  const c = themedColors(theme);
  return (
    <View style={[styles.tile, { backgroundColor: bgColor ?? c.surface }]}>
      <View style={styles.topRow}>
        <Icon size={18} color={c.inkMid} weight="duotone" />
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
    fontFamily: fonts.sansSemibold,
    fontSize: 28,
  },
  label: {
    fontFamily: fonts.sansMedium,
    fontSize: 11,
    letterSpacing: 1.2,
  },
});
