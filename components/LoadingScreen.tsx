import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { useEffectiveTheme } from '../state/uiSlice';
import { colors } from '../theme/colors';
import { SvgLogo } from './ui/SvgLogo';

const LOGO_SIZE = 80;

export const LoadingScreen: React.FC = () => {
  const theme = useEffectiveTheme();
  const themeColors = colors[theme];
  const scale = useSharedValue(1);

  useEffect(() => {
    scale.value = withRepeat(
      withSequence(
        withTiming(1.06, { duration: 1400, easing: Easing.inOut(Easing.ease) }),
        withTiming(1.0, { duration: 1400, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      false,
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const logoStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background }]}>
      <Animated.View style={logoStyle}>
        <SvgLogo color={themeColors.text} width={LOGO_SIZE} height={LOGO_SIZE} />
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
