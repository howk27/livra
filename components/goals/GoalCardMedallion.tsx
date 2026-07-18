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
  dominantMark,
  majorityCategory,
  resolveMarkIcon,
  resolveMarkAccent,
} from '../../lib/markCategoryResolve';
import type { Mark } from '../../types';

interface GoalCardMedallionProps {
  /** The goal's live (non-deleted) linked marks. */
  marks: Mark[];
  testID?: string;
}

/**
 * Small tinted medallion. The tint is the dominant mark's OWN accent (per-icon,
 * QC Fail #3), not a category hue, so two goals with different marks are
 * tellable apart at a glance. No marks → custom fallback icon + accent.
 */
export function GoalCardMedallion({ marks, testID }: GoalCardMedallionProps) {
  const heroMark = dominantMark(marks);
  const catData = CATEGORY_MAP[majorityCategory(marks)] ?? CATEGORY_MAP.custom;
  const Icon = (heroMark ? resolveMarkIcon(heroMark) : null) ?? catData.Icon;
  const accent = heroMark
    ? resolveMarkAccent({ name: heroMark.name, emoji: heroMark.emoji, color: heroMark.color })
    : catData.accent;

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
