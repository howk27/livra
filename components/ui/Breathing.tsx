// Slow scale-only breathing loop (1.0 -> 1.02, ~3s). The ONLY looping motion
// allowed in the app, and only inside empty states (spec guardrail). Scale
// only, no opacity/rotation, so it never reads as a loading spinner.
// Static at rest under Reduce Motion.
import React, { useEffect } from 'react';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useMotion } from '../../hooks/useMotion';

const HALF_CYCLE_MS = 1500;

export function Breathing({ children }: { children: React.ReactNode }) {
  const { reduced } = useMotion();
  const scale = useSharedValue(1);

  useEffect(() => {
    if (reduced) {
      scale.value = 1;
      return;
    }
    scale.value = withRepeat(
      withSequence(
        withTiming(1.02, { duration: HALF_CYCLE_MS, easing: Easing.inOut(Easing.sin) }),
        withTiming(1, { duration: HALF_CYCLE_MS, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
    );
    return () => cancelAnimation(scale);
  }, [reduced, scale]);

  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return <Animated.View style={style}>{children}</Animated.View>;
}
