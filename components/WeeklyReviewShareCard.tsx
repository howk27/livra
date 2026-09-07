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
// - GOAL TITLES ARE ON THE CARD (founder ruling 2026-09-06, decisions.md).
//   The first version excluded them on privacy grounds and a test pinned that
//   absence. The ruling reversed it: the letter look is the asset, and a card
//   with no goal on it says nothing about the person's actual week. The OS
//   share sheet previews the image before it leaves the phone, which is the
//   review step, so no in-app confirmation modal was added.
// - It is a CROP OF THE LETTER, not the whole letter: kicker, headline, prose,
//   day strip, ONE goal block. 4:5 stays fixed at 340x425pt (the feed-native
//   ratio), so what fits is a design constraint, not an accident. MARK_LINE_CAP
//   and the single block are what keep it from overflowing.
// - NO counts line. The letter has none, and with a goal block carrying the
//   substance a "5 days showed up" line would be a third progress vocabulary on
//   one surface (design-decisions Principles: one progress voice per surface).
//   The day strip already shows those same days, visually.
// - A zero is never rendered: an unstarted mark reads "not yet" (the letter's
//   own wording), never "0 of 3".
import React, { forwardRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { ReviewGoalCard } from '../lib/weeklyReview/derive';
import { themedColors, spacing, radius, fonts, fontSize, shadow } from '../theme/tokens';
import { applyOpacity } from '../src/components/icons/color';

const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/** The card is a fixed height, so the goal block is cropped, never scrolled. */
export const MARK_LINE_CAP = 3;

export const SHARE_CARD_WIDTH = 340;
export const SHARE_CARD_HEIGHT = 425;

export type WeeklyReviewShareCardProps = {
  weekLabel: string;
  headline: string;
  prose: string;
  daysActive: boolean[];
  goals: ReviewGoalCard[];
};

export const WeeklyReviewShareCard = forwardRef<View, WeeklyReviewShareCardProps>(
  function WeeklyReviewShareCard({ weekLabel, headline, prose, daysActive, goals }, ref) {
    const c = themedColors('light');
    const goal = goals[0] ?? null;
    return (
      <View ref={ref} collapsable={false} style={[styles.card, { backgroundColor: c.linen }]}>
        <View style={styles.body}>
          <Text style={[styles.kicker, { color: c.inkMuted }]}>{weekLabel}</Text>
          <Text style={[styles.headline, { color: c.inkDark }]} numberOfLines={2}>
            {headline}
          </Text>
          <Text style={[styles.prose, { color: c.inkMid }]} numberOfLines={2}>
            {prose}
          </Text>

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

          {goal !== null && (
            // A raised card is lighter than its page in both themes; this card is
            // always light, so it always earns the warm shadow (cardRaised rule).
            <View style={[styles.goalCard, { backgroundColor: c.cardRaised }, shadow.card]}>
              <Text style={[styles.goalTitle, { color: c.inkDark }]} numberOfLines={1}>
                {goal.title}
              </Text>
              <Text style={[styles.goalMeta, { color: c.inkMuted }]}>
                {goal.weeksIn === 0 ? 'week one' : `week ${goal.weeksIn}`}
              </Text>
              {goal.marks.slice(0, MARK_LINE_CAP).map((m) => (
                <View key={m.markId} style={styles.markRow}>
                  <Text style={[styles.markName, { color: c.inkMid }]} numberOfLines={1}>
                    {m.name}
                  </Text>
                  {/* emberInk, not ember: small text on light chrome is the exact
                      duty plain ember is barred from (Tokens 2026-07-26). */}
                  <Text
                    numberOfLines={1}
                    style={[styles.markCount, { color: m.met ? c.emberInk : c.inkMuted }]}
                  >
                    {m.done === 0 ? 'not yet' : `${m.done} of ${m.target}`}
                    {m.met ? '  ✓' : ''}
                  </Text>
                </View>
              ))}
            </View>
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
    padding: spacing.lg,
    justifyContent: 'space-between',
    // The crop is the design: content that does not fit is cut, never spilled.
    overflow: 'hidden',
  },
  body: { flexShrink: 1, overflow: 'hidden' },
  kicker: {
    fontFamily: fonts.sansMedium,
    fontSize: fontSize.sm,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginBottom: spacing.xs,
  },
  // 28/34 rather than the letter's 32/38: on the card the headline no longer
  // carries the page alone, the goal block answers it.
  headline: {
    fontFamily: fonts.serif,
    fontSize: fontSize['2xl'],
    lineHeight: 34,
    marginBottom: spacing.xs,
  },
  prose: {
    fontFamily: fonts.sans,
    fontSize: fontSize.md,
    lineHeight: 21,
    marginBottom: spacing.sm,
  },
  dayStrip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xs,
    marginBottom: spacing.sm,
  },
  dayCell: { alignItems: 'center', gap: 6 },
  dayDot: { width: 18, height: 18, borderRadius: radius.full },
  dayLabel: { fontFamily: fonts.sansMedium, fontSize: fontSize.xs },
  goalCard: {
    borderRadius: radius.lg,
    padding: spacing.md,
    // The mark rows carry their own top margin, so the block needs less below
    // than beside. Measured: this is the 8pt that keeps the worst case (two-line
    // headline + three mark lines) clear of the footer rule instead of flush.
    paddingBottom: spacing.sm,
  },
  goalTitle: {
    fontFamily: fonts.serifSemibold,
    fontSize: fontSize[22],
    lineHeight: 26,
  },
  goalMeta: {
    fontFamily: fonts.sansMedium,
    fontSize: fontSize.xs,
    textTransform: 'lowercase',
    marginBottom: spacing.sm,
  },
  markRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  markName: { fontFamily: fonts.sans, fontSize: fontSize.base, flexShrink: 1 },
  markCount: { fontFamily: fonts.sansMedium, fontSize: fontSize.base, flexShrink: 0 },
  footer: {
    borderTopWidth: 1,
    paddingTop: spacing.sm,
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  wordmark: { fontFamily: fonts.serifSemibold, fontSize: fontSize['2xl'] },
  site: { fontFamily: fonts.sans, fontSize: fontSize.sm },
});
