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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Flag,
  CheckCircle,
  Clock,
  Plus,
  Trash,
  CaretRight,
} from 'phosphor-react-native';
import { colors } from '../../theme/colors';
import { spacing, borderRadius, fontSize, fontWeight } from '../../theme/tokens';
import { useEffectiveTheme } from '../../state/uiSlice';
import { useGoalsStore } from '../../state/goalsSlice';
import type { Goal } from '../../types/goal';
import { format, parseISO } from 'date-fns';

const ACCENT = '#FEB729';

export default function QueueScreen() {
  const theme = useEffectiveTheme();
  const themeColors = colors[theme];
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const goals = useGoalsStore(s => s.goals);
  const completeGoal = useGoalsStore(s => s.completeGoal);
  const deleteGoal = useGoalsStore(s => s.deleteGoal);

  const active = useMemo(() => goals.find(g => g.status === 'active'), [goals]);
  const queued = useMemo(
    () => goals.filter(g => g.status === 'queued').sort((a, b) => a.sort_index - b.sort_index),
    [goals],
  );
  const completed = useMemo(() => goals.filter(g => g.status === 'completed'), [goals]);
  const [showCompleted, setShowCompleted] = useState(false);

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
                router.push({ pathname: '/goal/complete', params: { goalTitle: goal.title, goalId: goal.id } });
              })
              .catch(() => Alert.alert('Error', 'Could not complete goal. Please try again.'));
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
            deleteGoal(goal.id).catch(() => Alert.alert('Error', 'Could not remove goal. Please try again.'));
          },
        },
      ],
    );
  };

  const formatTargetDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return 'No deadline set';
    try {
      return format(parseISO(dateStr), 'MMM d, yyyy');
    } catch {
      return 'No deadline set';
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: themeColors.text }]}>Your goals</Text>
        <TouchableOpacity
          style={[styles.addBtn, { backgroundColor: ACCENT }]}
          onPress={() => router.push('/goal/new')}
          activeOpacity={0.8}
        >
          <Plus size={18} color="#111111" weight="bold" />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: 80 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Active goal */}
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: themeColors.textTertiary }]}>ACTIVE</Text>
          {active ? (
            <View style={[styles.activeCard, { backgroundColor: themeColors.surface, borderLeftColor: ACCENT }]}>
              <View style={styles.activeCardTop}>
                <Text style={[styles.activeTitle, { color: themeColors.text }]} numberOfLines={2}>
                  {active.title}
                </Text>
                <View style={[styles.activeBadge, { backgroundColor: ACCENT }]}>
                  <Text style={styles.activeBadgeText}>Active</Text>
                </View>
              </View>

              {active.description ? (
                <Text style={[styles.activeDesc, { color: themeColors.textSecondary }]} numberOfLines={2}>
                  {active.description}
                </Text>
              ) : null}

              <View style={styles.activeFooter}>
                <View style={styles.dateRow}>
                  <Clock size={14} color={themeColors.textSecondary} weight="regular" />
                  <Text style={[styles.dateText, { color: themeColors.textSecondary }]}>
                    {formatTargetDate(active.target_date)}
                  </Text>
                </View>
                <TouchableOpacity
                  style={[styles.completeBtn, { backgroundColor: themeColors.surfaceVariant }]}
                  onPress={() => handleComplete(active)}
                  activeOpacity={0.8}
                >
                  <CheckCircle size={16} color={themeColors.textSecondary} weight="regular" />
                  <Text style={[styles.completeBtnText, { color: themeColors.textSecondary }]}>Done</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.emptyActiveCard, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}
              onPress={() => router.push('/goal/new')}
              activeOpacity={0.8}
            >
              <Plus size={20} color={themeColors.textSecondary} weight="regular" />
              <Text style={[styles.emptyActiveText, { color: themeColors.textSecondary }]}>
                Add your first goal
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Queued goals */}
        {queued.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: themeColors.textTertiary }]}>WAITING</Text>
            {queued.map((goal) => (
              <View key={goal.id} style={[styles.queueCard, { backgroundColor: themeColors.surface }]}>
                <View style={styles.queueCardLeft}>
                  <Text style={[styles.queueTitle, { color: themeColors.text }]} numberOfLines={1}>
                    {goal.title}
                  </Text>
                  <Text style={[styles.queueMeta, { color: themeColors.textSecondary }]}>
                    Waiting
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.deleteBtn}
                  onPress={() => handleDelete(goal)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Trash size={16} color={themeColors.textTertiary} weight="regular" />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {/* Completed goals */}
        {completed.length > 0 && (
          <View style={styles.section}>
            <TouchableOpacity
              style={styles.completedHeader}
              onPress={() => setShowCompleted(v => !v)}
              activeOpacity={0.7}
            >
              <Text style={[styles.sectionLabel, { color: themeColors.textTertiary }]}>
                COMPLETED · {completed.length}
              </Text>
              <CaretRight
                size={12}
                color={themeColors.textTertiary}
                weight="bold"
                style={{ transform: [{ rotate: showCompleted ? '90deg' : '0deg' }] }}
              />
            </TouchableOpacity>

            {showCompleted && completed.map((goal) => (
              <View
                key={goal.id}
                style={[styles.completedCard, { backgroundColor: themeColors.surface }]}
              >
                <Text
                  style={[styles.completedTitle, { color: themeColors.textSecondary }]}
                  numberOfLines={1}
                >
                  {goal.title}
                </Text>
                {goal.completed_at ? (
                  <Text style={[styles.completedDate, { color: themeColors.textTertiary }]}>
                    {format(parseISO(goal.completed_at), 'MMM d, yyyy')}
                  </Text>
                ) : null}
              </View>
            ))}
          </View>
        )}

        {/* Empty state */}
        {!active && queued.length === 0 && completed.length === 0 && (
          <View style={styles.emptyState}>
            <Flag size={36} color={themeColors.textTertiary} weight="thin" />
            <Text style={[styles.emptyTitle, { color: themeColors.textSecondary }]}>
              Nothing waiting.
            </Text>
            <Text style={[styles.emptyBody, { color: themeColors.textTertiary }]}>
              Set your next goal when you're ready.
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: fontWeight.bold,
    fontFamily: 'Satoshi',
    letterSpacing: -0.5,
  },
  addBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    paddingHorizontal: spacing.lg,
  },
  section: {
    marginBottom: spacing.xl,
  },
  sectionLabel: {
    fontSize: 11,
    fontFamily: 'Inter',
    fontWeight: fontWeight.semibold,
    letterSpacing: 1.5,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
  },
  activeCard: {
    borderRadius: borderRadius.card,
    borderLeftWidth: 3,
    padding: spacing.lg,
    gap: spacing.md,
  },
  activeCardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  activeTitle: {
    flex: 1,
    fontSize: 20,
    fontFamily: 'Satoshi',
    fontWeight: fontWeight.bold,
    lineHeight: 26,
  },
  activeBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: borderRadius.full,
  },
  activeBadgeText: {
    fontSize: 11,
    fontFamily: 'Inter',
    fontWeight: fontWeight.semibold,
    color: '#111111',
    letterSpacing: 0.3,
  },
  activeDesc: {
    fontSize: 14,
    fontFamily: 'Inter',
    lineHeight: 20,
  },
  activeFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  dateText: {
    fontSize: 12,
    fontFamily: 'Inter',
  },
  completeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
  },
  completeBtnText: {
    fontSize: 13,
    fontFamily: 'Inter',
    fontWeight: fontWeight.medium,
  },
  emptyActiveCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: borderRadius.card,
    borderWidth: 1,
    borderStyle: 'dashed',
    paddingVertical: spacing.xl,
  },
  emptyActiveText: {
    fontSize: 15,
    fontFamily: 'Inter',
  },
  queueCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: borderRadius.card,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    marginBottom: spacing.sm,
  },
  queueCardLeft: {
    flex: 1,
    gap: 2,
  },
  queueTitle: {
    fontSize: 15,
    fontFamily: 'Satoshi',
    fontWeight: fontWeight.medium,
  },
  queueMeta: {
    fontSize: 12,
    fontFamily: 'Inter',
  },
  deleteBtn: {
    padding: spacing.xs,
  },
  completedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  completedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: borderRadius.card,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    marginBottom: spacing.sm,
    opacity: 0.55,
  },
  completedTitle: {
    flex: 1,
    fontSize: 15,
    fontFamily: 'Satoshi',
    textDecorationLine: 'line-through',
  },
  completedDate: {
    fontSize: 11,
    fontFamily: 'Inter',
  },
  emptyState: {
    alignItems: 'center',
    paddingTop: spacing['4xl'],
    gap: spacing.md,
  },
  emptyTitle: {
    fontSize: 17,
    fontFamily: 'Satoshi',
    fontWeight: fontWeight.semibold,
  },
  emptyBody: {
    fontSize: 14,
    fontFamily: 'Inter',
    textAlign: 'center',
    lineHeight: 20,
  },
});
