import React, { useCallback, useEffect } from 'react';
import { Platform, TouchableOpacity } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';
import { Check, Plus } from 'phosphor-react-native';
import * as Haptics from 'expo-haptics';
import { motion, springs, themedColors } from '../../theme/tokens';
import { useEffectiveTheme } from '../../state/uiSlice';
import { useMotion } from '../../hooks/useMotion';
import { applyOpacity } from '../../src/components/icons/color';

interface CheckinButtonProps {
  checked: boolean;
  onCheckin: () => void;
  disabled?: boolean;
  /** Goal-category accent for the completion pulse. Falls back to forest. */
  accent?: string;
  testID?: string;
}

export function CheckinButton({ checked, onCheckin, disabled, accent, testID }: CheckinButtonProps) {
  const theme = useEffectiveTheme();
  const c = themedColors(theme);
  const { reduced } = useMotion();
  const rotation = useSharedValue(0);
  const scale = useSharedValue(1);
  const iconOpacity = useSharedValue(1);
  const pulseScale = useSharedValue(1);
  const pulseOpacity = useSharedValue(0);
  const pulseColor = accent ?? c.forest;

  const triggerHaptic = useCallback(() => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, []);

  // The press animation fades the + out and spins the circle before onCheckin
  // flips `checked`. Those shared values survive an undo/reset (checked back to
  // false), which left the + invisible — restore them whenever we show unchecked.
  useEffect(() => {
    if (!checked) {
      iconOpacity.value = 1;
      rotation.value = 0;
      scale.value = 1;
      pulseOpacity.value = 0;
      pulseScale.value = 1;
    }
  }, [checked, iconOpacity, rotation, scale, pulseOpacity, pulseScale]);

  const handlePress = useCallback(() => {
    if (checked || disabled) return;
    runOnJS(triggerHaptic)();
    iconOpacity.value = withTiming(0, { duration: motion.quick });
    rotation.value = withTiming(360, { duration: motion.relaxed }, (finished) => {
      if (finished) runOnJS(onCheckin)();
    });
    scale.value = withSequence(
      withTiming(0.88, { duration: motion.quick }),
      withSpring(1, springs.playful),
    );
    if (!reduced) {
      pulseOpacity.value = 0.35;
      pulseScale.value = 1;
      pulseScale.value = withTiming(1.9, { duration: motion.gentle });
      pulseOpacity.value = withTiming(0, { duration: motion.gentle });
    }
  }, [checked, disabled, onCheckin, rotation, scale, iconOpacity, triggerHaptic, reduced, pulseOpacity, pulseScale]);

  const containerStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }, { scale: scale.value }],
  }));

  const iconStyle = useAnimatedStyle(() => ({
    opacity: iconOpacity.value,
  }));

  const pulseStyle = useAnimatedStyle(() => ({
    opacity: pulseOpacity.value,
    transform: [{ scale: pulseScale.value }],
  }));

  if (checked) {
    return (
      <Animated.View
        style={[
          { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: c.accent, alignItems: 'center', justifyContent: 'center' },
          containerStyle,
        ]}
      >
        <Check size={12} color={c.accent} weight="bold" />
      </Animated.View>
    );
  }

  return (
    <TouchableOpacity
      testID={testID}
      onPress={handlePress}
      disabled={disabled || checked}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      <Animated.View
        testID="checkin-pulse-ring"
        pointerEvents="none"
        style={[
          {
            position: 'absolute',
            width: 22,
            height: 22,
            borderRadius: 11,
            backgroundColor: applyOpacity(pulseColor, 0.5),
          },
          pulseStyle,
        ]}
      />
      <Animated.View
        style={[
          { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: c.borderMid, alignItems: 'center', justifyContent: 'center' },
          containerStyle,
        ]}
      >
        <Animated.View style={iconStyle}>
          <Plus size={11} color={c.inkMuted} weight="bold" />
        </Animated.View>
      </Animated.View>
    </TouchableOpacity>
  );
}
