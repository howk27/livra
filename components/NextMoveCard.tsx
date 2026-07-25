// components/NextMoveCard.tsx
// Milestone "Next Move identity" (spec §1) — the Focus spotlight card's hero:
// one mark in the seat, a quiet "then/up next" chip strip behind it, and a
// comeback presentation when the gap-detector fires. PURELY presentational —
// pickNextMove / isComebackState / the mark list are all computed by the
// caller (app/(tabs)/focus.tsx, task 7). No store access, no selectors here.
//
// Anatomy (brainstorm 2026-07-24, card-states.html):
//   goal title (tappable, quiet serif) → microlabel (ember, mint on comeback)
//   → hero row (medallion + name [+ comeback ask] + Mark it pill)
//   → chip strip ("up next" + up to 6 chips + optional +N overflow chip).
//
// Motion: the hero content re-enters (opacity) through the single
// useMotion() gateway whenever the seated mark changes — same gateway
// MarkRow's day-complete celebration pulse rides, so Reduce Motion collapses
// it to an instant swap rather than inventing a second animation path.
import React, { createElement, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle } from 'react-native-reanimated';
import { CheckCircle, CircleIcon as Circle } from 'phosphor-react-native';

import { fonts, fontSize, spacing, radius, shadow, motion, themedColors, headerControl } from '../theme/tokens';
import { useEffectiveTheme } from '../state/uiSlice';
import { useMotion } from '../hooks/useMotion';
import { GoalTitle } from './ui/GoalTitle';
import { CATEGORY_MAP } from './ui/MarkRow';
import { resolveMarkCategory, resolveMarkIcon, resolveMarkAccent } from '../lib/markCategoryResolve';
import type { Counter } from '../types';

export type NextMoveCardProps = {
  goalTitle: string;
  onGoalPress: () => void; // push to goal detail
  hero: Counter; // the mark in the seat
  comeback: null | { ask: string }; // non-null → comeback presentation
  onMarkIt: () => void; // logs the hero (existing increment path)
  onHeroLongPress: () => void; // existing mark action sheet
  chips: Array<{ id: string; name: string; doneToday: boolean }>; // due-today marks EXCLUDING hero, cap 6
  overflowCount: number; // beyond the 6 → '+N'
  onChipPress: (markId: string) => void; // hero override
  onOverflowPress: () => void; // goal detail
};

export function NextMoveCard({
  goalTitle,
  onGoalPress,
  hero,
  comeback,
  onMarkIt,
  onHeroLongPress,
  chips,
  overflowCount,
  onChipPress,
  onOverflowPress,
}: NextMoveCardProps) {
  const theme = useEffectiveTheme();
  const c = themedColors(theme);
  const { timing } = useMotion();

  // The seated mark's own icon/accent — same resolution order the goal-detail
  // medallion and Focus rows use (resolveMarkIcon → category fallback).
  const heroIcon = resolveMarkIcon(hero) ?? CATEGORY_MAP[resolveMarkCategory(hero)]?.Icon ?? CATEGORY_MAP.custom.Icon;
  const heroAccent = resolveMarkAccent(hero);

  // Hero-swap entrance: fade the hero content in whenever the seated mark's
  // id changes. Reduce Motion collapses the fade to 0ms via useMotion, so the
  // new mark still lands instantly rather than skipping the gateway.
  const heroOpacity = useSharedValue(1);
  useEffect(() => {
    heroOpacity.value = 0;
    heroOpacity.value = timing(1, motion.quick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hero.id]);
  const heroAnimatedStyle = useAnimatedStyle(() => ({ opacity: heroOpacity.value }));

  const heroLabel = `${goalTitle}, next move: ${hero.name}. Double-tap to mark it.`;
  const showChipStrip = chips.length > 0 || overflowCount > 0;

  return (
    <View style={[styles.card, { backgroundColor: c.surface }]}>
      {/* Goal title — quiet serif, tappable to goal detail */}
      <TouchableOpacity onPress={onGoalPress} activeOpacity={0.7} accessibilityRole="button">
        <GoalTitle title={goalTitle} size="card" color={c.inkMid} style={styles.goalTitle} />
      </TouchableOpacity>

      {/* Microlabel: ember normally, mint + softened copy on a comeback */}
      <Text style={[styles.microlabel, { color: comeback ? c.mint : c.ember }]}>
        {comeback ? 'START BACK SMALL' : 'NEXT MOVE'}
      </Text>

      {/* Hero row */}
      <Animated.View style={[styles.heroRow, heroAnimatedStyle]}>
        <View style={[styles.medallion, { backgroundColor: c.forest }]}>
          {createElement(heroIcon, { size: 20, color: heroAccent, weight: 'duotone' })}
        </View>
        <View style={styles.heroText}>
          <Text style={[styles.heroName, { color: c.inkDark }]}>{hero.name}</Text>
          {comeback && <Text style={[styles.heroAsk, { color: c.inkMid }]}>{comeback.ask}</Text>}
        </View>
        <TouchableOpacity
          style={[styles.markItPill, { backgroundColor: c.forest }]}
          onPress={onMarkIt}
          onLongPress={onHeroLongPress}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={heroLabel}
        >
          <Text style={[styles.markItText, { color: c.inkInverse }]}>Mark it</Text>
        </TouchableOpacity>
      </Animated.View>

      {/* Chip strip: due-today marks excluding the hero */}
      {showChipStrip && (
        <View style={[styles.chipStrip, { borderTopColor: c.borderLight }]}>
          <Text style={[styles.upNext, { color: c.inkMid }]}>up next</Text>
          {chips.map((chip) => (
            <TouchableOpacity
              key={chip.id}
              style={styles.chip}
              onPress={() => onChipPress(chip.id)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`${chip.name}, up next. Tap to make it the next move.`}
            >
              {chip.doneToday ? (
                <CheckCircle testID={`next-move-chip-check-${chip.id}`} size={11} weight="fill" color={c.accent} />
              ) : (
                <Circle testID={`next-move-chip-circle-${chip.id}`} size={11} weight="regular" color={c.borderMid} />
              )}
              <Text style={[styles.chipName, { color: c.inkMid }]}>{chip.name}</Text>
            </TouchableOpacity>
          ))}
          {overflowCount > 0 && (
            <TouchableOpacity
              style={styles.chip}
              onPress={onOverflowPress}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`${overflowCount} more due today. Tap to see all.`}
            >
              <Text style={[styles.chipName, { color: c.inkMid }]}>{`+${overflowCount}`}</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.xl,
    padding: spacing.lg,
    ...shadow.card,
  },
  goalTitle: {
    marginBottom: spacing.sm,
  },
  microlabel: {
    fontFamily: fonts.sansBold,
    fontSize: 10,
    letterSpacing: 1.4,
    marginBottom: 2,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingTop: 6,
    paddingBottom: spacing.sm,
  },
  medallion: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroText: {
    flex: 1,
  },
  heroName: {
    fontFamily: fonts.sansSemibold,
    fontSize: 19,
    lineHeight: 24,
  },
  heroAsk: {
    fontFamily: fonts.sans,
    fontSize: fontSize.sm,
    marginTop: 2,
  },
  markItPill: {
    minHeight: headerControl.minTarget,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markItText: {
    fontFamily: fonts.sansSemibold,
    fontSize: fontSize[13],
  },
  chipStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingTop: spacing.sm,
    marginTop: spacing.xs,
    borderTopWidth: 1,
  },
  upNext: {
    fontFamily: fonts.sans,
    fontSize: fontSize.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  chipName: {
    fontFamily: fonts.sans,
    fontSize: fontSize.sm,
  },
});
