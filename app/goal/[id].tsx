import React, { useState, useCallback, useEffect, useMemo } from 'react';
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
import * as Haptics from 'expo-haptics';
import {
  X,
  PencilSimple,
  Check,
  Plus,
  Trash,
} from 'phosphor-react-native';
import {
  colors,
  themedColors,
  spacing,
  fontSize,
  fontWeight,
  borderRadius,
  radius,
  fonts,
} from '../../theme/tokens';
import { useEffectiveTheme } from '../../state/uiSlice';
import { useGoalsStore } from '../../state/goalsSlice';
import { useMarksStore } from '../../state/countersSlice';
import { useEventsStore } from '../../state/eventsSlice';
import { useAppDateStore } from '../../state/appDateSlice';
import { effectivePersonalBest, useMomentumStore } from '../../state/momentumSlice';
import { deriveIsNewBest, goalAgeDays } from '../../lib/moments/context';
import { getAppDate } from '../../lib/appDate';
import { formatDate } from '../../lib/date';
import { useCounters } from '../../hooks/useCounters';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../contexts/NotificationContext';
import { CATEGORY_MAP } from '../../components/ui/MarkRow';
import { GoalTitle } from '../../components/ui/GoalTitle';
import { VoiceLine } from '../../components/ui/VoiceLine';
import {
  currentWeekDates,
  buildWeeklyCountsMap,
  markWeeklyState,
} from '../../lib/features';
import { buildGoalWeekSentence } from '../../lib/goalWeekSentence';
import { resolveMarkCategory, majorityCategory } from '../../lib/markCategoryResolve';
import { logger } from '../../lib/utils/logger';
import { applyOpacity } from '../../src/components/icons/color';

// Reframed ring (VD-4): a quiet 64px instance beside the text story,
// no longer the screen's centerpiece. Stroke stays forest (structure).
const RING_SIZE = 64;
const STROKE = 6;

function ProgressRing({
  progress,
  threshold,
  size = RING_SIZE,
  stroke = STROKE,
}: {
  progress: number;
  threshold: number;
  size?: number;
  stroke?: number;
}) {
  const theme = useEffectiveTheme();
  const c = themedColors(theme);
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const pct = threshold > 0 ? Math.min(1, progress / threshold) : 0;
  const strokeDashoffset = circumference * (1 - pct);

  return (
    <Svg width={size} height={size}>
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke={c.borderLight}
        strokeWidth={stroke}
        fill="none"
      />
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke={c.forest}
        strokeWidth={stroke}
        fill="none"
        strokeDasharray={circumference}
        strokeDashoffset={strokeDashoffset}
        strokeLinecap="round"
        rotation="-90"
        origin={`${size / 2}, ${size / 2}`}
      />
    </Svg>
  );
}

export default function GoalDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const theme = useEffectiveTheme();
  const c = themedColors(theme);
  const { user } = useAuth();
  const userId = user?.id;
  const { incrementCounter } = useCounters();
  const { showError } = useNotification();

  const goal = useGoalsStore(s => s.goals.find(g => g.id === id));
  const marks = useMarksStore(s => s.marks);
  const updateGoalTitle = useGoalsStore(s => s.updateGoalTitle);
  const updateGoalTargetDate = useGoalsStore(s => s.updateGoalTargetDate);
  const completeGoal = useGoalsStore(s => s.completeGoal);
  const deleteGoal = useGoalsStore(s => s.deleteGoal);
  const getGoalProgress = useGoalsStore(s => s.getGoalProgress);

  const allEvents = useEventsStore((s) => s.events);
  const appDateKey = useAppDateStore((s) => s.debugDateOverride ?? '');
  const momentumSnapshot = useMomentumStore((s) => (id ? s.snapshots[id] : undefined));
  const longestRunEntry = useMomentumStore((s) => (id ? s.longestRuns[id] : undefined));

  // PL-2: load the persisted per-goal longest runs once (idempotent).
  useEffect(() => {
    void useMomentumStore.getState().hydrateLongestRuns();
  }, []);

  // appDateKey is an intentional dep: recompute when the debug date moves.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const todayStr = useMemo(() => formatDate(getAppDate()), [appDateKey]);

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

  const linkedMarks = useMemo(
    () => marks.filter(m => m.goal_id === id && !m.deleted_at),
    [marks, id],
  );

  // ── Weekly state (same machinery Focus uses) ──────────────────────────────

  // appDateKey is an intentional dep: recompute the week when the debug date moves.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const weekDates = useMemo(() => currentWeekDates(), [appDateKey]);

  const weeklyCountsMap = useMemo(
    () => buildWeeklyCountsMap(linkedMarks, allEvents, weekDates),
    [linkedMarks, allEvents, weekDates],
  );

  const dueCount = useMemo(
    () =>
      linkedMarks.filter(
        (m) => markWeeklyState(m, weeklyCountsMap.get(m.id) ?? 0) === 'due',
      ).length,
    [linkedMarks, weeklyCountsMap],
  );

  // M2 (PL-2): on the day the run passes the personal best, the momentum clause
  // reads "{N} days · your longest yet". Every other day, the plain sentence.
  const runDays =
    momentumSnapshot && momentumSnapshot.state !== 'broken'
      ? Math.max(0, momentumSnapshot.days)
      : 0;
  const isNewBest = deriveIsNewBest(runDays, effectivePersonalBest(longestRunEntry, todayStr));

  const weekSentence = useMemo(
    () =>
      buildGoalWeekSentence({
        momentumDays: runDays > 0 ? runDays : null,
        markCount: linkedMarks.length,
        dueCount,
        isNewBest,
        // M1 (PL-3): a week-one goal with no run yet leads with its day count.
        goalAgeDays: goal ? goalAgeDays(goal.created_at, todayStr) : null,
      }),
    [runDays, isNewBest, linkedMarks.length, dueCount, goal, todayStr],
  );

  // ── Hero category (majority of linked marks) ──────────────────────────────

  const heroCategory = useMemo(() => majorityCategory(linkedMarks), [linkedMarks]);
  const heroCat = CATEGORY_MAP[heroCategory] ?? CATEGORY_MAP.custom;
  const HeroIcon = heroCat.Icon;

  // ── Handlers ──────────────────────────────────────────────────────────────

  // Same quick-increment path Focus uses. A met weekly target never blocks
  // today's log — logging is always open.
  const handleQuickLog = useCallback(
    async (markId: string) => {
      if (!userId) return;
      if (Platform.OS !== 'web') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      }
      try {
        await incrementCounter(markId, userId, 1);
      } catch (error: unknown) {
        logger.error('Error incrementing mark:', error);
        showError('Could not log that. Try again.');
      }
    },
    [userId, incrementCounter, showError],
  );

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
          text: "Done, it's mine",
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
        {/* ── Hero: the goal's study ── */}
        <View style={[styles.heroTile, { backgroundColor: applyOpacity(c.ember, 0.12) }]}>
          <HeroIcon size={32} color={heroCat.accent} weight="duotone" />
        </View>

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
          <GoalTitle title={goal.title} size="detail" color={c.inkDark} style={styles.title} />
        )}

        {/* The captured why comes home here. */}
        {!!goal.description && (
          <Text style={[styles.why, { color: c.inkMid }]}>{goal.description}</Text>
        )}

        {/* ── Week sentence ── */}
        {weekSentence !== '' && (
          <Text style={[styles.weekSentence, { color: c.inkMid }]}>{weekSentence}</Text>
        )}

        {/* ── Living mark rows ── */}
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
                <Text style={[styles.addMarkBtnText, { color: c.inkInverse }]}>Add a mark</Text>
              </TouchableOpacity>
            </View>
          ) : (
            linkedMarks.map(mark => {
              const catData = CATEGORY_MAP[resolveMarkCategory(mark)] ?? CATEGORY_MAP.custom;
              const MarkIcon = catData.Icon;
              const weeklyCount = weeklyCountsMap.get(mark.id) ?? 0;
              const weeklyTarget = mark.weekly_target ?? 3;
              const weekPct = weeklyTarget > 0 ? Math.min(1, weeklyCount / weeklyTarget) : 0;
              return (
                <TouchableOpacity
                  key={mark.id}
                  style={[styles.markRow, { backgroundColor: c.surface, borderColor: c.borderLight }]}
                  onPress={() => router.push(`/mark/${mark.id}` as any)}
                  activeOpacity={0.8}
                >
                  <View style={[styles.markIconTile, { backgroundColor: applyOpacity(catData.accent, 0.12) }]}>
                    <MarkIcon size={18} color={catData.accent} weight="duotone" />
                  </View>
                  <View style={styles.markBody}>
                    <Text style={[styles.markName, { color: c.inkDark }]} numberOfLines={1}>
                      {mark.name}
                    </Text>
                    <View style={[styles.weekTrack, { backgroundColor: applyOpacity(c.ember, 0.16) }]}>
                      <View
                        style={[
                          styles.weekFill,
                          // Dynamic width — the one allowed inline value.
                          { backgroundColor: applyOpacity(c.ember, 0.6), width: `${weekPct * 100}%` },
                        ]}
                      />
                    </View>
                  </View>
                  <TouchableOpacity
                    style={[styles.logBtn, { backgroundColor: applyOpacity(c.accent, 0.12) }]}
                    onPress={() => handleQuickLog(mark.id)}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    activeOpacity={0.7}
                    accessibilityLabel={`Log ${mark.name}`}
                  >
                    <Plus size={16} color={c.accent} weight="bold" />
                  </TouchableOpacity>
                </TouchableOpacity>
              );
            })
          )}
        </View>

        {/* ── Progress, reframed as a story beside a small ring ── */}
        <View style={styles.progressRow}>
          <ProgressRing progress={progress} threshold={threshold} />
          <View style={styles.progressStory}>
            <Text style={[styles.progressNumber, { color: c.inkDark }]}>{progress}</Text>
            <Text style={[styles.progressCaption, { color: c.inkMid }]}>
              of {threshold} check-ins
            </Text>
          </View>
        </View>

        {/* ── Quiet footer group ── */}
        <View style={styles.footerGroup}>
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

          {canComplete && (
            <TouchableOpacity
              style={[styles.completeBtn, { backgroundColor: c.forest }]}
              onPress={handleComplete}
              activeOpacity={0.85}
            >
              <Text style={[styles.completeBtnText, { color: c.inkInverse }]}>Mark complete</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete} activeOpacity={0.7}>
            <Trash size={16} color={c.inkMuted} weight="duotone" />
            <Text style={[styles.deleteBtnText, { color: c.inkMuted }]}>Remove goal</Text>
          </TouchableOpacity>
        </View>
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
                <Text style={[styles.dateSetBtnText, { color: c.inkInverse }]}>Set date</Text>
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

      {/* PL-4 (M5): post-log voice line — the quick-log rows here share
          Focus's increment path, so the line renders here too. */}
      <VoiceLine />
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
  // Screen gutter = spacing.lg, applied ONCE here; cards carry no horizontal margins.
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl * 2 },

  // Hero
  heroTile: {
    width: 64,
    height: 64,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  // Type lives in <GoalTitle>; layout spacing only.
  title: { marginTop: 0 },
  why: {
    fontFamily: fonts.serifItalic,
    fontSize: fontSize.lg,
    lineHeight: 22,
    marginTop: spacing.sm,
  },
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

  // Week sentence
  weekSentence: {
    fontFamily: fonts.sans,
    fontSize: fontSize.sm,
    lineHeight: 18,
    marginTop: spacing.md,
  },

  // Marks
  section: { marginTop: spacing.lg, gap: spacing.xs },
  sectionLabel: {
    fontSize: fontSize.xs,
    fontFamily: fonts.sansSemibold,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: spacing.xs,
  },
  markRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
  },
  markIconTile: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markBody: { flex: 1, gap: 6 },
  markName: { fontSize: fontSize.md, fontFamily: fonts.sansMedium },
  weekTrack: {
    height: 3,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  weekFill: {
    height: 3,
    borderRadius: radius.full,
  },
  logBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
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
  addMarkBtnText: { fontSize: fontSize.sm, fontFamily: fonts.sansSemibold },

  // Progress story
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.xl,
  },
  progressStory: { flex: 1 },
  progressNumber: {
    fontFamily: fonts.sansBold,
    fontSize: fontSize['2xl'],
    lineHeight: 34,
  },
  progressCaption: {
    fontFamily: fonts.sans,
    fontSize: fontSize.sm,
  },

  // Footer group
  footerGroup: { marginTop: spacing.xl },
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
  completeBtn: {
    marginTop: spacing.sm,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  completeBtnText: { fontSize: fontSize.md, fontFamily: fonts.sansSemibold },
  deleteBtn: {
    marginTop: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
  },
  deleteBtnText: { fontSize: fontSize.sm, fontFamily: fonts.sans },

  // Scrim over the goal screen while the date sheet is up. inkDark from the
  // light palette is near-black in both themes; alpha via applyOpacity only.
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: applyOpacity(colors.inkDark, 0.4),
  },
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
  dateSetBtnText: { fontSize: fontSize.md, fontWeight: fontWeight.semibold },
});
