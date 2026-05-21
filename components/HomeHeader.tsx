/**
 * HomeHeader — Livra 2.0 Layer 1
 * Living header statement + progress segments + 3/3 completion ceremony.
 */
import React, { useEffect, useRef, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  withSequence,
  withDelay,
  Easing,
} from 'react-native-reanimated';
import { colors } from '../theme/colors';
import { spacing, fontSize, fontWeight, borderRadius } from '../theme/tokens';
import { useEffectiveTheme } from '../state/uiSlice';
import { AppText } from './Typography';
import { applyOpacity } from '@/src/components/icons/color';
import { getDailyHeader, getWeekArc, getPostLogMessage, type HeaderState, type WeekArcState, type PostLogState } from '../lib/copy';
import { useReducedMotion } from '../hooks/useReducedMotion';

// ─── ProgressSegment ────────────────────────────────────────────────────────

interface SegmentProps {
  filled: boolean;
  fillColor: string;
  pulseToken: number;
  prefersReducedMotion: boolean;
  isDark: boolean;
  emptyColor: string;
}

const ProgressSegment: React.FC<SegmentProps> = ({
  filled, fillColor, pulseToken, prefersReducedMotion, isDark, emptyColor,
}) => {
  const fillWidth = useSharedValue(filled ? 1 : 0);
  const brightness = useSharedValue(1);

  // Liquid fill when `filled` transitions false → true
  const prevFilled = useRef(filled);
  useEffect(() => {
    if (filled && !prevFilled.current && !prefersReducedMotion) {
      fillWidth.value = 0;
      fillWidth.value = withTiming(1, { duration: 600, easing: Easing.inOut(Easing.ease) });
    } else if (!filled) {
      fillWidth.value = 0;
    } else {
      fillWidth.value = 1;
    }
    prevFilled.current = filled;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filled]);

  // Luminosity pulse on 3/3 (stagger handled by parent via pulseToken with different values)
  useEffect(() => {
    if (!pulseToken || !filled || prefersReducedMotion) return;
    brightness.value = withSequence(
      withTiming(1.35, { duration: 200, easing: Easing.out(Easing.ease) }),
      withTiming(1.0,  { duration: 200, easing: Easing.in(Easing.ease) }),
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pulseToken]);

  const fillStyle = useAnimatedStyle(() => ({
    width: `${Math.round(fillWidth.value * 100)}%` as any,
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: brightness.value > 1 ? (brightness.value - 1) * 2 : 0,
  }));

  return (
    <View style={[styles.segment, { backgroundColor: emptyColor, opacity: filled ? 1 : (isDark ? 0.35 : 0.50) }]}>
      <Animated.View style={[StyleSheet.absoluteFillObject, { backgroundColor: fillColor, borderRadius: 6 }, fillStyle]} />
      {/* Luminosity glow overlay */}
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(255,255,255,0.55)', borderRadius: 6 }, glowStyle]}
      />
    </View>
  );
};

// ─── Props ──────────────────────────────────────────────────────────────────

export interface HomeHeaderProps {
  headerState: HeaderState;
  weekArcState: WeekArcState;
  postLogState: PostLogState;
  /** Colors per mark slot (up to 3), used to tint segments */
  markColors: string[];
  totalMarks: number;
  completedToday: number;
  /** Increment to trigger the 3/3 ceremony */
  ceremonyToken: number;
}

// ─── Component ───────────────────────────────────────────────────────────────

export const HomeHeader: React.FC<HomeHeaderProps> = ({
  headerState,
  weekArcState,
  postLogState,
  markColors,
  totalMarks,
  completedToday,
  ceremonyToken,
}) => {
  const theme = useEffectiveTheme();
  const themeColors = colors[theme];
  const isDark = theme === 'dark';
  const prefersReducedMotion = useReducedMotion();

  const header   = getDailyHeader(headerState);
  const weekArc  = getWeekArc(weekArcState);

  // ── Animation values ─────────────────────────────────────────────────
  const titleOpacity    = useSharedValue(1);
  const subtitleOpacity = useSharedValue(1);
  const postLogOpacity  = useSharedValue(0);

  // Segment pulse tokens (staggered: seg0 fires first, then 100ms later seg1, then seg2)
  const seg0Pulse = useSharedValue(0);
  const seg1Pulse = useSharedValue(0);
  const seg2Pulse = useSharedValue(0);

  // Shown text — swaps to "Done." ceremony during 3/3 state
  const ceremonyActive = useSharedValue(false);
  const [ceremonyHeader, setCeremonyHeader] = React.useState<{ title: string; subtitle: string | null } | null>(null);
  const [postLogText, setPostLogText] = React.useState('');

  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const clearTimers = useCallback(() => { timers.current.forEach(clearTimeout); timers.current = []; }, []);

  // ── 3/3 ceremony ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!ceremonyToken || prefersReducedMotion) return;
    clearTimers();

    // t=300ms: silence ends, segment pulse
    timers.current.push(setTimeout(() => {
      seg0Pulse.value = withTiming(seg0Pulse.value + 1, { duration: 1 });
    }, 300));
    timers.current.push(setTimeout(() => {
      seg1Pulse.value = withTiming(seg1Pulse.value + 1, { duration: 1 });
    }, 400));
    timers.current.push(setTimeout(() => {
      seg2Pulse.value = withTiming(seg2Pulse.value + 1, { duration: 1 });
    }, 500));

    // t=500ms: title dissolves
    timers.current.push(setTimeout(() => {
      titleOpacity.value    = withTiming(0, { duration: 200 });
      subtitleOpacity.value = withTiming(0, { duration: 200 });
    }, 500));

    // t=700ms: title reforms as "Done."
    timers.current.push(setTimeout(() => {
      setCeremonyHeader({ title: 'Done.', subtitle: 'Come back tomorrow.' });
      titleOpacity.value    = withTiming(1, { duration: 200 });
      subtitleOpacity.value = withTiming(1, { duration: 200 });
    }, 700));

    // t=3200ms: post-log message fades in
    const msg = getPostLogMessage({ ...postLogState, isCompleting3of3: true });
    setPostLogText(msg);
    timers.current.push(setTimeout(() => {
      postLogOpacity.value = withTiming(1, { duration: 400 });
    }, 3200));

    // t=5200ms: post-log message fades out
    timers.current.push(setTimeout(() => {
      postLogOpacity.value = withTiming(0, { duration: 400 });
    }, 5200));

    // t=5600ms: reset ceremony header
    timers.current.push(setTimeout(() => {
      setCeremonyHeader(null);
    }, 5600));

    return clearTimers;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ceremonyToken]);

  const titleStyle = useAnimatedStyle(() => ({ opacity: titleOpacity.value }));
  const subtitleStyle = useAnimatedStyle(() => ({ opacity: subtitleOpacity.value }));
  const postLogStyle = useAnimatedStyle(() => ({ opacity: postLogOpacity.value }));

  const displayHeader = ceremonyHeader ?? header;
  const segmentColor = (i: number) => markColors[i] ?? themeColors.primary;
  const emptyBg = isDark ? applyOpacity(themeColors.border, 0.30) : applyOpacity(themeColors.border, 0.60);

  // Per-segment pulse tokens (incremented on ceremony, staggered)
  const [pulse0, setPulse0] = React.useState(0);
  const [pulse1, setPulse1] = React.useState(0);
  const [pulse2, setPulse2] = React.useState(0);

  useEffect(() => {
    if (!ceremonyToken) return;
    const t0 = setTimeout(() => setPulse0(n => n + 1), 300);
    const t1 = setTimeout(() => setPulse1(n => n + 1), 400);
    const t2 = setTimeout(() => setPulse2(n => n + 1), 500);
    return () => { clearTimeout(t0); clearTimeout(t1); clearTimeout(t2); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ceremonyToken]);

  return (
    <View style={styles.container}>
      {/* Living header title */}
      <Animated.View style={titleStyle}>
        <AppText style={[styles.title, { color: themeColors.text }]}>
          {displayHeader.title}
        </AppText>
      </Animated.View>

      {/* Subtitle */}
      {displayHeader.subtitle ? (
        <Animated.View style={subtitleStyle}>
          <AppText style={[styles.subtitle, { color: themeColors.textSecondary }]}>
            {displayHeader.subtitle}
          </AppText>
        </Animated.View>
      ) : null}

      {/* Progress segments */}
      {totalMarks > 0 && (
        <View style={styles.segmentsRow}>
          {Array.from({ length: totalMarks }).map((_, i) => (
            <ProgressSegment
              key={i}
              filled={i < completedToday}
              fillColor={segmentColor(i)}
              pulseToken={i === 0 ? pulse0 : i === 1 ? pulse1 : pulse2}
              prefersReducedMotion={prefersReducedMotion}
              isDark={isDark}
              emptyColor={emptyBg}
            />
          ))}
        </View>
      )}

      {/* Week arc strip */}
      <AppText style={[styles.weekArc, { color: themeColors.textTertiary }]}>
        {weekArc}
      </AppText>

      {/* Post-log message (3/3 ceremony only) */}
      <Animated.View style={[styles.postLogWrap, postLogStyle]} pointerEvents="none">
        <AppText style={[styles.postLogText, { color: themeColors.textSecondary }]}>
          {postLogText}
        </AppText>
      </Animated.View>
    </View>
  );
};

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.xs,
  },
  title: {
    fontSize: fontSize['3xl'] ?? 28,
    fontWeight: fontWeight.bold,
    letterSpacing: -0.6,
    lineHeight: 34,
  },
  subtitle: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    lineHeight: 18,
    marginTop: -2,
  },
  segmentsRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: spacing.sm,
    height: 8,
  },
  segment: {
    flex: 1,
    height: 8,
    borderRadius: 6,
    overflow: 'hidden',
  },
  weekArc: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
    letterSpacing: 0.1,
    marginTop: spacing.xs,
  },
  postLogWrap: {
    marginTop: spacing.sm,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.md,
    backgroundColor: 'rgba(0,0,0,0.06)',
  },
  postLogText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    fontStyle: 'italic',
    lineHeight: 18,
    textAlign: 'center',
  },
});
