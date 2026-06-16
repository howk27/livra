import React from 'react';
import { TouchableOpacity, StyleSheet, ViewStyle } from 'react-native';
import { Plus, IconProps } from 'phosphor-react-native';
import { shadow, themedColors } from '../../theme/tokens';
import { useEffectiveTheme } from '../../state/uiSlice';

interface FABProps {
  onPress: () => void;
  icon?: React.ComponentType<IconProps>;
  size?: number;
  style?: ViewStyle;
}

export function FAB({ onPress, icon: Icon = Plus, size = 56, style }: FABProps) {
  const theme = useEffectiveTheme();
  const c = themedColors(theme);
  return (
    <TouchableOpacity
      style={[styles.fab, { backgroundColor: c.forest, width: size, height: size, borderRadius: size / 2 }, style]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <Icon size={22} color={c.inkInverse} weight="bold" />
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
