import React, { useState, useMemo, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  FlatList,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import Svg, { Circle } from 'react-native-svg';
import {
  Flag,
  CheckCircle,
  Clock,
  Plus,
  Trash,
  ArrowUp,
  ArrowDown,
  X,
  CaretRight,
  Link,
  PencilSimple,
} from 'phosphor-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '../../theme/colors';
import { spacing, borderRadius, fontSize, fontWeight } from '../../theme/tokens';
import { useEffectiveTheme } from '../../state/uiSlice';
import { useGoalsStore } from '../../state/goalsSlice';
import { useMarksStore } from '../../state/countersSlice';
import { useAuth } from '../../hooks/useAuth';
import { useIapSubscriptions } from '../../hooks/useIapSubscriptions';
import type { Goal } from '../../types/goal';
import type { Mark } from '../../types';
import { format, parseISO } from 'date-fns';
import { progressPercent } from '../../lib/goalLogic';
import { v4 as uuidv4 } from 'uuid';

const ACCENT = '#FEB729';
const CARD_COLORS = ['#3DDC97', '#FF9F43', '#A29BFE', '#74B9FF', '#FD79A8'];
const CARD_GRADIENTS: [string, string][] = [
  ['#2BCFAA', '#1A9E82'],
  ['#FF9F43', '#E17020'],
  ['#A29BFE', '#6C5CE7'],
  ['#74B9FF', '#4A90D9'],
  ['#FD79A8', '#D63087'],
];

function getCardGradient(goal: Goal, index: number): [string, string] {
  if (goal.color) {
    const c = goal.color;
    return [c, c + 'CC'];
  }
  return CARD_GRADIENTS[index % CARD_GRADIENTS.length];
}

// ── Circular Progress Ring ────────────────────────────────────────────────────

function CircularProgress({
  percent,
  size = 72,
  strokeWidth = 6,
  trackColor = 'rgba(255,255,255,0.25)',
  progressColor = '#fff',
}: {
  percent: number;
  size?: number;
  strokeWidth?: number;
  trackColor?: string;
  progressColor?: string;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const filled = (percent / 100) * circumference;

  return (
    <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke={trackColor}
        strokeWidth={strokeWidth}
        fill="none"
      />
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke={progressColor}
        strokeWidth={strokeWidth}
        fill="none"
        strokeDasharray={`${filled} ${circumference - filled}`}
        strokeLinecap="round"
      />
    </Svg>
  );
}

// ── Hero Card ─────────────────────────────────────────────────────────────────

function HeroCard({
  goal,
  onComplete,
  onOpenDetail,
}: {
  goal: Goal;
  onComplete: () => void;
  onOpenDetail: () => void;
}) {
  const pct = progressPercent(goal);

  return (
    <LinearGradient
      colors={getCardGradient(goal, 0)}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.heroCard}
    >
      <View style={styles.heroHeader}>
        <View>
          <Text style={styles.heroLabel}>NEXT IN LINE</Text>
          <Text style={styles.heroSequence}>Sequence 01</Text>
        </View>
        <TouchableOpacity onPress={onOpenDetail} style={styles.heroDetailBtn} activeOpacity={0.75}>
          <Plus size={16} color="#fff" weight="bold" />
        </TouchableOpacity>
      </View>

      <View style={styles.heroBody}>
        <View style={styles.heroTextBlock}>
          {goal.icon ? (
            <Text style={styles.heroIcon}>{goal.icon}</Text>
          ) : (
            <Flag size={28} color="rgba(255,255,255,0.85)" weight="fill" />
          )}
          <Text style={styles.heroTitle} numberOfLines={2}>
            {goal.title}
          </Text>
          {goal.description ? (
            <Text style={styles.heroDesc} numberOfLines={2}>
              {goal.description}
            </Text>
          ) : null}
        </View>

        <View style={styles.heroProgressBlock}>
          <CircularProgress percent={pct} size={80} strokeWidth={6} />
          <Text style={styles.heroProgressLabel}>{pct}%</Text>
        </View>
      </View>

      <View style={styles.heroFooter}>
        {goal.target_mark_count ? (
          <Text style={styles.heroCountText}>
            {goal.current_mark_count} / {goal.target_mark_count} marks
          </Text>
        ) : null}
        <TouchableOpacity
          onPress={onComplete}
          style={styles.heroDoneBtn}
          activeOpacity={0.75}
        >
          <CheckCircle size={14} color="#fff" weight="regular" />
          <Text style={styles.heroDoneBtnText}>Mark Done</Text>
        </TouchableOpacity>
      </View>
    </LinearGradient>
  );
}

// ── Queue Card ────────────────────────────────────────────────────────────────

function QueueCard({
  goal,
  position,
  totalQueued,
  onDelete,
  onOpenDetail,
  onMoveUp,
  onMoveDown,
}: {
  goal: Goal;
  position: number;
  totalQueued: number;
  onDelete: () => void;
  onOpenDetail: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const gradient = getCardGradient(goal, position);
  const deadline = goal.deadline_date ?? goal.target_date;
  const deadlineStr = deadline
    ? `By ${format(parseISO(deadline), 'MMM d, yyyy')}`
    : 'No deadline';

  return (
    <View style={styles.queueCard}>
      <LinearGradient
        colors={gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.queueCardAccent}
      />
      <View style={styles.queueCardContent}>
        <View style={styles.queueCardLeft}>
          <View style={styles.queueSeqBadge}>
            <Text style={styles.queueSeqText}>{String(position + 2).padStart(2, '0')}</Text>
          </View>
          <View style={styles.queueCardInfo}>
            <Text style={styles.queueCardTitle} numberOfLines={1}>
              {goal.icon ? `${goal.icon} ` : ''}{goal.title}
            </Text>
            <View style={styles.queueCardMeta}>
              <Clock size={11} color="rgba(255,255,255,0.7)" />
              <Text style={styles.queueCardMetaText}>{deadlineStr}</Text>
            </View>
          </View>
        </View>
        <View style={styles.queueCardActions}>
          <TouchableOpacity
            onPress={onMoveUp}
            disabled={position === 0}
            style={[styles.reorderBtn, position === 0 && styles.reorderBtnDisabled]}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <ArrowUp size={14} color={position === 0 ? 'rgba(255,255,255,0.3)' : '#fff'} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onMoveDown}
            disabled={position === totalQueued - 1}
            style={[styles.reorderBtn, position === totalQueued - 1 && styles.reorderBtnDisabled]}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <ArrowDown size={14} color={position === totalQueued - 1 ? 'rgba(255,255,255,0.3)' : '#fff'} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onOpenDetail}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <PencilSimple size={14} color="rgba(255,255,255,0.85)" />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onDelete}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <Trash size={14} color="rgba(255,255,255,0.75)" />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

// ── Mark Picker Row ───────────────────────────────────────────────────────────

function MarkPickerRow({
  mark,
  selected,
  onToggle,
}: {
  mark: Mark;
  selected: boolean;
  onToggle: () => void;
}) {
  const theme = useEffectiveTheme();
  const themeColors = colors[theme];
  return (
    <TouchableOpacity
      style={[styles.markPickerRow, selected && { backgroundColor: themeColors.surfaceVariant }]}
      onPress={onToggle}
      activeOpacity={0.7}
    >
      <Text style={[styles.markPickerEmoji]}>{mark.emoji ?? '📌'}</Text>
      <Text style={[styles.markPickerName, { color: themeColors.text }]} numberOfLines={1}>
        {mark.name}
      </Text>
      {selected && <CheckCircle size={16} color={ACCENT} weight="fill" />}
    </TouchableOpacity>
  );
}

// ── Goal Creation / Edit Sheet ────────────────────────────────────────────────

function GoalSheet({
  visible,
  initialGoal,
  marks,
  onClose,
  onSave,
}: {
  visible: boolean;
  initialGoal?: Goal | null;
  marks: Mark[];
  onClose: () => void;
  onSave: (data: Partial<Goal>) => void;
}) {
  const theme = useEffectiveTheme();
  const themeColors = colors[theme];
  const slideY = useSharedValue(600);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState('');
  const [targetCount, setTargetCount] = useState('');
  const [selectedMarkIds, setSelectedMarkIds] = useState<string[]>([]);

  React.useEffect(() => {
    if (visible) {
      slideY.value = withSpring(0, { damping: 22, stiffness: 280 });
      if (initialGoal) {
        setTitle(initialGoal.title);
        setDescription(initialGoal.description ?? '');
        setIcon(initialGoal.icon ?? '');
        setTargetCount(initialGoal.target_mark_count?.toString() ?? '');
        setSelectedMarkIds(initialGoal.linked_mark_ids ?? []);
      } else {
        setTitle('');
        setDescription('');
        setIcon('');
        setTargetCount('');
        setSelectedMarkIds([]);
      }
    } else {
      slideY.value = withTiming(600, { duration: 220 });
    }
  }, [visible, initialGoal]);

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: slideY.value }],
  }));

  const handleSave = () => {
    if (!title.trim()) return;
    onSave({
      title: title.trim(),
      description: description.trim() || undefined,
      icon: icon.trim() || undefined,
      target_mark_count: targetCount ? parseInt(targetCount, 10) : null,
      linked_mark_ids: selectedMarkIds,
    });
    onClose();
  };

  const toggleMark = (id: string) => {
    setSelectedMarkIds(prev =>
      prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.sheetOverlay}
      >
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} activeOpacity={1} />
        <Animated.View style={[styles.sheet, { backgroundColor: themeColors.surface }, sheetStyle]}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <Text style={[styles.sheetTitle, { color: themeColors.text }]}>
              {initialGoal ? 'Edit Goal' : 'New Goal'}
            </Text>
            <TouchableOpacity onPress={onClose}>
              <X size={20} color={themeColors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.sheetBody} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <Text style={[styles.fieldLabel, { color: themeColors.textSecondary }]}>Goal title *</Text>
            <TextInput
              style={[styles.textInput, { color: themeColors.text, borderColor: themeColors.border, backgroundColor: themeColors.background }]}
              placeholder="e.g. Run a 5K"
              placeholderTextColor={themeColors.textTertiary}
              value={title}
              onChangeText={setTitle}
              autoFocus={!initialGoal}
              maxLength={80}
            />

            <Text style={[styles.fieldLabel, { color: themeColors.textSecondary }]}>Description</Text>
            <TextInput
              style={[styles.textInput, styles.textInputMulti, { color: themeColors.text, borderColor: themeColors.border, backgroundColor: themeColors.background }]}
              placeholder="What does achieving this look like?"
              placeholderTextColor={themeColors.textTertiary}
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={3}
              maxLength={200}
            />

            <View style={styles.fieldRow}>
              <View style={{ flex: 1, marginRight: spacing.sm }}>
                <Text style={[styles.fieldLabel, { color: themeColors.textSecondary }]}>Icon (emoji)</Text>
                <TextInput
                  style={[styles.textInput, { color: themeColors.text, borderColor: themeColors.border, backgroundColor: themeColors.background }]}
                  placeholder="🎯"
                  placeholderTextColor={themeColors.textTertiary}
                  value={icon}
                  onChangeText={setIcon}
                  maxLength={4}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.fieldLabel, { color: themeColors.textSecondary }]}>Mark target</Text>
                <TextInput
                  style={[styles.textInput, { color: themeColors.text, borderColor: themeColors.border, backgroundColor: themeColors.background }]}
                  placeholder="e.g. 30"
                  placeholderTextColor={themeColors.textTertiary}
                  value={targetCount}
                  onChangeText={t => setTargetCount(t.replace(/[^0-9]/g, ''))}
                  keyboardType="numeric"
                  maxLength={6}
                />
              </View>
            </View>

            {marks.length > 0 && (
              <>
                <View style={styles.linkMarksHeader}>
                  <Link size={14} color={themeColors.textSecondary} />
                  <Text style={[styles.fieldLabel, { color: themeColors.textSecondary, marginBottom: 0 }]}>
                    Linked marks
                  </Text>
                </View>
                <Text style={[styles.fieldHint, { color: themeColors.textTertiary }]}>
                  Logging these marks will count toward this goal
                </Text>
                {marks.filter(m => !m.deleted_at).map(mark => (
                  <MarkPickerRow
                    key={mark.id}
                    mark={mark}
                    selected={selectedMarkIds.includes(mark.id)}
                    onToggle={() => toggleMark(mark.id)}
                  />
                ))}
              </>
            )}

            <View style={{ height: spacing['3xl'] }} />
          </ScrollView>

          <View style={[styles.sheetFooter, { borderTopColor: themeColors.border }]}>
            <TouchableOpacity
              style={[styles.saveBtn, { backgroundColor: ACCENT, opacity: title.trim() ? 1 : 0.5 }]}
              onPress={handleSave}
              disabled={!title.trim()}
              activeOpacity={0.8}
            >
              <Text style={styles.saveBtnText}>{initialGoal ? 'Save changes' : 'Add goal'}</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Goal Detail Sheet ─────────────────────────────────────────────────────────

function GoalDetailSheet({
  visible,
  goal,
  marks,
  onClose,
  onEdit,
  onDelete,
  onComplete,
}: {
  visible: boolean;
  goal: Goal | null;
  marks: Mark[];
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onComplete: () => void;
}) {
  const theme = useEffectiveTheme();
  const themeColors = colors[theme];
  if (!goal) return null;

  const linkedMarks = marks.filter(m => goal.linked_mark_ids?.includes(m.id));
  const pct = progressPercent(goal);
  const deadline = goal.deadline_date ?? goal.target_date;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={[styles.sheetOverlay]}>
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} activeOpacity={1} />
        <View style={[styles.sheet, { backgroundColor: themeColors.surface }]}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <Text style={[styles.sheetTitle, { color: themeColors.text }]} numberOfLines={1}>
              {goal.icon ? `${goal.icon} ` : ''}{goal.title}
            </Text>
            <TouchableOpacity onPress={onClose}>
              <X size={20} color={themeColors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.sheetBody} showsVerticalScrollIndicator={false}>
            {/* Progress */}
            <View style={styles.detailProgressRow}>
              <CircularProgress
                percent={pct}
                size={64}
                strokeWidth={5}
                trackColor={themeColors.border}
                progressColor={ACCENT}
              />
              <View style={{ marginLeft: spacing.md }}>
                <Text style={[styles.detailProgressPct, { color: themeColors.text }]}>{pct}%</Text>
                {goal.target_mark_count ? (
                  <Text style={[styles.detailProgressSub, { color: themeColors.textSecondary }]}>
                    {goal.current_mark_count} / {goal.target_mark_count} marks
                  </Text>
                ) : (
                  <Text style={[styles.detailProgressSub, { color: themeColors.textTertiary }]}>
                    No mark target set
                  </Text>
                )}
              </View>
            </View>

            {goal.description ? (
              <Text style={[styles.detailDesc, { color: themeColors.textSecondary }]}>
                {goal.description}
              </Text>
            ) : null}

            {deadline ? (
              <View style={styles.detailRow}>
                <Clock size={14} color={themeColors.textTertiary} />
                <Text style={[styles.detailRowText, { color: themeColors.textSecondary }]}>
                  Deadline: {format(parseISO(deadline), 'MMMM d, yyyy')}
                </Text>
              </View>
            ) : null}

            {linkedMarks.length > 0 && (
              <View style={styles.detailMarksSection}>
                <View style={styles.linkMarksHeader}>
                  <Link size={13} color={themeColors.textTertiary} />
                  <Text style={[styles.detailSectionLabel, { color: themeColors.textSecondary }]}>
                    Linked marks ({linkedMarks.length})
                  </Text>
                </View>
                {linkedMarks.map(m => (
                  <View key={m.id} style={[styles.detailMarkRow, { borderColor: themeColors.border }]}>
                    <Text style={styles.detailMarkEmoji}>{m.emoji ?? '📌'}</Text>
                    <Text style={[styles.detailMarkName, { color: themeColors.text }]}>{m.name}</Text>
                  </View>
                ))}
              </View>
            )}

            <View style={{ height: spacing['3xl'] }} />
          </ScrollView>

          <View style={[styles.sheetFooter, { borderTopColor: themeColors.border, gap: spacing.sm }]}>
            {goal.status === 'active' && (
              <TouchableOpacity
                style={[styles.saveBtn, { backgroundColor: themeColors.surfaceVariant }]}
                onPress={onComplete}
                activeOpacity={0.8}
              >
                <CheckCircle size={15} color={themeColors.textSecondary} />
                <Text style={[styles.saveBtnText, { color: themeColors.textSecondary }]}>Mark Complete</Text>
              </TouchableOpacity>
            )}
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <TouchableOpacity
                style={[styles.saveBtn, { flex: 1, backgroundColor: ACCENT }]}
                onPress={onEdit}
                activeOpacity={0.8}
              >
                <PencilSimple size={15} color="#111" />
                <Text style={[styles.saveBtnText, { color: '#111' }]}>Edit</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveBtn, { flex: 1, backgroundColor: themeColors.surfaceVariant }]}
                onPress={onDelete}
                activeOpacity={0.8}
              >
                <Trash size={15} color="#E55353" />
                <Text style={[styles.saveBtnText, { color: '#E55353' }]}>Remove</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function QueueScreen() {
  const theme = useEffectiveTheme();
  const themeColors = colors[theme];
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { isProUnlocked } = useIapSubscriptions();

  const goals = useGoalsStore(s => s.goals);
  const isLoading = useGoalsStore(s => s.isLoading);
  const fetchGoals = useGoalsStore(s => s.fetchGoals);
  const createGoal = useGoalsStore(s => s.createGoal);
  const updateGoal = useGoalsStore(s => s.updateGoal);
  const deleteGoal = useGoalsStore(s => s.deleteGoal);
  const completeGoal = useGoalsStore(s => s.completeGoal);
  const reorderQueue = useGoalsStore(s => s.reorderQueue);

  const marks = useMarksStore(s => s.marks);

  const active = useMemo(() => goals.find(g => g.status === 'active'), [goals]);
  const queued = useMemo(
    () => goals.filter(g => g.status === 'queued').sort((a, b) => a.sort_index - b.sort_index),
    [goals],
  );
  const completed = useMemo(() => goals.filter(g => g.status === 'completed'), [goals]);
  const [showCompleted, setShowCompleted] = useState(false);

  const [sheetVisible, setSheetVisible] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [detailGoal, setDetailGoal] = useState<Goal | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);

  const isEmpty = !active && queued.length === 0 && completed.length === 0;

  const handleOpenCreate = useCallback(() => {
    setEditingGoal(null);
    setSheetVisible(true);
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, []);

  const handleOpenDetail = useCallback((goal: Goal) => {
    setDetailGoal(goal);
    setDetailVisible(true);
  }, []);

  const handleOpenEdit = useCallback((goal: Goal) => {
    setDetailVisible(false);
    setTimeout(() => {
      setEditingGoal(goal);
      setSheetVisible(true);
    }, 250);
  }, []);

  const handleSaveGoal = useCallback(
    async (data: Partial<Goal>) => {
      if (!user?.id) return;
      if (editingGoal) {
        await updateGoal(editingGoal.id, data).catch(err =>
          Alert.alert('Error', err instanceof Error ? err.message : 'Could not save goal.')
        );
      } else {
        await createGoal({ ...data, userId: user.id, isPro: isProUnlocked }).catch(err =>
          Alert.alert('Error', err instanceof Error ? err.message : 'Could not add goal.')
        );
      }
    },
    [user?.id, editingGoal, createGoal, updateGoal, isProUnlocked]
  );

  const handleComplete = useCallback((goal: Goal) => {
    Alert.alert(
      'Mark goal complete?',
      `"${goal.title}" will move to your history and the next goal becomes active.`,
      [
        { text: 'Not yet', style: 'cancel' },
        {
          text: "Done — it's mine",
          onPress: () => {
            setDetailVisible(false);
            completeGoal(goal.id)
              .then(() =>
                router.push({ pathname: '/goal/complete', params: { goalTitle: goal.title, goalId: goal.id } })
              )
              .catch(() => Alert.alert('Error', 'Could not complete goal.'));
          },
        },
      ],
    );
  }, [completeGoal, router]);

  const handleDelete = useCallback((goal: Goal) => {
    Alert.alert(
      'Remove goal?',
      `"${goal.title}" will be removed from your queue.`,
      [
        { text: 'Keep it', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            setDetailVisible(false);
            deleteGoal(goal.id).catch(() => Alert.alert('Error', 'Could not remove goal.'));
          },
        },
      ],
    );
  }, [deleteGoal]);

  const handleMoveUp = useCallback(
    (goal: Goal, currentIndex: number) => {
      if (currentIndex === 0) return;
      const newOrder = [...queued];
      [newOrder[currentIndex - 1], newOrder[currentIndex]] = [newOrder[currentIndex], newOrder[currentIndex - 1]];
      reorderQueue(newOrder.map(g => g.id));
    },
    [queued, reorderQueue],
  );

  const handleMoveDown = useCallback(
    (goal: Goal, currentIndex: number) => {
      if (currentIndex === queued.length - 1) return;
      const newOrder = [...queued];
      [newOrder[currentIndex], newOrder[currentIndex + 1]] = [newOrder[currentIndex + 1], newOrder[currentIndex]];
      reorderQueue(newOrder.map(g => g.id));
    },
    [queued, reorderQueue],
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: themeColors.text }]}>Goal Queue</Text>
        <Text style={[styles.headerSub, { color: themeColors.textTertiary }]}>
          {active ? '1 active' : 'No active goal'}{queued.length > 0 ? ` · ${queued.length} waiting` : ''}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: 120 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Empty state ── */}
        {isEmpty && (
          <View style={styles.emptyState}>
            <Flag size={48} color={themeColors.textTertiary} weight="thin" />
            <Text style={[styles.emptyTitle, { color: themeColors.textSecondary }]}>
              No goals yet.
            </Text>
            <Text style={[styles.emptyBody, { color: themeColors.textTertiary }]}>
              Add your first goal to get started.
            </Text>
            <TouchableOpacity
              style={[styles.emptyBtn, { backgroundColor: ACCENT }]}
              onPress={handleOpenCreate}
              activeOpacity={0.8}
            >
              <Plus size={16} color="#111" weight="bold" />
              <Text style={styles.emptyBtnText}>Add New Goal</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Active / Hero ── */}
        {active ? (
          <View style={styles.section}>
            <HeroCard
              goal={active}
              onComplete={() => handleComplete(active)}
              onOpenDetail={() => handleOpenDetail(active)}
            />
          </View>
        ) : !isEmpty ? (
          <View style={styles.section}>
            <TouchableOpacity
              style={[styles.emptyActiveCard, { borderColor: themeColors.border }]}
              onPress={handleOpenCreate}
              activeOpacity={0.8}
            >
              <Plus size={20} color={themeColors.textSecondary} />
              <Text style={[styles.emptyActiveText, { color: themeColors.textSecondary }]}>
                Add a goal to start
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* ── Queue ── */}
        {queued.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: themeColors.textTertiary }]}>WAITING</Text>
            {queued.map((goal, idx) => (
              <QueueCard
                key={goal.id}
                goal={goal}
                position={idx}
                totalQueued={queued.length}
                onDelete={() => handleDelete(goal)}
                onOpenDetail={() => handleOpenDetail(goal)}
                onMoveUp={() => handleMoveUp(goal, idx)}
                onMoveDown={() => handleMoveDown(goal, idx)}
              />
            ))}
          </View>
        )}

        {/* ── Completed ── */}
        {completed.length > 0 && (
          <View style={styles.section}>
            <TouchableOpacity
              style={styles.completedHeader}
              onPress={() => setShowCompleted(v => !v)}
              activeOpacity={0.7}
            >
              <Text style={[styles.sectionLabel, { color: themeColors.textTertiary, marginBottom: 0 }]}>
                COMPLETED · {completed.length}
              </Text>
              <CaretRight
                size={12}
                color={themeColors.textTertiary}
                weight="bold"
                style={{ transform: [{ rotate: showCompleted ? '90deg' : '0deg' }] }}
              />
            </TouchableOpacity>

            {showCompleted &&
              completed.map(goal => (
                <View
                  key={goal.id}
                  style={[styles.completedCard, { backgroundColor: themeColors.surface }]}
                >
                  <Text
                    style={[styles.completedTitle, { color: themeColors.textSecondary }]}
                    numberOfLines={1}
                  >
                    {goal.icon ? `${goal.icon} ` : ''}{goal.title}
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
      </ScrollView>

      {/* ── FAB ── */}
      {!isEmpty && (
        <TouchableOpacity
          style={[styles.fab, { bottom: 80 + insets.bottom }]}
          onPress={handleOpenCreate}
          activeOpacity={0.85}
        >
          <LinearGradient colors={['#FEB729', '#F59E0B']} style={styles.fabGradient}>
            <Plus size={20} color="#111" weight="bold" />
            <Text style={styles.fabLabel}>Add New Goal</Text>
          </LinearGradient>
        </TouchableOpacity>
      )}

      {/* ── Sheets ── */}
      <GoalSheet
        visible={sheetVisible}
        initialGoal={editingGoal}
        marks={marks}
        onClose={() => setSheetVisible(false)}
        onSave={handleSaveGoal}
      />

      <GoalDetailSheet
        visible={detailVisible}
        goal={detailGoal}
        marks={marks}
        onClose={() => setDetailVisible(false)}
        onEdit={() => detailGoal && handleOpenEdit(detailGoal)}
        onDelete={() => detailGoal && handleDelete(detailGoal)}
        onComplete={() => detailGoal && handleComplete(detailGoal)}
      />
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
  },
  headerTitle: {
    fontSize: fontSize['2xl'],
    fontWeight: fontWeight.bold,
    fontFamily: 'Satoshi',
    letterSpacing: -0.5,
  },
  headerSub: {
    fontSize: fontSize.sm,
    fontFamily: 'Inter',
    marginTop: 2,
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

  // Hero card
  heroCard: {
    borderRadius: borderRadius.card,
    padding: spacing.lg,
    gap: spacing.md,
    overflow: 'hidden',
  },
  heroHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  heroLabel: {
    fontSize: 10,
    fontFamily: 'Inter',
    fontWeight: fontWeight.semibold,
    color: 'rgba(255,255,255,0.75)',
    letterSpacing: 1.8,
  },
  heroSequence: {
    fontSize: fontSize.xs,
    fontFamily: 'Inter',
    color: 'rgba(255,255,255,0.55)',
    marginTop: 2,
  },
  heroDetailBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroBody: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  heroTextBlock: {
    flex: 1,
    gap: spacing.sm,
  },
  heroIcon: {
    fontSize: 28,
  },
  heroTitle: {
    fontSize: fontSize.xl,
    fontFamily: 'Satoshi',
    fontWeight: fontWeight.bold,
    color: '#fff',
    lineHeight: 26,
  },
  heroDesc: {
    fontSize: fontSize.base,
    fontFamily: 'Inter',
    color: 'rgba(255,255,255,0.8)',
    lineHeight: 20,
  },
  heroProgressBlock: {
    alignItems: 'center',
    gap: 4,
  },
  heroProgressLabel: {
    fontSize: fontSize.xs,
    fontFamily: 'Inter',
    fontWeight: fontWeight.semibold,
    color: '#fff',
  },
  heroFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heroCountText: {
    fontSize: fontSize.xs,
    fontFamily: 'Inter',
    color: 'rgba(255,255,255,0.7)',
  },
  heroDoneBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
  },
  heroDoneBtnText: {
    fontSize: fontSize.sm,
    fontFamily: 'Inter',
    fontWeight: fontWeight.medium,
    color: '#fff',
  },

  // Queue cards
  queueCard: {
    borderRadius: borderRadius.card,
    overflow: 'hidden',
    marginBottom: spacing.sm,
  },
  queueCardAccent: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  queueCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  queueCardLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  queueSeqBadge: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: borderRadius.md,
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  queueSeqText: {
    fontSize: fontSize.xs,
    fontFamily: 'Inter',
    fontWeight: fontWeight.bold,
    color: '#fff',
  },
  queueCardInfo: {
    flex: 1,
    gap: 3,
  },
  queueCardTitle: {
    fontSize: fontSize.md,
    fontFamily: 'Satoshi',
    fontWeight: fontWeight.semibold,
    color: '#fff',
  },
  queueCardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  queueCardMetaText: {
    fontSize: 11,
    fontFamily: 'Inter',
    color: 'rgba(255,255,255,0.7)',
  },
  queueCardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  reorderBtn: {
    padding: 4,
  },
  reorderBtnDisabled: {
    opacity: 0.3,
  },

  // Empty state
  emptyState: {
    alignItems: 'center',
    paddingTop: spacing['4xl'],
    gap: spacing.md,
  },
  emptyTitle: {
    fontSize: fontSize.lg,
    fontFamily: 'Satoshi',
    fontWeight: fontWeight.semibold,
  },
  emptyBody: {
    fontSize: fontSize.base,
    fontFamily: 'Inter',
    textAlign: 'center',
    lineHeight: 20,
  },
  emptyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.full,
    marginTop: spacing.sm,
  },
  emptyBtnText: {
    fontSize: fontSize.md,
    fontFamily: 'Inter',
    fontWeight: fontWeight.semibold,
    color: '#111',
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
    fontSize: fontSize.md,
    fontFamily: 'Inter',
  },

  // Completed
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
    fontSize: fontSize.md,
    fontFamily: 'Satoshi',
    textDecorationLine: 'line-through',
  },
  completedDate: {
    fontSize: 11,
    fontFamily: 'Inter',
  },

  // FAB
  fab: {
    position: 'absolute',
    alignSelf: 'center',
    borderRadius: borderRadius.full,
    overflow: 'hidden',
    shadowColor: '#FEB729',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 10,
  },
  fabGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  fabLabel: {
    fontSize: fontSize.md,
    fontFamily: 'Inter',
    fontWeight: fontWeight.semibold,
    color: '#111',
  },

  // Sheet
  sheetOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    maxHeight: '90%',
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(0,0,0,0.2)',
    alignSelf: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  sheetTitle: {
    fontSize: fontSize.lg,
    fontFamily: 'Satoshi',
    fontWeight: fontWeight.bold,
    flex: 1,
    marginRight: spacing.sm,
  },
  sheetBody: {
    paddingHorizontal: spacing.lg,
  },
  fieldLabel: {
    fontSize: fontSize.sm,
    fontFamily: 'Inter',
    fontWeight: fontWeight.medium,
    marginBottom: spacing.xs,
    marginTop: spacing.md,
  },
  fieldHint: {
    fontSize: 11,
    fontFamily: 'Inter',
    marginBottom: spacing.sm,
  },
  fieldRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  textInput: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fontSize.md,
    fontFamily: 'Inter',
    minHeight: 44,
  },
  textInputMulti: {
    minHeight: 80,
    paddingTop: spacing.sm,
    textAlignVertical: 'top',
  },
  linkMarksHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  markPickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.md,
    marginBottom: 2,
  },
  markPickerEmoji: {
    fontSize: 18,
  },
  markPickerName: {
    flex: 1,
    fontSize: fontSize.md,
    fontFamily: 'Inter',
  },
  sheetFooter: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.full,
  },
  saveBtnText: {
    fontSize: fontSize.md,
    fontFamily: 'Inter',
    fontWeight: fontWeight.semibold,
    color: '#111',
  },

  // Detail sheet
  detailProgressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  detailProgressPct: {
    fontSize: fontSize.xl,
    fontFamily: 'Satoshi',
    fontWeight: fontWeight.bold,
  },
  detailProgressSub: {
    fontSize: fontSize.sm,
    fontFamily: 'Inter',
    marginTop: 2,
  },
  detailDesc: {
    fontSize: fontSize.base,
    fontFamily: 'Inter',
    lineHeight: 22,
    marginBottom: spacing.md,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  detailRowText: {
    fontSize: fontSize.sm,
    fontFamily: 'Inter',
  },
  detailMarksSection: {
    marginTop: spacing.md,
  },
  detailSectionLabel: {
    fontSize: fontSize.sm,
    fontFamily: 'Inter',
    fontWeight: fontWeight.medium,
  },
  detailMarkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  detailMarkEmoji: {
    fontSize: 18,
  },
  detailMarkName: {
    flex: 1,
    fontSize: fontSize.md,
    fontFamily: 'Inter',
  },
});
