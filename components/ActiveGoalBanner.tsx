import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { spacing, fontSize, fontWeight, borderRadius } from '../theme/tokens';
import { useEffectiveTheme } from '../state/uiSlice';
import { useGoalsStore } from '../state/goalsSlice';

export function ActiveGoalBanner() {
  const theme = useEffectiveTheme();
  const themeColors = colors[theme];
  const router = useRouter();
  const goals = useGoalsStore(s => s.goals);
  const activeGoal = goals.find(g => g.status === 'active');

  if (!activeGoal) {
    return (
      <TouchableOpacity
        style={[styles.emptyBanner, { borderColor: themeColors.border }]}
        onPress={() => router.push('/goal/new')}
      >
        <Text style={[styles.emptyText, { color: themeColors.textSecondary }]}>
          Add a goal to get started →
        </Text>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      style={[styles.banner, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}
      onPress={() => router.push('/goal/queue')}
      activeOpacity={0.75}
    >
      <View style={styles.bannerLeft}>
        <Text style={[styles.bannerLabel, { color: themeColors.textSecondary }]}>Working toward</Text>
        <Text style={[styles.bannerTitle, { color: themeColors.text }]} numberOfLines={1}>
          {activeGoal.title}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={themeColors.textSecondary} />
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
