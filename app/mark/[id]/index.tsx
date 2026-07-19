import React, { useMemo, useState, useRef } from 'react';
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
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withDelay,
  withSequence,
  runOnJS,
} from 'react-native-reanimated';
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
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import {
  ArrowRight,
  Check,
  CheckCircle,
  Flag,
  Trash,
} from 'phosphor-react-native';
import { themedColors, spacing, borderRadius, fontSize, fontWeight, shadow, fonts } from '../../../theme/tokens';
import { useEffectiveTheme } from '../../../state/uiSlice';
import { LivraHeader } from '../../../components/ui/LivraHeader';
import { frequencyLabel } from '../../../components/ui/MarkFrequencyPicker';
import { PillButton } from '../../../components/ui/PillButton';
import { SectionLabel } from '../../../components/ui/SectionLabel';
import { useCounters } from '../../../hooks/useCounters';
import { useEventsStore } from '../../../state/eventsSlice';
import { LoadingScreen } from '../../../components/LoadingScreen';
import { useAuth } from '../../../hooks/useAuth';
import { logger } from '../../../lib/utils/logger';
import { resolveLibraryMark, resolveMarkAccent } from '@/lib/markCategoryResolve';
import { resolveDailyTarget } from '../../../lib/markDailyTarget';
import { getEmptyStateCopy } from '../../../lib/moments/emptyState';
import { currentWeekDates, markWeeklyState, computeCompletionsThisWeek } from '../../../lib/features';
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

const HISTORY_COLLAPSED_DAYS = 3;
const HISTORY_MAX_DAYS = 14;

// M4 (PL-5): inherently firstRun — a mark with no logs has no past to return
// from, so the zero-history line carries a single variant.
const EMPTY_HISTORY_LINE = getEmptyStateCopy('markDetail').body;

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function markSubtitle(mark: Pick<import('../../../types').Mark, 'frequency_kind' | 'weekly_target' | 'frequency_recommended' | 'name'>): string | null {
  if (!mark.frequency_kind) return null;
  if (mark.frequency_kind === 'abstinence') return 'Every day';
  if (mark.frequency_kind === 'fixed') {
    const nameLower = mark.name.toLowerCase();
    if (nameLower.includes('sleep') || nameLower.includes('rest')) return 'Every night';
    return 'Every day';
  }
  const target = mark.weekly_target ?? mark.frequency_recommended ?? null;
  if (target == null) return null;
  return frequencyLabel(target);
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
  // QC2-A: shared resolver — name-first, emoji fallback (immune to library
  // emoji collisions like '🚫').
  const libraryMark = counter ? resolveLibraryMark(counter) : undefined;

  const [historyExpanded, setHistoryExpanded] = useState(false);
  const undoInFlight = useRef(false);
  const appDateKey = useAppDateStore((s) => s.debugDateOverride ?? '');

  const [healthModalVisible, setHealthModalVisible] = useState(false);
  const [healthStepGoal, setHealthStepGoal] = useState<string>('');
  const [healthPendingType, setHealthPendingType] = useState<HealthKitType | null>(null);
  const [healthConnecting, setHealthConnecting] = useState(false);

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

  const weekDates = useMemo(() => currentWeekDates(), [appDateKey]);

  const completionsThisWeek = useMemo(
    () => (counter ? computeCompletionsThisWeek(counter, events, weekDates) : 0),
    [counter, events, weekDates],
  );

  const weeklyState = useMemo(
    () => (counter ? markWeeklyState(counter, completionsThisWeek) : 'due'),
    [counter, completionsThisWeek],
  );

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
      .slice(0, HISTORY_MAX_DAYS)
      .map(([date]) => date);
  }, [events]);

  const visibleActivity = historyExpanded
    ? recentActivity
    : recentActivity.slice(0, HISTORY_COLLAPSED_DAYS);
  const hiddenHistoryCount = recentActivity.length - HISTORY_COLLAPSED_DAYS;

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

  // Log button animation
  const logBtnScale = useSharedValue(1);
  const logBtnStyle = useAnimatedStyle(() => ({
    transform: [{ scale: logBtnScale.value }],
  }));

  const bannerStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: bannerY.value }],
  }));

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
  // M7-QC3: the hero tint is the mark's OWN per-icon accent, the same hue its
  // Focus row and create-grid tile show — not the category accent (catData),
  // which collapsed warm-category marks onto a shared amber/tan.
  const accent = resolveMarkAccent({ name: counter.name, emoji: counter.emoji, color: counter.color });
  // QC2-A: the mark's OWN library icon; category icon only for custom marks.
  const CatIcon = libraryMark?.icon ?? catData.Icon;

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
            {(() => {
              const sub = markSubtitle(counter);
              const goalName = workingTowardGoal?.title ?? null;
              const display = sub ?? goalName;
              if (!display) return null;
              return <Text style={styles.heroMeta}>{display}</Text>;
            })()}
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
                  <Check size={18} color={c.ember} weight="bold" />
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

          {/* ── Done for week ────────────────────────────────────────────── */}
          {weeklyState === 'doneForWeek' && counter?.frequency_kind === 'variable' && completedToday && (
            <View style={styles.doneForWeekWrap}>
              <Text style={[styles.doneForWeekText, { color: c.inkMuted }]}>
                {`You've hit your ${counter.weekly_target ?? 3} this week. Rest is part of it.`}
              </Text>
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
              visibleActivity.map((date) => {
                // date is a 'yyyy-MM-dd' string — parse as local midnight to avoid UTC shift
                const [y, m, d] = date.split('-').map(Number);
                const dt = new Date(y, m - 1, d);
                return (
                  <View key={date} style={styles.historyRow}>
                    <Text style={styles.historyDate}>
                      {dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                    </Text>
                    <Check size={14} color={c.ember} weight="bold" />
                  </View>
                );
              })
            ) : (
              <Text style={styles.noHistoryText}>{EMPTY_HISTORY_LINE}</Text>
            )}
            {hiddenHistoryCount > 0 && (
              <TouchableOpacity
                style={styles.historyExpanderRow}
                onPress={() => setHistoryExpanded((v) => !v)}
                activeOpacity={0.7}
              >
                <Text style={[styles.historyExpanderText, { color: c.accent }]}>
                  {historyExpanded ? 'Show less' : `Show ${hiddenHistoryCount} more`}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Per-mark notes moved to the goal-level journal (QC3-D). The daily
              note UI was removed here; reflection now lives on the goal detail
              and its full journal screen. */}

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
                  <ArrowRight size={14} color={c.accent} weight="bold" />
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
  errorText: { fontSize: fontSize[17], fontFamily: fonts.sansMedium },
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
    fontFamily: fonts.sansItalic,
    fontSize: fontSize.xl,
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
    fontFamily: fonts.sansBold,
    fontSize: fontSize['3xl'],
    color: c.inkDark,
    lineHeight: 36,
    textAlign: 'center',
    marginTop: spacing.lg,
  },
  heroMeta: {
    fontFamily: fonts.sans,
    fontSize: fontSize[13],
    color: c.inkMuted,
  },
  heroGoalLink: {
    marginTop: 2,
  },
  heroGoalLinkText: {
    fontFamily: fonts.sans,
    fontSize: fontSize.sm,
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
    fontSize: fontSize.xl,
    color: c.inkDark,
  },
  compactStatLabel: {
    fontFamily: fonts.sans,
    fontSize: fontSize.sm,
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
    fontFamily: fonts.sansBold,
    fontSize: fontSize[18],
    color: c.inkInverse,
  },
  logBtnTextDone: {
    fontFamily: fonts.sansMedium,
    fontSize: fontSize.lg,
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
    fontSize: fontSize[13],
    fontFamily: fonts.sansMedium,
    color: c.inkMuted,
  },
  secondarySep: {
    width: 1,
    height: 14,
    backgroundColor: c.borderMid,
  },

  // Done for week
  doneForWeekWrap: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    gap: spacing.sm,
  },
  doneForWeekText: {
    fontSize: fontSize[13],
    fontFamily: fonts.sans,
    textAlign: 'center',
    lineHeight: 19,
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
    fontSize: fontSize.base,
    color: c.inkDark,
  },
  linkedGoalProgress: {
    fontFamily: fonts.sans,
    fontSize: fontSize.sm,
    color: c.inkMuted,
  },
  noLinkedGoals: {
    fontFamily: fonts.sans,
    fontSize: fontSize.base,
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
    fontSize: fontSize.base,
    color: c.inkMid,
  },
  // Mentor voice line (PL-5): serifItalic + inkMid, matching the other empty invitations.
  noHistoryText: {
    fontFamily: fonts.sansItalic,
    fontSize: fontSize.lg,
    lineHeight: 22,
    color: c.inkMid,
  },
  historyExpanderRow: {
    paddingVertical: spacing.sm,
  },
  historyExpanderText: {
    fontFamily: fonts.sansMedium,
    fontSize: fontSize.sm,
  },

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
  settingLabel: { fontSize: fontSize.md, fontFamily: fonts.sansMedium, color: c.inkDark },
  settingMeta: { fontSize: fontSize.sm, fontFamily: fonts.sans, color: c.inkMuted, marginTop: 2 },
  settingAction: { fontSize: fontSize[13], fontFamily: fonts.sansMedium, color: c.accent },

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
  modalTitle: { fontSize: fontSize[18], fontFamily: fonts.sansMedium, color: c.inkDark, marginBottom: spacing.sm },
  modalBody: { fontSize: fontSize.base, fontFamily: fonts.sans, color: c.inkMuted, lineHeight: 20 },
  modalInput: {
    borderWidth: 1,
    borderColor: c.borderLight,
    borderRadius: 12,
    padding: spacing.md,
    fontSize: fontSize.lg,
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
  modalBtnText: { color: c.inkInverse, fontSize: fontSize.lg, fontFamily: fonts.sansMedium },
  modalOption: { paddingVertical: spacing.md },
  modalOptionText: { fontSize: fontSize.lg, fontFamily: fonts.sans, color: c.inkDark },
  modalCancel: { paddingVertical: spacing.md, alignItems: 'center', marginTop: spacing.xs },
  modalCancelText: { fontSize: fontSize.base, fontFamily: fonts.sans, color: c.inkMuted },
  });
}
