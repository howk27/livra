import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { spacing, fontSize, fontWeight, borderRadius } from '../theme/tokens';

// Fixed brand colors — NOT from theme tokens.
// This card is a shareable image artifact: it must always look the same
// regardless of the user's theme setting.
const CARD_BG = '#1C2826';
const CARD_TEXT = '#F0E6D0';
const CARD_MUTED = 'rgba(240,230,208,0.55)';
const CARD_ACCENT = '#C47E8A';

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
  levelTitle: string;
  daysTaken: number; // always provided — computed from created_at
  targetDateLabel?: string; // only when goal had a target_date
  forwardRef?: React.RefObject<View>;
}

export function GoalCompletionShareCard({
  goalTitle,
  completedDate,
  levelTitle,
  daysTaken,
  targetDateLabel,
  forwardRef,
}: GoalCompletionShareCardProps) {
  const displayDate = formatDate(completedDate);

  return (
    <View
      ref={forwardRef}
      collapsable={false}
      style={styles.card}
    >
      {/* Top: LIVRA wordmark */}
      <View style={styles.topSection}>
        <Text style={styles.wordmark}>LIVRA</Text>
      </View>

      {/* Body: centered content */}
      <View style={styles.body}>
        <Text
          style={styles.goalTitle}
          numberOfLines={4}
          adjustsFontSizeToFit
        >
          {goalTitle}
        </Text>

        <Text style={styles.completionCopy}>{"Done. That one's yours forever."}</Text>

        <View style={styles.metaRow}>
          <Text style={styles.metaText}>{daysTaken} days</Text>
          {targetDateLabel != null ? (
            <Text style={styles.metaText}>{targetDateLabel}</Text>
          ) : null}
        </View>

        {/* Level badge */}
        <View style={styles.levelBadge}>
          <Text style={styles.levelBadgeText}>{levelTitle}</Text>
        </View>
      </View>

      {/* Bottom: footer */}
      <View style={styles.bottomSection}>
        <Text style={styles.footer}>livra app</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    backgroundColor: CARD_BG,
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
    color: CARD_ACCENT,
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
    color: CARD_TEXT,
    fontSize: 40,
    fontWeight: fontWeight.bold,
    textAlign: 'center',
    lineHeight: 44,
  },
  completionCopy: {
    color: CARD_MUTED,
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
    color: CARD_MUTED,
    fontSize: fontSize.sm,
    textAlign: 'center',
  },
  levelBadge: {
    borderWidth: 1,
    borderColor: CARD_ACCENT,
    borderRadius: borderRadius.full,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.sm,
  },
  levelBadgeText: {
    color: CARD_ACCENT,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    letterSpacing: 0.5,
  },
  bottomSection: {
    alignItems: 'center',
  },
  footer: {
    color: CARD_MUTED,
    fontSize: fontSize.xs,
    letterSpacing: 1,
    textAlign: 'center',
  },
});
