import React, { useState, useCallback, useEffect, useMemo } from 'react';
import type { ComponentType } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  TextInput,
  Modal,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Animated, { useSharedValue, useAnimatedStyle } from 'react-native-reanimated';
import DateTimePicker from '@react-native-community/datetimepicker';
import { format, parseISO } from 'date-fns';
import * as Haptics from 'expo-haptics';
import {
  X,
  PencilSimple,
  Check,
  Plus,
  Trash,
  ArrowRight,
  LinkSimple,
  LinkBreak,
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
  motion,
  headerControl,
  headerControlBoxLeading,
  headerControlBoxTrailing,
} from '../../theme/tokens';
import type { Mark, GoalNote } from '../../types';
import { useEffectiveTheme } from '../../state/uiSlice';
import { useGoalsStore } from '../../state/goalsSlice';
import { useGoalNotesStore } from '../../state/goalNotesSlice';
import { useMarksStore } from '../../state/countersSlice';
import { useEventsStore } from '../../state/eventsSlice';
import { useAppDateStore } from '../../state/appDateSlice';
import { effectivePersonalBest, useMomentumStore } from '../../state/momentumSlice';
import { deriveIsNewBest, goalAgeDays } from '../../lib/moments/context';
import { deriveGoalDetailEmptyVariant, getEmptyStateCopy } from '../../lib/moments/emptyState';
import { getAppDate } from '../../lib/appDate';
import { formatDate } from '../../lib/date';
import { resolveDailyTarget } from '../../lib/markDailyTarget';
import { useCounters } from '../../hooks/useCounters';
import { useAuth } from '../../hooks/useAuth';
import { useIapSubscriptions } from '../../hooks/useIapSubscriptions';
import { canAddMarkToGoal, countMarksInGoal } from '../../lib/gating';
import { MARK_PER_GOAL_LIMIT_MESSAGE } from '../../lib/copy';
import { useMotion } from '../../hooks/useMotion';
import { useNotification } from '../../contexts/NotificationContext';
import { confirm } from '../../components/ui/overlays';
import { CATEGORY_MAP } from '../../components/ui/MarkRow';
import { GoalTitle } from '../../components/ui/GoalTitle';
import { ProgressArc } from '../../components/ui/ProgressArc';
import { VoiceLine } from '../../components/ui/VoiceLine';
import {
  currentWeekDates,
  buildWeeklyCountsMap,
  markWeeklyState,
} from '../../lib/features';
import { buildGoalWeekSentence } from '../../lib/goalWeekSentence';
import {
  resolveMarkCategory,
  majorityCategory,
  resolveMarkIcon,
  dominantMark,
  resolveMarkAccent,
} from '../../lib/markCategoryResolve';
import { logger } from '../../lib/utils/logger';
import { goalWeekFraming } from '../../lib/goalLogic';
import { ringFraction } from '../../lib/goalRingProgress';
import { applyOpacity } from '../../src/components/icons/color';
import { JournalComposer } from '../../components/journal/JournalComposer';

// QC2-C (founder reversal of VD-4): the ring is the hero again — centered at
// the top, sweeping 0 -> current fraction once per screen open (ProgressArc
// mounts with from=0; reduced motion lands it instantly via useMotion).
const RING_SIZE = 116;
const RING_STROKE = 8;
// QC3-E: the category icon now sits centered INSIDE the ring and fills
// bottom-to-top alongside the arc. Icon box centered within the ring.
const RING_ICON_SIZE = 48;
const RING_ICON_OFFSET = (RING_SIZE - RING_ICON_SIZE) / 2;

type ThemeColors = ReturnType<typeof themedColors>;
type GoalEvents = Parameters<typeof buildWeeklyCountsMap>[1];

// ── Sections (QC2-C retry #1, fallow complexity gate) ───────────────────────
// The screen body decomposes into small same-file components per the FU-6
// SuggestGoalScreen precedent: hooks/state stay in GoalDetailScreen, each
// section takes props, the parent render is a thin composition.

/** Hero ring + centered category icon + check-in story (QC3-E "the ring is a
 *  star"). The ring stroke is the sanctioned `progressGradient` (amber→ember);
 *  the category icon sits centered INSIDE the ring in the same warm accent, so
 *  ring and icon read as one warming gesture. Progress is carried by the arc
 *  sweep and the "N of M check-ins" story (see the render for why the icon is a
 *  static glyph rather than a bottom→top fill).
 *
 *  Owns its entrance motion — the arc sweeps from ProgressArc mounting at
 *  from=0 and the story fades via `storyOpacity`, once per screen open (goal
 *  detail is pushed per open), never on re-render. Reduced motion lands each at
 *  its final value via useMotion's reduced-safe `timing` (duration 0). */
function RingHero({
  c,
  progress,
  threshold,
  weekLabel,
  heroMark,
  fallbackIcon,
}: {
  c: ThemeColors;
  progress: number;
  threshold: number;
  weekLabel: string | null;
  heroMark: Mark | null;
  fallbackIcon: ComponentType<any>;
}) {
  const { timing } = useMotion();
  const frac = ringFraction(progress, threshold);
  const storyOpacity = useSharedValue(0);
  useEffect(() => {
    storyOpacity.value = timing(1, motion.gentle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const storyStyle = useAnimatedStyle(() => ({ opacity: storyOpacity.value }));

  // The centered icon: the goal's own dominant-mark glyph, category/custom
  // fallback for empty goals — same resolution the medallion used before it
  // moved into the ring.
  //
  // Rendering: a SOLID glyph in the ring's warm accent (the ember stop of
  // progressGradient), always fully visible. Progress is carried by the arc
  // sweep + the "N of M check-ins" story below. This replaces an animated
  // bottom→top glyph fill that failed device QA three times on this old-arch
  // stack (RN overflow-clip, then a nested react-native-svg <ClipPath> around
  // the Phosphor icon — a Phosphor icon is its own <Svg> root, and nesting it
  // inside another <Svg>'s clipped <G> does not render on iOS). The animated
  // fill needs a real mask primitive (@react-native-masked-view/masked-view);
  // RingIconFill.tsx is kept for that future restore. Static-but-visible beats
  // fancy-but-blank.
  const HeroIcon = (heroMark ? resolveMarkIcon(heroMark) : null) ?? fallbackIcon;
  const iconColor = c.progressGradient[1];

  return (
    <View style={styles.ringHero}>
      <View style={styles.ringStack}>
        <ProgressArc
          from={0}
          to={frac}
          size={RING_SIZE}
          strokeWidth={RING_STROKE}
          color={c.forest}
          trackColor={c.borderLight}
          gradientColors={c.progressGradient}
          gradientId="goalRingGradient"
        />
        <View style={styles.ringIconBox} pointerEvents="none">
          <HeroIcon size={RING_ICON_SIZE} color={iconColor} weight="duotone" />
        </View>
      </View>
      <Animated.View style={[styles.progressStory, storyStyle]}>
        <Text style={[styles.progressNumber, { color: c.inkDark }]}>{progress}</Text>
        <Text style={[styles.progressCaption, { color: c.inkMid }]}>
          {weekLabel ? `of ${threshold} check-in days · ${weekLabel}` : `of ${threshold} check-ins`}
        </Text>
      </Animated.View>
    </View>
  );
}

/** Title (view/edit) + the captured why. The goal's icon moved into the hero
 *  ring center (QC3-E), so this block is now the title study alone. */
function GoalIdentity({
  c,
  title,
  description,
  editingTitle,
  titleDraft,
  onChangeDraft,
  onSaveTitle,
}: {
  c: ThemeColors;
  title: string;
  description?: string | null;
  editingTitle: boolean;
  titleDraft: string;
  onChangeDraft: (text: string) => void;
  onSaveTitle: () => void;
}) {
  return (
    <View style={styles.identityBlock}>
      {editingTitle ? (
        <View style={styles.titleEditRow}>
          <TextInput
            style={[styles.titleInput, { color: c.inkDark, borderColor: c.borderMid, backgroundColor: c.surface }]}
            value={titleDraft}
            onChangeText={onChangeDraft}
            onBlur={onSaveTitle}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={onSaveTitle}
          />
          <TouchableOpacity onPress={onSaveTitle} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Check size={22} color={c.forest} weight="bold" />
          </TouchableOpacity>
        </View>
      ) : (
        <GoalTitle title={title} size="detail" color={c.inkDark} style={styles.title} />
      )}

      {/* The captured why comes home here. */}
      {!!description && (
        <Text style={[styles.why, { color: c.inkMid }]}>{description}</Text>
      )}
    </View>
  );
}

/** Founder 2026-07-18: finishing the check-ins never auto-completes a goal —
 *  marks are a guide, the outcome is the user's to call. When the whole
 *  commitment is in, this card is the loud invitation to call it. */
function ClaimGoalCard({ c, onClaim }: { c: ThemeColors; onClaim: () => void }) {
  return (
    <View style={[styles.claimCard, { backgroundColor: applyOpacity(c.ember, 0.1), borderColor: applyOpacity(c.ember, 0.45) }]}>
      <Text style={[styles.claimLine, { color: c.inkDark }]}>
        Every check-in is in. The marks carried you here. Did you reach it?
      </Text>
      <TouchableOpacity
        style={[styles.claimBtn, { backgroundColor: c.forest }]}
        onPress={onClaim}
        activeOpacity={0.85}
        accessibilityRole="button"
        testID="goal-claim"
      >
        <Text style={[styles.claimBtnText, { color: c.inkInverse }]}>Claim this goal</Text>
      </TouchableOpacity>
    </View>
  );
}

/** One quiet sentence about the week; renders nothing when there is nothing to say. */
function WeekSentenceLine({ c, sentence }: { c: ThemeColors; sentence: string }) {
  if (sentence === '') return null;
  return <Text style={[styles.weekSentence, { color: c.inkMid }]}>{sentence}</Text>;
}

/** QC4-L: the picker for linking a mark that already exists. Candidates are the
 *  user's other live marks — a mark feeds one goal at a time (`goal_id`), so
 *  linking one that already sits on another goal moves it, and the sheet says
 *  so plainly rather than doing it silently. */
function LinkMarkSheet({
  c,
  visible,
  candidates,
  goalTitleById,
  onPick,
  onClose,
}: {
  c: ThemeColors;
  visible: boolean;
  candidates: Mark[];
  goalTitleById: (goalId: string | null | undefined) => string | undefined;
  onPick: (markId: string) => void;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity style={[styles.modalSheet, { backgroundColor: c.surface }]} activeOpacity={1}>
          <Text style={[styles.modalLabel, { color: c.inkMuted }]}>LINK A MARK</Text>
          {candidates.length === 0 ? (
            <Text style={[styles.pickerEmpty, { color: c.inkMid }]}>
              Every mark you have already feeds this goal.
            </Text>
          ) : (
            <ScrollView style={styles.pickerList} showsVerticalScrollIndicator={false}>
              {candidates.map((mark) => {
                const catData = CATEGORY_MAP[resolveMarkCategory(mark)] ?? CATEGORY_MAP.custom;
                const MarkIcon = resolveMarkIcon(mark) ?? catData.Icon;
                // Batch 2: the mark's own accent (unique per icon), not the
                // category's — five marks in a goal must be tellable apart.
                const accent = resolveMarkAccent({ name: mark.name, emoji: mark.emoji, color: mark.color });
                const heldBy = goalTitleById(mark.goal_id);
                return (
                  <TouchableOpacity
                    key={mark.id}
                    style={[styles.pickerRow, { borderColor: c.borderLight }]}
                    onPress={() => onPick(mark.id)}
                    activeOpacity={0.75}
                    accessibilityRole="button"
                    accessibilityLabel={`Link ${mark.name} to this goal`}
                  >
                    <View style={[styles.markIconTile, { backgroundColor: applyOpacity(accent, 0.12) }]}>
                      <MarkIcon size={18} color={accent} weight="duotone" />
                    </View>
                    <View style={styles.markBody}>
                      <Text style={[styles.markName, { color: c.inkDark }]} numberOfLines={1}>
                        {mark.name}
                      </Text>
                      {heldBy ? (
                        <Text style={[styles.pickerRowHint, { color: c.inkMuted }]} numberOfLines={1}>
                          Currently on “{heldBy}” — linking moves it here
                        </Text>
                      ) : null}
                    </View>
                    <LinkSimple size={18} color={c.accent} weight="bold" />
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}
          <TouchableOpacity style={[styles.dateSetBtn, { backgroundColor: c.forest }]} onPress={onClose}>
            <Text style={[styles.dateSetBtnText, { color: c.inkInverse }]}>Done</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

/** YOUR MARKS section: living rows with weekly tracks + quick log, or the
 *  empty invitation. A met weekly target never blocks today's log.
 *
 *  QC4-L: the goal screen had no linking UI at all — a mark could only ever
 *  reach a goal at the moment it was created. "Manage" flips the trailing
 *  control from log to unlink, so control is always one tap away without
 *  putting a third button on every row. */
function LinkedMarkRows({
  c,
  marks,
  weeklyCountsMap,
  todayCountsMap,
  emptyLine,
  managing,
  onToggleManaging,
  canLinkMore,
  onQuickLog,
  onAddMark,
  onLinkExisting,
  onUnlink,
  onOpenMark,
}: {
  c: ThemeColors;
  marks: Mark[];
  weeklyCountsMap: Map<string, number>;
  todayCountsMap: Map<string, number>;
  emptyLine: string;
  managing: boolean;
  onToggleManaging: () => void;
  canLinkMore: boolean;
  onQuickLog: (markId: string) => void;
  onAddMark: () => void;
  onLinkExisting: () => void;
  onUnlink: (mark: Mark) => void;
  onOpenMark: (markId: string) => void;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeaderRow}>
        <Text style={[styles.sectionLabel, { color: c.inkMuted }]}>YOUR MARKS</Text>
        {marks.length > 0 ? (
          <TouchableOpacity
            style={styles.manageBtn}
            onPress={onToggleManaging}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityState={{ expanded: managing }}
            testID="goal-marks-manage"
          >
            <Text style={[styles.manageBtnText, { color: c.accent }]}>
              {managing ? 'Done' : 'Manage'}
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>
      {marks.length === 0 ? (
        <View style={[styles.emptyMarks, { backgroundColor: c.surface, borderColor: c.borderLight }]}>
          <Text style={[styles.emptyMarksText, { color: c.inkMid }]}>
            {emptyLine}
          </Text>
          <TouchableOpacity
            style={[styles.addMarkBtn, { backgroundColor: c.forest }]}
            onPress={onAddMark}
          >
            <Plus size={14} color={c.inkInverse} weight="bold" />
            <Text style={[styles.addMarkBtnText, { color: c.inkInverse }]}>Add a mark</Text>
          </TouchableOpacity>
          {canLinkMore ? (
            <TouchableOpacity style={styles.linkExistingBtn} onPress={onLinkExisting} activeOpacity={0.7}>
              <LinkSimple size={14} color={c.accent} weight="bold" />
              <Text style={[styles.linkExistingText, { color: c.accent }]}>Link one you already have</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : (
        marks.map(mark => {
          const catData = CATEGORY_MAP[resolveMarkCategory(mark)] ?? CATEGORY_MAP.custom;
          const MarkIcon = resolveMarkIcon(mark) ?? catData.Icon;
          // Batch 2: per-mark accent — see LinkMarkSheet note.
          const accent = resolveMarkAccent({ name: mark.name, emoji: mark.emoji, color: mark.color });
          const weeklyCount = weeklyCountsMap.get(mark.id) ?? 0;
          const weeklyTarget = mark.weekly_target ?? 3;
          const weekPct = weeklyTarget > 0 ? Math.min(1, weeklyCount / weeklyTarget) : 0;
          return (
            <TouchableOpacity
              key={mark.id}
              style={[styles.markRow, { backgroundColor: c.surface, borderColor: c.borderLight }]}
              onPress={() => onOpenMark(mark.id)}
              activeOpacity={0.8}
            >
              <View style={[styles.markIconTile, { backgroundColor: applyOpacity(accent, 0.12) }]}>
                <MarkIcon size={18} color={accent} weight="duotone" />
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
              {managing ? (
                <TouchableOpacity
                  style={[styles.logBtn, { backgroundColor: applyOpacity(c.inkMuted, 0.12) }]}
                  onPress={() => onUnlink(mark)}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  activeOpacity={0.7}
                  accessibilityLabel={`Unlink ${mark.name} from this goal`}
                >
                  <LinkBreak size={16} color={c.inkMid} weight="bold" />
                </TouchableOpacity>
              ) : (() => {
                // Lock once the day's target is met — one tap for a binary mark,
                // the full count for a quantitative one (water). Logging never
                // reopens the same day, matching every other log surface.
                const completedToday =
                  (todayCountsMap.get(mark.id) ?? 0) >= resolveDailyTarget(mark);
                return (
                  <TouchableOpacity
                    style={[
                      styles.logBtn,
                      { backgroundColor: applyOpacity(completedToday ? c.forest : c.accent, completedToday ? 0.16 : 0.12) },
                    ]}
                    onPress={completedToday ? undefined : () => onQuickLog(mark.id)}
                    disabled={completedToday}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    activeOpacity={0.7}
                    accessibilityLabel={completedToday ? `${mark.name} logged today` : `Log ${mark.name}`}
                    accessibilityState={completedToday ? { disabled: true } : undefined}
                  >
                    {completedToday ? (
                      <Check size={16} color={c.forest} weight="bold" />
                    ) : (
                      <Plus size={16} color={c.accent} weight="bold" />
                    )}
                  </TouchableOpacity>
                );
              })()}
            </TouchableOpacity>
          );
        })
      )}

      {/* QC4-L: both ways to grow the goal, side by side. Hidden at the free
          per-goal cap, where the paywall path takes over. */}
      {marks.length > 0 ? (
        <View style={styles.markActions}>
          <TouchableOpacity style={styles.markActionBtn} onPress={onAddMark} activeOpacity={0.7}>
            <Plus size={14} color={c.accent} weight="bold" />
            <Text style={[styles.markActionText, { color: c.accent }]}>New mark</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.markActionBtn}
            onPress={onLinkExisting}
            activeOpacity={0.7}
            testID="goal-link-existing"
          >
            <LinkSimple size={14} color={c.accent} weight="bold" />
            <Text style={[styles.markActionText, { color: c.accent }]}>Link existing</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

/** Quiet footer group: target date, complete (when earned), remove. */
function DetailFooter({
  c,
  targetDate,
  canComplete,
  onOpenDatePicker,
  onComplete,
  onDelete,
}: {
  c: ThemeColors;
  targetDate?: string | null;
  canComplete: boolean;
  onOpenDatePicker: () => void;
  onComplete: () => void;
  onDelete: () => void;
}) {
  return (
    <View style={styles.footerGroup}>
      <TouchableOpacity
        style={[styles.card, { backgroundColor: c.surface, borderColor: c.borderLight }]}
        onPress={onOpenDatePicker}
        activeOpacity={0.75}
      >
        <Text style={[styles.cardLabel, { color: c.inkMuted }]}>TARGET DATE</Text>
        <Text style={[styles.cardValue, { color: targetDate ? c.inkDark : c.inkMuted }]}>
          {targetDate ? format(parseISO(targetDate), 'MMM d, yyyy') : 'Not set'}
        </Text>
      </TouchableOpacity>

      {canComplete && (
        <TouchableOpacity
          style={[styles.completeBtn, { backgroundColor: c.forest }]}
          onPress={onComplete}
          activeOpacity={0.85}
        >
          <Text style={[styles.completeBtnText, { color: c.inkInverse }]}>Mark complete</Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity style={styles.deleteBtn} onPress={onDelete} activeOpacity={0.7}>
        <Trash size={16} color={c.inkMuted} weight="duotone" />
        <Text style={[styles.deleteBtnText, { color: c.inkMuted }]}>Remove goal</Text>
      </TouchableOpacity>
    </View>
  );
}

/** Target-date picker host: iOS bottom-sheet modal / Android native dialog.
 *  Same platform semantics as before the extraction — the iOS modal stays
 *  mounted and toggles via `visible`; Android mounts the dialog on demand. */
function TargetDateSheet({
  c,
  visible,
  date,
  onChangeDate,
  onClose,
  onSave,
}: {
  c: ThemeColors;
  visible: boolean;
  date: Date;
  onChangeDate: (date: Date) => void;
  onClose: () => void;
  onSave: (date: Date) => void;
}) {
  if (Platform.OS === 'ios') {
    return (
      <Modal
        visible={visible}
        transparent
        animationType="slide"
        onRequestClose={onClose}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={onClose}
        >
          <TouchableOpacity
            style={[styles.modalSheet, { backgroundColor: c.surface }]}
            activeOpacity={1}
          >
            <Text style={[styles.modalLabel, { color: c.inkMuted }]}>TARGET DATE</Text>
            <DateTimePicker
              value={date}
              mode="date"
              display="spinner"
              minimumDate={new Date()}
              onChange={(_, picked) => { if (picked) onChangeDate(picked); }}
              style={{ width: '100%' }}
            />
            <TouchableOpacity
              style={[styles.dateSetBtn, { backgroundColor: c.forest }]}
              onPress={() => onSave(date)}
            >
              <Text style={[styles.dateSetBtnText, { color: c.inkInverse }]}>Set date</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    );
  }

  if (Platform.OS !== 'android' || !visible) return null;
  return (
    <DateTimePicker
      value={date}
      mode="date"
      display="default"
      minimumDate={new Date()}
      onChange={(event, picked) => {
        onClose();
        if (event.type === 'set' && picked) {
          onSave(picked);
        }
      }}
    />
  );
}

/** QC3-D compact journal preview: a compose field, the ~3 most-recent entries,
 *  and a link to the full journal. Multi-entry — every add appends a new row.
 *  Handles empty / loading / error inline (convention floor). */
function GoalJournalPreview({
  c,
  goalId,
  userId,
  onViewAll,
}: {
  c: ThemeColors;
  goalId: string;
  userId: string;
  onViewAll: () => void;
}) {
  const loading = useGoalNotesStore((s) => s.loading);
  const recent = useGoalNotesStore((s) => s.getEntriesForGoal(goalId, 3));
  const totalForGoal = useGoalNotesStore(
    (s) => s.entries.filter((n) => n.goal_id === goalId).length,
  );
  const cloudError = useGoalNotesStore((s) => s.goalNotesCloudError);
  const clearCloudError = useGoalNotesStore((s) => s.clearGoalNotesCloudError);
  const addGoalNote = useGoalNotesStore((s) => s.addGoalNote);

  const handleAddNote = async (text: string) => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    const localDate = formatDate(getAppDate());
    await addGoalNote(goalId, userId, localDate, text);
  };

  return (
    <View style={styles.section}>
      <Text style={[styles.sectionLabel, { color: c.inkMid }]}>JOURNAL</Text>

      <JournalComposer c={c} onAdd={handleAddNote} inputMinHeight={72} />

      {cloudError ? (
        <View style={styles.journalCloudRow}>
          <Text style={[styles.journalCloudHint, { color: c.inkMid }]}>{cloudError}</Text>
          <TouchableOpacity onPress={() => clearCloudError()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} activeOpacity={0.7}>
            <Text style={[styles.journalCloudDismiss, { color: c.accent }]}>Dismiss</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {loading && recent.length === 0 ? (
        <View
          style={[styles.journalSkeleton, { backgroundColor: applyOpacity(c.inkMuted, 0.12) }]}
        />
      ) : recent.length === 0 ? (
        <Text style={[styles.journalEmpty, { color: c.inkMid }]}>
          {"A quiet place to note how it's really going."}
        </Text>
      ) : (
        <>
          {recent.map((entry: GoalNote, i: number) => (
            <View key={entry.id}>
              {i > 0 && <View style={[styles.journalSeparator, { backgroundColor: c.borderLight }]} />}
              <View style={styles.journalEntry}>
                <Text style={[styles.journalEntryDate, { color: c.inkMid }]}>
                  {format(parseISO(entry.created_at), 'MMM d')}
                </Text>
                <Text style={[styles.journalEntryText, { color: c.inkDark }]} numberOfLines={3}>
                  {entry.text.trim()}
                </Text>
              </View>
            </View>
          ))}
          <TouchableOpacity style={styles.journalViewAll} onPress={onViewAll} activeOpacity={0.7}>
            <Text style={[styles.journalViewAllText, { color: c.accent }]}>
              {totalForGoal > recent.length ? `View journal · ${totalForGoal} entries` : 'View journal'}
            </Text>
            <ArrowRight size={14} color={c.accent} weight="bold" />
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

// ── Derivation + confirm helpers (QC2-C retry #1) ───────────────────────────

/** Weekly state + momentum story for a goal — the same machinery Focus uses,
 *  packaged as a hook per the FU-6 useSuggestGoalFlow precedent. */
function useGoalWeekStory({
  goal,
  linkedMarks,
  allEvents,
  appDateKey,
  momentumSnapshot,
  longestRunEntry,
  todayStr,
}: {
  goal: { created_at: string } | undefined;
  linkedMarks: Mark[];
  allEvents: GoalEvents;
  appDateKey: string;
  momentumSnapshot: { state: string; days: number } | undefined;
  longestRunEntry: Parameters<typeof effectivePersonalBest>[0];
  todayStr: string;
}) {
  // appDateKey is an intentional dep: recompute the week when the debug date moves.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const weekDates = useMemo(() => currentWeekDates(), [appDateKey]);

  const weeklyCountsMap = useMemo(
    () => buildWeeklyCountsMap(linkedMarks, allEvents, weekDates),
    [linkedMarks, allEvents, weekDates],
  );

  // Today's increment total per mark — drives the quick-log completion lock so a
  // binary mark (dailyTarget 1) can't be tapped past once a day here, matching
  // Focus, the mark detail, and MarkCard. Quantitative marks (water) stay open
  // until their daily target is met.
  const todayCountsMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of allEvents) {
      if (e.event_type !== 'increment' || e.deleted_at || e.occurred_local_date !== todayStr) continue;
      map.set(e.mark_id, (map.get(e.mark_id) ?? 0) + (e.amount ?? 1));
    }
    return map;
  }, [allEvents, todayStr]);

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

  return { weeklyCountsMap, todayCountsMap, weekSentence };
}

/** Confirm-then-run for completing a goal. Copy unchanged. */
async function confirmCompleteGoal(
  title: string,
  run: () => Promise<unknown>,
  onDone: () => void,
  onError: (message: string) => void,
) {
  const ok = await confirm({
    title: 'Complete this goal?',
    message: `"${title}" will move to your history.`,
    confirmLabel: "Done, it's mine",
    cancelLabel: 'Not yet',
  });
  if (!ok) return;
  try {
    await run();
    onDone();
  } catch {
    onError('Could not complete goal. Please try again.');
  }
}

/** Confirm-then-run for removing a goal. Copy unchanged. */
async function confirmRemoveGoal(
  title: string,
  run: () => Promise<unknown>,
  onDone: () => void,
  onError: (message: string) => void,
) {
  const ok = await confirm({
    title: 'Remove this goal?',
    message: `"${title}" will be permanently removed.`,
    confirmLabel: 'Remove',
    cancelLabel: 'Keep it',
    destructive: true,
  });
  if (!ok) return;
  try {
    await run();
    onDone();
  } catch {
    onError('Could not remove goal. Please try again.');
  }
}

// ── Screen ───────────────────────────────────────────────────────────────────

export default function GoalDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const theme = useEffectiveTheme();
  const c = themedColors(theme);
  const { user } = useAuth();
  const userId = user?.id;
  const { incrementCounter } = useCounters();
  const { showError } = useNotification();

  const { isProUnlocked } = useIapSubscriptions();

  const goal = useGoalsStore(s => s.goals.find(g => g.id === id));
  const goals = useGoalsStore(s => s.goals);
  const marks = useMarksStore(s => s.marks);
  const updateMark = useMarksStore(s => s.updateMark);
  const linkMarkToGoal = useGoalsStore(s => s.linkMarkToGoal);
  const unlinkMarkFromGoal = useGoalsStore(s => s.unlinkMarkFromGoal);
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
  // QC4-L: view state (which control the rows show, whether the sheet is up) —
  // transient, never persisted, so useState is right here.
  const [managingMarks, setManagingMarks] = useState(false);
  const [showLinkSheet, setShowLinkSheet] = useState(false);

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

  // QC4-L: candidates to link = every live mark not already on this goal. A
  // mark carries one goal_id, so a candidate already on another goal MOVES —
  // the sheet names that goal rather than letting it happen quietly.
  const linkCandidates = useMemo(
    () => marks.filter(m => !m.deleted_at && m.goal_id !== id),
    [marks, id],
  );

  const goalTitleById = useCallback(
    (goalId: string | null | undefined) =>
      goalId ? goals.find(g => g.id === goalId)?.title : undefined,
    [goals],
  );

  // The real gate from lib/gating.ts — free is 4 marks per goal, Livra+ lifts
  // it. Control itself is never premium: unlink, manage and choose stay free at
  // any tier; only the cap on how many is a Livra+ line.
  // Only the PER-GOAL cap applies here: linking moves a mark that already exists,
  // so the account-wide ceiling (FREE_MARK_CEILING) cannot be crossed by linking.
  const canLinkMore = useMemo(
    () => canAddMarkToGoal(isProUnlocked, countMarksInGoal(marks, id ?? '')),
    [isProUnlocked, marks, id],
  );

  // M4 (PL-5): a goal that never had a mark gets day-one copy; a goal whose
  // marks were all deleted (or that has logged history) gets the return copy.
  const emptyMarksLine = useMemo(
    () => getEmptyStateCopy('goalDetail', deriveGoalDetailEmptyVariant(id ?? '', marks, allEvents)).body,
    [id, marks, allEvents],
  );

  // ── Weekly state (same machinery Focus uses) ──────────────────────────────

  const { weeklyCountsMap, todayCountsMap, weekSentence } = useGoalWeekStory({
    goal,
    linkedMarks,
    allEvents,
    appDateKey,
    momentumSnapshot,
    longestRunEntry,
    todayStr,
  });

  // ── Hero category (majority of linked marks) ──────────────────────────────

  const heroCategory = useMemo(() => majorityCategory(linkedMarks), [linkedMarks]);
  const heroCat = CATEGORY_MAP[heroCategory] ?? CATEGORY_MAP.custom;
  const heroMark = useMemo(() => dominantMark(linkedMarks), [linkedMarks]);

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

  // QC4-L: a mark reaches a goal through TWO records — `mark.goal_id` (what
  // this screen and the free cap read) and `goal_mark_links` / `linked_mark_ids`
  // (what progress and momentum read). Creation writes both; linking here must
  // too, or the mark shows in the list and counts against the cap while
  // contributing nothing to the ring.
  const handleOpenLinkSheet = useCallback(() => {
    if (!canLinkMore) {
      showError(MARK_PER_GOAL_LIMIT_MESSAGE);
      setTimeout(() => router.push('/paywall'), 2000);
      return;
    }
    setShowLinkSheet(true);
  }, [canLinkMore, showError, router]);

  const handleLinkExisting = useCallback(
    async (markId: string) => {
      setShowLinkSheet(false);
      const previousGoalId = marks.find(m => m.id === markId)?.goal_id ?? null;
      try {
        if (previousGoalId && previousGoalId !== id) {
          await unlinkMarkFromGoal(previousGoalId, markId);
        }
        await updateMark(markId, { goal_id: id! });
        await linkMarkToGoal(id!, markId);
      } catch (error: unknown) {
        logger.error('Error linking mark to goal:', error);
        showError('Could not link that mark. Try again.');
      }
    },
    [marks, id, unlinkMarkFromGoal, updateMark, linkMarkToGoal, showError],
  );

  // The honest version. Unlinking leaves every logged event intact on the mark
  // — nothing is deleted — but this goal's ring counts only the marks still
  // linked (lib/goalLogic.ts calculateGoalProgress), so it will step back. Say
  // that plainly up front instead of letting the number move unexplained. No
  // guilt, no warning-off: the user asked for control.
  const handleUnlink = useCallback(
    async (mark: Mark) => {
      const ok = await confirm({
        title: 'Unlink this mark?',
        message: `"${mark.name}" keeps all of its history and carries on as a daily habit. This goal's progress will count only the marks still linked to it.`,
        confirmLabel: 'Unlink',
        cancelLabel: 'Keep it linked',
      });
      if (!ok) return;
      try {
        await unlinkMarkFromGoal(id!, mark.id);
        await updateMark(mark.id, { goal_id: null });
      } catch (error: unknown) {
        logger.error('Error unlinking mark from goal:', error);
        showError('Could not unlink that mark. Try again.');
      }
    },
    [id, unlinkMarkFromGoal, updateMark, showError],
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

  const { progress, threshold, canComplete, readyToClaim } = getGoalProgress(id!);
  const framing = goalWeekFraming(goal);
  const weekLabel = framing ? `week ${framing.week} of ${framing.totalWeeks}` : null;

  // Completing is a moment, not a list move: run the confirm, then land on the
  // celebration screen (which nothing navigated to before M7).
  const handleComplete = () =>
    void confirmCompleteGoal(
      goal.title,
      () => completeGoal(id!),
      () =>
        router.replace({ pathname: '/goal/complete', params: { goalTitle: goal.title, goalId: id! } } as any),
      showError,
    );

  const handleOpenDatePicker = () => {
    const initial = goal.target_date ? parseISO(goal.target_date) : new Date();
    setPickerDate(initial);
    setShowDatePicker(true);
  };

  const handleSaveDate = async (date: Date) => {
    await updateGoalTargetDate(id!, format(date, 'yyyy-MM-dd'));
    setShowDatePicker(false);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: c.linen }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}>
          <X size={22} color={c.inkDark} weight="bold" />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setEditingTitle(true)} style={styles.headerBtnRight}>
          <PencilSimple size={20} color={c.inkMuted} weight="duotone" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <RingHero
          c={c}
          progress={progress}
          threshold={threshold}
          weekLabel={weekLabel}
          heroMark={heroMark}
          fallbackIcon={heroCat.Icon}
        />

        {readyToClaim && <ClaimGoalCard c={c} onClaim={handleComplete} />}

        <GoalIdentity
          c={c}
          title={goal.title}
          description={goal.description}
          editingTitle={editingTitle}
          titleDraft={titleDraft}
          onChangeDraft={setTitleDraft}
          onSaveTitle={handleSaveTitle}
        />

        <WeekSentenceLine c={c} sentence={weekSentence} />

        <LinkedMarkRows
          c={c}
          marks={linkedMarks}
          weeklyCountsMap={weeklyCountsMap}
          todayCountsMap={todayCountsMap}
          emptyLine={emptyMarksLine}
          managing={managingMarks}
          onToggleManaging={() => setManagingMarks(v => !v)}
          canLinkMore={canLinkMore && linkCandidates.length > 0}
          onQuickLog={handleQuickLog}
          onAddMark={() => router.push({ pathname: '/mark/new', params: { goalId: id } } as any)}
          onLinkExisting={handleOpenLinkSheet}
          onUnlink={handleUnlink}
          onOpenMark={(markId) => router.push(`/mark/${markId}` as any)}
        />

        <GoalJournalPreview
          c={c}
          goalId={id!}
          userId={userId ?? 'local'}
          onViewAll={() => router.push(`/goal/journal/${id}` as any)}
        />

        <DetailFooter
          c={c}
          targetDate={goal.target_date}
          canComplete={canComplete}
          onOpenDatePicker={handleOpenDatePicker}
          onComplete={handleComplete}
          onDelete={() => void confirmRemoveGoal(goal.title, () => deleteGoal(id!), () => router.back(), showError)}
        />
      </ScrollView>

      <LinkMarkSheet
        c={c}
        visible={showLinkSheet}
        candidates={linkCandidates}
        goalTitleById={goalTitleById}
        onPick={(markId) => { void handleLinkExisting(markId); }}
        onClose={() => setShowLinkSheet(false)}
      />

      <TargetDateSheet
        c={c}
        visible={showDatePicker}
        date={pickerDate}
        onChangeDate={setPickerDate}
        onClose={() => setShowDatePicker(false)}
        onSave={(date) => { void handleSaveDate(date); }}
      />

      {/* PL-4 (M5): post-log voice line — the quick-log rows here share
          Focus's increment path, so the line renders here too. */}
      <VoiceLine />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  // QC4-K: close + edit offset from the safe-area inset by headerControl.topGap,
  // each on a 44pt target (was hitSlop 8 on 20–22pt icons).
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingTop: headerControl.topGap,
    paddingBottom: spacing.sm,
  },
  headerBtn: { ...headerControlBoxLeading },
  headerBtnRight: { ...headerControlBoxTrailing },
  // Screen gutter = spacing.lg, applied ONCE here; cards carry no horizontal margins.
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl * 2 },

  // Hero ring (QC2-C): centered, first thing seen.
  ringHero: {
    alignItems: 'center',
    marginTop: spacing.md,
  },
  // QC3-E: the ring + the centered category icon share one square stack so the
  // icon can be absolutely centered over the arc.
  ringStack: {
    width: RING_SIZE,
    height: RING_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringIconBox: {
    position: 'absolute',
    top: RING_ICON_OFFSET,
    left: RING_ICON_OFFSET,
    width: RING_ICON_SIZE,
    height: RING_ICON_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressStory: { alignItems: 'center', marginTop: spacing.sm },
  progressNumber: {
    fontFamily: fonts.sansBold,
    fontSize: fontSize['2xl'],
    lineHeight: 34,
  },
  progressCaption: {
    fontFamily: fonts.sans,
    fontSize: fontSize.sm,
  },

  // The goal's title study sits below the hero ring (QC3-E: the icon moved into
  // the ring, so this block leads with the title and carries the top gutter).
  identityBlock: { marginTop: spacing.lg },
  // Type lives in <GoalTitle>; layout spacing only.
  title: { marginTop: 0 },
  why: {
    fontFamily: fonts.sansItalic,
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

  // Claim card (M7): ember-tinted like other warm status surfaces; the button
  // is the same forest primary the footer complete button uses.
  claimCard: {
    marginTop: spacing.lg,
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  claimLine: {
    fontFamily: fonts.sansItalic,
    fontSize: fontSize.lg,
    lineHeight: 22,
    textAlign: 'center',
  },
  claimBtn: {
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    minHeight: headerControl.minTarget,
    justifyContent: 'center',
  },
  claimBtnText: { fontSize: fontSize.md, fontFamily: fonts.sansSemibold },

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
  // Mentor voice line (PL-5): serifItalic + inkMid, matching the other empty invitations.
  emptyMarksText: { fontSize: fontSize.md, lineHeight: 20, fontFamily: fonts.sansItalic, textAlign: 'center' },
  addMarkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.md,
  },
  addMarkBtnText: { fontSize: fontSize.sm, fontFamily: fonts.sansSemibold },

  // QC4-L: manage / link affordances. Every target clears the HIG minimum from
  // the shared token — real boxes, never hitSlop.
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  manageBtn: {
    minHeight: headerControl.minTarget,
    justifyContent: 'center',
    paddingLeft: spacing.md,
  },
  manageBtnText: { fontSize: fontSize.sm, fontFamily: fonts.sansMedium },
  markActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  markActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: headerControl.minTarget,
  },
  markActionText: { fontSize: fontSize.sm, fontFamily: fonts.sansMedium },
  linkExistingBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: headerControl.minTarget,
  },
  linkExistingText: { fontSize: fontSize.sm, fontFamily: fonts.sansMedium },
  pickerList: { maxHeight: 320 },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    minHeight: headerControl.minTarget,
  },
  pickerRowHint: { fontSize: fontSize.xs, fontFamily: fonts.sans },
  pickerEmpty: {
    fontFamily: fonts.sansItalic,
    fontSize: fontSize.lg,
    lineHeight: 22,
    paddingVertical: spacing.md,
  },

  // Journal preview (QC3-D)
  journalCloudRow: {
    marginTop: spacing.xs,
    gap: spacing.xs,
  },
  journalCloudHint: { fontSize: fontSize.sm, fontFamily: fonts.sans, lineHeight: 18 },
  journalCloudDismiss: { fontSize: fontSize.sm, fontFamily: fonts.sansMedium },
  journalSkeleton: {
    height: 60,
    borderRadius: borderRadius.md,
    marginTop: spacing.sm,
  },
  journalEmpty: {
    fontFamily: fonts.sansItalic,
    fontSize: fontSize.lg,
    lineHeight: 22,
    marginTop: spacing.sm,
  },
  journalEntry: { paddingVertical: spacing.sm, gap: 3 },
  journalEntryDate: { fontSize: fontSize.sm, fontFamily: fonts.sans },
  journalEntryText: { fontSize: fontSize.md, fontFamily: fonts.sans, lineHeight: 20 },
  journalSeparator: { height: StyleSheet.hairlineWidth, marginTop: spacing.xs },
  journalViewAll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.sm,
    paddingVertical: spacing.xs,
  },
  journalViewAllText: { fontSize: fontSize.sm, fontFamily: fonts.sansMedium },

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
