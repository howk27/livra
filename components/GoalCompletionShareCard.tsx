import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { spacing, fontSize, fontWeight, borderRadius } from '../theme/tokens';
import { formatBankedMomentum } from '../lib/momentumPresenter';
import {
  DEFAULT_SHARE_CARD_STYLE,
  resolveCardColors,
  type ShareCardStyle,
} from '../lib/sharing/shareCardThemes';

const CARD_WIDTH = Dimensions.get('window').width;
const CARD_HEIGHT = Math.round((CARD_WIDTH * 9) / 16);

function formatDate(dateStr: string): string {
  // dateStr is 'YYYY-MM-DD'
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

export interface GoalCompletionShareCardProps {
  goalTitle: string;
  completedDate: string; // 'YYYY-MM-DD'
  /** XP level badge text. Omitted while XP surfaces are hidden for beta. */
  levelTitle?: string;
  daysTaken: number; // always provided — computed from created_at
  targetDateLabel?: string; // only when goal had a target_date
  bankedMomentumDays?: number | null; // Momentum banked at completion (Phase 1.4)
  forwardRef?: React.RefObject<View>;
  style?: ShareCardStyle;
}

export function GoalCompletionShareCard({
  goalTitle,
  completedDate,
  levelTitle,
  daysTaken,
  targetDateLabel,
  bankedMomentumDays,
  forwardRef,
  style = DEFAULT_SHARE_CARD_STYLE,
}: GoalCompletionShareCardProps) {
  const colors = resolveCardColors(style);
  const displayDate = formatDate(completedDate);
  const bankedLine = formatBankedMomentum(bankedMomentumDays);

  return (
    <View ref={forwardRef} collapsable={false} style={[styles.card, { backgroundColor: colors.bg }]}>
      <View style={styles.topSection}>
        <Text style={[styles.wordmark, { color: colors.accent }]}>LIVRA</Text>
      </View>

      <View style={styles.body}>
        <Text style={[styles.goalTitle, { color: colors.text }]} numberOfLines={4} adjustsFontSizeToFit>
          {goalTitle}
        </Text>

        <Text style={[styles.completionCopy, { color: colors.muted }]}>
          {"Done. That one's yours forever."}
        </Text>

        {(style.showDate || style.showMomentum) ? (
          <View style={styles.metaRow}>
            {style.showDate ? <Text style={[styles.metaText, { color: colors.muted }]}>{displayDate}</Text> : null}
            {style.showDate ? <Text style={[styles.metaText, { color: colors.muted }]}>{daysTaken} days</Text> : null}
            {style.showDate && targetDateLabel != null ? (
              <Text style={[styles.metaText, { color: colors.muted }]}>{targetDateLabel}</Text>
            ) : null}
            {style.showMomentum && bankedLine != null ? (
              <Text style={[styles.metaText, { color: colors.muted }]}>{bankedLine}</Text>
            ) : null}
          </View>
        ) : null}

        {style.showBadge && levelTitle ? (
          <View style={[styles.levelBadge, { borderColor: colors.accent }]}>
            <Text style={[styles.levelBadgeText, { color: colors.accent }]}>{levelTitle}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.bottomSection}>
        <Text style={[styles.footer, { color: colors.muted }]}>livra app</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.xxl,
  },
  topSection: {
    alignItems: 'center',
  },
  wordmark: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    letterSpacing: 4,
    textTransform: 'uppercase',
  },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  goalTitle: {
    fontSize: fontSize['5xl'],
    fontWeight: fontWeight.bold,
    textAlign: 'center',
    lineHeight: 44,
  },
  completionCopy: {
    fontSize: fontSize.base,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  metaRow: {
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  metaText: {
    fontSize: fontSize.sm,
    textAlign: 'center',
  },
  levelBadge: {
    borderWidth: 1,
    borderRadius: borderRadius.full,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.sm,
  },
  levelBadgeText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    letterSpacing: 0.5,
  },
  bottomSection: {
    alignItems: 'center',
  },
  footer: {
    fontSize: fontSize.xs,
    letterSpacing: 1,
    textAlign: 'center',
  },
});
