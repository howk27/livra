import React from 'react';
import {
  View,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TouchableWithoutFeedback,
} from 'react-native';
import { WarningCircle } from 'phosphor-react-native';
import { themedColors } from '../theme/tokens';
import { spacing, borderRadius, fontSize, fontWeight } from '../theme/tokens';
import { applyOpacity } from '@/src/components/icons/color';
import { useEffectiveTheme } from '../state/uiSlice';
import { AppText } from './Typography';

export interface DuplicateMarkModalProps {
  visible: boolean;
  markName: string;
  onClose: () => void;
  onGoToMark?: () => void;
  showGoToButton?: boolean;
}

/** @deprecated Use DuplicateMarkModalProps */
export type DuplicateCounterModalProps = Omit<DuplicateMarkModalProps, 'markName' | 'onGoToMark'> & {
  counterName?: string;
  markName?: string;
  onGoToCounter?: () => void;
  onGoToMark?: () => void;
};

const DUPLICATE_MESSAGES = [
  "That mark is already on your board.",
  "This mark already exists. Edit the current one instead.",
  "Looks like this mark is already active.",
  "You are already tracking this. No need to add it again.",
  "This one is already part of your routine.",
];

export const DuplicateMarkModal: React.FC<DuplicateMarkModalProps> = ({
  visible,
  markName,
  onClose,
  onGoToMark,
  showGoToButton = false,
}) => {
  const theme = useEffectiveTheme();
  const c = themedColors(theme);
  const message = DUPLICATE_MESSAGES[Math.floor(Math.random() * DUPLICATE_MESSAGES.length)];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <View
              style={[
                styles.modalContainer,
                { backgroundColor: c.surface, borderColor: c.borderMid },
              ]}
            >
              {/* Icon */}
              <View style={[styles.iconContainer, { backgroundColor: applyOpacity(c.forest, 0.12) }]}>
                <WarningCircle size={48} color={c.forest} weight="duotone" />
              </View>

              {/* Title */}
              <AppText variant="headline" style={[styles.title, { color: c.inkDark }]}>
                {message}
              </AppText>

              {/* Mark Name */}
              <View style={[styles.counterNameContainer, { backgroundColor: c.surfaceAlt || c.surface }]}>
                <AppText variant="body" style={[styles.counterName, { color: c.inkMid }]}>
                  "{markName}"
                </AppText>
              </View>

              {/* Message */}
              <AppText variant="body" style={[styles.message, { color: c.inkMid }]}>
                {showGoToButton
                  ? "Open the existing mark and continue tracking there."
                  : "Try a different name, or open the existing mark to edit it."}
              </AppText>

              {/* Buttons */}
              <View style={styles.buttonContainer}>
                <TouchableOpacity
                  style={[styles.button, styles.cancelButton, { borderColor: c.borderMid }]}
                  onPress={onClose}
                >
                  <AppText variant="button" style={[styles.buttonText, { color: c.inkMid }]}>
                    Dismiss
                  </AppText>
                </TouchableOpacity>
                {showGoToButton && onGoToMark && (
                  <TouchableOpacity
                    style={[styles.button, styles.primaryButton, { backgroundColor: c.forest }]}
                    onPress={onGoToMark}
                  >
                    <AppText variant="button" style={[styles.buttonText, { color: c.inkInverse }]}>
                      Go to Mark
                    </AppText>
                  </TouchableOpacity>
                )}
                {!showGoToButton && (
                  <TouchableOpacity
                    style={[styles.button, styles.primaryButton, { backgroundColor: c.forest }]}
                    onPress={onClose}
                  >
                    <AppText variant="button" style={[styles.buttonText, { color: c.inkInverse }]}>
                      Got it
                    </AppText>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  modalContainer: {
    width: '100%',
    maxWidth: 400,
    borderRadius: borderRadius.card,
    borderWidth: 1,
    padding: spacing.xl,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 10,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  title: {
    textAlign: 'center',
    marginBottom: spacing.md,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
  },
  counterNameContainer: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    marginBottom: spacing.lg,
  },
  counterName: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium,
    fontStyle: 'italic',
  },
  message: {
    textAlign: 'center',
    marginBottom: spacing.xl,
    lineHeight: 22,
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: spacing.md,
    width: '100%',
  },
  button: {
    flex: 1,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButton: {
    borderWidth: 1,
    backgroundColor: 'transparent',
  },
  primaryButton: {
    // backgroundColor set dynamically
  },
  buttonText: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
});

/** @deprecated Use DuplicateMarkModal */
export const DuplicateCounterModal: React.FC<DuplicateCounterModalProps> = ({
  counterName,
  markName,
  onGoToCounter,
  onGoToMark,
  ...rest
}) => (
  <DuplicateMarkModal
    markName={markName ?? counterName ?? ''}
    onGoToMark={onGoToMark ?? onGoToCounter}
    {...rest}
  />
);

