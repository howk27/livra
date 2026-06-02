import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Platform,
  Animated,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Switch,
  Linking,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import {
  getMarkReminderTime,
  setMarkReminderTime,
  scheduleMarkReminder,
  cancelMarkReminder,
  clearMarkReminderTime,
} from '../../lib/notifications/markReminder';
import { checkProStatus } from '../../lib/iap/iap';
import { requestPermissions } from '../../lib/health/healthPermissions';
import { suggestStepGoal, suggestWakeTime } from '../../lib/health/healthLearner';
import type { HealthKitType } from '../../lib/health/healthTypes';
import {
  scheduleSleepNotification,
  cancelSleepNotification,
  getSleepNotifTime,
  setSleepNotifTime,
} from '../../lib/notifications/sleepNotification';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import {
  ArrowLeft,
  PencilSimple,
  Trash,
  Bell,
  BellSlash,
  Heart,
  ArrowRight,
  Check,
} from 'phosphor-react-native';
import { colors } from '../../theme/colors';
import { spacing, borderRadius, fontSize, fontWeight, shadow } from '../../theme/tokens';
import { useEffectiveTheme } from '../../state/uiSlice';
import { useCounters } from '../../hooks/useCounters';
import { useEventsStore } from '../../state/eventsSlice';
import { LoadingScreen } from '../../components/LoadingScreen';
import { useAuth } from '../../hooks/useAuth';
import { logger } from '../../lib/utils/logger';
import { useDailyTrackingStore } from '../../state/dailyTrackingSlice';
import { applyOpacity, foregroundForHexBackground } from '@/src/components/icons/color';
import { MARK_LIBRARY } from '@/lib/suggestedCounters';
import { resolveDailyTarget } from '../../lib/markDailyTarget';
import { getAppDate } from '../../lib/appDate';
import { formatDate } from '../../lib/date';
import { useAppDateStore } from '../../state/appDateSlice';
import { deriveStreakForMark } from '../../hooks/useStreaks';
import { HealthConnectBanner } from '../../components/HealthConnectBanner';

function toLocalDateStr(d: Date): string {
  return formatDate(d);
}

const NOTE_MAX_LEN = 500;
const ACCENT = '#FEB729';

export default function CounterDetailScreen() {
  const theme = useEffectiveTheme();
  const themeColors = colors[theme];
  const isDark = theme === 'dark';
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ id: string }>();
  const id = typeof params.id === 'string' ? params.id : params.id?.[0];

  const { counters, loading, incrementCounter, decrementCounter, resetCounter, deleteCounter, updateMark } = useCounters();
  const allEvents = useEventsStore((state) => state.events || []);
  const counter = id ? counters.find((c) => c.id === id) : null;
  const libraryMark = counter ? MARK_LIBRARY.find(m => m.emoji === counter.emoji) : undefined;
  const MarkIcon = libraryMark?.icon;

  const [showCheck, setShowCheck] = useState(false);
  const morphAnim = useRef(new Animated.Value(1)).current;
  const [expandedActivityDate, setExpandedActivityDate] = useState<string | null>(null);
  const [draftNote, setDraftNote] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [deletingNote, setDeletingNote] = useState(false);
  const noteFieldBusy = savingNote || deletingNote;
  const scrollRef = useRef<ScrollView>(null);
  const noteSectionYRef = useRef(0);
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

  const dailyTarget = useMemo(() => (counter ? resolveDailyTarget(counter) : 1), [counter]);
  const completedToday = todayCount >= dailyTarget;
  const centerCount = Math.min(todayCount, dailyTarget);

  const recentActivity = useMemo(
    () =>
      events
        .filter((e) => e.event_type === 'increment' || e.event_type === 'decrement')
        .sort((a, b) => +new Date(b.occurred_at) - +new Date(a.occurred_at))
        .slice(0, 6),
    [events],
  );

  const dailyLogsForMark = useDailyTrackingStore(
    useCallback((s) => (id ? s.getDailyLogsForMark(id, 60) : []), [id]),
  );

  const todayDailyLog = useDailyTrackingStore(
    useCallback((s) => (id ? s.getDailyLogForDate(id, todayStr) : null), [id, todayStr]),
  );

  const upsertDailyLogNote = useDailyTrackingStore((s) => s.upsertDailyLogNote);
  const deleteDailyLogNote = useDailyTrackingStore((s) => s.deleteDailyLogNote);
  const notesCloudError = useDailyTrackingStore((s) => s.notesCloudError);
  const clearNotesCloudError = useDailyTrackingStore((s) => s.clearNotesCloudError);

  const savedNoteText = todayDailyLog?.text ?? '';
  const savedTrimmed = savedNoteText.trim();

  useFocusEffect(
    useCallback(() => {
      if (!id) return;
      const row = useDailyTrackingStore.getState().getDailyLogForDate(id, todayStr);
      setDraftNote(row?.text ?? '');
    }, [id, todayStr]),
  );

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

  useEffect(() => {
    if (!completedToday) {
      setShowCheck(false);
      morphAnim.setValue(1);
      return;
    }
    Animated.timing(morphAnim, { toValue: 0.88, duration: 90, useNativeDriver: true }).start(() => {
      setShowCheck(true);
      Animated.timing(morphAnim, { toValue: 1, duration: 110, useNativeDriver: true }).start();
    });
  }, [completedToday, morphAnim]);

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

  const scrollNoteIntoView = useCallback(() => {
    requestAnimationFrame(() => {
      const y = noteSectionYRef.current;
      scrollRef.current?.scrollTo({ y: Math.max(0, y - spacing.md), animated: true });
    });
  }, []);

  if (loading) return <LoadingScreen />;

  if (!counter || !id) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: themeColors.background }]}>
        <View style={styles.centered}>
          <Text style={[styles.errorText, { color: themeColors.text }]}>Mark not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  const markColor = counter.color || ACCENT;
  const iconBg = applyOpacity(markColor, isDark ? 0.20 : 0.18);
  const iconBgComplete = applyOpacity(markColor, 0.40);

  // ── Handlers ─────────────────────────────────────────────────────────────────

  const handleLog = async () => {
    if (!id || !user?.id || completedToday) return;
    if (Platform.OS !== 'web') await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    incrementCounter(id, user.id, 1).catch((error) => {
      logger.error('increment failed:', error);
      Alert.alert('Error', 'Could not update mark');
    });
  };

  const handleDecrement = async () => {
    if (!id || !user?.id || todayCount <= 0) return;
    if (Platform.OS !== 'web') await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    decrementCounter(id, user.id, 1).catch((error) => {
      logger.error('decrement failed:', error);
      Alert.alert('Error', 'Could not update mark');
    });
  };

  const handleReset = () => {
    if (!id || !user?.id || todayCount === 0) return;
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
              await decrementCounter(id, user.id, todayCount);
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
                    router.replace('/(tabs)/home');
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
      setDraftNote('');
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

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: themeColors.background }]}>
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
          {/* ── Header ─────────────────────────────────────────────────────── */}
          <View style={styles.header}>
            <TouchableOpacity
              style={styles.headerIconBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              onPress={() => router.back()}
              accessibilityLabel="Go back"
            >
              <ArrowLeft size={22} color={themeColors.textSecondary} weight="regular" />
            </TouchableOpacity>

            <View style={styles.headerCenter}>
              <View style={[styles.headerIconWrap, { backgroundColor: iconBg }]}>
                {MarkIcon ? (
                  <MarkIcon weight="duotone" size={18} color={markColor} />
                ) : (
                  <Text style={styles.headerEmoji}>{counter.emoji || '●'}</Text>
                )}
              </View>
              <Text style={[styles.headerTitle, { color: themeColors.text }]} numberOfLines={1}>
                {counter.name}
              </Text>
            </View>

            <View style={styles.headerRight}>
              <TouchableOpacity
                style={styles.headerIconBtn}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                onPress={() => router.push(`/mark/${id}/edit` as any)}
                accessibilityLabel="Edit mark"
              >
                <PencilSimple size={20} color={themeColors.textSecondary} weight="regular" />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.headerIconBtn}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                onPress={handleDeleteMark}
                accessibilityLabel="Delete mark"
              >
                <Trash size={20} color={themeColors.error} weight="regular" />
              </TouchableOpacity>
            </View>
          </View>

          {/* ── Hero ────────────────────────────────────────────────────────── */}
          <View style={styles.hero}>
            {/* Icon */}
            <View
              style={[
                styles.heroIconWrap,
                { backgroundColor: completedToday ? iconBgComplete : iconBg },
              ]}
            >
              {completedToday ? (
                <View style={[styles.heroCheckCircle, { backgroundColor: ACCENT }]}>
                  <Check size={28} color="#111111" weight="bold" />
                </View>
              ) : MarkIcon ? (
                <MarkIcon weight="duotone" size={40} color={markColor} />
              ) : (
                <Text style={styles.heroEmoji}>{counter.emoji || '●'}</Text>
              )}
            </View>

            {/* Count */}
            <Text style={[styles.heroCount, { color: themeColors.text }]}>
              {centerCount}
            </Text>

            <Text style={[styles.heroSub, { color: themeColors.textSecondary }]}>
              {dailyTarget > 1
                ? `of ${dailyTarget} ${counter.unit || 'sessions'}`
                : completedToday
                  ? 'Completed today'
                  : 'Log when done'}
            </Text>
          </View>

          {/* ── Primary action ───────────────────────────────────────────────── */}
          <Animated.View style={[styles.logBtnWrap, { transform: [{ scale: morphAnim }] }]}>
            <TouchableOpacity
              style={[
                styles.logBtn,
                completedToday && styles.logBtnDone,
                { backgroundColor: completedToday ? themeColors.surfaceVariant : ACCENT },
              ]}
              onPress={handleLog}
              disabled={completedToday}
              activeOpacity={0.85}
              accessibilityLabel={completedToday ? 'Logged today' : 'Log for today'}
            >
              {completedToday ? (
                <Text style={[styles.logBtnTextDone, { color: themeColors.textSecondary }]}>
                  Logged today
                </Text>
              ) : (
                <Text style={styles.logBtnText}>Log for today</Text>
              )}
            </TouchableOpacity>
          </Animated.View>

          {/* Secondary actions: undo + reset */}
          {todayCount > 0 && (
            <View style={styles.secondaryRow}>
              <TouchableOpacity
                onPress={handleDecrement}
                hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}
                style={styles.secondaryBtn}
              >
                <Text style={[styles.secondaryText, { color: themeColors.textSecondary }]}>Undo</Text>
              </TouchableOpacity>
              <View style={[styles.secondarySep, { backgroundColor: themeColors.border }]} />
              <TouchableOpacity
                onPress={handleReset}
                hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}
                style={styles.secondaryBtn}
              >
                <Text style={[styles.secondaryText, { color: themeColors.textSecondary }]}>Reset today</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ── Streak row ────────────────────────────────────────────────────── */}
          <View style={styles.statsRow}>
            <View style={[styles.statChip, { backgroundColor: themeColors.surface }]}>
              <Text style={[styles.statLabel, { color: themeColors.textTertiary }]}>CURRENT</Text>
              <Text style={[styles.statVal, { color: themeColors.text }]}>
                {streakDisplay?.current_streak ?? 0}
                <Text style={[styles.statUnit, { color: themeColors.textSecondary }]}> days</Text>
              </Text>
            </View>
            <View style={[styles.statChip, { backgroundColor: themeColors.surface }]}>
              <Text style={[styles.statLabel, { color: themeColors.textTertiary }]}>LONGEST</Text>
              <Text style={[styles.statVal, { color: themeColors.text }]}>
                {streakDisplay?.longest_streak ?? 0}
                <Text style={[styles.statUnit, { color: themeColors.textSecondary }]}> days</Text>
              </Text>
            </View>
          </View>

          {/* ── Calendar heatmap placeholder ──────────────────────────────────── */}
          <View style={[styles.heatmapWrap, { backgroundColor: themeColors.surface }]}>
            <Text style={[styles.sectionTitle, { color: themeColors.text }]}>Activity</Text>
            <View style={styles.heatmapGrid}>
              {Array.from({ length: 35 }).map((_, i) => {
                const daysAgo = 34 - i;
                const dateStr = toLocalDateStr(new Date(Date.now() - daysAgo * 86400000));
                const hasActivity = events.some(
                  e => e.event_type === 'increment' && e.occurred_local_date === dateStr,
                );
                return (
                  <View
                    key={i}
                    style={[
                      styles.heatCell,
                      {
                        backgroundColor: hasActivity
                          ? applyOpacity(markColor, 0.75)
                          : themeColors.surfaceVariant,
                      },
                    ]}
                  />
                );
              })}
            </View>
            <Text style={[styles.heatmapLabel, { color: themeColors.textTertiary }]}>Last 35 days</Text>
          </View>

          {/* ── Today's note ─────────────────────────────────────────────────── */}
          <View
            onLayout={(e) => { noteSectionYRef.current = e.nativeEvent.layout.y; }}
            style={[styles.noteCard, { backgroundColor: themeColors.surface }]}
          >
            <View style={styles.noteHeader}>
              <Text style={[styles.sectionTitle, { color: themeColors.text }]}>Today's note</Text>
              <Text style={[styles.noteDate, { color: themeColors.textSecondary }]}>
                {getAppDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </Text>
            </View>
            <TextInput
              value={draftNote}
              onChangeText={(t) => setDraftNote(t.slice(0, NOTE_MAX_LEN))}
              placeholder="Write a note for today…"
              placeholderTextColor={themeColors.textTertiary}
              multiline
              editable={!noteFieldBusy}
              onFocus={scrollNoteIntoView}
              style={[
                styles.noteInput,
                {
                  color: themeColors.text,
                  borderColor: themeColors.border,
                  backgroundColor: themeColors.background,
                },
              ]}
              textAlignVertical="top"
            />
            <View style={styles.noteActionsRow}>
              <Text style={[styles.noteCharCount, { color: themeColors.textTertiary }]}>
                {draftNote.length}/{NOTE_MAX_LEN}
              </Text>
              <View style={styles.noteButtons}>
                {hasSavedNote && (
                  <TouchableOpacity
                    onPress={handleDeleteNote}
                    disabled={noteFieldBusy}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text style={[styles.noteDeleteText, { color: noteFieldBusy ? themeColors.textTertiary : themeColors.error }]}>
                      Delete
                    </Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  onPress={handleSaveNote}
                  disabled={!canSaveNote || noteFieldBusy}
                  style={[
                    styles.noteSaveBtn,
                    { backgroundColor: canSaveNote ? ACCENT : themeColors.surfaceVariant },
                  ]}
                >
                  {savingNote ? (
                    <ActivityIndicator size="small" color="#111111" />
                  ) : (
                    <Text
                      style={[
                        styles.noteSaveText,
                        { color: canSaveNote ? '#111111' : themeColors.textTertiary },
                      ]}
                    >
                      Save
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
            {notesCloudError ? (
              <View style={[styles.noteCloudRow, { borderTopColor: themeColors.border }]}>
                <Text style={[styles.noteCloudHint, { color: themeColors.textSecondary }]}>
                  {notesCloudError}
                </Text>
                <TouchableOpacity onPress={() => clearNotesCloudError()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text style={[styles.noteCloudDismiss, { color: ACCENT }]}>Dismiss</Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </View>

          {/* ── Recent activity ─────────────────────────────────────────────── */}
          {recentActivity.length > 0 && (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: themeColors.text }]}>Recent</Text>
              {recentActivity.map((event) => {
                const isInc = event.event_type === 'increment';
                const dt = new Date(event.occurred_at);
                const dateNote = notesByDate.get(event.occurred_local_date);
                const isExpanded = expandedActivityDate === event.occurred_local_date;
                return (
                  <TouchableOpacity
                    key={event.id}
                    style={[styles.activityRow, { backgroundColor: themeColors.surface }]}
                    activeOpacity={dateNote ? 0.82 : 1}
                    onPress={() => {
                      if (!dateNote) return;
                      setExpandedActivityDate(isExpanded ? null : event.occurred_local_date);
                    }}
                  >
                    <View
                      style={[
                        styles.activityDot,
                        { backgroundColor: isInc ? markColor : themeColors.border },
                      ]}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.activityMain, { color: themeColors.text }]}>
                        {isInc ? 'Logged' : 'Adjusted'}
                      </Text>
                      <Text style={[styles.activitySub, { color: themeColors.textSecondary }]}>
                        {dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                        {' · '}
                        {dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </Text>
                      {isExpanded && dateNote && (
                        <Text style={[styles.activityNote, { color: themeColors.textSecondary }]}>
                          {dateNote}
                        </Text>
                      )}
                    </View>
                    {dateNote && (
                      <Text style={[styles.activityNoteIcon, { color: themeColors.textTertiary }]}>
                        {isExpanded ? '▲' : '▼'}
                      </Text>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {/* Past notes */}
          {markNotes.length > 0 && (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: themeColors.text }]}>Notes</Text>
              {markNotes.map((note) => {
                const noteDate = new Date(note.date + 'T12:00:00');
                return (
                  <View key={note.id} style={[styles.activityRow, { backgroundColor: themeColors.surface }]}>
                    <View style={[styles.activityDot, { backgroundColor: markColor }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.activityMain, { color: themeColors.text }]} numberOfLines={3}>
                        {note.text}
                      </Text>
                      <Text style={[styles.activitySub, { color: themeColors.textSecondary }]}>
                        {noteDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          <HealthConnectBanner markId={id ?? ''} markName={counter.name} alreadyConnected={!!counter.health_kit_type} />

          {/* ── Apple Health ─────────────────────────────────────────────────── */}
          <View style={[styles.settingCard, { backgroundColor: themeColors.surface }]}>
            <View style={styles.settingRow}>
              <View style={[styles.settingIcon, { backgroundColor: applyOpacity('#FF2D55', 0.15) }]}>
                <Heart size={18} color="#FF2D55" weight="duotone" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.settingLabel, { color: themeColors.text }]}>Apple Health</Text>
                <Text style={[styles.settingMeta, { color: themeColors.textSecondary }]}>
                  {counter.health_kit_type
                    ? `Connected — ${counter.health_kit_type}`
                    : 'Auto-log from Health data'}
                </Text>
              </View>
              {counter.health_kit_type ? (
                <TouchableOpacity onPress={handleDisconnectHealth} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text style={[styles.settingAction, { color: themeColors.error }]}>Disconnect</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity onPress={handleConnectHealth} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text style={[styles.settingAction, { color: ACCENT }]}>Connect</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* ── Daily reminder ────────────────────────────────────────────────── */}
          {!reminderLoading && (
            <View style={[styles.settingCard, { backgroundColor: themeColors.surface }]}>
              <View style={styles.settingRow}>
                <View style={[styles.settingIcon, { backgroundColor: applyOpacity(ACCENT, 0.15) }]}>
                  {reminderEnabled ? (
                    <Bell size={18} color={ACCENT} weight="duotone" />
                  ) : (
                    <BellSlash size={18} color={themeColors.textSecondary} weight="regular" />
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.settingLabel, { color: themeColors.text }]}>Daily reminder</Text>
                  {reminderEnabled && (
                    <TouchableOpacity onPress={() => setShowTimePicker(v => !v)}>
                      <Text style={[styles.settingMeta, { color: themeColors.textSecondary }]}>
                        {reminderTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
                <Switch
                  value={reminderEnabled}
                  onValueChange={handleReminderToggle}
                  trackColor={{ false: themeColors.border, true: ACCENT }}
                  thumbColor="#fff"
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
            <View style={[styles.settingCard, { backgroundColor: themeColors.surface }]}>
              <View style={styles.settingRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.settingLabel, { color: themeColors.text }]}>Wake-Up Alarm</Text>
                  <Text style={[styles.settingMeta, { color: themeColors.textSecondary }]}>
                    Set your alarm in the Clock app.
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => Linking.openURL('clock:')}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
                >
                  <Text style={[styles.settingAction, { color: ACCENT }]}>Open</Text>
                  <ArrowRight size={14} color={ACCENT} weight="bold" />
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
          <View style={[styles.modalSheet, { backgroundColor: themeColors.surface }]}>
            <Text style={[styles.modalTitle, { color: themeColors.text }]}>Connect to Apple Health</Text>
            {healthPendingType === 'steps' ? (
              <View style={{ gap: spacing.md }}>
                <Text style={[styles.modalBody, { color: themeColors.textSecondary }]}>
                  How many steps counts as an active day?
                </Text>
                <TextInput
                  value={healthStepGoal}
                  onChangeText={setHealthStepGoal}
                  keyboardType="number-pad"
                  placeholder="e.g. 8000"
                  placeholderTextColor={themeColors.textTertiary}
                  style={[styles.modalInput, {
                    borderColor: themeColors.border,
                    color: themeColors.text,
                    backgroundColor: themeColors.background,
                  }]}
                />
                <TouchableOpacity
                  style={[styles.modalBtn, { backgroundColor: ACCENT }]}
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
                      { borderBottomColor: themeColors.border, borderBottomWidth: i < arr.length - 1 ? 1 : 0 },
                    ]}
                    onPress={() => void handleHealthTypeSelect(type)}
                  >
                    <Text style={[styles.modalOptionText, { color: themeColors.text }]}>
                      {type.charAt(0).toUpperCase() + type.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity
                  style={styles.modalCancel}
                  onPress={() => { setHealthModalVisible(false); setHealthPendingType(null); }}
                >
                  <Text style={[styles.modalCancelText, { color: themeColors.textSecondary }]}>Cancel</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  keyboardAvoid: { flex: 1 },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    flexGrow: 1,
    gap: spacing.md,
  },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorText: { fontSize: 17, fontFamily: 'Satoshi', fontWeight: fontWeight.semibold },

  // Header
  header: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  headerIconBtn: {
    width: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    marginHorizontal: spacing.sm,
  },
  headerIconWrap: {
    width: 24,
    height: 24,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerEmoji: { fontSize: 14 },
  headerTitle: {
    fontSize: 16,
    fontFamily: 'Satoshi',
    fontWeight: fontWeight.bold,
    letterSpacing: -0.2,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },

  // Hero
  hero: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    gap: spacing.sm,
  },
  heroIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  heroCheckCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroEmoji: { fontSize: 36 },
  heroCount: {
    fontSize: 80,
    fontFamily: 'Satoshi',
    fontWeight: fontWeight.bold,
    lineHeight: 84,
    letterSpacing: -3,
  },
  heroSub: {
    fontSize: 13,
    fontFamily: 'Inter',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },

  // Log button
  logBtnWrap: { marginBottom: spacing.xs },
  logBtn: {
    height: 56,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logBtnDone: {},
  logBtnText: {
    color: '#111111',
    fontSize: 17,
    fontFamily: 'Inter',
    fontWeight: fontWeight.semibold,
  },
  logBtnTextDone: {
    fontSize: 17,
    fontFamily: 'Inter',
    fontWeight: fontWeight.medium,
  },

  // Secondary actions
  secondaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
    marginBottom: spacing.sm,
  },
  secondaryBtn: {
    paddingVertical: spacing.xs,
  },
  secondaryText: {
    fontSize: 13,
    fontFamily: 'Inter',
    fontWeight: fontWeight.medium,
  },
  secondarySep: {
    width: 1,
    height: 14,
  },

  // Stats row
  statsRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  statChip: {
    flex: 1,
    borderRadius: borderRadius.card,
    padding: spacing.lg,
    gap: 4,
  },
  statLabel: {
    fontSize: 10,
    fontFamily: 'Inter',
    fontWeight: fontWeight.bold,
    letterSpacing: 1.5,
  },
  statVal: {
    fontSize: 22,
    fontFamily: 'Satoshi',
    fontWeight: fontWeight.bold,
    letterSpacing: -0.5,
  },
  statUnit: {
    fontSize: 14,
    fontFamily: 'Inter',
    fontWeight: fontWeight.normal,
  },

  // Heatmap
  heatmapWrap: {
    borderRadius: borderRadius.card,
    padding: spacing.lg,
    gap: spacing.md,
  },
  heatmapGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  heatCell: {
    width: 14,
    height: 14,
    borderRadius: 3,
  },
  heatmapLabel: {
    fontSize: 11,
    fontFamily: 'Inter',
  },

  // Note
  noteCard: {
    borderRadius: borderRadius.card,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  noteHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  noteDate: {
    fontSize: 12,
    fontFamily: 'Inter',
    fontWeight: fontWeight.medium,
  },
  noteInput: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: spacing.md,
    minHeight: 90,
    fontSize: 14,
    fontFamily: 'Inter',
    lineHeight: 22,
  },
  noteActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  noteCharCount: {
    fontSize: 11,
    fontFamily: 'Inter',
  },
  noteButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  noteDeleteText: {
    fontSize: 13,
    fontFamily: 'Inter',
    fontWeight: fontWeight.semibold,
  },
  noteSaveBtn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    minWidth: 80,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 34,
  },
  noteSaveText: {
    fontSize: 13,
    fontFamily: 'Inter',
    fontWeight: fontWeight.semibold,
  },
  noteCloudRow: {
    marginTop: spacing.xs,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: spacing.xs,
  },
  noteCloudHint: {
    fontSize: 12,
    fontFamily: 'Inter',
    lineHeight: 18,
  },
  noteCloudDismiss: {
    fontSize: 12,
    fontFamily: 'Inter',
    fontWeight: fontWeight.semibold,
  },

  // Section
  section: { gap: spacing.sm },
  sectionTitle: {
    fontSize: 17,
    fontFamily: 'Satoshi',
    fontWeight: fontWeight.bold,
    letterSpacing: -0.2,
  },

  // Activity
  activityRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderRadius: borderRadius.card,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  activityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 5,
  },
  activityMain: {
    fontSize: 14,
    fontFamily: 'Inter',
    fontWeight: fontWeight.semibold,
  },
  activitySub: {
    fontSize: 12,
    fontFamily: 'Inter',
    marginTop: 2,
  },
  activityNote: {
    fontSize: 13,
    fontFamily: 'Inter',
    lineHeight: 18,
    marginTop: spacing.xs,
  },
  activityNoteIcon: {
    fontSize: 10,
    marginTop: 6,
  },

  // Settings cards
  settingCard: {
    borderRadius: borderRadius.card,
    overflow: 'hidden',
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
  settingLabel: {
    fontSize: 15,
    fontFamily: 'Satoshi',
    fontWeight: fontWeight.semibold,
  },
  settingMeta: {
    fontSize: 12,
    fontFamily: 'Inter',
    marginTop: 2,
  },
  settingAction: {
    fontSize: 13,
    fontFamily: 'Inter',
    fontWeight: fontWeight.semibold,
  },

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
  },
  modalTitle: {
    fontSize: 18,
    fontFamily: 'Satoshi',
    fontWeight: fontWeight.bold,
    marginBottom: spacing.sm,
  },
  modalBody: {
    fontSize: 14,
    fontFamily: 'Inter',
    lineHeight: 20,
  },
  modalInput: {
    borderWidth: 1,
    borderRadius: 12,
    padding: spacing.md,
    fontSize: 16,
    fontFamily: 'Inter',
  },
  modalBtn: {
    borderRadius: borderRadius.full,
    padding: spacing.md,
    alignItems: 'center',
  },
  modalBtnText: {
    color: '#111111',
    fontSize: 16,
    fontFamily: 'Inter',
    fontWeight: fontWeight.semibold,
  },
  modalOption: {
    paddingVertical: spacing.md,
  },
  modalOptionText: {
    fontSize: 16,
    fontFamily: 'Inter',
  },
  modalCancel: {
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  modalCancelText: {
    fontSize: 14,
    fontFamily: 'Inter',
  },
});
