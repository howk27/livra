import React, { useRef } from 'react';
import { Pressable, StyleSheet, Animated, Easing } from 'react-native';
import { colors } from '../theme/colors';
import { spacing, borderRadius, motion, shadow } from '../theme/tokens';
import { useEffectiveTheme } from '../state/uiSlice';
import { AppText } from './Typography';
import { useReducedMotion } from '../hooks/useReducedMotion';

interface BigIncrementButtonProps {
  onPress: () => void;
  disabled?: boolean;
  label?: string;
}

export const BigIncrementButton: React.FC<BigIncrementButtonProps> = ({
  onPress,
  disabled = false,
  label = '+1',
}) => {
  const theme = useEffectiveTheme();
  const themeColors = colors[theme];
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const prefersReducedMotion = useReducedMotion();

  const handlePressIn = () => {
    if (prefersReducedMotion) {
      return;
    }
    Animated.timing(scaleAnim, {
      toValue: 0.94,
      duration: motion.quick,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    if (prefersReducedMotion) {
      scaleAnim.setValue(1);
      return;
    }
    Animated.spring(scaleAnim, {
      toValue: 1,
      friction: 6,
      tension: 120,
      useNativeDriver: true,
    }).start();
  };

  return (
    <Animated.View 
      style={{ transform: [{ scale: scaleAnim }] }}
      pointerEvents="box-none"
    >
      <Pressable
        style={({ pressed }) => [
          styles.button,
          { backgroundColor: themeColors.primary },
          disabled && styles.disabled,
          pressed && { opacity: 0.8 },
          shadow.lg,
        ]}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={disabled}
        hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
      >
        <AppText variant="display" style={styles.buttonText}>
          {label}
        </AppText>
      </Pressable>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  button: {
    width: 120,
    height: 120,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  buttonText: {
    color: '#FFFFFF',
    textAlign: 'center',
  },
  disabled: {
    opacity: 0.5,
  },
});

