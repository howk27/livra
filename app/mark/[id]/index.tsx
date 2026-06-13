import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Platform,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Switch,
  Linking,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withDelay,
  withSequence,
  runOnJS,
} from 'react-native-reanimated';
import {
  getMarkReminderTime,
  setMarkReminderTime,
  scheduleMarkReminder,
  cancelMarkReminder,
  clearMarkReminderTime,
} from '../../../lib/notifications/markReminder';
import { checkProStatus } from '../../../lib/iap/iap';
import { requestPermissions } from '../../../lib/health/healthPermissions';
import { suggestStepGoal, suggestWakeTime } from '../../../lib/health/healthLearner';
import type { HealthKitType } from '../../../lib/health/healthTypes';
import {
  scheduleSleepNotification,
  cancelSleepNotification,
  getSleepNotifTime,
  setSleepNotifTime,
} from '../../../lib/notifications/sleepNotification';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import {
  ArrowRight,
  CaretDown,
  CaretUp,
  Check,
  CheckCircle,
  Flag,
  Bell,
  BellSlash,
  Trash,
} from 'phosphor-react-native';
import { themedColors, spacing, borderRadius, fontSize, fontWeight, shadow, fonts } from '../../../theme/tokens';
import { useEffectiveTheme } from '../../../state/uiSlice';
import { LivraHeader } from '../../../components/ui/LivraHeader';
import { MarkFrequencyPicker } from '../../../components/ui/MarkFrequencyPicker';
import { PillButton } from '../../../components/ui/PillButton';
import { SectionLabel } from '../../../components/ui/SectionLabel';
import { useCounters } from '../../../hooks/useCounters';
import { useEventsStore } from '../../../state/eventsSlice';
import { LoadingScreen } from '../../../components/LoadingScreen';
import { useAuth } from '../../../hooks/useAuth';
import { logger } from '../../../lib/utils/logger';
import { useDailyTrackingStore } from '../../../state/dailyTrackingSlice';
import { MARK_LIBRARY } from '@/lib/suggestedCounters';
import { resolveDailyTarget } from '../../../lib/markDailyTarget';
import { getAppDate } from '../../../lib/appDate';
import { formatDate } from '../../../lib/date';
import { useAppDateStore } from '../../../state/appDateSlice';
import { deriveStreakForMark } from '../../../hooks/useStreaks';
import { useGoalsStore } from '../../../state/goalsSlice';
import { CATEGORY_MAP } from '../../../components/ui/MarkRow';
import { resolveCounterIconType } from '@/src/components/icons/IconResolver';

function toLocalDateStr(d: Date): string {
  return formatDate(d);
}

const NOTE_MAX_LEN = 500;

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export default function MarkDetailScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = typeof params.id === 'string' ? params.id : params.id?.[0];
  return <MarkDetailContent key={id ?? '__no_id__'} />;
}

function MarkDetailContent() {
  const theme = useEffectiveTheme();
  const c = themedColors(theme);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ id: string }>();
  const id = typeof params.id === 'string' ? params.id : params.id?.[0];

  const { counters, loading, incrementCounter, decrementCounter, resetCounter, deleteCounter, updateMark } = useCounters();
  const allEvents = useEventsStore((state) => state.events || []);
  const counter = id ? counters.find((c) => c.id === id) : null;
  const libraryMark = counter ? MARK_LIBRARY.find(m => m.emoji === counter.emoji) : undefined;

  const [expandedActivityDate, setExpandedActivityDate] = useState<string | null>(null);
  const [draftNote, setDraftNote] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [deletingNote, setDeletingNote] = useState(false);
  const noteFieldBusy = savingNote || deletingNote;
  const scrollRef = useRef<ScrollView>(null);
  const noteSectionYRef = useRef(0);
  const undoInFlight = useRef(false);
  const draftNoteRef = useRef(draftNote);
  draftNoteRef.current = draftNote;
  const [expandedNoteIds, setExpandedNoteIds] = useState<Set<string>>(new Set());
  const appDateKey = useAppDateStore((s) => s.debugDateOverride ?? '');

  const [healthModalVisible, setHealthModalVisible] = useState(false);
  const [healthStepGoal, setHealthStepGoal] = useState<string>('');
  const [healthPendingType, setHealthPendingType] = useState<HealthKitType | null>(null);
  const [healthConnecting, setHealthConnecting] = useState(false);

  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [reminderTime, setReminderTime] = useState<Date>(() => {
    const d = new Date();
    d.setHours(8, 0, 0, 0);
    return d;
  });
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [reminderLoading, setReminderLoading] = useState(true);

  // Banner for "all done today"
  const [showAllDoneBanner, setShowAllDoneBanner] = useState(false);
  const bannerY = useSharedValue(-80);

  const todayStr = useMemo(() => toLocalDateStr(getAppDate()), [appDateKey]);

  const events = useMemo(
    () => (id ? allEvents.filter((e) => e.mark_id === id && !e.deleted_at) : []),
    [id, allEvents],
  );

  const streakDisplay = useMemo(() => {
    if (!id || !counter) return null;
    const d = deriveStreakForMark(id, allEvents, counter.enable_streak);
    if (!d) return null;
    return { current_streak: d.current, longest_streak: d.longest };
  }, [id, allEvents, counter, appDateKey]);

  const todayCount = useMemo(
    () =>
      events
        .filter((e) => e.event_type === 'increment' && e.occurred_local_date === todayStr)
        .reduce((sum, e) => sum + (e.amount ?? 1), 0),
    [events, todayStr],
  );

  const allActiveCounters = useMemo(
    () => counters.filter((c) => !c.deleted_at),
    [counters],
  );

  const allLoggedToday = useMemo(() => {
    return allActiveCounters.every((c) => {
      const count = allEvents
        .filter(e => e.mark_id === c.id && e.event_type === 'increment' && e.occurred_local_date === todayStr && !e.deleted_at)
        .reduce((s, e) => s + (e.amount ?? 1), 0);
      return count >= resolveDailyTarget(c);
    });
  }, [allActiveCounters, allEvents, todayStr]);

  const dailyTarget = useMemo(() => (counter ? resolveDailyTarget(counter) : 1), [counter]);
  const completedToday = todayCount >= dailyTarget;
  const allTimeTotal = useMemo(
    () => events.filter(e => e.event_type === 'increment').reduce((s, e) => s + (e.amount ?? 1), 0),
    [events],
  );

  const recentActivity = useMemo(() => {
    // Aggregate increment events by local date, sum amounts per day.
    // Show only days with at least one increment event — decrement events are not counted here.
    const dayTotals = new Map<string, number>();
    for (const e of events) {
      if (e.event_type !== 'increment') continue;
      const prev = dayTotals.get(e.occurred_local_date) ?? 0;
      dayTotals.set(e.occurred_local_date, prev + (e.amount ?? 1));
    }
    return Array.from(dayTotals.entries())
      .filter(([, total]) => total > 0)
      .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0)) // newest date first
      .slice(0, 6)
      .map(([date]) => date);
  }, [events]);

  const dailyLogsForMark = useDailyTrackingStore(
    (s) => (id ? s.getDailyLogsForMark(id, 60) : []),
  );

  const todayDailyLog = useDailyTrackingStore(
    (s) => (id ? s.getDailyLogForDate(id, todayStr) : null),
  );

  const upsertDailyLogNote = useDailyTrackingStore((s) => s.upsertDailyLogNote);
  const deleteDailyLogNote = useDailyTrackingStore((s) => s.deleteDailyLogNote);
  const notesCloudError = useDailyTrackingStore((s) => s.notesCloudError);
  const clearNotesCloudError = useDailyTrackingStore((s) => s.clearNotesCloudError);

  const savedNoteText = todayDailyLog?.text ?? '';
  const savedTrimmed = savedNoteText.trim();
  const draftTrimmed = draftNote.trim();
  const canSaveNote =
    draftTrimmed !== savedTrimmed && !(draftTrimmed === '' && savedTrimmed !== '');
  const hasSavedNote = Boolean(todayDailyLog && savedTrimmed.length > 0);

  const notesByDate = useMemo(() => {
    const map = new Map<string, string>();
    dailyLogsForMark.forEach((n) => {
      const t = n.text.trim();
      if (t) map.set(n.date, t);
    });
    return map;
  }, [dailyLogsForMark]);

  const markNotes = useMemo(
    () => dailyLogsForMark.filter((n) => n.date !== todayStr && n.text.trim().length > 0),
    [dailyLogsForMark, todayStr],
  );

  const noteUserId = user?.id ?? 'local';

  const handleReminderToggle = useCallback(async (value: boolean) => {
    if (!id || !counter) return;
    setReminderEnabled(value);
    if (value) {
      setShowTimePicker(true);
      const hhmm = `${reminderTime.getHours()}:${String(reminderTime.getMinutes()).padStart(2, '0')}`;
      await setMarkReminderTime(id, hhmm);
      await scheduleMarkReminder(id, counter.name, hhmm);
    } else {
      setShowTimePicker(false);
      await cancelMarkReminder(id);
      await clearMarkReminderTime(id);
    }
  }, [id, counter, reminderTime]);

  const handleReminderTimeChange = useCallback(async (_: any, selected?: Date) => {
    if (!selected || !id || !counter) return;
    setReminderTime(selected);
    const hhmm = `${selected.getHours()}:${String(selected.getMinutes()).padStart(2, '0')}`;
    await setMarkReminderTime(id, hhmm);
    await scheduleMarkReminder(id, counter.name, hhmm);
  }, [id, counter]);

  // Goals linked to this mark
  const goals = useGoalsStore(s => s.goals);
  const linkedGoals = useMemo(
    () => goals.filter(g => g.linked_mark_ids?.includes(id ?? '') && g.status !== 'completed' && g.status !== 'expired'),
    [goals, id],
  );
  const workingTowardGoal = useMemo(
    () => counter?.goal_id
      ? (goals.find(g => g.id === counter.goal_id && g.status !== 'completed' && g.status !== 'expired') ?? null)
      : null,
    [goals, counter?.goal_id],
  );

  useFocusEffect(
    useCallback(() => {
      if (!id) return;
      const row = useDailyTrackingStore.getState().getDailyLogForDate(id, todayStr);
      setDraftNote(row?.text ?? '');
    }, [id, todayStr]),
  );

  // Auto-save note on unmount (navigation away)
  useEffect(() => {
    return () => {
      const draft = draftNote.trim();
      const saved = savedNoteText.trim();
      if (!id || !noteUserId || draft === saved) return;
      if (draft.length === 0 && saved.length === 0) return;
      // Fire-and-forget — do not await in cleanup
      useDailyTrackingStore.getState().upsertDailyLogNote(id, noteUserId, todayStr, draft);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftNote]);

  // Sync draft when the store hydrates from SQLite after an async load.
  // Only updates if draft is currently empty to avoid overwriting in-progress typing.
  useEffect(() => {
    if (todayDailyLog?.text && draftNoteRef.current === '') {
      setDraftNote(todayDailyLog.text);
    }
  }, [todayDailyLog?.text]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      const stored = await getMarkReminderTime(id);
      if (cancelled) return;
      if (stored) {
        const [h = '8', m = '0'] = stored.split(':');
        const d = new Date();
        d.setHours(parseInt(h, 10), parseInt(m, 10), 0, 0);
        setReminderTime(d);
        setReminderEnabled(true);
      }
      setReminderLoading(false);
    })();
    return () => { cancelled = true; };
  }, [id]);

  // Log button animation
  const logBtnScale = useSharedValue(1);
  const logBtnStyle = useAnimatedStyle(() => ({
    transform: [{ scale: logBtnScale.value }],
  }));

  const bannerStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: bannerY.value }],
  }));

  const scrollNoteIntoView = useCallback(() => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ y: Math.max(0, noteSectionYRef.current - spacing.md), animated: true });
    });
  }, []);

  const styles = useMemo(() => createStyles(c), [c]);

  if (loading) return <LoadingScreen />;

  if (!counter || !id) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: c.linen }]}>
        <View style={styles.centered}>
          <Text style={styles.errorText}>Mark not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Category data — fall back to icon resolver so marks like "email" get the right icon
  const resolvedIconKey = resolveCounterIconType({ name: counter.name, emoji: counter.emoji });
  const catKey = libraryMark?.category ?? resolvedIconKey ?? 'custom';
  const catData = CATEGORY_MAP[catKey] ?? CATEGORY_MAP.custom;
  const accent = catData.accent;
  const CatIcon = catData.Icon;

  // ── Handlers ─────────────────────────────────────────────────────────────────

  const handleLog = async () => {
    if (!id || !user?.id || completedToday) return;
    if (Platform.OS !== 'web') await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    // Button press feedback
    logBtnScale.value = withSequence(
      withSpring(0.96, { damping: 20, stiffness: 400 }),
      withSpring(1, { damping: 18, stiffness: 300 }),
    );

    incrementCounter(id, user.id, 1).catch((error) => {
      logger.error('increment failed:', error);
      Alert.alert('Error', 'Could not update mark');
    });

    // Check if all marks done after this log (check after short delay for state to update)
    setTimeout(() => {
      if (allLoggedToday) {
        bannerY.value = withTiming(0, { duration: 300 });
        setTimeout(() => {
          bannerY.value = withTiming(-80, { duration: 300 });
          setTimeout(() => setShowAllDoneBanner(false), 300);
        }, 2000);
        setShowAllDoneBanner(true);
      }
    }, 200);
  };

  const handleDecrement = async () => {
    if (!id || !user?.id || todayCount <= 0 || undoInFlight.current) return;
    undoInFlight.current = true;
    if (Platform.OS !== 'web') await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    // Find the most recent increment event for today and delete it
    const todayIncrements = events
      .filter((e) => e.event_type === 'increment' && e.occurred_local_date === todayStr && !e.deleted_at)
      .sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime());

    const lastEvent = todayIncrements[0];
    if (!lastEvent) {
      undoInFlight.current = false;
      return;
    }

    useEventsStore
      .getState()
      .deleteEvent(lastEvent.id)
      .catch((error) => {
        logger.error('undo failed:', error);
        Alert.alert('Error', 'Could not undo');
      })
      .finally(() => {
        undoInFlight.current = false;
      });
  };

  const handleReset = () => {
    if (!id || !user?.id || todayCount === 0 || !counter) return;
    Alert.alert(
      "Reset today's progress",
      `Remove today's ${todayCount} log${todayCount === 1 ? '' : 's'} for "${counter.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            try {
              const freshEvents = useEventsStore.getState().events;
              const todayIncrements = freshEvents.filter(
                (e) =>
                  e.mark_id === id &&
                  e.event_type === 'increment' &&
                  e.occurred_local_date === todayStr &&
                  !e.deleted_at,
              );
              for (const event of todayIncrements) {
                await useEventsStore.getState().deleteEvent(event.id);
              }
            } catch (error) {
              logger.error('reset today failed:', error);
              Alert.alert('Error', 'Could not reset progress for today');
            }
          },
        },
      ],
    );
  };

  const handleDeleteMark = () => {
    if (!id) return;
    Alert.alert(
      'Delete mark?',
      `Remove "${counter.name}"? This deletes the mark and its activity${user?.id ? ' from your account' : ''}.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () =>
            Alert.alert('Are you sure?', `This permanently deletes "${counter.name}".`, [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Delete forever',
                style: 'destructive',
                onPress: async () => {
                  try {
                    await deleteCounter(id);
                    router.replace('/(tabs)/focus' as any);
                  } catch (error) {
                    logger.error('delete mark failed:', error);
                    Alert.alert('Error', 'Could not delete this mark.');
                  }
                },
              },
            ]),
        },
      ],
    );
  };

  const handleSaveNote = async () => {
    if (!id || !canSaveNote || noteFieldBusy) return;
    setSavingNote(true);
    try {
      await upsertDailyLogNote(id, noteUserId, todayStr, draftTrimmed);
      // Do NOT clear draftNote — keep saved text visible in TextInput.
      // canSaveNote will become false once savedTrimmed matches draftTrimmed.
    } catch (error) {
      logger.error('save note failed:', error);
      Alert.alert('Error', 'Could not save your note.');
    } finally {
      setSavingNote(false);
    }
  };

  const handleDeleteNote = () => {
    if (!todayDailyLog?.id || !hasSavedNote || noteFieldBusy) return;
    Alert.alert('Delete note?', 'Remove the saved note for today?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setDeletingNote(true);
          try {
            await deleteDailyLogNote(todayDailyLog.id);
            setDraftNote('');
          } catch (error) {
            logger.error('delete note failed:', error);
            Alert.alert('Error', 'Could not delete the note.');
          } finally {
            setDeletingNote(false);
          }
        },
      },
    ]);
  };

  const handleConnectHealth = async () => {
    const status = await checkProStatus();
    if (!status.effectiveUnlocked) {
      router.push('/paywall');
      return;
    }
    setHealthModalVisible(true);
  };

  const handleHealthTypeSelect = async (type: HealthKitType) => {
    if (type === 'steps') {
      setHealthPendingType(type);
      const suggested = await suggestStepGoal();
      setHealthStepGoal(suggested !== null ? String(suggested) : '');
      return;
    }
    await confirmHealthConnection(type, undefined);
  };

  const confirmHealthConnection = async (type: HealthKitType, stepGoal: number | undefined) => {
    if (!id) return;
    setHealthConnecting(true);
    try {
      await requestPermissions([type]);
      const config = type === 'steps' && stepGoal !== undefined ? { stepGoal } : null;
      await updateMark(id, { health_kit_type: type, health_kit_config: config });
      if (type === 'sleep') {
        let wakeTime = await getSleepNotifTime(id);
        if (!wakeTime) wakeTime = await suggestWakeTime();
        if (wakeTime) {
          await setSleepNotifTime(id, wakeTime);
          await scheduleSleepNotification(id, wakeTime);
        }
      }
    } catch {
      Alert.alert('Could not connect', 'Health permissions could not be requested. Try Settings → Privacy → Health.');
    } finally {
      setHealthConnecting(false);
      setHealthModalVisible(false);
      setHealthPendingType(null);
    }
  };

  const handleDisconnectHealth = async () => {
    if (!id) return;
    Alert.alert('Disconnect Apple Health?', 'Your weekly reflection will return to manual check-ins.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Disconnect',
        style: 'destructive',
        onPress: async () => {
          await updateMark(id, { health_kit_type: null, health_kit_config: null });
          await cancelSleepNotification(id);
        },
      },
    ]);
  };

  const handleFrequencyChange = useCallback((target: number) => {
    if (!id) return;
    updateMark(id, { weekly_target: target });
  }, [id, updateMark]);

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: c.linen }]} edges={['top']}>
      <LivraHeader
        showBack
        title={counter.name}
        rightIcon={Trash}
        onRightPress={handleDeleteMark}
      />

      {/* All Done Today Banner */}
      {showAllDoneBanner && (
        <Animated.View style={[styles.allDoneBanner, bannerStyle]}>
          <Text style={styles.allDoneBannerText}>All done today.</Text>
        </Animated.View>
      )}

      <KeyboardAvoidingView
        style={styles.keyboardAvoid}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top : 0}
      >
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={[
            styles.content,
            { paddingBottom: spacing.xxl + insets.bottom + (Platform.OS === 'android' ? 24 : 12) },
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          showsVerticalScrollIndicator={false}
        >
          {/* ── Hero Area ─────────────────────────────────────────────────── */}
          <View style={styles.heroArea}>
            <View style={[styles.heroIconWrap, { backgroundColor: hexToRgba(accent, 0.15) }]}>
              <CatIcon size={32} color={accent} weight="duotone" />
            </View>
            <Text style={styles.heroTitle}>{counter.name}</Text>
            {counter.unit ? (
              <Text style={styles.heroMeta}>{counter.unit}</Text>
            ) : null}
            {workingTowardGoal ? (
              <TouchableOpacity
                onPress={() => router.push(`/goal/${workingTowardGoal.id}` as any)}
                activeOpacity={0.75}
                style={styles.heroGoalLink}
              >
                <Text style={[styles.heroGoalLinkText, { color: c.inkMuted }]}>
                  Working toward: {workingTowardGoal.title} →
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>

          {/* ── Compact Stat Row ── */}
          <View style={styles.compactStatRow}>
            <View style={styles.compactStatCell}>
              <Text style={styles.compactStatValue}>{todayCount}/{dailyTarget}</Text>
              <Text style={styles.compactStatLabel}>today</Text>
            </View>
            <View style={[styles.compactStatDivider, { backgroundColor: c.borderLight }]} />
            <View style={styles.compactStatCell}>
              <Text style={styles.compactStatValue}>{allTimeTotal}</Text>
              <Text style={styles.compactStatLabel}>all time</Text>
            </View>
          </View>

          {/* ── Log Button ────────────────────────────────────────────────── */}
          <Animated.View style={[styles.logBtnWrap, logBtnStyle]}>
            <TouchableOpacity
              style={[styles.logBtn, completedToday && styles.logBtnDone]}
              onPress={handleLog}
              disabled={completedToday}
              activeOpacity={0.85}
              accessibilityLabel={completedToday ? 'Logged today' : 'Log today'}
            >
              {completedToday ? (
                <>
                  <Check size={18} color="#C47E8A" weight="duotone" />
                  <Text style={styles.logBtnTextDone}>Logged today</Text>
                </>
              ) : (
                <>
                  <CheckCircle size={22} color={c.inkInverse} weight="duotone" />
                  <Text style={styles.logBtnText}>Log today</Text>
                </>
              )}
            </TouchableOpacity>
          </Animated.View>

          {/* Secondary actions */}
          {todayCount > 0 && (
            <View style={styles.secondaryRow}>
              <TouchableOpacity onPress={handleDecrement} hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }} style={styles.secondaryBtn}>
                <Text style={styles.secondaryText}>Undo</Text>
              </TouchableOpacity>
              <View style={styles.secondarySep} />
              <TouchableOpacity onPress={handleReset} hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }} style={styles.secondaryBtn}>
                <Text style={styles.secondaryText}>Reset today</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ── Linked Goals ────────────────────────────────────────────── */}
          <View style={styles.section}>
            <SectionLabel style={styles.sectionLabelPad}>FEEDING INTO</SectionLabel>
            {linkedGoals.length > 0 ? (
              linkedGoals.map(goal => {
                const progress = goal.target_mark_count && goal.target_mark_count > 0
                  ? Math.round(((goal.current_mark_count ?? 0) / goal.target_mark_count) * 100)
                  : null;
                return (
                  <View key={goal.id} style={styles.linkedGoalRow}>
                    <Flag size={14} color={c.inkMuted} weight="duotone" />
                    <Text style={styles.linkedGoalTitle}>{goal.title}</Text>
                    {progress !== null && (
                      <Text style={styles.linkedGoalProgress}>→ {progress}% complete</Text>
                    )}
                  </View>
                );
              })
            ) : (
              <View style={styles.linkedGoalRow}>
                <Text style={styles.noLinkedGoals}>Not linked to any goals yet.</Text>
              </View>
            )}
          </View>

          {/* ── History ─────────────────────────────────────────────────── */}
          <View style={styles.section}>
            <SectionLabel style={styles.sectionLabelPad}>HISTORY</SectionLabel>
            {recentActivity.length > 0 ? (
              recentActivity.map((date) => {
                // date is a 'yyyy-MM-dd' string — parse as local midnight to avoid UTC shift
                const [y, m, d] = date.split('-').map(Number);
                const dt = new Date(y, m - 1, d);
                const dateNote = notesByDate.get(date);
                const isExpanded = expandedActivityDate === date;
                return (
                  <TouchableOpacity
                    key={date}
                    style={styles.historyRow}
                    activeOpacity={dateNote ? 0.82 : 1}
                    onPress={() => {
                      if (!dateNote) return;
                      setExpandedActivityDate(isExpanded ? null : date);
                    }}
                  >
                    <Text style={styles.historyDate}>
                      {dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                    </Text>
                    <Check size={14} color={c.forest} weight="duotone" />
                  </TouchableOpacity>
                );
              })
            ) : (
              <Text style={styles.noHistoryText}>No history yet.</Text>
            )}
          </View>

          {/* ── Today's note ─────────────────────────────────────────────── */}
          <View
            onLayout={(e) => { noteSectionYRef.current = e.nativeEvent.layout.y; }}
            style={styles.noteCard}
          >
            <Text style={styles.noteSectionLabel}>TODAY'S NOTE</Text>
            <TextInput
              value={draftNote}
              onChangeText={(t) => setDraftNote(t.slice(0, NOTE_MAX_LEN))}
              placeholder="What did you do today?"
              placeholderTextColor={c.inkMuted}
              multiline
              editable={!noteFieldBusy}
              onFocus={scrollNoteIntoView}
              onBlur={async () => {
                const draft = draftNote.trim();
                const saved = savedNoteText.trim();
                if (!id || !noteUserId || draft === saved) return;
                await upsertDailyLogNote(id, noteUserId, todayStr, draft);
              }}
              style={styles.noteInput}
              textAlignVertical="top"
            />
            <View style={styles.noteActionsRow}>
              {hasSavedNote && draftTrimmed === savedTrimmed ? (
                <Text style={styles.noteSavedIndicator}>Saved</Text>
              ) : (
                <Text style={styles.noteCharCount}>{draftNote.length}/{NOTE_MAX_LEN}</Text>
              )}
              {hasSavedNote && (
                <TouchableOpacity onPress={handleDeleteNote} disabled={noteFieldBusy} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text style={[styles.noteDeleteText, noteFieldBusy && { opacity: 0.4 }]}>Delete</Text>
                </TouchableOpacity>
              )}
            </View>
            {notesCloudError ? (
              <View style={styles.noteCloudRow}>
                <Text style={styles.noteCloudHint}>{notesCloudError}</Text>
                <TouchableOpacity onPress={() => clearNotesCloudError()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text style={styles.noteCloudDismiss}>Dismiss</Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </View>

          {/* ── Past notes ───────────────────────────────────────────────── */}
          {markNotes.length > 0 && (
            <View style={styles.noteCard}>
              <Text style={styles.noteSectionLabel}>PREVIOUS NOTES</Text>
              {markNotes.map((note, i) => {
                const [y, mo, d] = note.date.split('-').map(Number);
                const dt = new Date(y, mo - 1, d);
                const dateLabel = dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                const isExpanded = expandedNoteIds.has(note.date);
                const toggleExpand = () =>
                  setExpandedNoteIds(prev => {
                    const next = new Set(prev);
                    if (next.has(note.date)) { next.delete(note.date); } else { next.add(note.date); }
                    return next;
                  });
                return (
                  <View key={note.date}>
                    {i > 0 && <View style={styles.pastNoteSeparator} />}
                    <TouchableOpacity style={styles.pastNoteRow} onPress={toggleExpand} activeOpacity={0.75}>
                      <View style={styles.pastNoteContent}>
                        <Text style={styles.pastNoteDate}>{dateLabel}</Text>
                        <Text style={styles.pastNoteText} numberOfLines={isExpanded ? undefined : 3}>
                          {note.text.trim()}
                        </Text>
                      </View>
                      {isExpanded
                        ? <CaretUp size={14} color={c.inkMuted} weight="bold" />
                        : <CaretDown size={14} color={c.inkMuted} weight="bold" />}
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          )}

          {/* ── Frequency ─────────────────────────────────────────────────── */}
          {counter.frequency_min != null && (
            <View style={styles.settingCard}>
              <View style={styles.settingRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.settingLabel}>Frequency</Text>
                  <View style={{ marginTop: spacing.sm }}>
                    <MarkFrequencyPicker mark={counter} onChange={handleFrequencyChange} />
                  </View>
                </View>
              </View>
            </View>
          )}

          {/* ── Daily reminder ────────────────────────────────────────────── */}
          {!reminderLoading && (
            <View style={styles.settingCard}>
              <View style={styles.settingRow}>
                <View style={[styles.settingIcon, { backgroundColor: hexToRgba(accent, 0.15) }]}>
                  {reminderEnabled
                    ? <Bell size={18} color={accent} weight="duotone" />
                    : <BellSlash size={18} color={accent} weight="duotone" />
                  }
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.settingLabel}>Daily reminder</Text>
                  {reminderEnabled && (
                    <TouchableOpacity onPress={() => setShowTimePicker(v => !v)}>
                      <Text style={styles.settingMeta}>
                        {reminderTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
                <Switch
                  value={reminderEnabled}
                  onValueChange={handleReminderToggle}
                  trackColor={{ false: c.borderMid, true: c.forest }}
                  thumbColor={c.inkInverse}
                />
              </View>
              {reminderEnabled && showTimePicker && (
                <DateTimePicker
                  value={reminderTime}
                  mode="time"
                  display="spinner"
                  onChange={handleReminderTimeChange}
                  style={{ marginTop: spacing.sm }}
                />
              )}
            </View>
          )}

          {/* Wake-up alarm (sleep mark) */}
          {counter?.health_kit_type === 'sleep' && (
            <View style={styles.settingCard}>
              <View style={styles.settingRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.settingLabel}>Wake-Up Alarm</Text>
                  <Text style={styles.settingMeta}>Set your alarm in the Clock app.</Text>
                </View>
                <TouchableOpacity
                  onPress={() => Linking.openURL('clock:')}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
                >
                  <Text style={styles.settingAction}>Open</Text>
                  <ArrowRight size={14} color={c.forest} weight="bold" />
                </TouchableOpacity>
              </View>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Health type picker modal */}
      <Modal
        visible={healthModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => { setHealthModalVisible(false); setHealthPendingType(null); }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Connect to Apple Health</Text>
            {healthPendingType === 'steps' ? (
              <View style={{ gap: spacing.md }}>
                <Text style={styles.modalBody}>How many steps counts as an active day?</Text>
                <TextInput
                  value={healthStepGoal}
                  onChangeText={setHealthStepGoal}
                  keyboardType="number-pad"
                  placeholder="e.g. 8000"
                  placeholderTextColor={c.inkMuted}
                  style={styles.modalInput}
                />
                <TouchableOpacity
                  style={styles.modalBtn}
                  disabled={healthConnecting}
                  onPress={() => {
                    const goal = parseInt(healthStepGoal, 10);
                    if (isNaN(goal) || goal <= 0) {
                      Alert.alert('Invalid goal', 'Enter a number greater than 0.');
                      return;
                    }
                    void confirmHealthConnection('steps', goal);
                  }}
                >
                  <Text style={styles.modalBtnText}>
                    {healthConnecting ? 'Connecting…' : 'Save & Connect'}
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View>
                {(['workout', 'sleep', 'hydration', 'mindful', 'steps', 'running'] as HealthKitType[]).map((type, i, arr) => (
                  <TouchableOpacity
                    key={type}
                    style={[
                      styles.modalOption,
                      { borderBottomWidth: i < arr.length - 1 ? 1 : 0, borderBottomColor: c.borderLight },
                    ]}
                    onPress={() => void handleHealthTypeSelect(type)}
                  >
                    <Text style={styles.modalOptionText}>
                      {type.charAt(0).toUpperCase() + type.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity
                  style={styles.modalCancel}
                  onPress={() => { setHealthModalVisible(false); setHealthPendingType(null); }}
                >
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function createStyles(c: ReturnType<typeof themedColors>) {
  return StyleSheet.create({
  safeArea: { flex: 1 },
  keyboardAvoid: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorText: { fontSize: 17, fontFamily: fonts.sansMedium },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    flexGrow: 1,
    gap: spacing.md,
  },

  // All done banner
  allDoneBanner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    backgroundColor: c.forest,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  allDoneBannerText: {
    fontFamily: fonts.serifItalic,
    fontSize: 20,
    color: c.inkInverse,
  },

  // Hero area
  heroArea: {
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    gap: spacing.sm,
  },
  heroIconWrap: {
    width: 72,
    height: 72,
    borderRadius: borderRadius.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTitle: {
    fontFamily: fonts.serif,
    fontSize: 32,
    color: c.inkDark,
    lineHeight: 36,
    textAlign: 'center',
    marginTop: spacing.lg,
  },
  heroMeta: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: c.inkMuted,
  },
  heroGoalLink: {
    marginTop: 2,
  },
  heroGoalLinkText: {
    fontFamily: fonts.sans,
    fontSize: 12,
    textDecorationLine: 'underline',
  },

  // Compact stat row
  compactStatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
  },
  compactStatCell: {
    flex: 1,
    alignItems: 'center',
  },
  compactStatDivider: {
    width: 1,
    height: 32,
  },
  compactStatValue: {
    fontFamily: fonts.sansSemibold,
    fontSize: 20,
    color: c.inkDark,
  },
  compactStatLabel: {
    fontFamily: fonts.sans,
    fontSize: 12,
    color: c.inkMuted,
    marginTop: 2,
  },

  // Log button
  logBtnWrap: { },
  logBtn: {
    height: 64,
    borderRadius: borderRadius.full,
    backgroundColor: c.forest,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  logBtnDone: {
    backgroundColor: c.surfaceAlt,
    borderWidth: 1,
    borderColor: c.borderMid,
  },
  logBtnText: {
    fontFamily: fonts.serif,
    fontSize: 18,
    color: c.inkInverse,
  },
  logBtnTextDone: {
    fontFamily: fonts.sansMedium,
    fontSize: 16,
    color: c.inkMuted,
  },

  // Secondary actions
  secondaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
    marginBottom: spacing.sm,
  },
  secondaryBtn: { paddingVertical: spacing.xs },
  secondaryText: {
    fontSize: 13,
    fontFamily: fonts.sansMedium,
    color: c.inkMuted,
  },
  secondarySep: {
    width: 1,
    height: 14,
    backgroundColor: c.borderMid,
  },

  // Linked goals
  section: { gap: spacing.sm },
  sectionLabelPad: { },
  linkedGoalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: c.borderLight,
  },
  linkedGoalTitle: {
    flex: 1,
    fontFamily: fonts.sansMedium,
    fontSize: 14,
    color: c.inkDark,
  },
  linkedGoalProgress: {
    fontFamily: fonts.sans,
    fontSize: 12,
    color: c.inkMuted,
  },
  noLinkedGoals: {
    fontFamily: fonts.sans,
    fontSize: 14,
    color: c.inkMuted,
  },

  // History
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: c.borderLight,
  },
  historyDate: {
    fontFamily: fonts.sans,
    fontSize: 14,
    color: c.inkMid,
  },
  noHistoryText: {
    fontFamily: fonts.sans,
    fontSize: 14,
    color: c.inkMuted,
  },

  // Note
  noteCard: {
    backgroundColor: c.surface,
    borderRadius: borderRadius.card,
    padding: spacing.lg,
    gap: spacing.sm,
    ...shadow.card,
  },
  noteSectionLabel: {
    fontSize: 11,
    fontFamily: fonts.sansSemibold,
    color: c.inkMuted,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: spacing.xs,
  },
  noteInput: {
    borderWidth: 1,
    borderColor: c.borderMid,
    borderRadius: 12,
    padding: spacing.md,
    minHeight: 90,
    fontSize: 15,
    fontFamily: fonts.sans,
    color: c.inkDark,
    lineHeight: 22,
    backgroundColor: c.surface,
  },
  noteActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  noteCharCount: { fontSize: 11, fontFamily: fonts.sans, color: c.inkMuted },
  noteSavedIndicator: { fontSize: 11, fontFamily: fonts.sans, color: c.inkMuted },
  noteDeleteText: { fontSize: 13, fontFamily: fonts.sansMedium, color: c.danger },
  noteCloudRow: {
    marginTop: spacing.xs,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: c.borderLight,
    gap: spacing.xs,
  },
  noteCloudHint: { fontSize: 12, fontFamily: fonts.sans, color: c.inkMuted, lineHeight: 18 },
  noteCloudDismiss: { fontSize: 12, fontFamily: fonts.sansMedium, color: c.forest },

  // Past notes
  pastNoteRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  pastNoteContent: { flex: 1, gap: 3 },
  pastNoteDate: { fontSize: 12, fontFamily: fonts.sans, color: c.inkMuted },
  pastNoteText: { fontSize: 14, fontFamily: fonts.sans, color: c.inkDark, lineHeight: 20 },
  pastNoteSeparator: { height: StyleSheet.hairlineWidth, backgroundColor: c.borderLight },

  // Settings cards
  settingCard: {
    borderRadius: borderRadius.card,
    overflow: 'hidden',
    backgroundColor: c.surface,
    ...shadow.card,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    gap: spacing.md,
  },
  settingIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingLabel: { fontSize: 15, fontFamily: fonts.sansMedium, color: c.inkDark },
  settingMeta: { fontSize: 12, fontFamily: fonts.sans, color: c.inkMuted, marginTop: 2 },
  settingAction: { fontSize: 13, fontFamily: fonts.sansMedium, color: c.forest },

  // Modal
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  modalSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: spacing.xl,
    gap: spacing.md,
    backgroundColor: c.surface,
  },
  modalTitle: { fontSize: 18, fontFamily: fonts.sansMedium, color: c.inkDark, marginBottom: spacing.sm },
  modalBody: { fontSize: 14, fontFamily: fonts.sans, color: c.inkMuted, lineHeight: 20 },
  modalInput: {
    borderWidth: 1,
    borderColor: c.borderLight,
    borderRadius: 12,
    padding: spacing.md,
    fontSize: 16,
    fontFamily: fonts.sans,
    color: c.inkDark,
    backgroundColor: c.linen,
  },
  modalBtn: {
    borderRadius: borderRadius.full,
    padding: spacing.md,
    alignItems: 'center',
    backgroundColor: c.forest,
  },
  modalBtnText: { color: c.inkInverse, fontSize: 16, fontFamily: fonts.sansMedium },
  modalOption: { paddingVertical: spacing.md },
  modalOptionText: { fontSize: 16, fontFamily: fonts.sans, color: c.inkDark },
  modalCancel: { paddingVertical: spacing.md, alignItems: 'center', marginTop: spacing.xs },
  modalCancelText: { fontSize: 14, fontFamily: fonts.sans, color: c.inkMuted },
  });
}
