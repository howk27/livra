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
// - THE CARD IS CONTENT-DRIVEN, NOT A FIXED CROP (founder ruling 2026-09-13).
//   It used to be pinned to 340x425pt (4:5) and everything was cut to fit: the
//   prose at two lines, the goal title at one, the marks at three, and only the
//   first goal. Device QA found the result both TRUNCATED and CLUMPED - the
//   quiet-week prose was cut mid-sentence at "...The thread..." while ~190px of
//   dead linen sat between the goal block and the footer, because a fixed
//   height plus space-between dumps every bit of slack into one hole. The ratio
//   is gone. Width is fixed so the exported image has a predictable size;
//   HEIGHT FOLLOWS THE CONTENT. Nothing here may reintroduce a height or a
//   numberOfLines cap - those are the two shapes the clumping came in.
// - Up to TWO goals (founder ruling 2026-09-13). This is the only remaining
//   content cap, and it is about what a reader will take in, not about what
//   fits: the card can grow as tall as it needs to.
// - NO counts line. The letter has none, and with a goal block carrying the
//   substance a "5 days showed up" line would be a third progress vocabulary on
//   one surface (design-decisions Principles: one progress voice per surface).
//   The day strip already shows those same days, visually.
// - A zero is never rendered: an unstarted mark reads "not yet" (the letter's
//   own wording), never "0 of 3".
// - allowFontScaling is OFF everywhere, via CardText. This is an image, not a
//   screen: whoever reads the shared PNG is not the person whose Dynamic Type
//   setting produced it, so the card must render identically from every phone.
import React, { forwardRef } from 'react';
import { StyleSheet, Text, View, type TextProps } from 'react-native';
import type { ReviewGoalCard } from '../lib/weeklyReview/derive';
import { themedColors, spacing, radius, fonts, fontSize, shadow } from '../theme/tokens';
import { applyOpacity } from '../src/components/icons/color';

const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/** How many goal blocks the card carries. Readability, not layout. */
export const GOAL_BLOCK_CAP = 2;

export const SHARE_CARD_WIDTH = 340;

/**
 * Every line on the card goes through here. Pinning allowFontScaling in one
 * place rather than at each call site means a newly added line cannot quietly
 * start scaling with the device.
 */
function CardText({ style, children, ...rest }: TextProps) {
  return (
    <Text {...rest} allowFontScaling={false} style={style}>
      {children}
    </Text>
  );
}

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
    const shown = goals.slice(0, GOAL_BLOCK_CAP);
    return (
      <View ref={ref} collapsable={false} style={[styles.card, { backgroundColor: c.linen }]}>
        <View style={styles.body}>
          <CardText style={[styles.kicker, { color: c.inkMuted }]}>{weekLabel}</CardText>
          <CardText style={[styles.headline, { color: c.inkDark }]}>{headline}</CardText>
          <CardText style={[styles.prose, { color: c.inkMid }]}>{prose}</CardText>

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
                <CardText style={[styles.dayLabel, { color: c.inkMuted }]}>
                  {DAY_LETTERS[i]}
                </CardText>
              </View>
            ))}
          </View>

          {shown.map((goal) => (
            // A raised card is lighter than its page in both themes; this card is
            // always light, so it always earns the warm shadow (cardRaised rule).
            <View
              key={goal.goalId}
              style={[styles.goalCard, { backgroundColor: c.cardRaised }, shadow.card]}
            >
              <CardText style={[styles.goalTitle, { color: c.inkDark }]}>{goal.title}</CardText>
              <CardText style={[styles.goalMeta, { color: c.inkMuted }]}>
                {goal.weeksIn === 0 ? 'week one' : `week ${goal.weeksIn}`}
              </CardText>
              {goal.marks.map((m) => (
                <View key={m.markId} style={styles.markRow}>
                  <CardText style={[styles.markName, { color: c.inkMid }]}>{m.name}</CardText>
                  {/* emberInk, not ember: small text on light chrome is the exact
                      duty plain ember is barred from (Tokens 2026-07-26). */}
                  <CardText style={[styles.markCount, { color: m.met ? c.emberInk : c.inkMuted }]}>
                    {m.done === 0 ? 'not yet' : `${m.done} of ${m.target}`}
                    {m.met ? '  ✓' : ''}
                  </CardText>
                </View>
              ))}
            </View>
          ))}
        </View>

        <View style={[styles.footer, { borderTopColor: applyOpacity(c.inkMuted, 0.25) }]}>
          <CardText style={[styles.wordmark, { color: c.forest }]}>Livra</CardText>
          <CardText style={[styles.site, { color: c.inkMuted }]}>livralife.com</CardText>
        </View>
      </View>
    );
  },
);

const styles = StyleSheet.create({
  card: {
    width: SHARE_CARD_WIDTH,
    // NO height, and NO justifyContent: the card is as tall as what it has to
    // say, so there is no leftover space to distribute (ruling 2026-09-13).
    borderRadius: radius.lg,
    padding: spacing.lg,
    overflow: 'hidden',
  },
  body: {},
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
    marginBottom: spacing.md,
  },
  dayStrip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xs,
    marginBottom: spacing.md,
  },
  dayCell: { alignItems: 'center', gap: 6 },
  dayDot: { width: 18, height: 18, borderRadius: radius.full },
  dayLabel: { fontFamily: fonts.sansMedium, fontSize: fontSize.xs },
  goalCard: {
    borderRadius: radius.lg,
    padding: spacing.md,
    // The mark rows carry their own top margin, so the block needs less below
    // than beside.
    paddingBottom: spacing.sm,
    // A second block clears the first, and the last one clears the footer rule.
    marginBottom: spacing.md,
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
    // 8, not the 4 the fixed-height card used: at 4 a mark name that wraps to
    // two lines runs straight into the next row and you cannot see where one
    // mark ends. The old value was buying vertical space this card no longer
    // has to ration.
    marginTop: spacing.sm,
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
