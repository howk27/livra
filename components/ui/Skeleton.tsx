/**
 * Skeleton — a muted block standing in for content that has not arrived.
 *
 * Deliberately static. Three screens (profile, goal detail, goal journal) had
 * already settled on this shape by hand, and none of them shimmer: a sweeping
 * highlight is the dashboard tell the "calm executor" direction rejects, and it
 * would need a prefers-reduced-motion branch to earn its keep. A skeleton here
 * describes the screen that is about to arrive, nothing more.
 *
 * Tint matches the established idiom — `applyOpacity(inkMuted, 0.12)`, which
 * reads as a soft absence on linen and on the dark surface alike.
 */
import React from 'react';
import { View, type ViewStyle, type StyleProp } from 'react-native';
import { themedColors, borderRadius } from '../../theme/tokens';
import { useEffectiveTheme } from '../../state/uiSlice';
import { applyOpacity } from '../../src/components/icons/color';

type SkeletonProps = {
  /** Block height in pt. */
  height: number;
  /** Block width — number for a fixed pt width, string for a percentage. */
  width?: number | `${number}%`;
  /** Corner radius; defaults to the md token. */
  radius?: number;
  style?: StyleProp<ViewStyle>;
};

export function Skeleton({ height, width = '100%', radius, style }: SkeletonProps) {
  const c = themedColors(useEffectiveTheme());
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        {
          height,
          width,
          borderRadius: radius ?? borderRadius.md,
          backgroundColor: applyOpacity(c.inkMuted, 0.12),
        },
        style,
      ]}
    />
  );
}
