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
} from '../../theme/tokens';
import { useEffectiveTheme } from '../../state/uiSlice';
import { useMotion } from '../../hooks/useMotion';
import { PillButton } from './PillButton';
import { GOAL_LIMIT_MESSAGE } from '@/lib/copy';

interface GoalLimitDialogProps {
  visible: boolean;
  /** Dismiss ("Not now") and the Android hardware back / scrim tap. */
  onClose: () => void;
  /** Primary action — routes to the paywall. */
  onSeePlus: () => void;
}

/**
 * QC-FAIL-4: the free-goal cap used to fire a raw `Alert.alert` — the iOS system
 * prompt (founder: "handled by iOS ... make this come from Livra directly"). This
 * is Livra's OWN popup: linen-on-surface card, Cormorant heading, the shared
 * GOAL_LIMIT_MESSAGE, one forest CTA to Livra+ and a quiet dismiss. It mirrors
 * the mark-detail health picker's Modal-plus-scrim pattern, but centered rather
 * than a bottom sheet since it is a decision, not a list.
 *
 * Motion: overlay fades and the card settles up on present (useMotion → springs
 * collapse to instant under Reduce Motion, so the decision still lands).
 */
export function GoalLimitDialog({ visible, onClose, onSeePlus }: GoalLimitDialogProps) {
  const theme = useEffectiveTheme();
  const c = themedColors(theme);
  const { timing, spring } = useMotion();

  // Kept mounted across the exit so the Modal can animate closed if we ever add
  // an exit; today the entrance is what matters (the cap is a hard stop).
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
      testID="goal-limit-dialog"
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        {/* Scrim — tap to dismiss, same weight as the mark-detail modal. */}
        <Animated.View style={[styles.overlay, overlayStyle]}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={onClose}
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
          <Text style={[styles.title, { color: c.inkDark }]}>Two goals at a time</Text>
          <Text style={[styles.body, { color: c.inkMid }]}>{GOAL_LIMIT_MESSAGE}</Text>

          <View style={styles.actions}>
            <PillButton label="See Livra+" onPress={onSeePlus} fullWidth />
            <TouchableOpacity
              style={styles.dismiss}
              onPress={onClose}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Not now"
            >
              <Text style={[styles.dismissText, { color: c.inkMuted }]}>Not now</Text>
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
    fontFamily: fonts.serif,
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
