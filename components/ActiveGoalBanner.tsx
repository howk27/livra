import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { CaretRight } from 'phosphor-react-native';
import { themedColors } from '../theme/tokens';
import { spacing, fontSize, fontWeight, borderRadius } from '../theme/tokens';
import { useEffectiveTheme } from '../state/uiSlice';
import { useGoalsStore } from '../state/goalsSlice';

export function ActiveGoalBanner() {
  const theme = useEffectiveTheme();
  const themeColors = themedColors(theme);
  const router = useRouter();
  const goals = useGoalsStore(s => s.goals);
  const loading = useGoalsStore(s => s.isLoading);
  const activeGoal = goals.find(g => g.status === 'active');

  if (loading) return null;

  if (!activeGoal) {
    return (
      <TouchableOpacity
        style={[styles.emptyBanner, { borderColor: themeColors.borderMid }]}
        onPress={() => router.push('/goal/new')}
        activeOpacity={0.75}
      >
        <Text style={[styles.emptyText, { color: themeColors.inkMid }]}>
          Add a goal to get started →
        </Text>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      style={[styles.banner, { backgroundColor: themeColors.surface, borderColor: themeColors.borderMid }]}
      onPress={() => router.push('/goal/queue')}
      activeOpacity={0.75}
    >
      <View style={styles.bannerLeft}>
        <Text style={[styles.bannerLabel, { color: themeColors.inkMid }]}>Working toward</Text>
        <Text style={[styles.bannerTitle, { color: themeColors.inkDark }]} numberOfLines={1}>
          {activeGoal.title}
        </Text>
      </View>
      <CaretRight size={16} color={themeColors.inkMid} weight="bold" />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
    marginHorizontal: spacing.lg,
  },
  bannerLeft: { flex: 1, gap: 2 },
  bannerLabel: { fontSize: fontSize.xs, fontWeight: fontWeight.medium, letterSpacing: 0.5 },
  bannerTitle: { fontSize: fontSize.md, fontWeight: fontWeight.semibold },
  emptyBanner: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    marginBottom: spacing.sm,
    marginHorizontal: spacing.lg,
  },
  emptyText: { fontSize: fontSize.sm },
});
