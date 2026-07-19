import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, Pressable } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import {
  themedColors,
  spacing,
  fontSize,
  fonts,
  borderRadius,
  shadow,
} from '../../../theme/tokens';
import { useEffectiveTheme } from '../../../state/uiSlice';
import { useMotion } from '../../../hooks/useMotion';
import { PillButton } from '../PillButton';

interface ConfirmDialogProps {
  visible: boolean;
  title: string;
  message?: string;
  confirmLabel: string;
  cancelLabel: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * The Livra-drawn confirmation card behind the global `confirm()` helper. Same
 * centered-card language as GoalLimitDialog (linen-on-surface, Cormorant-scale
 * heading via sansBold, one primary CTA + a quiet dismiss) so every confirmation
 * in the app reads as Livra, not as a generic iOS system alert.
 *
 * Motion: overlay fades and the card settles up on present (useMotion → springs
 * collapse to instant under Reduce Motion, so the decision still lands).
 */
export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel,
  cancelLabel,
  destructive,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const theme = useEffectiveTheme();
  const c = themedColors(theme);
  const { timing, spring } = useMotion();

  const progress = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      progress.value = spring(1, 'settle');
    } else {
      progress.value = timing(0, 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const overlayStyle = useAnimatedStyle(() => ({ opacity: progress.value }));
  const cardStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [
      { translateY: (1 - progress.value) * 16 },
      { scale: 0.96 + progress.value * 0.04 },
    ],
  }));

  return (
    <Modal
      testID="confirm-dialog"
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onCancel}
    >
      <View style={styles.root}>
        <Animated.View style={[styles.overlay, overlayStyle]}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={onCancel}
            accessibilityLabel="Dismiss"
          />
        </Animated.View>

        <Animated.View
          style={[
            styles.card,
            { backgroundColor: c.surface, borderColor: c.borderMid },
            shadow.fab,
            cardStyle,
          ]}
          accessibilityViewIsModal
        >
          <Text style={[styles.title, { color: c.inkDark }]}>{title}</Text>
          {message ? <Text style={[styles.body, { color: c.inkMid }]}>{message}</Text> : null}

          <View style={styles.actions}>
            <PillButton
              variant={destructive ? 'danger' : 'primary'}
              label={confirmLabel}
              onPress={onConfirm}
              fullWidth
            />
            <TouchableOpacity
              style={styles.dismiss}
              onPress={onCancel}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={cancelLabel}
            >
              <Text style={[styles.dismissText, { color: c.inkMuted }]}>{cancelLabel}</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  card: {
    width: '100%',
    maxWidth: 360,
    borderRadius: borderRadius.card,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.xl,
    gap: spacing.md,
  },
  title: {
    fontFamily: fonts.sansBold,
    fontSize: fontSize['2xl'],
    textAlign: 'center',
  },
  body: {
    fontFamily: fonts.sans,
    fontSize: fontSize.base,
    lineHeight: fontSize.base * 1.5,
    textAlign: 'center',
  },
  actions: {
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  dismiss: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    minHeight: 44,
  },
  dismissText: {
    fontFamily: fonts.sansMedium,
    fontSize: fontSize.md,
  },
});
