// QC Fail #2 (2026-07-18): the centered goal glyph must fill bottom→top in step
// with the ring arc. The previous mechanism was an RN `Animated.View` with
// `overflow:'hidden'` clipping a second copy of the Phosphor SVG glyph — RN's
// view-layer `overflow:'hidden'` does NOT reliably clip `react-native-svg`
// children on iOS, so the rising amber copy never appeared (failed device QA
// twice). The fix moves the clip INSIDE react-native-svg, where clipping is a
// first-class native primitive: a `<ClipPath>` holding an animated `<Rect>`
// whose height tracks the progress fraction bottom-to-top clips a `<G>` that
// wraps the amber glyph. The native SVG engine (CoreGraphics) performs the clip
// on the glyph's own draw pass — the exact operation RN's UIView overflow can't
// guarantee. This is the design-memory "E-alt" fallback.
import React, { useEffect, createElement } from 'react';
import type { ComponentType } from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Defs, ClipPath, Rect, G } from 'react-native-svg';
import Animated, { useSharedValue, useAnimatedProps, withTiming } from 'react-native-reanimated';
import { motion } from '../../theme/tokens';
import { useMotion } from '../../hooks/useMotion';

const AnimatedRect = Animated.createAnimatedComponent(Rect);

/** The rising clip rect for a given fill fraction. Bottom-anchored: at frac 0
 *  the rect has zero height at the baseline (nothing revealed); at frac 1 it
 *  covers the full glyph. Pure + worklet-safe so the on-device animation and
 *  the unit test share one definition of "height tracks the fraction". */
export function fillRectForFraction(size: number, frac: number): { y: number; height: number } {
  'worklet';
  const f = frac < 0 ? 0 : frac > 1 ? 1 : frac;
  return { y: size * (1 - f), height: size * f };
}

interface RingIconFillProps {
  /** The goal's centered glyph (Phosphor icon component). */
  icon: ComponentType<any>;
  /** Square icon box side, px. */
  size: number;
  /** Muted base color for the full (unfilled) glyph. */
  baseColor: string;
  /** Amber fill color revealed bottom→top (pass `c.progressGradient[1]`). */
  fillColor: string;
  /** 0..1 progress fraction. The fill re-animates whenever this changes, so a
   *  later log made while the screen is open advances the fill (founder bug 5). */
  frac: number;
  /** Stable clip-path id (single ring per screen, so a constant is fine). */
  clipId?: string;
}

/** Base glyph + amber glyph clipped by a fraction-driven rect, all inside SVG. */
export function RingIconFill({
  icon,
  size,
  baseColor,
  fillColor,
  frac,
  clipId = 'ringIconFillClip',
}: RingIconFillProps) {
  const { reduced } = useMotion();
  // Animate 0 -> frac on mount, and re-run on any later frac bump (tracks logs
  // made while the screen is open). Reduced motion lands at the final fraction
  // instantly (duration 0) — the value still arrives, just without travel.
  const fill = useSharedValue(0);
  useEffect(() => {
    fill.value = withTiming(frac, { duration: reduced ? 0 : motion.moment });
  }, [frac, reduced, fill]);

  const animatedProps = useAnimatedProps(() => fillRectForFraction(size, fill.value));

  return (
    <View
      style={[styles.box, { width: size, height: size }]}
      pointerEvents="none"
      testID="ring-icon-fill"
    >
      {/* Base: the full glyph in muted ink. */}
      {createElement(icon, { size, color: baseColor, weight: 'duotone' })}
      {/* Fill: the amber glyph, clipped to the rising rect by the native SVG
          clip engine (reliable on iOS, unlike RN overflow:'hidden'). */}
      <Svg width={size} height={size} style={styles.overlay}>
        <Defs>
          <ClipPath id={clipId}>
            <AnimatedRect
              x={0}
              width={size}
              animatedProps={animatedProps}
              testID="ring-icon-fill-rect"
            />
          </ClipPath>
        </Defs>
        <G clipPath={`url(#${clipId})`}>
          {createElement(icon, { size, color: fillColor, weight: 'duotone' })}
        </G>
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { alignItems: 'center', justifyContent: 'center' },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
});
