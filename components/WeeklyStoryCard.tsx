// components/WeeklyStoryCard.tsx
// The Weekly Review as a 9:16 story image (spec 2026-09-15 §5). Since
// 2026-09-18 it is ALSO the top of the Weekly Review screen: the founder ruled
// the in-app review must look like what gets shared, so the screen shows this
// exact component and Share captures it in place.
//
// FIXED FRAME, on purpose. The 2026-09-13 ruling made the letter-crop card
// height-follows-content because prose cannot fit a frame. This card has no
// prose: every element is fixed height or capped (name 2 lines by the
// archetype table, meta 1 line, goals 2), so a frame cannot truncate anything
// and the frame is what makes it read as an object rather than a screenshot.
//
// One left edge (24pt), one right edge (24pt). Numeral row centred on the
// frame (320pt). Bottom group anchored to the bottom edge.
//
// Colour is the person's choice (palette), never the archetype's. Fixed
// values, always the same image from every phone; allowFontScaling is off on
// every line via CardText.
//
// `animate` runs the in-app reveal. The capture must be the settled frame, so
// the screen holds Share until onEntranceDone.
import React, { forwardRef, useEffect, useState } from 'react';
import { StyleSheet, Text, View, type TextProps } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import type { Archetype } from '../lib/weeklyReview/archetype';
import { STORY_GROUND, STORY_LINEN, blendTint, type StoryPalette } from '../lib/sharing/storyPalettes';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { fonts } from '../theme/tokens';
import { applyOpacity } from '../src/components/icons/color';

export const STORY_CARD_WIDTH = 360;
export const STORY_CARD_HEIGHT = 640;
/** The numeral sits this far BELOW frame centre (founder 2026-09-20). */
export const STORY_NUMERAL_DROP = 28;

const EDGE = 24;
const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

// Numeral: 123pt DM Sans at its NATURAL line box, centred on the frame by a
// full-frame flex column. It used to sit in a 98pt line box, which iOS clips
// at the top: on device the "0" rendered as its bottom half (2026-09-18; the
// web harness let the glyph overflow, so the design pass never saw it).
// DM Sans's box centre sits within ~1pt of a digit's ink centre, so centring
// the box still puts the numeral on 320.
const NUMERAL_SIZE = 123;
const SIGNATURE_SIZE = 26;

// Entrance: the name fades up, then the seven days light Monday to Sunday
// and the numeral counts each active one. About 1s end to end, over the
// 500ms baseline on purpose: every single motion is 300ms or less, and the
// length is the week being walked, one beat per day.
const HEAD_MS = 300;
const DAYS_START_MS = 260;
const DAY_STEP_MS = 90;
const SETTLE_MS = 200;
// Breathing glow (founder 2026-09-21). Ambient, not an interaction: one slow
// swell-and-dim of the glow behind the numeral, 4s there and back. Over the
// motion baseline's 500ms on purpose, because a fast loop reads as a loading
// state and this has to read as calm. Rest (0) IS the settled frame, so the
// exported image is the one it has always been.
const BREATHE_HALF_MS = 2000;
const BREATHE_SWELL = 0.06;
const BREATHE_DIM = 0.22;

function CardText({ style, children, ...rest }: TextProps) {
  return (
    <Text {...rest} allowFontScaling={false} style={style}>
      {children}
    </Text>
  );
}

/** The goal the week is deepest into; null when there are no goals. */
export type StoryGoal = { title: string; weeksIn: number };

/** What the person left switched on (spec 2026-09-20). */
export type StoryMetaPrefs = { showWeeksIn: boolean; showGoalTitle: boolean };

export type WeeklyStoryCardProps = {
  weekLabel: string;
  archetype: Archetype;
  daysActive: boolean[];
  daysActiveCount: number;
  marksLogged: number;
  deepestGoal: StoryGoal | null;
  /**
   * First name for the signature; null signs nothing and restores the older
   * two-slot footer. PRIVACY: only a genuinely saved display name may arrive
   * here — never the email-prefix fallback, which would put a handle on a
   * publicly shared image (spec 2026-09-20; pinned by the review-wiring test).
   */
  signatureName: string | null;
  showWeeksIn: boolean;
  showGoalTitle: boolean;
  palette: StoryPalette;
  /** In-app reveal. Off (the default) = the settled frame. */
  animate?: boolean;
  /** Once the card shows its final numbers (next tick when not animating). */
  onEntranceDone?: () => void;
  /**
   * The glow breathes while true. The screen turns it off before a capture
   * (the card snaps to rest at once) and it never runs under reduced motion.
   */
  breathe?: boolean;
};

export function storyMetaLine(
  marksLogged: number,
  goal: StoryGoal | null,
  { showWeeksIn, showGoalTitle }: StoryMetaPrefs,
): string {
  const marks = `${marksLogged} ${marksLogged === 1 ? 'mark' : 'marks'}`;
  if (goal === null) return marks;
  // weeksIn counts whole weeks elapsed, so week one is weeksIn 0.
  const week = showWeeksIn ? `Week ${goal.weeksIn + 1}` : null;
  const title = showGoalTitle ? goal.title : null;
  const depth = week && title ? `${week} of ${title}` : week ?? title;
  return depth ? `${marks} · ${depth}` : marks;
}

/** How many days have lit so far; 7 = settled. */
// Not running reads as settled (7) by derivation, not by a setState: the
// reduced-motion flag resolves asynchronously, so `run` can flip to false
// after the first frame and the card must jump straight to its final numbers.
function useDayStep(run: boolean, onDone?: () => void): number {
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (!run) {
      const t = setTimeout(() => onDone?.(), 0);
      return () => clearTimeout(t);
    }
    const timers: ReturnType<typeof setTimeout>[] = [setTimeout(() => setStep(0), 0)];
    for (let i = 1; i <= 7; i++) {
      timers.push(setTimeout(() => setStep(i), DAYS_START_MS + i * DAY_STEP_MS));
    }
    timers.push(setTimeout(() => onDone?.(), DAYS_START_MS + 7 * DAY_STEP_MS + SETTLE_MS));
    return () => timers.forEach(clearTimeout);
    // onDone is a callback prop: restarting on its identity would replay the
    // reveal on every parent render, so only `run` restarts it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run]);
  return run ? step : 7;
}

function FadeUp({ run, delay, children }: { run: boolean; delay: number; children: React.ReactNode }) {
  const p = useSharedValue(run ? 0 : 1);
  useEffect(() => {
    p.value = run
      ? withDelay(delay, withTiming(1, { duration: HEAD_MS, easing: Easing.out(Easing.cubic) }))
      : 1;
  }, [run, delay, p]);
  const style = useAnimatedStyle(() => ({
    opacity: p.value,
    transform: [{ translateY: (1 - p.value) * 10 }],
  }));
  return <Animated.View style={style}>{children}</Animated.View>;
}

function DayDot({ active, lit, tint, run }: { active: boolean; lit: boolean; tint: string; run: boolean }) {
  const s = useSharedValue(1);
  useEffect(() => {
    if (run && lit && active) {
      s.value = withSequence(withTiming(1.45, { duration: 120 }), withTiming(1, { duration: 180 }));
    }
  }, [run, lit, active, s]);
  const pop = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return (
    <Animated.View
      testID="story-day-dot"
      style={[styles.dot, { backgroundColor: active && lit ? tint : applyOpacity(STORY_LINEN, 0.1) }, pop]}
    />
  );
}

export const WeeklyStoryCard = forwardRef<View, WeeklyStoryCardProps>(function WeeklyStoryCard(
  {
    weekLabel,
    archetype,
    daysActive,
    daysActiveCount,
    marksLogged,
    deepestGoal,
    signatureName,
    showWeeksIn,
    showGoalTitle,
    palette,
    animate = false,
    onEntranceDone,
    breathe = false,
  },
  ref,
) {
  const tint = palette.tint;
  const tintEnd = palette.tintEnd;
  const reducedMotion = useReducedMotion();
  const run = animate && !reducedMotion;
  const step = useDayStep(run, onEntranceDone);
  const breathing = breathe && !reducedMotion;
  const breath = useSharedValue(0);
  useEffect(() => {
    if (breathing) {
      breath.value = withRepeat(
        withTiming(1, { duration: BREATHE_HALF_MS, easing: Easing.inOut(Easing.sin) }),
        -1,
        true,
      );
    } else {
      cancelAnimation(breath);
      breath.value = 0;
    }
    return () => cancelAnimation(breath);
  }, [breathing, breath]);
  // Transform and opacity only, on a wrapper: the SVG itself never re-renders.
  const glowStyle = useAnimatedStyle(() => ({
    opacity: 1 - BREATHE_DIM * breath.value,
    transform: [{ scale: 1 + BREATHE_SWELL * breath.value }],
  }));
  // Settled, the number is the derived count, never a recount of the dots.
  const shown = step >= 7 ? daysActiveCount : daysActive.slice(0, step).filter(Boolean).length;
  return (
    <View ref={ref} collapsable={false} testID="story-card" style={styles.card}>
      {/* Glow: one radial gradient centred on the numeral. It replaced three
          stacked flat discs that read as hard rings on device (2026-09-18),
          and since 2026-09-20 it carries BOTH ends of the palette's gradient:
          the lead colour at its centre, the far end at its reach. */}
      <Animated.View testID="story-glow" pointerEvents="none" style={[StyleSheet.absoluteFill, glowStyle]}>
        <Svg pointerEvents="none" style={StyleSheet.absoluteFill} width={STORY_CARD_WIDTH} height={STORY_CARD_HEIGHT}>
          <Defs>
            <RadialGradient id="storyGlow" cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor={tint} stopOpacity={0.24} />
              <Stop offset="0.45" stopColor={blendTint(tint, tintEnd, 0.5)} stopOpacity={0.11} />
              <Stop offset="1" stopColor={tintEnd} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx={STORY_CARD_WIDTH / 2} cy={STORY_CARD_HEIGHT / 2} r={290} fill="url(#storyGlow)" />
        </Svg>
      </Animated.View>

      <View style={styles.header}>
        <CardText style={styles.wordmark}>Livra</CardText>
        <CardText style={[styles.kicker, { color: applyOpacity(STORY_LINEN, 0.5) }]}>{weekLabel}</CardText>
      </View>

      <View style={styles.archetype}>
        <FadeUp run={run} delay={0}>
          <CardText style={[styles.kicker, { color: tint }]}>Your week was</CardText>
          <CardText testID="story-name" numberOfLines={2} style={[styles.name, { color: tint }]}>
            {archetype.name}
          </CardText>
        </FadeUp>
        <FadeUp run={run} delay={120}>
          <CardText style={styles.line}>{archetype.line}</CardText>
        </FadeUp>
      </View>

      <View pointerEvents="none" testID="story-numeral-frame" style={styles.numeralFrame}>
        <View testID="story-numeral-row" style={styles.numeralRow}>
          <CardText testID="story-numeral" style={styles.numeral}>
            {String(shown)}
          </CardText>
          <CardText testID="story-fraction" style={styles.fraction}>
            / 7 days
          </CardText>
        </View>
      </View>

      <View style={styles.bottom}>
        <View style={styles.dots}>
          {daysActive.map((active, i) => (
            <View key={i} style={styles.dayCell}>
              <DayDot
                active={active}
                lit={i < step}
                tint={blendTint(tint, tintEnd, i / (DAY_LETTERS.length - 1))}
                run={run}
              />
              <CardText style={styles.dayLetter}>{DAY_LETTERS[i]}</CardText>
            </View>
          ))}
        </View>
        <View style={styles.hairline} />
        <CardText testID="story-meta" numberOfLines={1} ellipsizeMode="tail" style={styles.meta}>
          {storyMetaLine(marksLogged, deepestGoal, { showWeeksIn, showGoalTitle })}
        </CardText>
        {/* Signed, the right slot is the name and livralife.com moves left:
            the signature is the invitation the prompt used to be. Unsigned,
            the footer is exactly the card as it shipped. */}
        <View style={styles.footer}>
          <CardText style={styles.footText}>
            {signatureName === null ? 'what was your week?' : 'livralife.com'}
          </CardText>
          {signatureName === null ? (
            <CardText style={styles.footText}>livralife.com</CardText>
          ) : (
            <CardText
              testID="story-signature"
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.7}
              style={[styles.signature, { color: tintEnd }]}
            >
              {signatureName}
            </CardText>
          )}
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

  // A full-frame column centres the numeral row on the frame, so the
  // archetype group above and the bottom group below stay anchored
  // independently and nothing hand-computes the row's top.
  numeralFrame: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: EDGE,
    right: EDGE,
    justifyContent: 'center',
  },
  // Baseline, so "/ 7 days" sits on the numeral's baseline whatever the
  // font's metrics, instead of a padding tuned against the clipped box.
  numeralRow: { flexDirection: 'row', alignItems: 'baseline', transform: [{ translateY: STORY_NUMERAL_DROP }] },
  numeral: {
    fontFamily: fonts.sansBold,
    fontSize: NUMERAL_SIZE,
    letterSpacing: -4.9,
    color: STORY_LINEN,
  },
  // 8pt off the numeral's INK edge: DM Sans "5" carries ~4pt of right
  // side-bearing at this size, so the box gap is 4.
  fraction: {
    fontFamily: fonts.serifSemibold,
    fontSize: 27,
    color: applyOpacity(STORY_LINEN, 0.55),
    marginLeft: 4,
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
  // flex-end: the script's baseline lines up with the 11pt line beside it
  // instead of floating off its much taller box.
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 22, minHeight: 26 },
  signature: {
    fontFamily: fonts.signature,
    fontSize: SIGNATURE_SIZE,
    lineHeight: SIGNATURE_SIZE + 4,
    maxWidth: 170,
  },
  footText: { fontFamily: fonts.sans, fontSize: 11, lineHeight: 12, color: applyOpacity(STORY_LINEN, 0.5) },
});
