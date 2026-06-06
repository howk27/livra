import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ViewStyle } from 'react-native';
import { fonts, radius, spacing, themedColors } from '../../theme/tokens';
import { useEffectiveTheme } from '../../state/uiSlice';

type Variant = 'primary' | 'ghost' | 'danger';

interface PillButtonProps {
  variant?: Variant;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  fullWidth?: boolean;
  height?: number;
  style?: ViewStyle;
}

export function PillButton({
  variant = 'primary',
  label,
  onPress,
  disabled,
  fullWidth,
  height = 48,
  style,
}: PillButtonProps) {
  const theme = useEffectiveTheme();
  const colors = themedColors(theme);
  const bg = variant === 'primary' ? colors.forest : variant === 'danger' ? colors.dangerLight : 'transparent';
  const textColor = variant === 'primary' ? colors.inkInverse : variant === 'danger' ? colors.danger : colors.forest;
  const borderStyle = variant === 'ghost' ? { borderWidth: 1, borderColor: colors.forest } : {};

  return (
    <TouchableOpacity
      style={[
        styles.button,
        { backgroundColor: bg, height, width: fullWidth ? '100%' : undefined },
        borderStyle,
        disabled && styles.disabled,
        style,
      ]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.8}
    >
      <Text style={[styles.label, { color: textColor }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: radius.full,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontFamily: fonts.sansMedium,
    fontSize: 15,
  },
  disabled: { opacity: 0.5 },
});
