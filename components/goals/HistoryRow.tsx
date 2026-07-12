// components/goals/HistoryRow.tsx
// Always-visible entry to the free history surface (app/goal/history.tsx).
// Renders even with zero completions so "history & stats are free" is
// reachable in-app for new accounts (PRODUCT.md:436). No streaks, no Pro gate.
// QC 2026-07-12: a quiet text button anchored bottom right, out of the goal
// list's drag gravity — not a card competing with the goals above it.
import React from 'react';
import { Text, TouchableOpacity, StyleSheet } from 'react-native';
import { CaretRight } from 'phosphor-react-native';

import { fonts, fontSize, spacing, themedColors } from '../../theme/tokens';
import { useEffectiveTheme } from '../../state/uiSlice';

export function HistoryRow({
  completedCount,
  onPress,
}: {
  completedCount: number;
  onPress: () => void;
}) {
  const theme = useEffectiveTheme();
  const c = themedColors(theme);
  const label = completedCount > 0 ? `History · ${completedCount} finished` : 'History';
  return (
    <TouchableOpacity
      testID="history-row"
      style={styles.button}
      onPress={onPress}
      activeOpacity={0.7}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      <Text style={[styles.label, { color: c.inkMuted }]}>{label}</Text>
      <CaretRight size={13} color={c.inkMuted} weight="bold" />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    alignSelf: 'flex-end',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xl,
    marginRight: spacing.lg,
    paddingVertical: spacing.sm,
  },
  label: { fontFamily: fonts.sansMedium, fontSize: fontSize.sm },
});
