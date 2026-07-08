// Single gateway for animation configs. Wraps the app's one reduced-motion
// source (AccessibilityInfo via hooks/useReducedMotion). Under Reduce Motion,
// springs and timings collapse to instant so state still lands, just without travel.
import { withSpring, withTiming } from 'react-native-reanimated';
import { motion, springs } from '../theme/tokens';
import { useReducedMotion } from './useReducedMotion';

export function useMotion() {
  const reduced = useReducedMotion();

  const timing = (toValue: number, duration: number = motion.standard) =>
    withTiming(toValue, { duration: reduced ? 0 : duration });

  const spring = (toValue: number, preset: keyof typeof springs = 'settle') =>
    reduced ? withTiming(toValue, { duration: 0 }) : withSpring(toValue, springs[preset]);

  return { reduced, timing, spring };
}
