// Animated circular progress. Sweeps from a previous value to the current one
// (goal-gradient: never restart from a cold zero). Net-new component on the
// already-present react-native-svg; no new dependency.
import React, { useEffect } from 'react';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import Animated, { useSharedValue, useAnimatedProps, withTiming } from 'react-native-reanimated';
import { motion } from '../../theme/tokens';
import { useMotion } from '../../hooks/useMotion';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface ProgressArcProps {
  /** 0..1 starting fill (the previous milestone, not zero). */
  from: number;
  /** 0..1 target fill. */
  to: number;
  size?: number;
  strokeWidth?: number;
  /** Pass theme token values from the caller; no hardcoded colors here.
   *  Used as the solid stroke when `gradientColors` is not provided. */
  color: string;
  trackColor: string;
  /** Optional two-stop [start, end] sweep (QC3-E `progressGradient`, the
   *  sanctioned goal-ring exception). When set, the arc stroke is a
   *  `LinearGradient` instead of the solid `color`; existing callers that omit
   *  it keep the solid stroke untouched. */
  gradientColors?: readonly [string, string];
  /** Stable SVG id for the gradient def (must be unique among mounted arcs). */
  gradientId?: string;
}

export function ProgressArc({
  from,
  to,
  size = 96,
  strokeWidth = 6,
  color,
  trackColor,
  gradientColors,
  gradientId = 'progressArcGradient',
}: ProgressArcProps) {
  const { reduced } = useMotion();
  const progress = useSharedValue(from);

  useEffect(() => {
    progress.value = withTiming(to, { duration: reduced ? 0 : motion.moment });
  }, [to, reduced, progress]);

  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - progress.value),
  }));

  const stroke = gradientColors ? `url(#${gradientId})` : color;

  return (
    <Svg width={size} height={size} testID="progress-arc">
      {gradientColors && (
        <Defs>
          <LinearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={gradientColors[0]} />
            <Stop offset="1" stopColor={gradientColors[1]} />
          </LinearGradient>
        </Defs>
      )}
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke={trackColor}
        strokeWidth={strokeWidth}
        fill="none"
      />
      <AnimatedCircle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke={stroke}
        strokeWidth={strokeWidth}
        fill="none"
        strokeDasharray={`${circumference} ${circumference}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        animatedProps={animatedProps}
      />
    </Svg>
  );
}
