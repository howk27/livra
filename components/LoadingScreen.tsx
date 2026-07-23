import React, { useEffect } from 'react';
import { View, StyleSheet, Image } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { useEffectiveTheme } from '../state/uiSlice';
import { themedColors } from '../theme/tokens';

// Match the native splash exactly so the splash -> JS-loader handoff has no
// visible logo swap. The native splash (app.json expo-splash-screen) paints
// these same marks on the same grounds — light Livra-Splash-Mark on #F0EDE8
// (colorsLight.linen), dark Livra-Splash-Mark-Dark on #15211D (colorsDark.linen)
// — at expo's default 200pt width. `c.linen` resolves to those exact hexes per
// theme, so the loader is the splash held a moment longer, not a second screen.
const SPLASH_MARK_LIGHT = require('../assets/Livra-Splash-Mark.png');
const SPLASH_MARK_DARK = require('../assets/Livra-Splash-Mark-Dark.png');
const MARK_SIZE = 200;

export const LoadingScreen: React.FC = () => {
  const theme = useEffectiveTheme();
  const c = themedColors(theme);
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

  const markStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <View style={[styles.container, { backgroundColor: c.linen }]}>
      <Animated.View style={markStyle}>
        <Image
          source={theme === 'dark' ? SPLASH_MARK_DARK : SPLASH_MARK_LIGHT}
          style={styles.mark}
          resizeMode="contain"
          fadeDuration={0}
        />
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
  mark: {
    width: MARK_SIZE,
    height: MARK_SIZE,
  },
});
