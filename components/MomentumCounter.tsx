/**
 * MomentumCounter — Livra 2.0 Layer 5.
 * Odometer roll-up animation from 0 to actual value on screen entry.
 */
import React, { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedProps,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { AppText } from './Typography';
import { fontSize, fontWeight } from '../theme/tokens';

// Reanimated doesn't animate Text natively; we use a derived display value
// via a JS-driven interpolation polled from a shared value.
// For React Native, the canonical approach is useDerivedValue + useAnimatedProps
// on an Animated.Text with animatedProps={{ text }} — but Animated.Text from
// Reanimated requires @shopify/react-native-skia or the TextInput trick.
// We use the simpler approach: Animated.createAnimatedComponent(TextInput)
// with editable=false, which is universally compatible.

import { TextInput } from 'react-native';
import { useDerivedValue } from 'react-native-reanimated';

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

interface MomentumCounterProps {
  value: number;
  color: string;
  /** Duration in ms (default 1500) */
  duration?: number;
}

export const MomentumCounter: React.FC<MomentumCounterProps> = ({
  value,
  color,
  duration = 1500,
}) => {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = 0;
    progress.value = withTiming(value, {
      duration,
      easing: Easing.out(Easing.cubic),
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, duration]);

  const animatedText = useDerivedValue(() => String(Math.round(progress.value)));

  const animatedProps = useAnimatedProps(() => ({
    text: animatedText.value,
    defaultValue: animatedText.value,
  }));

  return (
    <AnimatedTextInput
      animatedProps={animatedProps}
      editable={false}
      underlineColorAndroid="transparent"
      style={[styles.number, { color }]}
    />
  );
};

const styles = StyleSheet.create({
  number: {
    fontSize: 64,
    fontWeight: fontWeight.bold,
    letterSpacing: -2,
    lineHeight: 70,
    textAlign: 'center',
  },
});
