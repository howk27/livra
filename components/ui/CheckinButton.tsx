import React, { useCallback } from 'react';
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
import { themedColors } from '../../theme/tokens';
import { useEffectiveTheme } from '../../state/uiSlice';

interface CheckinButtonProps {
  checked: boolean;
  onCheckin: () => void;
  disabled?: boolean;
}

export function CheckinButton({ checked, onCheckin, disabled }: CheckinButtonProps) {
  const theme = useEffectiveTheme();
  const c = themedColors(theme);
  const rotation = useSharedValue(0);
  const scale = useSharedValue(1);
  const iconOpacity = useSharedValue(1);

  const triggerHaptic = useCallback(() => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, []);

  const handlePress = useCallback(() => {
    if (checked || disabled) return;
    runOnJS(triggerHaptic)();
    iconOpacity.value = withTiming(0, { duration: 100 });
    rotation.value = withTiming(360, { duration: 300 }, (finished) => {
      if (finished) runOnJS(onCheckin)();
    });
    scale.value = withSequence(
      withTiming(0.88, { duration: 120 }),
      withSpring(1, { damping: 12, stiffness: 280 }),
    );
  }, [checked, disabled, onCheckin, rotation, scale, iconOpacity, triggerHaptic]);

  const containerStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }, { scale: scale.value }],
  }));

  const iconStyle = useAnimatedStyle(() => ({
    opacity: iconOpacity.value,
  }));

  if (checked) {
    return (
      <Animated.View
        style={[
          { width: 22, height: 22, borderRadius: 11, backgroundColor: c.forest, alignItems: 'center', justifyContent: 'center' },
          containerStyle,
        ]}
      >
        <Check size={11} color={c.inkInverse} weight="duotone" />
      </Animated.View>
    );
  }

  return (
    <TouchableOpacity
      onPress={handlePress}
      disabled={disabled || checked}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
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
