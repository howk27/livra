import React from 'react';
import { TouchableOpacity, StyleSheet, ViewStyle } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { shadow, themedColors } from '../../theme/tokens';
import { useEffectiveTheme } from '../../state/uiSlice';

interface FABProps {
  onPress: () => void;
  icon?: keyof typeof Feather.glyphMap;
  size?: number;
  style?: ViewStyle;
}

export function FAB({ onPress, icon = 'plus', size = 56, style }: FABProps) {
  const theme = useEffectiveTheme();
  const c = themedColors(theme);
  return (
    <TouchableOpacity
      style={[styles.fab, { backgroundColor: c.forest, width: size, height: size, borderRadius: size / 2 }, style]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <Feather name={icon} size={22} color={c.inkInverse} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  fab: {
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.fab,
  },
});
