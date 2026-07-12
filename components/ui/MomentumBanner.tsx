// components/ui/MomentumBanner.tsx
// Calm amber at-risk strip for the focus screen. Generic (no goal names),
// dismissable for the day. Never alarm-red, no flame, no countdown.
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

import { fonts, fontSize, spacing, borderRadius, themedColors } from '../../theme/tokens';
import { useEffectiveTheme } from '../../state/uiSlice';
import { applyOpacity } from '../../src/components/icons/color';

export function MomentumBanner({ text, onDismiss }: { text: string; onDismiss: () => void }) {
  const theme = useEffectiveTheme();
  const c = themedColors(theme);
  return (
    <View
      testID="momentum-banner"
      style={[
        styles.wrap,
        {
          backgroundColor: applyOpacity(c.momentumAmber, theme === 'dark' ? 0.16 : 0.12),
          borderColor: applyOpacity(c.momentumAmber, theme === 'dark' ? 0.24 : 0.18),
        },
      ]}
    >
      <Text style={[styles.text, { color: c.momentumAmber }]}>{text}</Text>
      <TouchableOpacity
        testID="momentum-banner-dismiss"
        onPress={onDismiss}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        accessibilityLabel="Dismiss"
      >
        <Text style={[styles.dismiss, { color: c.momentumAmber }]}>Dismiss</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    borderRadius: borderRadius.card,
    borderWidth: 0.5,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  text: {
    flex: 1,
    fontFamily: fonts.sansMedium,
    fontSize: fontSize.sm,
  },
  dismiss: {
    fontFamily: fonts.sansMedium,
    fontSize: fontSize.sm,
  },
});
