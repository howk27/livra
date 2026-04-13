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
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '../../theme/colors';
import { spacing, borderRadius, fontSize, fontWeight, shadow } from '../../theme/tokens';
import { useEffectiveTheme } from '../../state/uiSlice';
import { useCounters } from '../../hooks/useCounters';
import { useEventsStore } from '../../state/eventsSlice';
import { LoadingScreen } from '../../components/LoadingScreen';
import { useAuth } from '../../hooks/useAuth';
import { logger } from '../../lib/utils/logger';
import { useDailyTrackingStore } from '../../state/dailyTrackingSlice';
import CounterIcon from '@/src/components/icons/CounterIcon';
import { resolveCounterIconType } from '@/src/components/icons/IconResolver';
import { applyOpacity, foregroundForHexBackground } from '@/src/components/icons/color';
import { resolveDailyTarget } from '../../lib/markDailyTarget';
import { getAppDate } from '../../lib/appDate';
import { formatDate } from '../../lib/date';
import { useAppDateStore } from '../../state/appDateSlice';
import { deriveStreakForMark } from '../../hooks/useStreaks';

function toLocalDateStr(d: Date): string {
  return formatDate(d);
}

const NOTE_MAX_LEN = 500;

export default function CounterDetailScreen() {
  const theme = useEffectiveTheme();
  const themeColors = colors[theme];
  const isDark = theme === 'dark';
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ id: string }>();
  const id = typeof params.id === 'string' ? params.id : params.id?.[0];

  const { counters, loading, incrementCounter, decrementCounter, resetCounter, deleteCounter } = useCounters();
  const allEvents = useEventsStore((state) => state.events || []);
  const counter = id ? counters.find((c) => c.id === id) : null;
  const iconType = counter ? resolveCounterIconType(counter) : undefined;

  const [showCheck, setShowCheck] = useState(false);
  const morphAnim = useRef(new Animated.Value(1)).current;
  const [expandedActivityDate, setExpandedActivityDate] = useState<string | null>(null);
  /** Local input only — never written to history/log until Save. */
  const [draftNote, setDraftNote] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [deletingNote, setDeletingNote] = useState(false);
  const noteFieldBusy = savingNote || deletingNote;
  const scrollRef = useRef<ScrollView>(null);
  const noteSectionYRef = useRef(0);
  const appDateKey = useAppDateStore((s) => s.debugDateOverride ?? '');

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

  /** Persisted note for this mark+day — from daily log store only (history / Save / Delete). */
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
    () =>
      dailyLogsForMark.filter((n) => n.date !== todayStr && n.text.trim().length > 0),
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

  const scrollNoteIntoView = useCallback(() => {
    requestAnimationFrame(() => {
      const y = noteSectionYRef.current;
      scrollRef.current?.scrollTo({
        y: Math.max(0, y - spacing.md),
        animated: true,
      });
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

  const markColor = counter.color || themeColors.primary;
  const title = counter.name;
  const cardSheenColors = isDark
    ? [
        applyOpacity(themeColors.surfaceActive, 0.22),
        applyOpacity(themeColors.surface, 0.0),
        applyOpacity(themeColors.surfaceVariant, 0.18),
      ]
    : [
        applyOpacity(themeColors.surfaceActive, 0.36),
        applyOpacity(themeColors.surface, 0.0),
        applyOpacity(themeColors.surfaceVariant, 0.24),
      ];

  const handleIncrement = async () => {
    if (!id || !user?.id) return;
    if (completedToday) return;
    if (Platform.OS !== 'web') await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    incrementCounter(id, user.id, 1).catch((error) => {
      logger.error('increment failed:', error);
      Alert.alert('Error', 'Could not update mark');
    });
  };

  const handleDecrement = async () => {
    if (!id || !user?.id || counter.total <= 0) return;
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
      `Remove today's ${todayCount} log${todayCount === 1 ? '' : 's'} for "${title}"? This does not affect your streak or all-time total.`,
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
      `Remove "${title}" from Livra? This deletes the mark and its activity on this device${
        user?.id ? ' and from your account when synced' : ''
      }.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Are you sure?',
              `This permanently deletes "${title}". This cannot be undone.`,
              [
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
              ],
            );
          },
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
    Alert.alert(
      'Delete note?',
      'Remove the saved note for today? This cannot be undone.',
      [
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
      ],
    );
  };

  const primaryActionFg = foregroundForHexBackground(markColor, isDark);

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
            {
              paddingBottom: spacing.xxl + insets.bottom + (Platform.OS === 'android' ? 24 : 12),
            },
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          showsVerticalScrollIndicator={false}
        >
        <View style={styles.topBar}>
          <TouchableOpacity
            style={styles.topIconBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            onPress={() => router.back()}
          >
            <Ionicons name="arrow-back" size={22} color={themeColors.textSecondary} />
          </TouchableOpacity>

          <View style={styles.titleWrap}>
            <View style={[styles.titleIconWrap, { backgroundColor: applyOpacity(markColor, 0.16) }]}>
              {iconType ? (
                <CounterIcon
                  type={iconType}
                  size={20}
                  variant="withBackground"
                  animate="none"
                  fallbackEmoji={counter.emoji || '📊'}
                  ariaLabel={`${title} icon`}
                  color={markColor}
                />
              ) : (
                <Text style={styles.titleEmoji}>{counter.emoji || '📊'}</Text>
              )}
            </View>
            <Text style={[styles.titleText, { color: themeColors.text }]} numberOfLines={1}>{title}</Text>
          </View>

          <View style={styles.topIconGroup}>
            <TouchableOpacity
              style={styles.topIconBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              onPress={() => router.push(`/counter/${id}/edit` as any)}
              accessibilityLabel={`Edit mark ${title}`}
              accessibilityRole="button"
            >
              <Ionicons name="pencil-outline" size={22} color={themeColors.textSecondary} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.topIconBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              onPress={handleDeleteMark}
              accessibilityLabel={`Delete mark ${title}`}
              accessibilityRole="button"
            >
              <Ionicons name="trash-outline" size={24} color={themeColors.error} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.ringBlock}>
          <View style={styles.centerReadout}>
            <Text style={[styles.centerValue, { color: themeColors.text }]}>
              {centerCount}
            </Text>
            <Text style={[styles.centerSub, { color: themeColors.textSecondary }]}>
              {dailyTarget > 1
                ? `of ${dailyTarget} ${String(counter.unit || 'sessions')}`
                : completedToday
                  ? 'Completed today'
                  : 'Tap + when done'}
            </Text>
          </View>
        </View>

        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: themeColors.surface }]}
            onPress={handleDecrement}
            disabled={counter.total <= 0}
            activeOpacity={0.85}
          >
            <Text style={[styles.actionText, { color: themeColors.text }]}>−</Text>
          </TouchableOpacity>

          <Animated.View style={{ transform: [{ scale: morphAnim }] }}>
            <TouchableOpacity
              style={[styles.actionBtnPrimary, { backgroundColor: markColor }, shadow.sm]}
              onPress={handleIncrement}
              activeOpacity={0.88}
            >
              {showCheck ? (
                <Ionicons name="checkmark" size={26} color={primaryActionFg} />
              ) : (
                <Text style={[styles.actionPrimaryText, { color: primaryActionFg }]}>+</Text>
              )}
            </TouchableOpacity>
          </Animated.View>

          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: themeColors.surface }]}
            onPress={handleReset}
            activeOpacity={0.85}
          >
            <Ionicons name="refresh-outline" size={20} color={themeColors.text} />
          </TouchableOpacity>
        </View>

        <View style={styles.statsRow}>
          <View style={[styles.statCard, { backgroundColor: themeColors.surface }]}>
            <LinearGradient
              pointerEvents="none"
              colors={cardSheenColors}
              start={{ x: 0.15, y: 0 }}
              end={{ x: 0.85, y: 1 }}
              style={styles.cardSheen}
            />
            <Text style={[styles.statKicker, { color: themeColors.textTertiary }]}>CURRENT</Text>
            <Text style={[styles.statValue, { color: themeColors.text }]}>{streakDisplay?.current_streak ?? 0} Days</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: themeColors.surface }]}>
            <LinearGradient
              pointerEvents="none"
              colors={cardSheenColors}
              start={{ x: 0.15, y: 0 }}
              end={{ x: 0.85, y: 1 }}
              style={styles.cardSheen}
            />
            <Text style={[styles.statKicker, { color: themeColors.textTertiary }]}>LONGEST</Text>
            <Text style={[styles.statValue, { color: themeColors.text }]}>{streakDisplay?.longest_streak ?? 0} Days</Text>
          </View>
        </View>

        <View
          onLayout={(e) => {
            noteSectionYRef.current = e.nativeEvent.layout.y;
          }}
        >
          <View style={[styles.noteCard, { backgroundColor: themeColors.surface }]}>
          <LinearGradient
            pointerEvents="none"
            colors={cardSheenColors}
            start={{ x: 0.15, y: 0 }}
            end={{ x: 0.85, y: 1 }}
            style={styles.cardSheen}
          />
          <View style={styles.noteHeader}>
            <Text style={[styles.noteTitle, { color: themeColors.text }]}>{"Today's note"}</Text>
            <Text style={[styles.noteDate, { color: themeColors.textSecondary }]}>
              {getAppDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </Text>
          </View>
          <TextInput
            value={draftNote}
            onChangeText={(t) => setDraftNote(t.slice(0, NOTE_MAX_LEN))}
            placeholder="Write a note for today…"
            placeholderTextColor={themeColors.textSecondary}
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
            <View style={styles.noteActionsButtons}>
              {hasSavedNote ? (
                <TouchableOpacity
                  onPress={handleDeleteNote}
                  disabled={noteFieldBusy}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityRole="button"
                  accessibilityLabel="Delete saved note"
                >
                  <Text
                    style={[
                      styles.noteDeleteLabel,
                      { color: noteFieldBusy ? themeColors.textTertiary : themeColors.error },
                    ]}
                  >
                    Delete note
                  </Text>
                </TouchableOpacity>
              ) : (
                <View style={styles.noteDeletePlaceholder} />
              )}
              <TouchableOpacity
                onPress={handleSaveNote}
                disabled={!canSaveNote || noteFieldBusy}
                style={[
                  styles.noteSaveBtn,
                  {
                    backgroundColor:
                      canSaveNote || savingNote ? themeColors.accent.primary : themeColors.surfaceVariant,
                  },
                ]}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Save note"
              >
                {savingNote ? (
                  <ActivityIndicator
                    size="small"
                    color={foregroundForHexBackground(themeColors.accent.primary, isDark)}
                  />
                ) : (
                  <Text
                    style={[
                      styles.noteSaveLabel,
                      {
                        color:
                          canSaveNote
                            ? foregroundForHexBackground(themeColors.accent.primary, isDark)
                            : themeColors.textTertiary,
                      },
                    ]}
                  >
                    Save note
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
              <TouchableOpacity
                onPress={() => clearNotesCloudError()}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel="Dismiss note sync message"
              >
                <Text style={[styles.noteCloudDismiss, { color: themeColors.accent.primary }]}>Dismiss</Text>
              </TouchableOpacity>
            </View>
          ) : null}
          </View>
        </View>

        <View style={styles.activitySection}>
          <Text style={[styles.activityTitle, { color: themeColors.text }]}>Recent Activity</Text>
          {recentActivity.length === 0 ? (
            <View style={[styles.activityCard, { backgroundColor: themeColors.surface }]}>
              <Text style={[styles.activitySub, { color: themeColors.textSecondary }]}>
                No activity yet.
              </Text>
            </View>
          ) : (
            recentActivity.map((event) => {
              const isInc = event.event_type === 'increment';
              const dt = new Date(event.occurred_at);
              const dateNote = notesByDate.get(event.occurred_local_date);
              const isExpanded = expandedActivityDate === event.occurred_local_date;
              return (
                <TouchableOpacity
                  key={event.id}
                  style={[styles.activityCard, { backgroundColor: themeColors.surface }]}
                  activeOpacity={dateNote ? 0.82 : 1}
                  onPress={() => {
                    if (!dateNote) return;
                    setExpandedActivityDate(isExpanded ? null : event.occurred_local_date);
                  }}
                >
                  <LinearGradient
                    pointerEvents="none"
                    colors={cardSheenColors}
                    start={{ x: 0.15, y: 0 }}
                    end={{ x: 0.85, y: 1 }}
                    style={styles.cardSheen}
                  />
                  <View style={[styles.activityStrip, { backgroundColor: isInc ? markColor : themeColors.border }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.activityMain, { color: themeColors.text }]}>
                      {isInc ? 'Completion logged' : 'Adjustment made'}
                    </Text>
                    <Text style={[styles.activitySub, { color: themeColors.textSecondary }]}>
                      {dt.toLocaleDateString('en-US', { weekday: 'short' })} · {dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                    {isExpanded && dateNote && (
                      <View style={[styles.activityNoteRow, { borderTopColor: themeColors.border }]}>
                        <Ionicons name="document-text-outline" size={13} color={markColor} style={{ marginTop: 1 }} />
                        <Text style={[styles.activityNoteText, { color: themeColors.text }]}>
                          {dateNote}
                        </Text>
                      </View>
                    )}
                  </View>
                  <Ionicons
                    name={isExpanded ? 'chevron-down' : 'chevron-forward'}
                    size={18}
                    color={dateNote ? themeColors.textSecondary : themeColors.textTertiary}
                  />
                </TouchableOpacity>
              );
            })
          )}
        </View>

        {markNotes.length > 0 && (
          <View style={styles.activitySection}>
            <Text style={[styles.activityTitle, { color: themeColors.text }]}>Notes</Text>
            {markNotes.map((note) => {
              const noteDate = new Date(note.date + 'T12:00:00');
              return (
                <View key={note.id} style={[styles.activityCard, { backgroundColor: themeColors.surface }]}>
                  <LinearGradient
                    pointerEvents="none"
                    colors={cardSheenColors}
                    start={{ x: 0.15, y: 0 }}
                    end={{ x: 0.85, y: 1 }}
                    style={styles.cardSheen}
                  />
                  <View style={[styles.activityStrip, { backgroundColor: markColor }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.activityMain, { color: themeColors.text }]} numberOfLines={3}>
                      {note.text}
                    </Text>
                    <Text style={[styles.activitySub, { color: themeColors.textSecondary }]}>
                      {noteDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                    </Text>
                  </View>
                  <Ionicons name="document-text-outline" size={18} color={themeColors.textTertiary} />
                </View>
              );
            })}
          </View>
        )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  keyboardAvoid: { flex: 1 },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    flexGrow: 1,
  },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorText: { fontSize: fontSize.lg, fontWeight: fontWeight.semibold },
  topBar: {
    height: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  topIconBtn: {
    width: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topIconGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  titleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flex: 1,
    justifyContent: 'center',
    marginHorizontal: spacing.sm,
  },
  titleIconWrap: {
    width: 24,
    height: 24,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleEmoji: { fontSize: 16 },
  titleText: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    letterSpacing: -0.2,
  },
  ringBlock: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  centerReadout: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 160,
  },
  centerValue: {
    fontSize: 52,
    lineHeight: 56,
    fontWeight: fontWeight.bold,
    letterSpacing: -1,
  },
  centerSub: {
    marginTop: spacing.xs,
    fontSize: fontSize.sm,
    letterSpacing: 2,
    fontWeight: fontWeight.medium,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  actionBtn: {
    width: 64,
    height: 56,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnPrimary: {
    width: 74,
    height: 64,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: {
    fontSize: 28,
    lineHeight: 30,
    fontWeight: fontWeight.bold,
  },
  actionPrimaryText: {
    fontSize: 34,
    lineHeight: 36,
    fontWeight: fontWeight.bold,
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  statCard: {
    flex: 1,
    borderRadius: borderRadius.card,
    padding: spacing.lg,
    gap: spacing.xs,
    overflow: 'hidden',
  },
  statKicker: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    letterSpacing: 1.2,
  },
  statValue: {
    fontSize: fontSize.xl,
    lineHeight: 30,
    fontWeight: fontWeight.bold,
  },
  noteCard: {
    borderRadius: borderRadius.card,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    overflow: 'hidden',
  },
  noteHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  noteTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
  },
  noteDate: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  noteInput: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    minHeight: 100,
    fontSize: fontSize.base,
    lineHeight: 22,
  },
  noteActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  noteCharCount: {
    fontSize: fontSize.xs,
  },
  noteActionsButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  noteDeleteLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  noteDeletePlaceholder: {
    minWidth: 92,
  },
  noteSaveBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    minWidth: 104,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 36,
  },
  noteCloudRow: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: spacing.xs,
  },
  noteCloudHint: {
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
  noteCloudDismiss: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    alignSelf: 'flex-start',
  },
  noteSaveLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
  },
  activitySection: {
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  activityTitle: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
  },
  activityCard: {
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    overflow: 'hidden',
  },
  activityStrip: {
    width: 4,
    height: 28,
    borderRadius: borderRadius.full,
  },
  activityMain: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  activitySub: {
    fontSize: fontSize.sm,
    marginTop: 1,
  },
  activityNoteRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  activityNoteText: {
    flex: 1,
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
  cardSheen: {
    ...StyleSheet.absoluteFillObject,
  },
});
