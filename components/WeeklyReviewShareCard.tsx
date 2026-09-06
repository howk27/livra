// components/WeeklyReviewShareCard.tsx
// The Weekly Review as a shareable image (First-100 sprint, board 2026-09-04:
// the one build that is an acquisition loop, not a retention bet). Rendered
// OFFSCREEN by app/review/index.tsx and captured via generateShareCard; never
// visible in the UI itself.
//
// Deliberate calls:
// - ALWAYS the light linen palette, regardless of app theme: the card is a
//   marketing artifact with one committed look (theme rule allows a design
//   that deliberately commits, and the serif-on-linen look is the asset).
// - NO goal titles and NO why quote: a share must never leak a personal goal
//   name onto someone's feed. Week label, headline, day dots, one count line.
//   tests/unit/weeklyReviewShareCard.test.ts pins the absence.
// - 4:5 portrait (340x425pt), the feed-native ratio.
// - A quiet week renders no count line: a zero is never rendered (hard rule).
import React, { forwardRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { themedColors, spacing, radius, fonts, fontSize } from '../theme/tokens';
import { applyOpacity } from '../src/components/icons/color';

const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export const SHARE_CARD_WIDTH = 340;
export const SHARE_CARD_HEIGHT = 425;

export type WeeklyReviewShareCardProps = {
  weekLabel: string;
  headline: string;
  daysActive: boolean[];
  daysActiveCount: number;
  marksLogged: number;
};

export const WeeklyReviewShareCard = forwardRef<View, WeeklyReviewShareCardProps>(
  function WeeklyReviewShareCard({ weekLabel, headline, daysActive, daysActiveCount, marksLogged }, ref) {
    const c = themedColors('light');
    return (
      <View ref={ref} collapsable={false} style={[styles.card, { backgroundColor: c.linen }]}>
        <View>
          <Text style={[styles.kicker, { color: c.inkMuted }]}>{weekLabel}</Text>
          <Text style={[styles.headline, { color: c.inkDark }]}>{headline}</Text>

          <View style={styles.dayStrip}>
            {daysActive.map((active, i) => (
              <View key={i} style={styles.dayCell}>
                <View
                  style={[
                    styles.dayDot,
                    active
                      ? { backgroundColor: c.forest }
                      : { backgroundColor: applyOpacity(c.inkMuted, 0.18) },
                  ]}
                />
                <Text style={[styles.dayLabel, { color: c.inkMuted }]}>{DAY_LETTERS[i]}</Text>
              </View>
            ))}
          </View>

          {daysActiveCount > 0 && (
            <Text style={[styles.meta, { color: c.inkMid }]}>
              {daysActiveCount === 1 ? '1 day showed up' : `${daysActiveCount} days showed up`}
              {marksLogged > 0
                ? ` · ${marksLogged === 1 ? '1 mark' : `${marksLogged} marks`}`
                : ''}
            </Text>
          )}
        </View>

        <View style={[styles.footer, { borderTopColor: applyOpacity(c.inkMuted, 0.25) }]}>
          <Text style={[styles.wordmark, { color: c.forest }]}>Livra</Text>
          <Text style={[styles.site, { color: c.inkMuted }]}>livralife.com</Text>
        </View>
      </View>
    );
  },
);

const styles = StyleSheet.create({
  card: {
    width: SHARE_CARD_WIDTH,
    height: SHARE_CARD_HEIGHT,
    borderRadius: radius.lg,
    padding: spacing.xl,
    justifyContent: 'space-between',
  },
  kicker: {
    fontFamily: fonts.sansMedium,
    fontSize: fontSize.sm,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  headline: {
    fontFamily: fonts.serif,
    fontSize: fontSize['3xl'],
    lineHeight: 38,
    marginBottom: spacing.lg,
  },
  dayStrip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.sm,
    marginBottom: spacing.lg,
  },
  dayCell: { alignItems: 'center', gap: 6 },
  dayDot: { width: 18, height: 18, borderRadius: radius.full },
  dayLabel: { fontFamily: fonts.sansMedium, fontSize: fontSize.xs },
  meta: { fontFamily: fonts.sansItalic, fontSize: fontSize.lg, lineHeight: 24 },
  footer: {
    borderTopWidth: 1,
    paddingTop: spacing.md,
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  wordmark: { fontFamily: fonts.serifSemibold, fontSize: fontSize['2xl'] },
  site: { fontFamily: fonts.sans, fontSize: fontSize.sm },
});
