import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Pressable,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import {
  themedColors,
  spacing,
  fontSize,
  fonts,
  borderRadius,
  radius,
  shadow,
} from '../../theme/tokens';
import { useEffectiveTheme } from '../../state/uiSlice';
import { useMotion } from '../../hooks/useMotion';
import { PillButton } from './PillButton';

/** The word the user must type, verbatim (case-insensitive), to arm deletion. */
const CONFIRM_WORD = 'delete';

interface DeleteAccountDialogProps {
  visible: boolean;
  /** In-flight deletion — locks the field and swaps the CTA to a busy label. */
  deleting: boolean;
  /** Dismiss ("Keep my account"), the Android back button, and the scrim tap. */
  onClose: () => void;
  /** Fired only once the confirmation word matches — runs the real deletion. */
  onConfirm: () => void;
}

/**
 * Account deletion is the single most irreversible action in Livra — a raw
 * "Delete Account" tap on a system alert is too easy to fat-finger. This is
 * Livra's OWN confirmation (mirrors GoalLimitDialog's centered card): the
 * destructive CTA stays disabled until the person types "delete", so the
 * decision is deliberate, not accidental.
 *
 * Motion: overlay fades and the card settles up on present (useMotion → springs
 * collapse to instant under Reduce Motion, so the decision still lands).
 */
export function DeleteAccountDialog({
  visible,
  deleting,
  onClose,
  onConfirm,
}: DeleteAccountDialogProps) {
  const theme = useEffectiveTheme();
  const c = themedColors(theme);
  const { timing, spring } = useMotion();

  const [confirmText, setConfirmText] = useState('');
  const armed = confirmText.trim().toLowerCase() === CONFIRM_WORD;

  const progress = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      progress.value = spring(1, 'settle');
    } else {
      progress.value = timing(0, 0);
      // Reset the field whenever the dialog closes so a re-open starts clean.
      setConfirmText('');
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

  const handleConfirm = () => {
    if (!armed || deleting) return;
    onConfirm();
  };

  return (
    <Modal
      testID="delete-account-dialog"
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={deleting ? undefined : onClose}
    >
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Scrim — tap to dismiss, locked out while the deletion is running. */}
        <Animated.View style={[styles.overlay, overlayStyle]}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={deleting ? undefined : onClose}
            disabled={deleting}
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
          <Text style={[styles.title, { color: c.inkDark }]}>Delete account</Text>
          <Text style={[styles.body, { color: c.inkMid }]}>
            This permanently deletes your account and all of your marks, goals, and
            history. It cannot be undone.
          </Text>
          <Text style={[styles.prompt, { color: c.inkMid }]}>
            Type <Text style={[styles.promptWord, { color: c.inkDark }]}>delete</Text> to
            confirm.
          </Text>

          <TextInput
            value={confirmText}
            onChangeText={setConfirmText}
            editable={!deleting}
            placeholder="delete"
            placeholderTextColor={c.inkMuted}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="off"
            returnKeyType="done"
            onSubmitEditing={handleConfirm}
            style={[
              styles.input,
              {
                backgroundColor: c.surfaceAlt,
                borderColor: armed ? c.danger : c.borderMid,
                color: c.inkDark,
              },
            ]}
            accessibilityLabel="Type delete to confirm account deletion"
          />

          <View style={styles.actions}>
            <PillButton
              variant="danger"
              label={deleting ? 'Deleting…' : 'Delete account'}
              onPress={handleConfirm}
              disabled={!armed || deleting}
              fullWidth
            />
            <TouchableOpacity
              style={styles.dismiss}
              onPress={onClose}
              disabled={deleting}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Keep my account"
            >
              <Text style={[styles.dismissText, { color: c.inkMuted }]}>Keep my account</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
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
  prompt: {
    fontFamily: fonts.sans,
    fontSize: fontSize.md,
    textAlign: 'center',
  },
  promptWord: {
    fontFamily: fonts.sansBold,
  },
  input: {
    height: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
    fontFamily: fonts.sansMedium,
    fontSize: fontSize.md,
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
