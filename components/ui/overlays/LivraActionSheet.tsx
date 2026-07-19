import React, { useContext, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, Pressable } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
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
import type { ActionSheetAction } from './actionSheetController';

interface LivraActionSheetProps {
  visible: boolean;
  title?: string;
  message?: string;
  actions: ActionSheetAction[];
  cancelLabel: string;
  onSelect: (index: number) => void;
  onCancel: () => void;
}

/**
 * Livra-drawn bottom-sheet menu behind the global `actionSheet()` helper —
 * replaces the menu-style iOS system sheet (e.g. mark long-press). Sheet of
 * actions plus a separate Cancel affordance, on the same surface/linen language
 * as the rest of the app.
 *
 * Motion: scrim fades and the sheet rises from the bottom edge (useMotion →
 * instant under Reduce Motion).
 */
export function LivraActionSheet({
  visible,
  title,
  message,
  actions,
  cancelLabel,
  onSelect,
  onCancel,
}: LivraActionSheetProps) {
  const theme = useEffectiveTheme();
  const c = themedColors(theme);
  // Consume the insets context directly (null when no provider is above this
  // host) rather than useSafeAreaInsets(), which throws without a provider.
  const insets = useContext(SafeAreaInsetsContext);
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
  const sheetStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * 32 }],
  }));

  const bottomPad = Math.max(insets?.bottom ?? 0, spacing.md);

  return (
    <Modal
      testID="livra-action-sheet"
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

        <Animated.View style={[styles.sheetWrap, { paddingBottom: bottomPad }, sheetStyle]}>
          {/* Actions card */}
          <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.borderMid }, shadow.fab]}>
            {(title || message) ? (
              <View style={[styles.headerBlock, { borderBottomColor: c.borderLight }]}>
                {title ? <Text style={[styles.title, { color: c.inkDark }]}>{title}</Text> : null}
                {message ? <Text style={[styles.message, { color: c.inkMuted }]}>{message}</Text> : null}
              </View>
            ) : null}

            {actions.map((action, index) => (
              <TouchableOpacity
                key={`${action.label}-${index}`}
                style={[
                  styles.actionRow,
                  index < actions.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.borderLight },
                ]}
                onPress={() => onSelect(index)}
                activeOpacity={0.7}
                accessibilityRole="button"
              >
                <Text
                  style={[
                    styles.actionText,
                    { color: action.destructive ? c.danger : c.inkDark },
                  ]}
                >
                  {action.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Separate Cancel card — iOS convention, kept for the muscle memory */}
          <TouchableOpacity
            style={[styles.cancelCard, { backgroundColor: c.surface, borderColor: c.borderMid }, shadow.fab]}
            onPress={onCancel}
            activeOpacity={0.7}
            accessibilityRole="button"
          >
            <Text style={[styles.cancelText, { color: c.inkMid }]}>{cancelLabel}</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheetWrap: {
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  card: {
    borderRadius: borderRadius.card,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  headerBlock: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    gap: spacing.xs,
  },
  title: {
    fontFamily: fonts.sansBold,
    fontSize: fontSize.md,
    textAlign: 'center',
  },
  message: {
    fontFamily: fonts.sans,
    fontSize: fontSize[13],
    textAlign: 'center',
  },
  actionRow: {
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  actionText: {
    fontFamily: fonts.sansMedium,
    fontSize: fontSize.md,
  },
  cancelCard: {
    borderRadius: borderRadius.card,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: {
    fontFamily: fonts.sansBold,
    fontSize: fontSize.md,
  },
});
