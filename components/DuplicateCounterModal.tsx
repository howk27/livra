import React from 'react';
import {
  View,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TouchableWithoutFeedback,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { spacing, borderRadius, fontSize, fontWeight } from '../theme/tokens';
import { useEffectiveTheme } from '../state/uiSlice';
import { AppText } from './Typography';

interface DuplicateCounterModalProps {
  visible: boolean;
  counterName: string;
  onClose: () => void;
  onGoToCounter?: () => void;
  showGoToButton?: boolean;
}

const DUPLICATE_MESSAGES = [
  "That mark is already on your board.",
  "This mark already exists. Edit the current one instead.",
  "Looks like this mark is already active.",
  "You are already tracking this. No need to add it again.",
  "This one is already part of your routine.",
];

const getRandomMessage = (_counterName: string) => {
  return DUPLICATE_MESSAGES[Math.floor(Math.random() * DUPLICATE_MESSAGES.length)];
};

export const DuplicateCounterModal: React.FC<DuplicateCounterModalProps> = ({
  visible,
  counterName,
  onClose,
  onGoToCounter,
  showGoToButton = false,
}) => {
  const theme = useEffectiveTheme();
  const themeColors = colors[theme];
  const message = getRandomMessage(counterName);

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
                { backgroundColor: themeColors.surface, borderColor: themeColors.border },
              ]}
            >
              {/* Icon */}
              <View style={[styles.iconContainer, { backgroundColor: themeColors.primary + '20' }]}>
                <Ionicons name="alert-circle" size={48} color={themeColors.primary} />
              </View>

              {/* Title */}
              <AppText variant="headline" style={[styles.title, { color: themeColors.text }]}>
                {message}
              </AppText>

              {/* Counter Name */}
              <View style={[styles.counterNameContainer, { backgroundColor: themeColors.surfaceVariant || themeColors.surface }]}>
                <AppText variant="body" style={[styles.counterName, { color: themeColors.textSecondary }]}>
                  "{counterName}"
                </AppText>
              </View>

              {/* Message */}
              <AppText variant="body" style={[styles.message, { color: themeColors.textSecondary }]}>
                {showGoToButton
                  ? "Open the existing mark and continue tracking there."
                  : "Try a different name, or open the existing mark to edit it."}
              </AppText>

              {/* Buttons */}
              <View style={styles.buttonContainer}>
                <TouchableOpacity
                  style={[styles.button, styles.cancelButton, { borderColor: themeColors.border }]}
                  onPress={onClose}
                >
                  <AppText variant="button" style={[styles.buttonText, { color: themeColors.textSecondary }]}>
                    Dismiss
                  </AppText>
                </TouchableOpacity>
                {showGoToButton && onGoToCounter && (
                  <TouchableOpacity
                    style={[styles.button, styles.primaryButton, { backgroundColor: themeColors.accent.primary }]}
                    onPress={onGoToCounter}
                  >
                    <AppText variant="button" style={[styles.buttonText, { color: themeColors.text }]}>
                      Go to Mark
                    </AppText>
                  </TouchableOpacity>
                )}
                {!showGoToButton && (
                  <TouchableOpacity
                    style={[styles.button, styles.primaryButton, { backgroundColor: themeColors.accent.primary }]}
                    onPress={onClose}
                  >
                    <AppText variant="button" style={[styles.buttonText, { color: themeColors.text }]}>
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

