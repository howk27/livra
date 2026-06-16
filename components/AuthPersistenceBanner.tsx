import React from 'react';
import { View, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { ShieldCheck, X } from 'phosphor-react-native';
import { AppText } from './Typography';
import { spacing, borderRadius, fontSize, fontWeight } from '../theme/tokens';
import { themedColors } from '../theme/tokens';
import { useEffectiveTheme } from '../state/uiSlice';

type Props = {
  visible: boolean;
  onDismiss: () => void;
};

/**
 * Shown when secure session persistence failed at least once (flag in AsyncStorage).
 * Intentionally calm, one dismiss per occurrence; does not log or display secrets.
 */
export function AuthPersistenceBanner({ visible, onDismiss }: Props) {
  const theme = useEffectiveTheme();
  const themeColors = themedColors(theme);

  if (!visible) return null;

  return (
    <View
      style={[
        styles.wrap,
        {
          backgroundColor: themeColors.surface,
          borderColor: themeColors.borderMid,
        },
      ]}
      accessibilityRole="alert"
    >
      <ShieldCheck size={20} color={themeColors.inkMid} style={styles.icon} weight="regular" />
      <View style={styles.textCol}>
        <AppText variant="caption" style={[styles.title, { color: themeColors.inkDark }]}>
          Sign-in could not be saved securely
        </AppText>
        <AppText variant="caption" style={[styles.body, { color: themeColors.inkMid }]}>
          This device may not have stored your session. You might need to sign in again after closing the app.
          If this keeps happening, check storage permissions or free space.
        </AppText>
      </View>
      <TouchableOpacity
        onPress={onDismiss}
        hitSlop={12}
        accessibilityLabel="Dismiss sign-in storage notice"
        style={styles.dismiss}
      >
        <X size={22} color={themeColors.inkMid} weight="bold" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginHorizontal: spacing.md,
    marginTop: Platform.OS === 'ios' ? spacing.sm : spacing.xs,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    gap: spacing.sm,
  },
  icon: { marginTop: 2 },
  textCol: { flex: 1, gap: spacing.xs },
  title: { fontWeight: fontWeight.semibold, fontSize: fontSize.sm },
  body: { fontSize: fontSize.xs, lineHeight: 18 },
  dismiss: { padding: spacing.xs },
});
