// Shared motion-baseline "settle" entrance (opacity + a small rise), one per
// artifact. Reduced motion renders statically in place — useMotion is the single
// reduced-motion source. Extracted from GoalCardPreview / goal-new so the two
// mount-only spring entrances can never drift apart (QC3 cleanup).
import { useEffect } from 'react';
import { useSharedValue, useAnimatedStyle } from 'react-native-reanimated';
import { useMotion } from './useMotion';

export function useSettleEntrance(rise = 12) {
  const { reduced, spring } = useMotion();
  const entered = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    entered.value = spring(1, 'settle');
    // Mount-only entrance by design.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return useAnimatedStyle(() => ({
    opacity: entered.value,
    transform: [{ translateY: (1 - entered.value) * rise }],
  }));
}
