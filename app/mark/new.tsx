import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { themedColors, spacing, borderRadius, fontSize, fontWeight, shadow } from '../../theme/tokens';
import { useEffectiveTheme } from '../../state/uiSlice';
import { useCounters } from '../../hooks/useCounters';
import { SuggestedCountersList } from '../../components/SuggestedCountersList';
import { SuggestedCounter } from '../../lib/suggestedCounters';
import { useAuth } from '../../hooks/useAuth';
import { useGoalsStore } from '../../state/goalsSlice';
import { DuplicateCounterError, DuplicateMarkError } from '../../state/countersSlice';
import type { GoalPeriod, ScheduleType, DayOfWeek } from '../../types';
import { DuplicateCounterModal } from '../../components/DuplicateCounterModal';
import { DailyTargetStepper } from '../../components/DailyTargetStepper';
import { useNotification } from '../../contexts/NotificationContext';
import { logger } from '../../lib/utils/logger';
import CounterIcon from '@/src/components/icons/CounterIcon';
import { applyOpacity, foregroundForHexBackground } from '@/src/components/icons/color';
import type { MarkType } from '@/src/types/counters';
import { getCategoryColor, getCategoryForIcon, getCategoryForSuggestedCounter } from '../../lib/markCategory';
import {
  FrequencyPreset,
  DEFAULT_FREQUENCY_PRESET,
  FREQUENCY_PRESET_LABELS,
  weeklyTargetForPreset,
  scheduleForPreset,
} from '../../lib/markFrequencyPreset';
import { ICON_TYPE_TO_EMOJI, MARK_ICON_OPTIONS } from '../../lib/markIcons';

// VD-7 retry #1: the icon emoji map + selectable list live in lib/markIcons.ts,
// shared with mark/[id]/edit.tsx so the two grids can never diverge.
const ICON_OPTIONS = MARK_ICON_OPTIONS;

const ALL_SCHEDULE_DAYS: DayOfWeek[] = [0, 1, 2, 3, 4, 5, 6];
const WEEKDAY_CHIPS: Array<{ value: DayOfWeek; label: string }> = [
  { value: 1, label: 'M' },
  { value: 2, label: 'T' },
  { value: 3, label: 'W' },
  { value: 4, label: 'T' },
  { value: 5, label: 'F' },
  { value: 6, label: 'S' },
  { value: 0, label: 'S' },
];

const SCREEN_WIDTH = Dimensions.get('window').width;
const ICON_GRID_COLUMNS = 4;

export default function NewCounterScreen() {
  const theme = useEffectiveTheme();
  const themeColors = themedColors(theme);
  const router = useRouter();
  const { goalId: goalIdParam } = useLocalSearchParams<{ goalId?: string }>();
  const insets = useSafeAreaInsets();
  const { createCounter, counters } = useCounters();
  const { user } = useAuth();
  const { showError, showSuccess } = useNotification();
  const activeGoal = useGoalsStore(s => s.goals.find(g => g.status === 'active'));
  const linkMarkToGoal = useGoalsStore(s => s.linkMarkToGoal);
  const targetGoalId = goalIdParam ?? activeGoal?.id ?? null;
  const targetGoalTitle = goalIdParam
    ? useGoalsStore.getState().goals.find(g => g.id === goalIdParam)?.title
    : activeGoal?.title;

  const [mode, setMode] = useState<'suggested' | 'custom'>('suggested');
  const [name, setName] = useState('');
  const [selectedIconType, setSelectedIconType] = useState<Exclude<MarkType, 'custom'>>(ICON_OPTIONS[0]);
  const unit: 'sessions' | 'days' | 'items' = 'sessions';
  const [goalValue, setGoalValue] = useState<number | null>(null);
  const [goalPeriod, setGoalPeriod] = useState<GoalPeriod>('day');
  const [scheduleType, setScheduleType] = useState<ScheduleType>('daily');
  const [scheduleDays, setScheduleDays] = useState<DayOfWeek[]>([]);
  const [frequencyPreset, setFrequencyPreset] = useState<FrequencyPreset>(DEFAULT_FREQUENCY_PRESET);
  const [loading, setLoading] = useState(false);
  const [dailyTarget, setDailyTarget] = useState(1);
  const [linkToGoal, setLinkToGoal] = useState(!!targetGoalId);
  const [pendingSuggestedCounter, setPendingSuggestedCounter] = useState<SuggestedCounter | null>(null);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [duplicateCounterName, setDuplicateCounterName] = useState('');
  const [existingCounterId, setExistingCounterId] = useState<string | null>(null);

  const iconCellSize = useMemo(() => {
    const scrollPad = spacing.lg;
    const cardPad = spacing.lg;
    const rowInner = SCREEN_WIDTH - scrollPad * 2 - cardPad * 2;
    const gap = spacing.sm;
    return (rowInner - gap * (ICON_GRID_COLUMNS - 1)) / ICON_GRID_COLUMNS;
  }, []);
  const selectedCategory = useMemo(() => getCategoryForIcon(selectedIconType), [selectedIconType]);
  // VD-7: color is always the category-derived color — the manual hex palette
  // ("Vibe" grid) is gone; the category label on the icon card is the identity feedback.
  const color = getCategoryColor(selectedCategory);

  const scheduleDaysForDisplay =
    scheduleType === 'daily' ? ALL_SCHEDULE_DAYS : scheduleDays.length > 0 ? scheduleDays : [1, 2, 3, 4, 5];

  const toggleScheduleDay = (day: DayOfWeek) => {
    const current = scheduleDaysForDisplay;
    const hasDay = current.includes(day);
    const next = hasDay
      ? current.filter((d) => d !== day)
      : ([...current, day].sort((a, b) => a - b) as DayOfWeek[]);

    if (next.length === 0) return;

    if (next.length === ALL_SCHEDULE_DAYS.length) {
      setScheduleType('daily');
      setScheduleDays([]);
      return;
    }

    setScheduleType('custom');
    setScheduleDays(next as DayOfWeek[]);
  };

  const handleSuggestedCounterSelect = (counter: SuggestedCounter) => {
    setPendingSuggestedCounter(counter); // show the confirmation footer
  };

  // VD-7 retry #1: single failure handler for both create paths (suggested +
  // custom) — the duplicate/PRO_STATUS_UNKNOWN/FREE_COUNTER_LIMIT_REACHED
  // branching was copied verbatim in each catch block.
  const handleCreateMarkError = (error: unknown) => {
    if (error instanceof DuplicateCounterError || error instanceof DuplicateMarkError) {
      const errorName = (error as any).markName || (error as any).counterName || 'Unknown';
      logger.warn(`[Counter] Duplicate counter detected: "${errorName}"`);

      const existingCounter = counters.find(
        (c) => c.name.toLowerCase() === errorName.toLowerCase() && !c.deleted_at,
      );

      setDuplicateCounterName(errorName);
      setExistingCounterId(existingCounter?.id ?? null);
      setShowDuplicateModal(true);
    } else if (error instanceof Error && error.message.includes('PRO_STATUS_UNKNOWN')) {
      logger.warn('[Counter] Subscription status unknown');
      showError('Unable to verify your subscription. Please check your connection and try again.');
    } else if (error instanceof Error && error.message.includes('FREE_COUNTER_LIMIT_REACHED')) {
      logger.warn('[Counter] Per-goal mark limit reached for free user');
      showError('That’s 3 marks on this goal. Livra+ lets you add more.');
      setTimeout(() => {
        router.replace('/paywall');
      }, 2000);
    } else {
      logger.error('Error creating counter:', error);
      const errorMessage = error instanceof Error ? error.message : 'Could not create the mark. Check your connection and try again.';
      showError(errorMessage);
    }
  };

  const handleConfirmSuggestedCounter = async () => {
    if (!pendingSuggestedCounter) return;

    try {
      setLoading(true);
      const categoryColor = getCategoryColor(getCategoryForSuggestedCounter(pendingSuggestedCounter));
      await createCounter({
        name: pendingSuggestedCounter.name,
        emoji: pendingSuggestedCounter.emoji,
        color: categoryColor,
        unit: 'sessions' as const,
        enable_streak: false,
        user_id: user?.id!,
        dailyTarget,
        frequency_kind: pendingSuggestedCounter.frequencyKind,
        weekly_target: pendingSuggestedCounter.frequency_recommended ?? 3,
      } as any);
      showSuccess('Mark added');
      setPendingSuggestedCounter(null);
      setTimeout(() => {
        router.back();
      }, 300);
    } catch (error) {
      setLoading(false);
      handleCreateMarkError(error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      showError('Give your mark a name first.');
      return;
    }

    try {
      setLoading(true);
      const emoji = ICON_TYPE_TO_EMOJI[selectedIconType] || ICON_TYPE_TO_EMOJI.gym;
      // Cadence comes from the frequency preset (Every day / 3x a week / Custom days).
      // Custom marks are always variable; weekly_target carries the cadence into the
      // consistency engine, schedule_* is planning metadata only.
      const cadenceDays = scheduleDaysForDisplay as DayOfWeek[];
      const weeklyTarget = weeklyTargetForPreset(frequencyPreset, 'variable', cadenceDays.length);
      const schedule = scheduleForPreset(frequencyPreset, cadenceDays);
      const savedMark = await createCounter({
        name: name.trim(),
        emoji,
        color,
        unit,
        enable_streak: false,
        user_id: user?.id!,
        dailyTarget,
        goal_value: goalValue,
        goal_period: goalPeriod,
        schedule_type: schedule.schedule_type,
        schedule_days: schedule.schedule_days,
        weekly_target: weeklyTarget,
        frequency_kind: 'variable',
        ...(linkToGoal && targetGoalId ? { goal_id: targetGoalId } : {}),
      } as any);

      if (linkToGoal && targetGoalId && savedMark?.id) {
        linkMarkToGoal(targetGoalId, savedMark.id).catch(() => {});
      }
      showSuccess('Mark created');
      setTimeout(() => {
        router.back();
      }, 300);
    } catch (error) {
      setLoading(false);
      handleCreateMarkError(error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: themeColors.linen }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={themeColors.forest} />
          <Text style={[styles.loadingText, { color: themeColors.inkDark }]}>Setting up your mark…</Text>
        </View>
      </SafeAreaView>
    );
  }

  const headerSideWidth = 72;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.linen }]}>
      <View style={[styles.header, { borderBottomColor: theme === 'dark' ? applyOpacity(themeColors.inkInverse, 0.08) : themeColors.borderMid }]}>
        <View style={{ width: headerSideWidth }}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={[styles.cancelButton, { color: themeColors.inkMid }]}>Cancel</Text>
          </TouchableOpacity>
        </View>
        <Text style={[styles.headerTitle, { color: themeColors.inkDark }]} numberOfLines={1}>
          Add a mark
        </Text>
        <View style={{ width: headerSideWidth }} />
      </View>

      <View style={[styles.modeToggle, { backgroundColor: themeColors.surfaceAlt || themeColors.surface }]}>
        <TouchableOpacity
          style={[
            styles.modeButton,
            mode === 'suggested' && { backgroundColor: applyOpacity(themeColors.accent, 0.14) },
          ]}
          onPress={() => setMode('suggested')}
        >
          <Text
            style={[
              styles.modeButtonText,
              { color: mode === 'suggested' ? themeColors.accent : themeColors.inkMid },
            ]}
          >
            Suggested
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.modeButton,
            mode === 'custom' && { backgroundColor: applyOpacity(themeColors.accent, 0.14) },
          ]}
          onPress={() => {
            setMode('custom');
            setPendingSuggestedCounter(null);
          }}
        >
          <Text
            style={[
              styles.modeButtonText,
              { color: mode === 'custom' ? themeColors.accent : themeColors.inkMid },
            ]}
          >
            Custom
          </Text>
        </TouchableOpacity>
      </View>

      {mode === 'suggested' ? (
        <View style={styles.suggestedBody}>
          <SuggestedCountersList
            onCounterSelect={handleSuggestedCounterSelect}
            selectedCounters={pendingSuggestedCounter ? [pendingSuggestedCounter] : []}
            contentBottomPadding={pendingSuggestedCounter ? 240 : spacing.xl}
          />
          {pendingSuggestedCounter ? (
            <View
              style={[
                styles.footerCtaWrap,
                styles.suggestedSelectionWrap,
                {
                  borderTopColor: themeColors.borderMid,
                  backgroundColor: themeColors.linen,
                  paddingBottom: spacing.sm + insets.bottom,
                },
              ]}
            >
              <Text style={[styles.sectionKicker, { color: themeColors.inkMuted, marginBottom: spacing.xs }]}>
                Your pick
              </Text>
              <Text style={[styles.suggestedSelectionTitle, { color: themeColors.inkDark }]}>
                {pendingSuggestedCounter.name}
              </Text>
              <Text style={[styles.sectionKickerRight, { color: themeColors.inkMuted }]}>
                {getCategoryForSuggestedCounter(pendingSuggestedCounter)}
              </Text>
              <Text style={[styles.suggestedSelectionHint, { color: themeColors.inkMid }]}>
                Set today&apos;s target, then add it.
              </Text>
              <DailyTargetStepper
                value={dailyTarget}
                onChange={setDailyTarget}
                label={null}
                helperText="TIMES"
              />
              <TouchableOpacity
                style={[
                  styles.footerCta,
                  styles.suggestedConfirmButton,
                  { backgroundColor: themeColors.forest },
                  shadow.sm,
                ]}
                onPress={handleConfirmSuggestedCounter}
                activeOpacity={0.88}
              >
                <Text style={[styles.footerCtaText, { color: themeColors.inkInverse }]}>
                  Add {pendingSuggestedCounter.name}
                </Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
      ) : (
        <>
          <ScrollView
            style={styles.customScroll}
            contentContainerStyle={styles.customScrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View
              style={[
                styles.card,
                {
                  backgroundColor: themeColors.surface,
                  borderColor: themeColors.borderMid,
                },
              ]}
            >
              <Text style={[styles.sectionKicker, { color: themeColors.inkMuted }]}>What you’ll do</Text>
              <TextInput
                style={[
                  styles.inputInCard,
                  {
                    backgroundColor: themeColors.linen,
                    color: themeColors.inkDark,
                    borderColor: themeColors.borderMid,
                  },
                ]}
                value={name}
                onChangeText={setName}
                placeholder="e.g. Morning run"
                placeholderTextColor={themeColors.inkMuted}
              />
            </View>

            <View
              style={[
                styles.card,
                {
                  backgroundColor: themeColors.surface,
                  borderColor: themeColors.borderMid,
                },
              ]}
            >
              <View style={styles.sectionHeaderRow}>
                <Text style={[styles.sectionTitle, { color: themeColors.inkDark }]}>Give it a face</Text>
                <Text style={[styles.sectionKickerRight, { color: themeColors.inkMuted }]}>{selectedCategory}</Text>
              </View>
              <View style={styles.iconGrid}>
                {ICON_OPTIONS.map((iconType) => {
                  const isSelected = iconType === selectedIconType;
                  return (
                    <TouchableOpacity
                      key={iconType}
                      style={[
                        styles.iconButton,
                        {
                          width: iconCellSize,
                          height: iconCellSize,
                          backgroundColor: isSelected ? applyOpacity(color, 0.14) : themeColors.linen,
                          borderColor: isSelected ? color : themeColors.borderMid,
                        },
                      ]}
                      onPress={() => setSelectedIconType(iconType)}
                    >
                      <CounterIcon
                        type={iconType as any}
                        size={Math.min(28, Math.floor(iconCellSize * 0.45))}
                        color={isSelected ? color : themeColors.inkMid}
                        variant="symbol"
                      />
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View
              style={[
                styles.card,
                {
                  backgroundColor: themeColors.surface,
                  borderColor: themeColors.borderMid,
                },
              ]}
            >
              <Text style={[styles.sectionTitle, { color: themeColors.inkDark, textAlign: 'center', marginBottom: spacing.xs }]}>
                Enough for today
              </Text>
              <Text style={[styles.cardHint, { color: themeColors.inkMid, textAlign: 'center', marginBottom: spacing.md }]}>
                How many times makes today count.
              </Text>
              <DailyTargetStepper value={dailyTarget} onChange={setDailyTarget} label={null} helperText="TIMES" />
            </View>

            <View
              style={[
                styles.card,
                {
                  backgroundColor: themeColors.surface,
                  borderColor: themeColors.borderMid,
                },
              ]}
            >
              <Text style={[styles.sectionTitle, { color: themeColors.inkDark, marginBottom: spacing.md }]}>How often</Text>
              <View style={styles.presetRow}>
                {(Object.keys(FREQUENCY_PRESET_LABELS) as FrequencyPreset[]).map((preset) => {
                  const active = preset === frequencyPreset;
                  return (
                    <TouchableOpacity
                      key={preset}
                      style={[
                        styles.presetChip,
                        {
                          backgroundColor: active ? applyOpacity(color, 0.14) : themeColors.linen,
                          borderColor: active ? color : themeColors.borderMid,
                        },
                      ]}
                      onPress={() => setFrequencyPreset(preset)}
                      activeOpacity={0.85}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                    >
                      <Text
                        style={[
                          styles.presetChipText,
                          { color: active ? color : themeColors.inkMid },
                        ]}
                      >
                        {FREQUENCY_PRESET_LABELS[preset]}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {frequencyPreset === 'custom' ? (
                <View style={styles.frequencyRow}>
                  {WEEKDAY_CHIPS.map(({ value, label }) => {
                    const active = scheduleDaysForDisplay.includes(value);
                    return (
                      <TouchableOpacity
                        key={`${label}-${value}`}
                        style={[
                          styles.dayChip,
                          {
                            backgroundColor: active ? color : themeColors.linen,
                            borderColor: active ? color : themeColors.borderMid,
                          },
                        ]}
                        onPress={() => toggleScheduleDay(value)}
                        activeOpacity={0.8}
                      >
                        <Text
                          style={[
                            styles.dayChipText,
                            {
                              color: active ? foregroundForHexBackground(color, theme === 'dark') : themeColors.inkMid,
                              opacity: active ? 1 : 0.72,
                            },
                          ]}
                        >
                          {label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ) : null}

              <Text style={[styles.cadenceHint, { color: themeColors.inkMuted }]}>
                Log as many as you want · a met target never blocks today.
              </Text>
            </View>

            {targetGoalId && targetGoalTitle ? (
              <TouchableOpacity
                style={[styles.card, styles.streakCard, { backgroundColor: themeColors.surface, borderColor: themeColors.borderMid }]}
                onPress={() => setLinkToGoal(!linkToGoal)}
                activeOpacity={0.85}
              >
                <View style={styles.streakTextWrap}>
                  <Text style={[styles.toggleLabel, { color: themeColors.inkDark }]}>Link to goal</Text>
                  <Text style={[styles.toggleDescription, { color: themeColors.inkMid }]} numberOfLines={1}>
                    {targetGoalTitle}
                  </Text>
                </View>
                <View style={[styles.toggleSwitch, { backgroundColor: linkToGoal ? color : themeColors.borderMid, alignItems: linkToGoal ? 'flex-end' : 'flex-start' }]}>
                  <View style={[styles.toggleThumb, { backgroundColor: themeColors.surface }]} />
                </View>
              </TouchableOpacity>
            ) : null}

            <View style={{ height: spacing.xl }} />
          </ScrollView>

          <View
            style={[
              styles.footerCtaWrap,
              {
                borderTopColor: themeColors.borderMid,
                backgroundColor: themeColors.linen,
                paddingBottom: spacing.sm + insets.bottom,
              },
            ]}
          >
            <TouchableOpacity
              style={[
                styles.footerCta,
                { backgroundColor: themeColors.forest },
                shadow.sm,
              ]}
              onPress={handleSave}
              disabled={loading || !name.trim()}
              activeOpacity={0.88}
            >
              <Text style={[styles.footerCtaText, { color: themeColors.inkInverse }]}>
                Create mark →
              </Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      <DuplicateCounterModal
        visible={showDuplicateModal}
        counterName={duplicateCounterName}
        onClose={() => {
          setShowDuplicateModal(false);
          setDuplicateCounterName('');
          setExistingCounterId(null);
        }}
        onGoToCounter={() => {
          setShowDuplicateModal(false);
          if (existingCounterId) {
            router.push(`/mark/${existingCounterId}` as any);
          } else {
            router.back();
          }
          setDuplicateCounterName('');
          setExistingCounterId(null);
        }}
        showGoToButton={!!existingCounterId}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.md,
  },
  loadingText: {
    fontSize: fontSize.base,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: {
    flex: 1,
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
    textAlign: 'center',
  },
  modeToggle: {
    flexDirection: 'row',
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
    borderRadius: borderRadius.md,
    padding: 3,
  },
  modeButton: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
  },
  modeButtonText: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium,
  },
  cancelButton: {
    fontSize: fontSize.base,
  },
  suggestedBody: {
    flex: 1,
  },
  suggestedSelectionWrap: {
    gap: spacing.sm,
  },
  suggestedSelectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
  },
  suggestedSelectionHint: {
    fontSize: fontSize.sm,
    lineHeight: fontSize.sm * 1.35,
  },
  suggestedConfirmButton: {
    marginTop: spacing.xs,
  },
  customScroll: {
    flex: 1,
  },
  customScrollContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    paddingBottom: spacing.lg,
  },
  card: {
    borderRadius: borderRadius.card,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  sectionKicker: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  sectionKickerRight: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  cardHint: {
    fontSize: fontSize.sm,
    lineHeight: fontSize.sm * 1.35,
    marginBottom: spacing.sm,
  },
  inputInCard: {
    padding: spacing.md,
    borderRadius: borderRadius.md,
    fontSize: fontSize.base,
    borderWidth: 1,
  },
  iconGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  iconButton: {
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  presetRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  presetChip: {
    flex: 1,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    borderRadius: borderRadius.md,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  presetChipText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    textAlign: 'center',
  },
  cadenceHint: {
    fontSize: fontSize.xs,
    lineHeight: fontSize.xs * 1.4,
    marginTop: spacing.md,
  },
  frequencyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  dayChip: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  dayChipText: {
    fontSize: fontSize[13],
    fontWeight: fontWeight.semibold,
  },
  unitButtons: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  unitButton: {
    flex: 1,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    borderWidth: 2,
  },
  unitButtonText: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium,
    textTransform: 'capitalize',
  },
  streakCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  streakIconWrap: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  streakTextWrap: {
    flex: 1,
  },
  toggleLabel: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    marginBottom: spacing.xs,
  },
  toggleDescription: {
    fontSize: fontSize.sm,
  },
  toggleSwitch: {
    width: 50,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  toggleThumb: {
    width: 26,
    height: 26,
    borderRadius: 13,
  },
  footerCtaWrap: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  footerCta: {
    paddingVertical: 11,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    width: '100%',
  },
  footerCtaText: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.bold,
  },
});
