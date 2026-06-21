// components/goals/HistoryRow.tsx
// Always-visible entry to the free history surface (app/goal/history.tsx).
// Renders even with zero completions so "history & stats are free" is
// reachable in-app for new accounts (PRODUCT.md:436). No streaks, no Pro gate.
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { CaretRight } from 'phosphor-react-native';

import { fonts, fontSize, spacing, radius, themedColors } from '../../theme/tokens';
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
  const hint = completedCount > 0 ? `${completedCount} finished` : 'Nothing finished yet';
  return (
    <TouchableOpacity
      testID="history-row"
      style={[styles.row, { backgroundColor: c.surface }]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <View style={styles.textWrap}>
        <Text style={[styles.label, { color: c.inkMid }]}>History</Text>
        <Text style={[styles.hint, { color: c.inkMuted }]}>{hint}</Text>
      </View>
      <CaretRight size={16} color={c.inkMuted} weight="regular" />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    marginHorizontal: spacing.lg,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  textWrap: { gap: 2 },
  label: { fontFamily: fonts.sans, fontSize: fontSize.base },
  hint: { fontFamily: fonts.sans, fontSize: fontSize.sm },
});
