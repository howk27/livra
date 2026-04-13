import React, { useEffect, useMemo, useState } from 'react';
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
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { spacing, borderRadius, fontSize, fontWeight, shadow } from '../../theme/tokens';
import { useEffectiveTheme } from '../../state/uiSlice';
import { useCounters } from '../../hooks/useCounters';
import { SuggestedCountersList } from '../../components/SuggestedCountersList';
import { SuggestedCounter } from '../../lib/suggestedCounters';
import { useAuth } from '../../hooks/useAuth';
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

// Mapping of icon types to emojis for storage compatibility
const ICON_TYPE_TO_EMOJI: Record<Exclude<MarkType, 'custom'>, string> = {
  email: '📧',
  planning: '🗓️',
  focus: '🎯',
  tasks: '✅',
  language: '🗣️',
  study: '📚',
  reading: '📖',
  calories: '🔥',
  soda_free: '🥤',
  rest: '🛌',
  meditation: '🧘',
  sleep: '🌙',
  gym: '🏋️',
  steps: '👣',
  water: '💧',
  no_sugar: '🚫',
  no_beer: '🍺',
  no_spending: '💰',
  mood: '😊',
  no_smoking: '🚭',
  screen_free: '📱',
  gratitude: '🙏',
  journaling: '📝',
};

// Icon types available for selection (excluding 'custom')
const ICON_OPTIONS: Exclude<MarkType, 'custom'>[] = [
  'gym',
  'reading',
  'meditation',
  'water',
  'study',
  'focus',
  'email',
  'tasks',
  'language',
  'rest',
  'steps',
  'calories',
];

const COLOR_OPTIONS = ['#3B82F6', '#10B981', '#A855F7', '#F97316', '#EF4444', '#EC4899'];
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
  const themeColors = colors[theme];
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { createCounter, counters } = useCounters();
  const { user } = useAuth();
  const { showError, showSuccess } = useNotification();

  const [mode, setMode] = useState<'suggested' | 'custom'>('suggested');
  const [name, setName] = useState('');
  const [selectedIconType, setSelectedIconType] = useState<Exclude<MarkType, 'custom'>>(ICON_OPTIONS[0]);
  const [color, setColor] = useState(() => getCategoryColor(getCategoryForIcon(ICON_OPTIONS[0])));
  const [hasManualColorOverride, setHasManualColorOverride] = useState(false);
  const unit: 'sessions' | 'days' | 'items' = 'sessions';
  const [enableStreak, setEnableStreak] = useState(true);
  const [goalValue, setGoalValue] = useState<number | null>(null);
  const [goalPeriod, setGoalPeriod] = useState<GoalPeriod>('day');
  const [scheduleType, setScheduleType] = useState<ScheduleType>('daily');
  const [scheduleDays, setScheduleDays] = useState<DayOfWeek[]>([]);
  const [loading, setLoading] = useState(false);
  const [dailyTarget, setDailyTarget] = useState(1);
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

  useEffect(() => {
    if (!hasManualColorOverride) {
      setColor(getCategoryColor(selectedCategory));
    }
  }, [selectedCategory, hasManualColorOverride]);

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
    setScheduleDays(next);
  };

  const handleSuggestedCounterSelect = (counter: SuggestedCounter) => {
    setPendingSuggestedCounter(counter);
    setDailyTarget((prev) => prev || 1);
    setHasManualColorOverride(false);
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
        unit: pendingSuggestedCounter.unit,
        enable_streak: true,
        user_id: user?.id!,
        dailyTarget,
      });
      showSuccess('Counter created successfully');
      setPendingSuggestedCounter(null);
      setTimeout(() => {
        router.back();
      }, 300);
    } catch (error) {
      setLoading(false);

      if (error instanceof DuplicateCounterError || error instanceof DuplicateMarkError) {
        const errorName = (error as any).markName || (error as any).counterName || 'Unknown';
        logger.warn(`[Counter] Duplicate counter detected: "${errorName}"`);

        const existingCounter = counters.find(
          (c) => c.name.toLowerCase() === errorName.toLowerCase() && !c.deleted_at
        );

        setDuplicateCounterName(errorName);
        setExistingCounterId(existingCounter?.id || null);
        setShowDuplicateModal(true);
      } else if (error instanceof Error && error.message.includes('PRO_STATUS_UNKNOWN')) {
        logger.warn('[Counter] Subscription status unknown');
        showError('Unable to verify your subscription. Please check your connection and try again.');
      } else if (error instanceof Error && error.message.includes('FREE_COUNTER_LIMIT_REACHED')) {
        logger.warn('[Counter] Counter limit reached for free user');
        showError('Counter limit reached. Upgrade to Livra+ to create unlimited counters.');
        setTimeout(() => {
          router.replace('/paywall');
        }, 2000);
      } else {
        logger.error('Error creating counter:', error);
        const errorMessage = error instanceof Error ? error.message : 'Failed to create counter. Please try again.';
        showError(errorMessage);
      }
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
      await createCounter({
        name: name.trim(),
        emoji,
        color,
        unit,
        enable_streak: enableStreak,
        user_id: user?.id!,
        dailyTarget,
        goal_value: goalValue,
        goal_period: goalPeriod,
        schedule_type: scheduleType,
        schedule_days: scheduleType === 'custom' ? JSON.stringify(scheduleDays) : undefined,
      } as any);
      showSuccess('Counter created successfully');
      setTimeout(() => {
        router.back();
      }, 300);
    } catch (error) {
      setLoading(false);

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
        logger.warn('[Counter] Counter limit reached for free user');
        showError('Counter limit reached. Upgrade to Livra+ to create unlimited counters.');
        setTimeout(() => {
          router.replace('/paywall');
        }, 2000);
      } else {
        logger.error('Error creating counter:', error);
        const errorMessage = error instanceof Error ? error.message : 'Failed to create counter. Please try again.';
        showError(errorMessage);
      }
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={themeColors.primary} />
          <Text style={[styles.loadingText, { color: themeColors.text }]}>Creating counter...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const headerSideWidth = 72;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
      <View style={[styles.header, { borderBottomColor: theme === 'dark' ? 'rgba(255,255,255,0.08)' : themeColors.border }]}>
        <View style={{ width: headerSideWidth }}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={[styles.cancelButton, { color: themeColors.textSecondary }]}>Cancel</Text>
          </TouchableOpacity>
        </View>
        <Text style={[styles.headerTitle, { color: themeColors.text }]} numberOfLines={1}>
          Add a mark
        </Text>
        <View style={{ width: headerSideWidth }} />
      </View>

      <View style={[styles.modeToggle, { backgroundColor: themeColors.surfaceVariant || themeColors.surface }]}>
        <TouchableOpacity
          style={[
            styles.modeButton,
            mode === 'suggested' && { backgroundColor: applyOpacity(themeColors.accent.primary, 0.14) },
          ]}
          onPress={() => setMode('suggested')}
        >
          <Text
            style={[
              styles.modeButtonText,
              { color: mode === 'suggested' ? themeColors.accent.primary : themeColors.textSecondary },
            ]}
          >
            Suggested
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.modeButton,
            mode === 'custom' && { backgroundColor: applyOpacity(themeColors.accent.primary, 0.14) },
          ]}
          onPress={() => {
            setMode('custom');
            setPendingSuggestedCounter(null);
          }}
        >
          <Text
            style={[
              styles.modeButtonText,
              { color: mode === 'custom' ? themeColors.accent.primary : themeColors.textSecondary },
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
                  borderTopColor: themeColors.border,
                  backgroundColor: themeColors.background,
                  paddingBottom: spacing.sm + insets.bottom,
                },
              ]}
            >
              <Text style={[styles.sectionKicker, { color: themeColors.textTertiary, marginBottom: spacing.xs }]}>
                Selected mark
              </Text>
              <Text style={[styles.suggestedSelectionTitle, { color: themeColors.text }]}>
                {pendingSuggestedCounter.name}
              </Text>
              <Text style={[styles.sectionKickerRight, { color: themeColors.textTertiary }]}>
                {getCategoryForSuggestedCounter(pendingSuggestedCounter)}
              </Text>
              <Text style={[styles.suggestedSelectionHint, { color: themeColors.textSecondary }]}>
                Set today&apos;s target, then add it.
              </Text>
              <DailyTargetStepper
                value={dailyTarget}
                onChange={setDailyTarget}
                label={null}
                helperText={
                  pendingSuggestedCounter.unit === 'days'
                    ? 'DAYS'
                    : pendingSuggestedCounter.unit === 'items'
                      ? 'ITEMS'
                      : 'TIMES'
                }
              />
              <TouchableOpacity
                style={[
                  styles.footerCta,
                  styles.suggestedConfirmButton,
                  { backgroundColor: themeColors.accent.primary },
                  shadow.sm,
                ]}
                onPress={handleConfirmSuggestedCounter}
                activeOpacity={0.88}
              >
                <Text style={[styles.footerCtaText, { color: themeColors.text }]}>
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
                  borderColor: themeColors.border,
                },
              ]}
            >
              <Text style={[styles.sectionKicker, { color: themeColors.textTertiary }]}>The habit</Text>
              <TextInput
                style={[
                  styles.inputInCard,
                  {
                    backgroundColor: themeColors.background,
                    color: themeColors.text,
                    borderColor: themeColors.border,
                  },
                ]}
                value={name}
                onChangeText={setName}
                placeholder="What will you track?"
                placeholderTextColor={themeColors.textTertiary}
              />
            </View>

            <View
              style={[
                styles.card,
                {
                  backgroundColor: themeColors.surface,
                  borderColor: themeColors.border,
                },
              ]}
            >
              <View style={styles.sectionHeaderRow}>
                <Text style={[styles.sectionTitle, { color: themeColors.text }]}>Identity</Text>
                <Text style={[styles.sectionKickerRight, { color: themeColors.textTertiary }]}>Choose icon</Text>
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
                          backgroundColor: isSelected ? color + '30' : themeColors.background,
                          borderColor: isSelected ? color : themeColors.border,
                        },
                      ]}
                      onPress={() => setSelectedIconType(iconType)}
                    >
                      <CounterIcon
                        type={iconType as any}
                        size={Math.min(28, Math.floor(iconCellSize * 0.45))}
                        color={isSelected ? color : themeColors.textSecondary}
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
                  borderColor: themeColors.border,
                },
              ]}
            >
              <View style={styles.sectionHeaderRow}>
                <Text style={[styles.sectionTitle, { color: themeColors.text }]}>Vibe</Text>
                <Text style={[styles.sectionKickerRight, { color: themeColors.textTertiary }]}>{selectedCategory}</Text>
              </View>
              <View style={styles.colorGrid}>
                {COLOR_OPTIONS.map((c) => (
                  <TouchableOpacity
                    key={c}
                    style={[
                      styles.colorButton,
                      {
                        backgroundColor: c,
                        borderWidth: c === color ? 3 : 0,
                        borderColor: themeColors.background,
                      },
                    ]}
                    onPress={() => {
                      setHasManualColorOverride(true);
                      setColor(c);
                    }}
                  />
                ))}
              </View>
            </View>

            <View
              style={[
                styles.card,
                {
                  backgroundColor: themeColors.surface,
                  borderColor: themeColors.border,
                },
              ]}
            >
              <Text style={[styles.sectionTitle, { color: themeColors.text, textAlign: 'center', marginBottom: spacing.xs }]}>
                Daily goal
              </Text>
              <Text style={[styles.cardHint, { color: themeColors.textSecondary, textAlign: 'center', marginBottom: spacing.md }]}>
                How many completions count for this mark today?
              </Text>
              <DailyTargetStepper value={dailyTarget} onChange={setDailyTarget} label={null} helperText="TIMES" />
            </View>

            <View
              style={[
                styles.card,
                {
                  backgroundColor: themeColors.surface,
                  borderColor: themeColors.border,
                },
              ]}
            >
              <Text style={[styles.sectionTitle, { color: themeColors.text, marginBottom: spacing.md }]}>Frequency</Text>
              <View style={styles.frequencyRow}>
                {WEEKDAY_CHIPS.map(({ value, label }) => {
                  const active = scheduleDaysForDisplay.includes(value);
                  return (
                    <TouchableOpacity
                      key={`${label}-${value}`}
                      style={[
                        styles.dayChip,
                        {
                          backgroundColor: active ? color : themeColors.background,
                          borderColor: active ? color : themeColors.border,
                        },
                      ]}
                      onPress={() => toggleScheduleDay(value)}
                      activeOpacity={0.8}
                    >
                      <Text
                        style={[
                          styles.dayChipText,
                          {
                          color: active ? foregroundForHexBackground(color, theme === 'dark') : themeColors.textSecondary,
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
            </View>

            <TouchableOpacity
              style={[
                styles.card,
                styles.streakCard,
                {
                  backgroundColor: themeColors.surface,
                  borderColor: themeColors.border,
                },
              ]}
              onPress={() => setEnableStreak(!enableStreak)}
              activeOpacity={0.85}
            >
              <View
                style={[
                  styles.streakIconWrap,
                  { backgroundColor: applyOpacity(color, theme === 'dark' ? 0.22 : 0.14) },
                ]}
              >
                <Ionicons name="stats-chart-outline" size={20} color={color} />
              </View>
              <View style={styles.streakTextWrap}>
                <Text style={[styles.toggleLabel, { color: themeColors.text }]}>Enable streak</Text>
                <Text style={[styles.toggleDescription, { color: themeColors.textSecondary }]}>
                  Track consecutive days with activity
                </Text>
              </View>
              <View
                style={[
                  styles.toggleSwitch,
                  {
                    backgroundColor: enableStreak ? color : themeColors.border,
                    alignItems: enableStreak ? 'flex-end' : 'flex-start',
                  },
                ]}
              >
                <View style={[styles.toggleThumb, { backgroundColor: themeColors.surface }]} />
              </View>
            </TouchableOpacity>

            <View style={{ height: spacing.xl }} />
          </ScrollView>

          <View
            style={[
              styles.footerCtaWrap,
              {
                borderTopColor: themeColors.border,
                backgroundColor: themeColors.background,
                paddingBottom: spacing.sm + insets.bottom,
              },
            ]}
          >
            <TouchableOpacity
              style={[
                styles.footerCta,
                { backgroundColor: themeColors.accent.primary },
                shadow.sm,
              ]}
              onPress={handleSave}
              disabled={loading || !name.trim()}
              activeOpacity={0.88}
            >
              <Text style={[styles.footerCtaText, { color: themeColors.text }]}>
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
            router.push(`/counter/${existingCounterId}`);
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
  colorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  colorButton: {
    width: 50,
    height: 50,
    borderRadius: borderRadius.full,
  },
  frequencyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.xs,
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
    fontSize: 13,
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
