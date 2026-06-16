import React from 'react';
import { StyleSheet, ViewStyle, View } from 'react-native';
import { useEffectiveTheme } from '../state/uiSlice';
import { themedColors } from '../theme/tokens';

interface GradientBackgroundProps {
  children: React.ReactNode;
  style?: ViewStyle;
}

export const GradientBackground: React.FC<GradientBackgroundProps> = ({ children, style }) => {
  const theme = useEffectiveTheme();
  const c = themedColors(theme);

  // Use bg.default from spec - solid color background
  return (
    <View style={[styles.gradient, { backgroundColor: c.linen, overflow: 'visible' }, style]} pointerEvents="box-none">
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  gradient: {
    flex: 1,
  },
});
