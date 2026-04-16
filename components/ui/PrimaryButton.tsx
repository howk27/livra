import React from 'react';
import {
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  type ViewStyle,
  type StyleProp,
} from 'react-native';
import { spacing, borderRadius, shadow as shadowTokens } from '../../theme/tokens';

export type PrimaryButtonShadow = 'none' | 'sm' | 'md' | 'lg';

export type PrimaryButtonSize = 'full' | 'compact';

export type PrimaryButtonProps = {
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  children: React.ReactNode;
  /** Filled CTA background (typically `themeColors.accent.primary`) */
  backgroundColor: string;
  /** Spinner color when `loading` (typically `themeColors.text`) */
  indicatorColor: string;
  style?: StyleProp<ViewStyle>;
  activeOpacity?: number;
  shadowVariant?: PrimaryButtonShadow;
  /** `full` matches profile / paywall main CTA; `compact` for inline retries */
  size?: PrimaryButtonSize;
  accessibilityLabel?: string;
};

const shadowFor = (v: PrimaryButtonShadow) => {
  if (v === 'none') return undefined;
  if (v === 'sm') return shadowTokens.sm;
  if (v === 'lg') return shadowTokens.lg;
  return shadowTokens.md;
};

export function PrimaryButton({
  onPress,
  disabled = false,
  loading = false,
  children,
  backgroundColor,
  indicatorColor,
  style,
  activeOpacity = 0.88,
  shadowVariant = 'md',
  size = 'full',
  accessibilityLabel,
}: PrimaryButtonProps) {
  const busy = !!loading;
  const dimmed = disabled && !busy;
  const shadowStyle = shadowFor(shadowVariant);
  const sizeStyles = size === 'full' ? styles.sizeFull : styles.sizeCompact;

  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: disabled || busy, busy }}
      onPress={onPress}
      disabled={disabled || busy}
      activeOpacity={activeOpacity}
      style={[
        styles.base,
        sizeStyles,
        { backgroundColor },
        dimmed && styles.dimmed,
        shadowStyle,
        style,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={indicatorColor} />
      ) : (
        children
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  sizeFull: {
    minHeight: 52,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.lg,
  },
  sizeCompact: {
    minHeight: 44,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
  },
  dimmed: {
    opacity: 0.6,
  },
});
