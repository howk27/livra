import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { spacing, fontSize, fontWeight, borderRadius } from '../../theme/tokens';
import { useEffectiveTheme } from '../../state/uiSlice';
import { useGoalsStore } from '../../state/goalsSlice';
import type { Goal } from '../../types/goal';

export default function GoalQueueScreen() {
  const theme = useEffectiveTheme();
  const themeColors = colors[theme];
  const router = useRouter();
  const goals = useGoalsStore(s => s.goals);
  const completeGoal = useGoalsStore(s => s.completeGoal);
  const deleteGoal = useGoalsStore(s => s.deleteGoal);
  const [showCompleted, setShowCompleted] = useState(false);

  const active = useMemo(() => goals.find(g => g.status === 'active'), [goals]);
  const queued = useMemo(
    () => goals.filter(g => g.status === 'queued').sort((a, b) => a.sort_index - b.sort_index),
    [goals],
  );
  const completed = useMemo(
    () =>
      goals
        .filter(g => g.status === 'completed')
        .sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? '')),
    [goals],
  );

  const handleComplete = (goal: Goal) => {
    Alert.alert(
      'Mark goal complete?',
      `"${goal.title}" will move to your history. The next goal in queue becomes active.`,
      [
        { text: 'Not yet', style: 'cancel' },
        {
          text: "Done — it's mine",
          onPress: () => {
            completeGoal(goal.id)
              .then(() => {
                router.push({ pathname: '/goal/complete', params: { goalTitle: goal.title } });
              })
              .catch(() => {
                Alert.alert('Error', 'Could not complete goal. Please try again.');
              });
          },
        },
      ],
    );
  };

  const handleDelete = (goal: Goal) => {
    Alert.alert(
      'Remove goal?',
      `"${goal.title}" will be removed from your queue.`,
      [
        { text: 'Keep it', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            deleteGoal(goal.id).catch(() => {
              Alert.alert('Error', 'Could not remove goal. Please try again.');
            });
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={themeColors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: themeColors.text }]}>Goals</Text>
        <TouchableOpacity onPress={() => router.push('/goal/new')}>
          <Ionicons name="add" size={26} color={themeColors.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {active ? (
          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: themeColors.textSecondary }]}>
              ACTIVE
            </Text>
            <View style={[styles.card, { backgroundColor: themeColors.surface, borderColor: themeColors.primary }]}>
              <Text style={[styles.goalTitle, { color: themeColors.text }]}>{active.title}</Text>
              {active.description ? (
                <Text style={[styles.goalDesc, { color: themeColors.textSecondary }]}>
                  {active.description}
                </Text>
              ) : null}
              <TouchableOpacity
                style={[styles.completeBtn, { borderColor: themeColors.primary }]}
                onPress={() => handleComplete(active)}
              >
                <Text style={[styles.completeBtnText, { color: themeColors.primary }]}>
                  Mark complete
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={styles.section}>
            <Text style={[styles.emptyText, { color: themeColors.textSecondary }]}>
              No active goal. Add one below.
            </Text>
          </View>
        )}

        {queued.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: themeColors.textSecondary }]}>
              UP NEXT
            </Text>
            {queued.map(goal => (
              <View
                key={goal.id}
                style={[styles.card, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}
              >
                <Text style={[styles.goalTitle, { color: themeColors.text }]}>{goal.title}</Text>
                {goal.description ? (
                  <Text style={[styles.goalDesc, { color: themeColors.textSecondary }]}>
                    {goal.description}
                  </Text>
                ) : null}
                <TouchableOpacity onPress={() => handleDelete(goal)} style={styles.deleteBtn}>
                  <Ionicons name="trash-outline" size={16} color={themeColors.textSecondary} />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {completed.length > 0 && (
          <View style={styles.section}>
            <TouchableOpacity
              style={styles.completedToggle}
              onPress={() => setShowCompleted(v => !v)}
            >
              <Text style={[styles.sectionLabel, { color: themeColors.textSecondary }]}>
                COMPLETED ({completed.length})
              </Text>
              <Ionicons
                name={showCompleted ? 'chevron-up' : 'chevron-down'}
                size={14}
                color={themeColors.textSecondary}
              />
            </TouchableOpacity>
            {showCompleted &&
              completed.map(goal => (
                <View
                  key={goal.id}
                  style={[styles.card, { backgroundColor: themeColors.surface, borderColor: themeColors.border, opacity: 0.6 }]}
                >
                  <Text style={[styles.goalTitle, { color: themeColors.text }]}>
                    ✓ {goal.title}
                  </Text>
                </View>
              ))}
          </View>
        )}

        {goals.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={[styles.emptyStateTitle, { color: themeColors.text }]}>
              No goals yet.
            </Text>
            <Text style={[styles.emptyStateMsg, { color: themeColors.textSecondary }]}>
              Add your first goal. One at a time — until it's done.
            </Text>
            <TouchableOpacity
              style={[styles.addBtn, { backgroundColor: themeColors.primary }]}
              onPress={() => router.push('/goal/new')}
            >
              <Text style={styles.addBtnText}>Add a goal</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  headerTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.semibold },
  content: { paddingHorizontal: spacing.md, paddingBottom: spacing.xl },
  section: { marginTop: spacing.lg, gap: spacing.sm },
  sectionLabel: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold, letterSpacing: 1 },
  card: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    gap: spacing.xs,
  },
  goalTitle: { fontSize: fontSize.md, fontWeight: fontWeight.semibold },
  goalDesc: { fontSize: fontSize.sm },
  completeBtn: {
    marginTop: spacing.sm,
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.xs,
    alignItems: 'center',
  },
  completeBtnText: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold },
  deleteBtn: { position: 'absolute', top: spacing.sm, right: spacing.sm },
  completedToggle: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  emptyText: { fontSize: fontSize.md, textAlign: 'center', marginTop: spacing.xl },
  emptyState: { alignItems: 'center', marginTop: spacing.xl, gap: spacing.md },
  emptyStateTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.semibold },
  emptyStateMsg: { fontSize: fontSize.md, textAlign: 'center', maxWidth: 280 },
  addBtn: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: borderRadius.lg },
  addBtnText: { color: '#FFFFFF', fontWeight: fontWeight.semibold, fontSize: fontSize.md },
});
