// The live artifact on the mark-creation screen (QC2-H, "The Card Takes
// Shape"): the REAL Focus MarkRow, assembling as the user decides. Identity
// (glyph + category accent) comes from lib/creation/creationPreview, which
// runs the exact resolution Focus runs — the row previewed here is the row
// the user will live with.
import React, { useEffect, useMemo, useRef } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { spacing, radius, themedColors, springs } from '../../theme/tokens';
import { useEffectiveTheme } from '../../state/uiSlice';
import { useMotion } from '../../hooks/useMotion';
import { MarkRow } from '../ui/MarkRow';
import { markPreviewIdentity } from '../../lib/creation/creationPreview';

interface MarkRowPreviewProps {
  /** The name as typed; empty falls back to a plain stand-in. */
  name: string;
  /** The emoji the created mark will persist (drives Focus icon resolution). */
  emoji: string;
  /** Cadence line under the name, e.g. "3 days a week". */
  cadence: string;
  testID?: string;
}

export function MarkRowPreview({ name, emoji, cadence, testID }: MarkRowPreviewProps) {
  const theme = useEffectiveTheme();
  const c = themedColors(theme);
  const { reduced, spring } = useMotion();

  const trimmed = name.trim();
  const identity = useMemo(() => markPreviewIdentity(trimmed, emoji), [trimmed, emoji]);

  // Entrance: one settle on mount (motion baseline).
  const entered = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    entered.value = spring(1, 'settle');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Identity swap: a small settle pulse when the picked icon changes the row.
  const pulse = useSharedValue(1);
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    if (reduced) return;
    pulse.value = withSequence(
      withTiming(0.985, { duration: 80 }),
      withSpring(1, springs.settle),
    );
  }, [emoji, reduced, pulse]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: entered.value,
    transform: [{ translateY: (1 - entered.value) * 12 }, { scale: pulse.value }],
  }));

  return (
    <Animated.View
      testID={testID}
      style={[
        styles.card,
        { backgroundColor: c.surface, borderColor: c.borderMid },
        animatedStyle,
      ]}
    >
      <MarkRow
        title={trimmed || 'New mark'}
        subtitle={cadence}
        category={identity.category}
        icon={identity.icon ?? undefined}
        isLast
        testID={testID ? `${testID}-row` : undefined}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    marginBottom: spacing.md,
  },
});
