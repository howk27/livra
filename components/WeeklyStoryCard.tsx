// components/WeeklyStoryCard.tsx
// The Weekly Review as a 9:16 story image (spec 2026-09-15 §5). Rendered
// inside StoryShareSheet and captured by generateShareCard; never a screen.
//
// FIXED FRAME, on purpose. The 2026-09-13 ruling made the letter-crop card
// height-follows-content because prose cannot fit a frame. This card has no
// prose: every element is fixed height or capped (name 2 lines by the
// archetype table, meta 1 line, goals 2), so a frame cannot truncate anything
// and the frame is what makes it read as an object rather than a screenshot.
//
// One left edge (24pt), one right edge (24pt). Numeral row centred on the
// frame (320pt). Bottom group anchored to the bottom edge. Measured on the
// design pass, not eyeballed (tests pin the frame; the grid is verified on a
// web harness against the locked reference).
//
// Colour is the person's choice (palette), never the archetype's. Fixed
// values, always the same image from every phone; allowFontScaling is off on
// every line via CardText.
import React, { forwardRef } from 'react';
import { StyleSheet, Text, View, type TextProps } from 'react-native';
import type { Archetype } from '../lib/weeklyReview/archetype';
import { STORY_GROUND, STORY_LINEN, type StoryPalette } from '../lib/sharing/storyPalettes';
import { fonts } from '../theme/tokens';
import { applyOpacity } from '../src/components/icons/color';

export const STORY_CARD_WIDTH = 360;
export const STORY_CARD_HEIGHT = 640;
/** Goal titles on the meta line. Readability, not layout. */
export const STORY_GOAL_CAP = 2;

const EDGE = 24;
const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

// Numeral geometry: 123pt DM Sans at line-height 0.8 is a 98pt box; centring
// that box on 320 puts its top at 271.
const NUMERAL_SIZE = 123;
const NUMERAL_LINE = 98;
const NUMERAL_TOP = STORY_CARD_HEIGHT / 2 - NUMERAL_LINE / 2;

function CardText({ style, children, ...rest }: TextProps) {
  return (
    <Text {...rest} allowFontScaling={false} style={style}>
      {children}
    </Text>
  );
}

export type WeeklyStoryCardProps = {
  weekLabel: string;
  archetype: Archetype;
  daysActive: boolean[];
  daysActiveCount: number;
  marksLogged: number;
  goalTitles: string[];
  palette: StoryPalette;
};

export function storyMetaLine(marksLogged: number, goalTitles: string[]): string {
  const marks = `${marksLogged} ${marksLogged === 1 ? 'mark' : 'marks'}`;
  return [marks, ...goalTitles.slice(0, STORY_GOAL_CAP)].join(' · ');
}

export const WeeklyStoryCard = forwardRef<View, WeeklyStoryCardProps>(function WeeklyStoryCard(
  { weekLabel, archetype, daysActive, daysActiveCount, marksLogged, goalTitles, palette },
  ref,
) {
  const tint = palette.tint;
  return (
    <View ref={ref} collapsable={false} testID="story-card" style={styles.card}>
      {/* Glow: three stacked discs approximate a radial falloff with no
          image asset (a PNG would have needed tooling the repo lacks). */}
      <View pointerEvents="none" style={[styles.glow, styles.glowOuter, { backgroundColor: applyOpacity(tint, 0.08) }]} />
      <View pointerEvents="none" style={[styles.glow, styles.glowMid, { backgroundColor: applyOpacity(tint, 0.08) }]} />
      <View pointerEvents="none" style={[styles.glow, styles.glowInner, { backgroundColor: applyOpacity(tint, 0.1) }]} />

      <View style={styles.header}>
        <CardText style={styles.wordmark}>Livra</CardText>
        <CardText style={[styles.kicker, { color: applyOpacity(STORY_LINEN, 0.5) }]}>{weekLabel}</CardText>
      </View>

      <View style={styles.archetype}>
        <CardText style={[styles.kicker, { color: tint }]}>Your week was</CardText>
        <CardText testID="story-name" numberOfLines={2} style={[styles.name, { color: tint }]}>
          {archetype.name}
        </CardText>
        <CardText style={styles.line}>{archetype.line}</CardText>
      </View>

      <View style={styles.numeralRow}>
        <CardText testID="story-numeral" style={styles.numeral}>
          {String(daysActiveCount)}
        </CardText>
        <CardText testID="story-fraction" style={styles.fraction}>
          / 7 days
        </CardText>
      </View>

      <View style={styles.bottom}>
        <View style={styles.dots}>
          {daysActive.map((active, i) => (
            <View key={i} style={styles.dayCell}>
              <View
                testID="story-day-dot"
                style={[
                  styles.dot,
                  { backgroundColor: active ? tint : applyOpacity(STORY_LINEN, 0.1) },
                ]}
              />
              <CardText style={styles.dayLetter}>{DAY_LETTERS[i]}</CardText>
            </View>
          ))}
        </View>
        <View style={styles.hairline} />
        <CardText testID="story-meta" numberOfLines={1} ellipsizeMode="tail" style={styles.meta}>
          {storyMetaLine(marksLogged, goalTitles)}
        </CardText>
        <View style={styles.footer}>
          <CardText style={styles.footText}>what was your week?</CardText>
          <CardText style={styles.footText}>livralife.com</CardText>
        </View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    width: STORY_CARD_WIDTH,
    height: STORY_CARD_HEIGHT,
    backgroundColor: STORY_GROUND,
    overflow: 'hidden',
    paddingHorizontal: EDGE,
    paddingTop: EDGE,
  },
  glow: { position: 'absolute', alignSelf: 'center' },
  glowOuter: { width: 560, height: 560, borderRadius: 280, top: STORY_CARD_HEIGHT / 2 - 280 },
  glowMid: { width: 380, height: 380, borderRadius: 190, top: STORY_CARD_HEIGHT / 2 - 190 },
  glowInner: { width: 220, height: 220, borderRadius: 110, top: STORY_CARD_HEIGHT / 2 - 110 },

  header: {
    height: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  wordmark: { fontFamily: fonts.serif, fontSize: 23, lineHeight: 24, color: STORY_LINEN, letterSpacing: -0.2 },
  kicker: {
    fontFamily: fonts.sansSemibold,
    fontSize: 11,
    lineHeight: 12,
    letterSpacing: 1.8,
    textTransform: 'uppercase',
  },

  archetype: { marginTop: 16 },
  name: { fontFamily: fonts.serif, fontSize: 59, lineHeight: 60, letterSpacing: -0.9, marginTop: 16 },
  line: {
    fontFamily: fonts.serifItalic,
    fontSize: 17,
    lineHeight: 23,
    color: applyOpacity(STORY_LINEN, 0.62),
    marginTop: 13,
  },

  // Absolute so the archetype group above and the bottom group below can be
  // anchored independently; the row's box is centred on the frame.
  numeralRow: {
    position: 'absolute',
    left: EDGE,
    right: EDGE,
    top: NUMERAL_TOP,
    height: NUMERAL_LINE,
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  numeral: {
    fontFamily: fonts.sansBold,
    fontSize: NUMERAL_SIZE,
    lineHeight: NUMERAL_LINE,
    letterSpacing: -4.9,
    color: STORY_LINEN,
    includeFontPadding: false,
  },
  // 8pt off the numeral's INK edge: DM Sans "5" carries ~4pt of right
  // side-bearing at this size, so the box gap is 4.
  fraction: {
    fontFamily: fonts.serifSemibold,
    fontSize: 27,
    lineHeight: 27,
    color: applyOpacity(STORY_LINEN, 0.55),
    marginLeft: 4,
    paddingBottom: 16,
  },

  bottom: { position: 'absolute', left: EDGE, right: EDGE, bottom: EDGE },
  dots: { flexDirection: 'row', justifyContent: 'space-between' },
  dayCell: { width: 12, alignItems: 'center' },
  dot: { width: 12, height: 12, borderRadius: 6 },
  dayLetter: {
    fontFamily: fonts.sansMedium,
    fontSize: 10,
    lineHeight: 10,
    marginTop: 9,
    color: applyOpacity(STORY_LINEN, 0.5),
  },
  hairline: { height: StyleSheet.hairlineWidth, backgroundColor: applyOpacity(STORY_LINEN, 0.12), marginTop: 29 },
  meta: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 18, color: applyOpacity(STORY_LINEN, 0.55), marginTop: 21 },
  footer: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 28 },
  footText: { fontFamily: fonts.sans, fontSize: 11, lineHeight: 12, color: applyOpacity(STORY_LINEN, 0.5) },
});
