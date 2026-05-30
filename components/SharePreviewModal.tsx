import React, { useState, useCallback } from 'react';
import {
  Modal,
  View,
  Text,
  Image,
  ActivityIndicator,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
} from 'react-native';
import * as Sharing from 'expo-sharing';
import * as MediaLibrary from 'expo-media-library';
import * as Haptics from 'expo-haptics';
import { colors } from '../theme/colors';
import { spacing, fontSize, fontWeight, borderRadius } from '../theme/tokens';
import { useEffectiveTheme } from '../state/uiSlice';

export interface SharePreviewModalProps {
  visible: boolean;
  imageUri: string | null;
  goalTitle: string;
  onClose: () => void;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const PREVIEW_WIDTH = SCREEN_WIDTH - spacing.xl * 2;
// 9:16 aspect ratio (portrait share card)
const PREVIEW_HEIGHT = (PREVIEW_WIDTH * 16) / 9;

export const SharePreviewModal: React.FC<SharePreviewModalProps> = ({
  visible,
  imageUri,
  goalTitle,
  onClose,
}) => {
  const theme = useEffectiveTheme();
  const c = colors[theme];

  const [saveState, setSaveState] = useState<'idle' | 'saved' | 'error'>('idle');

  const handleShare = useCallback(async () => {
    if (!imageUri) return;
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {
      // haptics unavailable — ignore
    }
    try {
      await Sharing.shareAsync(imageUri, {
        mimeType: 'image/jpeg',
        dialogTitle: 'Share your goal',
      });
    } catch {
      // share dismissed or unavailable — ignore
    }
  }, [imageUri]);

  const handleSave = useCallback(async () => {
    if (!imageUri) return;
    setSaveState('idle');
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        setSaveState('error');
        return;
      }
      await MediaLibrary.saveToLibraryAsync(imageUri);
      setSaveState('saved');
    } catch {
      setSaveState('error');
    }
  }, [imageUri]);

  const saveLabel =
    saveState === 'saved'
      ? 'Saved ✓'
      : saveState === 'error'
        ? 'Failed — try again'
        : 'Save to Photos';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.backdrop}>
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: c.surface,
              borderTopLeftRadius: borderRadius.xl,
              borderTopRightRadius: borderRadius.xl,
            },
          ]}
        >
          {/* Header row */}
          <View style={styles.header}>
            <Text style={[styles.goalTitle, { color: c.text }]} numberOfLines={1}>
              {goalTitle}
            </Text>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 12, left: 12, bottom: 12, right: 12 }}
              accessibilityLabel="Close"
              accessibilityRole="button"
            >
              <Text style={[styles.closeIcon, { color: c.textSecondary }]}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Image preview */}
          <View
            style={[
              styles.previewContainer,
              { backgroundColor: c.surfaceVariant },
            ]}
          >
            {imageUri == null ? (
              <ActivityIndicator color={c.accent.primary} size="large" />
            ) : (
              <Image
                source={{ uri: imageUri }}
                style={styles.previewImage}
                resizeMode="cover"
                accessibilityLabel={`Share card preview for ${goalTitle}`}
              />
            )}
          </View>

          {/* Primary: Share button */}
          <TouchableOpacity
            style={[
              styles.button,
              styles.primaryButton,
              { backgroundColor: c.accent.primary, opacity: imageUri == null ? 0.45 : 1 },
            ]}
            onPress={handleShare}
            disabled={imageUri == null}
            activeOpacity={0.82}
            accessibilityRole="button"
            accessibilityLabel="Share your goal"
          >
            <Text style={styles.primaryButtonText}>Share</Text>
          </TouchableOpacity>

          {/* Secondary: Save to Photos button */}
          <TouchableOpacity
            style={[
              styles.button,
              styles.secondaryButton,
              {
                borderColor: c.border,
                opacity: imageUri == null ? 0.45 : 1,
              },
            ]}
            onPress={handleSave}
            disabled={imageUri == null}
            activeOpacity={0.82}
            accessibilityRole="button"
            accessibilityLabel={saveLabel}
          >
            <Text
              style={[
                styles.secondaryButtonText,
                {
                  color:
                    saveState === 'saved'
                      ? c.success
                      : saveState === 'error'
                        ? c.error
                        : c.textSecondary,
                },
              ]}
            >
              {saveLabel}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  sheet: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing['3xl'],
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  goalTitle: {
    flex: 1,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    marginRight: spacing.md,
  },
  closeIcon: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.medium,
  },
  previewContainer: {
    width: PREVIEW_WIDTH,
    height: PREVIEW_HEIGHT,
    borderRadius: borderRadius.xl,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xl,
    alignSelf: 'center',
  },
  previewImage: {
    width: PREVIEW_WIDTH,
    height: PREVIEW_HEIGHT,
  },
  button: {
    borderRadius: borderRadius.xl,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  primaryButton: {
    // backgroundColor set inline via theme
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  secondaryButton: {
    borderWidth: 1,
    backgroundColor: 'transparent',
  },
  secondaryButtonText: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium,
  },
});
