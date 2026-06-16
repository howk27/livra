import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { themedColors } from '../theme/tokens';
import { spacing, fontSize, fontWeight, borderRadius } from '../theme/tokens';
import { useEffectiveTheme } from '../state/uiSlice';
import type { ReflectionTier } from '../lib/weeklyReflectionCopy';

const TIER_ACCENT: Record<ReflectionTier, string> = {
  strong: '#22c55e',
  solid: '#3b82f6',
  inconsistent: '#1C3830',
  missing: '#6b7280',
  first_week: '#a78bfa',
};

interface WeeklyReflectionCardProps {
  markName: string;
  tier: ReflectionTier;
  title: string;
  body: string;
}

export function WeeklyReflectionCard({ markName, tier, title, body }: WeeklyReflectionCardProps) {
  const theme = useEffectiveTheme();
  const c = themedColors(theme);
  const accent = TIER_ACCENT[tier];

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: c.surface,
          borderColor: c.borderMid,
          borderLeftColor: accent,
        },
      ]}
    >
      <Text style={[styles.markName, { color: c.inkMid }]}>
        {markName.toUpperCase()}
      </Text>
      <Text style={[styles.title, { color: c.inkDark }]}>{title}</Text>
      <Text style={[styles.body, { color: c.inkMid }]}>{body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderLeftWidth: 3,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  markName: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold, letterSpacing: 0.8 },
  title: { fontSize: fontSize.md, fontWeight: fontWeight.semibold },
  body: { fontSize: fontSize.sm, lineHeight: 20 },
});
