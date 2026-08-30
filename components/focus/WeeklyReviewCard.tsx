// components/focus/WeeklyReviewCard.tsx
// WR-3 — the one-line arrival card on Focus (spec 2026-08-29 §5). Sits in the
// banner slot; clears by viewing, never by a dismiss control. Ember, not
// amber: this is a warm status line (the ember role), not a warning. Text
// wears emberInk, the ember deep enough to carry small text on light chrome.
import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

import { borderRadius, fonts, fontSize, spacing, themedColors } from '../../theme/tokens';
import { useEffectiveTheme } from '../../state/uiSlice';
import { applyOpacity } from '../../src/components/icons/color';

export function WeeklyReviewCard({ line, onPress }: { line: string; onPress: () => void }) {
  const theme = useEffectiveTheme();
  const c = themedColors(theme);
  return (
    <Pressable
      testID="weekly-review-card"
      accessibilityRole="button"
      accessibilityLabel="Open your weekly review"
      onPress={onPress}
      style={({ pressed }) => [
        styles.wrap,
        {
          backgroundColor: applyOpacity(c.ember, theme === 'dark' ? 0.16 : 0.12),
          borderColor: applyOpacity(c.ember, theme === 'dark' ? 0.24 : 0.18),
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <Text style={[styles.text, { color: c.emberInk }]}>{line}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: borderRadius.card,
    borderWidth: 0.5,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    minHeight: 44,
    justifyContent: 'center',
  },
  text: {
    fontFamily: fonts.sansMedium,
    fontSize: fontSize.sm,
  },
});
