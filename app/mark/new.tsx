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
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import {
  themedColors,
  spacing,
  borderRadius,
  fontSize,
  fontWeight,
  shadow,
  headerControl,
  headerControlBoxLeading,
} from '../../theme/tokens';
import { useEffectiveTheme } from '../../state/uiSlice';
import { useMotion } from '../../hooks/useMotion';
import { useCounters } from '../../hooks/useCounters';
import { SuggestedCounter, MARK_LIBRARY_BY_ID } from '../../lib/suggestedCounters';
import { useAuth } from '../../hooks/useAuth';
import { useGoalsStore } from '../../state/goalsSlice';
import { getActiveGoals } from '../../lib/goalLogic';
import { DuplicateCounterError, DuplicateMarkError } from '../../state/countersSlice';
import type { GoalPeriod, ScheduleType, DayOfWeek } from '../../types';
import { DuplicateCounterModal } from '../../components/DuplicateCounterModal';
import { DailyTargetStepper } from '../../components/DailyTargetStepper';
import { useNotification } from '../../contexts/NotificationContext';
import { logger } from '../../lib/utils/logger';
import CounterIcon from '@/src/components/icons/CounterIcon';
import { applyOpacity, foregroundForHexBackground } from '@/src/components/icons/color';
import type { MarkType } from '@/src/types/counters';
import { colorForSuggestedCounter, getIconAccent } from '../../lib/markCategory';
import { Info } from 'phosphor-react-native';
import {
  FrequencyPreset,
  DEFAULT_FREQUENCY_PRESET,
  FREQUENCY_PRESET_LABELS,
  weeklyTargetForPreset,
  scheduleForPreset,
} from '../../lib/markFrequencyPreset';
import { ICON_TYPE_TO_EMOJI, MARK_ICON_OPTIONS, MARK_ICON_PRIMARY } from '../../lib/markIcons';
import { MarkRowPreview } from '../../components/creation/MarkRowPreview';
import { cadenceLabel, suggestedCadenceLabel } from '../../lib/creation/creationPreview';

// VD-7 retry #1: the icon emoji map + selectable list live in lib/markIcons.ts,
// shared with mark/[id]/edit.tsx so the two grids can never diverge.
const ICON_OPTIONS = MARK_ICON_OPTIONS;

// QC3-G: the popular-marks shortlist — real library marks (not the full 45),
// resolved from MARK_LIBRARY_BY_ID so the chips carry the exact icon, color,
// and cadence the created mark will keep. "Popular" = a curated first row the
// founder asked to foreground, not the whole catalog.
const POPULAR_MARK_IDS = ['run', 'workout', 'reading', 'meditation', 'water', 'sleep', 'journaling', 'study'];
const POPULAR_MARKS: SuggestedCounter[] = POPULAR_MARK_IDS
  .map((id) => MARK_LIBRARY_BY_ID[id])
  .filter(Boolean);

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
// QC4-H: the popular chips were content-sized pills in a wrap, so short names
// ("Water", "Sleep") left a ragged strip of dead space down the right of the
// screen. Two fixed columns spend the full width on every row at every device
// size (founder: "make the popular marks take more of the right side").
const POPULAR_GRID_COLUMNS = 2;

/**
 * QC3-G: the staged confirm zone — rises under the popular grid when a chip is
 * staged. One orchestrated entrance-settle motion moment (reduced-safe via
 * useMotion), a centered daily-target stepper, and an inline "Add {name}" CTA.
 */
function StagedConfirmZone({
  counter,
  dailyTarget,
  onChangeTarget,
  onConfirm,
  themeColors,
}: {
  counter: SuggestedCounter;
  dailyTarget: number;
  onChangeTarget: (next: number) => void;
  onConfirm: () => void;
  themeColors: ReturnType<typeof themedColors>;
}) {
  const { reduced, spring } = useMotion();
  const entered = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    entered.value = spring(1, 'settle');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: entered.value,
    transform: [{ translateY: (1 - entered.value) * 10 }],
  }));

  return (
    <Animated.View style={[styles.stagedZone, animatedStyle]}>
      {/* Batch 2 (founder): what's expected from this mark, said before it is
          created — the "i" makes the explanation an announced feature, not a
          hidden tap. Straight from the library entry, one plain sentence. */}
      {counter.description ? (
        <View style={styles.stagedDescriptionRow}>
          <Info size={16} color={themeColors.inkMid} weight="duotone" />
          <Text style={[styles.stagedDescription, { color: themeColors.inkMid }]}>
            {counter.description}
          </Text>
        </View>
      ) : null}
      <Text style={[styles.stagedHint, { color: themeColors.inkMid }]}>
        Set today’s target, then add it.
      </Text>
      <DailyTargetStepper value={dailyTarget} onChange={onChangeTarget} label={null} />
      <TouchableOpacity
        style={[styles.footerCta, styles.stagedCta, { backgroundColor: themeColors.forest }, shadow.sm]}
        onPress={onConfirm}
        activeOpacity={0.88}
      >
        <Text style={[styles.footerCtaText, { color: themeColors.inkInverse }]}>
          Add {counter.name}
        </Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

export default function NewCounterScreen() {
  const theme = useEffectiveTheme();
  const themeColors = themedColors(theme);
  const router = useRouter();
  const { goalId: goalIdParam } = useLocalSearchParams<{ goalId?: string }>();
  const insets = useSafeAreaInsets();
  const { createCounter, counters } = useCounters();
  const { user } = useAuth();
  const { showError, showSuccess } = useNotification();
  // QC4-L: WHICH goal a new mark joins is the user's call. This used to be
  // `goals.find(g => g.status === 'active')` — the FIRST active goal, with no
  // chooser — so a user with several goals watched their mark attach to an
  // arbitrary one. It also read `useGoalsStore.getState()` inline during
  // render, which is a snapshot outside the subscription: the title never
  // updated when the goal did. Both go through selectors now.
  const goals = useGoalsStore(s => s.goals);
  const goalsLoading = useGoalsStore(s => s.isLoading);
  const goalsError = useGoalsStore(s => s.error);
  const linkMarkToGoal = useGoalsStore(s => s.linkMarkToGoal);
  // sort_index order — the chooser must list goals as the Goals screen does.
  const activeGoals = useMemo(() => getActiveGoals(goals), [goals]);
  // Smart default (ux-psychology): one active goal is not a decision — don't
  // stage one. Two or more, and the user picks; we never guess for them.
  const soleActiveGoalId = activeGoals.length === 1 ? activeGoals[0].id : null;
  const [chosenGoalId, setChosenGoalId] = useState<string | null>(goalIdParam ?? null);
  const targetGoalId = chosenGoalId ?? soleActiveGoalId;
  const targetGoal = useMemo(
    () => (targetGoalId ? goals.find(g => g.id === targetGoalId) : undefined),
    [goals, targetGoalId],
  );

  const [name, setName] = useState('');
  const [selectedIconType, setSelectedIconType] = useState<Exclude<MarkType, 'custom'>>(ICON_OPTIONS[0]);
  const unit: 'sessions' | 'days' | 'items' = 'sessions';
  const [goalValue] = useState<number | null>(null);
  const [goalPeriod] = useState<GoalPeriod>('day');
  const [scheduleType, setScheduleType] = useState<ScheduleType>('daily');
  const [scheduleDays, setScheduleDays] = useState<DayOfWeek[]>([]);
  const [frequencyPreset, setFrequencyPreset] = useState<FrequencyPreset>(DEFAULT_FREQUENCY_PRESET);
  const [loading, setLoading] = useState(false);
  const [dailyTarget, setDailyTarget] = useState(1);
  // null = the user hasn't touched the toggle, so it follows the smart default.
  // A plain `useState(!!targetGoalId)` would freeze the default at first render
  // and miss goals that arrive from the async fetch a beat later.
  const [linkToGoalOverride, setLinkToGoalOverride] = useState<boolean | null>(null);
  const linkToGoal = linkToGoalOverride ?? !!targetGoalId;
  // Link only ever happens to a goal the user can see named on screen.
  const linkTargetId = linkToGoal ? targetGoalId : null;
  const needsGoalChoice = linkToGoal && !targetGoalId;
  const [pendingSuggestedCounter, setPendingSuggestedCounter] = useState<SuggestedCounter | null>(null);
  // QC4-F: transient disclosure state for the icon grid — view state, not
  // persistent mark data, so useState is correct here (no slice).
  const [iconsExpanded, setIconsExpanded] = useState(false);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [duplicateCounterName, setDuplicateCounterName] = useState('');
  const [existingCounterId, setExistingCounterId] = useState<string | null>(null);

  const iconCellSize = useMemo(() => {
    const scrollPad = spacing.lg;
    // The icon grid lives inside styles.card, whose padding is spacing.md.
    // QC5-A: grouping wraps each band in styles.iconGroup, which adds VERTICAL
    // separation only (marginTop) — no horizontal padding, no nested gutter — so
    // the width available to a row is byte-for-byte what it was before the
    // groups existed and this derivation still holds. Any horizontal inset added
    // to a band must be subtracted here too.
    const cardPad = spacing.md;
    // The card also draws a hairline border (styles.card borderWidth), so its
    // inner content box is 2×hairline narrower than padding alone implies.
    // Earlier rounds subtracted only the padding and relied on Math.floor's
    // slack to "absorb" the border — but that slack is the fractional part of
    // the exact cell, which on some device widths falls UNDER the border width,
    // so 4*cell + 3*gap overflowed the true inner box and the 4th tile wrapped
    // to 3 (founder device QC, repeatedly). Subtract the border explicitly and
    // reserve a 1px safety slack so Yoga's sub-pixel rounding can never tip it.
    const cardBorder = StyleSheet.hairlineWidth;
    const rowInner = SCREEN_WIDTH - scrollPad * 2 - cardPad * 2 - cardBorder * 2;
    const gap = spacing.sm;
    const cell = Math.floor(
      (rowInner - gap * (ICON_GRID_COLUMNS - 1) - 1) / ICON_GRID_COLUMNS,
    );
    // QC4-F: never let the derived cell fall under the HIG touch minimum. The
    // 44pt floor is headerControl.minTarget — the app's single source for it —
    // rather than a fresh literal. (At 320pt the derived cell is ~54, so this
    // is a guard, not the active value; if it ever bound, the grid wraps to
    // fewer columns rather than shipping an unhittable target.)
    return Math.max(cell, headerControl.minTarget);
  }, []);
  // QC4-F: collapsed 4x4 by default. If the user's selected icon lives in the
  // secondary set, force the grid open — a selection you cannot see is worse
  // than a taller grid.
  const selectedIconIsPrimary = MARK_ICON_PRIMARY.includes(selectedIconType);
  const iconsShowingAll = iconsExpanded || !selectedIconIsPrimary;
  // Batch 2 (founder 2026-07-18): the category bands and their labels are gone —
  // "remove the section naming and just leave the Icons". One continuous 4-wide
  // grid; each tile carries its own per-icon accent, so color does the telling.
  const visibleIconOptions = iconsShowingAll ? ICON_OPTIONS : MARK_ICON_PRIMARY;

  // QC4-H: two full-width columns inside the scroll gutter. The popular grid
  // sits directly in scrollContent (not inside styles.card), so only the
  // scroll gutter comes off the width — no card padding.
  const popularChipWidth = useMemo(() => {
    const rowInner = SCREEN_WIDTH - spacing.lg * 2;
    return (rowInner - spacing.sm * (POPULAR_GRID_COLUMNS - 1)) / POPULAR_GRID_COLUMNS;
  }, []);
  // Batch 2: color is the ICON's own accent (iconAccents, theme/tokens.ts) —
  // unique per icon, so a goal's marks never read as five of the same green.
  // Still sanctioned-palette-only; the Vibe grid stays gone.
  const color = getIconAccent(selectedIconType);

  const scheduleDaysForDisplay =
    scheduleType === 'daily' ? ALL_SCHEDULE_DAYS : scheduleDays.length > 0 ? scheduleDays : [1, 2, 3, 4, 5];

  // QC3-G: the shared MarkRowPreview fills from whichever path the user last
  // touched — a staged popular chip, or the custom name/face/rhythm below.
  const previewName = pendingSuggestedCounter ? pendingSuggestedCounter.name : name;
  const previewEmoji = pendingSuggestedCounter
    ? pendingSuggestedCounter.emoji
    : ICON_TYPE_TO_EMOJI[selectedIconType] || ICON_TYPE_TO_EMOJI.gym;
  const previewCadence = pendingSuggestedCounter
    ? suggestedCadenceLabel(pendingSuggestedCounter)
    : cadenceLabel(frequencyPreset, scheduleDaysForDisplay.length);

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

  // QC3-G: tapping a popular chip STAGES it (name + face + cadence fill the
  // shared preview); tapping the staged chip again un-stages. Never an instant
  // create — the user still confirms with "Add {name}" (founder call).
  const handleStagePopularMark = (mark: SuggestedCounter) => {
    setPendingSuggestedCounter((cur) => (cur?.id === mark.id ? null : mark));
  };

  // QC3-G: typing a custom name takes over the preview — clears any staged
  // popular pick so the single preview never shows two sources at once.
  const handleNameChange = (text: string) => {
    setName(text);
    if (pendingSuggestedCounter) setPendingSuggestedCounter(null);
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
      showError('That’s 5 marks on this goal. Livra+ lets you add more.');
      setTimeout(() => {
        router.replace('/paywall');
      }, 2000);
    } else {
      logger.error('Error creating counter:', error);
      const errorMessage = error instanceof Error ? error.message : 'Could not create the mark. Check your connection and try again.';
      showError(errorMessage);
    }
  };

  // QC3 cleanup: the success epilogue shared by both create paths — link the
  // new mark to its goal (fire-and-forget), toast, then pop back after the
  // toast is visible. Callers pass their own success copy.
  const finishMarkCreation = (savedMark: { id?: string } | null | undefined, successMessage: string) => {
    if (linkTargetId && savedMark?.id) {
      linkMarkToGoal(linkTargetId, savedMark.id).catch(() => {});
    }
    showSuccess(successMessage);
    setTimeout(() => {
      router.back();
    }, 300);
  };

  const handleConfirmSuggestedCounter = async () => {
    if (!pendingSuggestedCounter) return;
    if (needsGoalChoice) {
      showError('Pick which goal this mark belongs to.');
      return;
    }

    try {
      setLoading(true);
      const savedMark = await createCounter({
        name: pendingSuggestedCounter.name,
        emoji: pendingSuggestedCounter.emoji,
        // QC4-M: the exact color the chip above previewed.
        color: colorForSuggestedCounter(pendingSuggestedCounter),
        unit: 'sessions' as const,
        enable_streak: false,
        user_id: user?.id!,
        dailyTarget,
        frequency_kind: pendingSuggestedCounter.frequencyKind,
        weekly_target: pendingSuggestedCounter.frequency_recommended ?? 3,
        // The per-goal free cap (5, lib/gating.ts) is enforced by createCounter
        // off this goal_id — never reimplemented here.
        ...(linkTargetId ? { goal_id: linkTargetId } : {}),
      } as any);
      setPendingSuggestedCounter(null);
      finishMarkCreation(savedMark, 'Mark added');
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
    if (needsGoalChoice) {
      showError('Pick which goal this mark belongs to.');
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
        // The per-goal free cap (5, lib/gating.ts) is enforced by createCounter
        // off this goal_id — never reimplemented here.
        ...(linkTargetId ? { goal_id: linkTargetId } : {}),
      } as any);

      finishMarkCreation(savedMark, 'Mark created');
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
          <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}>
            <Text style={[styles.cancelButton, { color: themeColors.inkMid }]}>Cancel</Text>
          </TouchableOpacity>
        </View>
        <Text style={[styles.headerTitle, { color: themeColors.inkDark }]} numberOfLines={1}>
          Add a mark
        </Text>
        <View style={{ width: headerSideWidth }} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        // QC4-I: the preview block is child 0 and sticks to the top of the
        // viewport, so the mark being built stays visible the whole way down
        // (founder). This is plain ScrollView behaviour — no
        // KeyboardAvoidingView and no LayoutAnimation, so it cannot
        // reintroduce the QC2-D half-render class. It also PRESERVES the
        // creation grammar (qc4-E-direction): the object stays up there,
        // separate from the controls you operate down here — now permanently
        // rather than only until you scroll.
        stickyHeaderIndices={[0]}
      >
        {/* QC2-H "The Card Takes Shape" / QC3-G: the REAL Focus mark row sits at
            the top and assembles live — from a staged popular pick OR the
            custom fields below, whichever the user last touched. */}
        <View style={[styles.previewSticky, { backgroundColor: themeColors.linen }]}>
          <MarkRowPreview
            testID="mark-row-preview"
            name={previewName}
            emoji={previewEmoji}
            cadence={previewCadence}
          />
          <Text style={[styles.benchLine, { color: themeColors.inkMid }]}>
            Your mark · exactly as it will sit on Focus.
          </Text>
        </View>

        {/* Popular marks — real, colorful, tappable; a tap stages into the
            preview above (no instant create). */}
        <Text style={[styles.sectionLabel, { color: themeColors.inkDark }]}>Popular marks</Text>
        <View style={styles.popularGrid}>
          {POPULAR_MARKS.map((mark) => {
            const staged = pendingSuggestedCounter?.id === mark.id;
            const MarkIcon = mark.icon;
            // QC4-M: the chip paints in the SAME color the created mark will
            // carry — one resolver, called here and at save. The chip used to
            // read `mark.color` (the library's own authored hex) while save
            // derived a bright generic from a keyword guess, so the mark you
            // previewed was never the mark you got.
            const markColor = colorForSuggestedCounter(mark);
            return (
              <TouchableOpacity
                key={mark.id}
                style={[
                  styles.popularChip,
                  {
                    width: popularChipWidth,
                    backgroundColor: staged
                      ? applyOpacity(themeColors.forest, 0.1)
                      : applyOpacity(markColor, 0.14),
                    borderColor: staged ? themeColors.forest : applyOpacity(markColor, 0.45),
                  },
                ]}
                onPress={() => handleStagePopularMark(mark)}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityState={{ selected: staged }}
              >
                {MarkIcon ? (
                  <MarkIcon weight="duotone" size={18} color={staged ? themeColors.forest : markColor} />
                ) : null}
                <Text
                  style={[styles.popularChipText, { color: themeColors.inkDark }]}
                  numberOfLines={1}
                >
                  {mark.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {pendingSuggestedCounter ? (
          <StagedConfirmZone
            key={pendingSuggestedCounter.id}
            counter={pendingSuggestedCounter}
            dailyTarget={dailyTarget}
            onChangeTarget={setDailyTarget}
            onConfirm={handleConfirmSuggestedCounter}
            themeColors={themeColors}
          />
        ) : null}

        {/* Or create your own — always visible below the popular marks. */}
        <View style={styles.divider}>
          <View style={[styles.dividerLine, { backgroundColor: themeColors.borderMid }]} />
          <Text style={[styles.dividerText, { color: themeColors.inkMid }]}>Or create your own</Text>
          <View style={[styles.dividerLine, { backgroundColor: themeColors.borderMid }]} />
        </View>

        {/* Identity: name + face, one quiet group. */}
        <View
          style={[
            styles.card,
            {
              backgroundColor: themeColors.surface,
              borderColor: themeColors.borderMid,
            },
          ]}
        >
          <Text style={[styles.groupLabel, { color: themeColors.inkMid }]}>What you’ll do</Text>
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
            onChangeText={handleNameChange}
            placeholder="e.g. Morning run"
            placeholderTextColor={themeColors.inkMuted}
          />
          <Text style={[styles.groupLabel, styles.groupLabelFace, { color: themeColors.inkMid }]}>
            Give it a face
          </Text>
          {/* Batch 2 (founder): one continuous 4-wide grid, no section names,
              no band breaks — the icons carry their own accents, so each tile
              already says what it is. Selection = full-strength accent border
              on a deeper wash of the SAME hue. */}
          <View style={styles.iconGrid} testID="icon-grid">
            {visibleIconOptions.map((iconType) => {
              const isSelected = iconType === selectedIconType;
              const accent = getIconAccent(iconType);
              return (
                <TouchableOpacity
                  key={iconType}
                  style={[
                    styles.iconButton,
                    {
                      width: iconCellSize,
                      height: iconCellSize,
                      // M7-QC3: wash capped at 0.12 (was 0.18) — a same-hue
                      // wash + same-hue glyph past ~0.12 drops the icon under
                      // the 3:1 legibility floor on the dark surface. Selection
                      // now reads off the full-strength accent border + deeper
                      // wash, not an over-tinted fill.
                      backgroundColor: applyOpacity(accent, isSelected ? 0.12 : 0.08),
                      borderColor: isSelected ? accent : themeColors.borderMid,
                    },
                  ]}
                  onPress={() => setSelectedIconType(iconType)}
                  accessibilityRole="button"
                  accessibilityLabel={iconType.replace(/_/g, ' ')}
                  accessibilityState={{ selected: isSelected }}
                >
                  <CounterIcon
                    type={iconType as any}
                    size={Math.min(28, Math.floor(iconCellSize * 0.45))}
                    color={accent}
                    variant="symbol"
                  />
                </TouchableOpacity>
              );
            })}
          </View>
          {/* QC4-F: the disclosure. Hidden while the grid is forced open by a
              secondary selection — collapsing would hide the user's own pick. */}
          {selectedIconIsPrimary ? (
            <TouchableOpacity
              style={styles.iconDisclosure}
              onPress={() => setIconsExpanded((v) => !v)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityState={{ expanded: iconsShowingAll }}
              testID="icon-grid-disclosure"
            >
              <Text style={[styles.iconDisclosureText, { color: themeColors.inkMid }]}>
                {iconsShowingAll ? 'Show less' : 'Show more'}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Rhythm: how much and how often, one quiet group. */}
        <View
          style={[
            styles.card,
            {
              backgroundColor: themeColors.surface,
              borderColor: themeColors.borderMid,
            },
          ]}
        >
          <Text style={[styles.groupLabel, { color: themeColors.inkMid }]}>Enough for today</Text>
          <Text style={[styles.cardHint, { color: themeColors.inkMid, textAlign: 'center', marginBottom: spacing.md }]}>
            How many times makes today count.
          </Text>
          <DailyTargetStepper value={dailyTarget} onChange={setDailyTarget} label={null} />
          <Text style={[styles.groupLabel, styles.groupLabelSpaced, { color: themeColors.inkMid }]}>How often</Text>
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

          <Text style={[styles.cadenceHint, { color: themeColors.inkMid }]}>
            Log as many as you want · a met target never blocks today.
          </Text>
        </View>

        {/* QC4-L: the goal this mark joins — the user's choice, not the first
            active goal's. Loading / error / empty all handled: no goals at all
            means no card, and the mark saves as a standalone daily habit. */}
        {goalsLoading && activeGoals.length === 0 ? (
          <View style={[styles.card, { backgroundColor: themeColors.surface, borderColor: themeColors.borderMid }]}>
            <Text style={[styles.toggleDescription, { color: themeColors.inkMid }]}>
              Loading your goals…
            </Text>
          </View>
        ) : goalsError && activeGoals.length === 0 ? (
          <View style={[styles.card, { backgroundColor: themeColors.surface, borderColor: themeColors.borderMid }]}>
            <Text style={[styles.toggleDescription, { color: themeColors.inkMid }]}>
              We couldn’t load your goals. This mark will save as a daily habit. You can link it from the goal later.
            </Text>
          </View>
        ) : activeGoals.length > 0 ? (
          <View
            style={[styles.card, { backgroundColor: themeColors.surface, borderColor: themeColors.borderMid }]}
          >
            <TouchableOpacity
              style={styles.goalToggleRow}
              onPress={() => setLinkToGoalOverride(!linkToGoal)}
              activeOpacity={0.85}
              accessibilityRole="switch"
              accessibilityState={{ checked: linkToGoal }}
              accessibilityLabel="Link this mark to a goal"
            >
              <View style={styles.streakTextWrap}>
                <Text style={[styles.toggleLabel, { color: themeColors.inkDark }]}>Link to goal</Text>
                <Text style={[styles.toggleDescription, { color: themeColors.inkMid }]} numberOfLines={1}>
                  {!linkToGoal
                    ? 'Keep it as a daily habit'
                    : (targetGoal?.title ?? 'Choose which goal')}
                </Text>
              </View>
              <View style={[styles.toggleSwitch, { backgroundColor: linkToGoal ? color : themeColors.borderMid, alignItems: linkToGoal ? 'flex-end' : 'flex-start' }]}>
                <View style={[styles.toggleThumb, { backgroundColor: themeColors.surface }]} />
              </View>
            </TouchableOpacity>

            {/* One active goal is not a decision — no chooser. Two or more and
                the user picks; nothing is pre-selected for them. */}
            {linkToGoal && activeGoals.length > 1 ? (
              <View style={styles.goalChooser} testID="goal-chooser">
                {activeGoals.map((g) => {
                  const picked = g.id === targetGoalId;
                  return (
                    <TouchableOpacity
                      key={g.id}
                      style={[
                        styles.goalOption,
                        {
                          backgroundColor: picked ? applyOpacity(color, 0.14) : themeColors.linen,
                          borderColor: picked ? color : themeColors.borderMid,
                        },
                      ]}
                      onPress={() => setChosenGoalId(g.id)}
                      activeOpacity={0.85}
                      accessibilityRole="button"
                      accessibilityState={{ selected: picked }}
                    >
                      <Text
                        style={[styles.goalOptionText, { color: picked ? color : themeColors.inkMid }]}
                        numberOfLines={1}
                      >
                        {g.title}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : null}
          </View>
        ) : null}

        <View style={{ height: spacing.md }} />
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
            { backgroundColor: themeColors.forest, opacity: !name.trim() ? 0.4 : 1 },
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
  // QC4-K: see theme/tokens headerControl — offset from the safe-area inset,
  // 44pt Cancel target (was hitSlop 8 on a bare Text).
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: headerControl.topGap,
    paddingBottom: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerBtn: { ...headerControlBoxLeading },
  headerTitle: {
    flex: 1,
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
    textAlign: 'center',
  },
  cancelButton: {
    fontSize: fontSize.base,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    // QC4-I: the top gap moved onto previewSticky. A paddingTop here would sit
    // ABOVE the sticky header, so scrolling content would show through it.
    paddingBottom: spacing.lg,
  },
  // QC4-I: the sticky preview block. Needs an opaque background of its own —
  // a sticky header is siblings-on-top, so anything translucent lets the
  // scrolling content read through the benchLine.
  previewSticky: {
    paddingTop: spacing.md,
  },
  benchLine: {
    fontSize: fontSize.sm,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  sectionLabel: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    marginBottom: spacing.md,
  },
  popularGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  popularChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: 14,
    paddingVertical: spacing.sm,
    minHeight: 44, // QC3 wave2: tap-target floor (content stays centered)
    borderRadius: borderRadius.full,
    borderWidth: 1.5,
  },
  popularChipText: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium,
  },
  stagedZone: {
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  stagedHint: {
    fontSize: fontSize.sm,
    lineHeight: fontSize.sm * 1.35,
    textAlign: 'center',
  },
  stagedCta: {
    marginTop: spacing.xs,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.xl,
    marginBottom: spacing.lg,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
  dividerText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  card: {
    borderRadius: borderRadius.card,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  // QC2-H: the mentor's quiet labels — sentence case, centered, no tracked
  // uppercase kickers (design-system ban).
  groupLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  groupLabelSpaced: {
    marginTop: spacing.lg,
  },
  // "Give it a face" keeps the card's centered group-label voice; the grid sits
  // directly under it now that the category bands are gone (Batch 2).
  groupLabelFace: {
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  // Batch 2: the "i" line — what a staged mark expects from you, before Add.
  stagedDescriptionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  stagedDescription: {
    flex: 1,
    fontSize: fontSize.sm,
    lineHeight: fontSize.sm * 1.4,
  },
  cardHint: {
    fontSize: fontSize.sm,
    lineHeight: fontSize.sm * 1.35,
    marginBottom: spacing.sm,
  },
  // QC4-J: the placeholder sat off the field's optical centre. Cause: symmetric
  // `padding` on a single-line TextInput with no explicit height — RN insets the
  // text rect and the native placeholder rect independently there, so the two
  // land on different baselines. Every other input in the app already dodges
  // this with the same shape (height + horizontal-only padding): see
  // app/settings/profile.tsx `input`, app/goal/suggest.tsx `input`,
  // components/ai/GoalPackageReview.tsx. 48 is that established input height.
  // Fixing the geometry, not nudging with an offset.
  inputInCard: {
    height: 48,
    paddingHorizontal: spacing.md,
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
  // QC4-F: 44pt disclosure target (headerControl.minTarget is the app's single
  // source for the HIG minimum). A real touch box, never hitSlop.
  iconDisclosure: {
    minHeight: headerControl.minTarget,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  iconDisclosureText: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium,
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
    width: 44,
    height: 44,
    minHeight: 44, // QC3 wave2: tap-target floor
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  dayChipText: {
    fontSize: fontSize[13],
    fontWeight: fontWeight.semibold,
  },
  // QC4-L: the toggle row inside the goal card. The card is a View now (it hosts
  // the chooser below), so the row carries the touch target itself.
  goalToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: headerControl.minTarget,
  },
  goalChooser: {
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  goalOption: {
    justifyContent: 'center',
    minHeight: headerControl.minTarget,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1.5,
  },
  goalOptionText: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium,
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
