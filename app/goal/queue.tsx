import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  Modal,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { format, parseISO } from 'date-fns';
import { themedColors, spacing, fontSize, fontWeight, borderRadius } from '../../theme/tokens';
import { useEffectiveTheme } from '../../state/uiSlice';
import { useGoalsStore } from '../../state/goalsSlice';
import { useMarksStore } from '../../state/countersSlice';
import { MARK_LIBRARY_BY_ID } from '../../lib/suggestedCounters';
import type { Goal } from '../../types/goal';
import type { Mark } from '../../types';

function GoalMarkRow({ linkedMarkIds }: { linkedMarkIds?: string[] }) {
  const router = useRouter();
  const marks = useMarksStore(s => s.marks);
  const theme = useEffectiveTheme();
  const c = themedColors(theme);

  if (!linkedMarkIds || linkedMarkIds.length === 0) return null;

  const linkedMarks = linkedMarkIds
    .map(id => marks.find((m: Mark) => m.id === id))
    .filter(Boolean) as Mark[];

  if (linkedMarks.length === 0) return null;

  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
      {linkedMarks.map(mark => {
        const library = MARK_LIBRARY_BY_ID[(mark as any).icon ?? ''];
        const emoji = library?.emoji ?? mark.emoji ?? '📍';
        return (
          <TouchableOpacity
            key={mark.id}
            onPress={() => router.push(`/mark/${mark.id}` as any)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              paddingHorizontal: 8,
              paddingVertical: 4,
              borderRadius: 20,
              borderWidth: 1,
              borderColor: c.borderLight,
              backgroundColor: c.linen,
            }}
          >
            <Text style={{ fontSize: 12 }}>{emoji}</Text>
            <Text style={{ fontSize: 11, color: c.inkMuted, fontWeight: fontWeight.medium }}>
              {mark.name}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export default function GoalQueueScreen() {
  const theme = useEffectiveTheme();
  const c = themedColors(theme);
  const router = useRouter();
  const goals = useGoalsStore(s => s.goals);
  const completeGoal = useGoalsStore(s => s.completeGoal);
  const deleteGoal = useGoalsStore(s => s.deleteGoal);
  const updateGoalTargetDate = useGoalsStore(s => s.updateGoalTargetDate);
  const [showTargetPicker, setShowTargetPicker] = useState(false);
  const [targetPickerDate, setTargetPickerDate] = useState(new Date());

  const active = useMemo(() => goals.find(g => g.status === 'active'), [goals]);
  const queued = useMemo(
    () => goals.filter(g => g.status === 'queued').sort((a, b) => a.sort_index - b.sort_index),
    [goals],
  );
  const completed = useMemo(() => goals.filter(g => g.status === 'completed'), [goals]);

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

  const handleSaveTargetDate = async (date: Date) => {
    if (!active) return;
    await updateGoalTargetDate(active.id, format(date, 'yyyy-MM-dd'));
    setShowTargetPicker(false);
  };

  const handleOpenTargetPicker = () => {
    if (!active) return;
    const initial = active.target_date ? parseISO(active.target_date) : new Date();
    setTargetPickerDate(initial);
    setShowTargetPicker(true);
  };

  const handleClearTargetDate = async () => {
    if (!active) return;
    await updateGoalTargetDate(active.id, null);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: c.linen }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={c.inkDark} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: c.inkDark }]}>Goals</Text>
        <TouchableOpacity onPress={() => router.push('/goal/new')}>
          <Ionicons name="add" size={26} color={c.forest} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {active ? (
          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: c.inkMuted }]}>
              ACTIVE
            </Text>
            <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.forest }]}>
              <Text style={[styles.goalTitle, { color: c.inkDark }]}>{active.title}</Text>
              {active.description ? (
                <Text style={[styles.goalDesc, { color: c.inkMuted }]}>
                  {active.description}
                </Text>
              ) : null}
              <GoalMarkRow linkedMarkIds={active.linked_mark_ids} />
              {/* Target date row */}
              <TouchableOpacity
                style={[styles.targetDateRow, { borderTopColor: c.borderLight }]}
                onPress={handleOpenTargetPicker}
                activeOpacity={0.75}
              >
                <Text style={[styles.targetDateLabel, { color: c.inkMuted }]}>
                  Target date
                </Text>
                <Text style={[styles.targetDateValue, { color: active?.target_date ? c.inkDark : c.inkMuted }]}>
                  {active?.target_date
                    ? format(parseISO(active.target_date), 'MMM d, yyyy')
                    : 'Not set'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.completeBtn, { borderColor: c.forest }]}
                onPress={() => handleComplete(active)}
              >
                <Text style={[styles.completeBtnText, { color: c.forest }]}>
                  Mark complete
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={styles.section}>
            <Text style={[styles.emptyText, { color: c.inkMuted }]}>
              No active goal. Add one below.
            </Text>
          </View>
        )}

        {queued.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: c.inkMuted }]}>
              UP NEXT
            </Text>
            {queued.map(goal => (
              <View
                key={goal.id}
                style={[styles.card, { backgroundColor: c.surface, borderColor: c.borderLight }]}
              >
                <Text style={[styles.goalTitle, { color: c.inkDark }]}>{goal.title}</Text>
                {goal.description ? (
                  <Text style={[styles.goalDesc, { color: c.inkMuted }]}>
                    {goal.description}
                  </Text>
                ) : null}
                <GoalMarkRow linkedMarkIds={goal.linked_mark_ids} />
                <TouchableOpacity onPress={() => handleDelete(goal)} style={styles.deleteBtn}>
                  <Ionicons name="trash-outline" size={16} color={c.inkMuted} />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {completed.length > 0 && (
          <View style={styles.section}>
            <TouchableOpacity
              style={styles.completedToggle}
              onPress={() => router.push('/goal/history')}
            >
              <Text style={[styles.sectionLabel, { color: c.inkMuted }]}>
                COMPLETED ({completed.length})
              </Text>
              <Ionicons name="chevron-forward" size={14} color={c.inkMuted} />
            </TouchableOpacity>
          </View>
        )}

        {goals.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={[styles.emptyStateTitle, { color: c.inkDark }]}>
              No goals yet.
            </Text>
            <Text style={[styles.emptyStateMsg, { color: c.inkMuted }]}>
              Add your first goal. One at a time — until it's done.
            </Text>
            <TouchableOpacity
              style={[styles.addBtn, { backgroundColor: c.forest }]}
              onPress={() => router.push('/goal/new')}
            >
              <Text style={styles.addBtnText}>Add a goal</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      <Modal
        visible={showTargetPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowTargetPicker(false)}
      >
        <TouchableOpacity
          style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' }}
          activeOpacity={1}
          onPress={() => setShowTargetPicker(false)}
        >
          <TouchableOpacity
            style={{ backgroundColor: c.surface, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: spacing.xl }}
            activeOpacity={1}
          >
            <Text style={{ color: c.inkMuted, fontSize: fontSize.sm, fontWeight: fontWeight.medium, textTransform: 'uppercase', letterSpacing: 1, marginBottom: spacing.md }}>
              Target date
            </Text>
            {Platform.OS === 'ios' && (
              <>
                <DateTimePicker
                  value={targetPickerDate}
                  mode="date"
                  display="spinner"
                  minimumDate={new Date()}
                  onChange={(_, date) => { if (date) setTargetPickerDate(date); }}
                  style={{ width: '100%' }}
                />
                <TouchableOpacity
                  style={{ backgroundColor: c.forest, borderRadius: borderRadius.md, paddingVertical: spacing.md, alignItems: 'center', marginTop: spacing.md }}
                  onPress={() => handleSaveTargetDate(targetPickerDate)}
                >
                  <Text style={{ color: '#FFFFFF', fontSize: fontSize.md, fontWeight: fontWeight.semibold }}>
                    Set date
                  </Text>
                </TouchableOpacity>
              </>
            )}
            {active?.target_date && (
              <TouchableOpacity onPress={handleClearTargetDate} style={{ alignItems: 'center', marginTop: spacing.sm }}>
                <Text style={{ color: c.inkMuted, fontSize: fontSize.sm, textDecorationLine: 'underline' }}>
                  Clear target date
                </Text>
              </TouchableOpacity>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
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
  targetDateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: spacing.sm,
    marginTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  targetDateLabel: {
    fontSize: fontSize.sm,
  },
  targetDateValue: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
});
