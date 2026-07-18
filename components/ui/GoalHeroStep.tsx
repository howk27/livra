/**
 * Goal card hero (spec 2026-07-11): the one next step this goal asks for now.
 * Voice guardrails: invitation only. No overdue language, no red, no counts
 * of missed days. Copy must satisfy the repo dash rule (no dash-as-dash).
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { CheckinButton } from './CheckinButton';
import { CATEGORY_MAP } from './MarkRow';
import { fonts, fontSize, spacing, radius, themedColors } from '../../theme/tokens';
import { applyOpacity } from '@/src/components/icons/color';
import { useEffectiveTheme } from '../../state/uiSlice';
import type { NextStepResult } from '../../lib/nextStep';

interface GoalHeroStepProps {
  result: NextStepResult;
  category?: string;
  onLog: (markId: string) => void;
}

export function GoalHeroStep({ result, category, onLog }: GoalHeroStepProps) {
  const theme = useEffectiveTheme();
  const c = themedColors(theme);

  if (result.kind === 'allClear') {
    return (
      <View style={styles.quietWrap}>
        <Text style={[styles.quietText, { color: c.inkMuted }]}>
          {"That's this goal for today."}
        </Text>
      </View>
    );
  }

  if (result.kind === 'tomorrow') {
    return (
      <View style={styles.quietWrap}>
        <Text style={[styles.quietText, { color: c.inkMuted }]}>
          {`Tomorrow: ${result.candidate.name}`}
        </Text>
      </View>
    );
  }

  const { candidate } = result;
  const catData = CATEGORY_MAP[category ?? 'custom'] ?? CATEGORY_MAP.custom;
  const CatIcon = catData.Icon;
  return (
    <View style={[styles.stepWrap, { backgroundColor: applyOpacity(c.forest, 0.08) }]}>
      <View style={[styles.iconTile, { backgroundColor: applyOpacity(catData.accent, 0.12) }]}>
        <CatIcon size={18} color={catData.accent} weight="duotone" />
      </View>
      <View style={styles.stepText}>
        <Text style={[styles.eyebrow, { color: c.inkMuted }]}>Today</Text>
        <Text style={[styles.markName, { color: c.inkDark }]} numberOfLines={1}>
          {candidate.name}
        </Text>
      </View>
      <CheckinButton
        checked={false}
        onCheckin={() => onLog(candidate.markId)}
        accent={c.forest}
        testID="hero-checkin"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  stepWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.md,
  },
  iconTile: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepText: { flex: 1 },
  eyebrow: {
    fontFamily: fonts.sansMedium,
    fontSize: fontSize.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  markName: {
    fontFamily: fonts.sansSemibold,
    fontSize: fontSize.lg,
    marginTop: 1,
  },
  quietWrap: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    paddingVertical: spacing.xs,
  },
  quietText: {
    fontFamily: fonts.sansItalic,
    fontSize: fontSize.md,
  },
});
