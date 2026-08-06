// components/goals/GoalCardMedallion.tsx
// M7-QC (b): a calm leading glyph for the Goals-screen active cards, so the list
// reads as more than text. Resolves the goal's dominant-mark icon + its own
// accent the same way the goal-detail hero does (dominantMark / resolveMarkIcon
// / resolveMarkAccent / majorityCategory), so a goal wears a consistent face
// across the two surfaces. Empty goals fall back to the category/custom glyph.

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { radius } from '../../theme/tokens';
import { applyOpacity } from '@/src/components/icons/color';
import { CATEGORY_MAP } from '../ui/MarkRow';
import {
  majorityCategory,
  resolveGoalIcon,
  resolveGoalAccent,
} from '../../lib/markCategoryResolve';
import type { Mark } from '../../types';

interface GoalCardMedallionProps {
  /** The goal's own words — what the glyph is derived from. */
  title?: string | null;
  description?: string | null;
  /** The goal's live (non-deleted) linked marks. Fallback signal only. */
  marks: Mark[];
  testID?: string;
}

/**
 * Small tinted medallion.
 *
 * Founder call 2026-08-06: the glyph comes from the GOAL'S OWN WORDS, not from
 * its marks. It used to be the dominant (most-logged) mark's icon — but a new
 * goal has no logs, so every mark tied at zero and the FIRST mark always won,
 * then the icon could shift once logging started. "Save $5k" now wears a piggy
 * bank from the moment it is created, and keeps it.
 */
export function GoalCardMedallion({ title, description, marks, testID }: GoalCardMedallionProps) {
  const goal = { title, description, marks };
  const catData = CATEGORY_MAP[majorityCategory(marks)] ?? CATEGORY_MAP.custom;
  const Icon = resolveGoalIcon(goal) ?? catData.Icon;
  const accent = resolveGoalAccent(goal);

  return (
    <View
      testID={testID}
      style={[styles.medallion, { backgroundColor: applyOpacity(accent, 0.12) }]}
    >
      <Icon size={18} color={accent} weight="duotone" />
    </View>
  );
}

const styles = StyleSheet.create({
  medallion: {
    width: 32,
    height: 32,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
