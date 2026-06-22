import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  TextInput,
  Modal,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Svg, { Circle } from 'react-native-svg';
import DateTimePicker from '@react-native-community/datetimepicker';
import { format, parseISO } from 'date-fns';
import {
  X,
  PencilSimple,
  Check,
  Plus,
  Trash,
} from 'phosphor-react-native';
import { themedColors, spacing, fontSize, fontWeight, borderRadius, fonts } from '../../theme/tokens';
import { useEffectiveTheme } from '../../state/uiSlice';
import { useGoalsStore } from '../../state/goalsSlice';
import { useMarksStore } from '../../state/countersSlice';

const RING_SIZE = 120;
const STROKE = 10;
const RADIUS = (RING_SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function ProgressRing({ progress, threshold }: { progress: number; threshold: number }) {
  const theme = useEffectiveTheme();
  const c = themedColors(theme);
  const pct = threshold > 0 ? Math.min(1, progress / threshold) : 0;
  const strokeDashoffset = CIRCUMFERENCE * (1 - pct);

  return (
    <View style={{ alignItems: 'center', marginVertical: spacing.md }}>
      <Svg width={RING_SIZE} height={RING_SIZE}>
        <Circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RADIUS}
          stroke={c.borderLight}
          strokeWidth={STROKE}
          fill="none"
        />
        <Circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RADIUS}
          stroke={c.forest}
          strokeWidth={STROKE}
          fill="none"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          rotation="-90"
          origin={`${RING_SIZE / 2}, ${RING_SIZE / 2}`}
        />
      </Svg>
      <Text style={{ fontFamily: fonts.sansBold, fontSize: fontSize[22], color: c.forest, marginTop: spacing.xs }}>
        {progress}
      </Text>
      <Text style={{ fontFamily: fonts.sans, fontSize: fontSize.sm, color: c.forest, opacity: 0.7 }}>
        of {threshold}
      </Text>
    </View>
  );
}

export default function GoalDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const theme = useEffectiveTheme();
  const c = themedColors(theme);

  const goal = useGoalsStore(s => s.goals.find(g => g.id === id));
  const marks = useMarksStore(s => s.marks);
  const updateGoalTitle = useGoalsStore(s => s.updateGoalTitle);
  const updateGoalTargetDate = useGoalsStore(s => s.updateGoalTargetDate);
  const completeGoal = useGoalsStore(s => s.completeGoal);
  const deleteGoal = useGoalsStore(s => s.deleteGoal);
  const getGoalProgress = useGoalsStore(s => s.getGoalProgress);

  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(goal?.title ?? '');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [pickerDate, setPickerDate] = useState(new Date());

  const handleSaveTitle = useCallback(async () => {
    if (titleDraft.trim().length >= 3) {
      await updateGoalTitle(id!, titleDraft.trim());
    }
    setEditingTitle(false);
  }, [titleDraft, id, updateGoalTitle]);

  const linkedMarks = marks.filter(m => m.goal_id === id && !m.deleted_at);

  if (!goal) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.linen, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontFamily: fonts.sans, color: c.inkMuted }}>Goal not found.</Text>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: spacing.md }}>
          <Text style={{ fontFamily: fonts.sansMedium, color: c.forest }}>Go back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const { progress, threshold, canComplete } = getGoalProgress(id!);

  const handleOpenDatePicker = () => {
    const initial = goal.target_date ? parseISO(goal.target_date) : new Date();
    setPickerDate(initial);
    setShowDatePicker(true);
  };

  const handleSaveDate = async (date: Date) => {
    await updateGoalTargetDate(id!, format(date, 'yyyy-MM-dd'));
    setShowDatePicker(false);
  };

  const handleComplete = () => {
    Alert.alert(
      'Complete this goal?',
      `"${goal.title}" will move to your history.`,
      [
        { text: 'Not yet', style: 'cancel' },
        {
          text: "Done — it's mine",
          onPress: () => {
            completeGoal(id!).then(() => {
              router.back();
            }).catch(() => {
              Alert.alert('Error', 'Could not complete goal. Please try again.');
            });
          },
        },
      ],
    );
  };

  const handleDelete = () => {
    Alert.alert(
      'Remove this goal?',
      `"${goal.title}" will be permanently removed.`,
      [
        { text: 'Keep it', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            deleteGoal(id!).then(() => {
              router.back();
            }).catch(() => {
              Alert.alert('Error', 'Could not remove goal. Please try again.');
            });
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: c.linen }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <X size={22} color={c.inkDark} weight="bold" />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setEditingTitle(true)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <PencilSimple size={20} color={c.inkMuted} weight="duotone" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Title */}
        {editingTitle ? (
          <View style={styles.titleEditRow}>
            <TextInput
              style={[styles.titleInput, { color: c.inkDark, borderColor: c.borderMid, backgroundColor: c.surface }]}
              value={titleDraft}
              onChangeText={setTitleDraft}
              onBlur={handleSaveTitle}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleSaveTitle}
            />
            <TouchableOpacity onPress={handleSaveTitle} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Check size={22} color={c.forest} weight="bold" />
            </TouchableOpacity>
          </View>
        ) : (
          <Text style={[styles.title, { color: c.inkDark }]}>{goal.title}</Text>
        )}

        {/* Progress ring */}
        <ProgressRing progress={progress} threshold={threshold} />

        {/* Target date */}
        <TouchableOpacity
          style={[styles.card, { backgroundColor: c.surface, borderColor: c.borderLight }]}
          onPress={handleOpenDatePicker}
          activeOpacity={0.75}
        >
          <Text style={[styles.cardLabel, { color: c.inkMuted }]}>TARGET DATE</Text>
          <Text style={[styles.cardValue, { color: goal.target_date ? c.inkDark : c.inkMuted }]}>
            {goal.target_date ? format(parseISO(goal.target_date), 'MMM d, yyyy') : 'Not set'}
          </Text>
        </TouchableOpacity>

        {/* Linked marks */}
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: c.inkMuted }]}>YOUR MARKS</Text>
          {linkedMarks.length === 0 ? (
            <View style={[styles.emptyMarks, { backgroundColor: c.surface, borderColor: c.borderLight }]}>
              <Text style={[styles.emptyMarksText, { color: c.inkMuted }]}>
                No marks linked to this goal yet.
              </Text>
              <TouchableOpacity
                style={[styles.addMarkBtn, { backgroundColor: c.forest }]}
                onPress={() => router.push({ pathname: '/mark/new', params: { goalId: id } } as any)}
              >
                <Plus size={14} color={c.inkInverse} weight="bold" />
                <Text style={styles.addMarkBtnText}>Add a mark</Text>
              </TouchableOpacity>
            </View>
          ) : (
            linkedMarks.map(mark => (
              <TouchableOpacity
                key={mark.id}
                style={[styles.markRow, { backgroundColor: c.surface, borderColor: c.borderLight }]}
                onPress={() => router.push(`/mark/${mark.id}` as any)}
                activeOpacity={0.8}
              >
                <Text style={[styles.markEmoji, { fontSize: fontSize.xl }]}>{mark.emoji || '📌'}</Text>
                <Text style={[styles.markName, { color: c.inkDark }]}>{mark.name}</Text>
              </TouchableOpacity>
            ))
          )}
        </View>

        {/* Complete button */}
        {canComplete && (
          <TouchableOpacity
            style={[styles.completeBtn, { backgroundColor: c.forest }]}
            onPress={handleComplete}
          >
            <Text style={styles.completeBtnText}>Mark complete</Text>
          </TouchableOpacity>
        )}

        {/* Delete */}
        <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete}>
          <Trash size={16} color={c.inkMuted} weight="duotone" />
          <Text style={[styles.deleteBtnText, { color: c.inkMuted }]}>Remove goal</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Date picker — iOS bottom sheet */}
      {Platform.OS === 'ios' && (
        <Modal
          visible={showDatePicker}
          transparent
          animationType="slide"
          onRequestClose={() => setShowDatePicker(false)}
        >
          <TouchableOpacity
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={() => setShowDatePicker(false)}
          >
            <TouchableOpacity
              style={[styles.modalSheet, { backgroundColor: c.surface }]}
              activeOpacity={1}
            >
              <Text style={[styles.modalLabel, { color: c.inkMuted }]}>TARGET DATE</Text>
              <DateTimePicker
                value={pickerDate}
                mode="date"
                display="spinner"
                minimumDate={new Date()}
                onChange={(_, date) => { if (date) setPickerDate(date); }}
                style={{ width: '100%' }}
              />
              <TouchableOpacity
                style={[styles.dateSetBtn, { backgroundColor: c.forest }]}
                onPress={() => handleSaveDate(pickerDate)}
              >
                <Text style={styles.dateSetBtnText}>Set date</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
      )}

      {/* Date picker — Android native dialog */}
      {Platform.OS === 'android' && showDatePicker && (
        <DateTimePicker
          value={pickerDate}
          mode="date"
          display="default"
          minimumDate={new Date()}
          onChange={(event, date) => {
            setShowDatePicker(false);
            if (event.type === 'set' && date) {
              void handleSaveDate(date);
            }
          }}
        />
      )}
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
  content: { paddingHorizontal: spacing.md, paddingBottom: spacing.xl * 2 },
  title: { fontSize: fontSize['2xl'], fontFamily: fonts.serif, marginTop: spacing.sm },
  titleEditRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  titleInput: {
    flex: 1,
    fontSize: fontSize.xl,
    fontFamily: fonts.sans,
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  card: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  cardLabel: {
    fontSize: fontSize['2xs'],
    fontFamily: fonts.sansSemibold,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  cardValue: { fontSize: fontSize.md, fontFamily: fonts.sansMedium },
  section: { marginTop: spacing.md, gap: spacing.xs },
  sectionLabel: {
    fontSize: fontSize.xs,
    fontFamily: fonts.sansSemibold,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: spacing.xs,
  },
  emptyMarks: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    alignItems: 'center',
    gap: spacing.sm,
  },
  emptyMarksText: { fontSize: fontSize.sm, fontFamily: fonts.sans, textAlign: 'center' },
  addMarkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.md,
  },
  addMarkBtnText: { color: '#FFFFFF', fontSize: fontSize.sm, fontFamily: fonts.sansSemibold },
  markRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
  },
  markEmoji: {},
  markName: { fontSize: fontSize.md, fontFamily: fonts.sansMedium },
  completeBtn: {
    marginTop: spacing.lg,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  completeBtnText: { color: '#FFFFFF', fontSize: fontSize.md, fontFamily: fonts.sansSemibold },
  deleteBtn: {
    marginTop: spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
  },
  deleteBtnText: { fontSize: fontSize.sm, fontFamily: fonts.sans },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  modalSheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: spacing.xl,
  },
  modalLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.md,
  },
  dateSetBtn: {
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  dateSetBtnText: { color: '#FFFFFF', fontSize: fontSize.md, fontWeight: fontWeight.semibold },
});
