import React from 'react';
import {
  View,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TouchableWithoutFeedback,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { spacing, borderRadius, fontSize } from '../theme/tokens';
import { useEffectiveTheme } from '../state/uiSlice';
import { AppText } from './Typography';

interface InfoModalProps {
  visible: boolean;
  title: string;
  message: string;
  onClose: () => void;
}

export const InfoModal: React.FC<InfoModalProps> = ({ visible, title, message, onClose }) => {
  const theme = useEffectiveTheme();
  const themeColors = colors[theme];

  // Debug logging
  React.useEffect(() => {
    if (visible) {
      console.log('InfoModal rendering:', { visible, title, messageLength: message?.length, hasMessage: !!message });
    }
  }, [visible, title, message]);

  // Always render the Modal component when visible is true, React Native Modal handles visibility
  // The Modal component itself handles the visibility, so we should always return it

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent={true}
    >
      <View style={styles.overlay}>
        <TouchableWithoutFeedback onPress={onClose}>
          <View style={styles.overlayTouchable} />
        </TouchableWithoutFeedback>
        <TouchableWithoutFeedback>
          <View
            style={[
              styles.modalContainer,
              { backgroundColor: themeColors.surface, borderColor: themeColors.border },
            ]}
          >
            {/* Header */}
            <View style={[styles.header, { borderBottomColor: themeColors.border }]}>
              <AppText variant="subtitle" style={[styles.title, { color: themeColors.text }]}>
                {title || 'Information'}
              </AppText>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={onClose}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close" size={24} color={themeColors.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* Content */}
            <ScrollView
              style={styles.content}
              contentContainerStyle={styles.contentContainer}
              showsVerticalScrollIndicator={false}
            >
              {message ? (
                <AppText variant="body" style={[styles.message, { color: themeColors.textSecondary }]}>
                  {message}
                </AppText>
              ) : (
                <AppText variant="body" style={[styles.message, { color: themeColors.textSecondary }]}>
                  No information available.
                </AppText>
              )}
            </ScrollView>

            {/* Footer */}
            <View style={[styles.footer, { borderTopColor: themeColors.border }]}>
              <TouchableOpacity
                style={[styles.button, { backgroundColor: themeColors.primary }]}
                onPress={onClose}
              >
                <AppText variant="button" style={[styles.buttonText, { color: themeColors.text }]}>
                  Got it
                </AppText>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableWithoutFeedback>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  overlayTouchable: {
    ...StyleSheet.absoluteFillObject,
  },
  modalContainer: {
    width: '100%',
    maxWidth: 400,
    maxHeight: '80%',
    minHeight: 200,
    borderRadius: borderRadius.card,
    borderWidth: 1,
    overflow: 'hidden',
    zIndex: 1000,
    elevation: 10, // Android shadow
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.lg,
    borderBottomWidth: 1,
  },
  title: {
    flex: 1,
    marginRight: spacing.md,
  },
  closeButton: {
    padding: spacing.xs,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: spacing.lg,
  },
  message: {
    lineHeight: 22,
  },
  footer: {
    padding: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
  },
  button: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
  },
  buttonText: {
    fontSize: fontSize.md,
    fontWeight: '600',
  },
});

