// The live artifact at the heart of the QC2-H creation flows ("The Card
// Takes Shape"): the FU-5 hollow goal card, assembling as the user decides.
// Same wash/border/dot/serif treatment as the Goals-screen ActiveGoalCard so
// the object built here IS the object seen later — zero translation gap.
//
// Structure (fallow retry #1): the assembly states live in
// lib/creation/creationPreview.goalCardContent (unit-tested), the visuals in
// small presentational subcomponents; the exported component is composition.
import React, { useEffect, type ComponentType, type ReactNode } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle } from 'react-native-reanimated';
import { fonts, spacing, radius, themedColors, fontSize } from '../../theme/tokens';
import { useEffectiveTheme } from '../../state/uiSlice';
import { useMotion } from '../../hooks/useMotion';
import { applyOpacity } from '../../src/components/icons/color';
import { GoalTitle } from '../ui/GoalTitle';
import { CATEGORY_MAP } from '../ui/MarkRow';
import { goalCardContent } from '../../lib/creation/creationPreview';

export type GoalCardPreviewMark = {
  id: string;
  name: string;
  /** Library glyph; falls back to the CATEGORY_MAP icon for the category. */
  icon?: ComponentType<any>;
  /** CATEGORY_MAP key; drives the tile's accent tint. */
  category?: string;
};

interface GoalCardPreviewProps {
  /** Rendered through GoalTitle (Signature serif). Ignored when titleSlot is set. */
  title?: string;
  /** Editable-title mode: goal/new puts its serif TextInput here. */
  titleSlot?: ReactNode;
  /** Ember hairline under the title (the committed-title flourish). */
  flourish?: boolean;
  /** The why, as a quiet serif-italic line under the title. */
  why?: string;
  /** Selected marks: each lands on the card as a small accent-tinted icon tile. */
  marks?: GoalCardPreviewMark[];
  /** "Plan: 2 marks · 4–5 days/week" — see lib/creation/creationPreview. */
  planMeta?: string | null;
  testID?: string;
}

/**
 * The motion-baseline settle entrance (opacity + rise), one per artifact.
 * Reduced motion renders statically in place — useMotion is the single source.
 */
function useSettleEntrance(rise = 12) {
  const { reduced, spring } = useMotion();
  const entered = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    entered.value = spring(1, 'settle');
    // Mount-only entrance by design.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return useAnimatedStyle(() => ({
    opacity: entered.value,
    transform: [{ translateY: (1 - entered.value) * rise }],
  }));
}

/** One mark tile settling onto the card's meta strip. */
function MarkTile({ mark }: { mark: GoalCardPreviewMark }) {
  const { reduced, spring } = useMotion();
  const entered = useSharedValue(reduced ? 1 : 0);

  useEffect(() => {
    entered.value = spring(1, 'settle');
    // Mount-only entrance; the tile exists once per selected mark.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const style = useAnimatedStyle(() => ({
    opacity: entered.value,
    transform: [{ scale: 0.7 + entered.value * 0.3 }],
  }));

  const catData = CATEGORY_MAP[mark.category ?? 'custom'] ?? CATEGORY_MAP.custom;
  const Icon = mark.icon ?? catData.Icon;
  return (
    <Animated.View
      testID="goal-card-preview-mark-tile"
      accessibilityLabel={mark.name}
      style={[styles.markTile, { backgroundColor: applyOpacity(catData.accent, 0.14) }, style]}
    >
      <Icon size={14} color={catData.accent} weight="duotone" />
    </Animated.View>
  );
}

/** The why as a quiet serif-italic line; nothing when absent. */
function CardWhy({ why, color }: { why: string | null; color: string }) {
  if (!why) return null;
  return (
    <Text testID="goal-card-preview-why" style={[styles.why, { color }]} numberOfLines={2}>
      {why}
    </Text>
  );
}

/** The selected marks as icon tiles; nothing when none are picked. */
function CardMarkStrip({ marks }: { marks: GoalCardPreviewMark[] }) {
  if (marks.length === 0) return null;
  return (
    <View style={styles.markStrip} testID="goal-card-preview-marks">
      {marks.map((m) => (
        <MarkTile key={m.id} mark={m} />
      ))}
    </View>
  );
}

/** The plan meta line; nothing until a plan exists (FU-7a). */
function CardMeta({ planMeta, color }: { planMeta: string | null; color: string }) {
  if (!planMeta) return null;
  return (
    <Text testID="goal-card-preview-meta" style={[styles.meta, { color }]}>
      {planMeta}
    </Text>
  );
}

export function GoalCardPreview({
  title,
  titleSlot,
  flourish = false,
  why,
  marks,
  planMeta,
  testID,
}: GoalCardPreviewProps) {
  const theme = useEffectiveTheme();
  const c = themedColors(theme);
  const entranceStyle = useSettleEntrance();
  const content = goalCardContent({ why, marks, planMeta });

  // FU-5 hollow treatment, verbatim from the Goals screen: hairline accent
  // border + translucent forest wash (denser on the dark ground).
  const cardWash = applyOpacity(c.forest, theme === 'dark' ? 0.1 : 0.07);
  const cardBorder = applyOpacity(c.accent, 0.55);

  return (
    <Animated.View
      testID={testID}
      style={[styles.card, { backgroundColor: cardWash, borderColor: cardBorder }, entranceStyle]}
    >
      <View style={styles.topRow}>
        <View style={[styles.dot, { backgroundColor: c.accent }]} />
      </View>

      {titleSlot ?? (
        <GoalTitle title={title ?? ''} size="card" flourish={flourish} color={c.inkDark} />
      )}

      <CardWhy why={content.why} color={c.inkMid} />
      <CardMarkStrip marks={content.marks} />
      <CardMeta planMeta={content.planMeta} color={c.inkMid} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.xl,
    borderWidth: 1,
    padding: spacing.lg,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  why: {
    fontFamily: fonts.serifItalic,
    fontSize: fontSize.lg,
    lineHeight: 22,
    marginTop: spacing.xs,
  },
  markStrip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  markTile: {
    width: 28,
    height: 28,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  meta: {
    fontFamily: fonts.sans,
    fontSize: fontSize.sm,
    marginTop: spacing.sm,
  },
});
