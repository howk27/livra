/**
 * The four states a goal can take on Focus, one component each.
 *
 * These lived inline in `focus.tsx` as a single map closure that fallow scored
 * at cyclomatic 17 — not because the logic was tangled, but because four full
 * JSX trees and their accessibility ternaries were sharing one function body.
 * Splitting by STATE rather than by fragment keeps each branch's reasoning
 * (and the founder decisions recorded against it) next to the markup it
 * explains, and leaves the caller a dispatcher that reads top to bottom.
 *
 * The shell — surface, radius, shadow — is `goalCard`, carried here. The
 * spotlight card's inner padding belongs to NextMoveCard, which is padding only.
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { CaretDown, CaretUp, CheckCircle, CircleIcon as Circle } from 'phosphor-react-native';
import { fonts, fontSize, spacing, radius, shadow, themedColors } from '../../theme/tokens';
import { useEffectiveTheme } from '../../state/uiSlice';
import { GoalTitle } from '../ui/GoalTitle';
import { NextMoveCard } from '../NextMoveCard';
import { isMarkDoneToday } from '../../lib/focusQueue';
import type { Counter } from '../../types';

/** Marks shown as due-check circles on a queued row, capped for width. */
const QUEUED_CHECK_CAP = 6;

type GoalLike = { id: string; title: string };

/**
 * Every mark on this goal is done — for the week, or just for today. Collapses
 * to a compact row so the goals with work left stay prominent (founder,
 * 2026-07-23). The week-only fold never fired in practice: a daily mark held
 * its goal open until day 7, so today counts too, and the meta line says which.
 */
export function DoneGoalRow({
  goal,
  allDoneForWeek,
  remainingThisWeek,
  onPress,
  onTitlePress,
}: {
  goal: GoalLike;
  allDoneForWeek: boolean;
  /** Check-in days still owed across this goal's marks (lib/focusQueue). */
  remainingThisWeek: number;
  onPress: () => void;
  onTitlePress: () => void;
}) {
  const c = themedColors(useEffectiveTheme());
  // Three voices, one row (founder 2026-07-26, "adding brain to the goals"):
  // week finished → "Done this week"; today's part done with days still owed →
  // "On pace · N more this week" so the fold reads as a schedule holding, not a
  // stall (the original report was "my goal hasn't restarted in days"). The
  // bare "Done today" survives only for the degenerate zero-remaining case a
  // due mark can produce with a 0 cadence. Middle dot per the copy dash rule.
  const meta = allDoneForWeek
    ? 'Done this week'
    : remainingThisWeek > 0
      ? `On pace · ${remainingThisWeek} more this week`
      : 'Done today';
  return (
    <TouchableOpacity
      style={[styles.goalCard, styles.goalCardDone, { backgroundColor: c.surface }]}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityState={{ expanded: false }}
      accessibilityLabel={`${goal.title}, ${allDoneForWeek ? 'all done this week' : `done for today, ${remainingThisWeek} more check-in${remainingThisWeek !== 1 ? 's' : ''} this week`}. Tap to expand.`}
    >
      <CheckCircle size={20} color={c.accent} weight="fill" />
      <GoalTitlePress title={goal.title} onPress={onTitlePress} color={c.inkMid} />
      <Text style={[styles.goalCardDoneMeta, { color: c.inkMid }]}>{meta}</Text>
      {/* Down, not right: this row EXPANDS in place, it does not navigate.
          Same caret vocabulary as the queued rows. */}
      <CaretDown size={16} color={c.inkMuted} weight="bold" />
    </TouchableOpacity>
  );
}

/**
 * A goal with work left today that is not holding the spotlight seat. Title
 * quiet, today's due marks as small circles — the sanctioned Focus progress
 * voice is checks, never fractions or bars. Tapping hoists it into the seat.
 */
export function QueuedGoalRow({
  goal,
  dueMarks,
  todayCountsMap,
  onPress,
  onTitlePress,
}: {
  goal: GoalLike;
  dueMarks: Counter[];
  todayCountsMap: Map<string, number>;
  onPress: () => void;
  onTitlePress: () => void;
}) {
  const c = themedColors(useEffectiveTheme());
  const remainingToday = dueMarks.filter(
    (m) => !isMarkDoneToday(m, todayCountsMap.get(m.id) ?? 0),
  ).length;

  return (
    <TouchableOpacity
      style={[styles.goalCard, styles.goalCardQueued, { backgroundColor: c.surface }]}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`${goal.title}, up next, ${remainingToday} mark${remainingToday !== 1 ? 's' : ''} left today. Tap to expand.`}
    >
      <GoalTitlePress title={goal.title} onPress={onTitlePress} color={c.inkMid} />
      <View style={styles.queuedChecks}>
        {dueMarks.slice(0, QUEUED_CHECK_CAP).map((m) =>
          isMarkDoneToday(m, todayCountsMap.get(m.id) ?? 0) ? (
            <CheckCircle key={m.id} size={14} color={c.accent} weight="regular" />
          ) : (
            <Circle key={m.id} size={14} color={c.inkMuted} weight="regular" />
          ),
        )}
      </View>
      <CaretDown size={16} color={c.inkMuted} weight="bold" />
    </TouchableOpacity>
  );
}

/**
 * A goal fully done today that the user expanded anyway, for review. Keeps the
 * original card shell: header, due rows, dimmed done-for-week rows.
 *
 * Founder 2026-07-24, "unable to close it back up": the header used to carry a
 * CaretRight, which reads as navigate-forward, and the "Show less" row below
 * was gated to a spotlight override a done goal never holds — so the one
 * working affordance looked like a link elsewhere. The caret points UP now,
 * matching the down-caret that invited the expansion, with a fold row backing it.
 */
export function ExpandedGoalCard({
  goal,
  dueMarks,
  doneMarks,
  renderMarkRow,
  onToggle,
  onTitlePress,
}: {
  goal: GoalLike;
  dueMarks: Counter[];
  doneMarks: Counter[];
  renderMarkRow: (
    mark: Counter,
    isLast: boolean,
    dimmed?: boolean,
    maintenance?: boolean,
    celebrateIndex?: number,
  ) => React.ReactNode;
  onToggle: () => void;
  onTitlePress: () => void;
}) {
  const c = themedColors(useEffectiveTheme());
  return (
    <View style={[styles.goalCard, { backgroundColor: c.surface }]}>
      {/* The header is no longer ONE target. The title navigates (founder
          2026-07-26: "user taps on the goal title, opens the goal detail
          screen" — the spotlight card already did this and the folded rows did
          not); the caret keeps the collapse. Collapse is still double-served by
          the FoldRow below, so this cannot regress the 2026-07-24 "unable to
          close it back up" report. */}
      <View style={styles.goalCardHeader}>
        <GoalTitlePress
          title={goal.title}
          onPress={onTitlePress}
          color={c.inkDark}
          style={styles.goalCardTitle}
        />
        <TouchableOpacity
          onPress={onToggle}
          activeOpacity={0.7}
          style={styles.headerCaret}
          accessibilityRole="button"
          accessibilityState={{ expanded: true }}
          accessibilityLabel={`Collapse ${goal.title}`}
        >
          <CaretUp size={16} color={c.inkMuted} weight="bold" />
        </TouchableOpacity>
      </View>

      {dueMarks.map((mark, idx) =>
        renderMarkRow(mark, idx === dueMarks.length - 1 && doneMarks.length === 0, false, false, idx),
      )}

      {doneMarks.length > 0 && (
        <>
          <View style={[styles.doneDivider, { backgroundColor: c.borderLight }]} />
          {doneMarks.map((mark, idx) => renderMarkRow(mark, idx === doneMarks.length - 1, true, false, idx))}
        </>
      )}

      <FoldRow label={`Collapse ${goal.title}`} onPress={onToggle} />
    </View>
  );
}

/**
 * The spotlight seat: the Next Move card (spec §1). Exactly one goal holds it.
 *
 * Decision #1, "No extra rows": done-for-week marks ask nothing today and
 * render NOWHERE here, not even dimmed. They still surface inside a manually
 * re-expanded done-today goal and in Daily Habits. Deliberately no doneMarks.
 *
 * The fold row appears only when a queued-row tap hoisted this goal into the
 * seat — that is the only case with a computed order to hand back to.
 */
export function SpotlightGoalCard({
  goal,
  hero,
  chips,
  overflowCount,
  comeback,
  hoisted,
  onGoalPress,
  onMarkIt,
  onHeroLongPress,
  onChipPress,
  onOverflowPress,
  onRelease,
}: {
  goal: GoalLike;
  hero: Counter;
  chips: React.ComponentProps<typeof NextMoveCard>['chips'];
  overflowCount: number;
  comeback: { ask: string } | null;
  /** True when a queued tap put this goal in the seat, so it can be handed back. */
  hoisted: boolean;
  onGoalPress: () => void;
  onMarkIt: () => void;
  onHeroLongPress: () => void;
  onChipPress: (markId: string) => void;
  onOverflowPress: () => void;
  onRelease: () => void;
}) {
  const c = themedColors(useEffectiveTheme());
  return (
    <View style={[styles.goalCard, { backgroundColor: c.surface }]}>
      <NextMoveCard
        goalTitle={goal.title}
        onGoalPress={onGoalPress}
        hero={hero}
        comeback={comeback}
        onMarkIt={onMarkIt}
        onHeroLongPress={onHeroLongPress}
        chips={chips}
        overflowCount={overflowCount}
        onChipPress={onChipPress}
        onOverflowPress={onOverflowPress}
      />
      {hoisted && <FoldRow label={`Collapse ${goal.title}`} onPress={onRelease} />}
    </View>
  );
}

/**
 * The goal title as its OWN touch target, opening the goal detail screen.
 *
 * Founder 2026-07-26: "the first 2 goals when I tap on the goal name they open
 * and close the goal card, however the third goal opens the goal detail screen.
 * Make them match." The third goal was whichever held the spotlight seat —
 * NextMoveCard has always made its title a link — while the folded rows and the
 * expanded header spent the title tap on expand/collapse instead. Same-looking
 * text, three different outcomes depending on where a goal happened to sit in
 * the queue. The title is now a link everywhere; the caret and the row body keep
 * expand/collapse, so nothing lost an affordance.
 *
 * `alignSelf: 'stretch'` gives the target the FULL height of the row it sits in
 * rather than the ~20pt of its own text, clearing 44pt without adding a pixel to
 * any layout — and without hitSlop, which this codebase bans because it clips at
 * the parent's bounds (see the headerControl note in PROJECT-CONTEXT).
 */
function GoalTitlePress({
  title,
  onPress,
  color,
  style,
}: {
  title: string;
  onPress: () => void;
  color: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={[styles.goalTitlePress, style]}
      accessibilityRole="button"
      accessibilityLabel={`Open ${title}`}
    >
      <GoalTitle title={title} size="card" color={color} />
    </TouchableOpacity>
  );
}

/** The "Show less" row, identical in both cards that offer one. */
function FoldRow({ label, onPress }: { label: string; onPress: () => void }) {
  const c = themedColors(useEffectiveTheme());
  return (
    <TouchableOpacity
      style={styles.expanderRow}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Text style={[styles.expanderText, { color: c.accent }]}>Show less</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  goalCard: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    borderRadius: radius.xl,
    overflow: 'hidden',
    ...shadow.card,
  },
  // Collapsed "all done" goal — a single quiet row so finished goals recede
  // without leaving the list. Reuses the goalCard shell (shadow + radius) with
  // a compact single-line row layout.
  goalCardDone: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  // The title's own target. Stretch, not a minHeight: it inherits whatever
  // height the row already has (>= 44 from the row's own vertical padding), so
  // the target is full-height and the layout is byte-identical to before.
  goalTitlePress: {
    flex: 1,
    alignSelf: 'stretch',
    justifyContent: 'center',
  },
  // 44pt-wide box so the 16px caret is a real target now that it, and not the
  // whole header, owns the collapse.
  headerCaret: {
    alignSelf: 'stretch',
    justifyContent: 'center',
    alignItems: 'flex-end',
    minWidth: 44,
  },
  goalCardDoneMeta: {
    fontFamily: fonts.sansMedium,
    fontSize: fontSize.sm,
  },
  // Queued goal (spotlight queue) — a compact row for goals waiting their
  // turn: quiet title, small due-check circles, down-caret. Same card shell
  // as goalCardDone so the queue reads as one family of folded rows.
  goalCardQueued: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  queuedChecks: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  goalCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md + spacing.xs,
    paddingBottom: spacing.sm,
  },
  // The goal is the reason this card exists — it anchors the card, above the
  // greeting (xl) and well clear of body text, not one more white-text row.
  // Type lives in <GoalTitle>; this is layout-only (row flex + chevron gap).
  goalCardTitle: {
    flex: 1,
    marginRight: spacing.sm,
  },
  doneDivider: {
    height: 0.5,
    marginHorizontal: spacing.lg,
    marginTop: spacing.xs,
  },
  expanderRow: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  expanderText: {
    fontFamily: fonts.sansMedium,
    fontSize: fontSize.sm,
  },
});
